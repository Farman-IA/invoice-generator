import { useRef } from 'react'
import { Plus, FileText, Save, Download, Sun, Moon, User, Users, Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceGallery } from '@/components/InvoiceGallery'
import { ProfileModal } from '@/components/ProfileModal'
import { ClientsManager } from '@/components/ClientsManager'
import { TemplatesManager } from '@/components/TemplatesManager'
import { useInvoice } from '@/hooks/useInvoice'
import { useClients } from '@/hooks/useClients'
import { useArticleTemplates } from '@/hooks/useArticleTemplates'
import { useTheme } from '@/hooks/useTheme'
import { generatePDF } from '@/lib/pdf'
import { useState } from 'react'
import type { ClientInfo, LineItem, ArticleTemplate, VatRate } from '@/types/invoice'

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
    markAsPaid,
    markAsUnpaid,
    newInvoice,
  } = useInvoice()

  const { clients, addClient, updateClient: updateClientRecord, deleteClient: deleteClientRecord, findByName, existsByName } = useClients()
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useArticleTemplates()
  const { theme, toggleTheme } = useTheme()

  const invoiceRef = useRef<HTMLDivElement>(null)

  const [showProfile, setShowProfile] = useState(false)
  const [showClients, setShowClients] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return
    await generatePDF(invoiceRef.current, state.invoice.number, state.client.companyName)
  }

  const handleFinalize = async () => {
    const invoiceNumber = state.invoice.number
    const clientName = state.client.companyName

    const ok = await finalizeInvoice()
    if (ok) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (invoiceRef.current) {
            generatePDF(invoiceRef.current, invoiceNumber, clientName)
          }
        })
      })
    }
  }

  const handleGalleryDownload = (id: string) => {
    const invoice = savedInvoices.find(inv => inv.id === id)
    if (!invoice) return
    const invoiceNumber = invoice.invoice.number
    const clientName = invoice.client.companyName
    loadInvoice(id)
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (invoiceRef.current) {
          await generatePDF(invoiceRef.current, invoiceNumber, clientName)
          setView('GALLERY')
        }
      })
    })
  }

  // Sauvegarder + proposer ajout client au carnet
  const handleSaveInvoice = async () => {
    await saveInvoice()
    const clientName = state.client.companyName.trim()
    if (clientName && !existsByName(clientName)) {
      toast('Nouveau client détecté', {
        action: {
          label: 'Ajouter au carnet',
          onClick: () => {
            addClient({ ...state.client })
            toast.success('Client ajouté au carnet')
          },
        },
        duration: 5000,
      })
    }
  }

  // Sélection client depuis autocomplete
  const handleSelectClient = (client: ClientInfo) => {
    updateClient(client)
  }

  // Sauvegarder une ligne comme modèle
  const handleSaveAsTemplate = (item: LineItem) => {
    addTemplate({
      description: item.description,
      unitPrice: item.unitPrice,
      vatRate: item.vatRate,
    })
  }

  // Insérer un modèle comme nouvelle ligne (atomique, pas de rAF)
  const handleInsertTemplate = (template: ArticleTemplate) => {
    addLineItem({
      description: template.description,
      unitPrice: template.unitPrice,
      vatRate: template.vatRate as VatRate,
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      {/* Header / Navbar */}
      <div className="no-print sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Générateur de factures</h1>
          <div className="flex gap-1.5">
            {/* Outils */}
            <Button variant="ghost" size="icon-sm" onClick={() => setShowProfile(true)} title="Mon profil">
              <User className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowClients(true)} title="Carnet de clients">
              <Users className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowTemplates(true)} title="Modèles d'articles">
              <Bookmark className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}>
              {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>

            <div className="w-px bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Navigation */}
            <Button
              variant={view === 'EDIT' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { if (view === 'GALLERY') newInvoice() }}
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
            onMarkPaid={markAsPaid}
            onMarkUnpaid={markAsUnpaid}
          />
        </div>
      ) : (
        <>
          {/* Barre d'action édition */}
          {!isFinalized && (
            <div className="no-print bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <div className="max-w-[210mm] mx-auto px-4 py-2 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveInvoice}>
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
            <div className="no-print bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
              <div className="max-w-[210mm] mx-auto px-4 py-2 flex items-center justify-between">
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Cette facture est finalisée. Dupliquez-la pour créer une variante.
                </p>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="size-4 mr-1.5" />
                  Télécharger PDF
                </Button>
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
              findClientByName={isFinalized ? undefined : findByName}
              onSelectClient={isFinalized ? undefined : handleSelectClient}
              templates={isFinalized ? undefined : templates}
              onSaveAsTemplate={isFinalized ? undefined : handleSaveAsTemplate}
              onInsertTemplate={isFinalized ? undefined : handleInsertTemplate}
            />
          </div>
        </>
      )}

      {/* Modales */}
      <ProfileModal
        open={showProfile}
        onOpenChange={setShowProfile}
        issuer={state.issuer}
        onUpdateIssuer={updateIssuer}
      />
      <ClientsManager
        open={showClients}
        onOpenChange={setShowClients}
        clients={clients}
        onUpdate={updateClientRecord}
        onDelete={deleteClientRecord}
      />
      <TemplatesManager
        open={showTemplates}
        onOpenChange={setShowTemplates}
        templates={templates}
        onAdd={addTemplate}
        onUpdate={updateTemplate}
        onDelete={deleteTemplate}
      />

      <Toaster position="bottom-right" duration={3000} />
    </div>
  )
}

export default App
