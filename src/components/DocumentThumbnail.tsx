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
  const lines = Math.min(itemCount, 5)

  return (
    <div className="aspect-[210/297] w-full bg-white dark:bg-gray-950 rounded-lg flex flex-col overflow-hidden select-none pointer-events-none">
      {/* Bande dégradée en haut */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${config.gradient} shrink-0`} />

      <div className="flex-1 flex flex-col px-3 pt-2.5 pb-2">
        {/* Header: logo + émetteur */}
        <div className="flex items-center gap-1.5 mb-1">
          {logo ? (
            <div className="w-5 h-3.5 flex-shrink-0 rounded-sm overflow-hidden">
              <img src={logo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className={`w-5 h-3.5 rounded-sm flex-shrink-0 bg-gradient-to-br ${config.gradient} opacity-20`} />
          )}
          <p className="text-[6.5px] text-gray-400 dark:text-gray-500 truncate flex-1">{issuerName || '—'}</p>
        </div>

        {/* Badge type + numéro */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`text-[7px] font-semibold px-1.5 py-0.5 rounded border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
            {config.label}
          </span>
          <span className="text-[7px] text-gray-400 dark:text-gray-500 font-medium truncate">{number}</span>
        </div>

        {/* Client — mis en valeur */}
        <div className="mb-2.5">
          <p className="text-[8px] font-bold text-gray-800 dark:text-gray-100 truncate leading-snug">{clientName || '—'}</p>
        </div>

        {/* Ligne de séparation fine */}
        <div className={`h-px ${config.lineAccent} mb-1.5`} />

        {/* Lignes simulées — style moderne */}
        <div className="flex-1 space-y-[3px]">
          {/* En-tête de tableau simulé */}
          <div className="flex gap-1 items-center mb-0.5">
            <div className="w-[45%] h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="flex-1" />
            <div className="w-[12%] h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="w-[18%] h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="flex gap-1 items-center">
              <div className={`${LINE_WIDTHS[i % LINE_WIDTHS.length]} h-1 ${config.lineBg} rounded-full`} />
              <div className="flex-1" />
              <div className={`w-[12%] h-1 ${config.lineBg} rounded-full`} />
              <div className={`w-[18%] h-1 ${config.lineBg} rounded-full`} />
            </div>
          ))}
          {itemCount > 5 && (
            <p className="text-[5px] text-gray-400 dark:text-gray-500 mt-0.5">+{itemCount - 5} lignes</p>
          )}
        </div>

        {/* Total — zone mise en valeur */}
        <div className={`${config.totalBg} rounded-md px-2 py-1.5 mt-auto`}>
          <div className="flex justify-between items-center">
            <span className="text-[6px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total TTC</span>
            <span className={`font-bold text-[10px] ${config.accentText}`}>{formatEuro(totalTTC)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
