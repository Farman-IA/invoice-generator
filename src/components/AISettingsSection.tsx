import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storage } from '@/lib/storage'
import { validateApiKey } from '@/hooks/useAIParser'
import type { AISettings, PriceMode } from '@/types/invoice'

interface AISettingsSectionProps {
  onSettingsChange?: (settings: AISettings) => void
}

const MODELS: { value: AISettings['model']; label: string }[] = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rapide, économique)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (plus précis)' },
]

const PRICE_MODES: { value: PriceMode; label: string; description: string }[] = [
  { value: 'ht', label: 'HT (hors taxe)', description: 'Les montants dictés sont déjà hors taxe' },
  { value: 'ttc', label: 'TTC (toutes taxes)', description: 'Les montants dictés incluent la TVA — conversion auto' },
]

export function AISettingsSection({ onSettingsChange }: AISettingsSectionProps) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState<AISettings['model']>('gemini-2.5-flash')
  const [priceMode, setPriceMode] = useState<PriceMode>('ht')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const prevKeyRef = useRef('')

  useEffect(() => {
    storage.getAISettings().then(settings => {
      if (settings) {
        setApiKey(settings.apiKey)
        setModel(settings.model)
        setPriceMode(settings.priceMode ?? 'ht')
        setKeyValid(settings.apiKeyValid ?? null)
        prevKeyRef.current = settings.apiKey
      }
    })
  }, [])

  const save = (key: string, mod: AISettings['model'], price: PriceMode, valid?: boolean) => {
    const newSettings: AISettings = { apiKey: key, apiKeyValid: valid ?? keyValid ?? undefined, model: mod, priceMode: price }
    storage.saveAISettings(newSettings)
    onSettingsChange?.(newSettings)
  }

  const handleApiKeyBlur = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      setKeyValid(null)
      setValidationError(null)
      save(trimmed, model, priceMode, undefined)
      prevKeyRef.current = trimmed
      return
    }
    if (trimmed === prevKeyRef.current && keyValid !== null) {
      save(trimmed, model, priceMode, keyValid)
      return
    }
    setValidating(true)
    setValidationError(null)
    const result = await validateApiKey(trimmed, model)
    setKeyValid(result.isValid)
    setValidationError(result.error)
    setValidating(false)
    save(trimmed, model, priceMode, result.isValid)
    prevKeyRef.current = trimmed
  }

  const handleModelChange = (value: AISettings['model']) => {
    setModel(value)
    save(apiKey, value, priceMode)
  }

  const handlePriceModeChange = (value: PriceMode) => {
    setPriceMode(value)
    save(apiKey, model, value)
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Intelligence artificielle
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label htmlFor="ai-api-key" className="text-xs text-gray-500 dark:text-gray-400">Clé API Google</label>
          <div className="relative">
            <input
              id="ai-api-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); if (keyValid !== null) setKeyValid(null) }}
              onBlur={handleApiKeyBlur}
              placeholder="AIza..."
              className={`w-full px-2 py-1.5 pr-16 text-sm border rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                keyValid === true ? 'border-green-400 dark:border-green-600 focus:ring-green-200 dark:focus:ring-green-800'
                : keyValid === false ? 'border-red-400 dark:border-red-600 focus:ring-red-200 dark:focus:ring-red-800'
                : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800'
              }`}
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {validating && <Loader2 className="size-3.5 animate-spin text-blue-500" />}
              {!validating && keyValid === true && <CheckCircle2 className="size-3.5 text-green-500" />}
              {!validating && keyValid === false && <XCircle className="size-3.5 text-red-500" />}
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="text-gray-400"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </div>
          {validationError && keyValid === false && (
            <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">{validationError}</p>
          )}
          {keyValid === true && (
            <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5">Clé API valide ✓</p>
          )}
        </div>
        <div className="col-span-2">
          <label htmlFor="ai-model" className="text-xs text-gray-500 dark:text-gray-400">Modèle IA</label>
          <select
            id="ai-model"
            value={model}
            onChange={e => handleModelChange(e.target.value as AISettings['model'])}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label id="ai-price-mode" className="text-xs text-gray-500 dark:text-gray-400">Les montants que je dicte sont en</label>
          <div role="group" aria-labelledby="ai-price-mode" className="flex gap-2 mt-1">
            {PRICE_MODES.map(mode => (
              <button
                key={mode.value}
                type="button"
                onClick={() => handlePriceModeChange(mode.value)}
                aria-pressed={priceMode === mode.value}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  priceMode === mode.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            {PRICE_MODES.find(m => m.value === priceMode)?.description}
          </p>
        </div>
      </div>
    </div>
  )
}
