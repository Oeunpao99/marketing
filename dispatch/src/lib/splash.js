// Fades out the launch screen (index.html #splash) once the app is ready —
// but not before its five steps have lit up (the last turns green at ~3.2s)
// and the ✓ has been seen. Counted from when the screen itself appeared
// (index.html sets window.__splashAt), not from the page request: on a slow
// network the screen shows late, and it still gets its full play.
const MIN_MS = 3800
let done = false

export function hideSplash() {
  if (done) return
  done = true
  const el = document.getElementById('splash')
  if (!el) return
  const shown = typeof window.__splashAt === 'number' ? window.__splashAt : 0
  const wait = Math.max(0, MIN_MS - (performance.now() - shown))
  setTimeout(() => {
    el.classList.add('cf-hide')
    setTimeout(() => el.remove(), 800) // exit animation (index.html) is ~0.75s
  }, wait)
}
