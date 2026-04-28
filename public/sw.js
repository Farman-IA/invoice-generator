const CACHE_NAME = 'invoice-gen-v1'

// Au premier chargement, mettre en cache les fichiers essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/']))
  )
  self.skipWaiting()
})

// Nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Strategie : reseau d'abord, cache en secours (pour que l'app marche hors-ligne)
self.addEventListener('fetch', (event) => {
  // Ignorer les requetes API (Gemini et OpenAI) — ne jamais cacher les reponses IA
  const url = event.request.url
  if (
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('api.openai.com')
  ) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Mettre en cache les reponses reussies
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
