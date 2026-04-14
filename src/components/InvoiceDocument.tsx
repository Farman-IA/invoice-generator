import { forwardRef, useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { InlineEdit } from '@/components/InlineEdit'
import { ClientAutocomplete } from '@/components/ClientAutocomplete'
import { LineItemsTable } from '@/components/LineItemsTable'
import { calculateTotals, formatEuro } from '@/lib/calculations'
import { PLACEHOLDERS, LEGAL_MENTIONS } from '@/lib/constants'
import type { IssuerProfile, ClientInfo, InvoiceData, QuoteData, LineItem, ArticleTemplate, ClientRecord, PriceMode } from '@/types/invoice'
import { VALIDITY_OPTIONS } from '@/lib/constants'

interface BaseDocumentProps {
  issuer: IssuerProfile
  client: ClientInfo
  logo?: string
  onUpdateLogo?: (logo: string) => void
  onUpdateIssuer: (partial: Partial<IssuerProfile>) => void
  onUpdateClient: (partial: Partial<ClientInfo>) => void
  onAddLine: () => void
  onRemoveLine: (id: string) => void
  onUpdateLine: (id: string, partial: Partial<LineItem>) => void
  findClientByName?: (query: string) => ClientRecord[]
  onSelectClient?: (client: ClientInfo) => void
  templates?: ArticleTemplate[]
  onSaveAsTemplate?: (item: LineItem) => void
  onInsertTemplate?: (template: ArticleTemplate) => void
  priceMode?: PriceMode
  onPriceModeChange?: (mode: PriceMode) => void
}

interface InvoiceMode extends BaseDocumentProps {
  mode?: 'invoice'
  invoice: InvoiceData
  onUpdateInvoice: (partial: Partial<InvoiceData>) => void
}

interface QuoteMode extends BaseDocumentProps {
  mode: 'quote'
  invoice: QuoteData
  onUpdateInvoice: (partial: Partial<QuoteData>) => void
}

type InvoiceDocumentProps = InvoiceMode | QuoteMode

// F5 fix: extracted reusable component to eliminate 20+ duplicate patterns
function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className="flex gap-1" data-empty={!value ? '' : undefined}>
      <span className="text-gray-400">{label} :</span>
      <InlineEdit
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className ?? 'text-xs'}
      />
    </div>
  )
}

const MAX_LOGO_SIZE = 512 * 1024 // 512 KB

