# Agent IA — Saisie intelligente pour Invoice Generator

## Quoi construire

Un **panneau chat IA** a gauche de la facture qui permet de dicter (voix) ou taper (texte) des instructions en francais. L'IA parse le texte, extrait les donnees, et **remplit la facture en live** (on voit les champs se remplir en temps reel).

## UX / Layout

- **Desktop** : panneau chat fixe a gauche, facture a droite. Le chat modifie la facture en direct.
- **Mobile** : le chat est cache, accessible via une **bubble flottante** (bouton rond en bas a droite). Tap = ouvre le chat en overlay/drawer.
- Super simple, super pro, super friendly. Animations fluides sur les modifications live.

## Fonctionnalites du chat

1. **Champ texte** : l'utilisateur tape une instruction en langage naturel
2. **Bouton micro** : dictee vocale via Web Speech API (`lang: 'fr-FR'`, `continuous: true`). Icone `Mic` de Lucide.
3. **Parsing IA** : envoie le texte a Gemini, recoit du JSON structure, applique au state de la facture
4. **Feedback live** : affiche un resume des modifications dans le chat (ex: "Client : Universite de Lorraine", "Ajout : 3 x Repas complets — 30€ HT — TVA 10%")
5. **Historique** : le chat garde l'historique des instructions de la session

## Stack technique

- **IA** : Google Gemini via `@google/genai` (`npm install @google/genai`)
- **Voix** : Web Speech API native (pas de dependance)
- **Modele par defaut** : `gemini-3.1-flash-lite-preview` (le moins cher : $0.25/$1.50 par M tokens)
- **Cle API** : saisie par l'utilisateur dans les reglages (stockee en localStorage cle `ai-settings`)

### Appel Gemini (structured output)

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: selectedModel,
  contents: `${SYSTEM_PROMPT}\n\nTexte :\n${userText}`,
  config: {
    responseMimeType: 'application/json',
    responseSchema: INVOICE_SCHEMA,
  },
});
```

### Schema JSON pour Gemini

```typescript
const INVOICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    purchaseOrder: { type: 'STRING' },
    notes: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
          vatRate: { type: 'NUMBER' }, // 5.5, 10 ou 20
        },
        required: ['description', 'quantity', 'unitPrice', 'vatRate'],
      },
    },
  },
  required: ['clientName', 'items'],
};
```

### System prompt

```
Tu es un assistant qui extrait les donnees de factures depuis du texte francais.

Extrait : clientName, purchaseOrder (si mentionne), notes (si mentionnees), et la liste des items (description, quantity, unitPrice HT, vatRate).

Regles TVA restauration France :
- 5.5 : alimentaire a emporter (sandwichs, plats a emporter)
- 10 : restauration sur place (repas, boissons non alcoolisees sur place)
- 20 : alcool (toujours), location de salle, prestations de service
- En cas de doute : 20

Si un montant global est donne sans prix unitaire, mets quantity: 1 et unitPrice: le montant.
Les prix sont des nombres decimaux (30.00, pas "30 euros").
```

## Application au state existant

Apres parsing, appliquer directement :

```typescript
// Remplir le client (+ match carnet via findByName si existe)
inv.updateClient({ companyName: parsed.clientName });

// Ajouter chaque ligne
parsed.items.forEach(item => {
  inv.addLineItem({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    vatRate: item.vatRate as VatRate,
  });
});

// Metadonnees
inv.updateInvoice({
  purchaseOrder: parsed.purchaseOrder,
  notes: parsed.notes,
});
// Les calculs (totalHT, TVA, TTC) se mettent a jour automatiquement.
```

## Reglages IA

Section dans `ProfileModal.tsx` :
- Champ cle API Google (type password)
- Selecteur de modele : `gemini-3.1-flash-lite-preview` (defaut) | `gemini-3.1-pro-preview`
- Persiste dans localStorage cle `ai-settings`

## Fichiers a creer

| Fichier | Role |
|---|---|
| `src/hooks/useAIParser.ts` | Appel Gemini + gestion settings |
| `src/hooks/useSpeechRecognition.ts` | Dictee vocale Web Speech API |
| `src/components/AIChatPanel.tsx` | Panneau chat (desktop: sidebar, mobile: drawer) |
| `src/components/AIChatBubble.tsx` | Bouton flottant mobile |
| `src/components/AISettingsSection.tsx` | Reglages cle API + modele |

## Fichiers a modifier

| Fichier | Modification |
|---|---|
| `src/App.tsx` | Integrer le layout chat + facture, ajouter le panneau |
| `src/components/ProfileModal.tsx` | Ajouter `AISettingsSection` |
| `src/lib/storage.ts` | Ajouter `getAISettings()` / `setAISettings()` |
| `src/types/invoice.ts` | Ajouter types `AISettings`, `ParsedInvoiceData` |

## Contraintes

- Ne pas casser le code existant
- Pas de cle API en dur — toujours via reglages utilisateur
- Composants shadcn/ui en priorite
- Responsive : desktop sidebar + mobile bubble/drawer
- Modifications visibles en live sur la facture
- Commits reguliers a chaque etape
