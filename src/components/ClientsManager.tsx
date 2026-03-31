import { useState } from 'react'
import { Trash2, Edit, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClientRecord } from '@/types/invoice'

interface ClientsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientRecord[]
  onUpdate: (id: string, partial: Partial<ClientRecord>) => void
  onDelete: (id: string) => void
}

export function ClientsManager({ open, onOpenChange, clients, onUpdate, onDelete }: ClientsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<ClientRecord>>({})

  const startEdit = (client: ClientRecord) => {
    setEditingId(client.id)
    setDraft(client)
  }

  const confirmEdit = () => {
    if (editingId) {
      onUpdate(editingId, draft)
      setEditingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carnet de clients</DialogTitle>
        </DialogHeader>

        {clients.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            Aucun client enregistré. Les clients seront ajoutés automatiquement lors de la sauvegarde de vos factures.
          </p>
        ) : (
          <div className="space-y-2">
            {clients.map(client => (
              <div key={client.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                {editingId === client.id ? (
                  <div className="space-y-2">
                    <input
                      value={draft.companyName ?? ''}
                      onChange={e => setDraft(p => ({ ...p, companyName: e.target.value }))}
                      placeholder="Nom de l'entreprise"
                      className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={draft.contactName ?? ''}
                        onChange={e => setDraft(p => ({ ...p, contactName: e.target.value }))}
                        placeholder="Contact"
                        className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                      />
                      <input
                        value={draft.city ?? ''}
                        onChange={e => setDraft(p => ({ ...p, city: e.target.value }))}
                        placeholder="Ville"
                        className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)}>
                        <X className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={confirmEdit}>
                        <Check className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{client.companyName}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[client.contactName, client.city].filter(Boolean).join(' — ')}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={() => startEdit(client)}>
                        <Edit className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-red-500 hover:text-red-700" onClick={() => onDelete(client.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
