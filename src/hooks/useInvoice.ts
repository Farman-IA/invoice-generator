import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type {
  IssuerProfile,
  ClientInfo,
  InvoiceData,
  InvoiceState,
  LineItem,
  SavedInvoice,
  AppView,
} from '@/types/invoice'
import { storage } from '@/lib/storage'
import {
  getDefaultIssuer,
  getDefaultClient,
  getDefaultInvoice,
  createDefaultLineItem,
  generateInvoiceNumber,
} from '@/lib/constants'

export function useInvoice() {
  const [state, setState] = useState<InvoiceState>({
    issuer: getDefaultIssuer(),
    client: getDefaultClient(),
    invoice: getDefaultInvoice(1),
    counter: 1,
  })
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([])
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null)
  const [view, setView] = useState<AppView>('EDIT')
  const [isFinalized, setIsFinalized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Charger les données depuis window.storage au montage
  useEffect(() => {
    async function loadData() {
      try {
        const [invoices, counter, issuer] = await Promise.all([
          storage.getInvoices(),
          storage.getCounter(),
          storage.getIssuerProfile<IssuerProfile>(),
        ])

        setSavedInvoices(invoices)

        setState(prev => ({
          ...prev,
          counter,
          issuer: issuer ?? prev.issuer,
          invoice: getDefaultInvoice(counter),
        }))

        if (invoices.length > 0 || issuer) {
          toast.success('Données restaurées')
        }
      } catch {
        // silently ignore
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Persister le profil émetteur à chaque modification (debounced)
  const issuerSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isLoading) return
    if (issuerSaveTimeout.current) clearTimeout(issuerSaveTimeout.current)
    issuerSaveTimeout.current = setTimeout(() => {
      storage.saveIssuerProfile(state.issuer)
    }, 500)
    return () => {
      if (issuerSaveTimeout.current) clearTimeout(issuerSaveTimeout.current)
    }
  }, [state.issuer, isLoading])

  const updateIssuer = useCallback((partial: Partial<IssuerProfile>) => {
    setState(prev => ({ ...prev, issuer: { ...prev.issuer, ...partial } }))
  }, [])

  const updateClient = useCallback((partial: Partial<ClientInfo>) => {
    setState(prev => ({ ...prev, client: { ...prev.client, ...partial } }))
  }, [])

  const updateInvoice = useCallback((partial: Partial<InvoiceData>) => {
    setState(prev => ({ ...prev, invoice: { ...prev.invoice, ...partial } }))
  }, [])

  const addLineItem = useCallback(() => {
    setState(prev => ({
      ...prev,
      invoice: {
        ...prev.invoice,
        items: [...prev.invoice.items, createDefaultLineItem()],
      },
    }))
  }, [])

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

  // Sauvegarder la facture courante dans la collection
  const saveInvoice = useCallback(async () => {
    const now = new Date().toISOString()
    const current = stateRef.current

    setSavedInvoices(prev => {
      let updated: SavedInvoice[]

      if (currentInvoiceId) {
        // Mise à jour d'une facture existante
        updated = prev.map(inv =>
          inv.id === currentInvoiceId
            ? {
                ...inv,
                issuer: current.issuer,
                client: current.client,
                invoice: current.invoice,
                updatedAt: now,
              }
            : inv
        )
      } else {
        // Nouvelle facture
        const newId = crypto.randomUUID()
        const newInvoice: SavedInvoice = {
          id: newId,
          issuer: current.issuer,
          client: current.client,
          invoice: current.invoice,
          status: 'brouillon',
          createdAt: now,
          updatedAt: now,
        }
        updated = [newInvoice, ...prev]
        setCurrentInvoiceId(newId)
      }

      // Persister immédiatement
      storage.saveInvoices(updated)
      storage.saveCounter(current.counter)
      return updated
    })

    toast.success('Facture sauvegardée')
  }, [currentInvoiceId])

  // Finaliser la facture : statut → finalisée, sauvegarder, retourner true pour déclencher le PDF
  const finalizeInvoice = useCallback(async (): Promise<boolean> => {
    const now = new Date().toISOString()
    const current = stateRef.current

    let invoiceId = currentInvoiceId

    const updated = savedInvoices.map(inv => {
      if (inv.id === invoiceId) {
        return {
          ...inv,
          issuer: current.issuer,
          client: current.client,
          invoice: current.invoice,
          status: 'finalisée' as const,
          updatedAt: now,
        }
      }
      return inv
    })

    // Si la facture n'existe pas encore dans la collection, la créer
    if (!invoiceId) {
      invoiceId = crypto.randomUUID()
      const newInvoice: SavedInvoice = {
        id: invoiceId,
        issuer: current.issuer,
        client: current.client,
        invoice: current.invoice,
        status: 'finalisée',
        createdAt: now,
        updatedAt: now,
      }
      updated.unshift(newInvoice)
      setCurrentInvoiceId(invoiceId)
    }

    setSavedInvoices(updated)
    setIsFinalized(true)
    await storage.saveInvoices(updated)
    await storage.saveCounter(current.counter)
    toast.success('Facture finalisée')
    return true
  }, [currentInvoiceId, savedInvoices])

  // Charger une facture depuis la collection dans le formulaire
  const loadInvoice = useCallback((id: string) => {
    const invoice = savedInvoices.find(inv => inv.id === id)
    if (!invoice) return

    setState(prev => ({
      ...prev,
      issuer: invoice.issuer,
      client: invoice.client,
      invoice: invoice.invoice,
    }))
    setCurrentInvoiceId(id)
    setIsFinalized(invoice.status === 'finalisée')
    setView('EDIT')
  }, [savedInvoices])

  // Dupliquer une facture
  const duplicateInvoice = useCallback(async (id: string) => {
    const original = savedInvoices.find(inv => inv.id === id)
    if (!original) return

    const now = new Date().toISOString()
    const newCounter = stateRef.current.counter + 1
    const newNumber = generateInvoiceNumber(newCounter)

    const today = new Date()
    const dueDate = new Date(today)
    dueDate.setDate(dueDate.getDate() + 30)

    const duplicated: SavedInvoice = {
      id: crypto.randomUUID(),
      issuer: { ...original.issuer },
      client: { ...original.client },
      invoice: {
        ...original.invoice,
        number: newNumber,
        issueDate: today.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        items: original.invoice.items.map(item => ({ ...item, id: crypto.randomUUID() })),
      },
      status: 'brouillon',
      createdAt: now,
      updatedAt: now,
    }

    const updated = [duplicated, ...savedInvoices]
    setSavedInvoices(updated)
    setState(prev => ({ ...prev, counter: newCounter }))
    await storage.saveInvoices(updated)
    await storage.saveCounter(newCounter)

    // Charger la copie dans le formulaire
    setState(prev => ({
      ...prev,
      issuer: duplicated.issuer,
      client: duplicated.client,
      invoice: duplicated.invoice,
      counter: newCounter,
    }))
    setCurrentInvoiceId(duplicated.id)
    setIsFinalized(false)
    setView('EDIT')
    toast.success('Facture dupliquée')
  }, [savedInvoices])

  // Supprimer une facture
  const deleteInvoice = useCallback(async (id: string) => {
    const updated = savedInvoices.filter(inv => inv.id !== id)
    setSavedInvoices(updated)
    await storage.saveInvoices(updated)

    // Si c'est la facture en cours d'édition, réinitialiser
    if (id === currentInvoiceId) {
      setCurrentInvoiceId(null)
      setIsFinalized(false)
    }

    toast.success('Facture supprimée')
  }, [savedInvoices, currentInvoiceId])

  // Créer une nouvelle facture vierge
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
    setCurrentInvoiceId(null)
    setIsFinalized(false)
    setView('EDIT')
    toast.success('Nouvelle facture créée')
  }, [])

  return {
    state,
    savedInvoices,
    currentInvoiceId,
    view,
    isFinalized,
    isLoading,
    setView,
    updateIssuer,
    updateClient,
    updateInvoice,
    addLineItem,
    removeLineItem,
    updateLineItem,
    saveInvoice,
    finalizeInvoice,
    loadInvoice,
    duplicateInvoice,
    deleteInvoice,
    newInvoice,
  }
}
