/* Lesson Guru Odisha — minimal service worker.
 * Required for full PWA installability on Android Chrome + desktop.
 * Strategy:
 *   - Navigations & JS: network-first (never serve stale JS — stale JS breaks auth/features)
 *   - Images/fonts/css: cache-first with background refresh
 *   - /_next/static/chunks/* : NETWORK-ONLY (never cache — hashes change per deploy)
 * Bump CACHE_NAME below to invalidate ALL old caches on installed PWAs.
 */
const CACHE_NAME = 'lesson-guru-v9-chunk-safeguard'
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
]

// Listen for SKIP_WAITING messages sent by the page so the new SW takes over
// immediately after a deploy (see /app/app/layout.js).
self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge every cache that isn't the current one — force-refreshes stale JS
    const names = await caches.keys()
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Never cache API calls or auth endpoints
  if (url.pathname.startsWith('/api/')) return

  // NETWORK-ONLY for Next.js hashed static chunks + CSS chunks.
  // These filenames embed a hash — stale-cached copies cause
  // "Loading chunk X failed" errors after every deploy.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(r => r || new Response('', { status: 504 })))
    )
    return
  }

  // For HTML navigations: network-first, fallback to cached '/'
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        const cache = await caches.open(CACHE_NAME)
        cache.put('/', fresh.clone()).catch(() => {})
        return fresh
      } catch (e) {
        const cached = await caches.match('/')
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })())
    return
  }

  // JS: NETWORK-FIRST (never serve stale JS — this was the login-cache bug root cause)
  if (url.origin === self.location.origin && /\.js(\?.*)?$/i.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, fresh.clone()).catch(() => {})
        }
        return fresh
      } catch {
        const cached = await caches.match(request)
        return cached || new Response('', { status: 504 })
      }
    })())
    return
  }

  // Images / fonts / css: cache-first with background refresh (safe to cache)
  if (url.origin === self.location.origin && /\.(?:png|svg|jpg|jpeg|webp|css|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const fresh = await fetch(request)
        const cache = await caches.open(CACHE_NAME)
        if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {})
        return fresh
      } catch {
        return new Response('', { status: 504 })
      }
    })())
  }
})
