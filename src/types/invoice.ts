export type VatRate = 0 | 2.1 | 5.5 | 10 | 20

export interface LineItem {
  id: string
  description: string
  unit: string
  quantity: number
  unitPrice: number
  unitPriceTTC?: number
  vatRate: VatRate
}

export interface IssuerProfile {
  companyName: string
  legalForm: string
  address: string
  postalCode: string
  city: string
  phone: string
  email: string
  website: string
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
  priceMode?: PriceMode
}

export interface ClientInfo {
  companyName: string
  department: string
  contactName: string
  legalForm: string
  address: string
  addressLine2: string
  postalCode: string
  city: string
  phone: string
  email: string
  website: string
  siret: string
  siren: string
  apeNaf: string
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
  department: string
  contactName: string
  legalForm: string
  address: string
  addressLine2: string
  postalCode: string
  city: string
  phone: string
  email: string
  website: string
  siret: string
  siren: string
  apeNaf: string
  tvaNumber: string
  codeService: string
}

export interface ArticleTemplate {
  id: string
  description: string
  unit: string
  unitPrice: number
  vatRate: VatRate
}

export type PriceMode = 'ht' | 'ttc'

export interface AISettings {
  apiKey: string
  apiKeyValid?: boolean
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro'
  priceMode: PriceMode
}

export interface ParsedInvoiceData {
  clientName: string
  clientDepartment?: string
  clientAddress?: string
  clientAddressLine2?: string
  clientPostalCode?: string
  clientCity?: string
  contactName?: string
  purchaseOrder?: string
  codeService?: string
  notes?: string
  deposit?: number
  items: {
    description: string
    quantity: number
    unitPrice: number
    unitPriceTTC?: number
    vatRate: VatRate
  }[]
}
