import { useState, useEffect, useCallback } from 'react'
import { storage } from '@/lib/storage'

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    storage.getTheme().then(saved => {
      setThemeState(saved)
      document.documentElement.classList.toggle('dark', saved === 'dark')
    })
  }, [])

  const toggleTheme = useCallback(async () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setThemeState(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    await storage.saveTheme(next)
  }, [theme])

  return { theme, toggleTheme }
}
