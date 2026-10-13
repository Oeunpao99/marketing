import { cancelRender, continueRender, delayRender, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import * as Lucide from 'lucide-react'

// Pieces every style shares: timing, the Khmer font, word-by-word text,
// icons and colour helpers (MotionPost.jsx = the Tech style, explainer.jsx =
// the light Explainer style).

export const FPS = 30
export const TRANSITION = 14 // frames two scenes overlap while they change
export const FONT = 'Kantumruy'
export const INK = '#0b1020'

/** Each scene's length when it has no voice-over (the backend mirrors this —
 * app/motion.py default_seconds). */
export function defaultSeconds(s) {
  switch (s.type) {
    case 'chat':
      return 1.6 + 1.5 * Math.min(4, (s.messages || []).length)
    case 'list':
      return 1.8 + 1.0 * Math.min(4, (s.items || []).length)
    case 'cta':
      return 3.8
    case 'product':
      return 3.6
    case 'chart':
      return 5.2
    case 'compare':
      return 4.2
    case 'character':
      return 3.8
    case 'split':
      return 2.6 + 0.9 * Math.min(6, (s.left?.points || []).length + (s.right?.points || []).length)
    case 'myth':
      return 5.0
    case 'options':
      return 2.4 + 0.35 * Math.min(4, (s.options || []).length) + 6.0 // pop-in + 5 s countdown + the reveal
    case 'quote':
      return 5.6
    default:
      return 3.4
  }
}

export const sceneFrames = (s) => Math.round((s.seconds || defaultSeconds(s)) * FPS)

// The Khmer + Latin font — the render waits until it's loaded.
const fontWait = delayRender('Loading the Khmer font')
new FontFace(FONT, `url(${staticFile('fonts/KantumruyPro.ttf')})`, { weight: '100 700' })
  .load()
  .then((f) => {
    document.fonts.add(f)
    continueRender(fontWait)
  })
  .catch((err) => cancelRender(err))

export const ZWSP = '​'
export const EM_OPEN = '⟦'
export const EM_CLOSE = '⟧'
export const clean = (t) => String(t || '').replaceAll(ZWSP, '').replaceAll(EM_OPEN, '').replaceAll(EM_CLOSE, '')

/** A script's picture / sound: a full URL, or a file under public/. */
export const srcOf = (src) => (!src ? null : /^(https?:|data:)/.test(src) ? src : staticFile(src))

/** A Lucide icon by name ("MessageCircle"), with a safe fallback. */
export function Icon({ name, size = 64, color = 'white', stroke = 2 }) {
  const C = Lucide[name] || Lucide.Sparkles
  return <C size={size} color={color} strokeWidth={stroke} />
}

/** "#0e7c66" → "rgba(14,124,102,a)". */
export function tint(hex, a) {
  const h = String(hex || '#0e7c66').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Text that appears word by word, each word rising in. Lines wrap only
 * between words; ⟦highlighted⟧ words get a brand-colour marker swept under
 * them. */
export function Words({ text, delay = 0, stagger = 1, style, align = 'left', color }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pieces = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      // markers can sit inside a piece — split there, so the highlight is exact
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === EM_OPEN) em = true
        else if (bit === EM_CLOSE) em = false
        else pieces.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && pieces.length) pieces[pieces.length - 1].gap = true
    })
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        fontFamily: FONT,
        lineHeight: 1.45,
        ...style,
      }}
    >
      {pieces.map(({ p, gap, em: hi }, n) => {
        const s = spring({ frame: frame - delay - n * stagger, fps, config: { damping: 40, mass: 0.4 } })
        const sweep = spring({ frame: frame - delay - n * stagger - 3, fps, config: { damping: 40 } })
        return (
          <span
            key={n}
            style={{
              position: 'relative',
              display: 'inline-block',
              marginRight: gap ? '0.28em' : 0,
              opacity: s,
              transform: `translateY(${(1 - s) * 46}px)`,
              color: hi ? 'var(--hl-text, white)' : color,
              zIndex: 0,
            }}
          >
            {hi && (
              <span
                style={{
                  position: 'absolute',
                  left: '-0.12em',
                  right: '-0.12em', // the gap after a word is margin, outside this box
                  top: '0.12em',
                  bottom: '0.08em',
                  borderRadius: '0.18em',
                  background: 'var(--hl-bg, var(--brand))',
                  transform: `scaleX(${sweep})`,
                  transformOrigin: 'left center',
                  zIndex: -1,
                }}
              />
            )}
            {p}
          </span>
        )
      })}
    </div>
  )
}

