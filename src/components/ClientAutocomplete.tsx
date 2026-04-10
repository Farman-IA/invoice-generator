import { useState, useRef, useEffect, useMemo } from 'react'
import type { ClientRecord, ClientInfo } from '@/types/invoice'

interface ClientAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelectClient: (client: ClientInfo) => void
  findByName: (query: string) => ClientRecord[]
  placeholder?: string
  className?: string
}

export function ClientAutocomplete({
  value,
  onChange,
  onSelectClient,
  findByName,
  placeholder,
  className,
}: ClientAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Derived state — calculé à chaque render, pas de useEffect + setState
  const suggestions = useMemo(() => findByName(value), [value, findByName])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (client: ClientRecord) => {
    const { id: _id, ...clientInfo } = client
    void _id
    onSelectClient(clientInfo)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setIsOpen(true) }}
        onFocus={() => { if (suggestions.length > 0) setIsOpen(true) }}
        placeholder={placeholder}
        className={className}
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(client => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">{client.companyName}</span>
              {client.city && (
                <span className="text-gray-400 ml-2">— {client.city}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
