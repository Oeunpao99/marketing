// Fades out the launch screen (index.html #splash) once the app is ready —
// but not before its 3 seconds: the robot, "Smart Marketing" and a bar that's full
// at 2.8 s (the owner asked for 3 s, 2026-10-29). Counted from when the screen itself appeared
// (index.html sets window.__splashAt), not from the page request: on a slow
// network the screen shows late, and it still gets its full play.
const MIN_MS = 3000
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
