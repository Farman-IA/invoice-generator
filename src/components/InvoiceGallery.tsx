import { useState, useMemo } from 'react'
import { Copy, Trash2, Download, FileText, CheckCircle, Search, X, ArrowUpDown, SlidersHorizontal, AlertTriangle, FolderOpen } from 'lucide-react'
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
import type { SavedInvoice, PaymentStatus } from '@/types/invoice'
import { calculateTotals, formatEuro } from '@/lib/calculations'

type StatusFilter = 'tous' | 'brouillon' | 'finalisée'
type PaymentFilter = 'tous' | 'en_attente' | 'payee' | 'en_retard'
type SortKey = 'date' | 'date_asc' | 'montant' | 'montant_asc' | 'client'

interface InvoiceGalleryProps {
  invoices: SavedInvoice[]
  onEdit: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onMarkPaid: (id: string) => void
  onMarkUnpaid: (id: string) => void
}

const PAYMENT_BADGE: Record<PaymentStatus, { label: string; className: string }> = {
  en_attente: { label: 'En attente', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' },
  payee: { label: 'Payée', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' },
  en_retard: { label: 'En retard', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 animate-pulse' },
}

export function InvoiceGallery({
  invoices, onEdit, onDuplicate, onDelete, onDownload, onMarkPaid, onMarkUnpaid,
}: InvoiceGalleryProps) {
  const [deleteTarget, setDeleteTarget] = useState<SavedInvoice | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tous')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('tous')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [showFilters, setShowFilters] = useState(false)

  const sorted = useMemo(() => {
    let filtered = invoices

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(inv =>
        inv.invoice.number.toLowerCase().includes(q) ||
        inv.client.companyName.toLowerCase().includes(q) ||
        formatEuro(calculateTotals(inv.invoice.items).totalTTC).includes(q)
      )
    }

    if (statusFilter !== 'tous') {
      filtered = filtered.filter(inv => inv.status === statusFilter)
    }

    if (paymentFilter !== 'tous') {
      filtered = filtered.filter(inv => inv.paymentStatus === paymentFilter)
    }

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'date': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        case 'date_asc': return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        case 'montant': return calculateTotals(b.invoice.items).totalTTC - calculateTotals(a.invoice.items).totalTTC
        case 'montant_asc': return calculateTotals(a.invoice.items).totalTTC - calculateTotals(b.invoice.items).totalTTC
        case 'client': return a.client.companyName.localeCompare(b.client.companyName)
        default: return 0
      }
    })
  }, [invoices, search, statusFilter, paymentFilter, sortKey])

  const hasFilters = statusFilter !== 'tous' || paymentFilter !== 'tous' || search !== ''

  return (
    <>
      {/* Barre de recherche + filtres */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="invoice-search" className="sr-only">Rechercher les factures</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
            <input
              id="invoice-search"
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par numéro, client, montant..."
              className="w-full pl-10 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
              aria-label="Rechercher les factures"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={showFilters ? 'bg-gray-100 dark:bg-gray-800' : ''}>
            <SlidersHorizontal className="size-4 mr-1" />
            Filtres
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const keys: SortKey[] = ['date', 'date_asc', 'montant', 'montant_asc', 'client']
            const idx = keys.indexOf(sortKey)
            setSortKey(keys[(idx + 1) % keys.length])
          }}>
            <ArrowUpDown className="size-4 mr-1" />
            {sortKey === 'date' ? 'Récent' : sortKey === 'date_asc' ? 'Ancien' : sortKey === 'montant' ? '€ ↓' : sortKey === 'montant_asc' ? '€ ↑' : 'A-Z'}
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              <span className="text-xs text-gray-400 self-center mr-1">Statut :</span>
              {(['tous', 'brouillon', 'finalisée'] as StatusFilter[]).map(s => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="xs" onClick={() => setStatusFilter(s)}>
                  {s === 'tous' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              <span className="text-xs text-gray-400 self-center mr-1">Paiement :</span>
              {(['tous', 'en_attente', 'payee', 'en_retard'] as PaymentFilter[]).map(p => (
                <Button key={p} variant={paymentFilter === p ? 'default' : 'outline'} size="xs" onClick={() => setPaymentFilter(p)}>
                  {p === 'tous' ? 'Tous' : p === 'en_attente' ? 'En attente' : p === 'payee' ? 'Payée' : 'En retard'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap gap-1">
            {search && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setSearch('')}>
                Recherche: &quot;{search}&quot; <X className="size-3 ml-1" />
              </Badge>
            )}
            {statusFilter !== 'tous' && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setStatusFilter('tous')}>
                {statusFilter} <X className="size-3 ml-1" />
              </Badge>
            )}
            {paymentFilter !== 'tous' && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setPaymentFilter('tous')}>
                {paymentFilter === 'en_attente' ? 'En attente' : paymentFilter === 'payee' ? 'Payée' : 'En retard'} <X className="size-3 ml-1" />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Grille */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
          <FileText className="size-16 mb-4 stroke-1" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
            {hasFilters ? 'Aucune facture ne correspond à votre recherche' : 'Aucune facture sauvegardée'}
          </p>
          {!hasFilters && <p className="text-sm mt-1">Créez votre première !</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sorted.map(invoice => {
            const totals = calculateTotals(invoice.invoice.items)
            const date = new Date(invoice.invoice.issueDate).toLocaleDateString('fr-FR')
            const isBrouillon = invoice.status === 'brouillon'

            return (
              <div key={invoice.id} className="group flex flex-col">
                {/* Miniature */}
                <div
                  className="relative cursor-pointer rounded-xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 ring-1 ring-gray-200/80 dark:ring-gray-700/80 hover:ring-blue-300 dark:hover:ring-blue-600"
                  onClick={() => onEdit(invoice.id)}
                  title="Charger cette facture"
                >
                  <DocumentThumbnail
                    type="facture"
                    number={invoice.invoice.number}
                    clientName={invoice.client.companyName}
                    issuerName={invoice.issuer.companyName}
                    totalTTC={totals.totalTTC}
                    itemCount={invoice.invoice.items.length}
                  />

                  {/* Overlay badges */}
                  <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                    <Badge
                      variant={isBrouillon ? 'secondary' : 'default'}
                      className={`text-[9px] px-1 py-0 ${
                        isBrouillon
                          ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}
                    >
                      {invoice.status}
                    </Badge>
                    {!isBrouillon && invoice.paymentStatus && (
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${PAYMENT_BADGE[invoice.paymentStatus].className}`}>
                        {invoice.paymentStatus === 'en_retard' && <AlertTriangle className="size-2.5 mr-0.5" />}
                        {PAYMENT_BADGE[invoice.paymentStatus].label}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Infos sous la miniature */}
                <div className="mt-2 px-0.5">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{invoice.invoice.number}</p>
                  <p className="text-[10px] text-gray-400">{date}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 mt-1.5">
                  <Button variant="outline" size="xs" className="flex-1 text-[10px] h-6" onClick={() => onEdit(invoice.id)}>
                    <FolderOpen className="size-3 mr-0.5" />
                    Charger
                  </Button>
                  <Button variant="outline" size="xs" className="flex-1 text-[10px] h-6" onClick={() => onDuplicate(invoice.id)}>
                    <Copy className="size-3 mr-0.5" />
                    Dupliquer
                  </Button>
                  {!isBrouillon && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onDownload(invoice.id)} title="PDF" aria-label="Télécharger PDF">
                      <Download className="size-3" />
                    </Button>
                  )}
                  {!isBrouillon && invoice.paymentStatus !== 'payee' && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onMarkPaid(invoice.id)} title="Payée" aria-label="Marquer payée" className="text-emerald-500">
                      <CheckCircle className="size-3" />
                    </Button>
                  )}
                  {!isBrouillon && invoice.paymentStatus === 'payee' && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onMarkUnpaid(invoice.id)} title="Annuler paiement" aria-label="Annuler paiement" className="text-orange-500">
                      <CheckCircle className="size-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon-xs"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => setDeleteTarget(invoice)}
                    title="Supprimer"
                    aria-label="Supprimer la facture"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale suppression */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette facture ?</DialogTitle>
            <DialogDescription>
              La facture <strong>{deleteTarget?.invoice.number}</strong> sera définitivement supprimée.
              Cette action est irréversible.
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
