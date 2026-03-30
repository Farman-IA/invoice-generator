import { Plus, Trash2 } from 'lucide-react'
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
import type { LineItem, VatRate } from '@/types/invoice'

interface LineItemsTableProps {
  items: LineItem[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, partial: Partial<LineItem>) => void
}

export function LineItemsTable({ items, onAdd, onRemove, onUpdate }: LineItemsTableProps) {
  return (
    <div className="mt-8">
      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col />
          <col style={{ width: 60 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 30 }} />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
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
                className="group border-b border-gray-200 hover:bg-gray-50/50"
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
                    value={String(item.unitPrice)}
                    onChange={(v) => onUpdate(item.id, { unitPrice: Math.max(0, Number(v) || 0) })}
                    as="number"
                    className="text-right w-full"
                  />
                </td>
                <td className="py-2.5 px-2 text-center">
                  <div className="w-full">
                    <Select
                      value={String(item.vatRate)}
                      onValueChange={(v) => onUpdate(item.id, { vatRate: Number(v) as VatRate })}
                    >
                      <SelectTrigger className="pdf-vat-select h-auto border-none bg-transparent shadow-none text-sm px-0 py-0 w-full hover:bg-blue-50/60" style={{ justifyContent: 'center', gap: '4px' }}>
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
                    <span className="pdf-vat-text hidden text-sm w-full text-center block">{item.vatRate.toLocaleString('fr-FR')} %</span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right font-medium tabular-nums">
                  {formatEuro(lineTotal)} €
                </td>
                <td className="py-2.5 pl-1">
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5"
                    aria-label="Supprimer cette ligne"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Button
        variant="ghost"
        size="sm"
        onClick={onAdd}
        className="mt-3 text-gray-500 hover:text-gray-800"
      >
        <Plus className="size-4 mr-1" />
        Ajouter une ligne
      </Button>
    </div>
  )
}
