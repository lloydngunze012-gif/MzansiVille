// Soft Life's service worker (owner, 7 Nov): just enough for phones to offer Install,
// plus a friendly page when there's no signal. Registered by src/install.js in the built
// game only.
// - Page loads (navigations on this site) always go to the network first, so a new deploy
//   arrives on the next open; only when the network fails does the cached offline page show.
//   The page itself is never cached, so it can never be an old build.
// - Everything else (game files in /assets/, models, audio, Supabase calls, anything on
//   another site) is not touched: no respondWith, straight to the network as before. That
//   keeps src/stale.js's "Updating..." reload working exactly as it did.
const CACHE = 'softlife-shell-v1'
const SHELL = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.mode !== 'navigate' || new URL(req.url).origin !== self.location.origin) return
  event.respondWith(fetch(req).catch(() => caches.match('/offline.html').then((page) => page || Response.error())))
})
