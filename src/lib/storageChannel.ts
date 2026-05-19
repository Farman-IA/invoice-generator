// Canal de synchronisation inter-onglet (cf. Finding #6 de l'audit 2026-05-19).
//
// Pourquoi : sans coordination, si Farman ouvre l'app dans 2 onglets, le
// dernier qui sauvegarde écrase tout le tableau de l'autre — perte de données
// silencieuse. Ici on utilise l'API native BroadcastChannel pour qu'un onglet
// signale aux autres "j'ai écrit, relisez localStorage".
//
// Choix de design (validé par Farman) : on émet UNIQUEMENT des signaux légers,
// pas le payload complet. Le récepteur relit localStorage lui-même. Ça évite
// de cloner des centaines de factures à chaque frappe d'auto-save.
//
// Garde-fou anti-boucle : chaque onglet a un senderId unique (généré une fois
// au chargement du module). Un onglet ignore ses propres messages — sinon il
// rentrerait dans une boucle "j'écris → je reçois mon signal → je relis →
// je re-set mon state → l'auto-save re-écrit → ...".

export type StorageEventType =
  | 'invoices:updated'
  | 'quotes:updated'
  | 'invoice-counter:updated'
  | 'quote-counter:updated'

interface StorageMessage {
  type: StorageEventType
  senderId: string
  timestamp: number
}

// Identifiant unique de cet onglet. Persiste tant que le module est chargé
// (donc tant que l'onglet est ouvert). crypto.randomUUID est dispo partout
// où BroadcastChannel l'est (Safari 15.4+, Chrome, Firefox).
const senderId = crypto.randomUUID()

// Fallback gracieux : sur les navigateurs sans BroadcastChannel (Safari < 15.4,
// environnements de test sans jsdom complet), on désactive le canal sans crasher.
// L'app continue à marcher, juste sans la sync multi-onglet.
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('invoice-storage') : null

/**
 * Publie un signal de mise à jour. Appelé par storage.ts après chaque write
 * réussi sur localStorage. Best-effort : un échec de postMessage (rare, mais
 * possible si l'onglet se ferme pendant l'envoi) ne bloque pas l'écriture.
 */
export function publish(type: StorageEventType): void {
  if (!channel) return
  try {
    const msg: StorageMessage = { type, senderId, timestamp: Date.now() }
    channel.postMessage(msg)
  } catch (err) {
    console.warn('[storageChannel] postMessage a échoué:', err)
  }
}

/**
 * S'abonne à un type de signal. Le handler est appelé sans argument : c'est à
 * lui d'aller relire localStorage. Retourne une fonction de désabonnement à
 * appeler dans le cleanup du useEffect.
 *
 * Les messages émis par CE même onglet sont filtrés (garde anti-boucle).
 */
export function subscribe(type: StorageEventType, handler: () => void): () => void {
  if (!channel) return () => {}
  const listener = (event: MessageEvent<StorageMessage>) => {
    const msg = event.data
    if (!msg || msg.type !== type) return
    if (msg.senderId === senderId) return // ignore mes propres messages
    handler()
  }
  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}
