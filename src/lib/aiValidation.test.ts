import { describe, it, expect } from 'vitest'
import { validateParsedData } from './aiValidation'

// L'IA ne calcule plus rien : elle renvoie amount + amountKind, et c'est
// validateParsedData qui fait TOUTES les conversions (TTC→HT, total→unitaire).
// Ces tests verrouillent le contrat né du fiasco CAP COMPETENCES du 11/06/2026
// (30 € TTC devenu 25 € parce que le modèle divisait lui-même avec le mauvais taux).
describe('validateParsedData — montants amount/amountKind', () => {
  const item = (overrides: Record<string, unknown>) => ({
    clientName: 'X',
    items: [{ description: 'Repas', quantity: 1, amount: 0, amountKind: 'unit_ht', vatRate: 10, ...overrides }],
  })

  it('unit_ttc : conserve le TTC énoncé et dérive le HT (mode global HT inclus)', () => {
    const result = validateParsedData(item({ amount: 30, amountKind: 'unit_ttc', vatRate: 10 }), 'ht')
    expect(result?.items[0].unitPriceTTC).toBe(30)
    expect(result?.items[0].unitPrice).toBe(27.27)
  })

  it('le cas du bug du 11/06 : 30 € TTC à 20 % donne 25 € HT mais GARDE le TTC de 30', () => {
    const result = validateParsedData(item({ amount: 30, amountKind: 'unit_ttc', vatRate: 20 }), 'ht')
    expect(result?.items[0].unitPrice).toBe(25)
    expect(result?.items[0].unitPriceTTC).toBe(30)
  })

  it('total_ht : divise par la quantité côté code', () => {
    const result = validateParsedData(item({ quantity: 5, amount: 154.82, amountKind: 'total_ht' }), 'ht')
    expect(result?.items[0].unitPrice).toBe(30.96)
    expect(result?.items[0].unitPriceTTC).toBeUndefined()
  })

  it('total_ttc : divise puis conserve le TTC unitaire', () => {
    const result = validateParsedData(item({ quantity: 4, amount: 100, amountKind: 'total_ttc', vatRate: 10 }), 'ht')
    expect(result?.items[0].unitPriceTTC).toBe(25)
    expect(result?.items[0].unitPrice).toBe(22.73)
  })

  it('amountKind manquant : défaut unit_ttc en mode TTC, unit_ht en mode HT', () => {
    const ttc = validateParsedData(item({ amount: 30, amountKind: undefined, vatRate: 10 }), 'ttc')
    expect(ttc?.items[0].unitPriceTTC).toBe(30)
    const ht = validateParsedData(item({ amount: 30, amountKind: undefined, vatRate: 10 }), 'ht')
    expect(ht?.items[0].unitPriceTTC).toBeUndefined()
    expect(ht?.items[0].unitPrice).toBe(30)
  })

  it('rétro-compat : lit encore unitPrice si amount est absent (ancien format)', () => {
    const result = validateParsedData(
      { clientName: 'X', items: [{ description: 'Repas', quantity: 2, unitPrice: 30, vatRate: 10 }] },
      'ht',
    )
    expect(result?.items[0].unitPrice).toBe(30)
  })
})

describe('validateParsedData — filet TVA métier restauration', () => {
  it('taux invalide sur un libellé de repas → 10 % (pas 20 %)', () => {
    const result = validateParsedData(
      { clientName: 'X', items: [{ description: 'déjeuner de groupe', quantity: 13, amount: 30, amountKind: 'unit_ttc', vatRate: 99 }] },
      'ht',
    )
    expect(result?.items[0].vatRate).toBe(10)
  })

  it('taux invalide sur un libellé non-restauration → 20 %', () => {
    const result = validateParsedData(
      { clientName: 'X', items: [{ description: 'Conseil stratégique', quantity: 1, amount: 100, amountKind: 'unit_ht', vatRate: 99 }] },
      'ht',
    )
    expect(result?.items[0].vatRate).toBe(20)
  })
})

describe('validateParsedData — identifiants légaux du client', () => {
  it('retire les espaces d\'un SIRET / SIREN dicté', () => {
    const result = validateParsedData(
      { clientName: 'Université de Lorraine', clientSiret: '130 015 506 00013', clientSiren: '130 015 506' },
      'ht',
    )
    expect(result?.clientSiret).toBe('13001550600013')
    expect(result?.clientSiren).toBe('130015506')
  })

  it('normalise le n° de TVA en retirant les espaces', () => {
    const result = validateParsedData(
      { clientName: 'X', clientTvaNumber: 'FR 47 130015506' },
      'ht',
    )
    expect(result?.clientTvaNumber).toBe('FR47130015506')
  })

  it('laisse les identifiants à undefined quand ils sont absents', () => {
    const result = validateParsedData({ clientName: 'X' }, 'ht')
    expect(result?.clientSiret).toBeUndefined()
    expect(result?.clientSiren).toBeUndefined()
    expect(result?.clientTvaNumber).toBeUndefined()
  })
})
