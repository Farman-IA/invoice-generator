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
import { subscribe } from '@/lib/storageChannel'
import { normalizeLineItemPrices, mergeLineItem } from '@/lib/money'
import {
  getDefaultIssuer,
  getDefaultClient,
  getDefaultQuote,
  createDefaultLineItem,
  generateQuoteNumber,
  normalizeClientInfo,
  sanitizeLineItemPayload,
} from '@/lib/constants'

// Migre un devis charge depuis le storage :
//  - garantit que son client possede tous les champs actuels (department,
//    addressLine2 ajoutes apres coup)
//  - arrondit les prix de lignes à 2 décimales UNIQUEMENT pour les brouillons.
//    Un devis envoyé / accepté / refusé est juridiquement engageant : son
//    total ne doit pas bouger après simple lecture (le client a vu le PDF).
function normalizeSavedQuote(qt: SavedQuote): SavedQuote {
  const items = qt.status === 'brouillon'
    ? qt.quote.items.map(normalizeLineItemPrices)
    : qt.quote.items
  return {
    ...qt,
    client: normalizeClientInfo(qt.client),
    quote: { ...qt.quote, items },
  }
}

// Vrai dès qu'un champ "vivant" est rempli — déclenche l'autosave plus tôt
// que l'ancienne condition (qui exigeait `client.companyName` non vide et faisait
// perdre les lignes tapées avant le client).
function hasQuoteContent(state: QuoteState): boolean {
  if (state.client.companyName.trim()) return true
  if (state.client.contactName.trim()) return true
  if (state.quote.notes.trim()) return true
  if (state.quote.purchaseOrder.trim()) return true
  if (state.quote.items.some(i => i.description.trim() || i.unitPrice > 0 || (i.unitPriceTTC ?? 0) > 0)) return true
  return false
}

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
  const [isLoading, setIsLoading] = useState(true)

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const savedQuotesRef = useRef(savedQuotes)
  useEffect(() => { savedQuotesRef.current = savedQuotes }, [savedQuotes])

  const currentQuoteIdRef = useRef(currentQuoteId)
  useEffect(() => { currentQuoteIdRef.current = currentQuoteId }, [currentQuoteId])

  // Charger au montage
  useEffect(() => {
    async function load() {
      const [rawQuotes, counter, issuer] = await Promise.all([
        storage.getQuotes(),
        storage.getQuoteCounter(),
        storage.getIssuerProfile(),
      ])
      // Compat retro : ajoute les nouveaux champs client manquants
      const quotes = rawQuotes.map(normalizeSavedQuote)
      setSavedQuotes(quotes)
      savedQuotesRef.current = quotes
      setState(prev => ({
        ...prev,
        counter,
        issuer: issuer ?? prev.issuer,
        quote: getDefaultQuote(counter),
      }))
      setIsLoading(false)
    }
    load()
  }, [])

  // Synchroniser le profil émetteur quand useInvoice (la source de vérité) le persiste.
  // Remplace l'ancien polling 1s — voir useInvoice.ts pour l'émetteur de l'évènement.
  useEffect(() => {
    function handleIssuerUpdated(e: Event) {
      const issuer = (e as CustomEvent<IssuerProfile>).detail
      if (!issuer) return
      setState(prev => {
        if (JSON.stringify(prev.issuer) === JSON.stringify(issuer)) return prev
        return { ...prev, issuer }
      })
    }
    window.addEventListener('issuer:updated', handleIssuerUpdated)
    return () => window.removeEventListener('issuer:updated', handleIssuerUpdated)
  }, [])

  const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Garde défensive par whitelist : on ne retient des données entrantes que
    // les clés effectivement listées dans LINE_ITEM_ALLOWED_KEYS (constants.ts).
    // Robuste face à TOUS les types d'events (SyntheticEvent React, Event natif,
    // KeyboardEvent, DragEvent), pas seulement aux SyntheticEvent. Cf. incident
    // 2026-05-20 où onClick={addLineItem} étalait un SyntheticEvent (target =
    // HTMLButtonElement, view = Window) dans le LineItem et faisait planter
    // JSON.stringify sur la référence circulaire React Fiber.
    const safeData = sanitizeLineItemPayload(data)
    setState(prev => ({
      ...prev,
      quote: {
        ...prev.quote,
        items: [...prev.quote.items, { ...createDefaultLineItem(), ...safeData }],
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
        items: prev.quote.items.map(item => item.id === id ? mergeLineItem(item, partial) : item),
      },
    }))
  }, [])

  // Sauvegarde interne (sans toast, utilisée par l'auto-save)
  const saveQuoteInternal = useCallback(async () => {
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
  }, [])

  // Auto-save debouncé (500ms) pour les devis en cours d'édition.
  // Conditions d'éligibilité :
  // - Pas en chargement initial
  // - Au moins un champ "vivant" rempli (cf. hasQuoteContent) — change post-incident
  //   du 10/05/2026 où des lignes étaient perdues car saisies avant le nom du client
  // - Si le devis existe déjà avec un statut autre que 'brouillon', on n'écrase pas
  useEffect(() => {
    if (isLoading) return
    if (!hasQuoteContent(state)) return
    if (currentQuoteId && savedQuotes.find(q => q.id === currentQuoteId)?.status !== 'brouillon') return

    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = setTimeout(() => {
      saveQuoteInternal()
    }, 500)
    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce auto-save : currentQuoteId et savedQuotes lus via refs
  }, [state.client, state.quote, isLoading, saveQuoteInternal])

  // Construit l'array SavedQuote à persister depuis l'état courant
  // Factorisé entre beforeunload et visibilitychange pour garantir un comportement identique
  const buildPersistedQuotes = useCallback((): { quotes: SavedQuote[]; counter: number } | null => {
    if (!hasQuoteContent(stateRef.current)) return null
    const now = new Date().toISOString()
    const current = stateRef.current
    const quoteId = currentQuoteIdRef.current
    let quotes: SavedQuote[]
    if (quoteId) {
      quotes = savedQuotesRef.current.map(q =>
        q.id === quoteId
          ? { ...q, issuer: current.issuer, client: current.client, quote: current.quote, updatedAt: now }
          : q
      )
    } else {
      const newQuote: SavedQuote = {
        id: crypto.randomUUID(), issuer: current.issuer, client: current.client,
        quote: current.quote, status: 'brouillon', createdAt: now, updatedAt: now,
      }
      quotes = [newQuote, ...savedQuotesRef.current]
    }
    return { quotes, counter: current.counter }
  }, [])

  // Sauvegarde de secours synchrone à la fermeture / changement d'onglet.
  // Utilise localStorage.setItem direct (saveQuotesSync) car l'API async classique
  // peut être interrompue par la fermeture de l'onglet (cause possible du bug
  // "DEV-2026-007 a perdu ses lignes" du 10/05/2026).
  useEffect(() => {
    const flushSync = () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
      const payload = buildPersistedQuotes()
      if (!payload) return
      storage.saveQuotesSync(payload.quotes)
      storage.saveQuoteCounterSync(payload.counter)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSync()
    }
    window.addEventListener('beforeunload', flushSync)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flushSync)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [buildPersistedQuotes])

  // Synchronisation multi-onglet (cf. Finding #6 de l'audit 2026-05-19).
  // Symétrique à useInvoice : on reçoit un signal léger, on relit storage,
  // on détecte la suppression du devis en cours d'édition.
  useEffect(() => {
    const handleQuotesUpdated = async () => {
      try {
        const fresh = (await storage.getQuotes()).map(normalizeSavedQuote)
        const currentId = currentQuoteIdRef.current
        if (currentId && !fresh.find(q => q.id === currentId)) {
          toast.warning('Le devis en cours d\'édition a été supprimé dans un autre onglet')
          setCurrentQuoteId(null)
          currentQuoteIdRef.current = null
          setIsLocked(false)
          setState(prev => ({
            ...prev,
            client: getDefaultClient(),
            quote: getDefaultQuote(prev.counter),
          }))
        }
        setSavedQuotes(fresh)
        savedQuotesRef.current = fresh
      } catch (err) {
        console.warn('[useQuotes] reload depuis storageChannel échoué:', err)
      }
    }

    const handleCounterUpdated = async () => {
      try {
        const freshCounter = await storage.getQuoteCounter()
        setState(prev => prev.counter === freshCounter ? prev : { ...prev, counter: freshCounter })
      } catch (err) {
        console.warn('[useQuotes] reload counter échoué:', err)
      }
    }

    const unsubQuotes = subscribe('quotes:updated', handleQuotesUpdated)
    const unsubCounter = subscribe('quote-counter:updated', handleCounterUpdated)
    return () => {
      unsubQuotes()
      unsubCounter()
    }
  }, [])

  // Sauvegarder le devis courant (avec toast)
  const saveQuote = useCallback(async () => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    await saveQuoteInternal()
    toast.success('Devis sauvegardé')
  }, [saveQuoteInternal])

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
    const result = await storage.saveQuotes(updated)

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
    if (!result.ok) {
      if (result.reason === 'unknown') toast.error('Erreur de sauvegarde')
    } else {
      toast.success(labels[status])
    }
  }, [])

  // Dupliquer un devis
  const duplicateQuote = useCallback(async (id: string) => {
    const original = savedQuotesRef.current.find(q => q.id === id)
    if (!original) return

    const now = new Date().toISOString()
    const newCounter = stateRef.current.counter + 1

    const newIssueDate = new Date().toISOString().split('T')[0]
    const newValidUntil = new Date()
    newValidUntil.setDate(newValidUntil.getDate() + 30)

    const duplicated: SavedQuote = {
      id: crypto.randomUUID(),
      issuer: { ...original.issuer },
      client: { ...original.client },
      quote: {
        ...original.quote,
        number: generateQuoteNumber(newCounter),
        issueDate: newIssueDate,
        validityDays: 30,
        validUntil: newValidUntil.toISOString().split('T')[0],
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

    const [savResult, counterResult] = await Promise.all([
      storage.saveQuotes(updated),
      storage.saveQuoteCounter(newCounter),
    ])
    const hasUnknownError =
      (!savResult.ok && savResult.reason === 'unknown') ||
      (!counterResult.ok && counterResult.reason === 'unknown')
    const hasAnyError = !savResult.ok || !counterResult.ok
    if (hasUnknownError) {
      toast.error('Erreur de sauvegarde')
    } else if (!hasAnyError) {
      toast.success('Devis dupliqué')
    }
  }, [])

  // Supprimer un devis
  const deleteQuote = useCallback(async (id: string) => {
    const updated = savedQuotesRef.current.filter(q => q.id !== id)
    setSavedQuotes(updated)
    savedQuotesRef.current = updated
    const result = await storage.saveQuotes(updated)
    if (!result.ok) {
      if (result.reason === 'unknown') toast.error('Erreur de sauvegarde')
      return
    }

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
    const result = await storage.saveQuotes(updated)
    if (!result.ok) {
      console.error('Erreur de liaison devis → facture', result.reason)
    }
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
