import { useState, useEffect, useCallback } from 'react'
import { GoogleGenAI, Type } from '@google/genai'
import { storage } from '@/lib/storage'
import type { AISettings, ParsedInvoiceData, VatRate, PriceMode } from '@/types/invoice'

const VALID_VAT_RATES: VatRate[] = [0, 2.1, 5.5, 10, 20]

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
      purchaseOrder: { type: Type.STRING, description: 'Numéro de bon de commande (ex: 4500821931 pour Univ Lorraine, 8000058218 pour APAVE)' },
      codeService: { type: Type.STRING, description: 'Code service Chorus Pro (obligatoire pour facturer l\'administration publique française, ex: UL1AVECEJ pour Université de Lorraine)' },
      notes: { type: Type.STRING, description: 'Notes ou commentaires' },
      deposit: { type: Type.NUMBER, description: 'Montant de l\'acompte déjà versé par le client, en euros. 0 si aucun acompte.' },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING, description: 'Description de la prestation ou du produit' },
            quantity: { type: Type.NUMBER, description: 'Quantité' },
            unitPrice: { type: Type.NUMBER, description: priceDesc },
            vatRate: { type: Type.NUMBER, description: 'Taux de TVA : 0, 2.1, 5.5, 10 ou 20' },
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
Extrait : clientName, clientAddress (si mentionnée), clientPostalCode (si mentionné), clientCity (si mentionnée), contactName (si mentionné), purchaseOrder (si mentionné), codeService (si mentionné, voir section Chorus Pro), notes (si mentionnées), et la liste des items (description, quantity, unitPrice, vatRate).
Mets message à "" (vide).

${priceInstruction}

## Quand le texte est une question ou une demande qui n'est PAS une description de facture :
Réponds avec un message utile et amical dans le champ "message". Explique ce que tu peux faire.
Ne remplis PAS clientName ni items.

Exemples de questions → répondre avec message :
- "Cherche l'adresse du client" → "Je ne peux pas chercher d'informations sur internet. Donnez-moi directement les données : nom du client, prestations, prix, et je remplirai la facture."
- "Bonjour" → "Bonjour ! Décrivez-moi votre facture. Par exemple : « Facture pour Société X, 3 repas à 30€ et 1 location de salle à 500€ »"
- "Comment ça marche ?" → "Décrivez votre facture en langage naturel et je remplirai automatiquement le client, les lignes et la TVA. Exemple : « 5 sandwichs à emporter à 8€ pour l'Université de Lorraine »"

## Règles TVA France :
- 0 : exonéré de TVA (auto-entrepreneur en franchise de base, article 293 B du CGI)
- 2.1 : presse, médicaments remboursés, spectacle vivant (premières représentations)
- 5.5 : alimentaire à emporter (sandwichs, plats à emporter)
- 10 : restauration sur place (repas, boissons non alcoolisées sur place)
- 20 : alcool (toujours), location de salle, prestations de service, conseil, développement
- En cas de doute : 20

## Règles d'adressage (norme française La Poste) :
- clientName : nom complet de l'entreprise ou du particulier avec majuscules initiales (ex: "Mairie de Metz", "Université de Lorraine", "Adele Suty")
- clientAddress : numéro + type de voie + nom de voie avec majuscules initiales (ex: "1 place d'Armes", "3 rue du Golf")
- clientCity : ville en MAJUSCULES COMPLÈTES (ex: "METZ", "AINGERAY", "NANCY"). ATTENTION : ne JAMAIS confondre la ville avec le nom du client ou d'autres champs.
- clientPostalCode : 5 chiffres (ex: "57000", "54460"). Si le code postal n'est pas fourni, laisser vide.
- contactName : Prénom + NOM en majuscules (ex: "Jean DUPONT", "Marie MARTIN"). Si le nom du contact et le nom du client sont la même personne, remplir les DEUX champs avec le même nom.

## ATTENTION — Erreurs fréquentes à éviter :
- Ne PAS inventer de code postal s'il n'est pas dans le texte
- Ne PAS mélanger les champs : le nom du client va dans clientName, la rue dans clientAddress, la ville dans clientCity
- Ne PAS couper ou déformer les noms propres (ex: "Aingeray" ne doit PAS devenir "INGE R A I")
- Si le texte est ambigu, préférer laisser un champ vide plutôt qu'inventer une valeur fausse
- Bien séparer nom du client, adresse, ville : ce sont des informations distinctes

## Acompte :
- Si l'utilisateur mentionne un acompte (acompte, avance, déjà versé, déjà payé, à déduire), mets le montant dans "deposit"
- Exemples : "acompte de 500€" → deposit: 500, "avec un acompte déjà versé de 200€" → deposit: 200
- L'acompte est un montant en euros à DÉDUIRE du total TTC. Ce n'est PAS un article/ligne de facture.
- Ne mets JAMAIS l'acompte dans les items ou dans les notes — utilise UNIQUEMENT le champ "deposit"

