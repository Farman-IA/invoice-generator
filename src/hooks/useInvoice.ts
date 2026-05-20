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
import { subscribe } from '@/lib/storageChannel'
import { calculateTotals } from '@/lib/calculations'
import { normalizeLineItemPrices, mergeLineItem } from '@/lib/money'
import {
  getDefaultIssuer,
  getDefaultClient,
  getDefaultInvoice,
  createDefaultLineItem,
  generateInvoiceNumber,
  normalizeClientInfo,
  sanitizeLineItemPayload,
} from '@/lib/constants'

// Migre une facture chargee depuis le storage :
//  - garantit que son client possede tous les champs actuels (ex: department,
//    addressLine2 ajoutes apres coup)
//  - arrondit les prix de lignes à 2 décimales pour les BROUILLONS uniquement
//    (incident Université de Lorraine, mai 2026). Une facture FINALISÉE est
//    juridiquement immuable : son total imprimé / envoyé au client doit rester
//    inchangé même si les prix internes ont une décimale parasite. La migration
//    sur finalisée changerait le total recalculé → divergence PDF déjà envoyé
//    vs dashboard CA + import comptable refusé.
function normalizeSavedInvoice(inv: SavedInvoice): SavedInvoice {
  const items = inv.status === 'finalisée'
    ? inv.invoice.items
    : inv.invoice.items.map(normalizeLineItemPrices)
  return {
    ...inv,
    client: normalizeClientInfo(inv.client),
    invoice: { ...inv.invoice, items },
  }
}

// Vrai dès qu'un champ "vivant" est rempli — déclenche l'autosave plus tôt
// que l'ancienne condition (qui exigeait `client.companyName` non vide et faisait
// perdre les lignes tapées avant le client). Cf. incident DEV-2026-007 du 10/05/2026.
function hasInvoiceContent(state: InvoiceState): boolean {
  if (state.client.companyName.trim()) return true
  if (state.client.contactName.trim()) return true
  if (state.invoice.notes.trim()) return true
  if (state.invoice.purchaseOrder.trim()) return true
  if (state.invoice.items.some(i => i.description.trim() || i.unitPrice > 0 || (i.unitPriceTTC ?? 0) > 0)) return true
  return false
}

