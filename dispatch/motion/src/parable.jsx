/**
 * "Parable · Two paths" — a little story with a lesson about two people who
 * make different choices (the same job, the same money, the same chance — one
 * stays stuck, the other gets ahead). Our own flat-cartoon look: two villagers
 * drawn here (skin, hair, a krama, their clothes and what they carry), in
 * places drawn in code — a Cambodian village with sugar palms and a stilt
 * house, rice fields, a river, a market, a city street of shophouses, an
 * office, a home — at morning, day, evening or night. No AI pictures.
 *
 * A brand-colour ribbon carries each scene's title; names sit on the ground
 * under the feet. Scenes: hook (title card on rays) · tale (the story moment)
 * · tally (a chalkboard counting a number) · fork (a diagonal split — one path
 * vs the other) · moral (the lesson on a palm-leaf manuscript) · cta.
 * props.cast = the two people (app/motion.py clean_duo). 9:16 and 16:9.
 */
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { EM_CLOSE, EM_OPEN, FONT, Icon, ZWSP, clean, fitSize } from './shared'

export const LINE = '#3A2A20' // the warm outline everything is drawn with
const C = { cream: '#FFF6E6', paper: '#F3DFB0', wood: '#9A6638', woodDark: '#6E4523', chalk: '#24453A', gold: '#FFD866', good: '#2F9E5B', bad: '#D2483A' }
const SKINS = { light: '#F7D7B5', tan: '#E8B48A', brown: '#C68A5E', deep: '#8D5A3B' }
export const SHIRTS = { green: '#3FA36B', blue: '#3B7DD8', red: '#E0533D', orange: '#F28C28', purple: '#8A5CD0', teal: '#1E9AA0', yellow: '#F2B830', pink: '#E2588E', brown: '#9C6B43', navy: '#2E3F73', white: '#F4F1EA' }
const PANTS = { male: ['#34466B', '#5B4A3A', '#2F3A44'], female: ['#6A3D7A', '#2F5E7A', '#7A3D4A'] }
const HAIR = '#231C18'
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const KHMER = /[ក-៿]/

// the two people when the storyboard has none (app/motion.py clean_duo says the same)
const DUO = [
  { name: '', gender: 'male', skin: 'tan', hair: 'short', shirt: 'blue', extra: 'krama' },
  { name: '', gender: 'female', skin: 'light', hair: 'bun', shirt: 'pink', extra: 'none' },
]
const GUESTS = {
  elder: { gender: 'male', skin: 'tan', hair: 'grey', shirt: 'white', extra: 'beard' },
  boss: { gender: 'male', skin: 'light', hair: 'side', shirt: 'navy', extra: 'tie' },
  buyer: { gender: 'female', skin: 'brown', hair: 'long', shirt: 'yellow', extra: 'none' },
  child: { gender: 'male', skin: 'tan', hair: 'spiky', shirt: 'red', extra: 'none', small: true },
}

// ── sound cue frames (sfx.jsx parableCues) — the animations below use the same ──
const TITLE_AT = 4
const POP_AT = 20 // the thing over someone's head
const COUNT_AT = 14
const COUNT_LEN = 48
const SPLIT_AT = 2
const LEAF_AT = 8
const BUTTON_AT = 26

export function parableCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[TITLE_AT + 6, 'pop'], [16, 'pop'], [22, 'pop']]
    case 'tale':
      return scene.icon ? [[TITLE_AT + 4, 'pop'], [POP_AT, 'blop']] : [[TITLE_AT + 4, 'pop']]
    case 'tally': {
      const out = [[TITLE_AT + 4, 'pop']]
      for (let f = COUNT_AT; f < COUNT_AT + COUNT_LEN - 6; f += 6) out.push([f, 'tick'])
      return [...out, [COUNT_AT + COUNT_LEN, 'ding']]
    }
    case 'fork':
      return [[SPLIT_AT, 'impact'], [16, 'pop'], [24, 'pop'], ...(scene.sides || []).some((s) => s.icon) ? [[34, 'blop']] : []]
    case 'moral':
      return [[LEAF_AT, 'whoosh'], [LEAF_AT + 22, 'ding']]
    case 'cta':
      return scene.button ? [[6, 'pop'], [BUTTON_AT, 'pop']] : [[6, 'pop']]
    default:
      return []
  }
}

export function useStage() {
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  return {
    W, H, fps, durationInFrames, wide, u,
    ground: wide ? H - 225 * u : 1390 * u,
    charH: (wide ? 470 : 680) * u,
    titleTop: wide ? 42 * u : 245 * u,
  }
}

/** Where each person stands: [first, second, guest]. */
function spots(W, wide, who, guest) {
  if (guest) return who === 0 ? [W * 0.2, W * 0.46, W * 0.78] : [W * 0.3, W * 0.3, W * 0.72]
  if (who === 0) return wide ? [W * 0.36, W * 0.64] : [W * 0.3, W * 0.7]
  return [W * 0.5, W * 0.5]
}

// ── words ──────────────────────────────────────────────────────────────────
/** Text cut into pieces that may wrap (words, Khmer clusters), ⟦key⟧ words marked. */
function bits(text) {
  const out = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === EM_OPEN) em = true
        else if (bit === EM_CLOSE) em = false
        else out.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && out.length) out[out.length - 1].gap = true
    })
  }
  return out
}