## Règles de formatage :
- Si un montant global est donné sans prix unitaire, mets quantity: 1 et unitPrice: le montant.
- Les prix sont des nombres décimaux (30.00, pas "30 euros").

## Clients récurrents et leurs spécificités :

### Université de Lorraine (Chorus Pro - administration publique)
- Siège : 91 Avenue de la Libération, 54021 NANCY CEDEX
- CONTEXTE : pour facturer une collectivité/université française via Chorus Pro, il faut OBLIGATOIREMENT un "Code service" au format UL1XXXXXX (ex: UL1AVECEJ). Sans lui, la facture est refusée.
- Si l'utilisateur mentionne "code service", "Chorus", "UL1..." → remplis codeService
- N° de commande Univ Lorraine : 10 chiffres commençant par 4500 (ex: 4500821931) → purchaseOrder

### APAVE Exploitation France
- Siège : ZI Avenue Gay Lussac BP3, 33370 ARTIGUES PRES BORDEAUX
- N° de commande APAVE : 10 chiffres commençant par 800 (ex: 8000058218) → purchaseOrder
- Pas de code service Chorus Pro pour ce client.

### CIC / CAP COMPETENCES (formation professionnelle)
- Contact récurrent : Alexiane BELMOSTEFAOUI
- Adresse : 4 rue Frédéric-Guillaume RAIFFEISEN, 67913 Strasbourg Cedex 9
- CONTEXTE : les factures CAP COMPETENCES contiennent TOUJOURS un "code session" au format XXXXXXX-XXXXXX-XXX (ex: 0028310-000062-001) associé à une date de prestation (ex: "14 repas complets le 21/01/2026 code session : 0028310-000062-001").
- RÈGLE IMPORTANTE : PRÉSERVE INTÉGRALEMENT ce code session et la date dans le champ "description" de la ligne. NE l'extrais PAS dans un autre champ.
- Exemple correct de ligne CIC : description: "Repas complet le 21/01/2026 code session : 0028310-000062-001", quantity: 14, unitPrice: 30, vatRate: 10

## MODIFICATIONS d'une facture existante :
Quand le texte demande une MODIFICATION (changer, modifier, remplacer, mettre à jour, corriger) :
- Ne remplis QUE les champs à modifier, laisse les autres VIDES ou absents
- "Change le client en Mairie de Metz" → clientName: "Mairie de Metz", PAS d'items
- "Ajoute 2 cafés à 3€" → items avec les nouveaux articles SEULEMENT, PAS de clientName
- "Change le prix du repas à 35€" → items avec l'article modifié, PAS de clientName
- IMPORTANT : ne remplis JAMAIS des champs qui ne sont pas mentionnés dans la demande de modification

## Exemples complets de parsing :
- "Facture pour Adele Suty, 3 rue du Golf, Aingeray, 1 repas à 30€ et 2 bouteilles de vin à 25€" →
  clientName: "Adele Suty", clientAddress: "3 rue du Golf", clientCity: "AINGERAY", contactName: "Adele SUTY", items: [{description: "Repas", quantity: 1, unitPrice: 30, vatRate: 10}, {description: "Bouteille de vin", quantity: 2, unitPrice: 25, vatRate: 20}]
- "308 sandwichs à 8€ pour l'Université de Lorraine" →
  clientName: "Université de Lorraine", items: [{description: "Sandwich", quantity: 308, unitPrice: 8, vatRate: 5.5}]
- "Change le client en Mairie de Metz" →
  clientName: "Mairie de Metz" (PAS d'items, PAS d'adresse sauf si mentionnée)
