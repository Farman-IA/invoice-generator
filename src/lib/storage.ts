import type { SavedInvoice, IssuerProfile } from '@/types/invoice'

const KEYS = {
  INVOICES: 'invoices',
  INVOICE_COUNTER: 'invoice-counter',
  ISSUER_PROFILE: 'issuer-profile',
} as const

export const storage = {
  async getInvoices(): Promise<SavedInvoice[]> {
    try {
      const result = await window.storage.get(KEYS.INVOICES)
      return result ? JSON.parse(result.value) : []
    } catch {
      return []
    }
  },

  async saveInvoices(invoices: SavedInvoice[]): Promise<boolean> {
    try {
      await window.storage.set(KEYS.INVOICES, JSON.stringify(invoices))
      return true
    } catch {
      return false
    }
  },

  async getCounter(): Promise<number> {
    try {
      const result = await window.storage.get(KEYS.INVOICE_COUNTER)
      return result ? JSON.parse(result.value) : 1
    } catch {
      return 1
    }
  },

  async saveCounter(counter: number): Promise<boolean> {
    try {
      await window.storage.set(KEYS.INVOICE_COUNTER, JSON.stringify(counter))
      return true
    } catch {
      return false
    }
  },

  async getIssuerProfile(): Promise<IssuerProfile | null> {
    try {
      const result = await window.storage.get(KEYS.ISSUER_PROFILE)
      return result ? JSON.parse(result.value) as IssuerProfile : null
    } catch {
      return null
    }
  },

  async saveIssuerProfile(issuer: IssuerProfile): Promise<boolean> {
    try {
      await window.storage.set(KEYS.ISSUER_PROFILE, JSON.stringify(issuer))
      return true
    } catch {
      return false
    }
  },
}
