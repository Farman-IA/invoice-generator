import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Bookmark, BookmarkPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InlineEdit } from '@/components/InlineEdit'
import { calculateLineTotal, formatEuro } from '@/lib/calculations'
import { VAT_RATES, PLACEHOLDERS } from '@/lib/constants'
import type { LineItem, VatRate, ArticleTemplate } from '@/types/invoice'

interface LineItemsTableProps {
  items: LineItem[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, partial: Partial<LineItem>) => void
  templates?: ArticleTemplate[]
  onSaveAsTemplate?: (item: LineItem) => void
  onInsertTemplate?: (template: ArticleTemplate) => void
}

export function LineItemsTable({
  items, onAdd, onRemove, onUpdate,
  templates = [], onSaveAsTemplate, onInsertTemplate,
}: LineItemsTableProps) {
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const templateMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTemplateMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setShowTemplateMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTemplateMenu])

  return (
    <div className="mt-8">
      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col />
          <col style={{ width: 60 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 50 }} />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-gray-800 dark:border-gray-300 text-left">
            <th className="pb-2 font-semibold">Description</th>
            <th className="pb-2 font-semibold text-center">Qté</th>
            <th className="pb-2 font-semibold text-right px-2">Prix unitaire HT</th>
            <th className="pb-2 font-semibold text-center px-2">TVA</th>
            <th className="pb-2 font-semibold text-right px-2">Total HT</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const lineTotal = calculateLineTotal(item.quantity, item.unitPrice)
            return (
              <tr
                key={item.id}
                className="group border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                data-empty-line={!item.description && item.unitPrice === 0 ? '' : undefined}
              >
                <td className="py-2.5 pr-2">
                  <InlineEdit
                    value={item.description}
                    onChange={(v) => onUpdate(item.id, { description: v })}
                    placeholder={PLACEHOLDERS.lineItem.description}
                    className="w-full"
                  />
                </td>
                <td className="py-2.5 px-2 text-center">
                  <InlineEdit
                    value={String(item.quantity)}
                    onChange={(v) => onUpdate(item.id, { quantity: Math.max(0, Number(v) || 0) })}
                    as="number"
                    className="text-center w-full"
                  />
                </td>
                <td className="py-2.5 px-2 text-right">
                  <InlineEdit
                    value={String(Math.round(item.unitPrice * 100) / 100)}
                    onChange={(v) => onUpdate(item.id, { unitPrice: Math.max(0, Number(v) || 0) })}
                    as="number"
                    className="text-right w-full"
                  />
                </td>
                <td className="py-2.5 px-2 text-center">
                  <div className="pdf-vat-select">
                    <Select
                      value={String(item.vatRate)}
                      onValueChange={(v) => onUpdate(item.id, { vatRate: Number(v) as VatRate })}
                    >
                      <SelectTrigger className="h-auto border-none bg-transparent shadow-none text-sm px-0 py-0 w-full hover:bg-blue-50/60 dark:hover:bg-blue-900/30 relative [&>svg]:absolute [&>svg]:right-0 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2" style={{ justifyContent: 'center' }}>
                        <SelectValue style={{ flex: 'none', textAlign: 'center' }} />
                      </SelectTrigger>
                      <SelectContent className="min-w-72">
                        {VAT_RATES.map((rate) => (
                          <SelectItem key={rate.value} value={String(rate.value)}>
                            <span className="font-medium">{rate.label}</span>
                            <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
                              — {rate.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="pdf-vat-text hidden">{item.vatRate.toLocaleString('fr-FR')}</span>
                </td>
                <td className="py-2.5 px-2 text-right font-medium tabular-nums">
                  {formatEuro(lineTotal)} €
                </td>
                <td className="py-2.5 pl-1">
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onSaveAsTemplate && item.description && item.unitPrice > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onSaveAsTemplate(item)
                          toast.success('Modèle sauvegardé')
                        }}
                        className="text-gray-400 hover:text-blue-500 p-0.5"
                        title="Sauvegarder comme modèle"
                      >
                        <BookmarkPlus className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="text-gray-400 hover:text-red-500 p-0.5"
                      aria-label="Supprimer cette ligne"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-2 no-print">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAdd}
          className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <Plus className="size-4 mr-1" />
          Ajouter une ligne
        </Button>

        {onInsertTemplate && templates.length > 0 && (
          <div className="relative" ref={templateMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <Bookmark className="size-4 mr-1" />
              Insérer un modèle
            </Button>
            {showTemplateMenu && (
              <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onInsertTemplate(t)
                      setShowTemplateMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100">{t.description}</span>
                    <span className="text-gray-400 text-xs ml-2">
                      {formatEuro(t.unitPrice)} € — {VAT_RATES.find(v => v.value === t.vatRate)?.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
