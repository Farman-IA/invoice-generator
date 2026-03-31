import { useRef } from 'react'
import { Plus, FileText, Save, Download } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceGallery } from '@/components/InvoiceGallery'
import { useInvoice } from '@/hooks/useInvoice'
import { generatePDF } from '@/lib/pdf'

function App() {
  const {
    state,
    savedInvoices,
    view,
    isFinalized,
    isLoading,
    setView,
    updateIssuer,
    updateClient,
    updateInvoice,
    addLineItem,
    removeLineItem,
    updateLineItem,
    saveInvoice,
    finalizeInvoice,
    loadInvoice,
    duplicateInvoice,
    deleteInvoice,
    newInvoice,
  } = useInvoice()

  const invoiceRef = useRef<HTMLDivElement>(null)

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return
    await generatePDF(
      invoiceRef.current,
      state.invoice.number,
      state.client.companyName
    )
  }

  const handleFinalize = async () => {
    const ok = await finalizeInvoice()
    if (ok && invoiceRef.current) {
      // Petit délai pour laisser le state se mettre à jour
      setTimeout(() => {
        handleDownloadPDF()
      }, 100)
    }
  }

  // Télécharger une facture depuis la galerie : la charger, puis générer le PDF
  const handleGalleryDownload = (id: string) => {
    loadInvoice(id)
    // Attendre que le DOM se mette à jour avec les nouvelles données
    setTimeout(async () => {
      if (invoiceRef.current) {
        await generatePDF(
          invoiceRef.current,
          state.invoice.number,
          state.client.companyName
        )
        setView('GALLERY')
      }
    }, 300)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header / Navbar */}
      <div className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-600">Générateur de factures</h1>
          <div className="flex gap-2">
            {/* Navigation */}
            <Button
              variant={view === 'EDIT' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (view === 'GALLERY') {
                  newInvoice()
                }
              }}
            >
              <Plus className="size-4 mr-1.5" />
              Nouvelle facture
            </Button>
            <Button
              variant={view === 'GALLERY' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('GALLERY')}
            >
              <FileText className="size-4 mr-1.5" />
              Mes factures
              {savedInvoices.length > 0 && (
                <span className="ml-1.5 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
                  {savedInvoices.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      {view === 'GALLERY' ? (
        <div className="max-w-5xl mx-auto py-8 px-4">
          <InvoiceGallery
            invoices={savedInvoices}
            onEdit={loadInvoice}
            onDuplicate={duplicateInvoice}
            onDelete={deleteInvoice}
            onDownload={handleGalleryDownload}
          />
        </div>
      ) : (
        <>
          {/* Barre d'action édition */}
          {!isFinalized && (
            <div className="no-print bg-white border-b border-gray-100">
              <div className="max-w-[210mm] mx-auto px-4 py-2 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={saveInvoice}>
                  <Save className="size-4 mr-1.5" />
                  Sauvegarder
                </Button>
                <Button size="sm" onClick={handleFinalize}>
                  <Download className="size-4 mr-1.5" />
                  Finaliser & Télécharger
                </Button>
              </div>
            </div>
          )}

          {isFinalized && (
            <div className="no-print bg-emerald-50 border-b border-emerald-200">
              <div className="max-w-[210mm] mx-auto px-4 py-2 flex items-center justify-between">
                <p className="text-sm text-emerald-700">
                  Cette facture est finalisée. Dupliquez-la pour créer une variante.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                    <Download className="size-4 mr-1.5" />
                    Télécharger PDF
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Formulaire facture */}
          <div className="py-8 px-4">
            <InvoiceDocument
              ref={invoiceRef}
              issuer={state.issuer}
              client={state.client}
              invoice={state.invoice}
              onUpdateIssuer={isFinalized ? () => {} : updateIssuer}
              onUpdateClient={isFinalized ? () => {} : updateClient}
              onUpdateInvoice={isFinalized ? () => {} : updateInvoice}
              onAddLine={isFinalized ? () => {} : addLineItem}
              onRemoveLine={isFinalized ? () => {} : removeLineItem}
              onUpdateLine={isFinalized ? () => {} : updateLineItem}
            />
          </div>
        </>
      )}

      <Toaster position="bottom-right" duration={3000} />
    </div>
  )
}

export default App