/** Words that spring in one after another; ``stroke`` draws a thick outline round them. */
export function Say({ text, size, width, color = 'white', accent = C.gold, stroke, delay = 0, step = 2, align = 'center', weight = 800 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const km = KHMER.test(clean(text))
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', justifyContent: align === 'left' ? 'flex-start' : 'center', alignItems: 'baseline', fontFamily: FONT, fontWeight: weight, fontSize: fitSize(text, size), lineHeight: km ? 1.5 : 1.12, letterSpacing: km ? 0 : '-0.01em', textAlign: align }}>
      {bits(text).map(({ p, gap, em }, n) => {
        const s = spring({ frame: frame - Math.round(delay * fps) - n * step, fps, config: { damping: 12, mass: 0.5 } })
        return (
          <span key={n} style={{ display: 'inline-block', marginRight: gap ? '0.24em' : 0, color: em ? accent : color, opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 20}px) scale(${0.86 + 0.14 * s})`, WebkitTextStroke: stroke ? `0.14em ${stroke}` : undefined, paintOrder: 'stroke fill' }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

/** The scene's title on a brand-colour ribbon, tilted a little. */
export function Ribbon({ text, brand, dark = false, big = false }) {
  const frame = useCurrentFrame()
  const { W, u, wide, titleTop, fps } = useStage()
  if (!text) return null
  const s = spring({ frame: frame - TITLE_AT, fps, config: { damping: 12 } })
  const color = dark ? '#1F1A2E' : brand?.color || '#E0533D'
  const size = (big ? (wide ? 72 : 80) : wide ? 56 : 62) * u
  const w = Math.min(W * (wide ? 0.62 : 0.86), (wide ? 1100 : 900) * u)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: titleTop, display: 'flex', justifyContent: 'center', transform: `scale(${0.7 + 0.3 * s}) rotate(${-1.6 * s}deg)`, opacity: Math.min(1, s * 2) }}>
      <div style={{ position: 'relative', maxWidth: w, padding: `${14 * u}px ${44 * u}px ${18 * u}px`, background: color, borderRadius: 18 * u, border: `${5 * u}px solid ${LINE}`, boxShadow: `${8 * u}px ${9 * u}px 0 ${LINE}` }}>
        {/* the ribbon's folded ends */}
        {[-1, 1].map((d) => (
          <div key={d} style={{ position: 'absolute', top: 26 * u, [d < 0 ? 'left' : 'right']: -54 * u, width: 76 * u, height: '78%', background: color, filter: 'brightness(0.78)', border: `${5 * u}px solid ${LINE}`, zIndex: -1, clipPath: d < 0 ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 30% 50%)' : 'polygon(0 0, 100% 0, 70% 50%, 100% 100%, 0 100%)' }} />
        ))}
        <Say text={text} size={size} width={w - 88 * u} delay={(TITLE_AT + 4) / 30} />
      </div>
    </div>
  )
}

/** A person's name on the ground under their feet. */
function NameTag({ x, name, color, delay = 0 }) {
  const frame = useCurrentFrame()
  const { ground, u, fps } = useStage()
  if (!name) return null
  const s = spring({ frame: frame - delay, fps, config: { damping: 13 } })
  return (
    <div style={{ position: 'absolute', left: x - 200 * u, width: 400 * u, top: ground + 14 * u, display: 'flex', justifyContent: 'center', opacity: s, transform: `translateY(${(1 - s) * 16 * u}px)` }}>
      <span style={{ padding: `${4 * u}px ${24 * u}px`, borderRadius: 999, background: color, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(name, 38 * u), lineHeight: 1.45, border: `${4 * u}px solid ${LINE}`, boxShadow: `${4 * u}px ${5 * u}px 0 ${LINE}`, whiteSpace: 'nowrap' }}>{clean(name)}</span>
    </div>
  )
}

/** Slowly turning rays — the title card, the split, the close. */
export function Rays({ a, b, at = '50% 45%', speed = 0.12 }) {
  const frame = useCurrentFrame()
  return <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * speed}deg at ${at}, ${a} 0deg 9deg, ${b} 9deg 18deg)` }} />
}

/** "#E0533D" lighter (k > 0) or darker (k < 0). */
export function shade(hex, k) {
  const h = String(hex || '#E0533D').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}

/**
 * Is the scene's speaker saying a word at this frame? Their voice line starts
 * at ``voiceAt`` (MotionPost.jsx); with word timings (app/speech.py) the mouth
 * moves on the words and rests between them, else for the line's length.
 */
export function useTalking(scene, voiceAt = 0) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!scene?.speaker || !scene.audio) return false
  const f = frame - voiceAt
  if (scene.voiceWords?.length) return scene.voiceWords.some((w) => f >= w.t * fps - 1 && f <= w.e * fps + 1)
  return f >= 0 && f <= (scene.voiceSeconds || 0) * fps
}
const speaks = (scene, i, talking) => talking && scene.speaker === i + 1

// ── the people ─────────────────────────────────────────────────────────────
// Each arm is two pieces: [outward angle at the shoulder, bend at the elbow]
// (degrees; outward = away from the body, bend = the forearm turning inward).
const POSES = {
  stand: { r: [12, 10], l: [12, 10] },
  walk: { r: [10, 12], l: [10, 12] },
  carry: { r: [17, -4], l: [17, -4] },
  cheer: { r: [155, -10], l: [155, -10] },
  wave: { r: [130, -40], l: [12, 10] },
  point: { r: [95, -4], l: [12, 10] },
  think: { r: [-60, 110], l: [12, 10] },
  tired: { r: [5, 0], l: [5, 0] },
  shrug: { r: [40, -95], l: [40, -95] },
  proud: { r: [35, 66], l: [35, 66] },
  sad: { r: [6, 4], l: [6, 4] },
}
const HOLD = [10, 116] // a hand in front of the chest
const SH = { x: 11.5, y: -61 } // the right shoulder (the left is mirrored)
const UPPER = 14
const FORE = 13
const rad = (d) => (d * Math.PI) / 180

/** Where a hand ends up, in the person's own units. */
function handAt(side, [out, bend]) {
  const a = side === 'r' ? -out : out
  const b = side === 'r' ? bend : -bend
  const sx = side === 'r' ? SH.x : -SH.x
  const ex = sx - UPPER * Math.sin(rad(a))
  const ey = SH.y + UPPER * Math.cos(rad(a))
  return { x: ex - FORE * Math.sin(rad(a + b)), y: ey + FORE * Math.cos(rad(a + b)) }
}

function Arm({ side, angles, shirt, skin }) {
  const [out, bend] = angles
  const a = side === 'r' ? -out : out
  const b = side === 'r' ? bend : -bend
  const sx = side === 'r' ? SH.x : -SH.x
  const ink = { stroke: LINE, strokeWidth: 1.1, strokeLinecap: 'round' }
  return (
    <g transform={`translate(${sx} ${SH.y}) rotate(${a})`}>
      <line x1={0} y1={0} x2={0} y2={UPPER} stroke={LINE} strokeWidth={6.4} strokeLinecap="round" />
      <line x1={0} y1={0} x2={0} y2={UPPER} stroke={shirt} strokeWidth={4.4} strokeLinecap="round" />
      <g transform={`translate(0 ${UPPER}) rotate(${b})`}>
        <line x1={0} y1={0} x2={0} y2={FORE} stroke={LINE} strokeWidth={5.2} strokeLinecap="round" />
        <line x1={0} y1={0} x2={0} y2={FORE} stroke={skin} strokeWidth={3.2} strokeLinecap="round" />
        <circle cx={0} cy={FORE + 0.6} r={2.7} fill={skin} {...ink} />
      </g>
    </g>
  )
}

/** What someone carries, drawn at their hand(s). */
function Carried({ item, r, l, brand }) {
  const ink = { stroke: LINE, strokeWidth: 1, strokeLinejoin: 'round' }
  const bucket = (h, k) => (
    <g key={k} transform={`translate(${h.x} ${h.y})`}>
      <path d="M -5 2 Q 0 -4 5 2" fill="none" stroke={LINE} strokeWidth={0.9} />
      <path d="M -6.5 3 L 6.5 3 L 5 15 L -5 15 Z" fill="#F28C28" {...ink} />
      <rect x={-6.2} y={6} width={12.4} height={2} fill="#D96F14" />
      <ellipse cx={0} cy={3.2} rx={6} ry={1.3} fill="#7CC7F2" {...ink} strokeWidth={0.7} />
    </g>
  )
  switch (item) {
    case 'bucket':
      return <>{bucket(r, 'r')}{bucket(l, 'l')}</>
    case 'basket':
      return (
        <g transform={`translate(${r.x} ${r.y})`}>
          <path d="M -6 1 Q 0 -6 6 1" fill="none" stroke={C.woodDark} strokeWidth={1.2} />
          <path d="M -8 2 L 8 2 Q 7 12 0 12.5 Q -7 12 -8 2 Z" fill="#C8924F" {...ink} />
          <path d="M -6 5 L 6 5 M -5.5 8 L 5.5 8 M -3 2.5 L -2 12 M 2 2.5 L 3 12" stroke={C.woodDark} strokeWidth={0.6} />
          <circle cx={-2.5} cy={1} r={2.2} fill="#7BC043" {...ink} strokeWidth={0.6} />
          <circle cx={2.5} cy={0.6} r={2.2} fill="#F5B83D" {...ink} strokeWidth={0.6} />
        </g>
      )
    case 'bag':
      return (
        <g transform={`translate(${r.x} ${r.y})`}>
          <path d="M -3 2 Q 0 -4 3 2" fill="none" stroke={LINE} strokeWidth={0.9} />
          <rect x={-6} y={2} width={12} height={13} rx={1.5} fill={brand?.color || '#E0533D'} {...ink} />
        </g>
      )
    case 'sack':
      return (
        <g transform={`translate(${r.x} ${r.y})`}>
          <path d="M -2 0 L 2 0 L 7 6 Q 8 16 0 17 Q -8 16 -7 6 Z" fill="#F4EEDF" {...ink} />
          <path d="M -5 9 L 5 9 M -5.5 12 L 5.5 12" stroke="#C9BFA6" strokeWidth={0.7} />
        </g>
      )
    case 'box':
      return (
        <g transform="translate(0 -46)">
          <rect x={-12} y={-8} width={24} height={16} rx={1} fill="#C89A5E" {...ink} />
          <path d="M 0 -8 L 0 8" stroke="#E8C48A" strokeWidth={2.4} />
        </g>
      )
    case 'book':
      return <rect x={-8} y={-54} width={16} height={11} rx={1.2} fill="#3B7DD8" {...ink} transform="rotate(-6 0 -48)" />
    case 'phone':
      return <rect x={r.x - 2.6} y={r.y - 8} width={5.2} height={9} rx={1} fill="#2B2B33" {...ink} strokeWidth={0.8} />
    case 'money':
      return (
        <g transform={`translate(${r.x} ${r.y - 4})`}>
          {[-14, 0, 14].map((d) => (
            <rect key={d} x={-3} y={-9} width={6} height={10} rx={0.8} fill="#4FB06D" {...ink} strokeWidth={0.7} transform={`rotate(${d} 0 0)`} />
          ))}
        </g>
      )
    default:
      return null
  }
}

/**
 * One person, feet centred at (``x``, ``ground``), ``h`` tall. ``p`` is who
 * they are (gender, skin, hair, shirt, extra); ``pose`` and ``mood`` what
 * they're doing; ``item`` what they carry.
 */
export function Villager({ x, ground, h, p, pose = 'stand', mood = 'happy', item = 'none', brand, enter = 1, seed = 0, walking = false, small = false, talking = false }) {
  const frame = useCurrentFrame()
  const person = { ...DUO[0], ...(p || {}) }
  const s = (h * (small ? 0.72 : 1)) / 100 // drawing units: 100 tall
  const skin = SKINS[person.skin] || SKINS.tan
  const shirt = SHIRTS[person.shirt] || SHIRTS.blue
  const female = person.gender === 'female'
  const pants = PANTS[female ? 'female' : 'male'][seed % 3]
  const hairColor = person.hair === 'grey' ? '#D9D6CF' : HAIR
  const blink = (frame + seed * 41) % 100 > 94
  const step = walking ? Math.sin(frame / 3.2) : 0
  const bob = walking ? Math.abs(Math.cos(frame / 3.2)) * -1.6 : Math.sin(frame / 16 + seed) * 0.4
  const tired = pose === 'tired' || pose === 'sad'
  let arms = POSES[walking ? 'walk' : pose] || POSES.stand
  if (item === 'bucket' && (pose === 'stand' || pose === 'walk' || pose === 'tired' || walking)) arms = { r: [17, -4], l: [17, -4] }
  if (item === 'box' || item === 'book') arms = { r: HOLD, l: HOLD }
  if (item === 'phone' && pose !== 'cheer') arms = { ...arms, r: HOLD }
  const swing = walking ? 10 * step : 0
  const wiggle = pose === 'cheer' ? Math.sin(frame / 3) * 8 : pose === 'wave' ? Math.sin(frame / 3.5) * 24 : 0
  const R = [arms.r[0] + swing + (pose === 'cheer' ? wiggle : 0), arms.r[1] + (pose === 'wave' ? wiggle : 0)]
  const L = [arms.l[0] - swing - (pose === 'cheer' ? wiggle : 0), arms.l[1]]
  const ink = { stroke: LINE, strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const tilt = (tired ? 6 : mood === 'thinking' ? -4 : 0) + (talking ? Math.sin(frame / 5) * 1.6 : 0)
  const eyes = (() => {
    if (blink) return <g {...ink} fill="none"><line x1={-6.5} y1={-79} x2={-3} y2={-79} /><line x1={3} y1={-79} x2={6.5} y2={-79} /></g>
    if (mood === 'happy' || mood === 'excited') return <g {...ink} strokeWidth={1.3} fill="none"><path d="M -7 -78.5 Q -4.8 -82.5 -2.6 -78.5" /><path d="M 2.6 -78.5 Q 4.8 -82.5 7 -78.5" /></g>
    const big = mood === 'shocked'
    return (
      <g>
        <ellipse cx={-4.8} cy={-79.5} rx={big ? 2.4 : 1.7} ry={big ? 2.8 : 2.2} fill="#2B211C" />
        <ellipse cx={4.8} cy={-79.5} rx={big ? 2.4 : 1.7} ry={big ? 2.8 : 2.2} fill="#2B211C" />
        <circle cx={-4.2} cy={-80.4} r={0.6} fill="white" />
        <circle cx={5.4} cy={-80.4} r={0.6} fill="white" />
      </g>
    )
  })()
  const brows =
    mood === 'worried' || mood === 'sad' || tired ? (
      <g {...ink} fill="none"><line x1={-7.5} y1={-84} x2={-2.8} y2={-85.6} /><line x1={2.8} y1={-85.6} x2={7.5} y2={-84} /></g>
    ) : mood === 'angry' ? (
      <g {...ink} fill="none"><line x1={-7.5} y1={-86} x2={-2.8} y2={-84} /><line x1={2.8} y1={-84} x2={7.5} y2={-86} /></g>
    ) : (
      <g {...ink} fill="none" strokeWidth={0.9}><path d="M -7.2 -84.6 Q -5 -86 -2.8 -85" /><path d="M 2.8 -85 Q 5 -86 7.2 -84.6" /></g>
    )
  // talking: the mouth opens and closes, a little wider now and then
  const open = talking ? [2.6, 1.2, 3.2, 0.6, 2.2, 1.6][Math.floor(frame / 3) % 6] : 0
  const mouth =
    talking ? <ellipse cx={0} cy={-71} rx={2.9} ry={open} fill="#7A2E2A" {...ink} />
    : mood === 'excited' ? <path d="M -4 -72.5 Q 0 -66.5 4 -72.5 Z" fill="#7A2E2A" {...ink} />
    : mood === 'shocked' ? <ellipse cx={0} cy={-71} rx={2.2} ry={2.8} fill="#7A2E2A" {...ink} />
    : mood === 'sad' || mood === 'worried' || mood === 'angry' || tired ? <path d="M -3.4 -70 Q 0 -73 3.4 -70" {...ink} fill="none" />
    : mood === 'thinking' ? <path d="M -2.4 -71.2 L 2.8 -72" {...ink} />
    : <path d="M -3.8 -72.6 Q 0 -68.6 3.8 -72.6" {...ink} fill="none" />
  const top = {
    short: <path d="M -13.6 -81 Q -14.5 -96.5 0 -96.5 Q 14.5 -96.5 13.6 -81 Q 9.5 -89.5 0 -89 Q -8 -88.5 -13.6 -81 Z" fill={hairColor} {...ink} strokeWidth={0.9} />,
    spiky: <path d="M -13.6 -81 L -12.5 -93 L -7.5 -90 L -4.5 -99 L 0 -92.5 L 4.5 -99 L 7.5 -91 L 12.5 -94 L 13.6 -81 Q 6 -89 -13.6 -81 Z" fill={hairColor} {...ink} strokeWidth={0.9} />,
    side: <path d="M -13.9 -79 Q -15.5 -97 2 -96.5 Q 15.5 -95.5 13.9 -79 Q 12 -88 4 -88 Q -2 -91.5 -8 -86 Q -11.5 -83.5 -13.9 -79 Z" fill={hairColor} {...ink} strokeWidth={0.9} />,
    bun: <g fill={hairColor} {...ink} strokeWidth={0.9}><circle cx={0} cy={-98} r={5.2} /><path d="M -13.8 -80 Q -15 -96.5 0 -96.5 Q 15 -96.5 13.8 -80 Q 7 -90.5 0 -89.5 Q -7 -90.5 -13.8 -80 Z" /></g>,
    long: <path d="M -13.8 -80 Q -15.5 -97.5 0 -97 Q 15.5 -97.5 13.8 -80 L 15.2 -62 Q 12.5 -59.5 10.2 -63.5 L 10.4 -82 Q 0 -91 -10.4 -82 L -10.2 -63.5 Q -12.5 -59.5 -15.2 -62 Z" fill={hairColor} {...ink} strokeWidth={0.9} />,
    ponytail: <g fill={hairColor} {...ink} strokeWidth={0.9}><path d="M 11 -88 Q 22 -86 19 -68 Q 15 -76 11 -82 Z" /><path d="M -13.8 -80 Q -15 -96.5 0 -96.5 Q 15 -96.5 13.8 -80 Q 5 -90 -13.8 -80 Z" /></g>,
    cap: (
      <g {...ink} strokeWidth={0.9}>
        <path d="M -13.6 -81 Q -14 -86 -12 -88 L 12 -88 Q 14 -86 13.6 -81 Q 6 -87 -13.6 -81 Z" fill={hairColor} />
        <path d="M -14.2 -85 Q -14.2 -100 0 -100 Q 14.2 -100 14.2 -85 Z" fill={shade(shirt, -0.25)} />
        <path d="M 10 -86 L 23.5 -85 Q 23.5 -82.5 11 -83" fill={shade(shirt, -0.25)} />
      </g>
    ),
    krama: (
      <g {...ink} strokeWidth={0.9}>
        <path d="M -13.6 -82 Q -14.5 -96 0 -96 Q 14.5 -96 13.6 -82 Z" fill={hairColor} />
        <rect x={-14.4} y={-90} width={28.8} height={6} rx={2} fill="url(#krama)" />
        <path d="M 13 -88 L 19 -91 L 18 -84 Z" fill="url(#krama)" />
      </g>
    ),
    grey: <g fill={hairColor} {...ink} strokeWidth={0.8}><path d="M -13.8 -78 Q -15 -88 -10 -90 Q -12 -84 -11 -78 Z" /><path d="M 13.8 -78 Q 15 -88 10 -90 Q 12 -84 11 -78 Z" /></g>,
  }[person.hair] || null
  const legs = female ? (
    <g>
      <line x1={-4} y1={-17} x2={-4 - step * 4} y2={-1} {...ink} stroke={skin} strokeWidth={3.6} />
      <line x1={4} y1={-17} x2={4 + step * 4} y2={-1} {...ink} stroke={skin} strokeWidth={3.6} />
      <ellipse cx={-5 - step * 4} cy={-0.6} rx={3.6} ry={1.6} fill="#5A3B2A" {...ink} strokeWidth={0.8} />
      <ellipse cx={5 + step * 4} cy={-0.6} rx={3.6} ry={1.6} fill="#5A3B2A" {...ink} strokeWidth={0.8} />
      <path d="M -11 -36 L 11 -36 L 14.5 -15 Q 0 -12.5 -14.5 -15 Z" fill={pants} {...ink} />
      <path d="M -12.5 -24 Q 0 -22 12.5 -24" stroke={shade(pants, 0.35)} strokeWidth={1.2} fill="none" />
    </g>
  ) : (
    <g>
      <g transform={`rotate(${step * 16} -5 -34)`}>
        <rect x={-8.6} y={-35} width={7.4} height={34} rx={2.6} fill={pants} {...ink} />
        <ellipse cx={-5.6} cy={-0.6} rx={4.6} ry={1.9} fill="#5A3B2A" {...ink} strokeWidth={0.8} />
      </g>
      <g transform={`rotate(${-step * 16} 5 -34)`}>
        <rect x={1.2} y={-35} width={7.4} height={34} rx={2.6} fill={pants} {...ink} />
        <ellipse cx={5.6} cy={-0.6} rx={4.6} ry={1.9} fill="#5A3B2A" {...ink} strokeWidth={0.8} />
      </g>
    </g>
  )
  return (
    <svg
      width={64 * s}
      height={120 * s}
      viewBox="-32 -114 64 120"
      style={{ position: 'absolute', left: x - 32 * s, top: ground - 114 * s, overflow: 'visible', opacity: Math.min(1, enter * 1.5), transform: `translateY(${(1 - enter) * 30}px)` }}
    >
      <defs>
        <pattern id="krama" width={3} height={3} patternUnits="userSpaceOnUse">
          <rect width={3} height={3} fill="#D8423A" />
          <rect width={1.5} height={1.5} fill="#F6EFE6" />
          <rect x={1.5} y={1.5} width={1.5} height={1.5} fill="#F6EFE6" />
        </pattern>
      </defs>
      <ellipse cx={0} cy={1} rx={15} ry={2.4} fill="rgba(40,25,10,0.18)" />
      <g transform={`translate(0 ${bob})`}>
        {legs}
        <g transform={`rotate(${tilt * 0.4} 0 -34)`}>
          {/* the body: shirt, then the arms, then the head */}
          <path d="M -11 -64 Q -13.5 -50 -11.5 -33 L 11.5 -33 Q 13.5 -50 11 -64 Q 0 -67.5 -11 -64 Z" fill={shirt} {...ink} />
          {person.extra === 'tie' && <path d="M 0 -64 L -1.8 -60 L 0 -46 L 1.8 -60 Z" fill="#D8423A" {...ink} strokeWidth={0.7} />}
          <path d="M -4 -64.5 Q 0 -61 4 -64.5" fill="none" {...ink} strokeWidth={0.9} />
          <Arm side="l" angles={L} shirt={shirt} skin={skin} />
          <Arm side="r" angles={R} shirt={shirt} skin={skin} />
          <Carried item={item} r={handAt('r', R)} l={handAt('l', L)} brand={brand} />
          {/* an elder leans on a walking stick */}
          {person.hair === 'grey' && person.extra === 'beard' && pose !== 'cheer' && (() => {
            const hl = handAt('l', L)
            return <line x1={hl.x} y1={hl.y - 2} x2={hl.x - 1.5} y2={1} stroke={C.wood} strokeWidth={1.8} strokeLinecap="round" />
          })()}
          {person.extra === 'krama' && (
            <g {...ink} strokeWidth={0.8}>
              <path d="M -9 -66 Q 0 -60 9 -66 L 8 -62 Q 0 -57 -8 -62 Z" fill="url(#krama)" />
              <path d="M 5 -61 L 8 -50 L 4 -51 Z" fill="url(#krama)" />
            </g>
          )}
          <g transform={`rotate(${tilt} 0 -66)`}>
            <rect x={-3} y={-69} width={6} height={6} fill={skin} />
            {person.hair === 'long' && <path d="M -13 -82 L -13.6 -63 L 13.6 -63 L 13 -82 Z" fill={hairColor} />}
            <circle cx={-13.6} cy={-78} r={2.6} fill={skin} {...ink} strokeWidth={0.9} />
            <circle cx={13.6} cy={-78} r={2.6} fill={skin} {...ink} strokeWidth={0.9} />
            <ellipse cx={0} cy={-80} rx={13.6} ry={14.2} fill={skin} {...ink} />
            {top}
            <ellipse cx={-8.4} cy={-73.8} rx={2.3} ry={1.3} fill="#F29C8B" opacity={0.7} />
            <ellipse cx={8.4} cy={-73.8} rx={2.3} ry={1.3} fill="#F29C8B" opacity={0.7} />
            {eyes}
            {brows}
            <path d="M -0.6 -77.5 Q 1.4 -75.2 -0.4 -74.6" fill="none" {...ink} strokeWidth={0.8} />
            {person.extra === 'glasses' && <g {...ink} strokeWidth={0.9} fill="none"><circle cx={-4.8} cy={-79.5} r={3.4} /><circle cx={4.8} cy={-79.5} r={3.4} /><line x1={-1.4} y1={-79.5} x2={1.4} y2={-79.5} /></g>}
            {person.extra === 'beard' ? (
              <g>
                <path d="M -9 -74 Q -10 -63 0 -60.5 Q 10 -63 9 -74 Q 5 -69 0 -69.5 Q -5 -69 -9 -74 Z" fill="#EDEBE6" {...ink} strokeWidth={0.8} />
                <path d="M -5.5 -72.5 Q 0 -75.5 5.5 -72.5 Q 0 -71 -5.5 -72.5 Z" fill="#EDEBE6" {...ink} strokeWidth={0.7} />
              </g>
            ) : (
              mouth
            )}
          </g>
          {/* sweat on a tired brow */}
          {tired && (
            <g fill="#8FD3F5" stroke={LINE} strokeWidth={0.6}>
              <path d={`M 15 ${-90 + ((frame / 2) % 10)} q 2 3 0 4.5 q -2 -1.5 0 -4.5 Z`} opacity={1 - ((frame / 2) % 10) / 12} />
              <path d={`M -16 ${-86 + ((frame / 2 + 5) % 10)} q 2 3 0 4.5 q -2 -1.5 0 -4.5 Z`} opacity={1 - ((frame / 2 + 5) % 10) / 12} />
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

/** Someone in a scene: their spot, a little rise as they appear, walking in when asked. */
export function Person({ x, p, act = {}, item, brand, seed, delay = 0, name, color, h, tag = true, talking = false }) {
  const frame = useCurrentFrame()
  const { W, ground, charH, fps } = useStage()
  const e = spring({ frame: frame - delay, fps, config: { damping: 14 } })
  const walkIn = act.pose === 'walk'
  const t = walkIn ? interpolate(frame, [delay, delay + 1.4 * fps], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) }) : 1
  const from = x < W / 2 ? -W * 0.3 : W * 0.3
  const walking = walkIn && t < 1
  return (
    <>
      <Villager x={x + from * (1 - t)} ground={ground} h={h || charH} p={p} pose={walkIn ? 'stand' : act.pose} mood={act.mood} item={item} brand={brand} enter={walkIn ? 1 : e} seed={seed} walking={walking} small={p?.small} talking={talking && !walking} />
      {tag && <NameTag x={x} name={name} color={color} delay={delay + 6} />}
    </>
  )
}

// ── the places ─────────────────────────────────────────────────────────────
const SKIES = {
  morning: ['#9ED4F3', '#FFE3BC'],
  day: ['#63BDF0', '#CFEFFF'],
  evening: ['#7A5BB0', '#F7A65E'],
  night: ['#121D46', '#2F3F7E'],
}

function Sky({ time }) {
  const frame = useCurrentFrame()
  const { W, H, u, ground } = useStage()
  const [top, bottom] = SKIES[time] || SKIES.day
  const night = time === 'night'
  const sun = { morning: [0.2, 0.42, '#FFE7A3'], day: [0.8, 0.2, '#FFE066'], evening: [0.72, 0.55, '#FF9A4D'], night: [0.8, 0.18, '#F4F1DE'] }[time] || [0.8, 0.2, '#FFE066']
  return (
    <>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${top} 0%, ${bottom} ${(ground / H) * 100}%)` }} />
      {night &&
        Array.from({ length: 26 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: ((i * 383) % 1000) / 1000 * W, top: (((i * 571) % 1000) / 1000) * ground * 0.7, width: 5 * u, height: 5 * u, borderRadius: 9, background: 'white', opacity: 0.4 + 0.5 * Math.abs(Math.sin(frame / 14 + i)) }} />
        ))}
      <div style={{ position: 'absolute', left: W * sun[0] - 90 * u, top: ground * sun[1] - 90 * u, width: 180 * u, height: 180 * u, borderRadius: '50%', background: sun[2], boxShadow: `0 0 ${90 * u}px ${sun[2]}` }}>
        {night && <div style={{ position: 'absolute', left: 50 * u, top: -16 * u, width: 160 * u, height: 160 * u, borderRadius: '50%', background: top }} />}
      </div>
      {!night &&
        [0.12, 0.55, 0.86].map((k, i) => (
          <svg key={i} width={260 * u} height={90 * u} viewBox="0 0 260 90" style={{ position: 'absolute', left: ((k * W + frame * (0.5 + i * 0.2) * u) % (W + 300 * u)) - 280 * u, top: ground * (0.12 + i * 0.09) }}>
            <path d="M 30 80 Q 0 80 10 58 Q 20 36 52 46 Q 64 10 110 22 Q 140 0 168 34 Q 210 22 222 56 Q 258 60 240 80 Z" fill="white" opacity={time === 'evening' ? 0.55 : 0.9} />
          </svg>
        ))}
    </>
  )
}

/** A sugar palm — the tree of the Cambodian countryside. */
function Palm({ x, base, h, color = '#2E7D4F' }) {
  const s = h / 100
  return (
    <svg width={60 * s} height={110 * s} viewBox="-30 -105 60 110" style={{ position: 'absolute', left: x - 30 * s, top: base - 105 * s, overflow: 'visible' }}>
      <path d="M -1.6 0 Q -3 -40 -0.6 -78 L 1.6 -78 Q 0.4 -40 1.6 0 Z" fill="#8A6A4A" />
      {Array.from({ length: 11 }, (_, i) => (
        <ellipse key={i} cx={0} cy={-86} rx={3} ry={15} fill={color} transform={`rotate(${i * 33} 0 -80)`} />
      ))}
      <circle cx={0} cy={-80} r={5} fill={color} />
    </svg>
  )
}

function Hills({ color }) {
  const { W, u, ground } = useStage()
  return (
    <svg width={W} height={260 * u} viewBox="0 0 1000 260" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: ground - 250 * u }}>
      <path d="M 0 260 L 0 150 Q 150 40 330 130 Q 470 60 620 140 Q 800 30 1000 120 L 1000 260 Z" fill={color} />
    </svg>
  )
}

function Ground({ color, top, children }) {
  const { u, ground } = useStage()
  return <div style={{ position: 'absolute', left: 0, right: 0, top: (top ?? ground) - 10 * u, bottom: 0, background: color, borderTop: `${5 * u}px solid ${shade(color, -0.18)}` }}>{children}</div>
}

function StiltHouse({ x, base, h }) {
  const s = h / 100
  return (
    <svg width={120 * s} height={110 * s} viewBox="-60 -105 120 110" style={{ position: 'absolute', left: x - 60 * s, top: base - 105 * s }}>
      <g stroke={LINE} strokeWidth={1.4} strokeLinejoin="round">
        {[-40, -14, 14, 40].map((px) => <rect key={px} x={px - 2} y={-42} width={4} height={42} fill="#7A5232" />)}
        <rect x={-48} y={-74} width={96} height={34} fill="#B97945" />
        {[-30, -10, 10, 30].map((px) => <line key={px} x1={px} y1={-74} x2={px} y2={-40} stroke="#9A6234" strokeWidth={0.8} />)}
        <rect x={-20} y={-66} width={14} height={14} fill="#5C3A22" />
        <rect x={8} y={-66} width={14} height={14} fill="#5C3A22" />
        <path d="M -58 -72 L 0 -104 L 58 -72 Z" fill="#A23E2B" />
        <path d="M -20 -86 L 0 -97 L 20 -86 Z" fill="#C7583F" />
        <g stroke="#7A5232" strokeWidth={1.8}><line x1={50} y1={-40} x2={60} y2={0} /><line x1={58} y1={-40} x2={68} y2={0} /></g>
      </g>
    </svg>
  )
}

function Stall({ x, base, w, color }) {
  const { u } = useStage()
  const h = 300 * u
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: base - h, width: w, height: h }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 70 * u, background: `repeating-linear-gradient(90deg, ${color} 0 ${36 * u}px, #FFF6E6 ${36 * u}px ${72 * u}px)`, border: `${4 * u}px solid ${LINE}`, borderRadius: `${10 * u}px ${10 * u}px ${30 * u}px ${30 * u}px` }} />
      {[0.06, 0.9].map((k) => <div key={k} style={{ position: 'absolute', left: `${k * 100}%`, top: 66 * u, width: 12 * u, height: h - 66 * u, background: '#8A6A4A', border: `${3 * u}px solid ${LINE}` }} />)}
      <div style={{ position: 'absolute', left: '2%', right: '2%', bottom: 0, height: 110 * u, background: '#C8924F', border: `${4 * u}px solid ${LINE}`, borderRadius: 8 * u }} />
      <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: 104 * u, display: 'flex', justifyContent: 'space-around' }}>
        {['#F5B83D', '#7BC043', '#E0533D', '#F28C28', '#7BC043'].map((c, i) => <div key={i} style={{ width: 40 * u, height: 40 * u, borderRadius: '50%', background: c, border: `${3 * u}px solid ${LINE}` }} />)}
      </div>
    </div>
  )
}

function Shophouse({ x, base, w, h, color }) {
  const { u } = useStage()
  return (
    <div style={{ position: 'absolute', left: x, top: base - h, width: w, height: h, background: color, border: `${4 * u}px solid ${LINE}` }}>
      {[0.12, 0.4].map((k) => (
        <div key={k} style={{ position: 'absolute', left: '14%', right: '14%', top: `${k * 100}%`, height: '18%', display: 'flex', gap: '10%' }}>
          {[0, 1].map((i) => <div key={i} style={{ flex: 1, background: '#BFE3F5', border: `${3 * u}px solid ${LINE}` }} />)}
        </div>
      ))}
      <div style={{ position: 'absolute', left: '6%', right: '6%', top: '33%', height: 8 * u, background: LINE }} />
      <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: 0, height: '26%', background: shade(color, -0.35), border: `${3 * u}px solid ${LINE}`, borderBottom: 'none' }} />
    </div>
  )
}

