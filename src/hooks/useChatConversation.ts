import { useState, useEffect, useRef } from 'react'
import { useAIParser, type AIParseResult } from '@/hooks/useAIParser'
import { useAIFileParser } from '@/hooks/useAIFileParser'
import { formatAppliedData } from '@/lib/formatAppliedData'
import type { ChatTurn } from '@/lib/aiClient'
import type { ChatMessage } from '@/components/chat/ChatMessages'
import type { PriceMode } from '@/types/invoice'

// Cerveau du chat IA : détient la liste des messages, appelle l'IA (texte et
// fichier), et gère le ré-essai automatique après erreur réseau.
// Extrait d'AIChatPanel pour respecter la règle projet "pas de fichier de
// plus de 200 lignes" — le panel ne garde que l'interface (saisie, micro, rendu).
export function useChatConversation(priceMode?: PriceMode) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [retryCountdown, setRetryCountdown] = useState(0)
  const retryAttemptRef = useRef(0)
  const lastUserTextRef = useRef('')

  const { parse, isLoading: isLoadingText, settings, updateSettings } = useAIParser()
  const { parseFile, isLoading: isLoadingFile } = useAIFileParser()
  const isLoading = isLoadingText || isLoadingFile

  // Compte à rebours avant le ré-essai automatique (erreurs réseau/quota)
  useEffect(() => {
    if (retryCountdown <= 0) return
    const timer = setTimeout(() => setRetryCountdown(prev => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [retryCountdown])

  const addMessage = (msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), ...msg }])
  }

  // Affiche le résultat de l'IA dans le chat — partagé entre texte et fichier.
  // enableRetry : déclenche le countdown de réessai automatique pour les
  // erreurs réseau (false pour les fichiers : l'utilisateur re-clique).
  const displayParseResult = (result: AIParseResult, { enableRetry }: { enableRetry: boolean }) => {
    const parsedData = result.data
    if (parsedData) {
      retryAttemptRef.current = 0
      const summary = formatAppliedData(parsedData)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        // content sert d'historique à l'IA au tour suivant : il doit garder
        // la trace de sa question ET des données déjà extraites, sinon elle
        // "oublie" ce qu'elle a proposé quand l'utilisateur lui répond.
        content: result.message ? `${result.message}\n${summary}` : summary,
        aiNote: result.message ?? undefined,
        pendingData: parsedData,
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

  const sendText = async (text: string) => {
    lastUserTextRef.current = text
    addMessage({ role: 'user', content: text })
    // Historique transmis à l'IA comme vrais tours de conversation (sans les erreurs)
    const history: ChatTurn[] = messages
      .filter(m => m.role !== 'error')
      .map(m => ({ role: m.role as ChatTurn['role'], content: m.content }))
    const result = await parse(text, history, priceMode)
    displayParseResult(result, { enableRetry: true })
  }

  const sendFile = async (file: File) => {
    // Message "utilisateur" décoratif avec le nom du fichier
    addMessage({ role: 'user', content: `📎 ${file.name}` })
    const result = await parseFile(file, priceMode)
    displayParseResult(result, { enableRetry: false })
  }

  // Retire le dernier message d'erreur et renvoie le texte à rejouer
  // (null si rien à rejouer). L'appelant relance sendText.
  const retryLast = (): string | null => {
    if (!lastUserTextRef.current) return null
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'error') return prev.slice(0, -1)
      return prev
    })
    setRetryCountdown(0)
    return lastUserTextRef.current
  }

  return {
    messages,
    setMessages,
    isLoading,
    retryCountdown,
    settings,
    updateSettings,
    sendText,
    sendFile,
    retryLast,
  }
}
