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
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const cleanClient = sanitizeFilename(clientName) || 'Client'
  const cleanNumber = sanitizeFilename(invoiceNumber) || (type === 'invoice' ? 'Facture' : 'Devis')

  // Chorus Pro exige un nom de fichier de moins de 50 caractères (.pdf inclus)
  const maxBase = 50 - '.pdf'.length // 46 caractères max pour le nom
  const baseName = `${cleanNumber}_${cleanClient}_${date}`.slice(0, maxBase).replace(/_+$/, '')

  const originalTitle = document.title
  document.title = baseName

  window.print()

  // Restaurer le titre après l'impression
  setTimeout(() => { document.title = originalTitle }, 500)

  toast.success('Utilisez "Enregistrer en PDF" dans la boîte de dialogue')
}
