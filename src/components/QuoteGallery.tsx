import { useState, useMemo } from 'react'
import { Edit, Copy, Trash2, Download, FileText, ArrowRight, Search, X, Send, Check, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { SavedQuote, QuoteStatus } from '@/types/invoice'
import { calculateTotals, formatEuro } from '@/lib/calculations'

const STATUS_BADGE: Record<QuoteStatus, { label: string; className: string }> = {
  brouillon: { label: 'Brouillon', className: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' },
  envoyé: { label: 'Envoyé', className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  accepté: { label: 'Accepté', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' },
  refusé: { label: 'Refusé', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
}

interface QuoteGalleryProps {
  quotes: SavedQuote[]
  onEdit: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onUpdateStatus: (id: string, status: QuoteStatus) => void
  onConvertToInvoice: (id: string) => void
}

export function QuoteGallery({
  quotes, onEdit, onDuplicate, onDelete, onDownload, onUpdateStatus, onConvertToInvoice,
}: QuoteGalleryProps) {
  const [deleteTarget, setDeleteTarget] = useState<SavedQuote | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'tous' | QuoteStatus>('tous')

  const sorted = useMemo(() => {
    let filtered = quotes
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(qt =>
        qt.quote.number.toLowerCase().includes(q) ||
        qt.client.companyName.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'tous') {
      filtered = filtered.filter(qt => qt.status === statusFilter)
    }

    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [quotes, search, statusFilter])

  return (
    <>
      {/* Recherche + filtres */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="quote-search" className="sr-only">Rechercher les devis</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
            <input
              id="quote-search"
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un devis..."
              className="w-full pl-10 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
              aria-label="Rechercher les devis"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {(['tous', 'brouillon', 'envoyé', 'accepté', 'refusé'] as const).map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="xs" onClick={() => setStatusFilter(s)}>
              {s === 'tous' ? 'Tous' : STATUS_BADGE[s].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Grille */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
          <FileText className="size-16 mb-4 stroke-1" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
            {search || statusFilter !== 'tous' ? 'Aucun devis ne correspond' : 'Aucun devis sauvegardé'}
          </p>
          {!search && statusFilter === 'tous' && <p className="text-sm mt-1">Créez votre premier devis !</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(quote => {
            const totals = calculateTotals(quote.quote.items)
            const date = new Date(quote.quote.issueDate).toLocaleDateString('fr-FR')
            const isBrouillon = quote.status === 'brouillon'
            const isAccepted = quote.status === 'accepté'
            const badge = STATUS_BADGE[quote.status]

            return (
              <div
                key={quote.id}
                className="group bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{quote.quote.number}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{quote.client.companyName || 'Client non renseigné'}</p>
                  </div>
                  <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatEuro(totals.totalTTC)} €</span>
                  <span className="text-xs text-gray-400">{date}</span>
                </div>

                {quote.linkedInvoiceId && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Converti en facture</p>
                )}

                {/* Actions */}
                <div className="flex gap-1 pt-1 border-t border-gray-100 dark:border-gray-800 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  {isBrouillon && (
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(quote.id)} title="Éditer" aria-label="Éditer le devis">
                      <Edit className="size-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => onDuplicate(quote.id)} title="Dupliquer" aria-label="Dupliquer le devis">
                    <Copy className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onDownload(quote.id)} title="Télécharger PDF" aria-label="Télécharger PDF">
                    <Download className="size-3.5" />
                  </Button>

                  {/* Changement de statut */}
                  {isBrouillon && (
                    <Button variant="ghost" size="icon-sm" onClick={() => onUpdateStatus(quote.id, 'envoyé')} title="Marquer envoyé" aria-label="Marquer envoyé" className="text-blue-500">
                      <Send className="size-3.5" />
                    </Button>
                  )}
                  {quote.status === 'envoyé' && (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => onUpdateStatus(quote.id, 'accepté')} title="Accepté" aria-label="Marquer accepté" className="text-emerald-500">
                        <Check className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => onUpdateStatus(quote.id, 'refusé')} title="Refusé" aria-label="Marquer refusé" className="text-red-500">
                        <XCircle className="size-3.5" />
                      </Button>
                    </>
                  )}

                  {/* Convertir en facture */}
                  {isAccepted && !quote.linkedInvoiceId && (
                    <Button variant="ghost" size="icon-sm" onClick={() => onConvertToInvoice(quote.id)} title="Convertir en facture" aria-label="Convertir en facture" className="text-emerald-600">
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}

                  <Button
                    variant="ghost" size="icon-sm"
                    className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus-visible:bg-red-50 dark:focus-visible:bg-red-900/20"
                    onClick={() => setDeleteTarget(quote)}
                    title="Supprimer"
                    aria-label="Supprimer le devis"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce devis ?</DialogTitle>
            <DialogDescription>
              Le devis <strong>{deleteTarget?.quote.number}</strong> sera définitivement supprimé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
            <Button variant="destructive" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.id); setDeleteTarget(null) } }}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
