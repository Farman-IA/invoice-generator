import { useState } from 'react'
import { Edit, Copy, Trash2, Download, FileText } from 'lucide-react'
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
import type { SavedInvoice } from '@/types/invoice'
import { calculateTotals, formatEuro } from '@/lib/calculations'

interface InvoiceGalleryProps {
  invoices: SavedInvoice[]
  onEdit: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
}

export function InvoiceGallery({
  invoices,
  onEdit,
  onDuplicate,
  onDelete,
  onDownload,
}: InvoiceGalleryProps) {
  const [deleteTarget, setDeleteTarget] = useState<SavedInvoice | null>(null)

  const sorted = [...invoices].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <FileText className="size-16 mb-4 stroke-1" />
        <p className="text-lg font-medium text-gray-500">Aucune facture sauvegardée</p>
        <p className="text-sm mt-1">Créez votre première !</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(invoice => {
          const totals = calculateTotals(invoice.invoice.items)
          const date = new Date(invoice.invoice.issueDate).toLocaleDateString('fr-FR')
          const isBrouillon = invoice.status === 'brouillon'

          return (
            <div
              key={invoice.id}
              className="group bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3"
            >
              {/* En-tête carte */}
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {invoice.invoice.number}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {invoice.client.companyName || 'Client non renseigné'}
                  </p>
                </div>
                <Badge
                  variant={isBrouillon ? 'secondary' : 'default'}
                  className={
                    isBrouillon
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }
                >
                  {invoice.status}
                </Badge>
              </div>

              {/* Montant + date */}
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold text-gray-900">
                  {formatEuro(totals.totalTTC)} €
                </span>
                <span className="text-xs text-gray-400">{date}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-1 pt-1 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                {isBrouillon && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(invoice.id)}
                    title="Éditer"
                  >
                    <Edit className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDuplicate(invoice.id)}
                  title="Dupliquer"
                >
                  <Copy className="size-3.5" />
                </Button>
                {!isBrouillon && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDownload(invoice.id)}
                    title="Télécharger PDF"
                  >
                    <Download className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteTarget(invoice)}
                  title="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modale de confirmation de suppression */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette facture ?</DialogTitle>
            <DialogDescription>
              La facture <strong>{deleteTarget?.invoice.number}</strong> sera définitivement supprimée.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Annuler
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget.id)
                  setDeleteTarget(null)
                }
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
