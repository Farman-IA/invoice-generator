import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface InlineEditProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  as?: 'text' | 'number' | 'textarea' | 'date'
  className?: string
  // Par défaut, valider un texte identique à celui affiché est ignoré (aucun
  // onChange). Ce réglage force la notification quand l'utilisateur a
  // RÉELLEMENT tapé quelque chose — nécessaire pour le champ prix : en mode
  // TTC, retaper le même montant que le TTC dérivé affiché change le SENS du
  // prix (il devient un TTC sacré) sans changer le texte. Sans ce réglage, la
  // re-saisie était avalée et l'ancre TTC jamais posée (bug du 01/07/2026).
  notifyUnchanged?: boolean
}

export function InlineEdit({
  value,
  onChange,
  placeholder = '',
  as = 'text',
  className = '',
  notifyUnchanged = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  // Post-it interne : « le contenu a réellement divergé de la valeur affichée
  // pendant cette session d'édition » — par frappe, collage, spinner, dictée
  // vocale ou autofill (tout passe par onChange, pas seulement le clavier).
  // Distingue une vraie re-saisie (efface + retape le même texte : le champ
  // passe par un état différent) d'un simple clic-dans-la-case puis
  // clic-ailleurs — regarder ne doit jamais modifier.
  const hasEditedRef = useRef(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Nouvelle session d'édition : aucune modification enregistrée pour l'instant
      hasEditedRef.current = false
      inputRef.current.focus()
      if (as !== 'date') {
        // requestAnimationFrame garantit que l'input est rendu avant de sélectionner
        requestAnimationFrame(() => inputRef.current?.select())
      }
    }
  }, [isEditing, as])

  const handleBlur = () => {
    setIsEditing(false)
    // Texte différent → notification classique. Texte identique → notification
    // seulement si demandé (notifyUnchanged) ET si le contenu a réellement
    // divergé pendant la session (sinon un simple aller-retour de focus
    // déclencherait des mises à jour fantômes sur toutes les factures).
    if (draft !== value || (notifyUnchanged && hasEditedRef.current)) {
      onChange(draft)
    }
    hasEditedRef.current = false
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && as !== 'textarea') {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Escape') {
      // Échap = annulation : on oublie aussi les modifications, sinon le blur
      // qui suit re-notifierait la valeur annulée comme une re-saisie volontaire.
      hasEditedRef.current = false
      setDraft(value)
      setIsEditing(false)
    }
  }

  let displayValue = value
  if (as === 'date' && value) {
    const parsed = new Date(value + 'T00:00:00')
    displayValue = isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('fr-FR')
  } else if (as === 'number' && value) {
    const num = Number(value)
    if (!isNaN(num)) {
      displayValue = num.toLocaleString('fr-FR')
    }
  }

  const baseClasses = cn(
    'rounded-sm transition-colors duration-150',
    className
  )

  if (isEditing) {
    const inputClasses = cn(
      baseClasses,
      'border-none bg-blue-50/40 outline-none ring-1 ring-blue-200 w-full',
    )

    if (as === 'textarea') {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => {
            // Le post-it ne se pose que si le contenu DIVERGE de la valeur
            // d'origine : une correction avortée (dictée, accent annulé) qui
            // reproduit exactement le texte affiché ne compte pas comme édition.
            if (e.target.value !== value) hasEditedRef.current = true
            setDraft(e.target.value)
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(inputClasses, 'resize-none min-h-[4rem]')}
          rows={3}
        />
      )
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={as === 'number' ? 'number' : as === 'date' ? 'date' : 'text'}
        value={draft}
        onChange={e => {
          if (e.target.value !== value) hasEditedRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        step={as === 'number' ? '0.01' : undefined}
        min={as === 'number' ? '0' : undefined}
        className={inputClasses}
      />
    )
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setIsEditing(true)
        }
      }}
      tabIndex={0}
      role="textbox"
      aria-label={placeholder || 'Champ éditable'}
      aria-readonly="false"
      className={cn(
        baseClasses,
        'cursor-text hover:bg-blue-50/60 block min-w-[2rem] px-0.5 focus:outline-none focus:bg-blue-50/40 focus:ring-1 focus:ring-blue-200 dark:focus:bg-blue-900/20 dark:focus:ring-blue-800',
        !displayValue && 'text-gray-400 italic',
      )}
    >
      {displayValue || placeholder}
    </span>
  )
}
