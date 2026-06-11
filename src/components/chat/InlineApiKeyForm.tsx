import { useState } from 'react'
import { Eye, EyeOff, Loader2, KeyRound, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { validateApiKey, inferProviderFromKey } from '@/lib/aiKeyValidation'
import { storage } from '@/lib/storage'
import type { AISettings } from '@/types/invoice'

interface InlineApiKeyFormProps {
  // Appelé après validation réussie + sauvegarde — le parent peut rafraîchir son state.
  onKeyValidated: (newSettings: AISettings) => void
}

// Formulaire de saisie de clé API affiché dans le chat quand aucune clé n'est encore configurée.
// Détecte automatiquement le provider (Gemini/OpenAI) depuis le préfixe de la clé,
// valide en faisant un appel-test, puis sauvegarde dans le storage local.
export function InlineApiKeyForm({ onKeyValidated }: InlineApiKeyFormProps) {
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmed = key.trim()
    if (!trimmed) return
    setValidating(true)
    setError(null)
    const inferredProvider = inferProviderFromKey(trimmed)
    const result = await validateApiKey(trimmed, inferredProvider)
    setValidating(false)
    if (result.isValid) {
      const current = await storage.getAISettings()
      // Si l'utilisateur change de provider, on réinitialise le modèle au défaut.
      const previousProvider = current?.provider ?? (current?.model?.startsWith('gpt') ? 'openai' : 'google')
      const defaultModel = inferredProvider === 'openai' ? 'gpt-5.4-mini' as const : 'gemini-2.5-flash' as const
      const newSettings: AISettings = {
        provider: inferredProvider,
        apiKey: trimmed,
        apiKeyValid: true,
        model: previousProvider === inferredProvider && current?.model ? current.model : defaultModel,
        priceMode: current?.priceMode ?? 'ht',
      }
      await storage.saveAISettings(newSettings)
      onKeyValidated(newSettings)
      setKey('')
      setError(null)
    } else {
      setError(result.error ?? 'Clé invalide.')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <KeyRound className="size-3.5" />
        <p className="text-xs font-medium">Clé API requise (Gemini ou OpenAI)</p>
      </div>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={key}
          onChange={e => { setKey(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          placeholder="AIza... (Gemini) ou sk-... (OpenAI)"
          disabled={validating}
          className="w-full px-2 py-1.5 pr-8 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
        />
        <button
          type="button"
          onClick={() => setShowKey(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!key.trim() || validating}
        className="w-full h-7 text-xs"
      >
        {validating ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Check className="size-3 mr-1" />}
        {validating ? 'Vérification...' : 'Valider la clé'}
      </Button>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
        La clé est stockée uniquement dans votre navigateur
      </p>
    </div>
  )
}
