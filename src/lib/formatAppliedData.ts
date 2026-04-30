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
    lines.push(clientLine)
  }
  if (data.purchaseOrder) lines.push(`Bon de commande : ${data.purchaseOrder}`)
  if (data.codeService) lines.push(`Code service (Chorus Pro) : ${data.codeService}`)
  if (data.items?.length) {
    data.items.forEach(item => {
      lines.push(`+ ${item.quantity} × ${item.description} — ${item.unitPrice.toFixed(2)}€ HT — TVA ${item.vatRate}%`)
    })
  }
  if (data.deposit != null && data.deposit > 0) lines.push(`Acompte à déduire : ${data.deposit.toFixed(2)}€`)
  if (data.notes) lines.push(`Notes : ${data.notes}`)
  return lines.join('\n')
}
