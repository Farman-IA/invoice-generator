import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import type { AIProvider, AIModel } from '@/types/invoice'

export interface ApiKeyValidationResult {
  isValid: boolean
  error: string | null
}

export function inferProviderFromKey(apiKey: string): AIProvider {
  const trimmed = apiKey.trim()
  if (trimmed.startsWith('sk-')) return 'openai'
  if (trimmed.startsWith('AIza')) return 'google'
  return 'google'
}

export async function validateApiKey(
  apiKey: string,
  providerOrModel: AIProvider | AIModel = 'google',
): Promise<ApiKeyValidationResult> {
  if (!apiKey.trim()) return { isValid: false, error: 'Clé API vide.' }

  // Compatibilité ascendante : si on reçoit un nom de modèle, on déduit le provider.
  let provider: AIProvider
  if (providerOrModel === 'google' || providerOrModel === 'openai') {
    provider = providerOrModel
  } else {
    provider = providerOrModel.startsWith('gpt') ? 'openai' : 'google'
  }

  try {
    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Réponds juste "ok".' }],
        max_tokens: 5,
      })
    } else {
      const ai = new GoogleGenAI({ apiKey })
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Réponds juste "ok".',
        config: { maxOutputTokens: 5 },
      })
    }
    return { isValid: true, error: null }
  } catch (err) {
    if (!(err instanceof Error)) return { isValid: false, error: 'Erreur inconnue.' }
    const msg = err.message.toLowerCase()
    if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid_api_key'))
      return { isValid: false, error: 'Clé API invalide.' }
    if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
      return { isValid: true, error: null } // quota = clé valide mais limitée
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed'))
      return { isValid: false, error: 'Erreur réseau. Vérifiez votre connexion.' }
    return { isValid: false, error: `Erreur : ${err.message.substring(0, 80)}` }
  }
}
