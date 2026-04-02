import { useState, useMemo } from 'react'
import { Copy, Trash2, Download, FileText, ArrowRight, Search, X, Send, Check, XCircle, FolderOpen } from 'lucide-react'
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
import { DocumentThumbnail } from '@/components/DocumentThumbnail'
import type { SavedQuote, QuoteStatus } from '@/types/invoice'
import { calculateTotals } from '@/lib/calculations'

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sorted.map(quote => {
            const totals = calculateTotals(quote.quote.items)
            const date = new Date(quote.quote.issueDate).toLocaleDateString('fr-FR')
            const isBrouillon = quote.status === 'brouillon'
            const isAccepted = quote.status === 'accepté'
            const badge = STATUS_BADGE[quote.status]

            return (
              <div key={quote.id} className="group flex flex-col">
                {/* Miniature */}
                <div
                  className="relative cursor-pointer rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-blue-300 dark:hover:ring-blue-700"
                  onClick={() => onEdit(quote.id)}
                  title="Charger ce devis"
                >
                  <DocumentThumbnail
                    type="devis"
                    number={quote.quote.number}
                    clientName={quote.client.companyName}
                    issuerName={quote.issuer.companyName}
                    totalTTC={totals.totalTTC}
                    itemCount={quote.quote.items.length}
                  />

                  {/* Badge statut */}
                  <div className="absolute top-1.5 right-1.5">
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </div>

                  {/* Indicateur converti */}
                  {quote.linkedInvoiceId && (
                    <div className="absolute bottom-1.5 left-1.5">
                      <Badge className="text-[8px] px-1 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Facturé
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Infos sous la miniature */}
                <div className="mt-2 px-0.5">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{quote.quote.number}</p>
                  <p className="text-[10px] text-gray-400">{date}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 mt-1.5">
                  <Button variant="outline" size="xs" className="flex-1 text-[10px] h-6" onClick={() => onEdit(quote.id)}>
                    <FolderOpen className="size-3 mr-0.5" />
                    Charger
                  </Button>
                  <Button variant="outline" size="xs" className="flex-1 text-[10px] h-6" onClick={() => onDuplicate(quote.id)}>
                    <Copy className="size-3 mr-0.5" />
                    Dupliquer
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => onDownload(quote.id)} title="PDF" aria-label="Télécharger PDF">
                    <Download className="size-3" />
                  </Button>

                  {/* Statut */}
                  {isBrouillon && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onUpdateStatus(quote.id, 'envoyé')} title="Envoyé" aria-label="Marquer envoyé" className="text-blue-500">
                      <Send className="size-3" />
                    </Button>
                  )}
                  {quote.status === 'envoyé' && (
                    <>
                      <Button variant="ghost" size="icon-xs" onClick={() => onUpdateStatus(quote.id, 'accepté')} title="Accepté" aria-label="Accepté" className="text-emerald-500">
                        <Check className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => onUpdateStatus(quote.id, 'refusé')} title="Refusé" aria-label="Refusé" className="text-red-500">
                        <XCircle className="size-3" />
                      </Button>
                    </>
                  )}

                  {/* Convertir */}
                  {isAccepted && !quote.linkedInvoiceId && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onConvertToInvoice(quote.id)} title="Convertir en facture" aria-label="Convertir en facture" className="text-emerald-600">
                      <ArrowRight className="size-3" />
                    </Button>
                  )}

                  <Button
                    variant="ghost" size="icon-xs"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => setDeleteTarget(quote)}
                    title="Supprimer"
                    aria-label="Supprimer le devis"
                  >
                    <Trash2 className="size-3" />
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
