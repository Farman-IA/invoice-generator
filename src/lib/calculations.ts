import type { LineItem, VatRate, DiscountType } from '@/types/invoice'
import { round2 } from '@/lib/money'

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice)
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

// État interne par taux de TVA pendant l'agrégation.
// On garde une trace de :
//  - baseHT : somme des HT ligne par ligne (arrondis)
//  - totalTTC : somme des TTC ligne par ligne (utilisée seulement si hasTTCInput)
//  - hasTTCInput : true dès qu'AU MOINS une ligne du groupe a été saisie en TTC
//    → c'est la condition correcte pour basculer en méthode "VAT = TTC − HT"
//    plutôt que `totalTTC > 0` qui est toujours vrai dès qu'il y a une ligne.
interface VatGroup {
  baseHT: number
  totalTTC: number
  hasTTCInput: boolean
}

/**
 * Calcule les totaux d'une facture / d'un devis (HT, TVA, TTC) avec remise globale optionnelle.
 *
 * Deux modes de calcul de la TVA par groupe de taux :
 *
 * 1. Groupe en mode HT pur (aucune ligne du groupe n'a `unitPriceTTC`)
 *    → TVA = base HT arrondie × taux
 *    → TTC = HT + TVA
 *    → Garantit que `total ligne HT × (1 + taux) ≃ total ligne TTC` au centime près
 *
 * 2. Groupe avec au moins une ligne TTC saisie
 *    → TVA = somme(TTC arrondis ligne par ligne) − somme(HT arrondis ligne par ligne)
 *    → Conserve l'invariant : le TTC saisi par l'utilisateur ne bouge pas
 *
 * Remise globale (`discount > 0`) :
 *    - Appliquée sur le total HT (standard comptable français)
 *    - Répartie proportionnellement sur chaque base TVA (multi-taux juste)
 *    - Réconciliation finale : la dernière entrée du breakdown encaisse le delta
 *      d'arrondi pour garantir Σ baseHT == totalHTAfterDiscount.
 *
 * Garanties de retour :
 * - `totalHT` : avant remise (utile pour afficher "Total HT" puis "Remise")
 * - `totalHTAfterDiscount` : exactement égal à la somme des `vatBreakdown[i].baseHT`
 * - `totalTTC` : exactement égal à `totalHTAfterDiscount + totalVAT`
 * - `discountAmount` : 0 si pas de remise, sinon montant en € après clamp (0..totalHT)
 *
 * Sécurité d'entrée :
 * - `discount` non-fini (NaN, Infinity) ou négatif est ignoré
 * - `discount > 0` sans `discountType` déclenche un `console.warn`
 */
// Validation défensive d'un LineItem : rejette NaN/Infinity/négatifs sur les
// champs numériques, en gardant la valeur dans des bornes saines.
// Préfère le silence à l'exception car les totaux sont recalculés à chaque
// rendu (un throw casserait l'app sur une donnée corrompue).
function sanitizeLineItem(item: LineItem): {
  quantity: number
  unitPrice: number
  unitPriceTTC: number | undefined
  vatRate: number
} {
  const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0
  const unitPrice = Number.isFinite(item.unitPrice) && item.unitPrice >= 0 ? item.unitPrice : 0
  const unitPriceTTC = Number.isFinite(item.unitPriceTTC) && (item.unitPriceTTC ?? 0) > 0
    ? item.unitPriceTTC
    : undefined
  // Taux de TVA : positif ou nul, et > -100 (sinon division par zéro plus loin)
  const vatRate = Number.isFinite(item.vatRate) && item.vatRate >= 0 ? item.vatRate : 0
  return { quantity, unitPrice, unitPriceTTC, vatRate }
}

