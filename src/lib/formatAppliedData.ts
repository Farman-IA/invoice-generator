import type { ParsedInvoiceData } from '@/types/invoice'

export function formatAppliedData(data: ParsedInvoiceData): string {
  const lines: string[] = []
  if (data.clientName) {
    let clientLine = `Client : ${data.clientName}`
    if (data.clientDepartment) clientLine += `\nService : ${data.clientDepartment}`
    if (data.clientAddressLine2) clientLine += `\n${data.clientAddressLine2}`
    if (data.clientAddress) clientLine += `\n${data.clientAddress}`
    if (data.clientPostalCode || data.clientCity) clientLine += `\n${[data.clientPostalCode, data.clientCity].filter(Boolean).join(' ')}`
    if (data.contactName) clientLine += `\nContact : ${data.contactName}`
    // Identifiants légaux : on les affiche dans la confirmation pour que
    // l'utilisateur garde une trace de ce que l'IA a réellement appliqué.
    if (data.clientSiret) clientLine += `\nSIRET : ${data.clientSiret}`
    if (data.clientSiren) clientLine += `\nSIREN : ${data.clientSiren}`
    if (data.clientTvaNumber) clientLine += `\nTVA : ${data.clientTvaNumber}`
    lines.push(clientLine)
  }
  if (data.purchaseOrder) lines.push(`Bon de commande : ${data.purchaseOrder}`)
  if (data.codeService) lines.push(`Code service (Chorus Pro) : ${data.codeService}`)
  if (data.items?.length) {
    data.items.forEach(item => {
      // Une ligne saisie en TTC s'affiche en TTC : l'utilisateur dicte
      // "30 € TTC", il doit relire "30,00€ TTC" — pas le HT dérivé (27,27)
      // qui faisait croire à un montant inventé. Le HT reste visible sur
      // la facture elle-même.
      const price = item.unitPriceTTC != null
        ? `${item.unitPriceTTC.toFixed(2)}€ TTC`
        : `${item.unitPrice.toFixed(2)}€ HT`
      lines.push(`+ ${item.quantity} × ${item.description} — ${price} — TVA ${item.vatRate}%`)
    })
  }
  if (data.deposit != null && data.deposit > 0) lines.push(`Acompte à déduire : ${data.deposit.toFixed(2)}€`)
  if (data.notes) lines.push(`Notes : ${data.notes}`)
  return lines.join('\n')
}
