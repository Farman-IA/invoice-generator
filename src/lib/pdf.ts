import { toast } from 'sonner'

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

export async function generatePDF(
  _element: HTMLElement,
  invoiceNumber: string,
  clientName: string,
  type: 'invoice' | 'quote' = 'invoice'
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const prefix = type === 'invoice' ? 'Facture' : 'Devis'
  const cleanClient = sanitizeFilename(clientName) || 'Client'
  const cleanNumber = sanitizeFilename(invoiceNumber) || prefix

  // Le nom du fichier dans "Enregistrer sous" vient du <title> de la page
  const originalTitle = document.title
  document.title = `${prefix}_${cleanNumber}_${cleanClient}_${date}`

  window.print()

  // Restaurer le titre après l'impression
  setTimeout(() => { document.title = originalTitle }, 500)

  toast.success('Utilisez "Enregistrer en PDF" dans la boîte de dialogue')
}
