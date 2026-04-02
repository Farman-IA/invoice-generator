import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storage } from '@/lib/storage'
import type { AISettings } from '@/types/invoice'

interface AISettingsSectionProps {
  onSettingsChange?: (settings: AISettings) => void
}

const MODELS: { value: AISettings['model']; label: string }[] = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rapide, économique)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (plus précis)' },
]

export function AISettingsSection({ onSettingsChange }: AISettingsSectionProps) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState<AISettings['model']>('gemini-2.5-flash')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    storage.getAISettings().then(settings => {
      if (settings) {
        setApiKey(settings.apiKey)
        setModel(settings.model)
      }
    })
  }, [])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    const newSettings: AISettings = { apiKey: value, model }
    storage.saveAISettings(newSettings)
    onSettingsChange?.(newSettings)
  }

  const handleModelChange = (value: AISettings['model']) => {
    setModel(value)
    const newSettings: AISettings = { apiKey, model: value }
    storage.saveAISettings(newSettings)
    onSettingsChange?.(newSettings)
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Intelligence artificielle
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">Clé API Google</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => handleApiKeyChange(e.target.value)}
              placeholder="AIza..."
              className="w-full px-2 py-1.5 pr-9 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">Modèle IA</label>
          <select
            value={model}
            onChange={e => handleModelChange(e.target.value as AISettings['model'])}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
