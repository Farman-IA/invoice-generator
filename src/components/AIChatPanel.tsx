import { useState, useRef, useEffect } from 'react'
import { Send, Mic, MicOff, X, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAIParser } from '@/hooks/useAIParser'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import type { ParsedInvoiceData } from '@/types/invoice'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AIChatPanelProps {
  open: boolean
  onClose: () => void
  onApplyData: (data: ParsedInvoiceData) => void
}

function formatAppliedData(data: ParsedInvoiceData): string {
  const lines: string[] = []
  if (data.clientName) lines.push(`Client : ${data.clientName}`)
  if (data.purchaseOrder) lines.push(`Bon de commande : ${data.purchaseOrder}`)
  if (data.items?.length) {
    data.items.forEach(item => {
      lines.push(`+ ${item.quantity} × ${item.description} — ${item.unitPrice.toFixed(2)}€ HT — TVA ${item.vatRate}%`)
    })
  }
  if (data.notes) lines.push(`Notes : ${data.notes}`)
  return lines.join('\n')
}

export function AIChatPanel({ open, onClose, onApplyData }: AIChatPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const { parse, isLoading, error, settings } = useAIParser()
  const speech = useSpeechRecognition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (speech.transcript) {
      setInput(speech.transcript)
    }
  }, [speech.transcript])

  const handleSubmit = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    if (speech.isListening) speech.stop()

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    const result = await parse(text)

    if (result) {
      const summary = formatAppliedData(result)
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: summary,
      }
      setMessages(prev => [...prev, assistantMsg])
      onApplyData(result)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const toggleMic = () => {
    if (speech.isListening) {
      speech.stop()
    } else {
      speech.start()
    }
  }

  if (!open) return null

  const hasApiKey = !!settings?.apiKey

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assistant IA</h2>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} className="lg:hidden">
          <X className="size-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="size-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Décrivez votre facture en français
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Ex : « Facture pour l'Université de Lorraine, 3 repas complets à 30€ »
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Analyse en cours...
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        {!hasApiKey ? (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400 py-2">
            Configurez votre clé API Google dans Réglages → Mon profil
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Décrivez votre facture..."
              rows={1}
              className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 max-h-24"
            />
            {speech.isSupported && (
              <Button
                variant={speech.isListening ? 'default' : 'outline'}
                size="icon-sm"
                onClick={toggleMic}
                className={speech.isListening ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
              >
                {speech.isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Button size="icon-sm" onClick={handleSubmit} disabled={!input.trim() || isLoading}>
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
