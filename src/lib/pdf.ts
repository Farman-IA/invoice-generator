import { toast } from 'sonner'

/**
 * Génère un PDF via la boîte de dialogue d'impression du navigateur.
 *
 * Pourquoi window.print() au lieu de html2canvas + jsPDF ?
 * → html2canvas ne supporte pas les couleurs oklch() de Tailwind CSS v4,
 *   ce qui fait crasher la capture. window.print() utilise le moteur
 *   de rendu natif du navigateur qui gère toutes les CSS modernes.
 *
 * Le CSS @media print dans index.css cache automatiquement
 * le header, le chat, les boutons, et les champs vides.
 * L'utilisateur choisit "Enregistrer en PDF" dans la boîte de dialogue.
 */
export async function generatePDF(
  _element: HTMLElement,
  _invoiceNumber: string,
  _clientName: string,
  _type: 'invoice' | 'quote' = 'invoice'
): Promise<void> {
  window.print()
  toast.success('Utilisez "Enregistrer en PDF" dans la boîte de dialogue')
}
