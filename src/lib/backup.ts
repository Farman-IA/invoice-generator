// Sauvegarde / restauration de TOUTES les données de l'app (devis, factures,
// clients, profil, modèles, compteurs).
//
// Pourquoi : le stockage du navigateur peut être vidé (nettoyage, changement
// d'ordinateur, bug). Cet export crée une copie de secours sur le disque que
// l'utilisateur peut ré-importer pour tout retrouver — la ceinture de sécurité
// contre la perte de données (cf. incident DEV-2026-011).
//
// Choix de conception : on stocke les valeurs BRUTES (les chaînes telles que
// présentes dans le stockage). On ne re-sérialise pas le contenu → aucune
// transformation, donc aucun risque d'altérer un montant ou un arrondi en
// passant par l'export. L'aller-retour est fidèle au bit près.

export const BACKUP_VERSION = 1

// Signature qui identifie nos fichiers de sauvegarde (évite d'importer le
// fichier d'une autre app par erreur).
const BACKUP_APP = 'invoice-generator'

// Clés de stockage incluses dans une sauvegarde complète.
// On EXCLUT volontairement 'ai-settings' (contient la clé API — ne doit pas
// se retrouver dans un fichier partagé) et 'theme' (simple préférence locale).
export const BACKUP_KEYS = [
  'invoices',
  'invoice-counter',
  'issuer-profile',
  'issuer-logo',
  'clients',
  'articleTemplates',
  'quotes',
  'quote-counter',
] as const

export interface BackupEnvelope {
  app: string
  version: number
  exportedAt: string
  data: Record<string, string>
}

// Résultat de lecture d'une sauvegarde : soit les données validées (+ la date
// d'export pour l'aperçu UI), soit une erreur explicite affichable. Jamais
// d'exception → l'UI gère. `exportedAt` est exposé ici pour éviter un 2ᵉ
// JSON.parse côté composant.
export type ParseResult =
  | { ok: true; data: Record<string, string>; exportedAt: string }
  | { ok: false; error: string }

// Emballe une photo du stockage (clé → valeur) dans une enveloppe versionnée.
// Les clés sans valeur (null = rien en stock) sont ignorées.
export function buildBackupEnvelope(snapshot: Record<string, string | null>): BackupEnvelope {
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'string') data[key] = value
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
}

// Lit et VALIDE un fichier de sauvegarde avant toute écriture. Rejette :
//  - un JSON illisible
//  - un fichier d'une autre app
//  - une version non supportée
//  - des données corrompues (valeurs non textuelles)
// Garantit qu'on n'écrira jamais de garbage dans le stockage de l'utilisateur.
export function parseBackup(json: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Fichier illisible (JSON invalide)' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Format de fichier inattendu' }
  }
  const env = parsed as Record<string, unknown>
  if (env.app !== BACKUP_APP) {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde d'Invoice Generator" }
  }
  if (env.version !== BACKUP_VERSION) {
    return { ok: false, error: `Version de sauvegarde non supportée (${String(env.version)})` }
  }
  const rawData = env.data
  if (!rawData || typeof rawData !== 'object') {
    return { ok: false, error: 'Données de sauvegarde absentes' }
  }
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawData as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return { ok: false, error: `Donnée corrompue pour "${key}"` }
    }
    data[key] = value
  }
  // `exportedAt` est optionnel mais, s'il est présent, doit être une chaîne :
  // l'UI le passe à `new Date(...)`, un type inattendu afficherait "Invalid Date".
  let exportedAt = ''
  if (env.exportedAt !== undefined) {
    if (typeof env.exportedAt !== 'string') {
      return { ok: false, error: 'Date de sauvegarde invalide' }
    }
    exportedAt = env.exportedAt
  }
  return { ok: true, data, exportedAt }
}

// --- Glue navigateur (lecture/écriture du stockage + téléchargement) ---
// On lit/écrit localStorage en direct (comme migrations.ts), car le polyfill
// window.storage tape de toute façon dans localStorage en navigateur standard.

// Lit l'état courant et déclenche le téléchargement d'un fichier .json daté.
export function exportBackup(): void {
  const snapshot: Record<string, string | null> = {}
  for (const key of BACKUP_KEYS) snapshot[key] = localStorage.getItem(key)
  const json = JSON.stringify(buildBackupEnvelope(snapshot), null, 2)

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]
  a.href = url
  a.download = `invoice-generator-sauvegarde-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Restaure depuis le texte d'un fichier. Garanties :
//  - N'écrit RIEN si le fichier est invalide (parseBackup a tout validé).
//  - VRAI remplacement : on efface d'abord toutes les clés gérées, puis on
//    réécrit celles présentes dans la sauvegarde. Sans l'effacement, une clé
//    absente du fichier laisserait l'ancienne valeur en place → fusion fantôme
//    (vieux clients/devis ressuscités) alors que l'UI promet « remplacer ».
//  - ATOMIQUE : on photographie l'état avant écriture ; si une écriture échoue
//    (ex: quota plein sur un gros logo), on remet TOUT comme avant → jamais
//    d'état à moitié restauré (le scénario de corruption que la feature évite).
//  - PÉRIMÈTRE VERROUILLÉ : on ne touche QUE les BACKUP_KEYS, donc un fichier
//    malveillant ne peut pas injecter une clé arbitraire (ex: 'ai-settings').
// L'appelant doit recharger la page après succès pour que les hooks relisent
// le stockage restauré.
export function restoreBackup(json: string): ParseResult {
  const res = parseBackup(json)
  if (!res.ok) return res

  // Photo de l'état actuel (pour rollback en cas d'échec).
  const previous: Record<string, string | null> = {}
  for (const key of BACKUP_KEYS) previous[key] = localStorage.getItem(key)

  try {
    for (const key of BACKUP_KEYS) localStorage.removeItem(key)
    for (const key of BACKUP_KEYS) {
      if (Object.prototype.hasOwnProperty.call(res.data, key)) {
        localStorage.setItem(key, res.data[key])
      }
    }
    return res
  } catch (err) {
    // Échec en cours d'écriture → on restaure l'état d'origine à l'identique.
    for (const key of BACKUP_KEYS) {
      const prev = previous[key]
      if (prev === null) localStorage.removeItem(key)
      else localStorage.setItem(key, prev)
    }
    console.error('[backup] restauration échouée, état d\'origine restauré', err)
    return { ok: false, error: 'Restauration échouée (stockage plein ?) — vos données sont inchangées' }
  }
}
