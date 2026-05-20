import { toast } from 'sonner'
import { LINE_ITEM_ALLOWED_KEYS, createDefaultLineItem } from '@/lib/constants'
import { publish, type StorageEventType } from '@/lib/storageChannel'

/**
 * Migrations one-shot sur localStorage.
 *
 * Exécutées AVANT le mount React, depuis main.tsx, pour garantir que les
 * hooks (useInvoice, useQuotes) ne lisent jamais de données polluées.
 *
 * Garanties :
 *   - Idempotence : un flag est posé en fin d'exécution, mais UNIQUEMENT
 *     si toutes les écritures ont réussi. Sur échec partiel (quota, mode
 *     privé Safari), la migration sera retentée au prochain démarrage.
 *   - Multi-onglet : après chaque écriture réussie, on publie sur le
 *     BroadcastChannel pour que les autres onglets relisent depuis le
 *     storage nettoyé (sinon ils ré-écraseraient avec leur version polluée
 *     en mémoire).
 *   - Feedback utilisateur : un toast `sonner` est affiché en cas d'échec
 *     d'écriture, en cohérence avec storage.ts (id stable anti-empilement).
 */

// Flag idempotent — la version est datée pour permettre de chaîner d'autres
// migrations futures sans réécraser celle-ci.
const MIGRATION_FLAG_KEY = 'migration:lineitems-cleanup-v1'

// Table interne couplant chaque clé de stockage à son container et à
// l'évènement BroadcastChannel correspondant. Cette table fait office de
// "lookup table" pour éviter les paramètres positionnels couplés non
// vérifiables par TypeScript (anciennement `migrateStorageKey(key, container)`).
// Avantage : impossible de mal câbler "invoices" avec "quote" — le compilateur
// rejette toute combinaison non listée.
type StorageKey = 'invoices' | 'quotes'
interface StorageTarget {
  // Clé du document dans le tableau stocké (inv.invoice.items / qt.quote.items)
  container: 'invoice' | 'quote'
  // Évènement à publier sur le BroadcastChannel après nettoyage réussi
  broadcastEvent: StorageEventType
}
const STORAGE_TARGETS: Record<StorageKey, StorageTarget> = {
  invoices: { container: 'invoice', broadcastEvent: 'invoices:updated' },
  quotes: { container: 'quote', broadcastEvent: 'quotes:updated' },
}

// Résultat d'une étape de migration. `ok: false` doit bloquer la pose du flag
// d'idempotence pour que la migration soit retentée au prochain boot.
type MigrationResult =
  | { ok: true; docsScanned: number; droppedCount: number; wrote: boolean }
  | { ok: false; reason: 'quota' | 'unknown' }

// Nettoie un seul line item : ne garde que les clés whitelistées définies
// dans LINE_ITEM_ALLOWED_KEYS (source unique de vérité, cf. constants.ts).
//
// Si l'item est entièrement corrompu (string, null, number — donc PAS un
// objet), on retourne un LineItem par défaut PLEIN (createDefaultLineItem)
// plutôt qu'un squelette vide. Sans ça, un `item.description.trim()` plus
// loin dans l'app lèverait une TypeError sur `undefined.trim`.
function cleanLineItem(item: unknown): { cleaned: Record<string, unknown>; droppedKeys: string[] } {
  if (!item || typeof item !== 'object') {
    return { cleaned: { ...createDefaultLineItem() }, droppedKeys: [] }
  }
  const cleaned: Record<string, unknown> = {}
  const droppedKeys: string[] = []
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (LINE_ITEM_ALLOWED_KEYS.has(key as never)) {
      cleaned[key] = value
    } else {
      droppedKeys.push(key)
    }
  }
  return { cleaned, droppedKeys }
}

// Nettoie le tableau `items` d'une facture / devis stocké.
function cleanItemsArray(items: unknown): { items: unknown[]; droppedCount: number } {
  if (!Array.isArray(items)) return { items: [], droppedCount: 0 }
  let droppedCount = 0
  const out = items.map(it => {
    const { cleaned, droppedKeys } = cleanLineItem(it)
    droppedCount += droppedKeys.length
    return cleaned
  })
  return { items: out, droppedCount }
}

