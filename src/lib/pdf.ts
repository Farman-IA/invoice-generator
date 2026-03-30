import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

// --- Conversion oklch → rgb ---

const OKLCH_RE = /oklch\([^)]+\)/g

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

  return alpha < 1
    ? `rgba(${r}, ${g}, ${bv}, ${alpha})`
    : `rgb(${r}, ${g}, ${bv})`
}

// --- Patch oklch inline styles ---

const COLOR_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'box-shadow',
]

/**
 * Convertit toutes les couleurs oklch en rgb via inline styles
 * pour que html2canvas puisse les lire correctement.
 */
function patchOklchColors(root: HTMLElement): () => void {
  const restores: (() => void)[] = []
  const htmlEl = document.documentElement

  // 1. Patcher les variables CSS sur :root
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) {
          if ('cssRules' in rule) {
            // Gérer les règles imbriquées (@layer, @media, etc.)
            for (const nested of (rule as CSSGroupingRule).cssRules) {
              if (nested instanceof CSSStyleRule) {
                patchCssVarsFromRule(nested, htmlEl, restores)
              }
            }
          }
          continue
        }
        patchCssVarsFromRule(rule, htmlEl, restores)
      }
    } catch {
      // Ignorer les stylesheets CORS
    }
  }

  // Forcer le recalcul des styles
  void htmlEl.offsetHeight

  // 2. Patcher les propriétés de couleur sur chaque élément
  const elements = root.querySelectorAll('*')
  patchElementColors(root, restores)
  elements.forEach((el) => {
    if (el instanceof HTMLElement) {
      patchElementColors(el, restores)
    }
  })

  return () => restores.forEach((fn) => fn())
}

function patchCssVarsFromRule(
  rule: CSSStyleRule,
  htmlEl: HTMLElement,
  restores: (() => void)[]
) {
  for (let i = 0; i < rule.style.length; i++) {
    const prop = rule.style[i]
    if (!prop.startsWith('--')) continue

    const value = rule.style.getPropertyValue(prop).trim()
    if (!value.includes('oklch')) continue

    const rgb = value.replace(OKLCH_RE, oklchToRgb)
    const prev = htmlEl.style.getPropertyValue(prop)
    htmlEl.style.setProperty(prop, rgb)
    restores.push(() => {
      if (prev) htmlEl.style.setProperty(prop, prev)
      else htmlEl.style.removeProperty(prop)
    })
  }
}

function patchElementColors(
  el: HTMLElement,
  restores: (() => void)[]
) {
  const computed = getComputedStyle(el)
  for (const prop of COLOR_PROPS) {
    const value = computed.getPropertyValue(prop)
    if (!value.includes('oklch')) continue

    const rgb = value.replace(OKLCH_RE, oklchToRgb)
    const prev = el.style.getPropertyValue(prop)
    el.style.setProperty(prop, rgb)
    restores.push(() => {
      if (prev) el.style.setProperty(prop, prev)
      else el.style.removeProperty(prop)
    })
  }
}

// --- Génération PDF ---

export async function generatePDF(
  element: HTMLElement,
  invoiceNumber: string,
  clientName: string
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const cleanClient = sanitizeFilename(clientName) || 'Client'
  const cleanNumber = sanitizeFilename(invoiceNumber) || 'Facture'
  const filename = `Facture_${cleanNumber}_${cleanClient}_${date}.pdf`

  // Préparer l'élément : cacher les boutons/chevrons
  element.classList.add('pdf-capture')
  void element.offsetHeight

  // Convertir oklch → rgb pour html2canvas
  const restoreColors = patchOklchColors(element)

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = 210
    const pageHeight = 297

    const imgWidthPx = canvas.width / 2
    const imgHeightPx = canvas.height / 2
    const scale = pageWidth / imgWidthPx
    const scaledHeight = imgHeightPx * scale

    if (scaledHeight <= pageHeight) {
      const imgData = canvas.toDataURL('image/jpeg', 0.98)
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, scaledHeight)
    } else {
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
    restoreColors()
    element.classList.remove('pdf-capture')
  }
}
