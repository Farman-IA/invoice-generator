import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { exportBackup, parseBackup, restoreBackup } from '@/lib/backup'

interface BackupSectionProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BackupSection({ open, onOpenChange }: BackupSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Fichier sélectionné en ATTENTE de confirmation : on garde son texte brut +
  // un résumé. Objectif : l'utilisateur valide AVANT qu'on écrase ses données.
  const [pending, setPending] = useState<{ json: string; exportedAt: string; keys: number } | null>(null)

  const handleExport = () => {
    exportBackup()
    toast.success('Sauvegarde téléchargée')
  }

  // À la sélection d'un fichier : on lit + valide SANS écrire. Si valide, on
  // passe en mode "attente de confirmation" (aperçu de la date + nb de catégories).
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // autorise la re-sélection du même fichier ensuite
    if (!file) return
    const reader = new FileReader()
    // Sans ce handler, un fichier illisible (corrompu, droits) échouait en
    // silence : aucun retour à l'utilisateur.
    reader.onerror = () => {
      toast.error('Lecture du fichier impossible')
      setPending(null)
    }
    reader.onload = () => {
      const json = String(reader.result ?? '')
      const res = parseBackup(json)
      if (!res.ok) {
        toast.error(res.error)
        setPending(null)
        return
      }
      // exportedAt vient de parseBackup (déjà validé) → plus de 2ᵉ JSON.parse.
      setPending({ json, exportedAt: res.exportedAt, keys: Object.keys(res.data).length })
    }
    reader.readAsText(file)
  }

  const handleConfirmRestore = () => {
    if (!pending) return
    const res = restoreBackup(pending.json)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Données restaurées — rechargement…')
    setPending(null)
    // Rechargement : indispensable pour que les hooks relisent le stockage restauré.
    setTimeout(() => window.location.reload(), 600)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPending(null) // on oublie le fichier en attente à la fermeture
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sauvegarde &amp; restauration</DialogTitle>
          <DialogDescription>
            Exportez une copie de secours de toutes vos données, ou restaurez-les depuis un fichier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Export */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div>
              <p className="text-sm font-medium">Exporter mes données</p>
              <p className="text-xs text-gray-500">
                Télécharge un fichier .json (devis, factures, clients, profil, modèles).
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ Ce fichier contient vos coordonnées bancaires (IBAN/BIC) et vos clients en clair —
                ne le partagez pas.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4 mr-1" />
              Exporter
            </Button>
          </div>

          {/* Import / restauration */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Restaurer depuis un fichier</p>
                <p className="text-xs text-gray-500">Remplace vos données actuelles par celles du fichier.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4 mr-1" />
                Choisir un fichier
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFilePicked}
                aria-label="Choisir un fichier de sauvegarde"
                className="hidden"
              />
            </div>

            {pending && (
              <div
                role="alert"
                className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs space-y-2"
              >
                <p className="text-amber-800 dark:text-amber-300">
                  Sauvegarde valide
                  {pending.exportedAt ? ` du ${new Date(pending.exportedAt).toLocaleString('fr-FR')}` : ''} —{' '}
                  {pending.keys} catégorie(s) de données.
                  <br />
                  <strong>⚠️ Attention :</strong> la restauration <strong>remplacera</strong> vos données
                  actuelles (action irréversible).
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPending(null)}>
                    Annuler
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleConfirmRestore}>
                    Confirmer la restauration
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
