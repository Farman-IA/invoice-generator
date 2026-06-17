# Tech Debt

Journal des dettes techniques connues et assumées. Chaque entrée doit
contenir : date d'ouverture, périmètre, raison du report, critère de
clôture (idéalement chiffré ou conditionné à un événement).

## Ouvertes

### 2026-06-17 — Suggestions audit « IA dans les devis » (non bloquantes)
- **Périmètre** :
  - **Duplication des 2 handlers IA** (`handleApplyAIData` / `handleApplyAIDataQuote`
    dans `App.tsx`, ~40 lignes en miroir) : assumée et documentée. À mutualiser
    NATURELLEMENT lors du refactor `useDocument` déjà prévu ci-dessous, pas avant.
  - **`App.tsx` ~900 lignes** : sortir les vues `EDIT` et `QUOTE_EDIT` dans des
    composants dédiés (`<InvoiceEditView>` / `<QuoteEditView>`) le même jour que
    le refactor `useDocument` — videra ~150 lignes de JSX d'un coup.
  - **Tiroir IA mobile sans `role="dialog"` / `Escape` / piège de focus**
    (`App.tsx`, drawer mobile) : dette héritée (pré-existante, pas introduite par
    la feature devis). Remplacer le tiroir maison par le composant `Sheet` de
    shadcn/ui (gère ARIA + focus + Escape nativement, cohérent avec la règle
    projet « toujours shadcn/ui en priorité »).
- **Raison du report** : Farman a choisi « tout corriger » sur les BLOCKING +
  CRITICAL (verrou devis, tiroir cross-document, faux toast, `.catch`). Ces 3
  points restants sont du confort/lisibilité, sans risque monétaire ni juridique.
- **Critère de clôture** : duplication + taille `App.tsx` à traiter avec le
  refactor `useDocument` ; accessibilité du tiroir lors d'une passe shadcn/ui.

