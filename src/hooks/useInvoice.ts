import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { IssuerProfile, ClientInfo, InvoiceData, InvoiceState, LineItem } from '@/types/invoice'
import { storage, STORAGE_KEYS } from '@/lib/storage'
import { getDefaultIssuer, getDefaultClient, getDefaultInvoice, createDefaultLineItem } from '@/lib/constants'

function loadInitialState(): { state: InvoiceState; wasRestored: boolean } {
  const savedIssuer = storage.get<IssuerProfile>(STORAGE_KEYS.ISSUER_PROFILE)
  const savedClient = storage.get<ClientInfo>(STORAGE_KEYS.CLIENT_CURRENT)
  const savedInvoice = storage.get<InvoiceData>(STORAGE_KEYS.INVOICE_CURRENT)
  const savedCounter = storage.get<number>(STORAGE_KEYS.INVOICE_COUNTER)

  const hasData = savedIssuer !== null || savedClient !== null || savedInvoice !== null

  const counter = savedCounter ?? 1

  return {
    state: {
      issuer: savedIssuer ?? getDefaultIssuer(),
      client: savedClient ?? getDefaultClient(),
      invoice: savedInvoice ?? getDefaultInvoice(counter),
      counter,
    },
    wasRestored: hasData,
  }
}

export function useInvoice() {
  const [state, setState] = useState<InvoiceState>(() => loadInitialState().state)

  const isInitialMount = useRef(true)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // F1 fix: use ref for latest state to avoid stale closures in beforeunload
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // F7 fix: lightweight check for existing data instead of calling loadInitialState twice
  useEffect(() => {
    const hasData =
      localStorage.getItem(STORAGE_KEYS.ISSUER_PROFILE) !== null ||
      localStorage.getItem(STORAGE_KEYS.CLIENT_CURRENT) !== null ||
      localStorage.getItem(STORAGE_KEYS.INVOICE_CURRENT) !== null
    if (hasData) {
      toast.success('Données restaurées', { duration: 2000 })
    }
  }, [])

  // Save function
  const saveToStorage = useCallback((currentState: InvoiceState) => {
    storage.set(STORAGE_KEYS.ISSUER_PROFILE, currentState.issuer)
    storage.set(STORAGE_KEYS.CLIENT_CURRENT, currentState.client)
    storage.set(STORAGE_KEYS.INVOICE_CURRENT, currentState.invoice)
    storage.set(STORAGE_KEYS.INVOICE_COUNTER, currentState.counter)
  }, [])

  // F8 fix: flush pending save on unmount instead of just clearing
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(state)
      saveTimeoutRef.current = null
    }, 300)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveToStorage(stateRef.current)
      }
    }
  }, [state, saveToStorage])

  // F1 fix: register beforeunload once, use stateRef for fresh data
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveToStorage(stateRef.current)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveToStorage])

  const updateIssuer = useCallback((partial: Partial<IssuerProfile>) => {
    setState(prev => ({ ...prev, issuer: { ...prev.issuer, ...partial } }))
  }, [])

  const updateClient = useCallback((partial: Partial<ClientInfo>) => {
    setState(prev => ({ ...prev, client: { ...prev.client, ...partial } }))
  }, [])

  const updateInvoice = useCallback((partial: Partial<InvoiceData>) => {
    setState(prev => ({ ...prev, invoice: { ...prev.invoice, ...partial } }))
  }, [])

  // F6 fix: use shared createDefaultLineItem factory
  const addLineItem = useCallback(() => {
    setState(prev => ({
      ...prev,
      invoice: {
        ...prev.invoice,
        items: [...prev.invoice.items, createDefaultLineItem()],
      },
    }))
  }, [])

  // F2 fix: guard against removing the last line item
  const removeLineItem = useCallback((id: string) => {
    setState(prev => {
      if (prev.invoice.items.length <= 1) return prev
      return {
        ...prev,
        invoice: {
          ...prev.invoice,
          items: prev.invoice.items.filter(item => item.id !== id),
        },
      }
    })
  }, [])

  const updateLineItem = useCallback((id: string, partial: Partial<LineItem>) => {
    setState(prev => ({
      ...prev,
      invoice: {
        ...prev.invoice,
        items: prev.invoice.items.map(item =>
          item.id === id ? { ...item, ...partial } : item
        ),
      },
    }))
  }, [])

  // F10 fix: removed redundant generateInvoiceNumber call
  const newInvoice = useCallback(() => {
    setState(prev => {
      const newCounter = prev.counter + 1
      return {
        ...prev,
        client: getDefaultClient(),
        invoice: getDefaultInvoice(newCounter),
        counter: newCounter,
      }
    })
    toast.success('Nouvelle facture créée')
  }, [])

  // F10 fix: removed unused invoiceRef
  return {
    state,
    updateIssuer,
    updateClient,
    updateInvoice,
    addLineItem,
    removeLineItem,
    updateLineItem,
    newInvoice,
  }
}
