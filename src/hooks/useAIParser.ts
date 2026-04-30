import { useState, useEffect, useCallback } from 'react'
import { storage } from '@/lib/storage'
import { getProvider, callGemini, callOpenAI, formatError } from '@/lib/aiClient'
import { buildSystemPrompt } from '@/lib/aiPrompt'
import { validateParsedData } from '@/lib/aiValidation'
import type { AISettings, ParsedInvoiceData } from '@/types/invoice'

export interface AIParseResult {
  data: ParsedInvoiceData | null
  message: string | null
  error: string | null
  isRetryable: boolean
}

export function useAIParser() {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    storage.getAISettings().then(setSettings)
  }, [])

  const updateSettings = useCallback(async (newSettings: AISettings) => {
    setSettings(newSettings)
    await storage.saveAISettings(newSettings)
  }, [])

  const parse = useCallback(async (text: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<AIParseResult> => {
    const currentSettings = await storage.getAISettings()
    if (currentSettings) setSettings(currentSettings)

    if (!currentSettings?.apiKey) {
      return { data: null, message: null, error: 'Clé API manquante. Configurez-la dans Réglages → Mon profil.', isRetryable: false }
    }

    setIsLoading(true)
    const provider = getProvider(currentSettings)

    try {
      const priceMode = currentSettings.priceMode ?? 'ht'
      const systemPrompt = buildSystemPrompt(priceMode)

      // Historique conversationnel injecté dans le prompt système
      let extendedSystem = systemPrompt
      if (history.length > 0) {
        const recentHistory = history.slice(-10)
        const contextLines = recentHistory.map(m =>
          m.role === 'user' ? `Utilisateur : ${m.content}` : `Assistant : ${m.content}`
        )
        extendedSystem += `\n\n## Historique de la conversation :\n${contextLines.join('\n')}`
      }

      let rawJson: string
      if (provider === 'openai') {
        rawJson = await callOpenAI(currentSettings.apiKey, currentSettings.model, extendedSystem, text, priceMode)
      } else {
        // Gemini : on garde la concaténation prompt + nouveau message comme avant
        const prompt = `${extendedSystem}\n\nNouveau message :\n${text}`
        rawJson = await callGemini(currentSettings.apiKey, currentSettings.model, prompt, priceMode)
      }

      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(rawJson)
      } catch {
        return { data: null, message: null, error: 'Réponse IA invalide. Réessayez.', isRetryable: true }
      }

      // Priorité : extraire les données de facture AVANT le message conversationnel
      const parsed = validateParsedData(raw, priceMode)
      if (parsed) {
        return { data: parsed, message: null, error: null, isRetryable: false }
      }

      // Sinon, vérifier le message conversationnel
      const aiMessage = raw.message ? String(raw.message).trim() : null
      if (aiMessage) {
        return { data: null, message: aiMessage, error: null, isRetryable: false }
      }

      return { data: null, message: 'Je n\'ai pas trouvé de données de facture. Décrivez votre facture avec le nom du client et les prestations. Exemple : « Facture pour Société X, 3 repas à 30€ »', error: null, isRetryable: false }
    } catch (err) {
      const errorMsg = formatError(err, provider)
      const isRetryable = err instanceof Error && /429|rate|quota|network|fetch|failed/i.test(err.message)
      return { data: null, message: null, error: errorMsg, isRetryable }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { settings, updateSettings, parse, isLoading }
}
