import { toast } from 'sonner'
import type { SavedInvoice, SavedQuote, IssuerProfile, ClientRecord, ArticleTemplate, AISettings } from '@/types/invoice'

const KEYS = {
  INVOICES: 'invoices',
  INVOICE_COUNTER: 'invoice-counter',
  ISSUER_PROFILE: 'issuer-profile',
  ISSUER_LOGO: 'issuer-logo',
  CLIENTS: 'clients',
  ARTICLE_TEMPLATES: 'articleTemplates',
  QUOTES: 'quotes',
  QUOTE_COUNTER: 'quote-counter',
  THEME: 'theme',
  AI_SETTINGS: 'ai-settings',
} as const

// Résultat d'une sauvegarde — permet aux appelants de distinguer un quota
// (toast spécifique déjà affiché par storage) d'une erreur inconnue (toast
// générique à gérer par l'appelant).
export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unknown' }

async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await window.storage.get(key)
    return result ? JSON.parse(result.value) as T : fallback
  } catch (err) {
    console.error('Données corrompues pour la clé:', key, err)
    toast.error('Erreur de lecture des données sauvegardées')
    return fallback
  }
}

async function set(key: string, value: unknown): Promise<SaveResult> {
  try {
    const serialized = JSON.stringify(value)
    await window.storage.set(key, serialized)
    return { ok: true }
  } catch (err) {
    console.error('[storage.set] échec pour la clé:', key, err)
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)
    if (isQuota) {
      toast.error('Stockage plein — supprimez d\'anciennes factures ou réduisez le logo')
      return { ok: false, reason: 'quota' }
    }
    return { ok: false, reason: 'unknown' }
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

  // Réglages IA
  getAISettings: () => get<AISettings | null>(KEYS.AI_SETTINGS, null),
  saveAISettings: (settings: AISettings) => set(KEYS.AI_SETTINGS, settings),

  // Logo (séparé pour ne pas surcharger localStorage dans chaque facture)
  getLogo: () => get<string>(KEYS.ISSUER_LOGO, ''),
  saveLogo: (logo: string) => set(KEYS.ISSUER_LOGO, logo),
}
