import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { toast } from 'sonner'
import { buildInvoiceSchema, buildOpenAIInvoiceSchema } from './aiSchemas'
import type { AIModel, AIProvider, AISettings, PriceMode } from '@/types/invoice'

export function getProvider(settings: Pick<AISettings, 'provider' | 'model'>): AIProvider {
  if (settings.provider) return settings.provider
  return settings.model.startsWith('gpt') ? 'openai' : 'google'
}

// Retry automatique sur 503 (serveurs surchargés) :
// jusqu'à 2 nouvelles tentatives (attente 2s puis 4s). Le timeout
// de 30s s'applique PAR tentative, pas au total.
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  providerLabel: string,
  maxRetries = 2,
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout : l\'IA n\'a pas répondu en 30 secondes')), 30000)
      )
      return await Promise.race([fn(), timeoutPromise])
    } catch (err) {
      const isOverload = err instanceof Error && /503|unavailable|overloaded/i.test(err.message)
      if (!isOverload || attempt >= maxRetries) throw err
      attempt++
      const delayMs = 2000 * Math.pow(2, attempt - 1) // 2000ms puis 4000ms
      toast.info(`${providerLabel} surchargé — nouvelle tentative dans ${Math.round(delayMs / 1000)}s…`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export async function callGemini(apiKey: string, model: AIModel, prompt: string, priceMode: PriceMode): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await callWithRetry(
    () => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildInvoiceSchema(priceMode),
      },
    }),
    'Gemini',
  )
  return response.text ?? '{}'
}

export async function callOpenAI(apiKey: string, model: AIModel, systemPrompt: string, userText: string, priceMode: PriceMode): Promise<string> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  const response = await callWithRetry(
    () => openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
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

export function formatError(err: unknown, provider: AIProvider): string {
  if (!(err instanceof Error)) return 'Erreur inattendue. Réessayez.'
  const msg = err.message.toLowerCase()
  const isGoogle = provider === 'google'
  const providerName = isGoogle ? 'Gemini' : 'OpenAI'
  if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized'))
    return 'Clé API invalide. Vérifiez-la dans Réglages → Mon profil.'
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota')) {
    if (isGoogle)
      return 'Quota API dépassé. La clé gratuite Gemini est limitée à ~15 requêtes/min. Attendez 1-2 minutes avant de réessayer.'
    return 'Quota OpenAI dépassé ou crédits insuffisants. Vérifiez vos crédits sur platform.openai.com/billing.'
  }
  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('overloaded')) {
    if (isGoogle)
      return 'Serveurs Gemini surchargés (503). Réessayez dans 30-60 secondes, ou basculez sur OpenAI dans Réglages.'
    return 'Serveurs OpenAI surchargés (503). Réessayez dans 30-60 secondes, ou basculez sur Gemini dans Réglages.'
  }
  if (msg.includes('500') || msg.includes('internal'))
    return `Erreur côté ${providerName} (500). Réessayez dans quelques instants.`
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed'))
    return 'Erreur réseau. Vérifiez votre connexion internet.'
  if (msg.includes('404') || msg.includes('model not found') || msg.includes('models/'))
    return 'Modèle IA non disponible. Essayez un autre modèle dans les réglages.'
  return `Erreur lors de l'analyse. Réessayez. (${msg.substring(0, 80)})`
}
