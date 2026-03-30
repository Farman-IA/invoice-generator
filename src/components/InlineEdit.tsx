import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface InlineEditProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  as?: 'text' | 'number' | 'textarea' | 'date'
  className?: string
}

export function InlineEdit({
  value,
  onChange,
  placeholder = '',
  as = 'text',
  className = '',
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (as !== 'date') {
        // requestAnimationFrame garantit que l'input est rendu avant de sélectionner
        requestAnimationFrame(() => inputRef.current?.select())
      }
    }
  }, [isEditing, as])

  const handleBlur = () => {
    setIsEditing(false)
    if (draft !== value) {
      onChange(draft)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && as !== 'textarea') {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Escape') {
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
          onChange={e => setDraft(e.target.value)}
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
        onChange={e => setDraft(e.target.value)}
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
      className={cn(
        baseClasses,
        'cursor-text hover:bg-blue-50/60 inline-block min-w-[2rem] px-0.5',
        !displayValue && 'text-gray-400 italic',
      )}
    >
      {displayValue || placeholder}
    </span>
  )
}
