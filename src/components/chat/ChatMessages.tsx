import { useEffect, useRef } from 'react'
import { Sparkles, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataPreview } from './DataPreview'
import type { ParsedInvoiceData, PriceMode } from '@/types/invoice'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  isRetryable?: boolean
  pendingData?: ParsedInvoiceData
  // Question ou remarque de l'IA qui ACCOMPAGNE des données partielles
  // (ex: "Il me manque le prix par déjeuner") — affichée au-dessus du
  // formulaire de vérification tant que les données ne sont pas appliquées.
  aiNote?: string
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading: boolean
  retryCountdown: number
  priceMode?: PriceMode
  onRetry: () => void
  onApplyPendingData: (msgId: string, edited: ParsedInvoiceData) => void
  onCancelPending: (msgId: string) => void
}

// Affiche la liste des messages du chat (utilisateur, assistant, erreurs),
// le formulaire d'édition pour les données en attente, le bouton "Réessayer"
// après une erreur réseau, et le spinner pendant l'analyse IA.
export function ChatMessages({
  messages,
  isLoading,
  retryCountdown,
  priceMode,
  onRetry,
  onApplyPendingData,
  onCancelPending,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const lastMessage = messages[messages.length - 1]
  const showRetryButton = lastMessage?.role === 'error' && lastMessage.isRetryable

  return (
    <div
      className={`flex-1 overflow-y-auto p-4 space-y-3 ${messages.length === 0 ? 'flex items-center justify-center' : ''}`}
      role="log"
      aria-live="polite"
      aria-label="Messages de l'assistant IA"
    >
      {messages.length === 0 && (
        <div className="text-center">
          <Sparkles className="size-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Décrivez votre facture en français
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
            Ex : « Facture pour l'Université de Lorraine,<br />3 repas complets à 30€ »
          </p>
        </div>
      )}

      {messages.length > 0 && (
        <>
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* Données en attente de validation → afficher le formulaire */}
              {msg.pendingData ? (
                <div className="max-w-[95%] space-y-2">
                  {msg.aiNote && (
                    <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm whitespace-pre-line">
                      {msg.aiNote}
                    </div>
                  )}
                  <DataPreview
                    data={msg.pendingData}
                    priceMode={priceMode}
                    onApply={(edited) => onApplyPendingData(msg.id, edited)}
                    onCancel={() => onCancelPending(msg.id)}
                  />
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : msg.role === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}>
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {/* Bouton Réessayer */}
          {showRetryButton && (
            <div className="flex justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={retryCountdown > 0 || isLoading}
                className="text-xs"
              >
                <RotateCcw className="size-3 mr-1" />
                {retryCountdown > 0
                  ? `Réessai dans ${retryCountdown}s...`
                  : 'Réessayer'
                }
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Analyse en cours...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  )
}
