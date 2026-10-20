import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import * as Lucide from 'lucide-react'

// Pieces every style shares: timing, the Khmer font, word-by-word text,
// icons and colour helpers (MotionPost.jsx = the Tech style, explainer.jsx =
// the light Explainer style).

export const FPS = 30
export const TRANSITION = 14 // frames two scenes overlap while they change
export const FONT = "'CFLatin', 'Kantumruy', sans-serif" // English first, Khmer falls through
export const INK = '#0b1020'

/** Each scene's length when it has no voice-over (the backend mirrors this —
 * app/motion.py default_seconds). */
export function defaultSeconds(s) {
  switch (s.type) {
    case 'chat':
      return 1.6 + 1.5 * Math.min(4, (s.messages || []).length)
    case 'apps':
      return 2.6 + 0.35 * Math.min(8, (s.apps || []).length)
    case 'table':
      return 3.6 + 0.3 * Math.min(6, (s.rows || []).length)
    case 'board':
      return 4.6
    case 'launch':
      return 4.2
    case 'take':
      return s.before ? 5.2 : 4.2
    case 'meme': // app/motion.py default_seconds says the same
      return 4.6
    case 'client':
      return 5.0
    case 'metrics':
      return 3.6 + 0.8 * Math.min(3, (s.rows || []).length)
    case 'timeline':
      return 2.8 + 0.8 * Math.min(4, (s.steps || []).length)
    case 'qa':
      return 3.0 + Math.min(5, String(s.a || '').length / 30)
    case 'bars':
      return 3.4 + 0.4 * Math.min(6, (s.data || []).length)
    case 'donut':
      return 4.6
    case 'rank':
      return 4.2
    case 'choice':
      return 5.0
    case 'reviews':
      return 3.4 + 0.6 * Math.min(4, (s.cards || []).length)
    case 'logos':
      return 4.0
    case 'climb': // app/motion.py default_seconds says the same
      return s.text ? 4.6 : 4.0
    case 'mirror':
      return 4.8
    case 'grow':
      return 4.8
    case 'summit':
      return 5.2
    case 'whiteboard':
      return 2.4 + 1.1 * Math.min(4, (s.parts || []).length)
    case 'example':
      return 2.6 + 1.3 * Math.min(3, (s.people || []).length)
    case 'remember':
      return 4.4
    case 'talk':
      return 2.8 + Math.min(2.4, String(s.text || '').length / 30) + (s.item ? 0.6 : 0)
    case 'note':
      return 2.6 + 0.6 * Math.min(5, (s.checks || []).length)
    case 'collage': // app/motion.py default_seconds says the same
      return 2.8 + 0.4 * Math.min(5, Math.max((s.tiles || []).length, (s.images || []).length))
    case 'statement':
      return 4.4
    case 'pedestal':
      return 4.6
    case 'speak': // app/motion.py default_seconds says the same
    case 'onair':
      return 4.2
    case 'visit':
      return 4.4
    case 'react': // app/motion.py default_seconds says the same
      return 4.2
    case 'punch':
      return 3.2
    case 'doodle': // app/motion.py default_seconds says the same
      return s.text ? 4.8 : 4.2
    case 'tip':
      return 4.6
    case 'save':
      return 3.4
    case 'platform':
      return 4.4
    case 'orbit':
      return 2.6 + 0.5 * Math.min(6, (s.tags || []).length)
    case 'chaos':
      return 2.6 + 0.4 * Math.min(6, (s.cards || []).length)
    case 'phones':
      return 1.4 + 1.2 * Math.min(4, (s.words || []).length)
    case 'pair':
      return 3.8
    case 'stack':
      return 1.6 + 1.1 * Math.min(4, (s.images || s.shots || []).length)
    case 'button':
      return 4.6
    case 'form':
      return 2.6 + 0.9 * Math.min(3, (s.fields || []).length) + (s.toggle ? 1.4 : 0)
    // Unveil (unveil.jsx) — app/motion.py default_seconds says the same
    case 'word':
      return 3.0 + 0.6 * Math.min(3, (s.rows || []).length)
    // AI design (canvas.jsx): as long as the AI planned it (app/motion.py says the same)
    case 'canvas': // + the breath before a reveal (canvas.jsx scene.pause)
      return Math.min(9, Math.max(2.5, Number(s.seconds) || 5)) + Math.min(1.5, Math.max(0, Number(s.pause) || 0))
    // Tech explainer (techflow.jsx) — app/motion.py default_seconds says the same
    case 'hops':
      return 3.0 + 0.8 * Math.min(5, (s.nodes || []).length)
    case 'send':
      return 4.2
    case 'address':
      return 4.4
    case 'lookup':
      return 5.2
    case 'assemble':
      return 4.6
    case 'tasks':
      return 2.2 + 0.7 * Math.min(4, (s.items || []).length) + (s.sticker ? 1.0 : 0)
    case 'fanout':
      return 3.0 + 0.8 * Math.min(3, (s.outputs || []).length) + 0.5 * Math.min(2, (s.checks || []).length)
    case 'field':
      return 3.6 + 0.07 * (s.value || '').length
    case 'done':
      return 3.4
    case 'roll':
      return 2.4 + 0.6 * Math.min(5, (s.words || []).length)
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
    case 'beforeafter':
      return 5.4
    case 'result':
      return 4.2
    case 'review':
      return 6.0
    case 'customer':
      return 4.4
    case 'news':
      return 5.0
    case 'notify':
      return 2.2 + 1.2 * Math.min(4, (s.notes || []).length)
    case 'step':
      return 4.8
    case 'offer':
      return 5.6
    case 'screen':
      return 5.0
    case 'dashboard':
      return 5.2
    case 'chapter':
      return 3.2
    case 'checklist':
      return 1.8 + 1.0 * Math.min(6, (s.checks || []).length)
    case 'recap':
      return 2.0 + 1.0 * Math.min(5, (s.points || []).length)
    case 'flow':
      return 2.4 + 1.0 * Math.min(4, (s.nodes || []).length)
    default:
      return 3.4
  }
}

