# Analyse : Ajouter mode TTC au tableau des lignes

## Contexte

L'utilisateur est restaurateur, travaille en prix TTC. Mais `LineItemsTable.tsx` n'accepte que des prix HT. Resultat : perte d'1 centime sur certaines factures (ex: Universite de Lorraine 147,09 au lieu de 147,10).

## Fichiers concernes (deja lus)

| Fichier | Lignes cles | Role |
|---------|-------------|------|
| `src/types/invoice.ts` | 12-32 | IssuerProfile (stockage preference) |
| `src/lib/constants.ts` | 30-53 | getDefaultIssuer |
| `src/components/LineItemsTable.tsx` | 67-131 | Tableau des lignes |
| `src/components/InvoiceDocument.tsx` | 355-365 | Passe items a LineItemsTable |
| `src/components/ProfileModal.tsx` | 24-42 | Formulaire profil |
| `src/App.tsx` | 160-175 | Handlers de creation d'items |
| `src/lib/calculations.ts` | 29-90 | Deja correct (mode TTC existe) |

## Criteres d'acceptation

- [ ] AC1: Un toggle HT/TTC existe dans le profil emetteur
- [ ] AC2: Quand priceMode = 'ttc', la colonne prix affiche "Prix unitaire TTC"
- [ ] AC3: Quand priceMode = 'ttc', taper un prix met a jour unitPriceTTC (et unitPrice derive)
- [ ] AC4: Le total TTC est exact quand on entre des prix TTC (plus de perte de centime)
- [ ] AC5: Les factures existantes continuent de fonctionner (retrocompatibilite)
