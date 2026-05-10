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
 * Calcule les totaux d'une facture.
 *
 * Deux modes selon les données :
 * - Si la ligne a `unitPriceTTC` → mode TTC : on part du TTC, la TVA = TTC − HT (méthode française standard)
 * - Sinon → mode HT classique : TVA = HT × taux
 *
 * Cela garantit que le total TTC est toujours exact quand les prix sont saisis en TTC.
 */
export function calculateTotals(
  items: LineItem[],
  discountOptions: DiscountOptions = {}
): InvoiceTotals {
  const vatMap = new Map<VatRate, { baseHT: number; totalTTC: number }>()

  let totalHT = 0
  let totalTTC = 0

  for (const item of items) {
    if (item.unitPriceTTC != null && item.unitPriceTTC > 0) {
      // Mode TTC : le prix TTC est la référence, on en déduit HT et TVA
      const lineTTC = Math.round(item.quantity * item.unitPriceTTC * 100) / 100
      const lineHT = Math.round(lineTTC / (1 + item.vatRate / 100) * 100) / 100

      totalHT += lineHT
      totalTTC += lineTTC

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
      totalTTC += lineTTCFromHT

      const current = vatMap.get(item.vatRate) ?? { baseHT: 0, totalTTC: 0 }
      vatMap.set(item.vatRate, {
        baseHT: current.baseHT + lineTotal,
        totalTTC: current.totalTTC + lineTTCFromHT,
      })
    }
  }

  totalHT = Math.round(totalHT * 100) / 100

  // Calcul du montant de la remise (clampé pour rester dans des bornes saines)
  const rawDiscount = discountOptions.discount ?? 0
  const discountType = discountOptions.discountType ?? 'amount'
  let discountAmount = 0
  if (totalHT > 0 && rawDiscount > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, rawDiscount))
      discountAmount = (totalHT * pct) / 100
    } else {
      discountAmount = Math.min(totalHT, Math.max(0, rawDiscount))
    }
    discountAmount = Math.round(discountAmount * 100) / 100
  }

  // Ratio de remise pour répartir proportionnellement sur chaque base TVA
  const discountRatio = totalHT > 0 ? discountAmount / totalHT : 0
  const totalHTAfterDiscount = Math.round((totalHT - discountAmount) * 100) / 100

  const vatBreakdown: VatBreakdownEntry[] = []
  let totalVAT = 0

  for (const [rate, group] of vatMap.entries()) {
    // Base HT remisée : on applique le même ratio à chaque base TVA pour
    // garantir que la remise soit "neutre" entre les différents taux
    const discountedBase = group.baseHT * (1 - discountRatio)
    const roundedBase = Math.round(discountedBase * 100) / 100

    let vatAmount: number
    if (group.totalTTC > 0 && discountRatio === 0) {
      // Mode TTC sans remise : TVA = TTC − HT (garanti exact, méthode française)
      const roundedTTC = Math.round(group.totalTTC * 100) / 100
      vatAmount = Math.round((roundedTTC - roundedBase) * 100) / 100
    } else {
      // Mode HT (ou mode TTC + remise) : on recalcule la TVA sur la base remisée
      vatAmount = Math.round(roundedBase * (rate / 100) * 100) / 100
    }

    totalVAT += vatAmount
    vatBreakdown.push({ rate, baseHT: roundedBase, vatAmount })
  }

  vatBreakdown.sort((a, b) => a.rate - b.rate)
  totalVAT = Math.round(totalVAT * 100) / 100
  totalTTC = Math.round((totalHTAfterDiscount + totalVAT) * 100) / 100

  return { totalHT, discountAmount, totalHTAfterDiscount, vatBreakdown, totalTTC, totalVAT }
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
