import { useRef, useEffect, useState, useCallback } from 'react'
import { LayoutDashboard, Plus, FileText, FilePen, Save, Download, Sun, Moon, Settings, User, Users, Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Dashboard } from '@/components/Dashboard'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceGallery } from '@/components/InvoiceGallery'
import { QuoteGallery } from '@/components/QuoteGallery'
import { ProfileModal } from '@/components/ProfileModal'
import { ClientsManager } from '@/components/ClientsManager'
import { TemplatesManager } from '@/components/TemplatesManager'
import { AIChatPanel } from '@/components/AIChatPanel'
import { AIChatBubble } from '@/components/AIChatBubble'
import { useInvoice } from '@/hooks/useInvoice'
import { useQuotes } from '@/hooks/useQuotes'
import { useClients } from '@/hooks/useClients'
import { useArticleTemplates } from '@/hooks/useArticleTemplates'
import { useTheme } from '@/hooks/useTheme'
import { generatePDF } from '@/lib/pdf'
import { storage } from '@/lib/storage'
import type { ClientInfo, InvoiceData, LineItem, ArticleTemplate, VatRate, AppView, ParsedInvoiceData } from '@/types/invoice'

function App() {
  // Factures
  const inv = useInvoice()
  // Devis
  const qt = useQuotes()

  const { clients, addClient, updateClient: updateClientRecord, deleteClient: deleteClientRecord, findByName, existsByName } = useClients()
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useArticleTemplates()
  const { theme, toggleTheme } = useTheme()
  const [logo, setLogo] = useState('')

  const docRef = useRef<HTMLDivElement>(null)

  // Vue globale (unifie factures et devis)
  const [view, setGlobalView] = useState<AppView>('DASHBOARD')

  // Remplir le carnet de clients à partir des factures/devis existants (une seule fois)
  useEffect(() => {
    if (inv.isLoading) return
    const allClients = [
      ...inv.savedInvoices.map(i => i.client),
      ...qt.savedQuotes.map(q => q.client),
    ]
    for (const client of allClients) {
      if (client.companyName.trim() && !existsByName(client.companyName)) {
        addClient({ ...client })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- exécution unique au chargement, les callbacks sont stables
  }, [inv.isLoading])

  // Charger le logo au montage
  useEffect(() => {
    storage.getLogo().then(setLogo)
  }, [])

  const updateLogo = async (newLogo: string) => {
    setLogo(newLogo)
    await storage.saveLogo(newLogo)
  }



  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showClients, setShowClients] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showSettings) return
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSettings])

  // --- Handlers factures ---
  const handleDownloadPDF = async () => {
    if (!docRef.current) return
    await generatePDF(docRef.current, inv.state.invoice.number, inv.state.client.companyName, 'invoice')
  }

  const handleFinalize = async () => {
    await inv.finalizeInvoice()
  }

  const handleGalleryDownload = (id: string) => {
    inv.loadInvoice(id)
    setGlobalView('EDIT')
  }

  const handleSaveInvoice = async () => {
    await inv.saveInvoice()
    const clientName = inv.state.client.companyName.trim()
    if (clientName && !existsByName(clientName)) {
      await addClient({ ...inv.state.client })
      toast.success('Client ajouté au carnet')
    }
  }

  // --- Handlers devis ---
  const handleSaveQuote = async () => {
    await qt.saveQuote()
    const clientName = qt.state.client.companyName.trim()
    if (clientName && !existsByName(clientName)) {
      await addClient({ ...qt.state.client })
      toast.success('Client ajouté au carnet')
    }
  }

  const handleQuoteDownload = (id: string) => {
    qt.loadQuote(id)
    setGlobalView('QUOTE_EDIT')
  }

  const handleQuotePDF = async () => {
    if (!docRef.current) return
    await generatePDF(docRef.current, qt.state.quote.number, qt.state.client.companyName, 'quote')
    toast.success('PDF du devis téléchargé')
  }

  // Conversion devis → facture
  const handleConvertToInvoice = (quoteId: string) => {
    const quote = qt.savedQuotes.find(q => q.id === quoteId)
    if (!quote) return

    // Pré-remplir une nouvelle facture avec les données du devis
    inv.newInvoice().then(() => {
      inv.updateIssuer(quote.issuer)
      inv.updateClient(quote.client)
      inv.updateInvoice({
        purchaseOrder: quote.quote.purchaseOrder,
        notes: `Réf. devis : ${quote.quote.number}\n${quote.quote.notes}`,
        items: quote.quote.items.map(item => ({ ...item, id: crypto.randomUUID() })),
      })

      // Lier le devis à la facture
      qt.linkToInvoice(quoteId, 'pending')

      setGlobalView('EDIT')
      toast.success(`Devis ${quote.quote.number} converti — vérifiez et sauvegardez la facture`)
    })
  }

  // --- Shared handlers ---
  const handleSelectClient = (client: ClientInfo) => {
    if (view === 'QUOTE_EDIT') qt.updateClient(client)
    else inv.updateClient(client)
  }

  const handleSaveAsTemplate = (item: LineItem) => {
    // Le template stocke toujours le HT comme forme canonique (item.unitPrice est le HT, derive si TTC)
    addTemplate({ description: item.description, unit: item.unit, unitPrice: item.unitPrice, vatRate: item.vatRate })
  }

  const handleInsertTemplate = (template: ArticleTemplate) => {
    const priceMode = inv.state.issuer.priceMode ?? 'ht'
    const vatRate = template.vatRate as VatRate
    // En mode TTC, calculer le unitPriceTTC a partir du HT stocke
    const data = priceMode === 'ttc'
      ? {
          description: template.description,
          unit: template.unit,
          unitPrice: template.unitPrice,
          unitPriceTTC: Math.round(template.unitPrice * (1 + vatRate / 100) * 100) / 100,
          vatRate,
        }
      : { description: template.description, unit: template.unit, unitPrice: template.unitPrice, vatRate }
    if (view === 'QUOTE_EDIT') qt.addLineItem(data)
    else inv.addLineItem(data)
  }

  const handleApplyAIData = useCallback((data: ParsedInvoiceData) => {
    const isNewInvoice = view !== 'EDIT'
    const hasClient = data.clientName && data.clientName.trim() !== ''
    const hasItems = data.items?.length > 0

    const applyData = () => {
      // Client : fusionner au lieu de remplacer
      if (hasClient) {
        const matches = findByName(data.clientName)
        if (matches.length > 0) {
          const match = matches[0]
          // L'IA peut enrichir un client existant : ses donnees non vides gagnent sur celles du carnet
          inv.updateClient({
            companyName: match.companyName,
            department: data.clientDepartment || match.department,
            contactName: data.contactName || match.contactName,
            address: data.clientAddress || match.address,
            addressLine2: data.clientAddressLine2 || match.addressLine2,
            postalCode: data.clientPostalCode || match.postalCode,
            city: data.clientCity || match.city,
            siren: match.siren,
            tvaNumber: match.tvaNumber,
            codeService: data.codeService || match.codeService,
          })
        } else if (isNewInvoice) {
          // Nouvelle facture : remplir tout
          inv.updateClient({
            companyName: data.clientName,
            department: data.clientDepartment ?? '',
            contactName: data.contactName ?? '',
            address: data.clientAddress ?? '',
            addressLine2: data.clientAddressLine2 ?? '',
            postalCode: data.clientPostalCode ?? '',
            city: data.clientCity ?? '',
            siren: '',
            tvaNumber: '',
            codeService: data.codeService ?? '',
          })
        } else {
          // Modification : ne toucher QUE les champs fournis par l'IA
          const clientUpdate: Partial<ClientInfo> = { companyName: data.clientName }
          if (data.clientDepartment) clientUpdate.department = data.clientDepartment
          if (data.contactName) clientUpdate.contactName = data.contactName
          if (data.clientAddress) clientUpdate.address = data.clientAddress
          if (data.clientAddressLine2) clientUpdate.addressLine2 = data.clientAddressLine2
          if (data.clientPostalCode) clientUpdate.postalCode = data.clientPostalCode
          if (data.clientCity) clientUpdate.city = data.clientCity
          if (data.codeService) clientUpdate.codeService = data.codeService
          inv.updateClient(clientUpdate)
        }
      } else if (data.codeService) {
        // Pas de nouveau client mais l'IA a fourni un code service → l'appliquer au client courant
        inv.updateClient({ codeService: data.codeService })
      }

      // Articles
      if (hasItems) {
        const profilePriceMode = inv.state.issuer.priceMode ?? 'ht'
        const newItems = data.items.map(item => {
          // Normaliser selon le mode du profil
          const base = {
            id: crypto.randomUUID(),
            description: item.description,
            unit: 'unité',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
          }
          if (profilePriceMode === 'ttc') {
            // Si l'IA a deja fourni un TTC, l'utiliser. Sinon, le deriver du HT.
            const unitPriceTTC = item.unitPriceTTC != null
              ? item.unitPriceTTC
              : Math.round(item.unitPrice * (1 + item.vatRate / 100) * 100) / 100
            return { ...base, unitPriceTTC }
          }
          // Mode HT : pas de unitPriceTTC
          return base
        })

        if (isNewInvoice || !hasClient) {
          // Nouvelle facture OU modification d'articles seuls → remplacer si nouvelle, ajouter si modification
          if (isNewInvoice) {
            inv.updateInvoice({ items: newItems })
          } else {
            // Modification : ajouter les nouveaux articles aux existants
            inv.updateInvoice({ items: [...inv.state.invoice.items, ...newItems] })
          }
        } else {
          // L'IA a fourni client ET articles → c'est une description complete, remplacer
          inv.updateInvoice({ items: newItems })
        }
      }

      // Métadonnées et acompte
      const metaUpdate: Partial<InvoiceData> = {}
      if (data.purchaseOrder) metaUpdate.purchaseOrder = data.purchaseOrder
      if (data.notes) metaUpdate.notes = data.notes
      if (data.deposit != null && data.deposit > 0) metaUpdate.deposit = data.deposit
      if (Object.keys(metaUpdate).length > 0) {
        inv.updateInvoice(metaUpdate)
      }

      toast.success('Facture mise à jour par l\'IA')
    }

    // Si pas en mode édition, créer une nouvelle facture et attendre le rendu
    if (isNewInvoice) {
      inv.newInvoice().then(() => {
        setGlobalView('EDIT')
        setTimeout(applyData, 0)
      })
    } else {
      applyData()
    }
  }, [view, inv, findByName])

  if (inv.isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chargement...</p>
      </div>
    )
  }

  const isEditView = view === 'EDIT' || view === 'QUOTE_EDIT'

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 print:bg-white print:min-h-0">
      {/* Header */}
      <div className="no-print sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Navigation */}
          <nav className="flex gap-1">
            <Button variant={view === 'DASHBOARD' ? 'default' : 'ghost'} size="sm"
              onClick={() => setGlobalView('DASHBOARD')}>
              <LayoutDashboard className="size-4 mr-1" />
              Accueil
            </Button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />
            <Button variant={view === 'EDIT' ? 'default' : 'ghost'} size="sm"
              onClick={async () => { await inv.newInvoice(); setGlobalView('EDIT') }}>
              <Plus className="size-4 mr-1" />
              Facture
            </Button>
            <Button variant={view === 'GALLERY' ? 'default' : 'ghost'} size="sm"
              onClick={() => setGlobalView('GALLERY')}>
              <FileText className="size-4 mr-1" />
              Factures
              {inv.savedInvoices.length > 0 && (
                <span className="ml-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-medium">
                  {inv.savedInvoices.length}
                </span>
              )}
            </Button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />
            <Button variant={view === 'QUOTE_EDIT' ? 'default' : 'ghost'} size="sm"
              onClick={async () => { await qt.newQuote(); setGlobalView('QUOTE_EDIT') }}>
              <Plus className="size-4 mr-1" />
              Devis
            </Button>
            <Button variant={view === 'QUOTE_GALLERY' ? 'default' : 'ghost'} size="sm"
              onClick={() => setGlobalView('QUOTE_GALLERY')}>
              <FilePen className="size-4 mr-1" />
              Devis
              {qt.savedQuotes.length > 0 && (
                <span className="ml-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-medium">
                  {qt.savedQuotes.length}
                </span>
              )}
            </Button>
          </nav>

          <div className="flex-1" />

          {/* Actions contextuelles */}
          <div className="flex items-center gap-2">
            {/* Facture : édition */}
            {view === 'EDIT' && !inv.isFinalized && (
              <>
                <Button variant="outline" size="sm" onClick={handleSaveInvoice}>
                  <Save className="size-4 mr-1" />
                  Sauvegarder
                </Button>
                <Button size="sm" onClick={() => setShowFinalizeConfirm(true)}>
                  Finaliser
                </Button>
              </>
            )}
            {view === 'EDIT' && inv.isFinalized && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="size-4 mr-1" />
                  Télécharger PDF
                </Button>
                <Button size="sm" onClick={async () => { await inv.newInvoice(); setGlobalView('EDIT') }}>
                  <Plus className="size-4 mr-1" />
                  Nouvelle facture
                </Button>
              </>
            )}

            {/* Devis : édition */}
            {view === 'QUOTE_EDIT' && !qt.isLocked && (
              <>
                <Button variant="outline" size="sm" onClick={handleSaveQuote}>
                  <Save className="size-4 mr-1" />
                  Sauvegarder
                </Button>
                <Button variant="outline" size="sm" onClick={handleQuotePDF}>
                  <Download className="size-4 mr-1" />
                  Télécharger PDF
                </Button>
              </>
            )}
            {view === 'QUOTE_EDIT' && qt.isLocked && (
              <Button variant="outline" size="sm" onClick={handleQuotePDF}>
                <Download className="size-4 mr-1" />
                Télécharger PDF
              </Button>
            )}

            {isEditView && <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />}

            {/* Réglages */}
            <div className="relative" ref={settingsRef}>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(s => !s)} className="text-gray-500 dark:text-gray-400">
                <Settings className="size-4 mr-1" />
                Réglages
              </Button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
                  <button onClick={() => { setShowProfile(true); setShowSettings(false) }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <User className="size-4 text-gray-400" /><span className="text-gray-700 dark:text-gray-200">Mon profil</span>
                  </button>
                  <button onClick={() => { setShowClients(true); setShowSettings(false) }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700">
                    <Users className="size-4 text-gray-400" /><span className="text-gray-700 dark:text-gray-200">Carnet de clients</span>
                  </button>
                  <button onClick={() => { setShowTemplates(true); setShowSettings(false) }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700">
                    <Bookmark className="size-4 text-gray-400" /><span className="text-gray-700 dark:text-gray-200">Modèles d'articles</span>
                  </button>
                </div>
              )}
            </div>

            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} className="text-gray-500 dark:text-gray-400">
              {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Bandeau finalisée */}
      {view === 'EDIT' && inv.isFinalized && (
        <div className="no-print bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Facture finalisée — dupliquez-la pour créer une variante</p>
          </div>
        </div>
      )}
      {view === 'QUOTE_EDIT' && qt.isLocked && (
        <div className="no-print bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center">
            <p className="text-sm text-blue-700 dark:text-blue-400">Ce devis n'est plus modifiable (statut : {qt.savedQuotes.find(q => q.id === qt.currentQuoteId)?.status})</p>
          </div>
        </div>
      )}

      {/* Contenu */}
      {view === 'DASHBOARD' && (
        <Dashboard
          invoices={inv.savedInvoices}
          quotes={qt.savedQuotes}
          onViewInvoices={() => setGlobalView('GALLERY')}
          onViewQuotes={() => setGlobalView('QUOTE_GALLERY')}
          onEditInvoice={(id) => { inv.loadInvoice(id); setGlobalView('EDIT') }}
          onEditQuote={(id) => { qt.loadQuote(id); setGlobalView('QUOTE_EDIT') }}
        />
      )}

      {view === 'GALLERY' && (
        <div className="max-w-5xl mx-auto py-8 px-4">
          <InvoiceGallery
            invoices={inv.savedInvoices}
            onEdit={(id) => { inv.loadInvoice(id); setGlobalView('EDIT') }}
            onDuplicate={inv.duplicateInvoice}
            onDelete={inv.deleteInvoice}
            onDownload={handleGalleryDownload}
            onMarkPaid={inv.markAsPaid}
            onMarkUnpaid={inv.markAsUnpaid}
          />
        </div>
      )}

      {view === 'QUOTE_GALLERY' && (
        <div className="max-w-5xl mx-auto py-8 px-4">
          <QuoteGallery
            quotes={qt.savedQuotes}
            onEdit={(id) => { qt.loadQuote(id); setGlobalView('QUOTE_EDIT') }}
            onDuplicate={(id) => { qt.duplicateQuote(id); setGlobalView('QUOTE_EDIT') }}
            onDelete={qt.deleteQuote}
            onDownload={handleQuoteDownload}
            onUpdateStatus={qt.updateQuoteStatus}
            onConvertToInvoice={handleConvertToInvoice}
          />
        </div>
      )}

      {view === 'EDIT' && (
        <div className="flex">
          {/* Chat IA — desktop sidebar */}
          <div className="hidden lg:block w-80 xl:w-96 flex-shrink-0 sticky top-[53px] h-[calc(100vh-53px)] no-print">
            <AIChatPanel open onClose={() => {}} onApplyData={handleApplyAIData} />
          </div>

          {/* Facture */}
          <div className="flex-1 py-8 px-4 max-w-5xl mx-auto print:p-0 print:max-w-full">
            <InvoiceDocument
              ref={docRef}
              mode="invoice"
              issuer={inv.state.issuer}
              client={inv.state.client}
              invoice={inv.state.invoice}
              logo={logo}
              onUpdateLogo={inv.isFinalized ? () => {} : updateLogo}
              onUpdateIssuer={inv.isFinalized ? () => {} : inv.updateIssuer}
              onUpdateClient={inv.isFinalized ? () => {} : inv.updateClient}
              onUpdateInvoice={inv.isFinalized ? () => {} : inv.updateInvoice}
              onAddLine={inv.isFinalized ? () => {} : inv.addLineItem}
              onRemoveLine={inv.isFinalized ? () => {} : inv.removeLineItem}
              onUpdateLine={inv.isFinalized ? () => {} : inv.updateLineItem}
              findClientByName={inv.isFinalized ? undefined : findByName}
              onSelectClient={inv.isFinalized ? undefined : handleSelectClient}
              templates={inv.isFinalized ? undefined : templates}
              onSaveAsTemplate={inv.isFinalized ? undefined : handleSaveAsTemplate}
              onInsertTemplate={inv.isFinalized ? undefined : handleInsertTemplate}
              priceMode={inv.state.issuer.priceMode ?? 'ht'}
              onPriceModeChange={inv.isFinalized ? undefined : (mode) => {
                inv.updateIssuer({ priceMode: mode })
                qt.updateIssuer({ priceMode: mode })
              }}
            />
          </div>
        </div>
      )}

      {view === 'QUOTE_EDIT' && (
        <div className="py-8 px-4">
          <InvoiceDocument
            ref={docRef}
            mode="quote"
            issuer={qt.state.issuer}
            client={qt.state.client}
            invoice={qt.state.quote}
            logo={logo}
            onUpdateLogo={qt.isLocked ? () => {} : updateLogo}
            onUpdateIssuer={qt.isLocked ? () => {} : qt.updateIssuer}
            onUpdateClient={qt.isLocked ? () => {} : qt.updateClient}
            onUpdateInvoice={qt.isLocked ? () => {} : qt.updateQuote}
            onAddLine={qt.isLocked ? () => {} : qt.addLineItem}
            onRemoveLine={qt.isLocked ? () => {} : qt.removeLineItem}
            onUpdateLine={qt.isLocked ? () => {} : qt.updateLineItem}
            findClientByName={qt.isLocked ? undefined : findByName}
            onSelectClient={qt.isLocked ? undefined : handleSelectClient}
            templates={qt.isLocked ? undefined : templates}
            onSaveAsTemplate={qt.isLocked ? undefined : handleSaveAsTemplate}
            onInsertTemplate={qt.isLocked ? undefined : handleInsertTemplate}
            priceMode={qt.state.issuer.priceMode ?? 'ht'}
            onPriceModeChange={qt.isLocked ? undefined : (mode) => {
              qt.updateIssuer({ priceMode: mode })
              inv.updateIssuer({ priceMode: mode })
            }}
          />
        </div>
      )}

      {/* Modales */}
      <ProfileModal open={showProfile} onOpenChange={setShowProfile} issuer={inv.state.issuer} onUpdateIssuer={inv.updateIssuer} />
      <ClientsManager open={showClients} onOpenChange={setShowClients} clients={clients} onUpdate={updateClientRecord} onDelete={deleteClientRecord} />
      <TemplatesManager open={showTemplates} onOpenChange={setShowTemplates} templates={templates} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} />

      <Dialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finaliser cette facture ?</DialogTitle>
            <DialogDescription>
              Une fois finalisée, la facture ne pourra plus être modifiée (obligation légale française). Un PDF sera généré et téléchargé automatiquement.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
            <Button onClick={() => { setShowFinalizeConfirm(false); handleFinalize() }}>
              <Download className="size-4 mr-1" />Finaliser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat IA — mobile drawer */}
      {view === 'EDIT' && (
        <>
          <AIChatBubble onClick={() => setShowAIChat(true)} isOpen={showAIChat} />
          {showAIChat && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/40 transition-opacity duration-200"
                onClick={() => setShowAIChat(false)}
              />
              <div
                className="absolute inset-y-0 left-0 w-80 max-w-[85vw] shadow-xl transition-transform duration-200"
                style={{ animation: 'slideInLeft 200ms ease-out' }}
              >
                <AIChatPanel open={true} onClose={() => setShowAIChat(false)} onApplyData={handleApplyAIData} />
              </div>
            </div>
          )}
        </>
      )}

      <Toaster position="bottom-right" duration={3000} />
    </div>
  )
}

export default App
