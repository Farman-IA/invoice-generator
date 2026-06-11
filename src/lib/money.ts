// Helpers arithmétiques monétaires.
//
// Politique d'arrondi du projet : tout montant manipulé hors calcul intermédiaire
// est arrondi à 2 décimales avec la règle "half away from zero" (l'équivalent
// du Math.round natif de JavaScript pour les valeurs positives).
//
// Cette politique correspond à l'arrondi commercial français : on arrondit
// chaque ligne (HT, TVA, TTC) à 2 décimales, puis on somme.
//
// Pourquoi un helper dédié plutôt que `Math.round(x * 100) / 100` partout :
// 1. Le pattern est répété ~30 fois dans le code → centralisation = un seul
//    endroit à corriger en cas de changement de politique (banker's rounding,
//    arrondi sur 4 décimales, etc.)
// 2. L'opérateur `*100 /100` est sujet à imprécision flottante (ex:
//    `Math.round(1.005 * 100) === 100` en JS et non 101 attendu). On gère
//    explicitement ce cas via une normalisation epsilon.
// 3. Les noms `round2` / `toCents` rendent les calculs auto-documentés.

/**
 * Calcule une correction IEEE 754 proportionnelle à la magnitude.
 *
 * L'erreur relative max d'un nombre flottant double est `Number.EPSILON`
 * (≈ 2.22e-16). Pour passer un `100.49999999999999` (qui devrait être
 * 100.5) à `100.5`, il faut ajouter au moins 1 ULP (unit in last place)
 * à cette amplitude, soit environ `value * 100 * Number.EPSILON × N` avec
 * un petit facteur de sécurité.
 *
 * Le facteur 8 couvre les cas où l'erreur s'est cumulée sur 2-3 opérations
 * (multiplication, division) sans risquer de transformer un véritable
 * 0.499 en 0.5 (le saut serait de l'ordre de 0.01 alors que la correction
 * reste sous 1e-13 sur des montants normaux).
 */
function ieeeCorrection(scaled: number): number {
  return Math.abs(scaled) * Number.EPSILON * 8
}

/**
 * Arrondit un montant à 2 décimales (centimes), règle "half away from zero".
 *
 * Corrige l'imprécision IEEE 754 : `1.005 * 100 = 100.49999999999999` en JS
 * produirait `round(100.49) = 100` au lieu de `101`. On ajoute une correction
 * proportionnelle à la magnitude pour neutraliser ce drift sans fausser les
 * arrondis légitimes.
 *
 * @param value montant à arrondir (peut être négatif)
 * @returns valeur arrondie à 2 décimales, ou 0 si entrée non finie
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = value * 100
  const corrected = scaled + (scaled >= 0 ? ieeeCorrection(scaled) : -ieeeCorrection(scaled))
  return Math.round(corrected) / 100
}

/**
 * Convertit un montant euros en centimes (entiers).
 * Utile pour les sommes longues où l'on veut éviter toute imprécision
 * intermédiaire — on travaille en entiers et on convertit en € à la fin.
 */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = value * 100
  const corrected = scaled + (scaled >= 0 ? ieeeCorrection(scaled) : -ieeeCorrection(scaled))
  return Math.round(corrected)
}

/**
 * Convertit des centimes (entiers) en euros (2 décimales).
 */
export function fromCents(cents: number): number {
  return cents / 100
}

/**
 * Vérifie qu'un taux de TVA est exploitable pour une conversion TTC↔HT.
 * Refuse NaN, Infinity, négatif strict — qui produiraient division par zéro
 * ou prix négatif silencieusement écrasé à 0.
 */
export function isValidVatRate(vatRate: number): boolean {
  return Number.isFinite(vatRate) && vatRate >= 0
}

/**
 * Renvoie le prix HT effectif d'une ligne, qu'elle ait été saisie en HT
 * ou en TTC. Toujours arrondi à 2 décimales (cohérence avec l'affichage).
 *
 * Cette fonction est la SOURCE DE VÉRITÉ pour le HT d'une ligne — toute
 * autre méthode de calcul doit passer par elle pour garantir que la
 * facture affichée corresponde EXACTEMENT à la facture calculée.
 */