function Room({ wall, floor, children }) {
  const { u, ground } = useStage()
  return (
    <>
      <AbsoluteFill style={{ background: wall }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 70 * u, height: 14 * u, background: shade(wall, -0.12) }} />
      <Ground color={floor} />
      {children}
    </>
  )
}

function Window({ x, y, w, h, time }) {
  const { u } = useStage()
  const [top, bottom] = SKIES[time] || SKIES.day
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, background: `linear-gradient(180deg, ${top}, ${bottom})`, border: `${8 * u}px solid #FFFFFF`, outline: `${4 * u}px solid ${LINE}`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', display: 'flex', alignItems: 'flex-end', gap: 6 * u, opacity: 0.55 }}>
        {[0.6, 0.9, 0.45, 0.75, 0.55].map((k, i) => <div key={i} style={{ flex: 1, height: `${k * 100}%`, background: '#5B6F8F' }} />)}
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 6 * u, background: 'white' }} />
    </div>
  )
}

export function Place({ place, time }) {
  const frame = useCurrentFrame()
  const { W, H, u, ground, wide } = useStage()
  const night = time === 'night'
  const dusk = night ? <AbsoluteFill style={{ background: 'rgba(16,24,64,0.32)' }} /> : null
  if (place === 'office' || place === 'home') {
    const office = place === 'office'
    return (
      <>
        <Room wall={office ? '#E8EEF5' : '#F6E5CF'} floor={office ? '#BFAE96' : '#C9935F'}>
          <Window x={W * (wide ? 0.08 : 0.08)} y={ground - (wide ? 560 : 760) * u} w={(wide ? 380 : 330) * u} h={(wide ? 300 : 360) * u} time={time} />
          {office ? (
            <>
              <div style={{ position: 'absolute', right: W * 0.08, top: ground - (wide ? 600 : 800) * u, width: 120 * u, height: 120 * u, borderRadius: '50%', background: 'white', border: `${6 * u}px solid ${LINE}` }} />
              <div style={{ position: 'absolute', right: W * 0.05, top: ground - 210 * u, width: (wide ? 330 : 260) * u, height: 30 * u, background: '#8A6A4A', border: `${4 * u}px solid ${LINE}` }} />
              <div style={{ position: 'absolute', right: W * 0.05 + 60 * u, top: ground - 330 * u, width: 150 * u, height: 115 * u, background: '#2B2B33', border: `${4 * u}px solid ${LINE}`, borderRadius: 8 * u }} />
            </>
          ) : (
            <>
              <div style={{ position: 'absolute', right: W * 0.06, top: ground - (wide ? 560 : 700) * u, width: 170 * u, height: 130 * u, background: '#F2B830', border: `${8 * u}px solid #8A6A4A`, outline: `${3 * u}px solid ${LINE}` }} />
              <div style={{ position: 'absolute', right: W * 0.03, top: ground - 190 * u, width: (wide ? 420 : 330) * u, height: 150 * u, background: '#3FA36B', border: `${4 * u}px solid ${LINE}`, borderRadius: `${40 * u}px ${40 * u}px ${10 * u}px ${10 * u}px` }} />
            </>
          )}
        </Room>
        {dusk}
      </>
    )
  }
  const green = night ? '#3E6B5A' : time === 'evening' ? '#86A86A' : '#9CCB7C'
  return (
    <>
      <Sky time={time} />
      <Hills color={night ? '#2D4A55' : time === 'evening' ? '#9B7FA8' : '#A9CFA0'} />
      {place === 'field' && (
        <>
          <Ground color="#86C25E" />
          {Array.from({ length: 6 }, (_, i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: ground - 4 * u + i * ((H - ground) / 6), height: 10 * u, background: '#6FA84B' }} />)}
          {[0.1, 0.24, 0.82, 0.93].map((k, i) => <Palm key={i} x={W * k} base={ground - 10 * u} h={(i % 2 ? 330 : 420) * u} />)}
        </>
      )}
      {place === 'village' && (
        <>
          <Ground color="#E6C08C" />
          {[0.06, 0.94].map((k, i) => <Palm key={i} x={W * k} base={ground} h={(i ? 470 : 400) * u} />)}
          <StiltHouse x={W * (wide ? 0.84 : 0.8)} base={ground} h={(wide ? 330 : 360) * u} />
          <svg width={70 * u} height={70 * u} viewBox="0 0 70 70" style={{ position: 'absolute', left: W * (wide ? 0.14 : 0.08), top: ground - 64 * u }}>
            <path d="M 18 8 L 52 8 Q 66 30 56 62 L 14 62 Q 4 30 18 8 Z" fill="#B5653A" stroke={LINE} strokeWidth={3} />
            <ellipse cx={35} cy={8} rx={17} ry={4} fill="#7A3E20" stroke={LINE} strokeWidth={3} />
          </svg>
        </>
      )}
      {place === 'river' && (
        <>
          <Ground color="#DDB77F" />
          <div style={{ position: 'absolute', left: 0, top: ground - 6 * u, bottom: 0, width: W * (wide ? 0.22 : 0.2), background: '#3E9BD9', borderRight: `${5 * u}px solid ${shade('#3E9BD9', -0.25)}` }}>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: `${10 + ((i * 37) % 60)}%`, top: `${8 + i * 13}%`, width: 70 * u, height: 8 * u, borderRadius: 9, background: 'rgba(255,255,255,0.55)', transform: `translateX(${Math.sin(frame / 10 + i) * 12 * u}px)` }} />
            ))}
          </div>
          <Palm x={W * 0.9} base={ground} h={440 * u} />
        </>
      )}
      {place === 'market' && (
        <>
          <Ground color="#D7C2A3" />
          {(wide ? [0.12, 0.38, 0.88] : [0.13, 0.87]).map((k, i) => <Stall key={i} x={W * k} base={ground} w={(wide ? 340 : 300) * u} color={['#E0533D', '#3FA36B', '#3B7DD8'][i]} />)}
        </>
      )}
      {place === 'city' && (
        <>
          {(wide ? [0, 0.17, 0.34, 0.51, 0.68, 0.85] : [-0.04, 0.22, 0.48, 0.74]).map((k, i) => (
            <Shophouse key={i} x={W * k} base={ground} w={W * (wide ? 0.17 : 0.26)} h={(wide ? 420 : 560) * u + (i % 2) * 70 * u} color={['#F2C48D', '#A9D3C7', '#F4A6A0', '#C9B8E8', '#F2D37A', '#A6C8E8'][i]} />
          ))}
          <Ground color="#9E9A96" />
          <div style={{ position: 'absolute', left: 0, right: 0, top: ground + (H - ground) * 0.45, height: 10 * u, background: `repeating-linear-gradient(90deg, #F4F1EA 0 ${60 * u}px, transparent ${60 * u}px ${120 * u}px)` }} />
        </>
      )}
      {!['field', 'village', 'river', 'market', 'city'].includes(place) && <Ground color={green} />}
      {dusk}
    </>
  )
}

