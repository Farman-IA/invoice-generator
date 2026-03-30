import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

/**
 * Prépare l'élément pour la capture PDF :
 * - Force la largeur à 210mm (A4)
 * - Ajoute la classe .pdf-capture qui cache les éléments interactifs
 * Retourne une fonction pour tout restaurer.
 */
function prepareForPdf(element: HTMLElement): () => void {
  const prevWidth = element.style.width
  const prevMaxWidth = element.style.maxWidth

  element.style.width = '210mm'
  element.style.maxWidth = '210mm'
  element.classList.add('pdf-capture')

  return () => {
    element.style.width = prevWidth
    element.style.maxWidth = prevMaxWidth
    element.classList.remove('pdf-capture')
  }
}

export async function generatePDF(
  element: HTMLElement,
  invoiceNumber: string,
  clientName: string
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const cleanClient = sanitizeFilename(clientName) || 'Client'
  const cleanNumber = sanitizeFilename(invoiceNumber) || 'Facture'
  const filename = `Facture_${cleanNumber}_${cleanClient}_${date}.pdf`

  const restore = prepareForPdf(element)

  try {
    // html-to-image utilise le moteur de rendu natif du navigateur
    // qui supporte oklch et toutes les fonctionnalités CSS modernes
    const canvas = await toCanvas(element, {
      pixelRatio: 2,
      cacheBust: true,
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = 210
    const pageHeight = 297

    // Pas de marge PDF : l'élément a déjà son propre padding (p-12)
    const imgWidthPx = canvas.width / 2
    const imgHeightPx = canvas.height / 2
    const scale = pageWidth / imgWidthPx
    const scaledHeight = imgHeightPx * scale

    if (scaledHeight <= pageHeight) {
      const imgData = canvas.toDataURL('image/jpeg', 0.98)
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, scaledHeight)
    } else {
      // Plusieurs pages : découper le canvas en tranches
      const pxPerPage = (pageHeight / scale) * 2
      const totalPages = Math.ceil(canvas.height / pxPerPage)

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()

        const sliceHeight = Math.min(
          pxPerPage,
          canvas.height - page * pxPerPage
        )
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sliceHeight

        const ctx = sliceCanvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
        ctx.drawImage(canvas, 0, -page * pxPerPage)

        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.98)
        const displayHeight = (sliceHeight / 2) * scale
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, displayHeight)
      }
    }

    pdf.save(filename)
  } finally {
    restore()
  }
}
