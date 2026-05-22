import type { ParsedInvoiceData, PriceMode, VatRate } from '@/types/invoice'
import { round2 } from '@/lib/money'

const VALID_VAT_RATES: VatRate[] = [0, 2.1, 5.5, 10, 20]

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function sanitizeVatRate(rate: number): VatRate {
  if (VALID_VAT_RATES.includes(rate as VatRate)) return rate as VatRate
  return 20
}

// SIRET/SIREN : on ne garde QUE les chiffres, pour normaliser toutes les façons
// de dicter le numéro ("130 015 506 00013", "130.015.506.00013", "130-015-...").
// C'est ce que Chorus Pro attend (14 chiffres pour le SIRET, 9 pour le SIREN).
// Renvoie undefined si vide.
function sanitizeIdNumber(raw: unknown): string | undefined {
  if (!raw) return undefined
  const digits = String(raw).replace(/\D/g, '')
  return digits !== '' ? digits : undefined
}

// N° TVA intracommunautaire : contient des lettres (ex: "FR47130015506"), donc
// on ne peut pas filtrer les chiffres. On retire juste les espaces et on met en
// majuscules. Renvoie undefined si vide (même contrat que sanitizeIdNumber).
function sanitizeVatNumber(raw: unknown): string | undefined {
  if (!raw) return undefined
  const cleaned = String(raw).replace(/\s/g, '').toUpperCase()
  return cleaned !== '' ? cleaned : undefined
}

function convertTtcToHt(priceTtc: number, vatRate: VatRate): number {
  // Arrondi à 2 décimales : le HT est une donnée monétaire affichée, elle DOIT
  // être au centime près pour rester cohérente avec l'UI (sinon "29,52" affiché
  // mais 29,5181818 utilisé en calcul → bug Université de Lorraine, mai 2026).
  // Le TTC saisi est toujours conservé séparément dans unitPriceTTC pour garantir
  // que la facture finale soit exacte au TTC d'origine.
  // Garde : vatRate négatif ou -100 produirait Infinity → retourne priceTtc tel quel.
  if (vatRate < 0) return round2(priceTtc)
  return round2(priceTtc / (1 + vatRate / 100))
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
    clientSiret: sanitizeIdNumber(raw.clientSiret),
    clientSiren: sanitizeIdNumber(raw.clientSiren),
    clientTvaNumber: sanitizeVatNumber(raw.clientTvaNumber),
    contactName: raw.contactName ? String(raw.contactName) : undefined,
    purchaseOrder: raw.purchaseOrder ? String(raw.purchaseOrder) : undefined,
    codeService: raw.codeService ? String(raw.codeService) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    ...(depositValue > 0 ? { deposit: depositValue } : {}),
    items,
  }
}
