import { useState, useEffect, useCallback } from 'react'
import { GoogleGenAI, Type } from '@google/genai'
import { storage } from '@/lib/storage'
import type { AISettings, ParsedInvoiceData, VatRate, PriceMode } from '@/types/invoice'

const VALID_VAT_RATES: VatRate[] = [5.5, 10, 20]

function buildInvoiceSchema(priceMode: PriceMode) {
  const priceDesc = priceMode === 'ttc'
    ? 'Prix unitaire TTC en euros (tel que donné par l\'utilisateur, NE PAS convertir)'
    : 'Prix unitaire HT en euros'

  return {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING, description: 'Message conversationnel quand le texte ne contient pas de données de facture' },
      clientName: { type: Type.STRING, description: 'Nom du client ou de l\'entreprise' },
      clientAddress: { type: Type.STRING, description: 'Adresse du client (rue)' },
      clientPostalCode: { type: Type.STRING, description: 'Code postal du client' },
      clientCity: { type: Type.STRING, description: 'Ville du client en MAJUSCULES' },
      contactName: { type: Type.STRING, description: 'Nom du contact chez le client' },
      purchaseOrder: { type: Type.STRING, description: 'Numéro de bon de commande' },
      notes: { type: Type.STRING, description: 'Notes ou commentaires' },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING, description: 'Description de la prestation ou du produit' },
            quantity: { type: Type.NUMBER, description: 'Quantité' },
            unitPrice: { type: Type.NUMBER, description: priceDesc },
            vatRate: { type: Type.NUMBER, description: 'Taux de TVA : 5.5, 10 ou 20' },
          },
          required: ['description', 'quantity', 'unitPrice', 'vatRate'],
        },
      },
    },
    required: ['message'],
  }
}

function buildSystemPrompt(priceMode: PriceMode): string {
  const priceInstruction = priceMode === 'ttc'
    ? `IMPORTANT : Les montants donnés par l'utilisateur sont en TTC (toutes taxes comprises).
Tu dois quand même les mettre TELS QUELS dans unitPrice. La conversion TTC→HT sera faite automatiquement après.`
    : `Les montants donnés par l'utilisateur sont en HT (hors taxe). Mets-les directement dans unitPrice.`

  return `Tu es un assistant de facturation intelligent. Tu aides à créer des factures à partir de descriptions en français.

## Quand le texte contient des données de facture :
Extrait : clientName, clientAddress (si mentionnée), clientPostalCode (si mentionné), clientCity (si mentionnée), contactName (si mentionné), purchaseOrder (si mentionné), notes (si mentionnées), et la liste des items (description, quantity, unitPrice, vatRate).
Mets message à "" (vide).

${priceInstruction}

## Quand le texte est une question ou une demande qui n'est PAS une description de facture :
Réponds avec un message utile et amical dans le champ "message". Explique ce que tu peux faire.
Ne remplis PAS clientName ni items.

Exemples de questions → répondre avec message :
- "Cherche l'adresse du client" → "Je ne peux pas chercher d'informations sur internet. Donnez-moi directement les données : nom du client, prestations, prix, et je remplirai la facture."
- "Bonjour" → "Bonjour ! Décrivez-moi votre facture. Par exemple : « Facture pour Société X, 3 repas à 30€ et 1 location de salle à 500€ »"
- "Comment ça marche ?" → "Décrivez votre facture en langage naturel et je remplirai automatiquement le client, les lignes et la TVA. Exemple : « 5 sandwichs à emporter à 8€ pour l'Université de Lorraine »"

## Règles TVA restauration France :
- 5.5 : alimentaire à emporter (sandwichs, plats à emporter)
- 10 : restauration sur place (repas, boissons non alcoolisées sur place)
- 20 : alcool (toujours), location de salle, prestations de service
- En cas de doute : 20

## Règles d'adressage (norme française La Poste) :
- clientName : nom complet avec majuscules initiales (ex: "Mairie de Metz", "Université de Lorraine")
- clientAddress : numéro + type de voie + nom de voie avec majuscules initiales (ex: "1 place d'Armes", "45 avenue de la République")
- clientCity : ville en MAJUSCULES COMPLÈTES (ex: "METZ", "NANCY", "PARIS")
- clientPostalCode : 5 chiffres (ex: "57000")
- contactName : Prénom + NOM en majuscules (ex: "Jean DUPONT", "Marie MARTIN")

## Règles de formatage :
- Si un montant global est donné sans prix unitaire, mets quantity: 1 et unitPrice: le montant.
- Les prix sont des nombres décimaux (30.00, pas "30 euros").`
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function sanitizeVatRate(rate: number): VatRate {
  if (VALID_VAT_RATES.includes(rate as VatRate)) return rate as VatRate
  return 20
}

function convertTtcToHt(priceTtc: number, vatRate: VatRate): number {
  // Pas d'arrondi — garder la precision pour que qty × prix HT × (1+TVA) = TTC exact
  return priceTtc / (1 + vatRate / 100)
}

function validateParsedData(raw: Record<string, unknown>, priceMode: PriceMode): ParsedInvoiceData | null {
  if (!raw.clientName && (!Array.isArray(raw.items) || raw.items.length === 0)) {
    return null
  }

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item: Record<string, unknown>) =>
          item && typeof item.description === 'string' && item.description.trim() !== ''
        )
        .map((item: Record<string, unknown>) => {
          const vatRate = sanitizeVatRate(Number(item.vatRate))
          const rawPrice = Math.max(0, Number(item.unitPrice) || 0)
          const unitPrice = priceMode === 'ttc' ? convertTtcToHt(rawPrice, vatRate) : rawPrice
          return {
            description: capitalize(String(item.description)),
            quantity: Math.max(1, Number(item.quantity) || 1),
            unitPrice,
            vatRate,
          }
        })
    : []

  return {
    clientName: String(raw.clientName ?? ''),
    clientAddress: raw.clientAddress ? String(raw.clientAddress) : undefined,
    clientPostalCode: raw.clientPostalCode ? String(raw.clientPostalCode) : undefined,
    clientCity: raw.clientCity ? String(raw.clientCity).toUpperCase() : undefined,
    contactName: raw.contactName ? String(raw.contactName) : undefined,
    purchaseOrder: raw.purchaseOrder ? String(raw.purchaseOrder) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    items,
  }
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return 'Erreur inattendue. Réessayez.'
  const msg = err.message.toLowerCase()
  if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized'))
    return 'Clé API invalide. Vérifiez-la dans Réglages → Mon profil.'
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
    return 'Trop de requêtes. Attendez quelques secondes.'
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed'))
    return 'Erreur réseau. Vérifiez votre connexion internet.'
  if (msg.includes('404') || msg.includes('model not found') || msg.includes('models/'))
    return 'Modèle IA non disponible. Essayez un autre modèle dans les réglages.'
  return `Erreur lors de l'analyse. Réessayez. (${msg.substring(0, 80)})`
}

