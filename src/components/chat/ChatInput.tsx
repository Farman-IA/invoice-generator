import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Send, Mic, MicOff, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ACCEPTED_EXTENSIONS } from '@/lib/fileToAIInput'

// Petite API exposée au parent : pour l'instant juste focus().
// Le parent peut appeler chatInputRef.current?.focus() depuis un useEffect
// (ex: quand le panel s'ouvre).
export interface ChatInputHandle {
  focus: () => void
}

// Reproduit le contrat du hook useSpeechRecognition sans le réimporter ici
// (évite un couplage inutile : ChatInput n'a pas besoin de connaître le hook).
interface SpeechApi {
  isSupported: boolean
  isListening: boolean
  start: () => void
  stop: () => void
}

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  onSubmit: () => void
  onFilePick: (event: React.ChangeEvent<HTMLInputElement>) => void
  isLoading: boolean
  speech: SpeechApi
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ input, setInput, onSubmit, onFilePick, isLoading, speech }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Expose focus() au parent via la ref (équivalent de "tu peux me téléphoner pour me faire faire ça").
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }), [])

    // Auto-resize du textarea (fonctionne aussi en dictée vocale).
    useEffect(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }, [input])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
    }

    const triggerFilePicker = () => {
      if (isLoading) return
      fileInputRef.current?.click()
    }

    const toggleMic = () => {
      if (speech.isListening) speech.stop()
      else speech.start()
    }

    return (
      <div className="flex items-end gap-2">
        {/* Input fichier caché — déclenché par le bouton trombone */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={onFilePick}
          className="hidden"
          aria-hidden="true"
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Décrivez votre facture..."
          rows={2}
          aria-label="Décrivez votre facture"
          className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 overflow-y-auto"
          style={{ maxHeight: 160 }}
        />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={triggerFilePicker}
          disabled={isLoading}
          aria-label="Joindre un fichier (PDF ou image)"
          title="Joindre un fichier (PDF ou image)"
        >
          <Paperclip className="size-4" />
        </Button>
        {speech.isSupported && (
          <Button
            variant={speech.isListening ? 'default' : 'outline'}
            size="icon-sm"
            onClick={toggleMic}
            className={speech.isListening ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
            aria-label={speech.isListening ? 'Arrêter la dictée' : 'Activer la dictée vocale'}
          >
            {speech.isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
        )}
        <Button size="icon-sm" onClick={onSubmit} disabled={!input.trim() || isLoading} aria-label="Envoyer">
          <Send className="size-4" />
        </Button>
      </div>
    )
  }
)
