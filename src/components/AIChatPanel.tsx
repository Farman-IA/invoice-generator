import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Mic, MicOff, X, Sparkles, Loader2, RotateCcw, Check, Pencil, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAIParser, validateApiKey } from '@/hooks/useAIParser'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { storage } from '@/lib/storage'
import type { ParsedInvoiceData } from '@/types/invoice'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  isRetryable?: boolean
  pendingData?: ParsedInvoiceData
}

interface AIChatPanelProps {
  open: boolean
  onClose: () => void
  onApplyData: (data: ParsedInvoiceData) => void
}

function formatAppliedData(data: ParsedInvoiceData): string {
  const lines: string[] = []
  if (data.clientName) {
    let clientLine = `Client : ${data.clientName}`
    if (data.clientAddress) clientLine += `\n${data.clientAddress}`
    if (data.clientPostalCode || data.clientCity) clientLine += `\n${[data.clientPostalCode, data.clientCity].filter(Boolean).join(' ')}`
    if (data.contactName) clientLine += `\nContact : ${data.contactName}`
    lines.push(clientLine)
  }
  if (data.purchaseOrder) lines.push(`Bon de commande : ${data.purchaseOrder}`)
  if (data.items?.length) {
    data.items.forEach(item => {
      lines.push(`+ ${item.quantity} × ${item.description} — ${item.unitPrice.toFixed(2)}€ HT — TVA ${item.vatRate}%`)
    })
  }
  if (data.deposit != null && data.deposit > 0) lines.push(`Acompte à déduire : ${data.deposit.toFixed(2)}€`)
  if (data.notes) lines.push(`Notes : ${data.notes}`)
  return lines.join('\n')
}