/** The place, the camera drifting in slowly. */
function Stage({ place, time, children }) {
  const frame = useCurrentFrame()
  const { durationInFrames, ground, W } = useStage()
  const z = interpolate(frame, [0, durationInFrames], [1, 1.035], clamp)
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: C.cream }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: `${W / 2}px ${ground}px` }}>
        <Place place={place} time={time} />
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** A round bubble with an icon over someone's head. */
export function PopIcon({ x, icon, color, delay = POP_AT, h, beside = false }) {
  const frame = useCurrentFrame()
  const { ground, charH, u, fps } = useStage()
  const s = spring({ frame: frame - delay, fps, config: { damping: 9 } })
  if (!icon) return null
  const size = 130 * u
  const tall = h || charH
  // over the head, a little to the side — or beside the head (where a sign hangs above)
  const top = beside ? ground - tall * 1.02 : ground - tall * 1.18 - size
  return (
    <div style={{ position: 'absolute', left: x - size / 2 + (beside ? 170 : 90) * u, top: top + Math.sin(frame / 9) * 6 * u, width: size, height: size, borderRadius: '50%', background: 'white', border: `${5 * u}px solid ${LINE}`, boxShadow: `${5 * u}px ${6 * u}px 0 ${LINE}`, display: 'grid', placeItems: 'center', transform: `scale(${s})` }}>
      <Icon name={icon} size={size * 0.52} color={color} stroke={2.4} />
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
export const people = (cast) => [0, 1].map((i) => ({ ...DUO[i], ...((cast || [])[i] || {}) }))
export const colorOf = (p) => SHIRTS[p.shirt] || SHIRTS.blue

function Hook({ scene, brand, cast, voiceAt }) {
  const talking = useTalking(scene, voiceAt)
  const { W, H, u, wide, ground, charH } = useStage()
  const duo = people(cast)
  const xs = wide ? [W * 0.38, W * 0.62] : [W * 0.3, W * 0.7]
  const base = brand?.color || '#E0533D'
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Rays a={shade(base, 0.12)} b={shade(base, -0.06)} at={`50% ${(ground / H) * 100 - 8}%`} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 45% at 50% 55%, ${shade(base, 0.45)}AA, transparent 70%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 8 * u, bottom: 0, background: shade(base, -0.28) }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 56 * u : 300 * u, display: 'flex', justifyContent: 'center' }}>
        <Say text={scene.text} size={(wide ? 92 : 118) * u} width={W * (wide ? 0.8 : 0.9)} stroke={LINE} delay={(TITLE_AT + 2) / 30} step={3} />
      </div>
      {duo.map((p, i) => (
        <Person key={i} x={xs[i]} p={p} act={{ pose: i ? 'wave' : 'stand', mood: 'happy' }} item={p.item} brand={brand} seed={i} delay={12 + i * 6} name={p.name} color={colorOf(p)} talking={speaks(scene, i, talking)} />
      ))}
      {/* a few sparkles beside the two (clear of the title) */}
      {[[0.07, 0.95], [0.88, 1.05], [0.47, 0.62]].map(([kx, ky], i) => (
        <div key={i} style={{ position: 'absolute', left: W * kx, top: ground - charH * ky, opacity: interpolate(frame, [18 + i * 4, 26 + i * 4], [0, 1], clamp), transform: `rotate(${frame * 2}deg) scale(${0.8 + 0.2 * Math.sin(frame / 6 + i)})` }}>
          <Icon name="Sparkles" size={(60 + i * 10) * u} color="white" stroke={2.4} />
        </div>
      ))}
    </AbsoluteFill>
  )
}

