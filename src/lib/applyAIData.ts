// Helpers de transformation des donnees retournees par l'IA en mises a jour
// pour la facture courante. Extrait de App.tsx pour rester testable et lisible.

import { round2 } from '@/lib/money'
import type {
  ClientInfo,
  ClientRecord,
  InvoiceData,
  LineItem,
  ParsedInvoiceData,
  PriceMode,
} from '@/types/invoice'

// Construit la mise a jour client a appliquer.
// - Si un client du carnet correspond au nom : enrichit le carnet avec les donnees non vides de l'IA.
// - Sinon en mode "nouvelle facture" : remplit tous les champs (vide pour ceux non fournis).
// - Sinon en mode "modification" : ne touche QUE les champs fournis par l'IA.
export function mergeClientFromAI(
  data: ParsedInvoiceData,
  isNewInvoice: boolean,
  findByName: (name: string) => ClientRecord[],
): Partial<ClientInfo> | null {
  const hasClient = !!(data.clientName && data.clientName.trim() !== '')

  if (!hasClient) {
    // Pas de nouveau client mais l'IA a fourni un code service → l'appliquer au client courant
    if (data.codeService) return { codeService: data.codeService }
    return null
  }

  const matches = findByName(data.clientName)
  if (matches.length > 0) {
    const match = matches[0]
    return {
      companyName: match.companyName,
      department: data.clientDepartment || match.department,
      contactName: data.contactName || match.contactName,
      address: data.clientAddress || match.address,
      addressLine2: data.clientAddressLine2 || match.addressLine2,
      postalCode: data.clientPostalCode || match.postalCode,
      city: data.clientCity || match.city,
      siren: match.siren,
      tvaNumber: match.tvaNumber,
      codeService: data.codeService || match.codeService,
    }
  }

  if (isNewInvoice) {
    return {
      companyName: data.clientName,
      department: data.clientDepartment ?? '',
      contactName: data.contactName ?? '',
      address: data.clientAddress ?? '',
      addressLine2: data.clientAddressLine2 ?? '',
      postalCode: data.clientPostalCode ?? '',
      city: data.clientCity ?? '',
      siren: '',
      tvaNumber: '',
      codeService: data.codeService ?? '',
    }
  }

  // Modification : ne toucher QUE les champs fournis par l'IA
  const update: Partial<ClientInfo> = { companyName: data.clientName }
  if (data.clientDepartment) update.department = data.clientDepartment
  if (data.contactName) update.contactName = data.contactName
  if (data.clientAddress) update.address = data.clientAddress
  if (data.clientAddressLine2) update.addressLine2 = data.clientAddressLine2
  if (data.clientPostalCode) update.postalCode = data.clientPostalCode
  if (data.clientCity) update.city = data.clientCity
  if (data.codeService) update.codeService = data.codeService
  return update
}

// Construit la liste d'articles normalisee selon le mode de prix global (HT/TTC).
export function buildItemsFromAI(
  data: ParsedInvoiceData,
  priceMode: PriceMode,
): LineItem[] {
  return data.items.map((item) => {
    const base = {
      id: crypto.randomUUID(),
      description: item.description,
      unit: 'unité',
      quantity: item.quantity,
      // round2 défensif : aiValidation arrondit déjà, mais on garantit l'invariant
      // "tout prix stocké en LineItem est à 2 décimales exactes".
      unitPrice: round2(item.unitPrice),
      vatRate: item.vatRate,
    }
    if (priceMode === 'ttc') {
      const unitPriceTTC =
        item.unitPriceTTC != null
          ? round2(item.unitPriceTTC)
          : round2(item.unitPrice * (1 + item.vatRate / 100))
      return { ...base, unitPriceTTC }
    }
    return base
  })
}

// Construit la mise a jour metadonnees (bon de commande, notes, acompte)
// — uniquement pour les champs effectivement fournis par l'IA.
export function buildMetaUpdateFromAI(
  data: ParsedInvoiceData,
): Partial<InvoiceData> {
  const update: Partial<InvoiceData> = {}
  if (data.purchaseOrder) update.purchaseOrder = data.purchaseOrder
  if (data.notes) update.notes = data.notes
  if (data.deposit != null && data.deposit > 0) update.deposit = data.deposit
  return update
}
