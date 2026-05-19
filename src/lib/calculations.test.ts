import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateTotals } from './calculations'
import type { LineItem } from '@/types/invoice'

// Helper de construction d'un LineItem complet, avec valeurs par défaut sûres.
// Évite de répéter `unit: ''`, `description: ''`, `id: ...` dans chaque test.
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

describe('calculateTotals — cas nominal HT pur multi-TVA (Test 1)', () => {
  it('calcule correctement HT, TVA par taux et TTC sur 3 lignes à taux différents', () => {
    // Setup : 3 lignes HT pur, taux différents
    //  - 100 € HT × 1 @ TVA 20%  → TVA 20.00 €, TTC 120.00 €
    //  - 50 € HT  × 2 @ TVA 10%  → HT 100.00 €, TVA 10.00 €, TTC 110.00 €
    //  - 30 € HT  × 1 @ TVA 5.5% → TVA 1.65 €, TTC 31.65 €
    // Total attendu : HT 230.00 €, TVA 31.65 €, TTC 261.65 €
    const items: LineItem[] = [
      makeItem({ quantity: 1, unitPrice: 100, vatRate: 20 }),
      makeItem({ quantity: 2, unitPrice: 50, vatRate: 10 }),
      makeItem({ quantity: 1, unitPrice: 30, vatRate: 5.5 }),
    ]

    const totals = calculateTotals(items)

    expect(totals.totalHT).toBe(230)
    expect(totals.discountAmount).toBe(0)
    expect(totals.totalHTAfterDiscount).toBe(230)
    expect(totals.totalVAT).toBe(31.65)
    expect(totals.totalTTC).toBe(261.65)
    expect(totals.sanitizedFieldsCount).toBe(0)

    expect(totals.vatBreakdown).toHaveLength(3)
    expect(totals.vatBreakdown[0]).toEqual({ rate: 5.5, baseHT: 30, vatAmount: 1.65 })
    expect(totals.vatBreakdown[1]).toEqual({ rate: 10, baseHT: 100, vatAmount: 10 })
    expect(totals.vatBreakdown[2]).toEqual({ rate: 20, baseHT: 100, vatAmount: 20 })

    const sumBase = totals.vatBreakdown.reduce((s, e) => s + e.baseHT, 0)
    expect(sumBase).toBe(totals.totalHTAfterDiscount)
    expect(totals.totalHTAfterDiscount + totals.totalVAT).toBe(totals.totalTTC)
  })
})

describe('calculateTotals — cas TTC pur "Université de Lorraine" (Test 2)', () => {
  it('conserve EXACTEMENT le TTC saisi par l\'utilisateur, dérive le HT par division', () => {
    // Scénario du bug historique : 32.50 € TTC × 3 @ TVA 10%
    // Le TTC saisi (97.50 €) DOIT être préservé au centime près.
    // Le HT est dérivé : 97.50 / 1.10 = 88.6363... → round2 → 88.64 €
    // TVA = TTC - HT = 97.50 - 88.64 = 8.86 €
    const items: LineItem[] = [
      makeItem({ quantity: 3, unitPrice: 0, unitPriceTTC: 32.50, vatRate: 10 }),
    ]

    const totals = calculateTotals(items)

    // INVARIANT NON NÉGOCIABLE : le TTC saisi ne bouge pas
    expect(totals.totalTTC).toBe(97.50)
    expect(totals.totalHT).toBe(88.64)
    expect(totals.totalVAT).toBe(8.86)
    expect(totals.vatBreakdown).toEqual([
      { rate: 10, baseHT: 88.64, vatAmount: 8.86 },
    ])

    // Cohérence croisée
    expect(totals.totalHTAfterDiscount + totals.totalVAT).toBe(totals.totalTTC)
  })
})

describe('calculateTotals — mix HT + TTC sur même taux (Test 3)', () => {
  it('regroupe les deux lignes sur une seule entrée TVA quel que soit l\'ordre des lignes', () => {
    // Cas piégeux : une ligne HT et une ligne TTC sur le MÊME taux 20%.
    // Sans la pré-passe ttcInputRates, l'ordre des lignes changerait le résultat.
    //  - Ligne A : 100 € HT × 1 @ 20%   → HT 100 €, TTC dérivé 120 €
    //  - Ligne B : 120 € TTC × 1 @ 20%  → HT dérivé 100 €, TTC 120 €
    // Total : HT 200 €, TVA 40 €, TTC 240 €
    const itemA = makeItem({ id: 'A', quantity: 1, unitPrice: 100, vatRate: 20 })
    const itemB = makeItem({ id: 'B', quantity: 1, unitPrice: 0, unitPriceTTC: 120, vatRate: 20 })

    const totalsAB = calculateTotals([itemA, itemB])
    const totalsBA = calculateTotals([itemB, itemA])

    // Une seule entrée dans le breakdown (même taux 20%)
    expect(totalsAB.vatBreakdown).toHaveLength(1)
    expect(totalsAB.vatBreakdown[0]).toEqual({ rate: 20, baseHT: 200, vatAmount: 40 })
    expect(totalsAB.totalHT).toBe(200)
    expect(totalsAB.totalTTC).toBe(240)

    // INVARIANT D'IDEMPOTENCE : l'ordre des lignes ne doit JAMAIS changer le résultat
    expect(totalsBA).toEqual(totalsAB)
  })
})

