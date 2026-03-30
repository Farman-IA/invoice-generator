import { useRef } from 'react'
import { FilePlus, Download } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { useInvoice } from '@/hooks/useInvoice'
import { generatePDF } from '@/lib/pdf'

function App() {
  const {
    state,
    updateIssuer,
    updateClient,
    updateInvoice,
    addLineItem,
    removeLineItem,
    updateLineItem,
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Action bar */}
      <div className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-600">Générateur de factures</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (window.confirm('Créer une nouvelle facture ? Les données client et lignes actuelles seront effacées.')) {
                newInvoice()
              }
            }}>
              <FilePlus className="size-4 mr-1.5" />
              Nouvelle facture
            </Button>
            <Button size="sm" onClick={handleDownloadPDF}>
              <Download className="size-4 mr-1.5" />
              Télécharger PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice */}
      <div className="py-8 px-4">
        <InvoiceDocument
          ref={invoiceRef}
          issuer={state.issuer}
          client={state.client}
          invoice={state.invoice}
          onUpdateIssuer={updateIssuer}
          onUpdateClient={updateClient}
          onUpdateInvoice={updateInvoice}
          onAddLine={addLineItem}
          onRemoveLine={removeLineItem}
          onUpdateLine={updateLineItem}
        />
      </div>

      <Toaster position="bottom-right" duration={3000} />
    </div>
  )
}

export default App
