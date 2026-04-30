// Hook qui prend un fichier (PDF ou image) et appelle l'IA pour
// en extraire des données de facture. Réutilise le prompt système, le schéma
// et la validation du hook texte (useAIParser) — la seule différence est
// le canal d'entrée (fichier au lieu de texte tapé).

import { useState, useCallback } from 'react'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { storage } from '@/lib/storage'
import { getProvider, callWithRetry, formatError } from '@/lib/aiClient'
import { buildInvoiceSchema, buildOpenAIInvoiceSchema } from '@/lib/aiSchemas'
import { buildSystemPrompt } from '@/lib/aiPrompt'
import { validateParsedData } from '@/lib/aiValidation'
import {
  validateFile,
  extractPdfText,
  fileToGeminiPart,
  fileToDataUrl,
  pdfFirstPageToImageDataUrl,
  isImage,
  isPdf,
} from '@/lib/fileToAIInput'
import type { AIModel, PriceMode } from '@/types/invoice'
import type { AIParseResult } from '@/hooks/useAIParser'

// Seuil en dessous duquel on considère qu'un PDF est "scanné" (pas de texte vrai)
const PDF_TEXT_MIN_LENGTH = 30

// Instruction utilisateur quand on envoie un fichier — laisse l'IA appliquer
// les règles métier déjà présentes dans le prompt système.
const FILE_USER_PROMPT = `Voici un document fourni par l'utilisateur (devis, bon de commande, facture, mail, photo).
Extrais-en les données pour remplir une facture en suivant strictement les règles du prompt système (clients récurrents, TVA française, formatage adresse, etc.).
Si le document n'est pas une description de facture, mets "message" avec une explication courte.`

// ---------- Gemini ----------

async function callGeminiWithFile(
  apiKey: string,
  model: AIModel,
  systemPrompt: string,
  file: File,
  priceMode: PriceMode,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const filePart = await fileToGeminiPart(file)

  const response = await callWithRetry(
    () => ai.models.generateContent({
      model,
      contents: [
        // Gemini lit le fichier brut (PDF ou image) en multimodal
        { role: 'user', parts: [filePart, { text: FILE_USER_PROMPT }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: buildInvoiceSchema(priceMode),
      },
    }),
    'Gemini',
  )
  return response.text ?? '{}'
}

// ---------- OpenAI ----------

// Pour OpenAI, 3 cas selon le fichier :
// - Image → on l'envoie directement via l'API Vision (image_url)
// - PDF avec texte → on extrait le texte et on l'envoie comme contenu texte
// - PDF scanné (pas de texte) → on convertit la 1re page en image et on l'envoie via Vision
async function callOpenAIWithFile(
  apiKey: string,
  model: AIModel,
  systemPrompt: string,
  file: File,
  priceMode: PriceMode,
): Promise<string> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

  // Construit la partie "user content" selon le type de fichier
  let userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]

  if (isImage(file)) {
    const dataUrl = await fileToDataUrl(file)
    userContent = [
      { type: 'text', text: FILE_USER_PROMPT },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]
  } else if (isPdf(file)) {
    const text = await extractPdfText(file)
    if (text.length >= PDF_TEXT_MIN_LENGTH) {
      // PDF "normal" : on a du texte → on l'envoie comme texte
      userContent = [
        { type: 'text', text: `${FILE_USER_PROMPT}\n\n--- Contenu extrait du PDF ---\n${text}` },
      ]
    } else {
      // PDF probablement scanné : on rend la 1re page en image et on l'envoie via Vision
      const imageDataUrl = await pdfFirstPageToImageDataUrl(file)
      userContent = [
        { type: 'text', text: `${FILE_USER_PROMPT}\n(Le PDF semble scanné, voici le rendu image de la première page)` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    }
  } else {
    throw new Error('Format non supporté')
  }

  const response = await callWithRetry(
    () => openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'invoice_data',
          strict: true,
          schema: buildOpenAIInvoiceSchema(priceMode),
        },
      },
    }),
    'OpenAI',
  )
  return response.choices[0]?.message?.content ?? '{}'
}

// ---------- Hook public ----------

export function useAIFileParser() {
  const [isLoading, setIsLoading] = useState(false)

  const parseFile = useCallback(async (file: File): Promise<AIParseResult> => {
    // 1) Valide le fichier (type, taille)
    const validation = validateFile(file)
    if (!validation.ok) {
      return { data: null, message: null, error: validation.error ?? 'Fichier invalide.', isRetryable: false }
    }

    // 2) Récupère les réglages IA (clé API, modèle, mode HT/TTC)
    const settings = await storage.getAISettings()
    if (!settings?.apiKey) {
      return { data: null, message: null, error: 'Clé API manquante. Configurez-la dans Réglages → Mon profil.', isRetryable: false }
    }

    setIsLoading(true)
    const provider = getProvider(settings)

    try {
      const priceMode = settings.priceMode ?? 'ht'
      const systemPrompt = buildSystemPrompt(priceMode)

      let rawJson: string
      if (provider === 'openai') {
        rawJson = await callOpenAIWithFile(settings.apiKey, settings.model, systemPrompt, file, priceMode)
      } else {
        rawJson = await callGeminiWithFile(settings.apiKey, settings.model, systemPrompt, file, priceMode)
      }

      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(rawJson)
      } catch {
        return { data: null, message: null, error: 'Réponse IA invalide. Réessayez.', isRetryable: true }
      }

      // Priorité aux données structurées de facture
      const parsed = validateParsedData(raw, priceMode)
      if (parsed) {
        return { data: parsed, message: null, error: null, isRetryable: false }
      }

      const aiMessage = raw.message ? String(raw.message).trim() : null
      if (aiMessage) {
        return { data: null, message: aiMessage, error: null, isRetryable: false }
      }

      return {
        data: null,
        message: null,
        error: "Je n'ai pas pu extraire de données de ce fichier. Vérifiez que c'est bien une facture, un devis ou un bon de commande.",
        isRetryable: false,
      }
    } catch (err) {
      const errorMsg = formatError(err, provider)
      const isRetryable = err instanceof Error && /429|rate|quota|network|fetch|failed/i.test(err.message)
      return { data: null, message: null, error: errorMsg, isRetryable }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { parseFile, isLoading }
}
