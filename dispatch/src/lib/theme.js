// Appearance: light / dark theme, the brand accent colour and reduced motion.
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
const DARK_SURFACE = [24, 28, 35] // --surface in html.dark (index.css)

// ── light / dark ──────────────────────────────────────────────────────────
// 'light' | 'dark' | 'system' (follow the device). Dark = the `dark` class on
// <html>; every colour that changes reads a variable set for it (index.css).
export const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]
let themePref = 'light'
let lastAccent = DEFAULT_ACCENT
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches

export const isDark = () => document.documentElement.classList.contains('dark')

export function applyTheme(pref = 'light') {
  themePref = THEMES.some((t) => t.id === pref) ? pref : 'light'
  const dark = themePref === 'dark' || (themePref === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  applyAccent(lastAccent) // its soft tints depend on the theme
}

// "System" follows the device live (e.g. it switches to dark at sunset).
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (themePref === 'system') applyTheme('system')
})

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
  lastAccent = hex || DEFAULT_ACCENT
  const c = readable(parse(hex) || parse(DEFAULT_ACCENT))
  const root = document.documentElement.style
  const set = (name, rgb) => root.setProperty(name, rgb.join(' '))
  // The soft tints (selected chips, hover fills, badges) are the accent washed
  // into the background — white in light mode, the dark surface in dark mode.
  const base = isDark() ? DARK_SURFACE : WHITE
  set('--brand', c)
  set('--brand-light', mix(c, WHITE, 0.14))
  set('--brand-dark', mix(c, BLACK, 0.26))
  set('--brand-deep', mix(c, BLACK, 0.62))
  set('--brand-soft', mix(c, base, isDark() ? 0.8 : 0.88))
  set('--brand-softer', mix(c, base, isDark() ? 0.9 : 0.95))
  set('--brand-line', mix(c, base, isDark() ? 0.62 : 0.8))
  // Accent-coloured text: in dark mode a lighter shade, readable on the dark
  // surfaces (index.css points text-brand at it); the accent itself stays for fills.
  set('--brand-text', isDark() ? mix(c, WHITE, 0.4) : c)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizeAccent(hex))
}

export function applyMotion(reduce) {
  document.documentElement.toggleAttribute('data-reduce-motion', !!reduce)
}

/** Apply a user's saved appearance and remember it for the next page load. */
export function applyPreferences(prefs = {}) {
  const accent = prefs.accent || DEFAULT_ACCENT
  const theme = prefs.theme || 'light'
  lastAccent = accent
  applyTheme(theme)
  applyMotion(prefs.reduce_motion)
  try {
    localStorage.setItem(CACHE, JSON.stringify({ accent, theme, reduce_motion: !!prefs.reduce_motion }))
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
  lastAccent = cached.accent || DEFAULT_ACCENT
  applyTheme(cached.theme || 'light')
  applyMotion(cached.reduce_motion)
}