export const sceneFrames = (s) => Math.round((s.seconds || defaultSeconds(s)) * FPS)

// Scenes that show the brand's logo big — the corner chip steps aside for them
// (one logo on screen, never two).
const LOGO_SCENES = new Set(['cta', 'launch', 'platform', 'apps'])
export const showsLogo = (s) => LOGO_SCENES.has(s.type) || (s.type === 'canvas' && (s.layers || []).some((L) => L.kind === 'logo'))

/** Where the corner logo chip sits: on a tall video below the phone's status bar and
 * TikTok / Reels' own top bar (LIVE · Following | For You), which cover the top
 * ~150 px of 1920; a wide video keeps it in the corner. */
export const chipTop = (width, height) => (height > width ? 150 : 64)
export const chipLogo = (width, height) => (height > width ? 62 : 84)

/** The corner logo chip's opacity at ``frame``: it fades out over a scene that shows the logo itself. */
export function chipOpacity(scenes, frame) {
  let start = 0
  let hide = 0
  scenes.forEach((s, i) => {
    const len = sceneFrames(s) - (i < scenes.length - 1 ? TRANSITION : 0)
    if (showsLogo(s)) {
      hide = Math.max(hide, interpolate(frame, [start - 10, start + 2, start + len, start + len + 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    }
    start += len
  })
  return 1 - hide
}

// Two fonts, picked letter by letter: English letters, digits and signs in
// Plus Jakarta Sans (strong, modern — public/fonts, SIL OFL); it has no Khmer
// letters, so those fall through to Kantumruy Pro (made for Khmer). A mixed
// line ("កញ្ចប់ Pro $29") gets both. The render waits for both.
// TEXT_SCALE draws every letter of both a little smaller, in every template —
// one place instead of each scene's sizes (the layouts fit as they are).
const TEXT_SCALE = '88%'
const fontWait = delayRender('Loading the fonts')
Promise.all([
  new FontFace('CFLatin', `url(${staticFile('fonts/PlusJakartaSans.ttf')})`, { weight: '200 800', sizeAdjust: TEXT_SCALE }).load(),
  new FontFace('Kantumruy', `url(${staticFile('fonts/KantumruyPro.ttf')})`, { weight: '100 700', sizeAdjust: TEXT_SCALE }).load(),
])
  .then((faces) => {
    faces.forEach((f) => document.fonts.add(f))
    continueRender(fontWait)
  })
  .catch((err) => cancelRender(err))

export const ZWSP = '​'
export const EM_OPEN = '⟦'
export const EM_CLOSE = '⟧'
/** A font size that shrinks as the text gets longer, so a long call to action
 * and its button still fit above the subtitles. */
export const fitSize = (text, base) => {
  const n = clean(text).length
  return Math.round(base * (n <= 24 ? 1 : n <= 48 ? 0.82 : n <= 80 ? 0.66 : 0.56))
}

export const clean = (t) => String(t || '').replaceAll(ZWSP, '').replaceAll(EM_OPEN, '').replaceAll(EM_CLOSE, '')

/** A script's picture / sound: a full URL, or a file under public/. */
export const srcOf = (src) => (!src ? null : /^(https?:|data:)/.test(src) ? src : staticFile(src))

/** A Lucide icon by name ("MessageCircle"), with a safe fallback. */
export function Icon({ name, size = 64, color = 'white', stroke = 2 }) {
  const C = Lucide[name] || Lucide.Sparkles
  return <C size={size} color={color} strokeWidth={stroke} />
}

/** A neat square grid behind a scene — thin lines, fading out towards the
 * edges, drifting up slowly. ``color`` is the line colour (ink at a few %
 * on a light page, white at a few % on a dark one). */
export function NeatGrid({ color = 'rgba(15,23,42,0.06)', size = 64 }) {
  const frame = useCurrentFrame()
  const mask = 'radial-gradient(ellipse 90% 75% at 50% 45%, black 35%, transparent 100%)'
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${color} 2px, transparent 2px), linear-gradient(90deg, ${color} 2px, transparent 2px)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `center ${-((frame * 0.4) % size)}px`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  )
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
export const KHMER_RE = /[ក-៿]/

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
  // the empty band above and below Khmer letters in this line height (em)
  const khInset = Math.max(0, ((Number(style?.lineHeight) || 1.45) - 1.04) / 2)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        fontFamily: FONT,
        lineHeight: 1.45,
        ...style,
        // headlines: one weight heavier and a touch tighter — Plus Jakarta Sans goes
        // to 800; Khmer (Kantumruy, max 700) simply stays bold
        ...(style?.fontWeight === 700 ? { fontWeight: 800, letterSpacing: '-0.012em' } : null),
      }}
    >
      {pieces.map(({ p, gap, em: hi }, n) => {
        // The marker reaches past the word only into a space (or into the next
        // marked piece) — Khmer words touch, and an overhang covered the
        // neighbouring word's letters
        const prev = pieces[n - 1]
        const next = pieces[n + 1]
        const pad = KHMER_RE.test(p) ? '-0.16em' : '-0.12em'
        const joinL = !!prev && !prev.gap && prev.em // one marker over two touching pieces:
        const joinR = !gap && !!next && next.em //    no rounded corners where they meet
        const left = !prev || prev.gap ? pad : joinL ? '-0.01em' : '0em'
        const right = gap || !next ? pad : joinR ? '-0.01em' : '0em'
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
                  left,
                  right, // the gap after a word is margin, outside this box
                  // Khmer is taller: vowels sit above the letters (ើ ំ) and stacked
                  // consonants below (្ល) — the marker covers all of it, not a cut-off middle band
                  // a template can lower the marker into a highlighter stroke (--hl-top, e.g. How it works · Grid)
                  // Khmer: fitted to the letters — Kantumruy's ink is ~1.04em tall and sits
                  // centred in the line box, so the box is the line minus that gap, with a
                  // little air (measured; a box taller than the words looked dropped below them)
                  ...(KHMER_RE.test(p)
                    ? { top: `var(--hl-top, ${(khInset - 0.06).toFixed(3)}em)`, bottom: `${(khInset - 0.14).toFixed(3)}em` }
                    : { top: 'var(--hl-top, 0.12em)', bottom: '0.08em' }),
                  borderRadius: `${joinL ? 0 : 'var(--hl-r, 0.18em)'} ${joinR ? 0 : 'var(--hl-r, 0.18em)'} ${joinR ? 0 : 'var(--hl-r, 0.18em)'} ${joinL ? 0 : 'var(--hl-r, 0.18em)'}`,
                  background: 'var(--hl-bg, var(--brand))',
                  boxShadow: 'var(--hl-shadow, none)',
                  transform: `scaleX(${sweep}) rotate(var(--hl-tilt, 0deg))`,
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

