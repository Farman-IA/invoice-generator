import React, { type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 dark:bg-red-900/20 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="size-6 text-red-600 dark:text-red-400 flex-shrink-0" />
              <h1 className="text-lg font-bold text-red-900 dark:text-red-100">Erreur application</h1>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4 whitespace-pre-wrap font-mono">
              {this.state.error?.message || 'Une erreur inattendue s\'est produite'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={this.resetError}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Accueil
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Les données locales n'ont pas été perdues. Réessayez ou videz le cache si le problème persiste.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
