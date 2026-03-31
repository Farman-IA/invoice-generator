import { useState, useEffect, useCallback, useRef } from 'react'
import type { ClientRecord } from '@/types/invoice'
import { storage } from '@/lib/storage'

export function useClients() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const clientsRef = useRef(clients)
  useEffect(() => { clientsRef.current = clients }, [clients])

  useEffect(() => {
    storage.getClients().then(setClients)
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
    await storage.saveClients(updated)
  }, [])

  const deleteClient = useCallback(async (id: string) => {
    const updated = clientsRef.current.filter(c => c.id !== id)
    setClients(updated)
    clientsRef.current = updated
    await storage.saveClients(updated)
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
