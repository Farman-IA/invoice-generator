import { describe, it, expect } from 'vitest'
import { buildItemsFromAI, mergeClientFromAI } from './applyAIData'
import { validateParsedData } from './aiValidation'
import { calculateTotals } from './calculations'
import type { ClientRecord, ParsedInvoiceData } from '@/types/invoice'

// Fabrique un client de carnet complet, avec un SIRET renseigné par défaut.
// Reproduit le cas réel "Université de Lorraine" dont le SIRET est enregistré.
function makeRecord(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'rec-1',
    companyName: 'Université de Lorraine',
    department: '',
    contactName: 'Agence Comptable/Bureau Facturier',
    legalForm: 'Établissement public',
    address: '91 Avenue de la Libération',
    addressLine2: '',
    postalCode: '54021',
    city: 'NANCY CEDEX',
    phone: '03 72 74 00 00',
    email: 'contact@univ-lorraine.fr',
    website: 'univ-lorraine.fr',
    siret: '13001550600013',
    siren: '130015506',
    apeNaf: '8542Z',
    tvaNumber: 'FR47130015506',
    codeService: 'UL1AVECEJ',
    ...overrides,
  }
}

// Construit le payload IA minimal (seuls les champs utiles aux tests sont remplis).
function makeAIData(overrides: Partial<ParsedInvoiceData> = {}): ParsedInvoiceData {
  return { clientName: 'Université de Lorraine', items: [], ...overrides }
}

describe('mergeClientFromAI — régression SIRET (bug Université de Lorraine)', () => {
  it('recopie le SIRET du carnet quand l\'IA reconnaît un client connu', () => {
    const record = makeRecord()
    const result = mergeClientFromAI(makeAIData(), true, () => [record])

    // Le cœur du bug : avant le fix, siret était absent du merge → vide à l'écran.
    expect(result?.siret).toBe('13001550600013')
  })

  it('recopie AUSSI les autres champs autrefois oubliés (téléphone, email, APE, forme juridique, site)', () => {
    const record = makeRecord()
    const result = mergeClientFromAI(makeAIData(), true, () => [record])

    expect(result?.phone).toBe('03 72 74 00 00')
    expect(result?.email).toBe('contact@univ-lorraine.fr')
    expect(result?.website).toBe('univ-lorraine.fr')
    expect(result?.apeNaf).toBe('8542Z')
    expect(result?.legalForm).toBe('Établissement public')
    expect(result?.siren).toBe('130015506')
    expect(result?.tvaNumber).toBe('FR47130015506')
  })

  it('garde le SIRET du carnet même quand l\'IA fournit une nouvelle adresse', () => {
    const record = makeRecord()
    const result = mergeClientFromAI(
      makeAIData({ clientAddress: '2 rue Neuve', clientCity: 'METZ' }),
      false,
      () => [record],
    )

    // L'adresse dictée par l'IA gagne…
    expect(result?.address).toBe('2 rue Neuve')
    expect(result?.city).toBe('METZ')
    // …mais le SIRET non fourni par l'IA reste celui du carnet.
    expect(result?.siret).toBe('13001550600013')
  })

  it('un SIRET dicté par l\'IA prime sur celui du carnet', () => {
    const record = makeRecord({ siret: '00000000000000' })
    const result = mergeClientFromAI(
      makeAIData({ clientSiret: '13001550600013' }),
      false,
      () => [record],
    )
    expect(result?.siret).toBe('13001550600013')
  })

  it('n\'écrase JAMAIS un champ avec une valeur vide du carnet (non-régression audit)', () => {
    // Le carnet a un téléphone et un email vides. Le merge ne doit PAS renvoyer
    // ces clés vides, sinon elles écraseraient un tél/email tapé à la main sur la
    // facture en cours (updateClient fait une fusion).
    const record = makeRecord({ phone: '', email: '' })
    const result = mergeClientFromAI(makeAIData(), false, () => [record])

    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('email')
    // …mais les champs non vides du carnet restent bien présents.
    expect(result?.siret).toBe('13001550600013')
  })
})

