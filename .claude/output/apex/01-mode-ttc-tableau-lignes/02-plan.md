# Plan : Ajouter mode TTC au tableau des lignes

## Strategie

Stocker `priceMode` dans `IssuerProfile` (preference globale). Passer cette valeur depuis `App.tsx` jusqu'a `LineItemsTable.tsx` qui adapte sa colonne prix selon le mode.

## Changements par fichier

### 1. `src/types/invoice.ts`
- Ajouter `priceMode: 'ht' | 'ttc'` dans `IssuerProfile`
- Le type `PriceMode` existe deja (ligne 121), le reutiliser

### 2. `src/lib/constants.ts`
- Ajouter `priceMode: 'ht'` dans `getDefaultIssuer()` (defaut HT pour retrocompat)

### 3. `src/components/ProfileModal.tsx`
- Ajouter une nouvelle section "Mode de saisie" avec un toggle HT/TTC
- Ne peut pas utiliser le pattern FIELDS (qui est text-only), faire un bloc dedie

### 4. `src/components/LineItemsTable.tsx`
- Ajouter prop `priceMode: 'ht' | 'ttc'`
- Si TTC : header devient "Prix unitaire TTC", header total devient "Total TTC"
- En mode TTC : input edite `unitPriceTTC`, et calcule automatiquement `unitPrice = unitPriceTTC / (1 + vatRate/100)` sans arrondi
- En mode HT : comportement actuel inchange

### 5. `src/components/InvoiceDocument.tsx`
- Ajouter prop `priceMode` a l'interface
- La passer a `LineItemsTable`

### 6. `src/App.tsx`
- Passer `inv.state.issuer.priceMode ?? 'ht'` a `InvoiceDocument`
- Dans les handlers `addLineItem` (mode TTC : creer item avec unitPriceTTC=0, unitPrice=0)
- Pas necessaire pour le defaut — `createDefaultLineItem()` peut rester HT

### 7. `src/lib/calculations.ts`
- Aucun changement (deja fonctionnel en TTC)

### 8. `src/hooks/useInvoice.ts` et `src/hooks/useQuotes.ts`
- Aucun changement

## Criteres d'acceptation

- [ ] AC1: Toggle HT/TTC dans le profil
- [ ] AC2: Colonne "Prix unitaire TTC" quand mode TTC
- [ ] AC3: Saisie TTC met a jour unitPriceTTC (pas unitPrice directement)
- [ ] AC4: Total TTC exact (plus de perte de centime)
- [ ] AC5: Factures existantes continuent de fonctionner

## Ordre d'execution

1. types → 2. constants → 3. LineItemsTable → 4. InvoiceDocument → 5. App.tsx → 6. ProfileModal → 7. Build + Lint
