import { AIChatBubble } from "@/components/AIChatBubble";
import { AIChatPanel } from "@/components/AIChatPanel";
import { BackupSection } from "@/components/BackupSection";
import { ClientsManager } from "@/components/ClientsManager";
import { Dashboard } from "@/components/Dashboard";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { InvoiceGallery } from "@/components/InvoiceGallery";
import { ProfileModal } from "@/components/ProfileModal";
import { QuoteGallery } from "@/components/QuoteGallery";
import { TemplatesManager } from "@/components/TemplatesManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { useArticleTemplates } from "@/hooks/useArticleTemplates";
import { useClients } from "@/hooks/useClients";
import { useInvoice } from "@/hooks/useInvoice";
import { useQuotes } from "@/hooks/useQuotes";
import { useTheme } from "@/hooks/useTheme";
import {
  buildItemsFromAI,
  buildMetaUpdateFromAI,
  buildQuoteMetaUpdateFromAI,
  mergeClientFromAI,
} from "@/lib/applyAIData";
import { round2 } from "@/lib/money";
import { generatePDF } from "@/lib/pdf";
import { storage } from "@/lib/storage";
import type {
  AppView,
  ArticleTemplate,
  ClientInfo,
  LineItem,
  ParsedInvoiceData,
  VatRate,
} from "@/types/invoice";
import {
  Archive,
  Bookmark,
  Download,
  FilePen,
  FileText,
  LayoutDashboard,
  Moon,
  Plus,
  Save,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function App() {
  // Factures
  const inv = useInvoice();
  // Devis
  const qt = useQuotes();

  const {
    clients,
    addClient,
    upsertClient,
    updateClient: updateClientRecord,
    deleteClient: deleteClientRecord,
    findByName,
    findExactByName,
    existsByName,
  } = useClients();
  const { templates, addTemplate, updateTemplate, deleteTemplate } =
    useArticleTemplates();
  const { theme, toggleTheme } = useTheme();
  const [logo, setLogo] = useState("");

  const docRef = useRef<HTMLDivElement>(null);

  // Vue globale (unifie factures et devis)
  const [view, setGlobalView] = useState<AppView>("DASHBOARD");

  // Remplir le carnet de clients à partir des factures/devis existants (une seule fois)
  useEffect(() => {
    if (inv.isLoading) return;
    const allClients = [
      ...inv.savedInvoices.map((i) => i.client),
      ...qt.savedQuotes.map((q) => q.client),
    ];
    for (const client of allClients) {
      if (client.companyName.trim() && !existsByName(client.companyName)) {
        addClient({ ...client });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exécution unique au chargement, les callbacks sont stables
  }, [inv.isLoading]);

  // Charger le logo au montage
  useEffect(() => {
    storage.getLogo().then(setLogo);
  }, []);

  const updateLogo = async (newLogo: string) => {
    setLogo(newLogo);
    await storage.saveLogo(newLogo);
  };

  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    function handleClick(e: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      )
        setShowSettings(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  // Ferme le tiroir IA mobile à chaque changement de document (facture ↔ devis).
  // Sans ça, un tiroir resté ouvert appliquerait la conversation au mauvais
  // document après navigation (trouvé par l'audit /review-code).
  useEffect(() => {
    setShowAIChat(false);
  }, [view]);

  // Règle CTO #2 : si l'utilisateur a tapé "CNRS" (nom exact) à la main dans
  // l'input client sans cliquer sur la suggestion d'autocomplete, on doit
  // quand même charger ses infos (SIRET, adresse...) depuis le carnet avant
  // la sauvegarde. On ne remplit QUE les champs vides du state pour ne pas
  // écraser ce que l'utilisateur aurait modifié exprès dans cette facture.
  //
  // Retourne le `Partial<ClientInfo>` à appliquer, ou null si rien à hydrater.
  // L'appelant doit utiliser `hydrateClient` (et pas `updateClient`) pour que
  // le save qui suit immédiatement voie bien les champs hydratés via stateRef.
  const computeClientHydration = (current: ClientInfo): Partial<ClientInfo> | null => {
    const match = findExactByName(current.companyName);
    if (!match) return null;
    const patch: Partial<ClientInfo> = {};
    for (const [key, value] of Object.entries(match)) {
      if (key === "id") continue;
      if (typeof value !== "string" || value.trim() === "") continue;
      const k = key as keyof ClientInfo;
      const currentValue = current[k];
      if (typeof currentValue === "string" && currentValue.trim() === "") {
        (patch as Record<string, string>)[k] = value;
      }
    }
    return Object.keys(patch).length > 0 ? patch : null;
  };

  // --- Handlers factures ---
  const handleDownloadPDF = async () => {
    if (!docRef.current) return;
    await generatePDF(
      docRef.current,
      inv.state.invoice.number,
      inv.state.client.companyName,
      "invoice",
    );
  };

  const handleFinalize = async () => {
    // Hydrate AVANT finalisation : si le nom matche un client du carnet, on
    // complète les champs vides du state (SIRET, adresse...) pour que la
    // facture finalisée parte avec les données du carnet, pas vide.
    //
    // Compromis assumé (MVP) : si finalizeInvoice échoue ensuite (items vides,
    // total nul...), l'hydratation reste visible à l'écran sans rollback. C'est
    // OK car (a) on prévient l'utilisateur que son client a bien été reconnu,
    // (b) en pratique hydration ne se déclenche que si companyName est non-vide,
    // donc seuls les échecs côté items peuvent provoquer ce cas.
    const hydration = computeClientHydration(inv.state.client);
    if (hydration) inv.hydrateClient(hydration);
    // Source de vérité unique pour le reste du handler : on NE peut PAS lire
    // inv.state.client après hydrateClient — React n'a pas encore re-render,
    // donc inv.state pointe sur l'ancien snapshot. On calcule finalClient une
    // fois et on l'utilise partout (validation + upsert du carnet).
    const finalClient = hydration
      ? { ...inv.state.client, ...hydration }
      : inv.state.client;

    const ok = await inv.finalizeInvoice();
    if (!ok) return;
    const clientName = finalClient.companyName.trim();
    if (!clientName) return;
    // upsertClient : merge protégé si existant (n'efface jamais un champ
    // déjà rempli au carnet), sinon ajoute.
    const wasNew = !existsByName(clientName);
    await upsertClient({ ...finalClient });
    if (wasNew) toast.success("Client ajouté au carnet");
  };

  const handleGalleryDownload = (id: string) => {
    inv.loadInvoice(id);
    setGlobalView("EDIT");
  };

  const handleSaveInvoice = async () => {
    const hydration = computeClientHydration(inv.state.client);
    if (hydration) inv.hydrateClient(hydration);
    // Cf. handleFinalize : on relit pas inv.state après hydrateClient (React
    // n'a pas re-render). finalClient = source unique pour le upsert carnet.
    const finalClient = hydration
      ? { ...inv.state.client, ...hydration }
      : inv.state.client;

    await inv.saveInvoice();
    const clientName = finalClient.companyName.trim();
    if (!clientName) return;
    const wasNew = !existsByName(clientName);
    await upsertClient({ ...finalClient });
    if (wasNew) toast.success("Client ajouté au carnet");
  };

  // --- Handlers devis ---
  const handleSaveQuote = async () => {
    const hydration = computeClientHydration(qt.state.client);
    if (hydration) qt.hydrateClient(hydration);
    // Cf. handleFinalize : on relit pas qt.state après hydrateClient (React
    // n'a pas re-render). finalClient = source unique pour le upsert carnet.
    const finalClient = hydration
      ? { ...qt.state.client, ...hydration }
      : qt.state.client;

    await qt.saveQuote();
    const clientName = finalClient.companyName.trim();
    if (!clientName) return;
    const wasNew = !existsByName(clientName);
    await upsertClient({ ...finalClient });
    if (wasNew) toast.success("Client ajouté au carnet");
  };

  const handleQuoteDownload = (id: string) => {
    qt.loadQuote(id);
    setGlobalView("QUOTE_EDIT");
  };

  const handleQuotePDF = async () => {
    if (!docRef.current) return;
    await generatePDF(
      docRef.current,
      qt.state.quote.number,
      qt.state.client.companyName,
      "quote",
    );
    toast.success("PDF du devis téléchargé");
  };

  // Conversion devis → facture
  const handleConvertToInvoice = (quoteId: string) => {
    const quote = qt.savedQuotes.find((q) => q.id === quoteId);
    if (!quote) return;

    // Pré-remplir une nouvelle facture avec les données du devis
    inv.newInvoice().then(() => {
      inv.updateIssuer(quote.issuer);
      inv.updateClient(quote.client);
      inv.updateInvoice({
        purchaseOrder: quote.quote.purchaseOrder,
        notes: `Réf. devis : ${quote.quote.number}\n${quote.quote.notes}`,
        items: quote.quote.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      });

      // Lier le devis à la facture
      qt.linkToInvoice(quoteId, "pending");

      setGlobalView("EDIT");
      toast.success(
        `Devis ${quote.quote.number} converti — vérifiez et sauvegardez la facture`,
      );
    });
  };

  // --- Shared handlers ---
  const handleSelectClient = (client: ClientInfo) => {
    if (view === "QUOTE_EDIT") qt.updateClient(client);
    else inv.updateClient(client);
  };

  const handleSaveAsTemplate = (item: LineItem) => {
    // Le template stocke toujours le HT comme forme canonique, arrondi au centime
    // pour ne pas propager une éventuelle imprécision de saisie aux factures futures.
    addTemplate({
      description: item.description,
      unit: item.unit,
      unitPrice: round2(item.unitPrice),
      vatRate: item.vatRate,
    });
  };

  const handleInsertTemplate = (template: ArticleTemplate) => {
    const priceMode = inv.state.issuer.priceMode ?? "ht";
    const vatRate = template.vatRate as VatRate;
    // En mode TTC, calculer le unitPriceTTC a partir du HT stocke
    const data =
      priceMode === "ttc"
        ? {
            description: template.description,
            unit: template.unit,
            unitPrice: round2(template.unitPrice),
            unitPriceTTC: round2(template.unitPrice * (1 + vatRate / 100)),
            vatRate,
          }
        : {
            description: template.description,
            unit: template.unit,
            unitPrice: round2(template.unitPrice),
            vatRate,
          };
    if (view === "QUOTE_EDIT") qt.addLineItem(data);
    else inv.addLineItem(data);
  };

  const handleApplyAIData = useCallback(
    (data: ParsedInvoiceData) => {
      const isNewInvoice = view !== "EDIT";
      // Garde : une facture finalisée est juridiquement figée — l'IA ne doit
      // jamais la modifier (défense en profondeur, en plus du panneau masqué).
      if (!isNewInvoice && inv.isFinalized) {
        toast.error("Cette facture est finalisée et ne peut plus être modifiée.");
        return;
      }
      const hasClient = !!(data.clientName && data.clientName.trim() !== "");
      const hasItems = data.items?.length > 0;

      const applyData = () => {
        const clientUpdate = mergeClientFromAI(data, isNewInvoice, findByName);
        if (clientUpdate) inv.updateClient(clientUpdate);

        if (hasItems) {
          const priceMode = inv.state.issuer.priceMode ?? "ht";
          const newItems = buildItemsFromAI(data, priceMode);
          // En modification d'articles seuls : on ajoute aux existants.
          // Sinon (nouvelle facture, OU client+articles fournis ensemble) : on remplace.
          if (!isNewInvoice && !hasClient) {
            inv.updateInvoice({
              items: [...inv.state.invoice.items, ...newItems],
            });
          } else {
            inv.updateInvoice({ items: newItems });
          }
        }

        const metaUpdate = buildMetaUpdateFromAI(data);
        if (Object.keys(metaUpdate).length > 0) inv.updateInvoice(metaUpdate);

        toast.success("Facture mise à jour par l'IA");
      };

      // Si pas en mode édition, créer une nouvelle facture et attendre le rendu.
      // .catch : si la création échoue (ex: stockage plein), on prévient au lieu
      // d'un échec silencieux où l'utilisateur a parlé à l'IA sans résultat.
      if (isNewInvoice) {
        inv.newInvoice().then(() => {
          setGlobalView("EDIT");
          setTimeout(applyData, 0);
        }).catch(() => toast.error("Impossible de créer la facture. Réessayez."));
      } else {
        applyData();
      }
    },
    [view, inv, findByName],
  );

  // Version DEVIS de handleApplyAIData : même logique, mais elle cible le hook
  // des devis (qt) au lieu des factures (inv). Les briques de transformation
  // (mergeClientFromAI, buildItemsFromAI) sont communes — seules les
  // métadonnées diffèrent (un devis n'a pas d'acompte → buildQuoteMetaUpdateFromAI).
  const handleApplyAIDataQuote = useCallback(
    (data: ParsedInvoiceData) => {
      const isNewQuote = view !== "QUOTE_EDIT";
      // Garde : un devis verrouillé (envoyé/accepté/refusé) est juridiquement
      // engagé — l'IA ne doit jamais le modifier (défense en profondeur).
      if (!isNewQuote && qt.isLocked) {
        toast.error("Ce devis est verrouillé et ne peut plus être modifié.");
        return;
      }
      const hasClient = !!(data.clientName && data.clientName.trim() !== "");
      const hasItems = data.items?.length > 0;

      const applyData = () => {
        const clientUpdate = mergeClientFromAI(data, isNewQuote, findByName);
        if (clientUpdate) qt.updateClient(clientUpdate);

        if (hasItems) {
          const priceMode = qt.state.issuer.priceMode ?? "ht";
          const newItems = buildItemsFromAI(data, priceMode);
          // Modification d'articles seuls : on ajoute aux existants.
          // Sinon (nouveau devis, OU client+articles ensemble) : on remplace.
          if (!isNewQuote && !hasClient) {
            qt.updateQuote({ items: [...qt.state.quote.items, ...newItems] });
          } else {
            qt.updateQuote({ items: newItems });
          }
        }

        const metaUpdate = buildQuoteMetaUpdateFromAI(data);
        if (Object.keys(metaUpdate).length > 0) qt.updateQuote(metaUpdate);

        toast.success("Devis mis à jour par l'IA");
      };

      // Si pas en mode édition devis, créer un nouveau devis et attendre le rendu.
      // .catch : voir handleApplyAIData — pas d'échec silencieux.
      if (isNewQuote) {
        qt.newQuote().then(() => {
          setGlobalView("QUOTE_EDIT");
          setTimeout(applyData, 0);
        }).catch(() => toast.error("Impossible de créer le devis. Réessayez."));
      } else {
        applyData();
      }
    },
    [view, qt, findByName],
  );

  if (inv.isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chargement...</p>
      </div>
    );
  }

  const isEditView = view === "EDIT" || view === "QUOTE_EDIT";
  // L'assistant IA n'est disponible que sur un document ÉDITABLE. Un devis
  // verrouillé ou une facture finalisée est juridiquement figé : afficher l'IA
  // dessus laisserait croire qu'on peut le modifier (faux toast "mis à jour")
  // et, pire, une modif pouvait être persistée en douce (cf. audit).
  const aiAvailable =
    (view === "EDIT" && !inv.isFinalized) ||
    (view === "QUOTE_EDIT" && !qt.isLocked);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 print:bg-white print:min-h-0">
      {/* Header */}
      <div className="no-print sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Navigation */}
          <nav className="flex gap-1">
            <Button
              variant={view === "DASHBOARD" ? "default" : "ghost"}
              size="sm"
              onClick={() => setGlobalView("DASHBOARD")}
            >
              <LayoutDashboard className="size-4 mr-1" />
              Accueil
            </Button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />
            <Button
              variant={view === "EDIT" ? "default" : "ghost"}
              size="sm"
              onClick={async () => {
                await inv.newInvoice();
                setGlobalView("EDIT");
              }}
            >
              <Plus className="size-4 mr-1" />
              Facture
            </Button>
            <Button
              variant={view === "GALLERY" ? "default" : "ghost"}
              size="sm"
              onClick={() => setGlobalView("GALLERY")}
            >
              <FileText className="size-4 mr-1" />
              Factures
              {inv.savedInvoices.length > 0 && (
                <span className="ml-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-medium">
                  {inv.savedInvoices.length}
                </span>
              )}
            </Button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />
            <Button
              variant={view === "QUOTE_EDIT" ? "default" : "ghost"}
              size="sm"
              onClick={async () => {
                await qt.newQuote();
                setGlobalView("QUOTE_EDIT");
              }}
            >
              <Plus className="size-4 mr-1" />
              Devis
            </Button>
            <Button
              variant={view === "QUOTE_GALLERY" ? "default" : "ghost"}
              size="sm"
              onClick={() => setGlobalView("QUOTE_GALLERY")}
            >
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
            {view === "EDIT" && !inv.isFinalized && (
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
            {view === "EDIT" && inv.isFinalized && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="size-4 mr-1" />
                  Télécharger PDF
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await inv.newInvoice();
                    setGlobalView("EDIT");
                  }}
                >
                  <Plus className="size-4 mr-1" />
                  Nouvelle facture
                </Button>
              </>
            )}

            {/* Devis : édition */}
            {view === "QUOTE_EDIT" && !qt.isLocked && (
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
            {view === "QUOTE_EDIT" && qt.isLocked && (
              <Button variant="outline" size="sm" onClick={handleQuotePDF}>
                <Download className="size-4 mr-1" />
                Télécharger PDF
              </Button>
            )}

            {isEditView && (
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            )}

            {/* Réglages */}
            <div className="relative" ref={settingsRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings((s) => !s)}
                className="text-gray-500 dark:text-gray-400"
              >
                <Settings className="size-4 mr-1" />
                Réglages
              </Button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
                  <button
                    onClick={() => {
                      setShowProfile(true);
                      setShowSettings(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <User className="size-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-200">
                      Mon profil
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowClients(true);
                      setShowSettings(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    <Users className="size-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-200">
                      Carnet de clients
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowTemplates(true);
                      setShowSettings(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    <Bookmark className="size-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-200">
                      Modèles d'articles
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowBackup(true);
                      setShowSettings(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    <Archive className="size-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-200">
                      Sauvegarde
                    </span>
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400"
            >
              {theme === "light" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Bandeau finalisée */}
      {view === "EDIT" && inv.isFinalized && (
        <div className="no-print bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Facture finalisée — dupliquez-la pour créer une variante
            </p>
          </div>
        </div>
      )}
      {view === "QUOTE_EDIT" && qt.isLocked && (
        <div className="no-print bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Ce devis n'est plus modifiable (statut :{" "}
              {qt.savedQuotes.find((q) => q.id === qt.currentQuoteId)?.status})
            </p>
          </div>
        </div>
      )}

      {/* Contenu */}
      {view === "DASHBOARD" && (
        <Dashboard
          invoices={inv.savedInvoices}
          quotes={qt.savedQuotes}
          onViewInvoices={() => setGlobalView("GALLERY")}
          onViewQuotes={() => setGlobalView("QUOTE_GALLERY")}
          onEditInvoice={(id) => {
            inv.loadInvoice(id);
            setGlobalView("EDIT");
          }}
          onEditQuote={(id) => {
            qt.loadQuote(id);
            setGlobalView("QUOTE_EDIT");
          }}
        />
      )}

      {view === "GALLERY" && (
        <div className="max-w-5xl mx-auto py-8 px-4">
          <InvoiceGallery
            invoices={inv.savedInvoices}
            onEdit={(id) => {
              inv.loadInvoice(id);
              setGlobalView("EDIT");
            }}
            onDuplicate={inv.duplicateInvoice}
            onDelete={inv.deleteInvoice}
            onDownload={handleGalleryDownload}
            onMarkPaid={inv.markAsPaid}
            onMarkUnpaid={inv.markAsUnpaid}
            onCorrectDates={inv.correctInvoiceDates}
          />
        </div>
      )}

      {view === "QUOTE_GALLERY" && (
        <div className="max-w-5xl mx-auto py-8 px-4">
          <QuoteGallery
            quotes={qt.savedQuotes}
            onEdit={(id) => {
              qt.loadQuote(id);
              setGlobalView("QUOTE_EDIT");
            }}
            onDuplicate={(id) => {
              qt.duplicateQuote(id);
              setGlobalView("QUOTE_EDIT");
            }}
            onDelete={qt.deleteQuote}
            onDownload={handleQuoteDownload}
            onUpdateStatus={qt.updateQuoteStatus}
            onConvertToInvoice={handleConvertToInvoice}
          />
        </div>
      )}

      {view === "EDIT" && (
        <div className="flex">
          {/* Chat IA — desktop sidebar (masqué si facture finalisée : un
              document figé ne doit pas pouvoir être modifié par l'IA) */}
          {!inv.isFinalized && (
            <div className="hidden lg:block w-80 xl:w-96 shrink-0 sticky top-13.25 h-[calc(100vh-53px)] no-print">
              <AIChatPanel
                open
                onClose={() => {}}
                onApplyData={handleApplyAIData}
                priceMode={inv.state.issuer.priceMode ?? "ht"}
              />
            </div>
          )}

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
              onAddLine={inv.isFinalized ? () => {} : () => inv.addLineItem()}
              onRemoveLine={inv.isFinalized ? () => {} : inv.removeLineItem}
              onUpdateLine={inv.isFinalized ? () => {} : inv.updateLineItem}
              findClientByName={inv.isFinalized ? undefined : findByName}
              onSelectClient={inv.isFinalized ? undefined : handleSelectClient}
              templates={inv.isFinalized ? undefined : templates}
              onSaveAsTemplate={
                inv.isFinalized ? undefined : handleSaveAsTemplate
              }
              onInsertTemplate={
                inv.isFinalized ? undefined : handleInsertTemplate
              }
              priceMode={inv.state.issuer.priceMode ?? "ht"}
              onPriceModeChange={
                inv.isFinalized
                  ? undefined
                  : (mode) => {
                      inv.updateIssuer({ priceMode: mode });
                      qt.updateIssuer({ priceMode: mode });
                    }
              }
            />
          </div>
        </div>
      )}

      {view === "QUOTE_EDIT" && (
        <div className="flex">
          {/* Chat IA — desktop sidebar (masqué si devis verrouillé :
              envoyé/accepté/refusé = juridiquement engagé) */}
          {!qt.isLocked && (
            <div className="hidden lg:block w-80 xl:w-96 shrink-0 sticky top-13.25 h-[calc(100vh-53px)] no-print">
              <AIChatPanel
                open
                onClose={() => {}}
                onApplyData={handleApplyAIDataQuote}
                priceMode={qt.state.issuer.priceMode ?? "ht"}
              />
            </div>
          )}

          {/* Devis */}
          <div className="flex-1 py-8 px-4 max-w-5xl mx-auto print:p-0 print:max-w-full">
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
              onAddLine={qt.isLocked ? () => {} : () => qt.addLineItem()}
              onRemoveLine={qt.isLocked ? () => {} : qt.removeLineItem}
              onUpdateLine={qt.isLocked ? () => {} : qt.updateLineItem}
              findClientByName={qt.isLocked ? undefined : findByName}
              onSelectClient={qt.isLocked ? undefined : handleSelectClient}
              templates={qt.isLocked ? undefined : templates}
              onSaveAsTemplate={qt.isLocked ? undefined : handleSaveAsTemplate}
              onInsertTemplate={qt.isLocked ? undefined : handleInsertTemplate}
              priceMode={qt.state.issuer.priceMode ?? "ht"}
              onPriceModeChange={
                qt.isLocked
                  ? undefined
                  : (mode) => {
                      qt.updateIssuer({ priceMode: mode });
                      inv.updateIssuer({ priceMode: mode });
                    }
              }
            />
          </div>
        </div>
      )}

      {/* Modales */}
      <ProfileModal
        open={showProfile}
        onOpenChange={setShowProfile}
        issuer={inv.state.issuer}
        onUpdateIssuer={inv.updateIssuer}
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
      <BackupSection open={showBackup} onOpenChange={setShowBackup} />

      <Dialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finaliser cette facture ?</DialogTitle>
            <DialogDescription>
              Une fois finalisée, la facture ne pourra plus être modifiée
              (obligation légale française). Un PDF sera généré et téléchargé
              automatiquement.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Annuler
            </DialogClose>
            <Button
              onClick={() => {
                setShowFinalizeConfirm(false);
                handleFinalize();
              }}
            >
              <Download className="size-4 mr-1" />
              Finaliser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat IA — mobile drawer (factures ET devis). Affiché seulement si le
          document est éditable (pas finalisé/verrouillé). Le handler et le mode
          de prix s'adaptent à la vue active : devis → qt, facture → inv. */}
      {aiAvailable && (
        <>
          <AIChatBubble
            onClick={() => setShowAIChat(true)}
            isOpen={showAIChat}
          />
          {showAIChat && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/40 transition-opacity duration-200"
                onClick={() => setShowAIChat(false)}
              />
              <div
                className="absolute inset-y-0 left-0 w-80 max-w-[85vw] shadow-xl transition-transform duration-200"
                style={{ animation: "slideInLeft 200ms ease-out" }}
              >
                {/* key={view} : remonte le panneau (et réinitialise la
                    conversation) quand on passe de facture à devis, pour ne
                    jamais appliquer un échange au mauvais document. */}
                <AIChatPanel
                  key={view}
                  open={true}
                  onClose={() => setShowAIChat(false)}
                  onApplyData={
                    view === "QUOTE_EDIT"
                      ? handleApplyAIDataQuote
                      : handleApplyAIData
                  }
                  priceMode={
                    (view === "QUOTE_EDIT"
                      ? qt.state.issuer.priceMode
                      : inv.state.issuer.priceMode) ?? "ht"
                  }
                />
              </div>
            </div>
          )}
        </>
      )}

      <Toaster position="bottom-right" duration={3000} />
    </div>
  );
}

export default App;
