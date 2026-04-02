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

const TYPE_CONFIG = {
  facture: {
    label: 'Facture',
    gradient: 'from-blue-500 to-indigo-600',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/50',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-200 dark:border-blue-800',
    accentText: 'text-blue-600 dark:text-blue-400',
    totalBg: 'bg-blue-50 dark:bg-blue-950/40',
    lineBg: 'bg-blue-100/60 dark:bg-blue-900/30',
    lineAccent: 'bg-blue-200/80 dark:bg-blue-800/40',
  },
  devis: {
    label: 'Devis',
    gradient: 'from-violet-500 to-purple-600',
    badgeBg: 'bg-violet-50 dark:bg-violet-950/50',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'border-violet-200 dark:border-violet-800',
    accentText: 'text-violet-600 dark:text-violet-400',
    totalBg: 'bg-violet-50 dark:bg-violet-950/40',
    lineBg: 'bg-violet-100/60 dark:bg-violet-900/30',
    lineAccent: 'bg-violet-200/80 dark:bg-violet-800/40',
  },
}

// Largeurs variées pour simuler un vrai tableau
const LINE_WIDTHS = ['w-[65%]', 'w-[80%]', 'w-[55%]', 'w-[72%]', 'w-[60%]']

export function DocumentThumbnail({
  type, number, clientName, issuerName, totalTTC, itemCount, logo,
}: DocumentThumbnailProps) {
  const config = TYPE_CONFIG[type]
  const lines = Math.min(itemCount, 3)

  return (
    <div className="aspect-[4/3] w-full bg-white dark:bg-gray-950 rounded-lg flex flex-col overflow-hidden select-none pointer-events-none">
      {/* Bande dégradée en haut */}
      <div className={`h-1 w-full bg-gradient-to-r ${config.gradient} shrink-0`} />

      <div className="flex-1 flex flex-col px-2.5 pt-2 pb-1.5">
        {/* Header: badge + numéro + émetteur */}
        <div className="flex items-center gap-1 mb-1">
          <span className={`text-[6px] font-semibold px-1 py-px rounded border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder} leading-none`}>
            {config.label}
          </span>
          <span className="text-[6px] text-gray-400 dark:text-gray-500 font-medium truncate">{number}</span>
        </div>

        {/* Client — mis en valeur */}
        <p className="text-[7.5px] font-bold text-gray-800 dark:text-gray-100 truncate leading-tight mb-1">{clientName || '—'}</p>

        {/* Émetteur discret */}
        <div className="flex items-center gap-1 mb-1.5">
          {logo ? (
            <div className="w-3.5 h-2.5 flex-shrink-0 rounded-sm overflow-hidden">
              <img src={logo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className={`w-3.5 h-2.5 rounded-sm flex-shrink-0 bg-gradient-to-br ${config.gradient} opacity-20`} />
          )}
          <p className="text-[5.5px] text-gray-400 dark:text-gray-500 truncate">{issuerName || '—'}</p>
        </div>

        {/* Lignes simulées compactes */}
        <div className="flex-1 space-y-[2px]">
          <div className={`h-px ${config.lineAccent}`} />
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="flex gap-0.5 items-center">
              <div className={`${LINE_WIDTHS[i % LINE_WIDTHS.length]} h-[3px] ${config.lineBg} rounded-full`} />
              <div className="flex-1" />
              <div className={`w-[15%] h-[3px] ${config.lineBg} rounded-full`} />
            </div>
          ))}
          {itemCount > 3 && (
            <p className="text-[4.5px] text-gray-400 dark:text-gray-500">+{itemCount - 3}</p>
          )}
        </div>

        {/* Total compact */}
        <div className={`${config.totalBg} rounded px-1.5 py-1 mt-auto`}>
          <div className="flex justify-between items-center">
            <span className="text-[5px] font-medium text-gray-400 dark:text-gray-500 uppercase">TTC</span>
            <span className={`font-bold text-[9px] ${config.accentText}`}>{formatEuro(totalTTC)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
