import { describe, it, expect } from 'vitest'
import { buildPricePatch } from './priceInput'
import { mergeLineItem } from './money'
import { calculateTotals } from './calculations'
import type { LineItem } from '@/types/invoice'

// Helper de construction d'un LineItem complet (même convention que
// calculations.test.ts) : évite de répéter les champs sans intérêt pour le test.
function makeItem(overrides: Partial<LineItem> & Pick<LineItem, 'quantity' | 'unitPrice' | 'vatRate'>): LineItem {
  return {
    id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`,
    description: overrides.description ?? 'Test',
    unit: overrides.unit ?? '',
    quantity: overrides.quantity,
    unitPrice: overrides.unitPrice,
    vatRate: overrides.vatRate,
    ...(overrides.unitPriceTTC !== undefined ? { unitPriceTTC: overrides.unitPriceTTC } : {}),
  }
}

describe('buildPricePatch — mode TTC : promotion d\'une ligne HT vers l\'ancrage TTC', () => {
  it('retaper le MÊME montant TTC que celui affiché pose quand même l\'ancre TTC (bug du 01/07/2026)', () => {
    // Ligne saisie en HT : 618,18 € @ 10 %. En mode TTC elle AFFICHE 680
    // (618,18 × 1,10 arrondi). L'utilisateur retape "680" : le texte ne change
    // pas, mais le SENS change — 680 devient un TTC sacré. Avant le fix,
    // cette re-saisie était avalée (aucun patch) et le total restait 1 729,99 €.
    const item = makeItem({ quantity: 1, unitPrice: 618.18, vatRate: 10 })

    const patch = buildPricePatch(item, '680', true)

    expect(patch).not.toBeNull()
    expect(patch).toEqual({ unitPrice: 618.18, unitPriceTTC: 680 })
  })

  it('retaper le même TTC sur une ligne DÉJÀ ancrée TTC ne produit aucun patch (vrai no-op)', () => {
    const item = makeItem({ quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 })
    expect(buildPricePatch(item, '680', true)).toBeNull()
  })

  it('saisir un NOUVEAU montant TTC remplace l\'ancre et dérive le HT arrondi', () => {
    const item = makeItem({ quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 })
    const patch = buildPricePatch(item, '700', true)
    // 700 / 1,10 = 636,3636… → round2 → 636,36
    expect(patch).toEqual({ unitPrice: 636.36, unitPriceTTC: 700 })
  })

  it('saisir 0 en mode TTC remet le prix à zéro SANS laisser d\'ancre TTC fantôme', () => {
    // Une ancre unitPriceTTC = 0 serait flaguée "champ corrompu" par
    // calculateTotals (sanitize exige > 0) → il faut l'effacer, pas la stocker.
    const item = makeItem({ quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 })
    expect(buildPricePatch(item, '0', true)).toEqual({ unitPrice: 0, unitPriceTTC: undefined })
  })

  it('saisie illisible ("abc") = 0, même comportement défensif que l\'ancien code', () => {
    const item = makeItem({ quantity: 1, unitPrice: 618.18, vatRate: 10 })
    expect(buildPricePatch(item, 'abc', true)).toEqual({ unitPrice: 0, unitPriceTTC: undefined })
  })

  it('taux de TVA corrompu (NaN) : repli sûr en ancrage HT, pas de division foireuse', () => {
    const item = makeItem({ quantity: 1, unitPrice: 100, vatRate: NaN as unknown as LineItem['vatRate'] })
    expect(buildPricePatch(item, '120', true)).toEqual({ unitPrice: 120, unitPriceTTC: undefined })
  })
})

describe('buildPricePatch — mode HT : préservation de l\'ancre TTC existante', () => {
  it('retaper le même HT affiché sur une ligne ancrée TTC ne casse PAS l\'ancre (no-op)', () => {
    // Comportement historique conservé : valider le champ sans le changer ne
    // doit pas faire dériver la ligne d'arrondi en arrondi.
    const item = makeItem({ quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 })
    expect(buildPricePatch(item, '618.18', false)).toBeNull()
  })

  it('retaper le même HT sur une ligne HT pure ne produit aucun patch (zéro churn d\'état)', () => {
    const item = makeItem({ quantity: 1, unitPrice: 618.18, vatRate: 10 })
    expect(buildPricePatch(item, '618.18', false)).toBeNull()
  })

  it('saisir un NOUVEAU HT efface l\'ancre TTC (l\'utilisateur re-décide en HT)', () => {
    const item = makeItem({ quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 })
    expect(buildPricePatch(item, '600', false)).toEqual({ unitPrice: 600, unitPriceTTC: undefined })
  })
})

describe('scénario complet du 01/07/2026 — facture 680 + 700 TTC @ 10 % et 350 TTC @ 20 %', () => {
  it('avant re-saisie (lignes HT pures) : total 1 729,99 € — comportement légal documenté', () => {
    const items = [
      makeItem({ id: 'a', quantity: 1, unitPrice: 618.18, vatRate: 10 }),
      makeItem({ id: 'b', quantity: 1, unitPrice: 291.67, vatRate: 20 }),
      makeItem({ id: 'c', quantity: 1, unitPrice: 636.36, vatRate: 10 }),
    ]
    const totals = calculateTotals(items)
    expect(totals.totalTTC).toBe(1729.99)
  })

  it('après re-saisie des TTC en mode TTC : total EXACTEMENT 1 730,00 €', () => {
    // Rejoue le geste utilisateur : bascule en mode TTC puis re-saisie de
    // chaque prix affiché (680, 350, 700). Chaque patch passe par
    // mergeLineItem comme dans useInvoice.updateLineItem — chemin réel.
    let items = [
      makeItem({ id: 'a', quantity: 1, unitPrice: 618.18, vatRate: 10 }),
      makeItem({ id: 'b', quantity: 1, unitPrice: 291.67, vatRate: 20 }),
      makeItem({ id: 'c', quantity: 1, unitPrice: 636.36, vatRate: 10 }),
    ]
    const saisies: Array<[string, string]> = [['a', '680'], ['b', '350'], ['c', '700']]

    for (const [id, texte] of saisies) {
      items = items.map((it) => {
        if (it.id !== id) return it
        const patch = buildPricePatch(it, texte, true)
        // Le cœur du bug : AUCUN de ces patchs ne doit être null,
        // même si le montant tapé est identique au montant affiché.
        expect(patch).not.toBeNull()
        return mergeLineItem(it, patch!)
      })
    }

    const totals = calculateTotals(items)

    // TVA 10 % en mode TTC sacré : 1 380,00 − 1 254,54 = 125,46 (pas 125,45)
    const vat10 = totals.vatBreakdown.find((e) => e.rate === 10)
    const vat20 = totals.vatBreakdown.find((e) => e.rate === 20)
    expect(vat10).toEqual({ rate: 10, baseHT: 1254.54, vatAmount: 125.46 })
    expect(vat20).toEqual({ rate: 20, baseHT: 291.67, vatAmount: 58.33 })
    expect(totals.totalVAT).toBe(183.79)
    expect(totals.totalTTC).toBe(1730)
  })

  it('promouvoir UNE SEULE ligne du groupe 10 % suffit à réparer le centime du groupe', () => {
    // Invariant "hasTTCInput" : dès qu'une ligne du taux est ancrée TTC, tout
    // le groupe passe en mode TTC − HT (les lignes HT contribuent leur TTC dérivé).
    const items = [
      makeItem({ id: 'a', quantity: 1, unitPrice: 618.18, unitPriceTTC: 680, vatRate: 10 }),
      makeItem({ id: 'c', quantity: 1, unitPrice: 636.36, vatRate: 10 }),
    ]
    const totals = calculateTotals(items)
    expect(totals.totalTTC).toBe(1380)
  })
})
