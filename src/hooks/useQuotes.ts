import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type {
  IssuerProfile,
  ClientInfo,
  QuoteData,
  LineItem,
  SavedQuote,
  QuoteStatus,
} from '@/types/invoice'
import { storage } from '@/lib/storage'
import {
  getDefaultIssuer,
  getDefaultClient,
  getDefaultQuote,
  createDefaultLineItem,
  generateQuoteNumber,
} from '@/lib/constants'

interface QuoteState {
  issuer: IssuerProfile
  client: ClientInfo
  quote: QuoteData
  counter: number
}

export function useQuotes() {
  const [state, setState] = useState<QuoteState>({
    issuer: getDefaultIssuer(),
    client: getDefaultClient(),
    quote: getDefaultQuote(1),
    counter: 1,
  })
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([])
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const savedQuotesRef = useRef(savedQuotes)
  useEffect(() => { savedQuotesRef.current = savedQuotes }, [savedQuotes])

  const currentQuoteIdRef = useRef(currentQuoteId)
  useEffect(() => { currentQuoteIdRef.current = currentQuoteId }, [currentQuoteId])

  // Charger au montage
  useEffect(() => {
    async function load() {
      const [quotes, counter, issuer] = await Promise.all([
        storage.getQuotes(),
        storage.getQuoteCounter(),
        storage.getIssuerProfile(),
      ])
      setSavedQuotes(quotes)
      savedQuotesRef.current = quotes
      setState(prev => ({
        ...prev,
        counter,
        issuer: issuer ?? prev.issuer,
        quote: getDefaultQuote(counter),
      }))
    }
    load()
  }, [])

  const updateIssuer = useCallback((partial: Partial<IssuerProfile>) => {
    setState(prev => ({ ...prev, issuer: { ...prev.issuer, ...partial } }))
  }, [])

  const updateClient = useCallback((partial: Partial<ClientInfo>) => {
    setState(prev => ({ ...prev, client: { ...prev.client, ...partial } }))
  }, [])

  const updateQuote = useCallback((partial: Partial<QuoteData>) => {
    setState(prev => {
      const updated = { ...prev.quote, ...partial }
      // Recalculer validUntil si validityDays ou issueDate change
      if (partial.validityDays !== undefined || partial.issueDate !== undefined) {
        const base = new Date(updated.issueDate)
        base.setDate(base.getDate() + updated.validityDays)
        updated.validUntil = base.toISOString().split('T')[0]
      }
      return { ...prev, quote: updated }
    })
  }, [])

  const addLineItem = useCallback((data?: Partial<LineItem>) => {
    setState(prev => ({
      ...prev,
      quote: {
        ...prev.quote,
        items: [...prev.quote.items, { ...createDefaultLineItem(), ...data }],
      },
    }))
  }, [])

  const removeLineItem = useCallback((id: string) => {
    setState(prev => {
      if (prev.quote.items.length <= 1) return prev
      return {
        ...prev,
        quote: { ...prev.quote, items: prev.quote.items.filter(item => item.id !== id) },
      }
    })
  }, [])

  const updateLineItem = useCallback((id: string, partial: Partial<LineItem>) => {
    setState(prev => ({
      ...prev,
      quote: {
        ...prev.quote,
        items: prev.quote.items.map(item => item.id === id ? { ...item, ...partial } : item),
      },
    }))
  }, [])

  // Sauvegarder le devis courant
  const saveQuote = useCallback(async () => {
    const now = new Date().toISOString()
    const current = stateRef.current
    const quoteId = currentQuoteIdRef.current

    let updated: SavedQuote[]
    if (quoteId) {
      updated = savedQuotesRef.current.map(q =>
        q.id === quoteId
          ? { ...q, issuer: current.issuer, client: current.client, quote: current.quote, updatedAt: now }
          : q
      )
    } else {
      const newId = crypto.randomUUID()
      updated = [{
        id: newId,
        issuer: current.issuer,
        client: current.client,
        quote: current.quote,
        status: 'brouillon',
        createdAt: now,
        updatedAt: now,
      }, ...savedQuotesRef.current]
      setCurrentQuoteId(newId)
      currentQuoteIdRef.current = newId
    }

    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    await storage.saveQuotes(updated)
    await storage.saveQuoteCounter(current.counter)
    toast.success('Devis sauvegardé')
  }, [])

  // Charger un devis
  const loadQuote = useCallback((id: string) => {
    const quote = savedQuotesRef.current.find(q => q.id === id)
    if (!quote) return
    setState(prev => ({
      ...prev,
      issuer: quote.issuer,
      client: quote.client,
      quote: quote.quote,
    }))
    setCurrentQuoteId(id)
    currentQuoteIdRef.current = id
    setIsLocked(quote.status !== 'brouillon')
  }, [])

  // Changer le statut d'un devis
  const updateQuoteStatus = useCallback(async (id: string, status: QuoteStatus) => {
    const updated = savedQuotesRef.current.map(q =>
      q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q
    )
    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    await storage.saveQuotes(updated)

    // Mettre à jour le lock si c'est le devis courant
    if (id === currentQuoteIdRef.current) {
      setIsLocked(status !== 'brouillon')
    }

    const labels: Record<QuoteStatus, string> = {
      brouillon: 'Devis remis en brouillon',
      envoyé: 'Devis marqué comme envoyé',
      accepté: 'Devis accepté',
      refusé: 'Devis refusé',
    }
    toast.success(labels[status])
  }, [])

  // Dupliquer un devis
  const duplicateQuote = useCallback(async (id: string) => {
    const original = savedQuotesRef.current.find(q => q.id === id)
    if (!original) return

    const now = new Date().toISOString()
    const newCounter = stateRef.current.counter + 1

    const duplicated: SavedQuote = {
      id: crypto.randomUUID(),
      issuer: { ...original.issuer },
      client: { ...original.client },
      quote: {
        ...original.quote,
        number: generateQuoteNumber(newCounter),
        issueDate: new Date().toISOString().split('T')[0],
        items: original.quote.items.map(item => ({ ...item, id: crypto.randomUUID() })),
      },
      status: 'brouillon',
      createdAt: now,
      updatedAt: now,
    }

    const updated = [duplicated, ...savedQuotesRef.current]
    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    setState(prev => ({
      ...prev,
      issuer: duplicated.issuer,
      client: duplicated.client,
      quote: duplicated.quote,
      counter: newCounter,
    }))
    setCurrentQuoteId(duplicated.id)
    currentQuoteIdRef.current = duplicated.id
    setIsLocked(false)

    await storage.saveQuotes(updated)
    await storage.saveQuoteCounter(newCounter)
    toast.success('Devis dupliqué')
  }, [])

  // Supprimer un devis
  const deleteQuote = useCallback(async (id: string) => {
    const updated = savedQuotesRef.current.filter(q => q.id !== id)
    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    await storage.saveQuotes(updated)

    if (id === currentQuoteIdRef.current) {
      setCurrentQuoteId(null)
      currentQuoteIdRef.current = null
      setIsLocked(false)
    }
    toast.success('Devis supprimé')
  }, [])

  // Nouveau devis vierge
  const newQuote = useCallback(async () => {
    const newCounter = stateRef.current.counter + 1
    const issuer = await storage.getIssuerProfile()
    setState(prev => ({
      ...prev,
      issuer: issuer ?? prev.issuer,
      client: getDefaultClient(),
      quote: getDefaultQuote(newCounter),
      counter: newCounter,
    }))
    setCurrentQuoteId(null)
    currentQuoteIdRef.current = null
    setIsLocked(false)
    await storage.saveQuoteCounter(newCounter)
  }, [])

  // Lier un devis à une facture créée
  const linkToInvoice = useCallback(async (quoteId: string, invoiceId: string) => {
    const updated = savedQuotesRef.current.map(q =>
      q.id === quoteId ? { ...q, linkedInvoiceId: invoiceId, updatedAt: new Date().toISOString() } : q
    )
    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    await storage.saveQuotes(updated)
  }, [])

  return {
    state,
    savedQuotes,
    currentQuoteId,
    isLocked,
    updateIssuer,
    updateClient,
    updateQuote,
    addLineItem,
    removeLineItem,
    updateLineItem,
    saveQuote,
    loadQuote,
    updateQuoteStatus,
    duplicateQuote,
    deleteQuote,
    newQuote,
    linkToInvoice,
  }
}
