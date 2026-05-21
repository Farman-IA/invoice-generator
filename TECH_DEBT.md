# Tech Debt

Journal des dettes techniques connues et assumées. Chaque entrée doit
contenir : date d'ouverture, périmètre, raison du report, critère de
clôture (idéalement chiffré ou conditionné à un événement).

## Ouvertes

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
