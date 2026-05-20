import type { VatRate, IssuerProfile, ClientInfo, InvoiceData, QuoteData, LineItem } from '@/types/invoice'

export const VAT_RATES: { value: VatRate; label: string; description: string }[] = [
  {
    value: 0,
    label: '0 %',
    description: 'Exonéré / Auto-entrepreneur',
  },
  {
    value: 2.1,
    label: '2,1 %',
    description: 'Presse / Médicaments',
  },
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
    companyName: '',
    legalForm: '',
    address: '',
    postalCode: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    siret: '',
    siren: '',
    apeNaf: '',
    tvaNumber: '',
    shareCapital: '',
    rcsCity: '',
    rcProInsurer: '',
    rcProScope: '',
    bankName: '',
    iban: '',
    bic: '',
    priceMode: 'ht',
  }
}

export function getDefaultClient(): ClientInfo {
  return {
    companyName: '',
    department: '',
    contactName: '',
    legalForm: '',
    address: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    siret: '',
    siren: '',
    apeNaf: '',
    tvaNumber: '',
    codeService: '',
  }
}

// Garantit que les anciens clients charges depuis le storage ont tous les champs
// actuels (avec chaine vide par defaut pour les champs manquants).
export function normalizeClientInfo(client: Partial<ClientInfo> | undefined): ClientInfo {
  return { ...getDefaultClient(), ...client }
}

export function createDefaultLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    unit: 'unité',
    quantity: 1,
    unitPrice: 0,
    vatRate: 10,
  }
}

// Source unique de vérité pour les clés autorisées sur un LineItem stocké.
// Utilisée à 2 endroits critiques :
//   1. La migration `migrations.ts` (whitelist en relecture du localStorage)
//   2. La garde défensive de `addLineItem` (rejet d'un SyntheticEvent React)
//
// IMPORTANT : doit refléter EXACTEMENT le type `LineItem` (src/types/invoice.ts).
// Si un champ y est ajouté (ex: `discount`, `category`), il faut l'ajouter
// ici aussi — sinon la migration le supprimera silencieusement des anciennes
// factures et la garde le rejettera côté UI.
//
// Le typage `readonly LINE_ITEM_KEY[]` couplé à `satisfies` ci-dessous garantit
// au compilateur que toutes les clés sont des `keyof LineItem` valides : si
// quelqu'un fait une faute de frappe ou retire un champ du type, tsc casse.
type LineItemKey = keyof LineItem
export const LINE_ITEM_ALLOWED_KEYS: ReadonlySet<LineItemKey> = new Set<LineItemKey>([
  'id',
  'description',
  'unit',
  'quantity',
  'unitPrice',
  'unitPriceTTC',
  'vatRate',
])

// Filtre un payload entrant pour ne garder que les clés autorisées d'un LineItem.
// Robuste face à TOUS les types d'objets pollués (SyntheticEvent React, Event
// natif, HTMLElement, etc.) : on ne fait JAMAIS confiance à la forme de
// l'objet entrant, on ne sélectionne que les clés explicitement whitelistées.
//
// Utilisée par addLineItem dans useInvoice + useQuotes (source unique).
//
// Retourne `undefined` si le payload n'est pas un objet (string, null,
// number, etc.) ou s'il ne contient AUCUNE clé valide après filtrage —
// dans ce cas, addLineItem retombera sur createDefaultLineItem() seul.
export function sanitizeLineItemPayload(data: unknown): Partial<LineItem> | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const safe: Partial<LineItem> = {}
  let hasAnyKey = false
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (LINE_ITEM_ALLOWED_KEYS.has(key as LineItemKey)) {
      // Cast sûr : on vient juste de vérifier que `key` est une clé valide
      // de LineItem. Le type des valeurs reste la responsabilité de l'appelant
      // (les hooks valident ensuite via calculateTotals / sanitizeLineItem).
      (safe as Record<string, unknown>)[key] = value
      hasAnyKey = true
    }
  }
  return hasAnyKey ? safe : undefined
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
    discount: 0,
    discountType: 'amount',
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
    discount: 0,
    discountType: 'amount',
    items: [createDefaultLineItem()],
  }
}

export const LEGAL_MENTIONS = {
  latePaymentPenalty:
    'En cas de retard de paiement, des pénalités égales à 3 fois le taux d\'intérêt légal seront appliquées',
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
    email: 'Email',
    website: 'Site web (URL)',
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
  } as const,
  client: {
    companyName: 'Nom de la société client',
    department: 'Service destinataire (ex: Factures Fournisseurs)',
    contactName: 'Nom du contact',
    legalForm: 'Statut (ex: SARL, SAS, EI)',
    address: 'Adresse du client',
    addressLine2: 'Complément d\'adresse (ex: Tour / Bâtiment / BP)',
    postalCode: 'Code postal',
    city: 'Ville',
    phone: 'Téléphone',
    email: 'Email',
    website: 'Site web (URL)',
    siret: 'N° SIRET',
    siren: 'N° SIREN',
    apeNaf: 'Code APE/NAF',
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
