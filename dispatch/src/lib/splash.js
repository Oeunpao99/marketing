// Fades out the launch splash (index.html #splash) once the app is ready —
// but never before it's been up ~3s, so the logo moment gets its full play.
const MIN_MS = 3000
let done = false

export function hideSplash() {
  if (done) return
  done = true
  const el = document.getElementById('splash')
  if (!el) return
  if (getComputedStyle(el).display === 'none') return el.remove() // desktop
  const wait = Math.max(0, MIN_MS - performance.now())
  setTimeout(() => {
    el.classList.add('cf-hide')
    setTimeout(() => el.remove(), 1000) // exit animation (index.html) is ~0.95s
  }, wait)
}
