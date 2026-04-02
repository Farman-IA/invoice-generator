import { useState, useEffect, useCallback } from 'react'
import { GoogleGenAI, Type } from '@google/genai'
import { storage } from '@/lib/storage'
import type { AISettings, ParsedInvoiceData } from '@/types/invoice'

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
    if (!settings?.apiKey) {
      setError('Clé API manquante. Configurez-la dans Réglages > Mon profil.')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      const ai = new GoogleGenAI({ apiKey: settings.apiKey })
      const response = await ai.models.generateContent({
        model: settings.model,
        contents: `${SYSTEM_PROMPT}\n\nTexte :\n${text}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: INVOICE_SCHEMA,
        },
      })

      const parsed = JSON.parse(response.text ?? '{}') as ParsedInvoiceData
      return parsed
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [settings])

  return { settings, updateSettings, parse, isLoading, error }
}
