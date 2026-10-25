// The app's display size (Settings → Appearance). On a Windows screen whose scaling is
// turned up (125 %, 150 % — most laptops) everything draws that much bigger, so the
// signed-in app draws itself smaller there, like the browser at 80 %: CSS `zoom` on
// <html>, set by the Shell (the website and sign-in pages stay as they are), only on
// screens 1024 px and wider (phones and tablets keep their size).
//
// Under that zoom the browser still measures in screen pixels — getBoundingClientRect,
// mouse positions, window.innerWidth — while the page's own lengths are zoomed. Code
// that turns one into the other goes through the helpers below, and heights in vh
// divide by --z (tailwind.config.js `screen`, and the `/var(--z,1)` in arbitrary sizes).

const KEY = 'cf_display_size'
export const DISPLAY_SIZES = [
  { id: 'auto', label: 'Auto' },
  { id: '0.8', label: '80%' },
  { id: '0.9', label: '90%' },
  { id: '1', label: '100%' },
]

export function displaySize() {
  try {
    return localStorage.getItem(KEY) || 'auto'
  } catch {
    return 'auto'
  }
}

/** Auto: smaller on Windows when its scaling (or the browser's own zoom) makes things bigger. */
export function autoZoom() {
  const dpr = window.devicePixelRatio || 1
  if (!/Windows/i.test(navigator.userAgent) || dpr < 1.2) return 1
  return dpr >= 1.45 ? 0.75 : 0.8
}

const zoomFor = (size) => (size === 'auto' ? autoZoom() : Math.min(1, Math.max(0.7, Number(size) || 1)))

let active = false // the Shell is showing (the signed-in app)

/** Apply the display size — `on` while the signed-in app shows. */
export function applyZoom(on = active) {
  active = on
  const el = document.documentElement
  const z = on && window.innerWidth >= 1024 ? zoomFor(displaySize()) : 1
  el.style.zoom = z === 1 ? '' : String(z)
  el.style.setProperty('--z', String(z))
}

export function setDisplaySize(size) {
  try {
    localStorage.setItem(KEY, size)
  } catch {
    /* not remembered on this browser — still applied now */
  }
  applyZoom()
}

/** The zoom in force (1 = none). */
export const pageZoom = () => {
  const z = parseFloat(document.documentElement.style.zoom)
  return z > 0 ? z : 1
}

/** A length measured on the screen (mouse moves, rect sizes) → the page's own pixels. */
export const unzoom = (px) => px / pageZoom()

/** getBoundingClientRect in the page's own pixels. */
export function rectOf(el) {
  const r = el.getBoundingClientRect()
  const z = pageZoom()
  if (z === 1) return r
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z, x: r.x / z, y: r.y / z }
}

/** The window's size in the page's own pixels. */
export const viewW = () => window.innerWidth / pageZoom()
export const viewH = () => window.innerHeight / pageZoom()