### 2026-05-21 — Refactor `useDocument` + extraction `clientMerge`
- **Périmètre** :
  - Extraire la logique de merge protégé dans `src/lib/clientMerge.ts`
    (aujourd'hui dupliquée entre `computeClientHydration` dans
    `App.tsx` et `mergeProtected` dans `src/hooks/useClients.ts` — même
    règle métier "ne jamais écraser un champ existant par une chaîne
    vide" implémentée à 2 endroits).
  - Consolider `hydrateClient` (et plus largement `updateClient`,
    `updateIssuer`, `addLineItem`, etc.) via un hook générique
    `useDocument`. Aujourd'hui `useInvoice` et `useQuotes` dupliquent
    ~200 lignes de logique état + persistance.
- **Raison du report** : limitation du risque de régression sur le MVP
  de facturation. Le fix SIRET (commit `47ef0dd`) touchait déjà la
  logique critique de sauvegarde client ; étendre le scope au refactor
  aurait élargi le blast radius sans bénéfice utilisateur immédiat.
- **Critère de clôture** : à traiter dès qu'un 3ᵉ type de document
  apparaît (ex : avoir, devis pro forma) OU qu'un 4ᵉ handler de save
  similaire est introduit (ex : `handleEmailInvoice`).
- **Référence mémoire** : `project_refactor_useDocument.md`

### 2026-05-27 — `BACKUP_KEYS` duplique la liste des clés de stockage
- **Périmètre** : la liste des clés à sauvegarder vit dans
  `BACKUP_KEYS` (`src/lib/backup.ts`) ET, séparément, dans l'objet
  `KEYS` privé de `src/lib/storage.ts`. Une nouvelle clé de stockage
  ajoutée à l'app ne sera PAS incluse dans l'export tant qu'on ne pense
  pas à l'ajouter aussi à `BACKUP_KEYS` → risque d'une sauvegarde
  silencieusement incomplète.
- **Raison du report** : exposer `KEYS` depuis `storage.ts` comme source
  unique demandait de toucher un fichier critique de persistance pour un
  gain nul côté utilisateur sur cette livraison. La feature backup devait
  rester isolée.
- **Critère de clôture** : à traiter au prochain ajout d'une clé de
  stockage (ex : `signatures`, `settings-entreprise`). À ce moment,
  exporter `STORAGE_KEYS` depuis `storage.ts` et faire dériver
  `BACKUP_KEYS` de cette source unique (en retirant explicitement
  `ai-settings` et `theme`).

### 2026-05-27 — Améliorations différées de la feature Sauvegarde
- **Périmètre** (suggestions d'audit non bloquantes) :
  - **Annulation après restauration réussie** : aujourd'hui une restauration
    du mauvais fichier écrase sans retour possible (le rollback ne couvre que
    l'échec d'écriture, pas le mauvais choix de fichier). Piste : exporter
    automatiquement l'état courant avant d'écraser, ou garder un instantané
    `backup:pre-restore`.
  - **Cohérence multi-onglets** : `restoreBackup` écrit via `localStorage`
    direct (comme `migrations.ts`) et ne publie pas sur le BroadcastChannel ;
    les autres onglets ouverts gardent l'ancien état jusqu'à un reload manuel.
    Le `window.location.reload()` ne corrige que l'onglet courant.
  - **Polish UX** : spinner pendant la lecture du fichier, re-toast de succès
    après le rechargement (via `sessionStorage`), jetons de thème shadcn
    (`text-muted-foreground`, `border-border`) au lieu des gris en dur.
- **Raison du report** : les protections critiques (restauration atomique,
  vrai remplacement, périmètre verrouillé, avertissement données bancaires,
  bouton destructif, gestion d'erreur de lecture, accessibilité de base) sont
  déjà livrées. Le reste est du confort, pas de la sûreté.
- **Critère de clôture** : à reprendre si la feature backup devient un usage
  régulier (export/import fréquent) ou si un retour utilisateur le réclame.

### 2026-06-11 — Suggestions différées de l'audit "refonte assistant IA"
- **Périmètre** (suggestions /review-code non bloquantes — les 2 BLOCKING et
  les CRITICAL de l'audit ont été corrigés dans la session) :
  - **Envoyer l'état réel de la facture à l'IA à chaque tour** (chantier
    "1b") : aujourd'hui l'IA ne connaît que la conversation, pas ce qui est
    réellement appliqué sur la facture (modifs manuelles incluses). C'est le
    correctif structurel définitif contre les doublons/dérives multi-tours ;
    la parade actuelle est une consigne anti-duplication dans le prompt.
  - **Confort tactile de l'aperçu IA** : cibles tactiles < 44px (suppression
    de ligne, select TVA), pas d'annulation après suppression d'une ligne
    (piste : toast sonner avec "Annuler").
  - **`displayParseResult` fait 3 métiers** (useChatConversation.ts) :
    construction du message, règle "content = historique IA", planification
    du backoff — à scinder au prochain passage.
  - **Règle "TTC placeholder à 0" encodée 2 fois** (DataPreview.handleApply
    et DataPreviewItems totaux) — extraire un normaliseur partagé.
  - **`mergeClientFromAI` recopie le carnet via `Object.entries`** sans
    liste blanche de clés (applyAIData.ts) : un futur champ interne de
    `ClientRecord` fuirait silencieusement dans la facture. Faire comme
    `LINE_ITEM_ALLOWED_KEYS`.
  - **`AISettingsSection.tsx` à 215 lignes** (au-dessus de la règle des
    200 ; était à 242 avant la session) : extraire le champ "clé API +
    validation visuelle" dans un sous-composant.
  - **Dérivation HT→TTC encore en dur** dans `App.tsx` (handleInsertTemplate)
    et `LineItemsTable.tsx` : migrer vers `getEffectiveUnitPriceTTC`
    (les occurrences NOUVELLES de la session utilisent déjà le helper).
- **Raison du report** : fin de session déjà dense (5 chantiers + audit +
  correctifs bloquants) ; ces points sont du confort/durcissement, pas de la
  sûreté monétaire.
- **Critère de clôture** : "1b" à traiter si un doublon de ligne multi-tours
  est observé en usage réel ; le reste au prochain passage sur les fichiers
  concernés.

### 2026-06-12 — Suggestions différées de l'audit "correction des dates"
- **Périmètre** (suggestions /review-code non bloquantes — le BLOCKING et les
  4 CRITICAL de l'audit ont été corrigés dans la session) :
  - **Faux toast "Dates corrigées"** si la facture ciblée a été supprimée dans
    un autre onglet pendant que la fenêtre est ouverte : `correctInvoiceDates`
    fait alors un `map` no-op mais sauvegarde et affiche un succès. Même travers
    que `markAsPaid`/`deleteInvoice`. Piste : drapeau `found` dans le `map` →
    `toast.error('Facture introuvable')` + `return` si non trouvée.
  - **Hiérarchie des messages dans la fenêtre** (`CorrectDatesDialog.tsx`) :
    l'avertissement légal ("ne corriger que si pas encore transmise") est en gris
    discret, alors que l'encart amber (info secondaire) attire l'œil. Piste :
    remonter la phrase légale dans un encart `AlertTriangle` dédié.
  - **Contrastes WCAG mineurs** : "(optionnelle)" en `text-gray-400` (~2,5:1) et
    anneau de focus `focus:ring-blue-200` (~1,4:1) sous le seuil. Hérités du
    champ recherche de la galerie → à harmoniser globalement, pas en isolé.
  - **Cibles tactiles < 44px** sur la rangée d'actions des cartes de la galerie
    (`InvoiceGallery.tsx`) : concerne TOUTE la rangée (télécharger / payé /
    supprimer / corriger), pré-existant. À agrandir globalement sous `sm:`.
- **Raison du report** : Farman a choisi le périmètre "bloquant + critiques".
  Ces points sont du confort/accessibilité fine, pas de la sûreté monétaire.
- **Critère de clôture** : contrastes + cibles tactiles à reprendre lors d'une
  passe accessibilité globale sur la galerie ; le faux toast au prochain passage
  sur `useInvoice.ts` (idéalement avec la même garde sur les fonctions voisines).