/** The story moment: who is there, what they do, the thing over a head. */
function Tale({ scene, brand, cast, children, scale = 1, voiceAt }) {
  const talking = useTalking(scene, voiceAt)
  const { W, wide, charH } = useStage()
  const duo = people(cast)
  const who = scene.who ?? 0
  const show = who === 0 ? [0, 1] : [who - 1]
  const xs = spots(W, wide, who, scene.guest)
  const acts = scene.acts || []
  const iconAt = show.length === 1 ? 0 : (scene.iconWho || 1) - 1
  return (
    <Stage place={scene.place} time={scene.time}>
      {show.map((i, k) => (
        <Person key={i} x={xs[who === 0 ? i : k]} p={duo[i]} act={acts[i] || {}} item={(acts[i] || {}).item || 'none'} brand={brand} seed={i} delay={4 + k * 4} name={duo[i].name} color={colorOf(duo[i])} h={charH * scale} talking={speaks(scene, i, talking)} />
      ))}
      {scene.guest && (
        <Person x={xs[2]} p={GUESTS[scene.guest.look] || GUESTS.elder} act={{ pose: scene.guest.pose || 'stand', mood: scene.guest.mood || 'happy' }} item="none" brand={brand} seed={2} delay={10} name={scene.guest.name} color="#1F1A2E" h={charH * scale} />
      )}
      <PopIcon x={xs[who === 0 ? show[iconAt] ?? 0 : 0]} icon={scene.icon} color={brand?.color || C.bad} h={charH * scale} />
      {children}
      <Ribbon text={scene.title} brand={brand} />
    </Stage>
  )
}

