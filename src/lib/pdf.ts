import html2pdf from 'html2pdf.js'

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

  const options = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'a4' as const,
      orientation: 'portrait' as const,
    },
  }

  await html2pdf().set(options).from(element).save()
}
