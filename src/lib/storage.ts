import type { SavedInvoice, SavedQuote, IssuerProfile, ClientRecord, ArticleTemplate } from '@/types/invoice'

const KEYS = {
  INVOICES: 'invoices',
  INVOICE_COUNTER: 'invoice-counter',
  ISSUER_PROFILE: 'issuer-profile',
  CLIENTS: 'clients',
  ARTICLE_TEMPLATES: 'articleTemplates',
  QUOTES: 'quotes',
  QUOTE_COUNTER: 'quote-counter',
  THEME: 'theme',
} as const

async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await window.storage.get(key)
    return result ? JSON.parse(result.value) as T : fallback
  } catch {
    return fallback
  }
}

async function set(key: string, value: unknown): Promise<boolean> {
  try {
    await window.storage.set(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const storage = {
  // Factures
  getInvoices: () => get<SavedInvoice[]>(KEYS.INVOICES, []),
  saveInvoices: (invoices: SavedInvoice[]) => set(KEYS.INVOICES, invoices),

  // Compteur
  getCounter: () => get<number>(KEYS.INVOICE_COUNTER, 1),
  saveCounter: (counter: number) => set(KEYS.INVOICE_COUNTER, counter),

  // Profil émetteur
  async getIssuerProfile(): Promise<IssuerProfile | null> {
    try {
      const result = await window.storage.get(KEYS.ISSUER_PROFILE)
      return result ? JSON.parse(result.value) as IssuerProfile : null
    } catch {
      return null
    }
  },
  saveIssuerProfile: (issuer: IssuerProfile) => set(KEYS.ISSUER_PROFILE, issuer),

  // Carnet de clients
  getClients: () => get<ClientRecord[]>(KEYS.CLIENTS, []),
  saveClients: (clients: ClientRecord[]) => set(KEYS.CLIENTS, clients),

  // Modèles d'articles
  getArticleTemplates: () => get<ArticleTemplate[]>(KEYS.ARTICLE_TEMPLATES, []),
  saveArticleTemplates: (templates: ArticleTemplate[]) => set(KEYS.ARTICLE_TEMPLATES, templates),

  // Devis
  getQuotes: () => get<SavedQuote[]>(KEYS.QUOTES, []),
  saveQuotes: (quotes: SavedQuote[]) => set(KEYS.QUOTES, quotes),
  getQuoteCounter: () => get<number>(KEYS.QUOTE_COUNTER, 1),
  saveQuoteCounter: (counter: number) => set(KEYS.QUOTE_COUNTER, counter),

  // Thème
  getTheme: () => get<'light' | 'dark'>(KEYS.THEME, 'light'),
  saveTheme: (theme: 'light' | 'dark') => set(KEYS.THEME, theme),
}
