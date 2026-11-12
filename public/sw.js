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

// Notifications (owner, 11 Nov): a push from the game's server (api/push.js) carries { title, body, tag, url }.
// One notification per thread (the tag): a newer one replaces it. A tap opens the game straight into the thread:
// an open game is focused and told which thread; otherwise the game opens at /?thread=<id>.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = data.title || 'Soft Life'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '', tag: data.tag || 'soft-life', renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: data.url || '/', thread: (data.url || '').match(/[?&]thread=([^&#]+)/)?.[1] ? decodeURIComponent(data.url.match(/[?&]thread=([^&#]+)/)[1]) : '' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/', thread = '' } = event.notification.data || {}
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find((c) => new URL(c.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      if (thread) open.postMessage({ type: 'open-thread', thread })
      return
    }
    await self.clients.openWindow(url)
  })())
})
