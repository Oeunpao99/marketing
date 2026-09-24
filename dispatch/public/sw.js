// ContentFlow service worker — what makes the app installable ("Add to Home
// Screen" / "Install app") and open instantly from the home screen.
//
// Deliberately small and safe:
//   • /api/* and /media/* are never touched — live data always comes from the
//     server, so nothing here can show stale posts or numbers.
//   • Pages: network first, falling back to the last cached app shell when
//     offline (then the app shows its own "can't reach the API" states).
//   • /assets/* (Vite's hashed JS/CSS) and /brand/* icons: cache first — a
//     new build has new file names, so these can never go stale.
// Bump VERSION to drop old caches.
const VERSION = 'cf-v2'
const SHELL = ['/', '/manifest.webmanifest', '/brand/icon-192.png', '/brand/logo-mark.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

// ── Push notifications (app/push.py) ──────────────────────────────────────
// Shown on the lock screen / notification centre even when ContentFlow is
// closed. Payload: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { title: 'ContentFlow', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || 'ContentFlow', {
      body: msg.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/favicon-64.png',
      tag: msg.tag || undefined,
      renotify: !!msg.tag,
      data: { url: msg.url || '/' },
    }),
  )
})

// Tap → focus an open ContentFlow window (and go to the page), or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin))
      if (win) return win.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w))
      return self.clients.openWindow(url)
    }),
  )
})
