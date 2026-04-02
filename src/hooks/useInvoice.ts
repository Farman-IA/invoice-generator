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
import { calculateTotals } from '@/lib/calculations'
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

  // Refs pour éviter les closures stale
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const savedInvoicesRef = useRef(savedInvoices)
  useEffect(() => { savedInvoicesRef.current = savedInvoices }, [savedInvoices])

  const currentInvoiceIdRef = useRef(currentInvoiceId)
  useEffect(() => { currentInvoiceIdRef.current = currentInvoiceId }, [currentInvoiceId])

  // Charger les données depuis window.storage au montage
  useEffect(() => {
    async function loadData() {
      try {
        const [invoices, counter, issuer] = await Promise.all([
          storage.getInvoices(),
          storage.getCounter(),
          storage.getIssuerProfile(),
        ])

        // Calcul auto du statut en_retard
        const today = new Date().toISOString().split('T')[0]
        const withLateStatus = invoices.map(inv => {
          if (inv.status === 'finalisée' && inv.paymentStatus === 'en_attente' && inv.invoice.dueDate < today) {
            return { ...inv, paymentStatus: 'en_retard' as const }
          }
          return inv
        })
        const hasLateUpdates = withLateStatus.some((inv, i) => inv.paymentStatus !== invoices[i].paymentStatus)
        if (hasLateUpdates) storage.saveInvoices(withLateStatus)

        setSavedInvoices(withLateStatus)
        savedInvoicesRef.current = withLateStatus

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

  // Recalculer le statut en_retard quand l'utilisateur revient sur l'onglet
  useEffect(() => {
    function checkLatePayments() {
      const today = new Date().toISOString().split('T')[0]
      let hasChanges = false
      const updated = savedInvoicesRef.current.map(inv => {
        if (inv.status === 'finalisée' && inv.paymentStatus === 'en_attente' && inv.invoice.dueDate < today) {
          hasChanges = true
          return { ...inv, paymentStatus: 'en_retard' as const }
        }
        return inv
      })
      if (hasChanges) {
        setSavedInvoices(updated)
        savedInvoicesRef.current = updated
        storage.saveInvoices(updated)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkLatePayments()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  // Sauvegarder le profil émetteur avant de fermer l'onglet
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (issuerSaveTimeout.current) {
        clearTimeout(issuerSaveTimeout.current)
        storage.saveIssuerProfile(stateRef.current.issuer)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Synchroniser le profil émetteur avec storage quand il change ailleurs
  useEffect(() => {
    const interval = setInterval(() => {
      storage.getIssuerProfile().then(issuer => {
        if (issuer) {
          setState(prev => {
            if (JSON.stringify(prev.issuer) !== JSON.stringify(issuer)) {
              return { ...prev, issuer }
            }
            return prev
          })
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const updateIssuer = useCallback((partial: Partial<IssuerProfile>) => {
    setState(prev => ({ ...prev, issuer: { ...prev.issuer, ...partial } }))
  }, [])

  const updateClient = useCallback((partial: Partial<ClientInfo>) => {
    setState(prev => ({ ...prev, client: { ...prev.client, ...partial } }))
  }, [])

  const updateInvoice = useCallback((partial: Partial<InvoiceData>) => {
    setState(prev => ({ ...prev, invoice: { ...prev.invoice, ...partial } }))
  }, [])

  const addLineItem = useCallback((data?: Partial<LineItem>) => {
    setState(prev => ({
      ...prev,
      invoice: {
        ...prev.invoice,
        items: [...prev.invoice.items, { ...createDefaultLineItem(), ...data }],
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

  // Helper : upsert une facture dans la collection et persister
  const upsertAndPersist = useCallback(async (status: 'brouillon' | 'finalisée'): Promise<string> => {
    const now = new Date().toISOString()
    const current = stateRef.current
    const invoiceId = currentInvoiceIdRef.current

    let updated: SavedInvoice[]
    let resultId: string

    if (invoiceId) {
      updated = savedInvoicesRef.current.map(inv =>
        inv.id === invoiceId
          ? {
              ...inv,
              issuer: current.issuer,
              client: current.client,
              invoice: current.invoice,
              status,
              ...(status === 'finalisée' && !inv.paymentStatus ? { paymentStatus: 'en_attente' as const } : {}),
              updatedAt: now,
            }
          : inv
      )
      resultId = invoiceId
    } else {
      resultId = crypto.randomUUID()
      const newInvoice: SavedInvoice = {
        id: resultId,
        issuer: current.issuer,
        client: current.client,
        invoice: current.invoice,
        status,
        ...(status === 'finalisée' ? { paymentStatus: 'en_attente' as const } : {}),
        createdAt: now,
        updatedAt: now,
      }
      updated = [newInvoice, ...savedInvoicesRef.current]
      setCurrentInvoiceId(resultId)
      currentInvoiceIdRef.current = resultId
    }

    setSavedInvoices(updated)
    savedInvoicesRef.current = updated

    const ok = await storage.saveInvoices(updated)
    await storage.saveCounter(current.counter)
    if (!ok) toast.error('Erreur de sauvegarde')

    return resultId
  }, [])

  // Sauvegarder la facture courante dans la collection
  const saveInvoice = useCallback(async () => {
    await upsertAndPersist('brouillon')
    toast.success('Facture sauvegardée')
  }, [upsertAndPersist])

  // Finaliser la facture : statut → finalisée, sauvegarder
  const finalizeInvoice = useCallback(async (): Promise<boolean> => {
    // Valider les champs obligatoires
    if (!stateRef.current.client.companyName?.trim()) {
      toast.error('Veuillez renseigner le client')
      return false
    }

    const items = stateRef.current.invoice.items.filter(
      item => item.description?.trim() && item.unitPrice > 0 && item.quantity > 0
    )
    if (items.length === 0) {
      toast.error('Ajoutez au moins une ligne avec description, prix et quantité > 0')
      return false
    }

    const totals = calculateTotals(items)
    if (totals.totalTTC <= 0) {
      toast.error('Le montant total doit être > 0 €')
      return false
    }

    await upsertAndPersist('finalisée')
    setIsFinalized(true)
    toast.success('Facture finalisée')
    return true
  }, [upsertAndPersist])

  // Charger une facture depuis la collection dans le formulaire
  const loadInvoice = useCallback((id: string) => {
    const invoice = savedInvoicesRef.current.find(inv => inv.id === id)
    if (!invoice) return

    setState(prev => ({
      ...prev,
      issuer: invoice.issuer,
      client: invoice.client,
      invoice: invoice.invoice,
    }))
    setCurrentInvoiceId(id)
    currentInvoiceIdRef.current = id
    setIsFinalized(invoice.status === 'finalisée')
    setView('EDIT')
  }, [])

  // Dupliquer une facture
  const duplicateInvoice = useCallback(async (id: string) => {
    const original = savedInvoicesRef.current.find(inv => inv.id === id)
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

    const updated = [duplicated, ...savedInvoicesRef.current]
    setSavedInvoices(updated)
    savedInvoicesRef.current = updated

    setState(prev => ({
      ...prev,
      issuer: duplicated.issuer,
      client: duplicated.client,
      invoice: duplicated.invoice,
      counter: newCounter,
    }))
    setCurrentInvoiceId(duplicated.id)
    currentInvoiceIdRef.current = duplicated.id
    setIsFinalized(false)
    setView('EDIT')

    const [saveOk, counterOk] = await Promise.all([
      storage.saveInvoices(updated),
      storage.saveCounter(newCounter),
    ])
    if (!saveOk || !counterOk) {
      toast.error('Erreur de sauvegarde')
    } else {
      toast.success('Facture dupliquée')
    }
  }, [])

  // Supprimer une facture
  const deleteInvoice = useCallback(async (id: string) => {
    const updated = savedInvoicesRef.current.filter(inv => inv.id !== id)
    setSavedInvoices(updated)
    savedInvoicesRef.current = updated

    const ok = await storage.saveInvoices(updated)
    if (!ok) {
      toast.error('Erreur de sauvegarde')
      return
    }

    if (id === currentInvoiceIdRef.current) {
      setCurrentInvoiceId(null)
      currentInvoiceIdRef.current = null
      setIsFinalized(false)
    }

    toast.success('Facture supprimée')
  }, [])

  // Marquer une facture comme payée
  const markAsPaid = useCallback(async (id: string) => {
    const updated = savedInvoicesRef.current.map(inv =>
      inv.id === id ? { ...inv, paymentStatus: 'payee' as const, updatedAt: new Date().toISOString() } : inv
    )
    setSavedInvoices(updated)
    savedInvoicesRef.current = updated
    const ok = await storage.saveInvoices(updated)
    if (!ok) {
      toast.error('Erreur de sauvegarde')
    } else {
      toast.success('Facture marquée comme payée')
    }
  }, [])

  // Annuler le paiement (remettre en attente)
  const markAsUnpaid = useCallback(async (id: string) => {
    const today = new Date().toISOString().split('T')[0]
    const updated = savedInvoicesRef.current.map(inv => {
      if (inv.id !== id) return inv
      const isLate = inv.invoice.dueDate < today
      const newStatus: 'en_retard' | 'en_attente' = isLate ? 'en_retard' : 'en_attente'
      return { ...inv, paymentStatus: newStatus, updatedAt: new Date().toISOString() }
    })
    setSavedInvoices(updated)
    savedInvoicesRef.current = updated
    await storage.saveInvoices(updated)
    toast.success('Statut de paiement réinitialisé')
  }, [])

  // Créer une nouvelle facture vierge
  const newInvoice = useCallback(async () => {
    const newCounter = stateRef.current.counter + 1
    setState(prev => ({
      ...prev,
      client: getDefaultClient(),
      invoice: getDefaultInvoice(newCounter),
      counter: newCounter,
    }))
    setCurrentInvoiceId(null)
    currentInvoiceIdRef.current = null
    setIsFinalized(false)
    setView('EDIT')

    const ok = await storage.saveCounter(newCounter)
    if (!ok) {
      toast.error('Erreur de sauvegarde du compteur')
    } else {
      toast.success('Nouvelle facture créée')
    }
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
    markAsPaid,
    markAsUnpaid,
    newInvoice,
  }
}
