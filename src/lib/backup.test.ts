import { describe, it, expect, afterEach } from 'vitest'
import { buildBackupEnvelope, parseBackup, restoreBackup, BACKUP_VERSION } from './backup'

// Photo de stockage type : quelques clés remplies + une clé absente (null).
const SNAPSHOT: Record<string, string | null> = {
  quotes: '[{"id":"q1"}]',
  invoices: '[]',
  'issuer-profile': '{"companyName":"X"}',
  'quote-counter': '12',
  clients: null, // aucune valeur en stock pour cette clé
}

describe('buildBackupEnvelope', () => {
  it('emballe les données dans une enveloppe versionnée et signée', () => {
    const env = buildBackupEnvelope(SNAPSHOT)
    expect(env.app).toBe('invoice-generator')
    expect(env.version).toBe(BACKUP_VERSION)
    expect(typeof env.exportedAt).toBe('string')
    expect(env.data.quotes).toBe('[{"id":"q1"}]')
    expect(env.data['quote-counter']).toBe('12')
  })

  it('ignore les clés absentes (valeur null) pour ne pas polluer la sauvegarde', () => {
    const env = buildBackupEnvelope(SNAPSHOT)
    expect('clients' in env.data).toBe(false)
  })
})

describe('parseBackup', () => {
  it('relit une sauvegarde produite par buildBackupEnvelope (aller-retour fidèle)', () => {
    const json = JSON.stringify(buildBackupEnvelope(SNAPSHOT))
    const res = parseBackup(json)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.quotes).toBe('[{"id":"q1"}]')
      expect(res.data['quote-counter']).toBe('12')
    }
  })

  it('refuse un JSON invalide', () => {
    expect(parseBackup('pas du json {').ok).toBe(false)
  })

  it("refuse un fichier qui n'est pas une sauvegarde de cette app", () => {
    const res = parseBackup(JSON.stringify({ app: 'autre-app', version: 1, data: {} }))
    expect(res.ok).toBe(false)
  })

  it('refuse une version inconnue (sauvegarde plus récente que cette app)', () => {
    const res = parseBackup(JSON.stringify({ app: 'invoice-generator', version: 999, data: {} }))
    expect(res.ok).toBe(false)
  })

  it('refuse des données corrompues (valeurs non textuelles)', () => {
    const res = parseBackup(
      JSON.stringify({ app: 'invoice-generator', version: BACKUP_VERSION, data: { quotes: 123 } })
    )
    expect(res.ok).toBe(false)
  })

  it('renvoie exportedAt quand il est présent et valide (évite un 2ᵉ JSON.parse côté UI)', () => {
    const json = JSON.stringify(buildBackupEnvelope(SNAPSHOT))
    const res = parseBackup(json)
    expect(res.ok).toBe(true)
    if (res.ok) expect(typeof res.exportedAt).toBe('string')
  })

  it('refuse un exportedAt non textuel (consommé tel quel par l\'UI)', () => {
    const res = parseBackup(
      JSON.stringify({ app: 'invoice-generator', version: BACKUP_VERSION, exportedAt: 123, data: {} })
    )
    expect(res.ok).toBe(false)
  })
})

// --- restoreBackup : on simule localStorage (env node, pas de jsdom) ---
function installLocalStorage(initial: Record<string, string> = {}, failOnSet?: string) {
  const store = new Map<string, string>(Object.entries(initial))
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failOnSet && k === failOnSet) throw new Error('quota simulé')
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = mock
  return store
}

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage
})

describe('restoreBackup', () => {
  it('remplace VRAIMENT : efface les clés absentes du fichier (pas de fusion fantôme)', () => {
    const store = installLocalStorage({ quotes: 'OLD', clients: 'OLDCLIENTS' })
    const json = JSON.stringify({ app: 'invoice-generator', version: BACKUP_VERSION, data: { quotes: 'NEW' } })
    const res = restoreBackup(json)
    expect(res.ok).toBe(true)
    expect(store.get('quotes')).toBe('NEW')
    expect(store.has('clients')).toBe(false) // effacée car absente de la sauvegarde
  })

  it("annule tout si une écriture échoue (atomicité — jamais d'état à moitié restauré)", () => {
    const store = installLocalStorage({ quotes: 'OLD', clients: 'OLDCLIENTS' }, 'invoices')
    const json = JSON.stringify({
      app: 'invoice-generator',
      version: BACKUP_VERSION,
      data: { quotes: 'NEW', invoices: 'NEWINV' },
    })
    const res = restoreBackup(json)
    expect(res.ok).toBe(false)
    expect(store.get('quotes')).toBe('OLD')
    expect(store.get('clients')).toBe('OLDCLIENTS')
    expect(store.has('invoices')).toBe(false)
  })

  it("n'écrit rien si le fichier est invalide", () => {
    const store = installLocalStorage({ quotes: 'OLD' })
    const res = restoreBackup('pas du json')
    expect(res.ok).toBe(false)
    expect(store.get('quotes')).toBe('OLD')
  })

  it('ignore les clés hors périmètre (un fichier ne peut pas injecter ai-settings)', () => {
    const store = installLocalStorage({ 'ai-settings': 'SECRET' })
    const json = JSON.stringify({
      app: 'invoice-generator',
      version: BACKUP_VERSION,
      data: { 'ai-settings': 'INJECTED', quotes: 'NEW' },
    })
    restoreBackup(json)
    expect(store.get('ai-settings')).toBe('SECRET') // intacte (hors BACKUP_KEYS)
    expect(store.get('quotes')).toBe('NEW')
  })
})