export function calculateTotals(
  items: LineItem[],
  discountOptions: DiscountOptions = {}
): InvoiceTotals {
  // Pass 1 : repérer les taux qui contiennent AU MOINS une ligne saisie en TTC.
  // Nécessaire pour décider, en Pass 2, si une ligne HT sur ce taux doit aussi
  // contribuer à totalTTC. Sans cette pré-analyse, l'ordre des lignes change
  // le résultat (une ligne HT avant une ligne TTC sur le même taux serait omise).
  const ttcInputRates = new Set<VatRate>()
  for (const raw of items) {
    const safe = sanitizeLineItem(raw)
    if (safe.unitPriceTTC != null && safe.quantity > 0) ttcInputRates.add(safe.vatRate as VatRate)
  }

  const vatMap = new Map<VatRate, VatGroup>()
  let totalHT = 0

  for (const raw of items) {
    const item = sanitizeLineItem(raw)
    if (item.quantity === 0) continue

    const isTTCInput = item.unitPriceTTC != null
    const groupHasTTC = ttcInputRates.has((item.vatRate as VatRate))
    const current = vatMap.get((item.vatRate as VatRate)) ?? { baseHT: 0, totalTTC: 0, hasTTCInput: groupHasTTC }

    if (isTTCInput) {
      // Mode TTC : le prix TTC est la référence, on en déduit HT et TVA
      const lineTTC = round2(item.quantity * item.unitPriceTTC!)
      const lineHT = round2(lineTTC / (1 + item.vatRate / 100))
      totalHT += lineHT
      vatMap.set((item.vatRate as VatRate), {
        baseHT: current.baseHT + lineHT,
        totalTTC: current.totalTTC + lineTTC,
        hasTTCInput: true,
      })
    } else {
      // Mode HT classique
      const lineHT = round2(item.quantity * item.unitPrice)
      totalHT += lineHT
      // Si le groupe contient AUSSI au moins une ligne TTC saisie, on alimente
      // totalTTC avec le TTC dérivé de cette ligne HT : sans ça, la TVA finale
      // du groupe (calculée plus bas comme `roundedTTC − roundedBase`) sous-
      // estime la TVA. Cas réel : 1 ligne TTC + 1 ligne HT sur le même taux 20%.
      const lineTTCContribution = groupHasTTC
        ? round2(lineHT * (1 + item.vatRate / 100))
        : 0
      vatMap.set((item.vatRate as VatRate), {
        baseHT: current.baseHT + lineHT,
        totalTTC: current.totalTTC + lineTTCContribution,
        hasTTCInput: groupHasTTC,
      })
    }
  }

  totalHT = round2(totalHT)

  // Sanitisation de la remise : on rejette NaN, Infinity, valeurs négatives.
  // Sans cette garde, l'IA ou un brouillon corrompu peut injecter NaN et faire
  // passer toute la facture à "NaN €".
  const rawDiscount = discountOptions.discount
  const safeDiscount = Number.isFinite(rawDiscount) && (rawDiscount as number) > 0
    ? (rawDiscount as number)
    : 0

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
    discountAmount = round2(discountAmount)
  }

  // Ratio de remise pour répartir proportionnellement sur chaque base TVA
  const discountRatio = totalHT > 0 ? discountAmount / totalHT : 0
  const totalHTAfterDiscount = round2(totalHT - discountAmount)

  // Calcul de chaque entrée TVA après remise
  const vatBreakdown: VatBreakdownEntry[] = []
  for (const [rate, group] of vatMap.entries()) {
    const discountedBase = group.baseHT * (1 - discountRatio)
    const roundedBase = round2(discountedBase)

    let vatAmount: number
    if (group.hasTTCInput) {
      // Mode TTC (avec ou sans remise) : on conserve l'invariant TTC = HT + TVA
      // par groupe en partant du TTC saisi (réduit du ratio de remise).
      const discountedTTC = group.totalTTC * (1 - discountRatio)
      const roundedTTC = round2(discountedTTC)
      vatAmount = round2(roundedTTC - roundedBase)
    } else {
      // Mode HT pur : TVA = base remisée × taux (arrondi commercial standard).
      // C'est la méthode attendue par l'utilisateur saisissant en HT — et
      // celle qui garantit que "3 × prix HT affiché" correspond visuellement
      // au total ligne.
      vatAmount = round2(roundedBase * (rate / 100))
    }

    vatBreakdown.push({ rate, baseHT: roundedBase, vatAmount })
  }

  vatBreakdown.sort((a, b) => a.rate - b.rate)

  // Réconciliation des arrondis pour garantir Σ baseHT == totalHTAfterDiscount.
  // Sans cette étape, sur des combinaisons multi-taux + remise, la somme peut
  // différer d'un centime → un import comptable (Pennylane, Sage) refuse alors
  // la facture. On ajuste l'entrée du taux le plus élevé et on recalcule la TVA.
  if (vatBreakdown.length > 0) {
    const sumBase = round2(vatBreakdown.reduce((s, e) => s + e.baseHT, 0))
    const baseDelta = round2(totalHTAfterDiscount - sumBase)
    if (baseDelta !== 0) {
      const target = vatBreakdown[vatBreakdown.length - 1]
      target.baseHT = round2(target.baseHT + baseDelta)
      const groupForRate = vatMap.get(target.rate)
      if (groupForRate?.hasTTCInput) {
        const discountedTTC = groupForRate.totalTTC * (1 - discountRatio)
        const roundedTTC = round2(discountedTTC)
        target.vatAmount = round2(roundedTTC - target.baseHT)
      } else {
        target.vatAmount = round2(target.baseHT * (target.rate / 100))
      }
    }
  }

  const totalVAT = round2(vatBreakdown.reduce((s, e) => s + e.vatAmount, 0))
  const totalTTC = round2(totalHTAfterDiscount + totalVAT)

  return { totalHT, discountAmount, totalHTAfterDiscount, vatBreakdown, totalVAT, totalTTC }
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
