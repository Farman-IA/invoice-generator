import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { ClientRecord } from '@/types/invoice'
import { storage } from '@/lib/storage'

const EMPTY_CLIENT_FIELDS = {
  department: '',
  contactName: '',
  legalForm: '',
  address: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  siret: '',
  siren: '',
  apeNaf: '',
  tvaNumber: '',
  codeService: '',
}

// Normalise un client chargé depuis le storage pour garantir que
// tous les nouveaux champs existent même sur les anciennes données.
function normalizeClient(client: Partial<ClientRecord> & { id: string; companyName: string }): ClientRecord {
  return { ...EMPTY_CLIENT_FIELDS, ...client } as ClientRecord
}

const SEED_CLIENTS: Omit<ClientRecord, 'id'>[] = [
  {
    ...EMPTY_CLIENT_FIELDS,
    companyName: 'Université de Lorraine',
    contactName: 'Agence Comptable/Bureau Facturier',
    address: '91 Avenue de la Libération',
    postalCode: '54021',
    city: 'NANCY CEDEX',
  },
  {
    ...EMPTY_CLIENT_FIELDS,
    companyName: 'APAVE Exploitation France',
    address: 'ZI Avenue Gay Lussac BP3',
    postalCode: '33370',
    city: 'ARTIGUES PRES BORDEAUX',
  },
  {
    ...EMPTY_CLIENT_FIELDS,
    companyName: 'Garden Golf Metz Technopôle',
    address: '3 rue Félix Savart',
    postalCode: '57070',
    city: 'METZ',
  },
]

export function useClients() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const clientsRef = useRef(clients)
  useEffect(() => { clientsRef.current = clients }, [clients])

  useEffect(() => {
    storage.getClients().then(async (saved) => {
      if (saved.length === 0) {
        // Pré-remplir le carnet avec les clients initiaux
        const seeded = SEED_CLIENTS.map(c => ({ ...c, id: crypto.randomUUID() }))
        await storage.saveClients(seeded)
        setClients(seeded)
      } else {
        // Compat rétro : ajoute les nouveaux champs manquants sur les clients déjà sauvegardés
        const normalized = saved.map(normalizeClient)
        setClients(normalized)
      }
    })
  }, [])

  const addClient = useCallback(async (client: Omit<ClientRecord, 'id'>) => {
    const newClient: ClientRecord = { ...client, id: crypto.randomUUID() }
    const updated = [newClient, ...clientsRef.current]
    setClients(updated)
    clientsRef.current = updated
    await storage.saveClients(updated)
    return newClient
  }, [])

  const updateClient = useCallback(async (id: string, partial: Partial<ClientRecord>) => {
    const updated = clientsRef.current.map(c => c.id === id ? { ...c, ...partial } : c)
    setClients(updated)
    clientsRef.current = updated
    const ok = await storage.saveClients(updated)
    if (!ok) toast.error('Erreur de sauvegarde client')
  }, [])

  const deleteClient = useCallback(async (id: string) => {
    const updated = clientsRef.current.filter(c => c.id !== id)
    setClients(updated)
    clientsRef.current = updated
    const ok = await storage.saveClients(updated)
    if (!ok) toast.error('Erreur de suppression client')
  }, [])

  const findByName = useCallback((query: string): ClientRecord[] => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return clientsRef.current.filter(c =>
      c.companyName.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [])

  const existsByName = useCallback((name: string): boolean => {
    return clientsRef.current.some(c =>
      c.companyName.toLowerCase() === name.toLowerCase()
    )
  }, [])

  return { clients, addClient, updateClient, deleteClient, findByName, existsByName }
}
