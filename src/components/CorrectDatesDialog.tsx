import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { SavedInvoice, InvoiceDateFields } from '@/types/invoice'

interface CorrectDatesDialogProps {
  // La facture finalisée à corriger (null = fenêtre fermée). On pilote
  // l'ouverture par cette prop, comme la modale de suppression de la galerie.
  invoice: SavedInvoice | null
  onClose: () => void
  onConfirm: (id: string, dates: InvoiceDateFields) => void
}

// Champ date réutilisé 3x dans la fenêtre. Le factoriser évite de recopier le
// style (bordure, focus, mode sombre) sur chaque ligne.
// `dark:[color-scheme:dark]` = indispensable pour que l'icône calendrier native
// et le sélecteur s'affichent en thème sombre (sinon foncé sur fond foncé).
function DateField({ label, value, onChange, optional, required, min }: {
  label: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
  required?: boolean
  min?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {optional && <span className="text-gray-400 font-normal"> (optionnelle)</span>}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        aria-required={required}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
      />
    </label>
  )
}

// Formulaire interne. Monté avec une `key` (cf. plus bas) → React le recrée à
// chaque changement de facture. Du coup le state part directement des bonnes
// valeurs, SANS useEffect de synchronisation (anti-pattern React déconseillé).
function CorrectDatesForm({ invoice, onConfirm }: {
  invoice: SavedInvoice
  onConfirm: (id: string, dates: InvoiceDateFields) => void
}) {
  // Copie de travail des 3 dates : tant qu'on ne confirme pas, la facture
  // d'origine reste intacte.
  const [issueDate, setIssueDate] = useState(invoice.invoice.issueDate)
  const [deliveryDate, setDeliveryDate] = useState(invoice.invoice.deliveryDate)
  const [dueDate, setDueDate] = useState(invoice.invoice.dueDate)

  // Raison qui bloque la validation (null = tout va bien). On l'AFFICHE à
  // l'écran : un bouton grisé sans explication est déroutant pour un
  // utilisateur non technique. Couvre les 2 cas : date manquante et échéance
  // antérieure à l'émission (incohérence sur un document légal).
  const blockReason =
    !issueDate || !dueDate
      ? 'Renseignez la date d\'émission et la date d\'échéance.'
      : dueDate < issueDate
        ? 'L\'échéance ne peut pas précéder la date d\'émission.'
        : null

  return (
    <>
      <DialogHeader>
        <DialogTitle>Corriger les dates</DialogTitle>
        <DialogDescription>
          Facture <strong>{invoice.invoice.number}</strong> — seules les dates
          sont modifiables. À ne corriger que si la facture n'a pas encore été
          transmise au client.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <DateField label="Date d'émission" value={issueDate} onChange={setIssueDate} required />
        <DateField label="Date de livraison" value={deliveryDate} onChange={setDeliveryDate} optional />
        <DateField label="Date d'échéance" value={dueDate} onChange={setDueDate} required min={issueDate} />

        {/* Message d'aide quand la validation est bloquée. aria-live="polite"
            pour qu'un lecteur d'écran l'annonce sans voler le focus. */}
        {blockReason && (
          <p className="text-xs text-red-600 dark:text-red-400" aria-live="polite">
            {blockReason}
          </p>
        )}

        {/* Rappel visuel de ce qui reste verrouillé : rassure que la
            correction ne peut pas déraper sur un montant ou un numéro. */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
          <Lock className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Verrouillés : montants, numéro de facture, lignes et client. Seules
            les 3 dates ci-dessus seront modifiées.
          </p>
        </div>
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
        <Button
          onClick={() => onConfirm(invoice.id, { issueDate, deliveryDate, dueDate })}
          disabled={blockReason !== null}
        >
          Corriger les dates
        </Button>
      </DialogFooter>
    </>
  )
}

export function CorrectDatesDialog({ invoice, onClose, onConfirm }: CorrectDatesDialogProps) {
  return (
    <Dialog open={invoice !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        {/* key = id de la facture → le formulaire est recréé à chaque ouverture
            sur une facture différente, garantissant des champs à jour. */}
        {invoice && (
          <CorrectDatesForm key={invoice.id} invoice={invoice} onConfirm={onConfirm} />
        )}
      </DialogContent>
    </Dialog>
  )
}
