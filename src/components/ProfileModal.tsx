import { useState } from 'react'
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
import { AISettingsSection } from '@/components/AISettingsSection'

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
  { key: 'email', label: 'Email', section: 'address' },
  { key: 'website', label: 'Site web', section: 'address' },
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
  // Reset le brouillon à chaque ouverture via key dans le parent serait idéal,
  // mais ici on utilise un pattern contrôlé : draft initialisé depuis issuer
  const [draft, setDraft] = useState(issuer)
  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) setDraft(issuer)
  if (open !== lastOpen) setLastOpen(open)

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
                  <div key={field.key} className={field.key === 'address' || field.key === 'companyName' ? 'col-span-2' : ''}>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{field.label}</label>
                    <input
                      type="text"
                      value={typeof draft[field.key] === 'string' ? draft[field.key] as string : ''}
                      onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Mode de saisie des prix */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Mode de saisie des prix
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, priceMode: 'ht' }))}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  (draft.priceMode ?? 'ht') === 'ht'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">HT</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Prix hors taxe</div>
              </button>
              <button
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, priceMode: 'ttc' }))}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  draft.priceMode === 'ttc'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">TTC</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Toutes taxes comprises</div>
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Recommandé TTC pour les restaurants et commerces (évite les écarts d'arrondi).
            </p>
            {draft.priceMode !== (issuer.priceMode ?? 'ht') && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                ⚠ Ce changement s'appliquera aux nouvelles lignes. Les lignes existantes peuvent nécessiter une re-saisie pour un arrondi exact.
              </p>
            )}
          </div>

          <AISettingsSection />
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