export function getEffectiveUnitPriceHT(
  unitPrice: number,
  unitPriceTTC: number | undefined,
  vatRate: number,
): number {
  if (unitPriceTTC != null && unitPriceTTC > 0 && isValidVatRate(vatRate)) {
    return round2(unitPriceTTC / (1 + vatRate / 100))
  }
  return round2(unitPrice)
}

/**
 * Prix TTC effectif dérivé d'un prix HT (pour l'affichage d'une ligne
 * saisie en HT). Pendant de getEffectiveUnitPriceHT : centralise la règle
 * d'arrondi HT→TTC au lieu de disperser `round2(ht × (1 + t/100))` dans
 * l'UI — une règle monétaire éparpillée finit toujours par diverger.
 */
export function getEffectiveUnitPriceTTC(unitPrice: number, vatRate: number): number {
  if (!isValidVatRate(vatRate)) return round2(unitPrice)
  return round2(unitPrice * (1 + vatRate / 100))
}

/**
 * Migration au chargement : normalise un LineItem brut chargé depuis le
 * storage en arrondissant unitPrice et unitPriceTTC à 2 décimales.
 *
 * Sans cette étape, les factures sauvegardées AVANT le commit qui a corrigé
 * `convertTtcToHt` (mai 2026, incident "Université de Lorraine") conservent
 * un `unitPrice = 29.51818181...` qui s'affiche `29.52` mais fait diverger
 * les totaux à l'œil. La normalisation au chargement les répare sur place.
 *
 * Conservation de l'invariant TTC : si `unitPriceTTC` est défini, c'est lui
 * la source de vérité (le prix saisi par l'utilisateur ou réclamé par le
 * client) — on le garde tel quel arrondi 2 déc et on dérive le HT.
 */
export function normalizeLineItemPrices<T extends { unitPrice: number; unitPriceTTC?: number; vatRate: number }>(
  item: T,
): T {
  // Si le taux est corrompu (NaN, négatif), on préserve l'item original plutôt
  // que d'écraser silencieusement les prix à 0 (perte de donnée silencieuse).
  // Le rendu surfacera la corruption (TVA aberrante affichée) et l'utilisateur
  // pourra agir, plutôt qu'une facture passée à 0 € sans avertissement.
  if (!isValidVatRate(item.vatRate)) return item

  const hasTTC = item.unitPriceTTC != null && item.unitPriceTTC > 0
  if (hasTTC) {
    const ttc = round2(item.unitPriceTTC!)
    return {
      ...item,
      unitPrice: round2(ttc / (1 + item.vatRate / 100)),
      unitPriceTTC: ttc,
    }
  }
  return { ...item, unitPrice: round2(item.unitPrice) }
}

/**
 * Fusion partielle d'un LineItem qui PRÉSERVE LES INVARIANTS d'arrondi et de
 * cohérence HT/TTC quel que soit le champ modifié.
 *
 * En particulier : si on change le taux de TVA d'une ligne saisie en TTC
 * (`unitPriceTTC` présent), il faut recalculer `unitPrice` à partir du TTC
 * et du NOUVEAU taux — sinon la ligne devient incohérente (HT figé sur
 * l'ancien taux, TTC sur le nouveau).
 *
 * Tous les changements de prix passent par round2.
 */
export function mergeLineItem<T extends { unitPrice: number; unitPriceTTC?: number; vatRate: number }>(
  item: T,
  partial: Partial<T>,
): T {
  const merged = { ...item, ...partial }
  const vatRateChanged = partial.vatRate !== undefined && partial.vatRate !== item.vatRate
  const priceChanged = partial.unitPrice !== undefined || partial.unitPriceTTC !== undefined

  // Si le taux a changé sans qu'un prix soit explicitement re-saisi, on garde
  // l'invariant "TTC saisi est la source de vérité" en recalculant le HT.
  if (vatRateChanged && !priceChanged && merged.unitPriceTTC != null && merged.unitPriceTTC > 0 && isValidVatRate(merged.vatRate)) {
    return {
      ...merged,
      unitPrice: round2(merged.unitPriceTTC / (1 + merged.vatRate / 100)),
    }
  }
  // Arrondi défensif des prix présents dans le patch
  if (partial.unitPrice !== undefined) merged.unitPrice = round2(merged.unitPrice)
  if (partial.unitPriceTTC !== undefined && merged.unitPriceTTC != null) {
    merged.unitPriceTTC = round2(merged.unitPriceTTC) as T['unitPriceTTC']
  }
  return merged
}
