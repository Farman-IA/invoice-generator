---
task_id: invoice-generator-clean
task_description: full codebase clean code
auto_mode: true
save_mode: true
economy_mode: false
---

# Scan Results

## Detected Technologies
| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 19.2.4 |
| Build | Vite | 8.0.1 |
| UI | Tailwind CSS | 4.2.2 |
| UI | shadcn/ui (base-ui) | 1.3.0 |
| Icons | Lucide React | 1.7.0 |
| AI | Google GenAI | 1.48.0 |
| Language | TypeScript | 5.9.3 |

**Next.js:** No | **Zustand:** No | **TanStack Query:** No

## Docs to load
- general-clean-code.md (always)
- react-clean-code.md (React detected)

## Top Issues (priority order)
| # | File:Line | Issue | Priority |
|---|-----------|-------|----------|
| 1 | useInvoice.ts:36-43 | 3 refs parallèles synchronisées manuellement — stale closures | 🔴 |
| 2 | useInvoice.ts:184-199 | Polling setInterval 1s pour sync profil — inutile | 🔴 |
| 3 | useInvoice.ts:116-132 | Auto-save deps incomplètes — peut sauvegarder mauvaise facture | 🔴 |
| 4 | AIChatPanel.tsx:168-500 | Composant 332 lignes — trop de responsabilités | 🔴 |
| 5 | useQuotes.ts | Quasi-copie de useInvoice.ts — duplication massive | 🔴 |
| 6 | App.tsx:176-266 | handleApplyAIData 91 lignes — trop complexe | 🟡 |
| 7 | App.tsx:478-490 | 12 props passées à InvoiceDocument — prop drilling | 🟡 |
| 8 | useAIParser.ts:43-112 | Prompt 70 lignes hardcoded — pas maintenable | 🟡 |
| 9 | constants.ts:30-50 | getDefaultIssuer retourne données fictives | 🟡 |
| 10 | App.tsx:61,132 | eslint-disable-line sans justification | 🟡 |

## Good Patterns to Preserve
- Types TypeScript bien structurés (invoice.ts)
- Immutable state updates (spread operator)
- Storage abstraction (storage.ts)
- Debounced saves pattern
- Error formatting (useAIParser)
- InlineEdit / ClientAutocomplete composants bien faits
- Dual HT/TTC calculations
- cn() utility for Tailwind
