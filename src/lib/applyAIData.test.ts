import { describe, it, expect } from 'vitest'
import { mergeClientFromAI } from './applyAIData'
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
