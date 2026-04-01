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
      {/* Header unique */}
      <div className="no-print sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Navigation gauche */}
          <nav className="flex gap-1">
            <Button
              variant={view === 'EDIT' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { if (view === 'GALLERY') newInvoice() }}
            >
              <Plus className="size-4 mr-1" />
              Nouvelle
            </Button>
            <Button
              variant={view === 'GALLERY' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('GALLERY')}
            >
              <FileText className="size-4 mr-1" />
              Factures
              {savedInvoices.length > 0 && (
                <span className="ml-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-medium">
                  {savedInvoices.length}
                </span>
              )}
            </Button>
          </nav>

          {/* Actions centrales (contextuelles) */}
          <div className="flex-1 flex justify-center gap-2">
            {view === 'EDIT' && !isFinalized && (
              <>
                <Button variant="outline" size="sm" onClick={handleSaveInvoice}>
                  <Save className="size-4 mr-1" />
                  Sauvegarder
                </Button>
                <Button size="sm" onClick={handleFinalize}>
                  <Download className="size-4 mr-1" />
                  Finaliser
                </Button>
              </>
            )}
            {view === 'EDIT' && isFinalized && (
              <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                <Download className="size-4 mr-1" />
                Télécharger PDF
              </Button>
            )}
          </div>

          {/* Outils droite */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => setShowProfile(true)} className="text-gray-500 dark:text-gray-400">
              <User className="size-3.5 mr-1" />
              <span className="text-xs">Profil</span>
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setShowClients(true)} className="text-gray-500 dark:text-gray-400">
              <Users className="size-3.5 mr-1" />
              <span className="text-xs">Clients</span>
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setShowTemplates(true)} className="text-gray-500 dark:text-gray-400">
              <Bookmark className="size-3.5 mr-1" />
              <span className="text-xs">Modèles</span>
            </Button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <Button variant="ghost" size="icon-xs" onClick={toggleTheme} className="text-gray-500 dark:text-gray-400">
              {theme === 'light' ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Bandeau finalisée */}
      {view === 'EDIT' && isFinalized && (
        <div className="no-print bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Facture finalisée — dupliquez-la pour créer une variante
            </p>
          </div>
        </div>
      )}

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
