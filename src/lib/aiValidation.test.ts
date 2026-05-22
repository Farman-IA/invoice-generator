import { describe, it, expect } from 'vitest'
import { validateParsedData } from './aiValidation'

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
