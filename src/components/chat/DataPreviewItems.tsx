import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VAT_RATES } from '@/lib/constants'
import { calculateTotals, formatEuro } from '@/lib/calculations'
import { getEffectiveUnitPriceHT, mergeLineItem, round2 } from '@/lib/money'
import type { ParsedInvoiceData, PriceMode, VatRate } from '@/types/invoice'

type PreviewItem = ParsedInvoiceData['items'][number]

interface DataPreviewItemsProps {
  items: PreviewItem[]
  priceMode: PriceMode
  onChange: (items: PreviewItem[]) => void
}

const inputCls = 'px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 dark:text-gray-100'

// Une ligne saisie en TTC s'édite en TTC (le TTC énoncé est la source de
// vérité), une ligne HT s'édite en HT. Le montant complémentaire est
// recalculé et affiché en clair — c'est l'opacité de l'ancien aperçu
// (un "25 €" sans explication) qui rendait l'IA incompréhensible.
function editsTTC(item: PreviewItem): boolean {
  return item.unitPriceTTC != null
}

export function DataPreviewItems({ items, priceMode, onChange }: DataPreviewItemsProps) {
  const update = (index: number, patch: Partial<PreviewItem>) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  const updatePrice = (index: number, value: number) => {
    const item = items[index]
    const v = Math.max(0, value || 0)
    if (editsTTC(item)) {
      // Édition du TTC : le HT suit (source de vérité officielle du projet)
      update(index, { unitPriceTTC: round2(v), unitPrice: getEffectiveUnitPriceHT(0, v, item.vatRate) })
    } else {
      update(index, { unitPrice: round2(v) })
    }
  }

  const updateVat = (index: number, rate: VatRate) => {
    // mergeLineItem préserve l'invariant : si la ligne est en TTC saisi,
    // changer la TVA recalcule le HT à partir du TTC (jamais l'inverse).
    onChange(items.map((it, i) => (i === index ? mergeLineItem(it, { vatRate: rate }) : it)))
  }

  const addLine = () => {
    const blank: PreviewItem = priceMode === 'ttc'
      ? { description: '', quantity: 1, unitPrice: 0, unitPriceTTC: 0, vatRate: 10 }
      : { description: '', quantity: 1, unitPrice: 0, vatRate: 10 }
    onChange([...items, blank])
  }

  const removeLine = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  // Totaux en direct avec le VRAI moteur de calcul de la facture (pas une
  // ré-implémentation locale). Les TTC à 0 (placeholder d'une ligne en cours
  // de saisie) sont retirés pour ne pas déclencher l'alerte "champ corrompu".
  const totals = calculateTotals(
    items.map((it, i) => ({
      id: `preview-${i}`,
      unit: 'unité',
      ...it,
      unitPriceTTC: it.unitPriceTTC && it.unitPriceTTC > 0 ? it.unitPriceTTC : undefined,
    })),
  )

  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500 dark:text-gray-400">Articles</label>
      {items.map((item, i) => {
        const ttcMode = editsTTC(item)
        const shownPrice = ttcMode ? item.unitPriceTTC! : item.unitPrice
        const counterpart = ttcMode
          ? `= ${formatEuro(item.unitPrice)} € HT`
          : `= ${formatEuro(round2(item.unitPrice * (1 + item.vatRate / 100)))} € TTC`
        return (
          <div key={i} className="rounded border border-gray-200 dark:border-gray-700 p-1.5 space-y-1">
            <div className="flex gap-1">
              <input
                type="number"
                value={item.quantity}
                onChange={e => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                className={`w-12 text-center ${inputCls}`}
                min="1"
                aria-label="Quantité"
              />
              <input
                value={item.description}
                onChange={e => update(i, { description: e.target.value })}
                className={`flex-1 ${inputCls}`}
                placeholder="Description"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeLine(i)}
                aria-label="Supprimer la ligne"
                className="text-gray-400 hover:text-red-500 shrink-0"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            <div className="flex gap-1 items-center">
              <input
                type="number"
                value={shownPrice}
                onChange={e => updatePrice(i, Number(e.target.value))}
                className={`w-20 text-right ${inputCls}`}
                step="0.01"
                min="0"
                aria-label={ttcMode ? 'Prix unitaire TTC' : 'Prix unitaire HT'}
              />
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                € {ttcMode ? 'TTC' : 'HT'}
              </span>
              <select
                value={item.vatRate}
                onChange={e => updateVat(i, Number(e.target.value) as VatRate)}
                className={inputCls}
                aria-label="Taux de TVA"
              >
                {VAT_RATES.map(r => (
                  <option key={r.value} value={r.value}>TVA {r.label}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                {counterpart}
              </span>
            </div>
          </div>
        )
      })}

      <Button variant="ghost" size="sm" onClick={addLine} className="h-6 text-xs text-gray-500 w-full">
        <Plus className="size-3 mr-1" />
        Ajouter une ligne
      </Button>

      {items.length > 0 && (
        <div className="flex justify-between items-baseline pt-1 border-t border-gray-200 dark:border-gray-700 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            HT {formatEuro(totals.totalHTAfterDiscount)} € · TVA {formatEuro(totals.totalVAT)} €
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            Total TTC {formatEuro(totals.totalTTC)} €
          </span>
        </div>
      )}
    </div>
  )
}
