import type { VatRate, IssuerProfile, ClientInfo, InvoiceData, QuoteData, LineItem } from '@/types/invoice'

export const VAT_RATES: { value: VatRate; label: string; description: string }[] = [
  {
    value: 5.5,
    label: '5,5 %',
    description: 'Alimentaire',
  },
  {
    value: 10,
    label: '10 %',
    description: 'Restauration',
  },
  {
    value: 20,
    label: '20 %',
    description: 'Alcool / Services',
  },
]

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function generateInvoiceNumber(counter: number): string {
  const year = new Date().getFullYear()
  return `FAC-${year}-${String(counter).padStart(3, '0')}`
}

export function getDefaultIssuer(): IssuerProfile {
  return {
    companyName: 'Studio Dupont Digital',
    legalForm: 'SASU',
    address: '12 rue des Lilas',
    postalCode: '57000',
    city: 'Metz',
    phone: '06 12 34 56 78',
    siret: '912 345 678 00012',
    siren: '912 345 678',
    apeNaf: '6201Z',
    tvaNumber: 'FR 32 912345678',
    shareCapital: '1 000 €',
    rcsCity: 'Metz',
    rcProInsurer: 'AXA France',
    rcProScope: 'Conseil et développement informatique',
    bankName: 'Crédit Mutuel',
    iban: 'FR76 1027 8060 0100 0204 6830 174',
    bic: 'CMCIFR2A',
    logo: '',
  }
}

export function getDefaultClient(): ClientInfo {
  return {
    companyName: '',
    contactName: '',
    address: '',
    postalCode: '',
    city: '',
    siren: '',
    tvaNumber: '',
    codeService: '',
  }
}

export function createDefaultLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    vatRate: 10,
  }
}

export function getDefaultInvoice(counter: number): InvoiceData {
  const today = new Date()
  const dueDate = new Date(today)
  dueDate.setDate(dueDate.getDate() + 30)

  return {
    number: generateInvoiceNumber(counter),
    issueDate: formatDate(today),
    deliveryDate: formatDate(today),
    dueDate: formatDate(dueDate),
    purchaseOrder: '',
    paymentTerms: 'Virement bancaire à 30 jours',
    notes: '',
    deposit: 0,
    items: [createDefaultLineItem()],
  }
}

export { generateInvoiceNumber }

function generateQuoteNumber(counter: number): string {
  const year = new Date().getFullYear()
  return `DEV-${year}-${String(counter).padStart(3, '0')}`
}

export { generateQuoteNumber }

export const VALIDITY_OPTIONS = [
  { value: 15, label: '15 jours' },
  { value: 30, label: '30 jours' },
  { value: 60, label: '60 jours' },
  { value: 90, label: '90 jours' },
]

export function getDefaultQuote(counter: number): QuoteData {
  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(validUntil.getDate() + 30)

  return {
    number: generateQuoteNumber(counter),
    issueDate: formatDate(today),
    validityDays: 30,
    validUntil: formatDate(validUntil),
    purchaseOrder: '',
    notes: '',
    items: [createDefaultLineItem()],
  }
}

export const LEGAL_MENTIONS = {
  latePaymentPenalty:
    'Taux de pénalité de retard : 12,15 % par an (taux directeur BCE majoré de 10 points)',
  recoveryIndemnity:
    'En cas de retard de paiement, une indemnité forfaitaire de 40 € pour frais de recouvrement sera exigée (Art. L.441-10 et D.441-5 du Code de commerce)',
  noEarlyDiscount: "Pas d'escompte pour paiement anticipé",
  tvaExemption: 'TVA non applicable, article 293 B du Code général des impôts',
}

export const PLACEHOLDERS = {
  issuer: {
    companyName: 'Nom de votre société',
    legalForm: 'Statut (ex: SARL, SAS, EI)',
    address: 'Adresse du siège social',
    postalCode: 'Code postal',
    city: 'Ville',
    phone: 'Téléphone',
    siret: 'N° SIRET',
    siren: 'N° SIREN',
    apeNaf: 'Code APE/NAF',
    tvaNumber: 'N° TVA intracommunautaire',
    shareCapital: 'Capital social',
    rcsCity: 'Ville RCS',
    rcProInsurer: 'Assureur RC Pro',
    rcProScope: 'Portée RC Pro',
    bankName: 'Nom de la banque',
    iban: 'FR76 XXXX XXXX XXXX XXXX XXXX XXX',
    bic: 'BIC / SWIFT',
  },
  client: {
    companyName: 'Nom de la société client',
    contactName: 'Nom du contact',
    address: 'Adresse du client',
    postalCode: 'Code postal',
    city: 'Ville',
    siren: 'N° SIREN client',
    tvaNumber: 'N° TVA intracommunautaire',
    codeService: 'Code service',
  },
  invoice: {
    purchaseOrder: 'N° bon de commande',
    notes: 'Notes ou mentions complémentaires...',
  },
  lineItem: {
    description: 'Description du produit ou service',
  },
}