/** A number counting up (or down) on a chalkboard over the scene. */
function Tally({ scene, brand, cast, voiceAt }) {
  const frame = useCurrentFrame()
  const { W, u, wide, ground, charH, fps } = useStage()
  const start = Number(scene.start) || 0
  const end = Number(scene.value) || 0
  const k = interpolate(frame, [COUNT_AT, COUNT_AT + COUNT_LEN], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const n = start + (end - start) * k
  const shown = Math.abs(end) < 10 && end !== Math.round(end) ? n.toFixed(1) : Math.round(n).toLocaleString('en-US')
  const s = spring({ frame: frame - 6, fps, config: { damping: 12 } })
  const done = spring({ frame: frame - COUNT_AT - COUNT_LEN, fps, config: { damping: 8 } })
  const w = (wide ? 460 : 560) * u
  const box = wide ? { left: W * 0.83 - w / 2, top: ground - charH * 1.05 } : { left: W / 2 - w / 2, top: 450 * u }
  return (
    <Tale scene={scene} brand={brand} cast={cast} scale={wide ? 1 : 0.86} voiceAt={voiceAt}>
      <div style={{ position: 'absolute', ...box, width: w, transform: `scale(${s}) rotate(${-2 + done * 2}deg)`, transformOrigin: '50% 0%' }}>
        {/* hung on two strings */}
        {[0.2, 0.8].map((x) => <div key={x} style={{ position: 'absolute', left: `${x * 100}%`, top: -60 * u, width: 4 * u, height: 64 * u, background: LINE }} />)}
        <div style={{ position: 'relative', background: C.chalk, border: `${14 * u}px solid ${C.wood}`, outline: `${4 * u}px solid ${LINE}`, borderRadius: 14 * u, padding: `${16 * u}px ${20 * u}px ${20 * u}px`, boxShadow: `${8 * u}px ${10 * u}px 0 rgba(58,42,32,0.35)`, textAlign: 'center' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.label, 34 * u), color: 'rgba(255,255,255,0.78)', letterSpacing: KHMER.test(clean(scene.label)) ? 0 : '0.08em', textTransform: 'uppercase', lineHeight: 1.5 }}>{clean(scene.label)}</div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 120 * u, color: C.gold, lineHeight: 1.05, transform: `scale(${1 + 0.08 * Math.sin(Math.min(1, done) * Math.PI)})` }}>
            {scene.prefix}{shown}{scene.suffix}
          </div>
        </div>
      </div>
    </Tale>
  )
}

