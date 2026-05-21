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

// Compare deux noms d'entreprise : insensible à la casse et aux espaces de bord.
// Sert à matcher "CNRS" / " cnrs " / "Cnrs" comme un seul et même client.
function sameCompanyName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// Merge "protégé" : on ne remplace un champ existant du carnet QUE si la nouvelle
// valeur n'est pas vide. Règle CTO : éviter qu'une facture faite à la va-vite
// (sans adresse ni SIRET) n'efface des infos déjà saisies au carnet.
function mergeProtected(existing: ClientRecord, incoming: Partial<ClientRecord>): ClientRecord {
  const result: ClientRecord = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'id') continue
    if (typeof value !== 'string') continue
    if (value.trim() === '') continue
    ;(result as unknown as Record<string, string>)[key] = value
  }
  return result
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

  // Renvoie le ClientRecord dont le nom matche EXACTEMENT (case+trim) — sert à
  // l'hydratation auto avant save quand l'utilisateur tape "CNRS" à la main
  // sans passer par l'autocomplete.
  const findExactByName = useCallback((name: string): ClientRecord | null => {
    const trimmed = name.trim()
    if (!trimmed) return null
    return clientsRef.current.find(c => sameCompanyName(c.companyName, trimmed)) ?? null
  }, [])

  // upsertClient : si un client de même nom existe → merge protégé (les champs
  // non-vides du payload écrasent ceux du carnet, les champs vides ne touchent
  // à rien). Sinon → addClient classique. Sert à garder le carnet à jour quand
  // on sauvegarde une facture sans perdre les infos déjà saisies au carnet.
  const upsertClient = useCallback(async (client: Omit<ClientRecord, 'id'>) => {
    const existing = clientsRef.current.find(c => sameCompanyName(c.companyName, client.companyName))
    if (!existing) {
      const newClient: ClientRecord = { ...client, id: crypto.randomUUID() }
      const updated = [newClient, ...clientsRef.current]
      setClients(updated)
      clientsRef.current = updated
      const result = await storage.saveClients(updated)
      if (!result.ok && result.reason === 'unknown') toast.error('Erreur de sauvegarde client')
      return newClient
    }
    const merged = mergeProtected(existing, client)
    // Pas d'écriture inutile si rien n'a changé (évite un toast d'erreur faux
    // positif et une écriture localStorage gratuite à chaque save de facture).
    if (JSON.stringify(merged) === JSON.stringify(existing)) return existing
    const updated = clientsRef.current.map(c => c.id === existing.id ? merged : c)
    setClients(updated)
    clientsRef.current = updated
    const result = await storage.saveClients(updated)
    if (!result.ok && result.reason === 'unknown') toast.error('Erreur de mise à jour client')
    return merged
  }, [])

  return { clients, addClient, upsertClient, updateClient, deleteClient, findByName, findExactByName, existsByName }
}