- "Ajoute 5 jus d'orange à 4€" →
  items: [{description: "Jus d'orange", quantity: 5, unitPrice: 4, vatRate: 10}] (PAS de clientName)`
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
  const hasClient = raw.clientName && String(raw.clientName).trim() !== ''
  const hasItems = Array.isArray(raw.items) && raw.items.length > 0
  const hasDeposit = typeof raw.deposit === 'number' && raw.deposit > 0

  if (!hasClient && !hasItems && !hasDeposit) {
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
            ...(priceMode === 'ttc' ? { unitPriceTTC: rawPrice } : {}),
            vatRate,
          }
        })
    : []

  const depositValue = Number(raw.deposit) || 0

  return {
    clientName: hasClient ? String(raw.clientName) : '',
    clientAddress: raw.clientAddress ? String(raw.clientAddress) : undefined,
    clientPostalCode: raw.clientPostalCode ? String(raw.clientPostalCode) : undefined,
    clientCity: raw.clientCity ? String(raw.clientCity).toUpperCase() : undefined,
    contactName: raw.contactName ? String(raw.contactName) : undefined,
    purchaseOrder: raw.purchaseOrder ? String(raw.purchaseOrder) : undefined,
    codeService: raw.codeService ? String(raw.codeService) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    ...(depositValue > 0 ? { deposit: depositValue } : {}),
    items,
  }
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return 'Erreur inattendue. Réessayez.'
  const msg = err.message.toLowerCase()
  if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized'))
    return 'Clé API invalide. Vérifiez-la dans Réglages → Mon profil.'
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
    return 'Quota API dépassé. La clé gratuite Gemini est limitée à ~15 requêtes/min. Attendez 1-2 minutes avant de réessayer.'
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed'))
    return 'Erreur réseau. Vérifiez votre connexion internet.'
  if (msg.includes('404') || msg.includes('model not found') || msg.includes('models/'))
    return 'Modèle IA non disponible. Essayez un autre modèle dans les réglages.'
  return `Erreur lors de l'analyse. Réessayez. (${msg.substring(0, 80)})`
}

export interface ApiKeyValidationResult {
  isValid: boolean
  error: string | null
}

export async function validateApiKey(apiKey: string, model: AISettings['model'] = 'gemini-2.5-flash'): Promise<ApiKeyValidationResult> {
  if (!apiKey.trim()) return { isValid: false, error: 'Clé API vide.' }

  try {
    const ai = new GoogleGenAI({ apiKey })
    await ai.models.generateContent({
      model,
      contents: 'Réponds juste "ok".',
      config: { maxOutputTokens: 5 },
    })
    return { isValid: true, error: null }
  } catch (err) {
    if (!(err instanceof Error)) return { isValid: false, error: 'Erreur inconnue.' }
    const msg = err.message.toLowerCase()
    if (msg.includes('api key') || msg.includes('401') || msg.includes('unauthorized'))
      return { isValid: false, error: 'Clé API invalide.' }
    if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
      return { isValid: true, error: null } // quota = clé valide mais limitée
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed'))
      return { isValid: false, error: 'Erreur réseau. Vérifiez votre connexion.' }
    return { isValid: false, error: `Erreur : ${err.message.substring(0, 80)}` }
  }
}

export interface AIParseResult {
  data: ParsedInvoiceData | null
  message: string | null
  error: string | null
  isRetryable: boolean
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
      return { data: null, message: null, error: 'Clé API manquante. Configurez-la dans Réglages → Mon profil.', isRetryable: false }
    }

    setIsLoading(true)

    try {
      const ai = new GoogleGenAI({ apiKey: currentSettings.apiKey })
      const priceMode = currentSettings.priceMode ?? 'ht'

      // Construire le prompt avec contexte des messages precedents
      let prompt = buildSystemPrompt(priceMode)

      if (history.length > 0) {
        const recentHistory = history.slice(-10)
        const contextLines = recentHistory.map(m =>
          m.role === 'user' ? `Utilisateur : ${m.content}` : `Assistant : ${m.content}`
        )
        prompt += `\n\n## Historique de la conversation :\n${contextLines.join('\n')}`
      }

      prompt += `\n\nNouveau message :\n${text}`

      // Timeout 30s pour éviter de bloquer l'utilisateur indéfiniment
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout : l\'IA n\'a pas répondu en 30 secondes')), 30000)
      )
      const response = await Promise.race([
        ai.models.generateContent({
          model: currentSettings.model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: buildInvoiceSchema(priceMode),
          },
        }),
        timeoutPromise,
      ])

      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(response.text ?? '{}')
      } catch {
        return { data: null, message: null, error: 'Réponse IA invalide. Réessayez.', isRetryable: true }
      }

      // Priorité : extraire les données de facture AVANT le message conversationnel
      const parsed = validateParsedData(raw, priceMode)
      if (parsed) {
        return { data: parsed, message: null, error: null, isRetryable: false }
      }

      // Sinon, vérifier le message conversationnel
      const aiMessage = raw.message ? String(raw.message).trim() : null
      if (aiMessage) {
        return { data: null, message: aiMessage, error: null, isRetryable: false }
      }

      return { data: null, message: 'Je n\'ai pas trouvé de données de facture. Décrivez votre facture avec le nom du client et les prestations. Exemple : « Facture pour Société X, 3 repas à 30€ »', error: null, isRetryable: false }
    } catch (err) {
      const errorMsg = formatError(err)
      const isRetryable = err instanceof Error && /429|rate|quota|network|fetch|failed/i.test(err.message)
      return { data: null, message: null, error: errorMsg, isRetryable }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { settings, updateSettings, parse, isLoading }
}
