import { validateParsedData } from './aiValidation'
import { formatError } from './aiClient'
import type { AIProvider, ParsedInvoiceData, PriceMode } from '@/types/invoice'

export interface AIParseResult {
  data: ParsedInvoiceData | null
  message: string | null
  error: string | null
  isRetryable: boolean
}

// Transforme la réponse JSON brute de l'IA en résultat exploitable.
// Partagé entre le parsing texte (useAIParser) et fichier (useAIFileParser) —
// avant cette extraction, le même bloc était copié-collé dans les deux hooks
// et chaque évolution devait être reportée deux fois (et oubliée une fois sur deux).
export function finalizeAIResponse(rawJson: string, priceMode: PriceMode): AIParseResult {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(rawJson)
  } catch {
    return { data: null, message: null, error: 'Réponse IA invalide. Réessayez.', isRetryable: true }
  }

  // Données ET message peuvent coexister : l'IA extrait ce qu'elle a
  // (ex: 4 lignes sans prix) ET pose la question de ce qui manque.
  const parsed = validateParsedData(raw, priceMode)
  const aiMessage = raw.message ? String(raw.message).trim() : null
  if (parsed || aiMessage) {
    return { data: parsed, message: aiMessage, error: null, isRetryable: false }
  }

  // Ni données ni message : chaque hook applique son propre message de repli
  // (le texte et le fichier ne disent pas la même chose à l'utilisateur).
  return { data: null, message: null, error: null, isRetryable: false }
}

export function toAIErrorResult(err: unknown, provider: AIProvider): AIParseResult {
  const isRetryable = err instanceof Error && /429|rate|quota|network|fetch|failed/i.test(err.message)
  return { data: null, message: null, error: formatError(err, provider), isRetryable }
}
