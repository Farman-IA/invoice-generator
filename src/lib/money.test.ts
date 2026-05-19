import { describe, it, expect } from 'vitest'
import { round2 } from './money'
import { calculateTotals } from './calculations'
import type { LineItem } from '@/types/invoice'

// Test 7 — Précision IEEE 754 : le piège bien connu `1.005`
//
// Sans correction epsilon, Math.round(1.005 * 100) === 100 (donc round2 ramènerait
// 1.005 à 1.00 au lieu de 1.01). Le code de money.ts injecte une correction
// proportionnelle à la magnitude pour neutraliser ce drift.
//
// Si quelqu'un refactore round2 et oublie la correction, ces tests l'attrapent.

describe('round2 — correction IEEE 754 (Test 7)', () => {
  it('arrondit 1.005 à 1.01 (et NON 1.00 comme un Math.round naïf)', () => {
    expect(round2(1.005)).toBe(1.01)
  })

  it('reste correct sur des valeurs de plus grande magnitude (100.005, 1000.005)', () => {
    expect(round2(100.005)).toBe(100.01)
    expect(round2(1000.005)).toBe(1000.01)
  })

  it('applique la règle "half away from zero" sur les valeurs négatives', () => {
    // -1.005 doit s'éloigner de zéro → -1.01, pas -1.00
    expect(round2(-1.005)).toBe(-1.01)
  })

  it('ne dérive pas sur les arrondis normaux qui n\'ont rien à voir avec le piège epsilon', () => {
    expect(round2(0)).toBe(0)
    expect(round2(0.1 + 0.2)).toBe(0.3) // 0.1 + 0.2 = 0.30000000000000004 en JS
    expect(round2(2.345)).toBe(2.35)
    expect(round2(99.999)).toBe(100)
  })

  it('retourne 0 pour les entrées non finies (NaN, Infinity, -Infinity)', () => {
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
    expect(round2(-Infinity)).toBe(0)
  })

  it('propage correctement la correction jusqu\'au total facture (1.005 € HT)', () => {
    // Test d'intégration : si round2 perd la correction, le total ligne casse aussi
    const items: LineItem[] = [
      {
        id: 'epsilon-trap',
        description: 'piège epsilon',
        unit: '',
        quantity: 1,
        unitPrice: 1.005,
        vatRate: 0,
      },
    ]
    const totals = calculateTotals(items)
    expect(totals.totalHT).toBe(1.01)
    expect(totals.totalTTC).toBe(1.01)
  })
})