export const InvoiceDocument = forwardRef<HTMLDivElement, InvoiceDocumentProps>(
  function InvoiceDocument(
    {
      issuer,
      client,
      invoice,
      logo = '',
      onUpdateLogo,
      onUpdateIssuer,
      onUpdateClient,
      onUpdateInvoice,
      onAddLine,
      onRemoveLine,
      onUpdateLine,
      findClientByName,
      onSelectClient,
      templates,
      onSaveAsTemplate,
      onInsertTemplate,
      priceMode = 'ht',
      onPriceModeChange,
      ...rest
    },
    ref
  ) {
    const mode = ('mode' in rest && rest.mode === 'quote') ? 'quote' : 'invoice'
    const isQuote = mode === 'quote'
    const logoInputRef = useRef<HTMLInputElement>(null)
    const totals = calculateTotals(invoice.items)

    // F4 fix: validate file type and size before reading
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        toast.error('Format non supporté. Utilisez JPG, PNG ou WebP.')
        return
      }

      if (file.size > MAX_LOGO_SIZE) {
        toast.error('Image trop volumineuse (max 512 Ko)')
        return
      }

      const reader = new FileReader()
      reader.onload = (ev) => {
        onUpdateLogo?.(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }

    return (
      <div
        ref={ref}
        className="invoice-paper max-w-[210mm] mx-auto bg-white shadow-xl p-12 text-gray-900 text-sm leading-relaxed print:shadow-none print:p-0 print:max-w-full"
      >
        {/* ========== HEADER ========== */}
        <div className="flex justify-between items-center mb-10">
          {/* Logo */}
          <div>
            <div
              onClick={() => logoInputRef.current?.click()}
              className={cn(
                "w-56 h-28 rounded-lg flex items-center justify-start cursor-pointer transition-colors overflow-hidden",
                logo
                  ? "border-0 hover:opacity-80"
                  : "border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50"
              )}
            >
              {logo ? (
                <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-gray-400 flex flex-col items-center justify-center w-full h-full gap-1">
                  <ImagePlus className="size-5" />
                  <span className="text-xs">Logo</span>
                </div>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>

          {/* Invoice title */}
          <div className="text-right">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">{isQuote ? 'DEVIS' : 'FACTURE'}</h1>
            <div className="space-y-0.5">
              <div className="flex items-center justify-end gap-2 text-sm">
                <span className="text-gray-500">N°</span>
                <span className="font-semibold">{invoice.number}</span>
              </div>
              <div className="flex items-center justify-end gap-2 text-sm">
                <InlineEdit
                  value={issuer.city}
                  onChange={(v) => onUpdateIssuer({ city: v })}
                  placeholder="Ville"
                  className="text-gray-500"
                />
                <span className="text-gray-400">{issuer.city ? ', le' : 'Le'}</span>
                <InlineEdit
                  value={invoice.issueDate}
                  onChange={(v) => onUpdateInvoice({ issueDate: v })}
                  as="date"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ========== PARTIES ========== */}
        <div className="grid grid-cols-2 gap-12 mb-8">
          {/* Émetteur */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Émetteur
            </h2>
            {/* Identité */}
            <div className="space-y-0.5">
              <InlineEdit
                value={issuer.companyName}
                onChange={(v) => onUpdateIssuer({ companyName: v })}
                placeholder={PLACEHOLDERS.issuer.companyName}
                className="font-semibold"
              />
              <InlineEdit
                value={issuer.legalForm}
                onChange={(v) => onUpdateIssuer({ legalForm: v })}
                placeholder={PLACEHOLDERS.issuer.legalForm}
                className="text-gray-500 text-xs"
              />
            </div>
            {/* Coordonnées */}
            <div className="mt-1.5 space-y-0.5">
              <InlineEdit
                value={issuer.address}
                onChange={(v) => onUpdateIssuer({ address: v })}
                placeholder={PLACEHOLDERS.issuer.address}
              />
              <div className="flex gap-2">
                <InlineEdit
                  value={issuer.postalCode}
                  onChange={(v) => onUpdateIssuer({ postalCode: v })}
                  placeholder={PLACEHOLDERS.issuer.postalCode}
                  className="w-20"
                />
                <InlineEdit
                  value={issuer.city}
                  onChange={(v) => onUpdateIssuer({ city: v })}
                  placeholder={PLACEHOLDERS.issuer.city}
                />
              </div>
              <LabeledField label="Tél" value={issuer.phone} onChange={(v) => onUpdateIssuer({ phone: v })} placeholder={PLACEHOLDERS.issuer.phone} />
              <LabeledField label="Email" value={issuer.email} onChange={(v) => onUpdateIssuer({ email: v })} placeholder={PLACEHOLDERS.issuer.email} />
              <LabeledField label="Web" value={issuer.website} onChange={(v) => onUpdateIssuer({ website: v })} placeholder={PLACEHOLDERS.issuer.website} />
            </div>
            {/* Infos légales */}
            <div className="mt-2 space-y-0.5 text-xs text-gray-600">
              <div className="flex gap-4">
                <LabeledField label="SIRET" value={issuer.siret} onChange={(v) => onUpdateIssuer({ siret: v })} placeholder={PLACEHOLDERS.issuer.siret} />
                <LabeledField label="APE" value={issuer.apeNaf} onChange={(v) => onUpdateIssuer({ apeNaf: v })} placeholder={PLACEHOLDERS.issuer.apeNaf} />
              </div>
              <LabeledField label="SIREN" value={issuer.siren} onChange={(v) => onUpdateIssuer({ siren: v })} placeholder={PLACEHOLDERS.issuer.siren} />
              <LabeledField label="TVA" value={issuer.tvaNumber} onChange={(v) => onUpdateIssuer({ tvaNumber: v })} placeholder={PLACEHOLDERS.issuer.tvaNumber} />
              <div className="flex gap-4">
                <LabeledField label="Capital" value={issuer.shareCapital} onChange={(v) => onUpdateIssuer({ shareCapital: v })} placeholder={PLACEHOLDERS.issuer.shareCapital} />
                <LabeledField label="RCS" value={issuer.rcsCity} onChange={(v) => onUpdateIssuer({ rcsCity: v })} placeholder={PLACEHOLDERS.issuer.rcsCity} />
              </div>
            </div>
          </div>

          {/* Destinataire */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Destinataire
            </h2>
            <div className="space-y-0.5">
              {findClientByName && onSelectClient ? (
                <ClientAutocomplete
                  value={client.companyName}
                  onChange={(v) => onUpdateClient({ companyName: v })}
                  onSelectClient={onSelectClient}
                  findByName={findClientByName}
                  placeholder={PLACEHOLDERS.client.companyName}
                  className="font-semibold text-sm px-0.5 py-0 border-none bg-transparent w-full cursor-text hover:bg-blue-50/60 dark:hover:bg-blue-900/30 focus:outline-none focus:bg-blue-50/40 dark:focus:bg-blue-900/20 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800 rounded"
                />
              ) : (
                <InlineEdit
                  value={client.companyName}
                  onChange={(v) => onUpdateClient({ companyName: v })}
                  placeholder={PLACEHOLDERS.client.companyName}
                  className="font-semibold"
                />
              )}
              <InlineEdit
                value={client.department ?? ''}
                onChange={(v) => onUpdateClient({ department: v })}
                placeholder={PLACEHOLDERS.client.department}
              />
              <InlineEdit
                value={client.contactName}
                onChange={(v) => onUpdateClient({ contactName: v })}
                placeholder={PLACEHOLDERS.client.contactName}
              />
              <InlineEdit
                value={client.addressLine2 ?? ''}
                onChange={(v) => onUpdateClient({ addressLine2: v })}
                placeholder={PLACEHOLDERS.client.addressLine2}
              />
              <InlineEdit
                value={client.address}
                onChange={(v) => onUpdateClient({ address: v })}
                placeholder={PLACEHOLDERS.client.address}
              />
              <div className="flex gap-2">
                <InlineEdit
                  value={client.postalCode}
                  onChange={(v) => onUpdateClient({ postalCode: v })}
                  placeholder={PLACEHOLDERS.client.postalCode}
                  className="w-20"
                />
                <InlineEdit
                  value={client.city}
                  onChange={(v) => onUpdateClient({ city: v })}
                  placeholder={PLACEHOLDERS.client.city}
                />
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                <LabeledField label="Tél." value={client.phone} onChange={(v) => onUpdateClient({ phone: v })} placeholder={PLACEHOLDERS.client.phone} />
                <LabeledField label="Email" value={client.email} onChange={(v) => onUpdateClient({ email: v })} placeholder={PLACEHOLDERS.client.email} />
                <LabeledField label="SIRET" value={client.siret} onChange={(v) => onUpdateClient({ siret: v })} placeholder={PLACEHOLDERS.client.siret} />
                <LabeledField label="SIREN" value={client.siren} onChange={(v) => onUpdateClient({ siren: v })} placeholder={PLACEHOLDERS.client.siren} />
                <LabeledField label="TVA" value={client.tvaNumber} onChange={(v) => onUpdateClient({ tvaNumber: v })} placeholder={PLACEHOLDERS.client.tvaNumber} />
                <LabeledField label="Code service" value={client.codeService} onChange={(v) => onUpdateClient({ codeService: v })} placeholder={PLACEHOLDERS.client.codeService} />
              </div>
            </div>
          </div>
        </div>

        {/* ========== METADATA ========== */}
        <div className="flex flex-wrap gap-x-8 gap-y-1 mb-6 pb-4 border-b border-gray-200 text-xs">
          {isQuote ? (
            <>
              <div className="flex gap-1 whitespace-nowrap items-center">
                <span className="text-gray-400">Validité :</span>
                <select
                  value={(invoice as QuoteData).validityDays}
                  onChange={(e) => onUpdateInvoice({ validityDays: Number(e.target.value) } as never)}
                  className="text-xs border-none bg-transparent cursor-pointer focus:outline-none"
                >
                  {VALIDITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1 whitespace-nowrap">
                <span className="text-gray-400">Valable jusqu'au :</span>
                <span className="font-medium">
                  {new Date((invoice as QuoteData).validUntil).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-1 whitespace-nowrap">
                <span className="text-gray-400">Date de livraison :</span>
                <InlineEdit
                  value={(invoice as InvoiceData).deliveryDate}
                  onChange={(v) => onUpdateInvoice({ deliveryDate: v } as never)}
                  as="date"
                  className="text-xs"
                />
              </div>
              <div className="flex gap-1 whitespace-nowrap">
                <span className="text-gray-400">Date d'échéance :</span>
                <InlineEdit
                  value={(invoice as InvoiceData).dueDate}
                  onChange={(v) => onUpdateInvoice({ dueDate: v } as never)}
                  as="date"
                  className="text-xs"
                />
              </div>
            </>
          )}
          <div className="flex gap-1 whitespace-nowrap" data-empty={!invoice.purchaseOrder ? '' : undefined}>
            <span className="text-gray-400">N° commande :</span>
            <InlineEdit
              value={invoice.purchaseOrder}
              onChange={(v) => onUpdateInvoice({ purchaseOrder: v } as never)}
              placeholder={PLACEHOLDERS.invoice.purchaseOrder}
              className="text-xs"
            />
          </div>
        </div>

        {/* ========== LINE ITEMS ========== */}
        <LineItemsTable
          items={invoice.items}
          onAdd={onAddLine}
          onRemove={onRemoveLine}
          onUpdate={onUpdateLine}
          templates={templates}
          onSaveAsTemplate={onSaveAsTemplate}
          onInsertTemplate={onInsertTemplate}
          priceMode={priceMode}
          onPriceModeChange={onPriceModeChange}
        />

        {/* ========== TOTALS ========== */}
        <div className="mt-6 flex justify-end">
          <div className="w-72 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total HT</span>
              <span className="tabular-nums">{formatEuro(totals.totalHT)} €</span>
            </div>

            {totals.vatBreakdown.map((entry) => (
              <div key={entry.rate} className="flex justify-between text-xs text-gray-500">
                <span>
                  TVA {entry.rate}% sur {formatEuro(entry.baseHT)} €
                </span>
                <span className="tabular-nums">{formatEuro(entry.vatAmount)} €</span>
              </div>
            ))}

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total TVA</span>
              <span className="tabular-nums">{formatEuro(totals.totalVAT)} €</span>
            </div>

            <div className="flex justify-between pt-2 border-t-2 border-gray-800 text-lg font-bold">
              <span>Total TTC</span>
              <span className="tabular-nums">{formatEuro(totals.totalTTC)} €</span>
            </div>

            {/* Acompte (factures uniquement) */}
            {!isQuote && (invoice as InvoiceData).deposit > 0 && (
              <>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-500">Acompte versé</span>
                  <span className="tabular-nums">− {formatEuro((invoice as InvoiceData).deposit)} €</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-800 text-base font-bold">
                  <span>Reste à payer</span>
                  <span className="tabular-nums">
                    {formatEuro(Math.max(0, totals.totalTTC - (invoice as InvoiceData).deposit))} €
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Saisie acompte (factures uniquement, caché en PDF) */}
        {!isQuote && (
          <div className="mt-4 flex justify-end no-print-pdf">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Acompte versé :</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={(invoice as InvoiceData).deposit > 0 ? (invoice as InvoiceData).deposit : ''}
                onChange={(e) => onUpdateInvoice({ deposit: Math.max(0, Number(e.target.value) || 0) } as never)}
                placeholder="0"
                className="w-24 rounded-sm border border-gray-200 bg-white px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-blue-200"
              />
              <span>€</span>
            </div>
          </div>
        )}

        {/* ========== FOOTER ========== */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-4">
          {/* Coordonnées bancaires (factures uniquement) */}
          {!isQuote && (
            <div>
              <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-1">
                Coordonnées bancaires
              </h3>
              <div className="space-y-0.5">
                <LabeledField label="Banque" value={issuer.bankName} onChange={(v) => onUpdateIssuer({ bankName: v })} placeholder={PLACEHOLDERS.issuer.bankName} />
                <LabeledField label="IBAN" value={issuer.iban} onChange={(v) => onUpdateIssuer({ iban: v })} placeholder={PLACEHOLDERS.issuer.iban} className="text-xs font-mono" />
                <LabeledField label="BIC" value={issuer.bic} onChange={(v) => onUpdateIssuer({ bic: v })} placeholder={PLACEHOLDERS.issuer.bic} className="text-xs font-mono" />
              </div>
            </div>
          )}

          {/* Conditions / Validité */}
          {isQuote ? (
            <div>
              <p className="font-semibold text-gray-700 text-xs">
                Devis valable jusqu'au {new Date((invoice as QuoteData).validUntil).toLocaleDateString('fr-FR')}
              </p>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-1">
                Conditions de paiement
              </h3>
              <InlineEdit
                value={(invoice as InvoiceData).paymentTerms}
                onChange={(v) => onUpdateInvoice({ paymentTerms: v } as never)}
                className="text-xs"
              />
            </div>
          )}

          {/* RC Pro */}
          {(issuer.rcProInsurer || issuer.rcProScope) && (
            <div className="text-xs text-gray-400">
              <span>Assurance RC Pro : </span>
              <InlineEdit
                value={issuer.rcProInsurer}
                onChange={(v) => onUpdateIssuer({ rcProInsurer: v })}
                placeholder={PLACEHOLDERS.issuer.rcProInsurer}
                className="text-xs"
              />
              {' — '}
              <InlineEdit
                value={issuer.rcProScope}
                onChange={(v) => onUpdateIssuer({ rcProScope: v })}
                placeholder={PLACEHOLDERS.issuer.rcProScope}
                className="text-xs"
              />
            </div>
          )}

          {/* Mention TVA non applicable (auto-entrepreneurs / franchise de base) */}
          {!issuer.tvaNumber && (
            <div className="text-[10px] text-gray-500 font-medium pt-2 border-t border-gray-100">
              <p>{LEGAL_MENTIONS.tvaExemption}</p>
            </div>
          )}

          {/* Legal mentions */}
          {!isQuote && (
            <div className="text-[10px] text-gray-400 space-y-0.5 pt-2 border-t border-gray-100">
              <p>{LEGAL_MENTIONS.latePaymentPenalty}</p>
              <p>{LEGAL_MENTIONS.recoveryIndemnity}</p>
              <p>{LEGAL_MENTIONS.noEarlyDiscount}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <InlineEdit
              value={invoice.notes}
              onChange={(v) => onUpdateInvoice({ notes: v })}
              placeholder={PLACEHOLDERS.invoice.notes}
              as="textarea"
              className="text-xs"
            />
          </div>
        </div>
      </div>
    )
  }
)
