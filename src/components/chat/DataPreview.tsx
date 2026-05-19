import { useState } from 'react'
import { Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { round2 } from '@/lib/money'
import type { ParsedInvoiceData } from '@/types/invoice'

interface DataPreviewProps {
  data: ParsedInvoiceData
  onApply: (edited: ParsedInvoiceData) => void
  onCancel: () => void
}

// Formulaire d'édition des données parsées par l'IA, avant application au formulaire principal.
// L'utilisateur peut corriger client, adresse, items avant de cliquer "Appliquer".
export function DataPreview({ data, onApply, onCancel }: DataPreviewProps) {
  const [draft, setDraft] = useState<ParsedInvoiceData>(data)

  const updateField = (field: keyof ParsedInvoiceData, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    setDraft(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm space-y-2 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium text-xs">
        <Pencil className="size-3" />
        Vérifiez avant d'appliquer
      </div>

      {/* Client */}
      {draft.clientName !== undefined && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Client</label>
          <input
            value={draft.clientName}
            onChange={e => updateField('clientName', e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
            placeholder="Nom du client"
          />
        </div>
      )}

      {draft.clientDepartment !== undefined && (
        <input
          value={draft.clientDepartment ?? ''}
          onChange={e => updateField('clientDepartment', e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          placeholder="Service destinataire"
        />
      )}

      {/* Adresse sur une ligne */}
      <div className="grid grid-cols-3 gap-1">
        {draft.clientAddressLine2 !== undefined && (
          <div className="col-span-3">
            <input
              value={draft.clientAddressLine2 ?? ''}
              onChange={e => updateField('clientAddressLine2', e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Complément d'adresse"
            />
          </div>
        )}
        {draft.clientAddress !== undefined && (
          <div className="col-span-3">
            <input
              value={draft.clientAddress ?? ''}
              onChange={e => updateField('clientAddress', e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Adresse"
            />
          </div>
        )}
        {(draft.clientPostalCode !== undefined || draft.clientCity !== undefined) && (
          <>
            <input
              value={draft.clientPostalCode ?? ''}
              onChange={e => updateField('clientPostalCode', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Code postal"
            />
            <input
              value={draft.clientCity ?? ''}
              onChange={e => updateField('clientCity', e.target.value)}
              className="col-span-2 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              placeholder="Ville"
            />
          </>
        )}
      </div>

      {draft.contactName !== undefined && (
        <input
          value={draft.contactName ?? ''}
          onChange={e => updateField('contactName', e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          placeholder="Contact"
        />
      )}

      {/* Bon de commande / Code service Chorus Pro (administration publique) */}
      {(draft.purchaseOrder !== undefined || draft.codeService !== undefined) && (
        <div className="grid grid-cols-2 gap-1">
          {draft.purchaseOrder !== undefined && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Bon de commande</label>
              <input
                value={draft.purchaseOrder ?? ''}
                onChange={e => updateField('purchaseOrder', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                placeholder="N° de bon de commande"
              />
            </div>
          )}
          {draft.codeService !== undefined && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Code service Chorus</label>
              <input
                value={draft.codeService ?? ''}
                onChange={e => updateField('codeService', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                placeholder="Code service"
              />
            </div>
          )}
        </div>
      )}

      {/* Articles */}
      {draft.items?.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Articles</label>
          {draft.items.map((item, i) => (
            <div key={i} className="flex gap-1">
              <input
                type="number"
                value={item.quantity}
                onChange={e => updateItem(i, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                className="w-12 px-1 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-center"
                min="1"
              />
              <input
                value={item.description}
                onChange={e => updateItem(i, 'description', e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                type="number"
                value={round2(item.unitPrice)}
                onChange={e => updateItem(i, 'unitPrice', round2(Math.max(0, Number(e.target.value) || 0)))}
                className="w-16 px-1 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100 text-right"
                step="0.01"
              />
              <span className="text-xs text-gray-400 self-center">€</span>
            </div>
          ))}
        </div>
      )}

      {/* Boutons */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onApply(draft)} className="flex-1 h-7 text-xs">
          <Check className="size-3 mr-1" />
          Appliquer
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
          Annuler
        </Button>
      </div>
    </div>
  )
}
