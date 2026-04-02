import { useState, useRef, useCallback, useEffect } from 'react'

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { transcript: string; confidence: number }
}

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEventType {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message?: string
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventType) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

interface UseSpeechRecognitionOptions {
  onTranscript?: (text: string) => void
}

// Erreurs fatales qui doivent arrêter la reconnaissance
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported'])

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  )
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const shouldRestartRef = useRef(false)
  const transcriptRef = useRef('')
  const onTranscriptRef = useRef(options.onTranscript)
  useEffect(() => {
    onTranscriptRef.current = options.onTranscript
  })

  const createRecognition = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEventType) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      transcriptRef.current = final
      onTranscriptRef.current?.(final + interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (FATAL_ERRORS.has(event.error)) {
        // Erreur bloquante : arrêter complètement
        shouldRestartRef.current = false
        setIsListening(false)
        recognitionRef.current = null
      }
      // Pour no-speech, aborted, network : on laisse onend relancer
    }

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        // Relancer automatiquement (silence, coupure réseau temporaire)
        try {
          recognition.start()
        } catch {
          // Si le restart échoue, on arrête proprement
          shouldRestartRef.current = false
          setIsListening(false)
          recognitionRef.current = null
        }
      } else {
        setIsListening(false)
        recognitionRef.current = null
      }
    }

    return recognition
  }, [])

  const start = useCallback(() => {
    if (!isSupported) return

    // Arrêter une session précédente si elle existe
    if (recognitionRef.current) {
      shouldRestartRef.current = false
      recognitionRef.current.abort()
    }

    const recognition = createRecognition()
    recognitionRef.current = recognition
    shouldRestartRef.current = true
    transcriptRef.current = ''

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
      recognitionRef.current = null
      shouldRestartRef.current = false
    }
  }, [isSupported, createRecognition])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  return { isListening, isSupported, start, stop }
}
