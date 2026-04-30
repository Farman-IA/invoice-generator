// Conversion d'un fichier (PDF ou image) en formats consommables par les IA.
// - Gemini : on lui passe le fichier brut en Base64 (multimodal natif)
// - OpenAI : pas de support PDF, on extrait le texte ; si vide (PDF scanné), on rend la 1re page en image

import * as pdfjsLib from 'pdfjs-dist'

// pdfjs charge un worker depuis un CDN. Vite ne sait pas le bundler tout seul.
// On pointe vers le worker du même version dans node_modules via un import URL.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Limites — alignées avec les contraintes Gemini (20 Mo inline) mais on reste prudent
export const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

// Types acceptés (extensions et MIME type)
export const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg'
const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']

export interface FileValidationResult {
  ok: boolean
  error?: string
}

export function validateFile(file: File): FileValidationResult {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: 'Format non supporté. Utilisez PDF, PNG ou JPG.' }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `Fichier trop lourd (max ${MAX_FILE_SIZE_MB} Mo).` }
  }
  if (file.size === 0) {
    return { ok: false, error: 'Fichier vide.' }
  }
  return { ok: true }
}

// Convertit un File en chaîne Base64 (sans le préfixe "data:...;base64,")
// Utilisé par Gemini qui prend le fichier brut dans son champ inlineData.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result = "data:application/pdf;base64,XXXX..." → on enlève le préfixe
      const base64 = result.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

// Convertit un File en Data URL complet (avec préfixe "data:...;base64,")
// Utilisé par OpenAI Vision (champ image_url).
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

// Extrait le texte d'un PDF (toutes les pages concaténées).
// Pour un PDF scanné (= images de pages), le texte sera vide ou très court.
export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map(item => 'str' in item ? item.str : '')
      .join(' ')
    pageTexts.push(text)
  }
  return pageTexts.join('\n\n').trim()
}

// Rend la première page d'un PDF en image JPG (Data URL).
// Sert de fallback pour OpenAI quand le PDF est scanné (extraction texte vide).
export async function pdfFirstPageToImageDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)

  // Échelle 2x : un bon compromis entre lisibilité et taille du fichier généré
  const viewport = page.getViewport({ scale: 2 })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Impossible de créer le contexte canvas')

  await page.render({ canvas, canvasContext: context, viewport }).promise

  // JPG quality 0.85 : équilibre poids / qualité pour OCR par GPT-4o
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Type d'entrée côté Gemini (inlineData = Base64 + mime)
export interface GeminiFilePart {
  inlineData: { data: string; mimeType: string }
}

export async function fileToGeminiPart(file: File): Promise<GeminiFilePart> {
  const data = await fileToBase64(file)
  return { inlineData: { data, mimeType: file.type } }
}

// Helpers de classification
export function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf'
}
