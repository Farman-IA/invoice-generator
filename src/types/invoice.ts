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
