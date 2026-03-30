import html2pdf from 'html2pdf.js'

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

/**
 * Convertit une couleur oklch() CSS en rgb()/rgba().
 * Utilise la conversion mathématique oklch → oklab → linear sRGB → sRGB.
 */
function oklchToRgb(oklchStr: string): string {
  const match = oklchStr.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/
  )
  if (!match) return oklchStr

  const L = parseFloat(match[1])
  const C = parseFloat(match[2])
  const H = parseFloat(match[3])
  let alpha = 1
  if (match[4]) {
    alpha = match[4].endsWith('%')
      ? parseFloat(match[4]) / 100
      : parseFloat(match[4])
  }

  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  function gamma(c: number): number {
    const abs = Math.abs(c)
    if (abs <= 0.0031308) return 12.92 * c
    return (c < 0 ? -1 : 1) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
  }

  const r = Math.round(Math.max(0, Math.min(255, gamma(rLin) * 255)))
  const g = Math.round(Math.max(0, Math.min(255, gamma(gLin) * 255)))
  const bv = Math.round(Math.max(0, Math.min(255, gamma(bLin) * 255)))

  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${bv}, ${alpha})`
  }
  return `rgb(${r}, ${g}, ${bv})`
}

/**
 * Remplace temporairement toutes les couleurs oklch() dans les feuilles de style
 * par leur équivalent rgb(), car html2canvas ne supporte pas oklch.
 * Retourne une fonction pour restaurer les valeurs originales.
 */
async function patchOklchColors(): Promise<() => void> {
  const cleanups: (() => void)[] = []
  const oklchPattern = /oklch\([^)]+\)/g

  // Patcher les éléments <style> (mode dev Vite)
  document.querySelectorAll('style').forEach((styleEl) => {
    const text = styleEl.textContent
    if (text && text.includes('oklch')) {
      const original = text
      styleEl.textContent = text.replace(oklchPattern, oklchToRgb)
      cleanups.push(() => {
        styleEl.textContent = original
      })
    }
  })

  // Patcher les <link> stylesheets (mode production)
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]'
  )
  for (const link of links) {
    try {
      const res = await fetch(link.href)
      const css = await res.text()
      if (css.includes('oklch')) {
        const patchedStyle = document.createElement('style')
        patchedStyle.textContent = css.replace(oklchPattern, oklchToRgb)
        link.parentNode?.insertBefore(patchedStyle, link)
        link.disabled = true
        cleanups.push(() => {
          patchedStyle.remove()
          link.disabled = false
        })
      }
    } catch {
      // Ignorer les stylesheets protégées par CORS
    }
  }

  return () => {
    cleanups.forEach((fn) => fn())
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

  // Convertir oklch → rgb avant la génération, restaurer après
  const restore = await patchOklchColors()
  try {
    await html2pdf().set(options).from(element).save()
  } finally {
    restore()
  }
}
