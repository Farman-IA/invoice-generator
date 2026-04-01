import { Euro, FileText, FilePen, AlertTriangle, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SavedInvoice, SavedQuote } from '@/types/invoice'
import { calculateTotals, formatEuro } from '@/lib/calculations'

interface DashboardProps {
  invoices: SavedInvoice[]
  quotes: SavedQuote[]
  onViewInvoices: () => void
  onViewQuotes: () => void
  onEditInvoice: (id: string) => void
  onEditQuote: (id: string) => void
}

export function Dashboard({
  invoices, quotes, onViewInvoices, onViewQuotes, onEditInvoice, onEditQuote,
}: DashboardProps) {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // KPIs
  const finalizedThisMonth = invoices.filter(inv => {
    if (inv.status !== 'finalisée') return false
    const d = new Date(inv.invoice.issueDate)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const caMonth = finalizedThisMonth.reduce((sum, inv) => sum + calculateTotals(inv.invoice.items).totalTTC, 0)

  const drafts = invoices.filter(inv => inv.status === 'brouillon').length
  const sentQuotes = quotes.filter(q => q.status === 'envoyé').length
  const unpaid = invoices.filter(inv => inv.status === 'finalisée' && inv.paymentStatus !== 'payee').length

  // Dernières entrées
  const latestInvoices = [...invoices]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const latestQuotes = [...quotes]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Euro className="size-5" />} label="CA du mois" value={`${formatEuro(caMonth)} €`} color="emerald" />
        <KpiCard icon={<FileText className="size-5" />} label="Brouillons" value={String(drafts)} color="gray" />
        <KpiCard icon={<FilePen className="size-5" />} label="Devis envoyés" value={String(sentQuotes)} color="blue" />
        <KpiCard icon={<AlertTriangle className="size-5" />} label="Impayées" value={String(unpaid)} color={unpaid > 0 ? 'red' : 'gray'} />
      </div>

      {/* Deux colonnes : factures + devis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dernières factures */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Dernières factures</h2>
            <Button variant="ghost" size="xs" onClick={onViewInvoices} className="text-gray-400">
              Voir tout <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>
          {latestInvoices.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Aucune facture</p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {latestInvoices.map(inv => {
                const ttc = calculateTotals(inv.invoice.items).totalTTC
                return (
                  <button key={inv.id} onClick={() => onEditInvoice(inv.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{inv.invoice.number}</span>
                        <StatusBadge status={inv.status} type="invoice" paymentStatus={inv.paymentStatus} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">{inv.client.companyName || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatEuro(ttc)} €</p>
                      <p className="text-[10px] text-gray-400">{new Date(inv.invoice.issueDate).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Derniers devis */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Derniers devis</h2>
            <Button variant="ghost" size="xs" onClick={onViewQuotes} className="text-gray-400">
              Voir tout <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>
          {latestQuotes.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Aucun devis</p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {latestQuotes.map(q => {
                const ttc = calculateTotals(q.quote.items).totalTTC
                return (
                  <button key={q.id} onClick={() => onEditQuote(q.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{q.quote.number}</span>
                        <QuoteStatusBadge status={q.status} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">{q.client.companyName || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatEuro(ttc)} €</p>
                      <p className="text-[10px] text-gray-400">{new Date(q.quote.issueDate).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    gray: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800',
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, paymentStatus }: { status: string; type: string; paymentStatus?: string }) {
  if (status === 'brouillon') return <Badge variant="secondary" className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px]">Brouillon</Badge>
  if (paymentStatus === 'payee') return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Payée</Badge>
  if (paymentStatus === 'en_retard') return <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">En retard</Badge>
  return <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">En attente</Badge>
}

function QuoteStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    brouillon: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    envoyé: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    accepté: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    refusé: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return <Badge variant="secondary" className={`${map[status] ?? map.brouillon} text-[10px]`}>{status}</Badge>
}
