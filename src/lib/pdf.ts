import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'

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
  clientName: string,
  type: 'invoice' | 'quote' = 'invoice'
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const cleanClient = sanitizeFilename(clientName) || 'Client'
  const cleanNumber = sanitizeFilename(invoiceNumber) || (type === 'invoice' ? 'Facture' : 'Devis')
  const prefix = type === 'invoice' ? 'Facture' : 'Devis'
  const filename = `${prefix}_${cleanNumber}_${cleanClient}_${date}.pdf`

  // Préparer l'élément : cacher les boutons/chevrons
  element.classList.add('pdf-capture')

  // Forcer l'affichage centré des taux TVA (inline > toute CSS)
  element.querySelectorAll<HTMLElement>('.pdf-vat-select').forEach((el) => {
    el.style.display = 'none'
  })
  element.querySelectorAll<HTMLElement>('.pdf-vat-text').forEach((el) => {
    el.classList.remove('hidden')
    el.style.display = 'block'
    el.style.textAlign = 'center'
    el.style.width = '100%'
  })

  // Cacher les champs non renseignés (LabeledField vides)
  element.querySelectorAll<HTMLElement>('[data-empty]').forEach((el) => {
    el.style.display = 'none'
  })

  void element.offsetHeight

  // Convertir oklch → rgb pour html2canvas
  const restoreColors = patchOklchColors(element)

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    }).catch(() => null)

    if (!canvas) {
      toast.error('Erreur lors de la capture du document. Réessayez.')
      return
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = 210
    const pageHeight = 297
    const margin = 10

    const imgWidthPx = canvas.width / 2
    const imgHeightPx = canvas.height / 2

    // Vérifier si le contenu rentre sur 1 page
    const maxWidthMm = pageWidth - 2 * margin
    const maxHeightMm = pageHeight - 2 * margin
    const scale = Math.min(maxWidthMm / imgWidthPx, maxHeightMm / imgHeightPx)

    if (scale >= 1) {
      // Tout rentre sur 1 page, pas de scaling
      const finalWidth = imgWidthPx
      const finalHeight = imgHeightPx
      const imgData = canvas.toDataURL('image/jpeg', 0.98)
      pdf.addImage(imgData, 'JPEG', margin, margin, finalWidth, finalHeight)
    } else {
      // Contenu multi-pages : découper l'image en bandes
      const pxPerPage = (pageHeight - 2 * margin) / scale // pixels par page
      const numPages = Math.ceil(imgHeightPx / pxPerPage)

      const imgData = canvas.toDataURL('image/jpeg', 0.98)
      const tempImg = new Image()
      tempImg.src = imgData

      for (let page = 0; page < numPages; page++) {
        if (page > 0) {
          pdf.addPage()
        }

        const srcY = page * pxPerPage
        const srcHeight = Math.min(pxPerPage, imgHeightPx - srcY)

        // Créer un canvas temporaire pour la bande
        const bandCanvas = document.createElement('canvas')
        bandCanvas.width = canvas.width
        bandCanvas.height = srcHeight * 2
        const ctx = bandCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, srcY * 2,
            canvas.width, srcHeight * 2,
            0, 0,
            canvas.width, srcHeight * 2
          )
        }

        const bandData = bandCanvas.toDataURL('image/jpeg', 0.98)
        const finalWidth = imgWidthPx * scale
        const finalHeight = srcHeight * scale

        pdf.addImage(bandData, 'JPEG', margin, margin, finalWidth, finalHeight)
      }
    }

    // En mode PWA (raccourci Dock), pdf.save() ne fonctionne pas car Safari
    // bloque le telechargement via <a download>. On ouvre le PDF dans un nouvel onglet.
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone)

    if (isStandalone) {
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } else {
      pdf.save(filename)
    }
  } catch {
    toast.error('Erreur lors de la génération du PDF. Réessayez.')
  } finally {
    restoreColors()
    element.querySelectorAll<HTMLElement>('.pdf-vat-select').forEach((el) => {
      el.style.display = ''
    })
    element.querySelectorAll<HTMLElement>('.pdf-vat-text').forEach((el) => {
      el.classList.add('hidden')
      el.style.display = ''
      el.style.textAlign = ''
      el.style.width = ''
    })
    element.querySelectorAll<HTMLElement>('[data-empty]').forEach((el) => {
      el.style.display = ''
    })
    element.classList.remove('pdf-capture')
  }
}