/** One path vs the other: a diagonal split, each person on their side. */
function Fork({ scene, brand, cast }) {
  const frame = useCurrentFrame()
  const { W, H, u, wide, ground, charH, fps } = useStage()
  const duo = people(cast)
  const sides = (scene.sides || []).slice(0, 2)
  const cut = interpolate(frame, [SPLIT_AT, SPLIT_AT + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const tones = sides.map((x) => (x.tone === 'good' ? ['#F0B23E', '#E4A22C'] : x.tone === 'bad' ? ['#C9473A', '#B83D31'] : ['#5D86D6', '#4F78C8']))
  const a = 0.58 // the cut: from 58 % across at the top to 42 % at the bottom
  const xs = wide ? [W * 0.27, W * 0.73] : [W * 0.27, W * 0.73]
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {[0, 1].map((i) => (
        <AbsoluteFill key={i} style={{ clipPath: i ? `polygon(${a * 100}% 0, 100% 0, 100% 100%, ${(1 - a) * 100}% 100%)` : `polygon(0 0, ${a * 100}% 0, ${(1 - a) * 100}% 100%, 0 100%)`, transform: `translateX(${(1 - cut) * (i ? 1 : -1) * W * 0.5}px)` }}>
          <Rays a={tones[i]?.[0] || '#999'} b={tones[i]?.[1] || '#888'} at={`${i ? 75 : 25}% 55%`} speed={i ? -0.15 : 0.15} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 6 * u, bottom: 0, background: 'rgba(40,20,10,0.22)' }} />
        </AbsoluteFill>
      ))}
      {/* the cut itself: a white zigzag */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: cut }}>
        <path d={Array.from({ length: 13 }, (_, i) => { const t = i / 12; const x = W * (a - (2 * a - 1) * t) + (i % 2 ? 14 : -14) * u; return `${i ? 'L' : 'M'} ${x} ${H * t}` }).join(' ')} fill="none" stroke="white" strokeWidth={14 * u} strokeLinejoin="round" />
      </svg>
      {sides.map((side, i) => {
        const s = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 11 } })
        const good = side.tone === 'good'
        return (
          <div key={i}>
            <Person x={xs[i]} p={duo[i]} act={{ pose: side.pose, mood: side.mood }} item={side.item || 'none'} brand={brand} seed={i} delay={10 + i * 6} name={duo[i].name} color={colorOf(duo[i])} />
            {/* the path's sign, pointing its own way */}
            <div style={{ position: 'absolute', left: xs[i] - 210 * u, width: 420 * u, top: wide ? 210 * u : 470 * u, display: 'flex', justifyContent: 'center', transform: `scale(${s}) rotate(${i ? 3 : -3}deg)` }}>
              <div style={{ position: 'relative', padding: `${10 * u}px ${(i ? 46 : 34) * u}px ${12 * u}px ${(i ? 34 : 46) * u}px`, background: '#FFF6E6', border: `${5 * u}px solid ${LINE}`, boxShadow: `${6 * u}px ${7 * u}px 0 ${LINE}`, clipPath: i ? 'polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%)' : 'polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 50%)', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(side.label, 66 * u), color: good ? C.good : side.tone === 'bad' ? C.bad : '#2E3F73', lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                {clean(side.label)}
              </div>
            </div>
            <PopIcon x={xs[i]} icon={side.icon} color={good ? C.good : C.bad} delay={34} beside />
          </div>
        )
      })}
      <Ribbon text={scene.title} brand={brand} dark />
    </AbsoluteFill>
  )
}