// Composant pour éditer les données parsées avant de les appliquer
function DataPreview({ data, onApply, onCancel }: {
  data: ParsedInvoiceData
  onApply: (edited: ParsedInvoiceData) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ParsedInvoiceData>(data)

  const updateField = (field: keyof ParsedInvoiceData, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    setDraft(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm space-y-2 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium text-xs">
        <Pencil className="size-3" />
        Vérifiez avant d'appliquer
      </div>

      {/* Client */}
      {draft.clientName !== undefined && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Client</label>
          <input
            value={draft.clientName}
            onChange={e => updateField('clientName', e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
            placeholder="Nom du client"
          />
        </div>
      )}

      {/* Adresse sur une ligne */}
      <div className="grid grid-cols-3 gap-1">
        {draft.clientAddress !== undefined && (
          <div className="col-span-3">
            <input
              value={draft.clientAddress ?? ''}
              onChange={e => updateField('clientAddress', e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Adresse"
            />
          </div>
        )}
        {(draft.clientPostalCode !== undefined || draft.clientCity !== undefined) && (
          <>
            <input
              value={draft.clientPostalCode ?? ''}
              onChange={e => updateField('clientPostalCode', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Code postal"
            />
            <input
              value={draft.clientCity ?? ''}
              onChange={e => updateField('clientCity', e.target.value)}
              className="col-span-2 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Ville"
            />
          </>
        )}
      </div>

      {draft.contactName !== undefined && (
        <input
          value={draft.contactName ?? ''}
          onChange={e => updateField('contactName', e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          placeholder="Contact"
        />
      )}

      {/* Articles */}
      {draft.items?.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Articles</label>
          {draft.items.map((item, i) => (
            <div key={i} className="flex gap-1">
              <input
                type="number"
                value={item.quantity}
                onChange={e => updateItem(i, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                className="w-12 px-1 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-center"
                min="1"
              />
              <input
                value={item.description}
                onChange={e => updateItem(i, 'description', e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="number"
                value={Math.round(item.unitPrice * 100) / 100}
                onChange={e => updateItem(i, 'unitPrice', Math.max(0, Number(e.target.value) || 0))}
                className="w-16 px-1 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                step="0.01"
              />
              <span className="text-xs text-gray-400 self-center">€</span>
            </div>
          ))}
        </div>
      )}

      {/* Boutons */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onApply(draft)} className="flex-1 h-7 text-xs">
          <Check className="size-3 mr-1" />
          Appliquer
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
          Annuler
        </Button>
      </div>
    </div>
  )
}

export function AIChatPanel({ open, onClose, onApplyData }: AIChatPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [retryCountdown, setRetryCountdown] = useState(0)
  const retryAttemptRef = useRef(0)
  const { parse, isLoading, settings, updateSettings } = useAIParser()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastUserTextRef = useRef('')

  const handleTranscript = useCallback((text: string) => {
    setInput(text)
  }, [])

  const speech = useSpeechRecognition({ onTranscript: handleTranscript })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Auto-resize du textarea (fonctionne aussi en dictée vocale)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

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
    // Remplacer le message "pending" par un message "applied"
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

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    if (speech.isListening) speech.stop()
    lastUserTextRef.current = text

    addMessage({ role: 'user', content: text })
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // Construire l'historique pour Gemini (sans les erreurs)
    const history = messages
      .filter(m => m.role !== 'error')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const result = await parse(text, history)

    if (result.data) {
      retryAttemptRef.current = 0
      // Afficher en mode prévisualisation — pas d'application immédiate
      const msgId = crypto.randomUUID()
      setMessages(prev => [...prev, {
        id: msgId,
        role: 'assistant',
        content: formatAppliedData(result.data!),
        pendingData: result.data!,
      }])
    } else if (result.message) {
      retryAttemptRef.current = 0
      addMessage({ role: 'assistant', content: result.message })
    } else if (result.error) {
      addMessage({ role: 'error', content: result.error, isRetryable: result.isRetryable })
      if (result.isRetryable) {
        retryAttemptRef.current += 1
        // Délai croissant : 15s → 30s → 60s → 60s...
        const delay = Math.min(60, 15 * Math.pow(2, retryAttemptRef.current - 1))
        setRetryCountdown(delay)
      }
    }
  }

  const handleSubmit = () => {
    sendMessage(input.trim())
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

  const [inlineKey, setInlineKey] = useState('')
  const [inlineShowKey, setInlineShowKey] = useState(false)
  const [inlineValidating, setInlineValidating] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const handleInlineKeySave = async () => {
    const trimmed = inlineKey.trim()
    if (!trimmed) return
    setInlineValidating(true)
    setInlineError(null)
    const result = await validateApiKey(trimmed)
    setInlineValidating(false)
    if (result.isValid) {
      const current = await storage.getAISettings()
      const newSettings = {
        apiKey: trimmed,
        apiKeyValid: true,
        model: current?.model ?? 'gemini-2.5-flash' as const,
        priceMode: current?.priceMode ?? 'ht' as const,
      }
      await storage.saveAISettings(newSettings)
      // Refresh les settings du parser
      updateSettings(newSettings)
      setInlineKey('')
      setInlineError(null)
    } else {
      setInlineError(result.error ?? 'Clé invalide.')
    }
  }

  if (!open) return null

  const hasValidKey = !!settings?.apiKey && settings.apiKeyValid !== false
  const lastMessage = messages[messages.length - 1]
  const showRetryButton = lastMessage?.role === 'error' && lastMessage.isRetryable

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
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${messages.length === 0 ? 'flex items-center justify-center' : ''}`} role="log" aria-live="polite" aria-label="Messages de l'assistant IA">
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
                  <div className="max-w-[95%]">
                    <DataPreview
                      data={msg.pendingData}
                      onApply={(edited) => handleApplyPendingData(msg.id, edited)}
                      onCancel={() => handleCancelPending(msg.id)}
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
                  onClick={handleRetry}
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

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3">
        {!hasValidKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <KeyRound className="size-3.5" />
              <p className="text-xs font-medium">Clé API Google requise</p>
            </div>
            <div className="relative">
              <input
                type={inlineShowKey ? 'text' : 'password'}
                value={inlineKey}
                onChange={e => { setInlineKey(e.target.value); setInlineError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleInlineKeySave() }}
                placeholder="Collez votre clé API (AIza...)"
                disabled={inlineValidating}
                className="w-full px-2 py-1.5 pr-8 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
              />
              <button
                type="button"
                onClick={() => setInlineShowKey(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {inlineShowKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {inlineError && <p className="text-[11px] text-red-500">{inlineError}</p>}
            <Button
              size="sm"
              onClick={handleInlineKeySave}
              disabled={!inlineKey.trim() || inlineValidating}
              className="w-full h-7 text-xs"
            >
              {inlineValidating ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Check className="size-3 mr-1" />}
              {inlineValidating ? 'Vérification...' : 'Valider la clé'}
            </Button>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
              La clé est stockée uniquement dans votre navigateur
            </p>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Décrivez votre facture..."
              rows={2}
              aria-label="Décrivez votre facture"
              className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 overflow-y-auto"
              style={{ maxHeight: 160 }}
            />
            {speech.isSupported && (
              <Button
                variant={speech.isListening ? 'default' : 'outline'}
                size="icon-sm"
                onClick={toggleMic}
                className={speech.isListening ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
                aria-label={speech.isListening ? 'Arrêter la dictée' : 'Activer la dictée vocale'}
              >
                {speech.isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Button size="icon-sm" onClick={handleSubmit} disabled={!input.trim() || isLoading} aria-label="Envoyer">
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
