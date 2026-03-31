import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { IssuerProfile } from '@/types/invoice'
import { storage } from '@/lib/storage'

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issuer: IssuerProfile
  onUpdateIssuer: (partial: Partial<IssuerProfile>) => void
}

const FIELDS: { key: keyof IssuerProfile; label: string; section: string }[] = [
  { key: 'companyName', label: 'Nom de l\'entreprise', section: 'identity' },
  { key: 'legalForm', label: 'Forme juridique', section: 'identity' },
  { key: 'address', label: 'Adresse', section: 'address' },
  { key: 'postalCode', label: 'Code postal', section: 'address' },
  { key: 'city', label: 'Ville', section: 'address' },
  { key: 'phone', label: 'Téléphone', section: 'address' },
  { key: 'siret', label: 'SIRET', section: 'legal' },
  { key: 'siren', label: 'SIREN', section: 'legal' },
  { key: 'apeNaf', label: 'Code APE/NAF', section: 'legal' },
  { key: 'tvaNumber', label: 'N° TVA intracommunautaire', section: 'legal' },
  { key: 'shareCapital', label: 'Capital social', section: 'legal' },
  { key: 'rcsCity', label: 'Ville RCS', section: 'legal' },
  { key: 'rcProInsurer', label: 'Assureur RC Pro', section: 'legal' },
  { key: 'rcProScope', label: 'Portée RC Pro', section: 'legal' },
  { key: 'bankName', label: 'Banque', section: 'bank' },
  { key: 'iban', label: 'IBAN', section: 'bank' },
  { key: 'bic', label: 'BIC', section: 'bank' },
]

const SECTIONS = [
  { id: 'identity', title: 'Identité' },
  { id: 'address', title: 'Coordonnées' },
  { id: 'legal', title: 'Informations légales' },
  { id: 'bank', title: 'Coordonnées bancaires' },
]

export function ProfileModal({ open, onOpenChange, issuer, onUpdateIssuer }: ProfileModalProps) {
  const [draft, setDraft] = useState<IssuerProfile>(issuer)

  useEffect(() => {
    if (open) setDraft(issuer)
  }, [open, issuer])

  const handleSave = async () => {
    onUpdateIssuer(draft)
    await storage.saveIssuerProfile(draft)
    toast.success('Profil sauvegardé')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mon profil émetteur</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {SECTIONS.map(section => (
            <div key={section.id}>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.filter(f => f.section === section.id).map(field => (
                  <div key={field.key} className={field.key === 'address' ? 'col-span-2' : ''}>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{field.label}</label>
                    <input
                      type="text"
                      value={draft[field.key]}
                      onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Annuler
          </DialogClose>
          <Button onClick={handleSave}>
            <Save className="size-4 mr-1.5" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