/** The lesson, written on a palm-leaf manuscript (slek rith) that unrolls. */
function Moral({ scene, brand, cast, voiceAt }) {
  const talking = useTalking(scene, voiceAt)
  const frame = useCurrentFrame()
  const { W, u, wide, ground, charH, fps } = useStage()
  const duo = people(cast)
  const open = spring({ frame: frame - LEAF_AT, fps, config: { damping: 15 } })
  const medal = spring({ frame: frame - LEAF_AT - 22, fps, config: { damping: 9 } })
  const w = W * (wide ? 0.62 : 0.88)
  const top = wide ? 150 * u : 330 * u
  const base = brand?.color || '#E0533D'
  const xs = wide ? [W * 0.12, W * 0.88] : [W * 0.22, W * 0.78]
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.cream }}>
      <Rays a={shade(base, 0.86)} b={shade(base, 0.92)} at="50% 40%" speed={0.08} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 8 * u, bottom: 0, background: shade(base, 0.7) }} />
      <div style={{ position: 'absolute', left: (W - w) / 2, top, width: w, transform: `scaleX(${Math.max(0.02, open)})` }}>
        <div style={{ position: 'relative', background: C.paper, border: `${5 * u}px solid ${LINE}`, borderRadius: 26 * u, padding: `${(wide ? 60 : 80) * u}px ${70 * u}px ${(wide ? 50 : 70) * u}px`, boxShadow: `${8 * u}px ${10 * u}px 0 rgba(58,42,32,0.3)`, backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${46 * u}px, rgba(110,69,35,0.13) ${46 * u}px ${49 * u}px)` }}>
          {/* the string holes of a palm-leaf book */}
          {[0.22, 0.78].map((k) => <div key={k} style={{ position: 'absolute', left: `${k * 100}%`, top: '50%', width: 18 * u, height: 18 * u, marginLeft: -9 * u, marginTop: -9 * u, borderRadius: 9, background: C.woodDark, opacity: 0.55 }} />)}
          <div style={{ opacity: open > 0.9 ? 1 : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * u }}>
            {scene.title && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.title, 40 * u), color: base, letterSpacing: KHMER.test(clean(scene.title)) ? 0 : '0.08em', textTransform: 'uppercase', lineHeight: 1.5 }}>{clean(scene.title)}</div>}
            <Say text={scene.text} size={(wide ? 70 : 86) * u} width={w - 140 * u} color={LINE} accent={base} delay={(LEAF_AT + 14) / 30} step={2} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: -70 * u, marginLeft: -65 * u, width: 130 * u, height: 130 * u, borderRadius: '50%', background: base, border: `${6 * u}px solid ${LINE}`, display: 'grid', placeItems: 'center', transform: `scale(${medal}) rotate(${(1 - medal) * -40}deg)` }}>
          <Icon name={scene.icon || 'Star'} size={68 * u} color="white" stroke={2.4} />
        </div>
      </div>
      {duo.map((p, i) => (
        <Person key={i} x={xs[i]} p={p} act={{ pose: i ? 'proud' : 'cheer', mood: 'happy' }} item="none" brand={brand} seed={i} delay={18 + i * 5} h={charH * (wide ? 0.8 : 0.66)} tag={false} talking={speaks(scene, i, talking)} />
      ))}
    </AbsoluteFill>
  )
}

function Cta({ scene, brand, cast, voiceAt }) {
  const talking = useTalking(scene, voiceAt)
  const frame = useCurrentFrame()
  const { W, u, wide, ground, charH, fps } = useStage()
  const duo = people(cast)
  const base = brand?.color || '#E0533D'
  const b = spring({ frame: frame - BUTTON_AT, fps, config: { damping: 10 } })
  const xs = wide ? [W * 0.14, W * 0.86] : [W * 0.22, W * 0.78]
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Rays a={shade(base, 0.18)} b={shade(base, 0.04)} at="50% 40%" />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 8 * u, bottom: 0, background: shade(base, -0.28) }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 150 * u : 380 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 50 * u }}>
        <Say text={scene.text} size={(wide ? 84 : 92) * u} width={W * (wide ? 0.6 : 0.86)} stroke={LINE} delay={0.15} />
        {scene.button && (
          <div style={{ padding: `${20 * u}px ${60 * u}px`, borderRadius: 999, background: 'white', color: base, fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.button, 54 * u), border: `${5 * u}px solid ${LINE}`, boxShadow: `${7 * u}px ${8 * u}px 0 ${LINE}`, transform: `scale(${b * (1 + Math.sin(frame / 7) * 0.025)}) rotate(-2deg)`, whiteSpace: 'nowrap' }}>{clean(scene.button)}</div>
        )}
      </div>
      {duo.map((p, i) => (
        <Person key={i} x={xs[i]} p={p} act={{ pose: 'wave', mood: 'excited' }} item="none" brand={brand} seed={i} delay={8 + i * 5} tag={false} h={charH * (wide ? 0.8 : 0.7)} talking={speaks(scene, i, talking)} />
      ))}
    </AbsoluteFill>
  )
}

export const PARABLE = {
  scenes: { hook: Hook, tale: Tale, tally: Tally, fork: Fork, moral: Moral, cta: Cta },
  root: { backgroundColor: C.cream },
  light: true, // the logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 128 : 1575),
}
