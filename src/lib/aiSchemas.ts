import { Type } from '@google/genai'
import type { PriceMode } from '@/types/invoice'

// Source de verite unique des champs facture envoyes a l'IA.
// kind = 'string' | 'number' | 'enum' (enum = liste fermee de valeurs string).
// Les schemas Gemini et OpenAI sont generes a partir de cette table —
// ajouter un champ ici le rend disponible pour les deux providers.
type FieldKind = 'string' | 'number' | 'enum'
interface FieldSpec { kind: FieldKind; description: string; enumValues?: readonly string[] }

// Nature d'un montant enonce par l'utilisateur. L'IA ne fait JAMAIS de
// conversion ni de division : elle recopie le montant et le QUALIFIE ici.
// Tous les calculs (TTC->HT, total->unitaire) sont faits par le code
// (aiValidation) avec les regles d'arrondi du projet — un LLM qui fait
// de l'arithmetique est la source des montants fantaisistes.
export const AMOUNT_KINDS = ['unit_ht', 'unit_ttc', 'total_ht', 'total_ttc'] as const
export type AmountKind = (typeof AMOUNT_KINDS)[number]

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
  const defaultKind = priceMode === 'ttc' ? 'unit_ttc' : 'unit_ht'
  return {
    description: { kind: 'string', description: 'Description de la prestation ou du produit' },
    quantity: { kind: 'number', description: 'Quantité' },
    amount: { kind: 'number', description: 'Montant en euros TEL QUE DONNÉ par l\'utilisateur, sans AUCUNE conversion ni division' },
    amountKind: {
      kind: 'enum',
      enumValues: AMOUNT_KINDS,
      description: `Nature du montant : unit_ = prix d'UNE unité, total_ = total de la ligne ; _ht = hors taxes, _ttc = TTC. Si l'utilisateur ne précise ni HT ni TTC : ${defaultKind}`,
    },
    vatRate: { kind: 'number', description: 'Taux de TVA : 0, 2.1, 5.5, 10 ou 20' },
  }
}

const ITEM_REQUIRED = ['description', 'quantity', 'amount', 'amountKind', 'vatRate']

export function buildInvoiceSchema(priceMode: PriceMode) {
  const geminiType = (k: FieldKind) => k === 'number' ? Type.NUMBER : Type.STRING
  const toProps = (fields: Record<string, FieldSpec>) =>
    Object.fromEntries(
      Object.entries(fields).map(([name, spec]) => [name, {
        type: geminiType(spec.kind),
        description: spec.description,
        ...(spec.kind === 'enum' ? { enum: [...(spec.enumValues ?? [])] } : {}),
      }]),
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
  const jsonType = (k: FieldKind) => k === 'number' ? 'number' : 'string'
  const toProps = (fields: Record<string, FieldSpec>, nullableTypes: boolean) =>
    Object.fromEntries(
      Object.entries(fields).map(([name, spec]) => [
        name,
        {
          type: nullableTypes ? ([jsonType(spec.kind), 'null'] as const) : jsonType(spec.kind),
          description: spec.description,
          ...(spec.kind === 'enum' ? { enum: [...(spec.enumValues ?? [])] } : {}),
        },
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
