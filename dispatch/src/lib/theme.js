// Appearance: the brand accent colour and reduced motion.
//
// Every `brand*` Tailwind colour reads a CSS variable (tailwind.config.js),
// so recolouring the whole app is just rewriting these variables on <html>.
// From one picked colour we derive the lighter / darker / soft tints the UI
// uses. The choice is saved on the user (Settings → Appearance) and cached in
// localStorage so it applies instantly on the next load, before /auth/me.

export const DEFAULT_ACCENT = '#1A6FC4'

export const ACCENTS = [
  { name: 'Ocean', hex: '#1A6FC4' },
  { name: 'Forest', hex: '#15803D' },
  { name: 'Royal', hex: '#6D28D9' },
  { name: 'Sunset', hex: '#EA580C' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Teal', hex: '#0F766E' },
]

const CACHE = 'contentflow.appearance'
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

function parse(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// White text sits on the accent (buttons, badges) — darken anything too pale
// to keep that readable (≥ ~3:1, fine for the bold text on buttons). All the
// presets already pass; this only kicks in for very light custom picks.
function readable(rgb) {
  let c = rgb
  for (let i = 0; i < 20 && luminance(c) > 0.26; i++) c = mix(c, BLACK, 0.08)
  return c
}

export function normalizeAccent(hex) {
  const c = parse(hex)
  if (!c) return DEFAULT_ACCENT
  return '#' + readable(c).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function applyAccent(hex) {
  const c = readable(parse(hex) || parse(DEFAULT_ACCENT))
  const root = document.documentElement.style
  const set = (name, rgb) => root.setProperty(name, rgb.join(' '))
  set('--brand', c)
  set('--brand-light', mix(c, WHITE, 0.14))
  set('--brand-dark', mix(c, BLACK, 0.26))
  set('--brand-deep', mix(c, BLACK, 0.62))
  set('--brand-soft', mix(c, WHITE, 0.88))
  set('--brand-softer', mix(c, WHITE, 0.95))
  set('--brand-line', mix(c, WHITE, 0.8))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizeAccent(hex))
}

export function applyMotion(reduce) {
  document.documentElement.toggleAttribute('data-reduce-motion', !!reduce)
}

/** Apply a user's saved appearance and remember it for the next page load. */
export function applyPreferences(prefs = {}) {
  const accent = prefs.accent || DEFAULT_ACCENT
  applyAccent(accent)
  applyMotion(prefs.reduce_motion)
  try {
    localStorage.setItem(CACHE, JSON.stringify({ accent, reduce_motion: !!prefs.reduce_motion }))
  } catch {
    /* private mode — fine, it just won't be instant next time */
  }
}

/** Called once at startup, before React renders, so there's no colour flash. */
export function initTheme() {
  let cached = {}
  try {
    cached = JSON.parse(localStorage.getItem(CACHE) || '{}')
  } catch {
    cached = {}
  }
  applyAccent(cached.accent || DEFAULT_ACCENT)
  applyMotion(cached.reduce_motion)
}