export interface AIParseResult {
  data: ParsedInvoiceData | null
  message: string | null
  error: string | null
}

export function useAIParser() {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    storage.getAISettings().then(setSettings)
  }, [])

  const updateSettings = useCallback(async (newSettings: AISettings) => {
    setSettings(newSettings)
    await storage.saveAISettings(newSettings)
  }, [])

  const parse = useCallback(async (text: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<AIParseResult> => {
    const currentSettings = await storage.getAISettings()
    if (currentSettings) setSettings(currentSettings)

    if (!currentSettings?.apiKey) {
      return { data: null, message: null, error: 'Clé API manquante. Configurez-la dans Réglages → Mon profil.' }
    }

    setIsLoading(true)

    try {
      const ai = new GoogleGenAI({ apiKey: currentSettings.apiKey })
      const priceMode = currentSettings.priceMode ?? 'ht'

      // Construire le prompt avec contexte des messages precedents
      let prompt = buildSystemPrompt(priceMode)

      if (history.length > 0) {
        const contextLines = history.map(m =>
          m.role === 'user' ? `Utilisateur : ${m.content}` : `Assistant : ${m.content}`
        )
        prompt += `\n\n## Historique de la conversation :\n${contextLines.join('\n')}`
      }

      prompt += `\n\nNouveau message :\n${text}`

      const response = await ai.models.generateContent({
        model: currentSettings.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildInvoiceSchema(priceMode),
        },
      })

      const raw = JSON.parse(response.text ?? '{}')

      // Si l'IA a renvoyé un message conversationnel
      const aiMessage = raw.message ? String(raw.message).trim() : null
      if (aiMessage) {
        return { data: null, message: aiMessage, error: null }
      }

      // Sinon, extraire les données de facture
      const parsed = validateParsedData(raw, priceMode)
      if (!parsed) {
        return { data: null, message: 'Je n\'ai pas trouvé de données de facture. Décrivez votre facture avec le nom du client et les prestations. Exemple : « Facture pour Société X, 3 repas à 30€ »', error: null }
      }

      return { data: parsed, message: null, error: null }
    } catch (err) {
      return { data: null, message: null, error: formatError(err) }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { settings, updateSettings, parse, isLoading }
}
