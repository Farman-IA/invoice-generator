import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
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

  // html-to-image utilise le moteur de rendu natif du navigateur (SVG foreignObject)
  // ce qui supporte oklch et toutes les fonctionnalités CSS modernes
  const canvas = await toCanvas(element, {
    pixelRatio: 2,
    cacheBust: true,
  })

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const contentWidth = pageWidth - 2 * margin
  const contentHeight = pageHeight - 2 * margin

  // Dimensions de l'image en unités réelles (÷2 car pixelRatio=2)
  const imgWidthPx = canvas.width / 2
  const imgHeightPx = canvas.height / 2
  const scale = contentWidth / imgWidthPx
  const scaledHeight = imgHeightPx * scale

  if (scaledHeight <= contentHeight) {
    // Tient sur une seule page
    const imgData = canvas.toDataURL('image/jpeg', 0.98)
    pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, scaledHeight)
  } else {
    // Plusieurs pages : découper le canvas en tranches
    const pxPerPage = (contentHeight / scale) * 2
    const totalPages = Math.ceil(canvas.height / pxPerPage)

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage()

      const sliceHeight = Math.min(pxPerPage, canvas.height - page * pxPerPage)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceHeight

      const ctx = sliceCanvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
      ctx.drawImage(canvas, 0, -page * pxPerPage)

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.98)
      const displayHeight = (sliceHeight / 2) * scale
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, displayHeight)
    }
  }

  pdf.save(filename)
}
