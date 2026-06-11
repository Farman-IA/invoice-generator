import { useState, useEffect, useCallback } from 'react'
import { storage } from '@/lib/storage'
import { getProvider, callGemini, callOpenAI, type ChatTurn } from '@/lib/aiClient'
import { buildSystemPrompt } from '@/lib/aiPrompt'
import { finalizeAIResponse, toAIErrorResult, type AIParseResult } from '@/lib/aiResult'
import type { AISettings, PriceMode } from '@/types/invoice'

// Ré-export pour les composants qui consomment le type via ce hook
export type { AIParseResult } from '@/lib/aiResult'

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

  // priceModeOverride : le mode HT/TTC de la FACTURE à l'écran (source de
  // vérité unique). Sans lui, on retombe sur le vieux réglage IA — qui
  // pouvait contredire le mode de la facture et fausser les conversions.
  const parse = useCallback(async (text: string, history: ChatTurn[] = [], priceModeOverride?: PriceMode): Promise<AIParseResult> => {
    const currentSettings = await storage.getAISettings()
    if (currentSettings) setSettings(currentSettings)

    if (!currentSettings?.apiKey) {
      return { data: null, message: null, error: 'Clé API manquante. Configurez-la dans Réglages → Mon profil.', isRetryable: false }
    }

    setIsLoading(true)
    const provider = getProvider(currentSettings)

    try {
      const priceMode = priceModeOverride ?? currentSettings.priceMode ?? 'ht'
      const systemPrompt = buildSystemPrompt(priceMode)

      // L'historique part comme de vrais tours de conversation (10 derniers),
      // pour que l'IA fusionne les infos données en plusieurs messages.
      const recentHistory = history.slice(-10)

      let rawJson: string
      if (provider === 'openai') {
        rawJson = await callOpenAI(currentSettings.apiKey, currentSettings.model, systemPrompt, recentHistory, text, priceMode)
      } else {
        rawJson = await callGemini(currentSettings.apiKey, currentSettings.model, systemPrompt, recentHistory, text, priceMode)
      }

      const result = finalizeAIResponse(rawJson, priceMode)
      if (result.data || result.message || result.error) return result
      return { data: null, message: 'Je n\'ai pas trouvé de données de facture. Décrivez votre facture avec le nom du client et les prestations. Exemple : « Facture pour Société X, 3 repas à 30€ »', error: null, isRetryable: false }
    } catch (err) {
      return toAIErrorResult(err, provider)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { settings, updateSettings, parse, isLoading }
}
