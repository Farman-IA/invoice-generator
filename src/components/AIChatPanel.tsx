import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatConversation } from '@/hooks/useChatConversation'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { formatAppliedData } from '@/lib/formatAppliedData'
import { modelLabel } from '@/lib/aiClient'
import { ChatMessages } from './chat/ChatMessages'
import { ChatInput, type ChatInputHandle } from './chat/ChatInput'
import { InlineApiKeyForm } from './chat/InlineApiKeyForm'
import type { AISettings, ParsedInvoiceData, PriceMode } from '@/types/invoice'

interface AIChatPanelProps {
  open: boolean
  onClose: () => void
  onApplyData: (data: ParsedInvoiceData) => void
  // Mode HT/TTC de la facture à l'écran : transmis à l'IA pour que ses
  // interprétations de montants collent au mode réellement affiché.
  priceMode?: PriceMode
}

// Interface du chat IA : saisie (clavier + micro), en-tête avec badge du
// modèle actif, rendu des messages. Toute la logique de conversation
// (appels IA, historique, ré-essais) vit dans useChatConversation.
export function AIChatPanel({ open, onClose, onApplyData, priceMode }: AIChatPanelProps) {
  const [input, setInput] = useState('')
  const chatInputRef = useRef<ChatInputHandle>(null)

  const {
    messages,
    setMessages,
    isLoading,
    retryCountdown,
    settings,
    updateSettings,
    sendText,
    sendFile,
    retryLast,
  } = useChatConversation(priceMode)

  const handleTranscript = useCallback((text: string) => {
    setInput(text)
  }, [])

  const speech = useSpeechRecognition({ onTranscript: handleTranscript })

  // Focus le textarea quand le panel s'ouvre
  useEffect(() => {
    if (open) {
      setTimeout(() => chatInputRef.current?.focus(), 100)
    }
  }, [open])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return
    if (speech.isListening) speech.stop()
    setInput('')
    await sendText(text)
  }

  const handleApplyPendingData = (msgId: string, editedData: ParsedInvoiceData) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, pendingData: undefined, content: formatAppliedData(editedData) }
        : m
    ))
    onApplyData(editedData)
  }

  const handleCancelPending = (msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, pendingData: undefined, content: '(Non appliqué) ' + m.content }
        : m
    ))
  }

  const handleSubmit = () => {
    sendMessage(input.trim())
  }

  // Handler quand l'utilisateur choisit un fichier (PDF ou image)
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset l'input tout de suite pour permettre de ré-uploader le même fichier après
    event.target.value = ''
    if (!file || isLoading) return
    await sendFile(file)
  }

  const handleRetry = () => {
    const text = retryLast()
    if (text) sendMessage(text)
  }

  const handleApiKeyValidated = (newSettings: AISettings) => {
    updateSettings(newSettings)
  }

  if (!open) return null

  const hasValidKey = !!settings?.apiKey && settings.apiKeyValid !== false

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-blue-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Assistant Facture et Devis</h2>
          {hasValidKey && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap shrink-0"
              title="Modèle IA actif — se change dans Réglages → Mon profil"
            >
              {modelLabel(settings!.model)}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} className="lg:hidden" aria-label="Fermer le chat">
          <X className="size-4" />
        </Button>
      </div>

      {/* Messages */}
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        retryCountdown={retryCountdown}
        priceMode={priceMode}
        onRetry={handleRetry}
        onApplyPendingData={handleApplyPendingData}
        onCancelPending={handleCancelPending}
      />

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        {!hasValidKey ? (
          <InlineApiKeyForm onKeyValidated={handleApiKeyValidated} />
        ) : (
          <ChatInput
            ref={chatInputRef}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onFilePick={handleFileSelected}
            isLoading={isLoading}
            speech={speech}
          />
        )}
      </div>
    </div>
  )
}
