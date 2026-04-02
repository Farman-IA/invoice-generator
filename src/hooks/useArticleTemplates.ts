import { useState, useEffect, useCallback, useRef } from 'react'
import type { ArticleTemplate } from '@/types/invoice'
import { storage } from '@/lib/storage'

export function useArticleTemplates() {
  const [templates, setTemplates] = useState<ArticleTemplate[]>([])
  const templatesRef = useRef(templates)
  useEffect(() => { templatesRef.current = templates }, [templates])

  useEffect(() => {
    storage.getArticleTemplates().then(setTemplates)
  }, [])

  const addTemplate = useCallback(async (template: Omit<ArticleTemplate, 'id'>) => {
    const newTemplate: ArticleTemplate = { ...template, id: crypto.randomUUID() }
    const updated = [newTemplate, ...templatesRef.current]
    setTemplates(updated)
    templatesRef.current = updated
    await storage.saveArticleTemplates(updated)
    return newTemplate
  }, [])

  const updateTemplate = useCallback(async (id: string, partial: Partial<ArticleTemplate>) => {
    const updated = templatesRef.current.map(t => t.id === id ? { ...t, ...partial } : t)
    setTemplates(updated)
    templatesRef.current = updated
    const ok = await storage.saveArticleTemplates(updated)
    if (!ok) console.error('Erreur de sauvegarde modèle')
  }, [])

  const deleteTemplate = useCallback(async (id: string) => {
    const updated = templatesRef.current.filter(t => t.id !== id)
    setTemplates(updated)
    templatesRef.current = updated
    const ok = await storage.saveArticleTemplates(updated)
    if (!ok) console.error('Erreur de suppression modèle')
  }, [])

  return { templates, addTemplate, updateTemplate, deleteTemplate }
}
