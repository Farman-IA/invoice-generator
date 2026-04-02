import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Polyfill window.storage si absent (navigateur standard)
if (!window.storage) {
  window.storage = {
    async get(key: string) {
      const value = localStorage.getItem(key)
      return value !== null ? { value } : null
    },
    async set(key: string, value: string) {
      localStorage.setItem(key, value)
    },
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
