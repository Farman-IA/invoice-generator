import { useState, useEffect, useCallback } from 'react'
import { GoogleGenAI, Type } from '@google/genai'
import { storage } from '@/lib/storage'
import type { AISettings, ParsedInvoiceData, VatRate } from '@/types/invoice'

const VALID_VAT_RATES: VatRate[] = [5.5, 10, 20]

const INVOICE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    clientName: { type: Type.STRING, description: 'Nom du client ou de l\'entreprise' },
    purchaseOrder: { type: Type.STRING, description: 'Numéro de bon de commande' },
    notes: { type: Type.STRING, description: 'Notes ou commentaires' },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'Description de la prestation ou du produit' },
          quantity: { type: Type.NUMBER, description: 'Quantité' },
          unitPrice: { type: Type.NUMBER, description: 'Prix unitaire HT en euros' },
          vatRate: { type: Type.NUMBER, description: 'Taux de TVA : 5.5, 10 ou 20' },
        },
        required: ['description', 'quantity', 'unitPrice', 'vatRate'],
      },
    },
  },
  required: ['clientName', 'items'],
}

const SYSTEM_PROMPT = `Tu es un assistant qui extrait les données de factures depuis du texte français.

Extrait : clientName, purchaseOrder (si mentionné), notes (si mentionnées), et la liste des items (description, quantity, unitPrice HT, vatRate).

Règles TVA restauration France :
- 5.5 : alimentaire à emporter (sandwichs, plats à emporter)
- 10 : restauration sur place (repas, boissons non alcoolisées sur place)
- 20 : alcool (toujours), location de salle, prestations de service
- En cas de doute : 20

Si un montant global est donné sans prix unitaire, mets quantity: 1 et unitPrice: le montant.
Les prix sont des nombres décimaux (30.00, pas "30 euros").`

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function sanitizeVatRate(rate: number): VatRate {
  if (VALID_VAT_RATES.includes(rate as VatRate)) return rate as VatRate
  return 20
}

function validateParsedData(raw: Record<string, unknown>): ParsedInvoiceData | null {
  if (!raw.clientName && (!Array.isArray(raw.items) || raw.items.length === 0)) {
    return null
  }

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item: Record<string, unknown>) =>
          item && typeof item.description === 'string' && item.description.trim() !== ''
        )
        .map((item: Record<string, unknown>) => ({
          description: capitalize(String(item.description)),
          quantity: Math.max(1, Number(item.quantity) || 1),
          unitPrice: Math.max(0, Number(item.unitPrice) || 0),
          vatRate: sanitizeVatRate(Number(item.vatRate)),
        }))
    : []

  return {
    clientName: String(raw.clientName ?? ''),
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
  if (msg.includes('404') || msg.includes('model'))
    return 'Modèle IA non disponible. Essayez un autre modèle dans les réglages.'
  return 'Erreur lors de l\'analyse. Réessayez.'
}

export function useAIParser() {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    storage.getAISettings().then(setSettings)
  }, [])

  const updateSettings = useCallback(async (newSettings: AISettings) => {
    setSettings(newSettings)
    await storage.saveAISettings(newSettings)
  }, [])

  const parse = useCallback(async (text: string): Promise<ParsedInvoiceData | null> => {
    // F4: toujours relire les settings depuis le storage pour éviter la désynchronisation
    const currentSettings = await storage.getAISettings()
    if (currentSettings) setSettings(currentSettings)

    if (!currentSettings?.apiKey) {
      setError('Clé API manquante. Configurez-la dans Réglages → Mon profil.')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      const ai = new GoogleGenAI({ apiKey: currentSettings.apiKey })
      const response = await ai.models.generateContent({
        model: currentSettings.model,
        contents: `${SYSTEM_PROMPT}\n\nTexte :\n${text}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: INVOICE_SCHEMA,
        },
      })

      const raw = JSON.parse(response.text ?? '{}')
      const parsed = validateParsedData(raw)

      if (!parsed) {
        setError('Aucune donnée exploitable trouvée. Reformulez votre description.')
        return null
      }

      return parsed
    } catch (err) {
      setError(formatError(err))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { settings, updateSettings, parse, isLoading, error }
}
