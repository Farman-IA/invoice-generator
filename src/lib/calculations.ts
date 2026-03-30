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

export function calculateTotals(items: LineItem[]): InvoiceTotals {
  const vatMap = new Map<VatRate, number>()

  let totalHT = 0

  for (const item of items) {
    const lineTotal = calculateLineTotal(item.quantity, item.unitPrice)
    totalHT += lineTotal

    const current = vatMap.get(item.vatRate) ?? 0
    vatMap.set(item.vatRate, current + lineTotal)
  }

  totalHT = Math.round(totalHT * 100) / 100

  const vatBreakdown: VatBreakdownEntry[] = []
  let totalVAT = 0

  for (const [rate, baseHT] of vatMap.entries()) {
    const roundedBase = Math.round(baseHT * 100) / 100
    const vatAmount = Math.ceil(roundedBase * (rate / 100) * 100) / 100
    totalVAT += vatAmount
    vatBreakdown.push({ rate, baseHT: roundedBase, vatAmount })
  }

  vatBreakdown.sort((a, b) => a.rate - b.rate)
  totalVAT = Math.round(totalVAT * 100) / 100
  const totalTTC = Math.round((totalHT + totalVAT) * 100) / 100

  return { totalHT, vatBreakdown, totalTTC, totalVAT }
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
