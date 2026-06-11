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
    // On reprend les infos du carnet (SIRET, SIREN, TVA, tél, email, APE...) pour
    // ne plus jamais en "oublier" : avant ce fix, la liste des champs recopiés
    // était écrite à la main et le SIRET en était absent → il disparaissait de la
    // facture alors qu'il était enregistré au carnet.
    //
    // IMPORTANT : on ne recopie QUE les champs NON VIDES du carnet. Sinon un champ
    // vide du carnet (ex: téléphone non renseigné) écraserait une valeur que
    // l'utilisateur a tapée à la main sur la facture en cours.
    const merged: Partial<ClientInfo> = { companyName: match.companyName }
    for (const [key, value] of Object.entries(match)) {
      if (key === 'id') continue
      if (typeof value === 'string' && value.trim() !== '') {
        ;(merged as Record<string, string>)[key] = value
      }
    }
    // L'IA n'écrase ensuite un champ que si elle a fourni une valeur non vide.
    if (data.clientDepartment) merged.department = data.clientDepartment
    if (data.contactName) merged.contactName = data.contactName
    if (data.clientAddress) merged.address = data.clientAddress
    if (data.clientAddressLine2) merged.addressLine2 = data.clientAddressLine2
    if (data.clientPostalCode) merged.postalCode = data.clientPostalCode
    if (data.clientCity) merged.city = data.clientCity
    if (data.clientSiret) merged.siret = data.clientSiret
    if (data.clientSiren) merged.siren = data.clientSiren
    if (data.clientTvaNumber) merged.tvaNumber = data.clientTvaNumber
    if (data.codeService) merged.codeService = data.codeService
    return merged
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
      siret: data.clientSiret ?? '',
      siren: data.clientSiren ?? '',
      tvaNumber: data.clientTvaNumber ?? '',
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
  if (data.clientSiret) update.siret = data.clientSiret
  if (data.clientSiren) update.siren = data.clientSiren
  if (data.clientTvaNumber) update.tvaNumber = data.clientTvaNumber
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
    // Un TTC énoncé par l'utilisateur est conservé QUEL QUE SOIT le mode
    // d'affichage : c'est lui la source de vérité du total de la ligne
    // (mode "TTC saisi sacré" de calculateTotals).
    if (item.unitPriceTTC != null) {
      return { ...base, unitPriceTTC: round2(item.unitPriceTTC) }
    }
    // Mode TTC sans TTC énoncé : on dérive pour que la colonne TTC soit remplie.
    if (priceMode === 'ttc') {
      return { ...base, unitPriceTTC: round2(item.unitPrice * (1 + item.vatRate / 100)) }
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
