import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAIParser, type AIParseResult } from '@/hooks/useAIParser'
import { useAIFileParser } from '@/hooks/useAIFileParser'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { formatAppliedData } from '@/lib/formatAppliedData'
import { ChatMessages, type ChatMessage } from './chat/ChatMessages'
import { ChatInput, type ChatInputHandle } from './chat/ChatInput'
import { InlineApiKeyForm } from './chat/InlineApiKeyForm'
import type { AISettings, ParsedInvoiceData } from '@/types/invoice'

interface AIChatPanelProps {
  open: boolean
  onClose: () => void
  onApplyData: (data: ParsedInvoiceData) => void
}

export function AIChatPanel({ open, onClose, onApplyData }: AIChatPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [retryCountdown, setRetryCountdown] = useState(0)
  const retryAttemptRef = useRef(0)
  const lastUserTextRef = useRef('')
  const chatInputRef = useRef<ChatInputHandle>(null)

  const { parse, isLoading: isLoadingText, settings, updateSettings } = useAIParser()
  const { parseFile, isLoading: isLoadingFile } = useAIFileParser()
  const isLoading = isLoadingText || isLoadingFile

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

  // Countdown pour le retry automatique
  useEffect(() => {
    if (retryCountdown <= 0) return
    const timer = setTimeout(() => setRetryCountdown(prev => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [retryCountdown])

  const addMessage = (msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), ...msg }])
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

  // Affiche le résultat de l'IA dans le chat — partagé entre l'envoi texte et l'envoi fichier.
  // enableRetry : si true, déclenche le countdown de réessai automatique pour les erreurs réseau.
  // Pour le fichier on le laisse à false : l'utilisateur doit re-cliquer sur le trombone.
  const displayParseResult = (result: AIParseResult, { enableRetry }: { enableRetry: boolean }) => {
    if (result.data) {
      retryAttemptRef.current = 0
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: formatAppliedData(result.data!),
        pendingData: result.data!,
      }])
    } else if (result.message) {
      retryAttemptRef.current = 0
      addMessage({ role: 'assistant', content: result.message })
    } else if (result.error) {
      const isRetryable = enableRetry && !!result.isRetryable
      addMessage({ role: 'error', content: result.error, isRetryable })
      if (isRetryable) {
        retryAttemptRef.current += 1
        // Délai croissant : 15s → 30s → 60s → 60s...
        const delay = Math.min(60, 15 * Math.pow(2, retryAttemptRef.current - 1))
        setRetryCountdown(delay)
      }
    }
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    if (speech.isListening) speech.stop()
    lastUserTextRef.current = text

    addMessage({ role: 'user', content: text })
    setInput('')

    // Construire l'historique pour Gemini (sans les erreurs)
    const history = messages
      .filter(m => m.role !== 'error')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const result = await parse(text, history)
    displayParseResult(result, { enableRetry: true })
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

    // Affiche un message "utilisateur" décoratif avec le nom du fichier
    addMessage({ role: 'user', content: `📎 ${file.name}` })

    const result = await parseFile(file)
    displayParseResult(result, { enableRetry: false })
  }

  const handleRetry = () => {
    if (lastUserTextRef.current) {
      // Supprimer le dernier message d'erreur
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'error') return prev.slice(0, -1)
        return prev
      })
      setRetryCountdown(0)
      // Relancer — le compteur de tentatives continue pour augmenter le délai
      sendMessage(lastUserTextRef.current)
    }
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
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assistant Facture et Devis</h2>
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
