import type { ParsedInvoiceData, PriceMode, VatRate } from '@/types/invoice'

const VALID_VAT_RATES: VatRate[] = [0, 2.1, 5.5, 10, 20]

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function sanitizeVatRate(rate: number): VatRate {
  if (VALID_VAT_RATES.includes(rate as VatRate)) return rate as VatRate
  return 20
}

function convertTtcToHt(priceTtc: number, vatRate: VatRate): number {
  // Pas d'arrondi — garder la precision pour que qty × prix HT × (1+TVA) = TTC exact
  return priceTtc / (1 + vatRate / 100)
}

export function validateParsedData(raw: Record<string, unknown>, priceMode: PriceMode): ParsedInvoiceData | null {
  const hasClient = raw.clientName && String(raw.clientName).trim() !== ''
  const hasItems = Array.isArray(raw.items) && raw.items.length > 0
  const hasDeposit = typeof raw.deposit === 'number' && raw.deposit > 0

  if (!hasClient && !hasItems && !hasDeposit) {
    return null
  }

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item: Record<string, unknown>) =>
          item && typeof item.description === 'string' && item.description.trim() !== ''
        )
        .map((item: Record<string, unknown>) => {
          const vatRate = sanitizeVatRate(Number(item.vatRate))
          const rawPrice = Math.max(0, Number(item.unitPrice) || 0)
          const unitPrice = priceMode === 'ttc' ? convertTtcToHt(rawPrice, vatRate) : rawPrice
          return {
            description: capitalize(String(item.description)),
            quantity: Math.max(1, Number(item.quantity) || 1),
            unitPrice,
            ...(priceMode === 'ttc' ? { unitPriceTTC: rawPrice } : {}),
            vatRate,
          }
        })
    : []

  const depositValue = Number(raw.deposit) || 0

  return {
    clientName: hasClient ? String(raw.clientName) : '',
    clientDepartment: raw.clientDepartment ? String(raw.clientDepartment) : undefined,
    clientAddress: raw.clientAddress ? String(raw.clientAddress) : undefined,
    clientAddressLine2: raw.clientAddressLine2 ? String(raw.clientAddressLine2) : undefined,
    clientPostalCode: raw.clientPostalCode ? String(raw.clientPostalCode) : undefined,
    clientCity: raw.clientCity ? String(raw.clientCity).toUpperCase() : undefined,
    contactName: raw.contactName ? String(raw.contactName) : undefined,
    purchaseOrder: raw.purchaseOrder ? String(raw.purchaseOrder) : undefined,
    codeService: raw.codeService ? String(raw.codeService) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    ...(depositValue > 0 ? { deposit: depositValue } : {}),
    items,
  }
}
