import type { LineItem, VatRate, DiscountType } from '@/types/invoice'

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

export interface VatBreakdownEntry {
  rate: VatRate
  baseHT: number
  vatAmount: number
}

export interface InvoiceTotals {
  // Total HT brut, avant remise
  totalHT: number
  // Montant absolu de la remise en euros (0 si pas de remise)
  discountAmount: number
  // Total HT effectivement facturé après remise
  totalHTAfterDiscount: number
  vatBreakdown: VatBreakdownEntry[]
  totalVAT: number
  totalTTC: number
}

// Options de remise globale appliquée sur le HT
interface DiscountOptions {
  discount?: number
  discountType?: DiscountType
}

/**
 * Calcule les totaux d'une facture / d'un devis (HT, TVA, TTC) avec remise globale optionnelle.
 *
 * Trois modes selon les données saisies et la présence d'une remise :
 *
 * 1. Mode HT pur (pas de `unitPriceTTC`, pas de remise)
 *    - TVA = base HT × taux
 *
 * 2. Mode TTC sans remise (au moins une ligne a `unitPriceTTC`)
 *    - HT déduit = TTC ÷ (1 + taux)
 *    - TVA = TTC − HT (méthode française standard, garantit que la somme HT+TVA = TTC saisi)
 *
 * 3. Mode HT ou TTC + remise globale (`discount > 0`)
 *    - La remise est appliquée sur le total HT (standard comptable français)
 *    - Elle est répartie proportionnellement sur chaque base TVA pour rester juste en multi-taux
 *    - En mode TTC + remise : on conserve l'invariant `TTC remisé = HT remisé + TVA` par groupe,
 *      donc le total TTC bouge exactement de la valeur de la remise (pas de glissement caché)
 *    - Réconciliation finale des arrondis : la dernière entrée du breakdown encaisse le delta
 *      pour garantir `Σ baseHT == totalHTAfterDiscount` et `totalHTAfterDiscount + Σ vatAmount == totalTTC`.
 *
 * Garanties de retour :
 * - `totalHT` : avant remise (utile pour afficher "Total HT" puis "Remise" en dessous)
 * - `totalHTAfterDiscount` : exactement égal à la somme des `vatBreakdown[i].baseHT`
 * - `totalTTC` : exactement égal à `totalHTAfterDiscount + totalVAT`
 * - `discountAmount` : 0 si pas de remise, sinon montant en € après clamp (0..totalHT)
 *
 * Sécurité d'entrée :
 * - `discount` non-fini (NaN, Infinity) ou négatif est ignoré (traité comme 0)
 * - `discount > 0` sans `discountType` déclenche un `console.warn` (donnée ambiguë)
 */
