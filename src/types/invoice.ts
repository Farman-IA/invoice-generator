export type VatRate = 5.5 | 10 | 20

export interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  vatRate: VatRate
}

export interface IssuerProfile {
  companyName: string
  legalForm: string
  address: string
  postalCode: string
  city: string
  phone: string
  siret: string
  siren: string
  apeNaf: string
  tvaNumber: string
  shareCapital: string
  rcsCity: string
  rcProInsurer: string
  rcProScope: string
  bankName: string
  iban: string
  bic: string
  logo: string
}

export interface ClientInfo {
  companyName: string
  contactName: string
  address: string
  postalCode: string
  city: string
  siren: string
  tvaNumber: string
  codeService: string
}

export interface InvoiceData {
  number: string
  issueDate: string
  deliveryDate: string
  dueDate: string
  purchaseOrder: string
  paymentTerms: string
  notes: string
  deposit: number
  items: LineItem[]
}

export interface InvoiceState {
  issuer: IssuerProfile
  client: ClientInfo
  invoice: InvoiceData
  counter: number
}

export type InvoiceStatus = 'brouillon' | 'finalisée'

export interface SavedInvoice {
  id: string
  issuer: IssuerProfile
  client: ClientInfo
  invoice: InvoiceData
  status: InvoiceStatus
  paymentStatus?: PaymentStatus
  createdAt: string
  updatedAt: string
}

export type AppView = 'DASHBOARD' | 'EDIT' | 'GALLERY' | 'QUOTE_EDIT' | 'QUOTE_GALLERY'

export type QuoteStatus = 'brouillon' | 'envoyé' | 'accepté' | 'refusé'

export interface QuoteData {
  number: string
  issueDate: string
  validityDays: number
  validUntil: string
  purchaseOrder: string
  notes: string
  items: LineItem[]
}

export interface SavedQuote {
  id: string
  issuer: IssuerProfile
  client: ClientInfo
  quote: QuoteData
  status: QuoteStatus
  linkedInvoiceId?: string
  createdAt: string
  updatedAt: string
}

export type PaymentStatus = 'en_attente' | 'payee' | 'en_retard'

export interface ClientRecord {
  id: string
  companyName: string
  contactName: string
  address: string
  postalCode: string
  city: string
  siren: string
  tvaNumber: string
  codeService: string
}

export interface ArticleTemplate {
  id: string
  description: string
  unitPrice: number
  vatRate: VatRate
}

export interface AISettings {
  apiKey: string
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro'
}

export interface ParsedInvoiceData {
  clientName: string
  purchaseOrder?: string
  notes?: string
  items: {
    description: string
    quantity: number
    unitPrice: number
    vatRate: VatRate
  }[]
}
