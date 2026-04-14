import { useState } from 'react'
import { Trash2, Edit, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClientRecord } from '@/types/invoice'
import { PLACEHOLDERS } from '@/lib/constants'

interface ClientsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientRecord[]
  onUpdate: (id: string, partial: Partial<ClientRecord>) => void
  onDelete: (id: string) => void
}

// Champ de saisie réutilisable pour l'édition
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
      />
    </div>
  )
}

export function ClientsManager({ open, onOpenChange, clients, onUpdate, onDelete }: ClientsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<ClientRecord>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  const startEdit = (client: ClientRecord) => {
    setEditingId(client.id)
    setDraft(client)
    setShowAdvanced(false)
  }

  const confirmEdit = () => {
    if (editingId) {
      onUpdate(editingId, draft)
      setEditingId(null)
    }
  }

  const setField = (key: keyof ClientRecord) => (v: string) =>
    setDraft(p => ({ ...p, [key]: v }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
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
                  <div className="space-y-3">
                    {/* Identité */}
                    <div className="space-y-2">
                      <Field
                        label="Nom de l'entreprise"
                        value={draft.companyName ?? ''}
                        onChange={setField('companyName')}
                        placeholder={PLACEHOLDERS.client.companyName}
                      />
                      <Field
                        label="Service destinataire"
                        value={draft.department ?? ''}
                        onChange={setField('department')}
                        placeholder={PLACEHOLDERS.client.department}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label="Contact"
                          value={draft.contactName ?? ''}
                          onChange={setField('contactName')}
                          placeholder={PLACEHOLDERS.client.contactName}
                        />
                        <Field
                          label="Forme juridique"
                          value={draft.legalForm ?? ''}
                          onChange={setField('legalForm')}
                          placeholder={PLACEHOLDERS.client.legalForm}
                        />
                      </div>
                    </div>

                    {/* Adresse */}
                    <div className="space-y-2">
                      <Field
                        label="Complément d'adresse"
                        value={draft.addressLine2 ?? ''}
                        onChange={setField('addressLine2')}
                        placeholder={PLACEHOLDERS.client.addressLine2}
                      />
                      <Field
                        label="Adresse"
                        value={draft.address ?? ''}
                        onChange={setField('address')}
                        placeholder={PLACEHOLDERS.client.address}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Field
                          label="Code postal"
                          value={draft.postalCode ?? ''}
                          onChange={setField('postalCode')}
                          placeholder={PLACEHOLDERS.client.postalCode}
                        />
                        <Field
                          label="Ville"
                          value={draft.city ?? ''}
                          onChange={setField('city')}
                          placeholder={PLACEHOLDERS.client.city}
                          className="col-span-2"
                        />
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label="Téléphone"
                        value={draft.phone ?? ''}
                        onChange={setField('phone')}
                        placeholder={PLACEHOLDERS.client.phone}
                        type="tel"
                      />
                      <Field
                        label="Email"
                        value={draft.email ?? ''}
                        onChange={setField('email')}
                        placeholder={PLACEHOLDERS.client.email}
                        type="email"
                      />
                    </div>

                    {/* Identifiants (avancé, repliable) */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(v => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                        Identifiants légaux
                      </button>

                      {showAdvanced && (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="SIRET"
                              value={draft.siret ?? ''}
                              onChange={setField('siret')}
                              placeholder={PLACEHOLDERS.client.siret}
                            />
                            <Field
                              label="SIREN"
                              value={draft.siren ?? ''}
                              onChange={setField('siren')}
                              placeholder={PLACEHOLDERS.client.siren}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="Code APE/NAF"
                              value={draft.apeNaf ?? ''}
                              onChange={setField('apeNaf')}
                              placeholder={PLACEHOLDERS.client.apeNaf}
                            />
                            <Field
                              label="N° TVA intracom"
                              value={draft.tvaNumber ?? ''}
                              onChange={setField('tvaNumber')}
                              placeholder={PLACEHOLDERS.client.tvaNumber}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="Site web"
                              value={draft.website ?? ''}
                              onChange={setField('website')}
                              placeholder={PLACEHOLDERS.client.website}
                              type="url"
                            />
                            <Field
                              label="Code service"
                              value={draft.codeService ?? ''}
                              onChange={setField('codeService')}
                              placeholder={PLACEHOLDERS.client.codeService}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 justify-end pt-1 border-t border-gray-100 dark:border-gray-800">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="size-3.5 mr-1" />
                        Annuler
                      </Button>
                      <Button size="sm" onClick={confirmEdit}>
                        <Check className="size-3.5 mr-1" />
                        Enregistrer
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
                      {(client.siret || client.email || client.phone) && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {[client.siret && `SIRET ${client.siret}`, client.email, client.phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
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