export function calculateTotals(
  items: LineItem[],
  discountOptions: DiscountOptions = {}
): InvoiceTotals {
  const vatMap = new Map<VatRate, { baseHT: number; totalTTC: number }>()

  let totalHT = 0

  for (const item of items) {
    if (item.unitPriceTTC != null && item.unitPriceTTC > 0) {
      // Mode TTC : le prix TTC est la référence, on en déduit HT et TVA
      const lineTTC = Math.round(item.quantity * item.unitPriceTTC * 100) / 100
      const lineHT = Math.round(lineTTC / (1 + item.vatRate / 100) * 100) / 100

      totalHT += lineHT

      const current = vatMap.get(item.vatRate) ?? { baseHT: 0, totalTTC: 0 }
      vatMap.set(item.vatRate, {
        baseHT: current.baseHT + lineHT,
        totalTTC: current.totalTTC + lineTTC,
      })
    } else {
      // Mode HT classique
      const lineTotal = calculateLineTotal(item.quantity, item.unitPrice)
      // Calculer aussi le TTC equivalent pour mode mixte
      const lineTTCFromHT = Math.round(lineTotal * (1 + item.vatRate / 100) * 100) / 100

      totalHT += lineTotal

      const current = vatMap.get(item.vatRate) ?? { baseHT: 0, totalTTC: 0 }
      vatMap.set(item.vatRate, {
        baseHT: current.baseHT + lineTotal,
        totalTTC: current.totalTTC + lineTTCFromHT,
      })
    }
  }

  totalHT = Math.round(totalHT * 100) / 100

  // Sanitisation de la remise : on rejette NaN, Infinity, valeurs négatives
  // Important : sans cette garde, l'IA ou un brouillon corrompu peut injecter NaN
  // et faire passer toute la facture à "NaN €"
  const rawDiscount = discountOptions.discount
  const safeDiscount = Number.isFinite(rawDiscount) && (rawDiscount as number) > 0
    ? (rawDiscount as number)
    : 0

  // Avertir si le type est ambigu : data corrompue ou ancien brouillon avant le commit remise
  if (safeDiscount > 0 && discountOptions.discountType === undefined) {
    console.warn(
      '[calculateTotals] discount > 0 sans discountType — fallback sur "amount" (€). ' +
      'Corriger la source pour lever toute ambiguïté.'
    )
  }
  const discountType = discountOptions.discountType ?? 'amount'

  // Calcul du montant de la remise (clampé pour rester dans des bornes saines)
  let discountAmount = 0
  if (totalHT > 0 && safeDiscount > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, safeDiscount)
      discountAmount = (totalHT * pct) / 100
    } else {
      discountAmount = Math.min(totalHT, safeDiscount)
    }
    discountAmount = Math.round(discountAmount * 100) / 100
  }

  // Ratio de remise pour répartir proportionnellement sur chaque base TVA
  const discountRatio = totalHT > 0 ? discountAmount / totalHT : 0
  const totalHTAfterDiscount = Math.round((totalHT - discountAmount) * 100) / 100

  // Calcul de chaque entrée TVA après remise
  const vatBreakdown: VatBreakdownEntry[] = []
  for (const [rate, group] of vatMap.entries()) {
    const discountedBase = group.baseHT * (1 - discountRatio)
    const roundedBase = Math.round(discountedBase * 100) / 100

    let vatAmount: number
    if (group.totalTTC > 0) {
      // Mode TTC (avec ou sans remise) : on conserve l'invariant TTC = HT + TVA
      // par groupe en partant du TTC saisi (réduit du ratio de remise si applicable).
      // Avant ce fix : la remise faisait basculer en "VAT = base × taux", ce qui
      // décalait le TTC final de l'écart d'arrondi entre HT × (1+taux) et le TTC
      // saisi par l'utilisateur (ex : 100€ TTC saisi → HT déduit 83.33€, recalcul
      // donnait 99.996€ → 100€ devenait 99.99€ après remise au lieu de tomber juste).
      const discountedTTC = group.totalTTC * (1 - discountRatio)
      const roundedTTC = Math.round(discountedTTC * 100) / 100
      vatAmount = Math.round((roundedTTC - roundedBase) * 100) / 100
    } else {
      // Mode HT pur : TVA = base remisée × taux
      vatAmount = Math.round(roundedBase * (rate / 100) * 100) / 100
    }

    vatBreakdown.push({ rate, baseHT: roundedBase, vatAmount })
  }

  vatBreakdown.sort((a, b) => a.rate - b.rate)

  // Réconciliation des arrondis pour garantir Σ baseHT == totalHTAfterDiscount.
  // Sans cette étape, sur des combinaisons multi-taux, la somme peut différer
  // d'un centime (ex: 3 lignes à 33.33€ HT à 3 taux + remise 50% → écart de 1¢).
  // Un import comptable (Pennylane, Sage) refuse alors la facture.
  // On ajuste l'entrée du taux le plus élevé (souvent la plus grosse, donc la
  // moins visible) et on recalcule la TVA correspondante.
  if (vatBreakdown.length > 0) {
    const sumBase = vatBreakdown.reduce((s, e) => s + e.baseHT, 0)
    const baseDelta = Math.round((totalHTAfterDiscount - sumBase) * 100) / 100
    if (baseDelta !== 0) {
      const target = vatBreakdown[vatBreakdown.length - 1]
      target.baseHT = Math.round((target.baseHT + baseDelta) * 100) / 100
      // Recalcul de la TVA cohérent avec la base ajustée
      const groupForRate = vatMap.get(target.rate)
      if (groupForRate && groupForRate.totalTTC > 0) {
        // Mode TTC : VAT = TTC remisé arrondi − nouvelle base
        const discountedTTC = groupForRate.totalTTC * (1 - discountRatio)
        const roundedTTC = Math.round(discountedTTC * 100) / 100
        target.vatAmount = Math.round((roundedTTC - target.baseHT) * 100) / 100
      } else {
        // Mode HT pur : VAT = nouvelle base × taux
        target.vatAmount = Math.round(target.baseHT * (target.rate / 100) * 100) / 100
      }
    }
  }

  const totalVAT = Math.round(
    vatBreakdown.reduce((s, e) => s + e.vatAmount, 0) * 100
  ) / 100
  const totalTTC = Math.round((totalHTAfterDiscount + totalVAT) * 100) / 100

  return { totalHT, discountAmount, totalHTAfterDiscount, vatBreakdown, totalVAT, totalTTC }
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
