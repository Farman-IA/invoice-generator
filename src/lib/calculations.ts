import type { LineItem, VatRate } from '@/types/invoice'

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

export interface VatBreakdownEntry {
  rate: VatRate
  baseHT: number
  vatAmount: number
}

export interface InvoiceTotals {
  totalHT: number
  vatBreakdown: VatBreakdownEntry[]
  totalVAT: number
  totalTTC: number
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
export function calculateTotals(items: LineItem[]): InvoiceTotals {
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

  const vatBreakdown: VatBreakdownEntry[] = []
  let totalVAT = 0

  for (const [rate, group] of vatMap.entries()) {
    const roundedBase = Math.round(group.baseHT * 100) / 100

    let vatAmount: number
    if (group.totalTTC > 0) {
      // Mode TTC : TVA = TTC − HT (garanti exact)
      const roundedTTC = Math.round(group.totalTTC * 100) / 100
      vatAmount = Math.round((roundedTTC - roundedBase) * 100) / 100
    } else {
      // Mode HT : TVA = HT × taux
      vatAmount = Math.round(roundedBase * (rate / 100) * 100) / 100
    }

    totalVAT += vatAmount
    vatBreakdown.push({ rate, baseHT: roundedBase, vatAmount })
  }

  vatBreakdown.sort((a, b) => a.rate - b.rate)
  totalVAT = Math.round(totalVAT * 100) / 100
  totalTTC = Math.round((totalHT + totalVAT) * 100) / 100

  return { totalHT, vatBreakdown, totalTTC, totalVAT }
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
