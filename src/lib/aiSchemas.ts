import { Type } from '@google/genai'
import type { PriceMode } from '@/types/invoice'

// Source de verite unique des champs facture envoyes a l'IA.
// kind = 'string' | 'number' (pour items, ce sont les types primitifs).
// Les schemas Gemini et OpenAI sont generes a partir de cette table —
// ajouter un champ ici le rend disponible pour les deux providers.
type FieldKind = 'string' | 'number'
interface FieldSpec { kind: FieldKind; description: string }

function priceDescription(priceMode: PriceMode): string {
  return priceMode === 'ttc'
    ? 'Prix unitaire TTC en euros (tel que donné par l\'utilisateur, NE PAS convertir)'
    : 'Prix unitaire HT en euros'
}

const TOP_LEVEL_FIELDS: Record<string, FieldSpec> = {
  message: { kind: 'string', description: 'Question ou information courte pour l\'utilisateur (ex: liste des données manquantes). Peut accompagner des données partielles. Vide ("") quand les données sont complètes.' },
  clientName: { kind: 'string', description: 'Nom du client ou de l\'entreprise' },
  clientDepartment: { kind: 'string', description: 'Service ou département destinataire chez le client (ex: "Factures Fournisseurs DCFG" pour Allianz Vie)' },
  clientAddress: { kind: 'string', description: 'Adresse du client (rue)' },
  clientAddressLine2: { kind: 'string', description: 'Complément d\'adresse (ex: "Tour Neptune – Case courrier 0139", BP, bâtiment, étage)' },
  clientPostalCode: { kind: 'string', description: 'Code postal du client' },
  clientCity: { kind: 'string', description: 'Ville du client en MAJUSCULES' },
  clientSiret: { kind: 'string', description: 'N° SIRET du client : 14 chiffres (ex: "13001550600013"). Uniquement si explicitement mentionné dans le texte.' },
  clientSiren: { kind: 'string', description: 'N° SIREN du client : 9 chiffres. Uniquement si explicitement mentionné.' },
  clientTvaNumber: { kind: 'string', description: 'N° TVA intracommunautaire du client (ex: "FR12345678901"). Uniquement si explicitement mentionné.' },
  contactName: { kind: 'string', description: 'Nom du contact chez le client (ex: "Danielle DEL AGUILA")' },
  purchaseOrder: { kind: 'string', description: 'Numéro de bon de commande (ex: 4500821931 pour Univ Lorraine, 8000058218 pour APAVE)' },
  codeService: { kind: 'string', description: 'Code service Chorus Pro (obligatoire pour facturer l\'administration publique française, ex: UL1AVECEJ pour Université de Lorraine)' },
  notes: { kind: 'string', description: 'Notes ou commentaires' },
  deposit: { kind: 'number', description: 'Montant de l\'acompte déjà versé par le client, en euros. 0 si aucun acompte.' },
}

function itemFields(priceMode: PriceMode): Record<string, FieldSpec> {
  return {
    description: { kind: 'string', description: 'Description de la prestation ou du produit' },
    quantity: { kind: 'number', description: 'Quantité' },
    unitPrice: { kind: 'number', description: priceDescription(priceMode) },
    vatRate: { kind: 'number', description: 'Taux de TVA : 0, 2.1, 5.5, 10 ou 20' },
  }
}

const ITEM_REQUIRED = ['description', 'quantity', 'unitPrice', 'vatRate']

export function buildInvoiceSchema(priceMode: PriceMode) {
  const geminiType = (k: FieldKind) => k === 'string' ? Type.STRING : Type.NUMBER
  const toProps = (fields: Record<string, FieldSpec>) =>
    Object.fromEntries(
      Object.entries(fields).map(([name, spec]) => [name, { type: geminiType(spec.kind), description: spec.description }]),
    )

  return {
    type: Type.OBJECT,
    properties: {
      ...toProps(TOP_LEVEL_FIELDS),
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: toProps(itemFields(priceMode)),
          required: ITEM_REQUIRED,
        },
      },
    },
    required: ['message'],
  }
}

export function buildOpenAIInvoiceSchema(priceMode: PriceMode) {
  // OpenAI strict mode : tous les champs doivent etre dans 'required',
  // et les champs optionnels sont exprimes via une union avec null.
  const nullable = (k: FieldKind) => [k, 'null'] as const
  const toProps = (fields: Record<string, FieldSpec>, nullableTypes: boolean) =>
    Object.fromEntries(
      Object.entries(fields).map(([name, spec]) => [
        name,
        { type: nullableTypes ? nullable(spec.kind) : spec.kind, description: spec.description },
      ]),
    )
  const topLevelKeys = Object.keys(TOP_LEVEL_FIELDS)

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...toProps(TOP_LEVEL_FIELDS, true),
      items: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          additionalProperties: false,
          properties: toProps(itemFields(priceMode), false),
          required: ITEM_REQUIRED,
        },
      },
    },
    required: [...topLevelKeys, 'items'],
  } as const
}