describe('calculateTotals — remise multi-taux avec réconciliation des arrondis (Test 4)', () => {
  it('garantit Σ baseHT === totalHTAfterDiscount même quand la remise produit des arrondis divergents', () => {
    // 2 lignes 33.33 € sur 2 taux différents → totalHT 66.66 €
    // Remise 15 % → discountAmount 10 € (round2 de 9.999)
    // L'enjeu : que la répartition proportionnelle de la remise sur chaque taux
    // ne fasse pas diverger la somme des bases du totalHTAfterDiscount.
    const items: LineItem[] = [
      makeItem({ id: 'L1', quantity: 1, unitPrice: 33.33, vatRate: 20 }),
      makeItem({ id: 'L2', quantity: 1, unitPrice: 33.33, vatRate: 10 }),
    ]

    const totals = calculateTotals(items, { discount: 15, discountType: 'percent' })

    expect(totals.totalHT).toBe(66.66)
    expect(totals.discountAmount).toBeGreaterThan(0)

    // INVARIANTS NON NÉGOCIABLES (cf. project_money_invariants.md)
    const sumBase = totals.vatBreakdown.reduce((s, e) => s + e.baseHT, 0)
    expect(Math.abs(sumBase - totals.totalHTAfterDiscount)).toBeLessThanOrEqual(0.001)

    const sumVat = totals.vatBreakdown.reduce((s, e) => s + e.vatAmount, 0)
    // totalVAT est lui-même un round2(sumVat), donc on accepte 1 centime d'écart au plus
    expect(Math.abs(sumVat - totals.totalVAT)).toBeLessThanOrEqual(0.01)

    // HT + TVA === TTC
    expect(totals.totalHTAfterDiscount + totals.totalVAT).toBe(totals.totalTTC)

    // Aucune valeur NaN/Infinity ne s'est glissée
    expect(Number.isFinite(totals.totalHT)).toBe(true)
    expect(Number.isFinite(totals.totalTTC)).toBe(true)
    expect(Number.isFinite(totals.totalVAT)).toBe(true)
  })
})

describe('calculateTotals — robustesse face aux remises invalides (Test 5)', () => {
  // Tableau de cas : tester l'absorption des saisies aberrantes sur la remise
  const cases = [
    {
      name: 'remise en € supérieure au HT → clampée au totalHT',
      discount: 1000,
      discountType: 'amount' as const,
      expectedDiscountAmount: 100,
      expectedHTAfterDiscount: 0,
    },
    {
      name: 'remise en % supérieure à 100 → clampée à 100',
      discount: 150,
      discountType: 'percent' as const,
      expectedDiscountAmount: 100,
      expectedHTAfterDiscount: 0,
    },
    {
      name: 'remise NaN → ignorée silencieusement (équivalent à pas de remise)',
      discount: NaN,
      discountType: 'amount' as const,
      expectedDiscountAmount: 0,
      expectedHTAfterDiscount: 100,
    },
  ]

  it.each(cases)('$name', ({ discount, discountType, expectedDiscountAmount, expectedHTAfterDiscount }) => {
    const items: LineItem[] = [
      makeItem({ quantity: 1, unitPrice: 100, vatRate: 20 }),
    ]

    const totals = calculateTotals(items, { discount, discountType })

    expect(totals.totalHT).toBe(100)
    expect(totals.discountAmount).toBe(expectedDiscountAmount)
    expect(totals.totalHTAfterDiscount).toBe(expectedHTAfterDiscount)

    // Garanties globales quel que soit le cas
    expect(totals.totalTTC).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(totals.totalTTC)).toBe(true)
    expect(Number.isFinite(totals.totalVAT)).toBe(true)
    expect(totals.sanitizedFieldsCount).toBe(0) // remise non comptée comme champ de ligne
  })
})

describe('calculateTotals — sanitisation bruyante des champs corrompus (Test 6)', () => {
  // Mock de console.warn pour vérifier qu'on alerte effectivement
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('compte exactement les champs corrompus et émet un console.warn par occurrence', () => {
    // 3 lignes avec 1 champ corrompu chacune (cf. Finding #5)
    //  - A : quantity NaN
    //  - B : unitPrice Infinity
    //  - C : vatRate négatif
    const items: LineItem[] = [
      makeItem({ id: 'A', quantity: NaN, unitPrice: 50, vatRate: 20 }),
      makeItem({ id: 'B', quantity: 2, unitPrice: Infinity, vatRate: 20 }),
      // On caste car le type interdit un vatRate négatif, mais runtime peut le voir
      // (ex: hallucination IA, brouillon migré, payload manipulé)
      makeItem({ id: 'C', quantity: 1, unitPrice: 100, vatRate: -5 as unknown as 20 }),
    ]

    const totals = calculateTotals(items)

    // Compteur exact : 3 corruptions sur Pass 2 (Pass 1 ne compte pas)
    expect(totals.sanitizedFieldsCount).toBe(3)

    // Chaque corruption produit son propre console.warn (3 lignes corrompues
    // × 2 passes dans calculateTotals = 6 warns au total)
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(3)

    // Aucun crash, valeurs finies, totaux non-NaN
    expect(Number.isFinite(totals.totalHT)).toBe(true)
    expect(Number.isFinite(totals.totalTTC)).toBe(true)
    expect(Number.isFinite(totals.totalVAT)).toBe(true)

    // Lignes A et B contribuent 0 (qty=0 ou unitPrice=0 après sanitisation)
    // Ligne C contribue 100 (vatRate=0 après sanitisation → pas de TVA)
    expect(totals.totalHT).toBe(100)
    expect(totals.totalVAT).toBe(0)
    expect(totals.totalTTC).toBe(100)
  })
})
