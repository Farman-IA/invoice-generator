import { round2, getEffectiveUnitPriceHT, isValidVatRate } from '@/lib/money'
import type { LineItem } from '@/types/invoice'

// Décision centrale : « que faire du prix que l'utilisateur vient de valider ? »
//
// Extraite de LineItemsTable pour deux raisons :
// 1. Testable sans navigateur (le bug du 01/07/2026 — re-saisie TTC avalée —
//    n'était couvert par AUCUN test car la logique vivait dans le composant).
// 2. La règle « quel prix est la source de vérité ? » est une règle MONÉTAIRE,
//    pas une règle d'affichage — sa place est dans lib/, à côté de money.ts.
//
// Contrat de retour :
// - `null`  → vrai no-op : l'appelant ne déclenche AUCUNE mise à jour d'état
//             (pas de brouillon marqué "modifié" pour un simple clic-validation).
// - patch   → à passer tel quel à updateLineItem (qui applique mergeLineItem).
export function buildPricePatch(
  item: Pick<LineItem, 'unitPrice' | 'unitPriceTTC' | 'vatRate'>,
  rawInput: string,
  isTTCMode: boolean,
): Partial<LineItem> | null {
  // Même parsing défensif que l'historique : illisible ou négatif → 0.
  // Ce que l'utilisateur tape (et voit) EST ce qui est stocké, arrondi 2 déc.
  const newPrice = round2(Math.max(0, Number(rawInput) || 0))

  if (isTTCMode) {
    // Un prix à 0 ne doit JAMAIS laisser d'ancre TTC : calculateTotals
    // flaguerait `unitPriceTTC: 0` comme champ corrompu (sanitize exige > 0).
    // Un taux corrompu interdit la division TTC→HT : repli en HT pur, la
    // corruption du taux reste visible à l'écran au lieu d'être maquillée.
    if (newPrice === 0 || !isValidVatRate(item.vatRate)) {
      return { unitPrice: newPrice, unitPriceTTC: undefined }
    }
    // Déjà ancrée sur CE même TTC → rien à faire.
    if (item.unitPriceTTC != null && round2(item.unitPriceTTC) === newPrice) {
      return null
    }
    // Cœur du fix : on pose l'ancre TTC MÊME SI le montant tapé est identique
    // au montant affiché. Une ligne saisie en HT affiche son TTC dérivé (ex.
    // 618,18 HT @ 10 % → affiche 680) ; retaper « 680 » ne change pas le texte
    // mais change le SENS : 680 devient un TTC sacré (invariant projet), et le
    // groupe de TVA bascule en mode « TVA = TTC − HT » qui répare le centime.
    return {
      unitPrice: round2(newPrice / (1 + item.vatRate / 100)),
      unitPriceTTC: newPrice,
    }
  }

  // Mode HT : si l'utilisateur revalide le HT déjà affiché, on ne touche à
  // rien — surtout pas à l'ancre TTC éventuelle (comportement historique :
  // un cycle TTC→HT→validation sans modif ne doit pas faire dériver le prix
  // d'arrondi en arrondi).
  const currentHT = getEffectiveUnitPriceHT(item.unitPrice, item.unitPriceTTC, item.vatRate)
  if (newPrice === currentHT) {
    return null
  }
  // Nouveau HT volontaire : le HT redevient la référence, l'ancre TTC saute.
  return { unitPrice: newPrice, unitPriceTTC: undefined }
}
