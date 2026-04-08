import { useState } from 'react'
import { Plus, Trash2, Edit, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ArticleTemplate, VatRate } from '@/types/invoice'
import { VAT_RATES } from '@/lib/constants'
import { formatEuro } from '@/lib/calculations'

interface TemplatesManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: ArticleTemplate[]
  onAdd: (template: Omit<ArticleTemplate, 'id'>) => void
  onUpdate: (id: string, partial: Partial<ArticleTemplate>) => void
  onDelete: (id: string) => void
}

export function TemplatesManager({ open, onOpenChange, templates, onAdd, onUpdate, onDelete }: TemplatesManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ description: '', unit: 'unité', unitPrice: 0, vatRate: 20 as VatRate })
  const [showNew, setShowNew] = useState(false)

  const startEdit = (t: ArticleTemplate) => {
    setEditingId(t.id)
    setDraft({ description: t.description, unit: t.unit, unitPrice: t.unitPrice, vatRate: t.vatRate })
  }

  const confirmEdit = () => {
    if (editingId) {
      onUpdate(editingId, draft)
      setEditingId(null)
    }
  }

  const handleAddNew = () => {
    if (draft.description.trim()) {
      onAdd(draft)
      setDraft({ description: '', unit: 'unité', unitPrice: 0, vatRate: 20 })
      setShowNew(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modèles d'articles</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              {editingId === t.id ? (
                <TemplateForm draft={draft} setDraft={setDraft} onConfirm={confirmEdit} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.description}</p>
                    <p className="text-xs text-gray-400">
                      {formatEuro(t.unitPrice)} € HT — TVA {VAT_RATES.find(v => v.value === t.vatRate)?.label}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(t)}>
                      <Edit className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-red-500 hover:text-red-700" onClick={() => onDelete(t.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showNew ? (
            <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20">
              <TemplateForm
                draft={draft}
                setDraft={setDraft}
                onConfirm={handleAddNew}
                onCancel={() => { setShowNew(false); setDraft({ description: '', unit: 'unité', unitPrice: 0, vatRate: 20 }) }}
              />
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowNew(true)}>
              <Plus className="size-4 mr-1.5" />
              Ajouter un modèle
            </Button>
          )}

          {templates.length === 0 && !showNew && (
            <p className="text-sm text-gray-400 py-4 text-center">
              Aucun modèle. Vous pouvez en créer ici ou sauvegarder un article depuis le formulaire.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplateForm({
  draft,
  setDraft,
  onConfirm,
  onCancel,
}: {
  draft: { description: string; unit: string; unitPrice: number; vatRate: VatRate }
  setDraft: (fn: (d: typeof draft) => typeof draft) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-2">
      <input
        value={draft.description}
        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
        placeholder="Description de l'article"
        className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400">Prix unitaire HT</label>
          <input
            type="number"
            value={draft.unitPrice || ''}
            onChange={e => setDraft(d => ({ ...d, unitPrice: parseFloat(e.target.value) || 0 }))}
            className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">TVA</label>
          <select
            value={draft.vatRate}
            onChange={e => setDraft(d => ({ ...d, vatRate: parseFloat(e.target.value) as VatRate }))}
            className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          >
            {VAT_RATES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onConfirm}>
          <Check className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
