import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { ClientRecord } from '@/types/invoice'
import { storage } from '@/lib/storage'
import { getDefaultClient } from '@/lib/constants'

// Normalise un client charge depuis le storage : garantit que tous les champs
// actuels existent (source de verite = getDefaultClient) meme sur les anciennes donnees.
function normalizeClient(client: Partial<ClientRecord> & { id: string; companyName: string }): ClientRecord {
  return { ...getDefaultClient(), ...client } as ClientRecord
}

const SEED_CLIENTS: Omit<ClientRecord, 'id'>[] = [
  {
    ...getDefaultClient(),
    companyName: 'Université de Lorraine',
    contactName: 'Agence Comptable/Bureau Facturier',
    address: '91 Avenue de la Libération',
    postalCode: '54021',
    city: 'NANCY CEDEX',
  },
  {
    ...getDefaultClient(),
    companyName: 'APAVE Exploitation France',
    address: 'ZI Avenue Gay Lussac BP3',
    postalCode: '33370',
    city: 'ARTIGUES PRES BORDEAUX',
  },
  {
    ...getDefaultClient(),
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
    const result = await storage.saveClients(updated)
    if (!result.ok && result.reason === 'unknown') toast.error('Erreur de sauvegarde client')
  }, [])

  const deleteClient = useCallback(async (id: string) => {
    const updated = clientsRef.current.filter(c => c.id !== id)
    setClients(updated)
    clientsRef.current = updated
    const result = await storage.saveClients(updated)
    if (!result.ok && result.reason === 'unknown') toast.error('Erreur de suppression client')
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