// Date locale (évite le décalage UTC qui peut fausser les comparaisons de retard)
function getLocalDate(): string {
  return new Date().toLocaleDateString('sv-SE') // format YYYY-MM-DD
}

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

  // Guard pour empêcher les duplications concurrentes
  const duplicatingRef = useRef(false)

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
        const [rawInvoices, counter, issuer] = await Promise.all([
          storage.getInvoices(),
          storage.getCounter(),
          storage.getIssuerProfile(),
        ])

        // Compat retro : ajoute les nouveaux champs client manquants (department, addressLine2, ...)
        const invoices = rawInvoices.map(normalizeSavedInvoice)

        // Calcul auto du statut en_retard
        const today = getLocalDate()
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
      const today = getLocalDate()
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

  // Sauvegarde automatique de la facture en cours (debouncé 500ms).
  // Conditions d'éligibilité :
  // - Pas en chargement initial
  // - Au moins un champ "vivant" rempli (cf. hasInvoiceContent) — change post-incident
  //   du 10/05/2026 où des lignes étaient perdues car saisies avant le nom du client
  // - Si la facture existe déjà avec status 'finalisée', on ne réécrase pas
  const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isLoading) return
    if (!hasInvoiceContent(state)) return
    if (currentInvoiceId && savedInvoices.find(i => i.id === currentInvoiceId)?.status === 'finalisée') return

    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = setTimeout(() => {
      upsertAndPersist('brouillon')
    }, 500)
    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce auto-save : currentInvoiceId et upsertAndPersist lus via refs
  }, [state.client, state.invoice, isLoading])

  // Persister le profil émetteur à chaque modification (debounced) et
  // notifier les autres hooks via un évènement custom (évite le polling)
  const issuerSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isLoading) return
    if (issuerSaveTimeout.current) clearTimeout(issuerSaveTimeout.current)
    issuerSaveTimeout.current = setTimeout(async () => {
      await storage.saveIssuerProfile(state.issuer)
      window.dispatchEvent(new CustomEvent<IssuerProfile>('issuer:updated', { detail: state.issuer }))
    }, 500)
    return () => {
      if (issuerSaveTimeout.current) clearTimeout(issuerSaveTimeout.current)
    }
  }, [state.issuer, isLoading])

  // Sauvegarde de secours synchrone à la fermeture / changement d'onglet.
  // Utilise localStorage.setItem direct (saveInvoicesSync) car l'API async classique
  // peut être interrompue par la fermeture de l'onglet (cause possible du bug
  // "DEV-2026-007 a perdu ses lignes" du 10/05/2026 — appliqué aussi côté factures
  // pour cohérence, même schéma).
  useEffect(() => {
    const flushSync = () => {
      // Issuer profile : on garde l'API async ici, le timeout est court (500ms)
      // et l'issuer change beaucoup moins souvent que les lignes
      if (issuerSaveTimeout.current) {
        clearTimeout(issuerSaveTimeout.current)
        storage.saveIssuerProfile(stateRef.current.issuer)
      }
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
      if (!hasInvoiceContent(stateRef.current)) return

      const now = new Date().toISOString()
      const current = stateRef.current
      const invoiceId = currentInvoiceIdRef.current
      let updated: SavedInvoice[]
      if (invoiceId) {
        updated = savedInvoicesRef.current.map(inv =>
          inv.id === invoiceId
            ? { ...inv, issuer: current.issuer, client: current.client, invoice: current.invoice, updatedAt: now }
            : inv
        )
      } else {
        const newInvoice: SavedInvoice = {
          id: crypto.randomUUID(), issuer: current.issuer, client: current.client,
          invoice: current.invoice, status: 'brouillon', createdAt: now, updatedAt: now,
        }
        updated = [newInvoice, ...savedInvoicesRef.current]
      }
      storage.saveInvoicesSync(updated)
      storage.saveCounterSync(current.counter)
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
  }, [])

  // Synchronisation multi-onglet (cf. Finding #6 de l'audit 2026-05-19).
  // On reçoit des signaux légers — pas le payload — et on relit localStorage
  // pour avoir l'état frais. Le handler 'invoices:updated' :
  //  1. Recharge la liste depuis le storage
  //  2. Applique normalizeSavedInvoice (compat retro + arrondi brouillons)
  //  3. Détecte si la facture en cours d'édition a été supprimée par un autre
  //     onglet → toast d'alerte + reset du formulaire pour ne pas continuer
  //     à éditer un fantôme
  //  4. NE TOUCHE PAS à state.invoice/client (édition en cours) — limite
  //     connue : dernier sauve gagne sur édition simultanée de la même facture
  useEffect(() => {
    const handleInvoicesUpdated = async () => {
      try {
        const fresh = (await storage.getInvoices()).map(normalizeSavedInvoice)
        const currentId = currentInvoiceIdRef.current
        if (currentId && !fresh.find(inv => inv.id === currentId)) {
          // La facture en cours d'édition a disparu (supprimée dans un autre onglet)
          toast.warning('La facture en cours d\'édition a été supprimée dans un autre onglet')
          setCurrentInvoiceId(null)
          currentInvoiceIdRef.current = null
          setIsFinalized(false)
          setState(prev => ({
            ...prev,
            client: getDefaultClient(),
            invoice: getDefaultInvoice(prev.counter),
          }))
        }
        setSavedInvoices(fresh)
        savedInvoicesRef.current = fresh
      } catch (err) {
        console.warn('[useInvoice] reload depuis storageChannel échoué:', err)
      }
    }

    const handleCounterUpdated = async () => {
      try {
        const freshCounter = await storage.getCounter()
        // Update conditionnel pour éviter de retrigger des effets si la valeur
        // n'a pas réellement bougé (ex: signal redondant)
        setState(prev => prev.counter === freshCounter ? prev : { ...prev, counter: freshCounter })
      } catch (err) {
        console.warn('[useInvoice] reload counter échoué:', err)
      }
    }

    const unsubInvoices = subscribe('invoices:updated', handleInvoicesUpdated)
    const unsubCounter = subscribe('invoice-counter:updated', handleCounterUpdated)
    return () => {
      unsubInvoices()
      unsubCounter()
    }
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
      invoice: {
        ...prev.invoice,
        items: [...prev.invoice.items, { ...createDefaultLineItem(), ...safeData }],
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
          item.id === id ? mergeLineItem(item, partial) : item
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

    const result = await storage.saveInvoices(updated)
    await storage.saveCounter(current.counter)
    // Si quota, storage a déjà affiché le toast précis — n'ajoute le toast
    // générique que pour les erreurs inconnues.
    if (!result.ok && result.reason === 'unknown') toast.error('Erreur de sauvegarde')

    return resultId
  }, [])

  // Sauvegarder la facture courante dans la collection
  const saveInvoice = useCallback(async () => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    await upsertAndPersist('brouillon')
    toast.success('Facture sauvegardée')
  }, [upsertAndPersist])

  // Finaliser la facture : statut → finalisée, sauvegarder
  const finalizeInvoice = useCallback(async (): Promise<boolean> => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
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
    if (duplicatingRef.current) return
    duplicatingRef.current = true
    try {
    const original = savedInvoicesRef.current.find(inv => inv.id === id)
    if (!original) { duplicatingRef.current = false; return }

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

    const [saveResult, counterResult] = await Promise.all([
      storage.saveInvoices(updated),
      storage.saveCounter(newCounter),
    ])
    const hasUnknownError =
      (!saveResult.ok && saveResult.reason === 'unknown') ||
      (!counterResult.ok && counterResult.reason === 'unknown')
    const hasQuotaError = !saveResult.ok || !counterResult.ok
    if (hasUnknownError) {
      toast.error('Erreur de sauvegarde')
    } else if (!hasQuotaError) {
      toast.success('Facture dupliquée')
    }
    } finally {
      duplicatingRef.current = false
    }
  }, [])

  // Supprimer une facture
  const deleteInvoice = useCallback(async (id: string) => {
    const updated = savedInvoicesRef.current.filter(inv => inv.id !== id)
    setSavedInvoices(updated)
    savedInvoicesRef.current = updated

    const result = await storage.saveInvoices(updated)
    if (!result.ok) {
      if (result.reason === 'unknown') toast.error('Erreur de sauvegarde')
      return
    }

    if (id === currentInvoiceIdRef.current) {
      setCurrentInvoiceId(null)
      currentInvoiceIdRef.current = null
      setIsFinalized(false)
      // Reset le formulaire pour éviter que l'auto-save recrée la facture
      setState(prev => ({
        ...prev,
        client: getDefaultClient(),
        invoice: getDefaultInvoice(prev.counter),
      }))
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
    const result = await storage.saveInvoices(updated)
    if (!result.ok) {
      if (result.reason === 'unknown') toast.error('Erreur de sauvegarde')
    } else {
      toast.success('Facture marquée comme payée')
    }
  }, [])

  // Annuler le paiement (remettre en attente)
  const markAsUnpaid = useCallback(async (id: string) => {
    const today = getLocalDate()
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

    const result = await storage.saveCounter(newCounter)
    if (!result.ok) {
      if (result.reason === 'unknown') toast.error('Erreur de sauvegarde du compteur')
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
