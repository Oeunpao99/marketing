// Fades out the launch screen (index.html #splash) once the app is ready —
// but not before its five steps have lit up (~2.3s), so the flow plays out.
const MIN_MS = 2300
let done = false

export function hideSplash() {
  if (done) return
  done = true
  const el = document.getElementById('splash')
  if (!el) return
  const wait = Math.max(0, MIN_MS - performance.now())
  setTimeout(() => {
    el.classList.add('cf-hide')
    setTimeout(() => el.remove(), 800) // exit animation (index.html) is ~0.75s
  }, wait)
}
