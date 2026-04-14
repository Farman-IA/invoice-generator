# Execute : Mode TTC au tableau

## Changements appliques

### Implementation initiale (6 taches)
1. ✅ `priceMode?: PriceMode` dans `IssuerProfile` (optionnel pour retrocompat)
2. ✅ `priceMode: 'ht'` dans `getDefaultIssuer()`
3. ✅ `LineItemsTable` : prop `priceMode`, header adaptatif, input conversion TTC↔HT
4. ✅ `InvoiceDocument` : propage `priceMode` au tableau
5. ✅ `App.tsx` : passe `issuer.priceMode ?? 'ht'` (factures + devis)
6. ✅ `ProfileModal` : toggle HT/TTC

### Corrections apres adversarial review (6 fixes)
1. ✅ FIX-1: `priceMode?: PriceMode` optionnel (retrocompat profils)
2. ✅ FIX-2: **Bug TVA negative en mode mixte** - `calculations.ts` incremente correctement `totalTTC` et `current.totalTTC` dans la branche HT
3. ✅ FIX-3: `handleInsertTemplate` cree `unitPriceTTC` en mode TTC
4. ✅ FIX-4: `handleApplyAIData` normalise les items selon le mode du profil
5. ✅ FIX-5: ProfileModal avertit quand le mode change
6. ✅ FIX-6: Build + Lint = 0 erreur, 0 warning

## Resultat

- Build: OK
- Lint: 0 erreur, 0 warning
- TypeScript: 0 erreur
- Le mode mixte HT/TTC ne produit plus de TVA negative
- Les templates respectent le mode actif
- L'IA respecte le mode du profil
