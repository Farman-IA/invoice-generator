# Invoice Generator

Application web de creation de factures pour freelances et TPE/PME.

## Tech Stack
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4 + shadcn/ui (style base-nova, theme neutral)
- Lucide React pour les icones

## Commandes
- `npm run dev` - Lancer le serveur local
- `npm run build` - Compiler pour la production
- `npm run lint` - Verifier le code

## Regles

- **TOUJOURS** utiliser les composants shadcn/ui en priorite (`npx shadcn@latest add [composant]`)
- **TOUJOURS** repondre en francais avec des explications simples
- **JAMAIS** de jargon technique sans explication claire
- **JAMAIS** de cle API dans le code — toujours dans .env
- Les imports utilisent le raccourci `@/` qui pointe vers `src/`
- Les composants UI vont dans `src/components/ui/`
- **TOUJOURS** faire des commits reguliers au fil du travail — ne pas accumuler trop de modifications avant de sauvegarder. Committer a chaque etape logique (nouveau composant, nouvelle fonctionnalite, correction de bug, etc.)
