import type { ParsedInvoiceData, PriceMode, VatRate } from '@/types/invoice'
import { round2 } from '@/lib/money'
import { AMOUNT_KINDS, type AmountKind } from '@/lib/aiSchemas'

const VALID_VAT_RATES: VatRate[] = [0, 2.1, 5.5, 10, 20]

// Libellés de restauration : si l'IA renvoie un taux invalide sur une ligne
// de repas, le filet de sécurité doit être 10 % (restauration sur place),
// pas 20 % — l'utilisateur principal est restaurateur, et un déjeuner taxé
// à 20 % fausse silencieusement tous les montants de la facture.
const RESTAURATION_PATTERN = /repas|d[ée]jeuner|d[îi]ner|menu|buffet|brunch|restauration/i

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function sanitizeVatRate(rate: number, description: string): VatRate {
  if (VALID_VAT_RATES.includes(rate as VatRate)) return rate as VatRate
  return RESTAURATION_PATTERN.test(description) ? 10 : 20
}

// La nature du montant est garantie par le schéma (enum), mais on revalide :
// une valeur inattendue retombe sur le défaut du mode global.
function sanitizeAmountKind(raw: unknown, priceMode: PriceMode): AmountKind {
  if (typeof raw === 'string' && (AMOUNT_KINDS as readonly string[]).includes(raw)) {
    return raw as AmountKind
  }
  return priceMode === 'ttc' ? 'unit_ttc' : 'unit_ht'
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
          const description = capitalize(String(item.description))
          const quantity = Math.max(1, Number(item.quantity) || 1)
          const vatRate = sanitizeVatRate(Number(item.vatRate), description)
          const amountKind = sanitizeAmountKind(item.amountKind, priceMode)
          // Rétro-compat : un vieux format peut encore arriver avec "unitPrice"
          // (ancien schéma) — on le lit comme un montant au défaut du mode.
          const rawAmount = Math.max(0, Number(item.amount ?? item.unitPrice) || 0)

          // 1) Ramener au prix UNITAIRE — c'est le code qui divise, jamais l'IA.
          //    NB : un total qui ne tombe pas juste au centime près par unité
          //    (ex: 100 € TTC pour 3) garde une dérive d'un centime sur le
          //    total recalculé : fait mathématique, documenté dans la fiche
          //    CAP COMPETENCES (solution métier = ligne consolidée qty 1).
          const unitAmount = amountKind.startsWith('total_')
            ? round2(rawAmount / quantity)
            : round2(rawAmount)

          // 2) Conversion fiscale. Un montant énoncé TTC est SACRÉ : on le
          //    conserve dans unitPriceTTC quel que soit le mode global, pour
          //    que calculateTotals garantisse total TTC = somme des TTC saisis
          //    (13 repas × 30 € TTC = 390,00 € pile, pas 389,96).
          if (amountKind.endsWith('_ttc')) {
            return {
              description,
              quantity,
              unitPrice: convertTtcToHt(unitAmount, vatRate),
              unitPriceTTC: unitAmount,
              vatRate,
            }
          }
          return { description, quantity, unitPrice: unitAmount, vatRate }
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
