export const STORAGE_KEYS = {
  ISSUER_PROFILE: 'issuer-profile',
  CLIENT_CURRENT: 'client-current',
  INVOICE_CURRENT: 'invoice-current',
  INVOICE_COUNTER: 'invoice-counter',
} as const

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },

  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // silently ignore
    }
  },
}