// Migre une seule clé de stockage. Retourne un résultat explicite
// (ok / quota / unknown) pour que l'appelant décide s'il pose le flag final.
function migrateStorageKey(storageKey: StorageKey): MigrationResult {
  const target = STORAGE_TARGETS[storageKey]
  const raw = localStorage.getItem(storageKey)
  // Cas trivial : rien en stock pour cette clé → migration "réussie" par défaut.
  if (!raw) return { ok: true, docsScanned: 0, droppedCount: 0, wrote: false }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    // JSON déjà cassé en stockage — on ne touche pas, mais on considère la
    // migration comme réussie : aucune écriture à faire, et storage.get()
    // affichera son propre toast "Erreur de lecture" au mount React.
    console.warn(`[migration] JSON invalide pour "${storageKey}", skip`, err)
    return { ok: true, docsScanned: 0, droppedCount: 0, wrote: false }
  }
  if (!Array.isArray(parsed)) {
    return { ok: true, docsScanned: 0, droppedCount: 0, wrote: false }
  }

  let totalDropped = 0
  const cleaned = parsed.map(doc => {
    if (!doc || typeof doc !== 'object') return doc
    const docObj = doc as Record<string, unknown>
    const container = docObj[target.container] as Record<string, unknown> | undefined
    if (!container || typeof container !== 'object') return docObj
    const { items, droppedCount } = cleanItemsArray(container.items)
    totalDropped += droppedCount
    return {
      ...docObj,
      [target.container]: { ...container, items },
    }
  })

  // Pas de pollution détectée → on retourne sans écrire (pas de bruit
  // BroadcastChannel) mais on signale `ok: true` pour permettre la pose du flag.
  if (totalDropped === 0) {
    return { ok: true, docsScanned: parsed.length, droppedCount: 0, wrote: false }
  }

  // Pollution détectée : on écrit la version nettoyée. Si l'écriture rate,
  // on remonte l'erreur typée pour bloquer la pose du flag (sinon la
  // migration ne se rejouera jamais et la pollution sera permanente).
  try {
    localStorage.setItem(storageKey, JSON.stringify(cleaned))
  } catch (err) {
    console.error(`[migration] échec d'écriture pour "${storageKey}"`, err)
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)
    return { ok: false, reason: isQuota ? 'quota' : 'unknown' }
  }

  // Écriture réussie : on notifie les autres onglets. Sans ce publish, un
  // onglet ouvert sur l'ancienne version garderait sa copie polluée en
  // mémoire React et la réécrirait au prochain auto-save → résurrection
  // silencieuse de la pollution. Le BroadcastChannel force les autres
  // onglets à relire le storage nettoyé.
  publish(target.broadcastEvent)

  return { ok: true, docsScanned: parsed.length, droppedCount: totalDropped, wrote: true }
}

/**
 * Migration unique : nettoie les line items pollués par des SyntheticEvent
 * React dans les factures + devis existants.
 *
 * Idempotente. À appeler une fois au démarrage de l'app, avant le mount React.
 */
export function runOneShotMigrations(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') return

    const invoices = migrateStorageKey('invoices')
    const quotes = migrateStorageKey('quotes')

    // Logging récap si au moins une écriture a eu lieu.
    if (invoices.ok && quotes.ok && (invoices.droppedCount + quotes.droppedCount > 0)) {
      console.info(
        `[migration] nettoyage line items terminé : ` +
        `${invoices.droppedCount + quotes.droppedCount} clés polluantes supprimées ` +
        `(factures: ${invoices.docsScanned} docs, devis: ${quotes.docsScanned} docs)`
      )
    }

    // Toast d'erreur si une écriture a raté. On cible explicitement le toast
    // sur l'ID 'storage-quota' déjà utilisé par storage.ts pour ne pas empiler
    // deux toasts identiques si l'autosave échoue dans la foulée.
    if (!invoices.ok || !quotes.ok) {
      const reason = (!invoices.ok ? invoices.reason : null) ?? (!quotes.ok ? quotes.reason : null)
      if (reason === 'quota') {
        toast.error('Stockage plein — supprimez d\'anciennes factures ou réduisez le logo', { id: 'storage-quota' })
      } else {
        toast.error('Erreur de migration des données — l\'app continue avec les données existantes', { id: 'storage-quota' })
      }
      // CRUCIAL : on ne pose PAS le flag → la migration se rejouera au
      // prochain boot, quand le storage aura été allégé.
      return
    }

    // Toutes les écritures ont réussi : on peut poser le flag.
    try {
      localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
    } catch (err) {
      // Si poser le flag rate (quota strict, mode privé extrême), la
      // migration se rejouera au prochain boot — idempotent donc inoffensif.
      console.warn('[migration] échec de pose du flag (migration se rejouera au prochain boot)', err)
    }
  } catch (err) {
    // Aucune migration ne doit empêcher l'app de démarrer. Si localStorage
    // est inaccessible (mode privé strict), on laisse passer silencieusement.
    console.error('[migration] erreur inattendue, migration skip', err)
  }
}