describe('mergeClientFromAI — nouveau client (pas dans le carnet)', () => {
  it('remplit le SIRET/SIREN/TVA dictés par l\'IA pour une nouvelle facture', () => {
    const result = mergeClientFromAI(
      makeAIData({
        clientName: 'Nouvelle Société',
        clientSiret: '12345678900011',
        clientSiren: '123456789',
        clientTvaNumber: 'FR12345678900',
      }),
      true,
      () => [], // aucun match dans le carnet
    )

    expect(result?.companyName).toBe('Nouvelle Société')
    expect(result?.siret).toBe('12345678900011')
    expect(result?.siren).toBe('123456789')
    expect(result?.tvaNumber).toBe('FR12345678900')
  })

  it('laisse le SIRET vide si l\'IA ne le fournit pas (jamais inventé)', () => {
    const result = mergeClientFromAI(
      makeAIData({ clientName: 'Société Sans SIRET' }),
      true,
      () => [],
    )
    expect(result?.siret).toBe('')
  })
})

describe('buildItemsFromAI — préservation du TTC saisi', () => {
  it('garde unitPriceTTC même en mode HT (TTC énoncé = source de vérité)', () => {
    const data: ParsedInvoiceData = {
      clientName: 'X',
      items: [{ description: 'Repas', quantity: 13, unitPrice: 27.27, unitPriceTTC: 30, vatRate: 10 }],
    }
    const items = buildItemsFromAI(data, 'ht')
    expect(items[0].unitPriceTTC).toBe(30)
  })

  it('dérive unitPriceTTC en mode TTC quand seule la valeur HT existe', () => {
    const data: ParsedInvoiceData = {
      clientName: 'X',
      items: [{ description: 'Salle', quantity: 1, unitPrice: 500, vatRate: 20 }],
    }
    const items = buildItemsFromAI(data, 'ttc')
    expect(items[0].unitPriceTTC).toBe(600)
  })
})

// Le scénario réel du 11/06/2026 : mail CAP COMPETENCES à 4 sessions,
// 30 € TTC par déjeuner. Chaîne complète réponse IA brute → validation →
// lignes de facture → totaux. Le total TTC doit tomber PILE sur
// 53 déjeuners × 30 € = 1590,00 € (pas 1589,96), grâce au mode "TTC saisi".
describe('intégration — facture CAP COMPETENCES 4 sessions', () => {
  it('4 lignes, codes session préservés, total TTC exact à 1590,00 €', () => {
    const aiRaw = {
      clientName: 'CIC / CAP COMPETENCES',
      items: [
        { description: 'Repas complets le 10/06/2026 code session : 0011263-001032-001', quantity: 13, amount: 30, amountKind: 'unit_ttc', vatRate: 10 },
        { description: 'Repas complets le 11/06/2026 code session : 0028323-000139-001', quantity: 13, amount: 30, amountKind: 'unit_ttc', vatRate: 10 },
        { description: 'Repas complets le 11/06/2026 code session : 0012111-001029-001', quantity: 14, amount: 30, amountKind: 'unit_ttc', vatRate: 10 },
        { description: 'Repas complets le 12/06/2026 code session : 0019727-000598-001', quantity: 13, amount: 30, amountKind: 'unit_ttc', vatRate: 10 },
      ],
    }
    const parsed = validateParsedData(aiRaw, 'ht')
    expect(parsed).not.toBeNull()
    expect(parsed!.items).toHaveLength(4)
    expect(parsed!.items[0].description).toContain('0011263-001032-001')

    const lineItems = buildItemsFromAI(parsed!, 'ht')
    const totals = calculateTotals(lineItems)
    expect(totals.totalTTC).toBe(1590)
    expect(totals.vatBreakdown).toHaveLength(1)
    expect(totals.vatBreakdown[0].rate).toBe(10)
  })
})

describe('mergeClientFromAI — modification ciblée', () => {
  it('n\'ajoute le SIRET que s\'il est explicitement fourni', () => {
    const withSiret = mergeClientFromAI(
      makeAIData({ clientName: 'X', clientSiret: '98765432100019' }),
      false,
      () => [],
    )
    expect(withSiret).toEqual({ companyName: 'X', siret: '98765432100019' })

    const withoutSiret = mergeClientFromAI(
      makeAIData({ clientName: 'X' }),
      false,
      () => [],
    )
    expect(withoutSiret).toEqual({ companyName: 'X' })
  })
})
