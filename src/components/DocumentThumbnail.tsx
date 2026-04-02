import { formatEuro } from '@/lib/calculations'

interface DocumentThumbnailProps {
  type: 'facture' | 'devis'
  number: string
  clientName: string
  issuerName: string
  totalTTC: number
  itemCount: number
  logo?: string
}

export function DocumentThumbnail({
  type, number, clientName, issuerName, totalTTC, itemCount, logo,
}: DocumentThumbnailProps) {
  return (
    <div className="aspect-[210/297] w-full bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-700 p-3 flex flex-col text-[7px] leading-tight overflow-hidden select-none pointer-events-none">
      {/* Header: logo + titre */}
      <div className="flex items-start justify-between mb-2">
        {logo ? (
          <div className="w-8 h-5 flex-shrink-0">
            <img src={logo} alt="" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-8 h-5 rounded bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
        )}
        <span className="font-bold text-[9px] uppercase tracking-wide text-gray-800 dark:text-gray-200">
          {type === 'facture' ? 'FACTURE' : 'DEVIS'}
        </span>
      </div>

      {/* Numéro */}
      <p className="text-gray-500 dark:text-gray-400 mb-2 truncate">{number}</p>

      {/* Émetteur / Client */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[6px] text-gray-400 dark:text-gray-500 uppercase mb-0.5">Émetteur</p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded px-1 py-0.5">
            <p className="truncate font-medium text-gray-700 dark:text-gray-300">{issuerName || '—'}</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[6px] text-gray-400 dark:text-gray-500 uppercase mb-0.5">Client</p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded px-1 py-0.5">
            <p className="truncate font-medium text-gray-700 dark:text-gray-300">{clientName || '—'}</p>
          </div>
        </div>
      </div>

      {/* Lignes (barres simulées) */}
      <div className="flex-1 space-y-1 mb-2">
        <div className="h-px bg-gray-300 dark:bg-gray-600" />
        {Array.from({ length: Math.min(itemCount, 4) }).map((_, i) => (
          <div key={i} className="flex gap-1 items-center">
            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-sm" />
            <div className="w-4 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-sm" />
            <div className="w-6 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-sm" />
          </div>
        ))}
        {itemCount > 4 && (
          <p className="text-[5px] text-gray-400 text-center">+{itemCount - 4} lignes</p>
        )}
      </div>

      {/* Total */}
      <div className="border-t border-gray-300 dark:border-gray-600 pt-1 mt-auto">
        <div className="flex justify-between items-baseline">
          <span className="text-[6px] text-gray-400 dark:text-gray-500 uppercase">Total TTC</span>
          <span className="font-bold text-[9px] text-gray-900 dark:text-gray-100">{formatEuro(totalTTC)} €</span>
        </div>
      </div>
    </div>
  )
}
