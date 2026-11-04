/**
 * "Life story · One person" — one person's money / life journey (a salary, a
 * debt paid off month by month, savings growing), told by a narrator: our own
 * person drawn in code (warm skin, black hair, a red-and-white krama round the
 * neck, a mustard shirt) in 1-3 warm Cambodian rooms painted by the image model
 * (props.places — app/images/doodle.py LIFE_STYLE), and the things that carry the
 * story drawn in code too, so their numbers are exactly the story's: a salary
 * envelope, a bill stamped PAID, a wall calendar crossing off its days, a
 * savings jar filling, a phone, a notebook, cash.
 * No painted room (none asked, or the image service out): a flat coded room.
 * Scene types: hook · moment · ledger · takeaway · cta (app/video/motion/ LIFE_TYPES).
 */
import { useId } from 'react'
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf, tint } from './shared'

const INK = '#2B2118' // warm dark brown, never black
const SKIN = '#EFC39A'
const HAIR = '#22160F'
const SHIRT = '#E2A63B'
const PANTS = '#3D3A50'
const WOOD = '#9C6440'
const PAPER = '#FFF7E8'
const RED = '#C8323A' // the krama's check, the PAID stamp
const rad = (d) => (d * Math.PI) / 180
const step = (p, deg, len) => ({ x: p.x + Math.cos(rad(deg)) * len, y: p.y + Math.sin(rad(deg)) * len })

const lum = (hex) => {
  const h = String(hex || '#C8553D').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}
/** The brand colour, or a warm terracotta when it would vanish on the cream paper. */
const accentOf = (brand) => (lum(brand?.color) > 0.82 ? '#C8553D' : brand?.color || '#C8553D')

/** Where things sit, 16:9 and 9:16 — everything above the subtitle band. */
function useSet() {
  const { width: W, height: H } = useVideoConfig()
  const wide = W > H
  return wide
    ? {
        W, H, wide,
        stand: { x: 600, ground: 880, s: 6.2 },
        center: { x: 560, ground: 880, s: 6.2 },
        low: { x: 600, ground: 880, s: 6.2 },
        sit: { x: 520, top: 770, s: 6.4 },
        sitCenter: { x: 520, top: 770, s: 6.4 },
        card: { x: 1060, y: 90, w: 780 },
        bigCard: { x: 1000, y: 230, w: 820 },
        prop: { x: 1100, y: 300, w: 680, h: 540 },
        book: { x: 960, y: 80, w: 860, h: 760 },
      }
    : {
        W, H, wide,
        stand: { x: 290, ground: 1460, s: 7.0 },
        center: { x: 540, ground: 1460, s: 7.0 },
        low: { x: 250, ground: 1460, s: 5.8 }, // under a tall card
        sit: { x: 290, top: 1340, s: 7.0 }, // beside a prop
        sitCenter: { x: 540, top: 1340, s: 7.0 }, // under the ledger
        card: { x: 60, y: 250, w: 960 },
        bigCard: { x: 60, y: 250, w: 960 },
        prop: { x: 500, y: 640, w: 540, h: 560 },
        book: { x: 60, y: 240, w: 960, h: 600 },
      }
}

// ── the person ─────────────────────────────────────────────────────────────
function Limb({ a, b, color = SKIN, w = 4.6 }) {
  return (
    <g strokeLinecap="round">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={w + 2.2} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} />
    </g>
  )
}

// arm poses: [upper arm, forearm] in degrees for the RIGHT arm (screen right; 90 = down); the left is mirrored
const POSES = {
  stand: (f) => ({ r: [80, 95 + Math.sin(f / 30) * 2], l: [80, 95] }),
  walk: (f) => ({ r: [90 + Math.sin(f / 5) * 22, 100 + Math.sin(f / 5) * 18], l: [90 - Math.sin(f / 5) * 22, 100 - Math.sin(f / 5) * 18] }),
  point: (f) => ({ r: [-14, -22 + Math.sin(f / 14) * 3], l: [80, 95] }),
  cheer: (f) => ({ r: [-62, -100 + Math.sin(f / 5) * 8], l: [80, 95] }),
  worry: (f) => ({ r: [-60, -100 + Math.sin(f / 9) * 3], l: [-60, -100 + Math.sin(f / 9) * 3] }),
  count: (f) => ({ r: [100, 160 + Math.sin(f / 6) * 4], l: [100, 160] }),
  phone: (f) => ({ r: [100, -112 + Math.sin(f / 18) * 2], l: [80, 95] }),
  // at a table: the hands on it (drawn over the table)
  sit: (f) => ({ r: [74, 112 + Math.sin(f / 26) * 2], l: [74, 112] }),
  write: (f) => ({ r: [66, 138 + Math.sin(f / 3) * 5], l: [80, 70] }),
}
const SITTING = new Set(['sit', 'write'])

/** Eyes, brows and mouth for a mood (the face's centre is y -79). */
function Face({ mood = 'happy', blink }) {
  const ink = { stroke: INK, strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' }
  const look = mood === 'thinking' ? 1.4 : 0
  const up = mood === 'thinking' ? -1.2 : 0
  let eyes
  if (blink || mood === 'tired') {
    eyes = <g {...ink}><path d="M -9 -80 Q -6.3 -78.6 -3.6 -80" /><path d="M 3.6 -80 Q 6.3 -78.6 9 -80" /></g>
  } else if (mood === 'excited' || mood === 'proud') {
    eyes = <g {...ink} strokeWidth={1.7}><path d="M -9 -79 Q -6.3 -83.4 -3.6 -79" /><path d="M 3.6 -79 Q 6.3 -83.4 9 -79" /></g>
  } else {
    eyes = (
      <g>
        {[-6.3, 6.3].map((x) => (
          <g key={x}>
            <circle cx={x + look} cy={-80 + up} r={2.4} fill={INK} />
            <circle cx={x + look + 0.8} cy={-81 + up} r={0.8} fill="white" />
          </g>
        ))}
      </g>
    )
  }
  const brows = {
    worried: <g {...ink}><path d="M -9.5 -85 L -4 -86.8" /><path d="M 4 -86.8 L 9.5 -85" /></g>,
    sad: <g {...ink}><path d="M -9.5 -85 L -4 -86.8" /><path d="M 4 -86.8 L 9.5 -85" /></g>,
    thinking: <g {...ink}><path d="M -9.5 -86 Q -6.5 -87.5 -4 -86.5" /><path d="M 4 -88.5 Q 6.5 -90 9.5 -88" /></g>,
  }[mood] || null
  const mouth = {
    excited: <path d="M -5.2 -73 Q 0 -73.6 5.2 -73 Q 4.4 -67 0 -66.6 Q -4.4 -67 -5.2 -73 Z" fill="#A8323A" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />,
    sad: <path d="M -4 -70 Q 0 -73 4 -70" {...ink} />,
    worried: <path d="M -4.4 -71 Q -2.2 -72.6 0 -71 Q 2.2 -69.4 4.4 -71" {...ink} />,
    tired: <path d="M -3.6 -71 L 3.6 -71" {...ink} />,
    thinking: <path d="M -2 -71.4 Q 1.6 -72.6 4.2 -71" {...ink} />,
  }[mood] || <path d="M -4.8 -73 Q 0 -68.4 4.8 -73" {...ink} />
  return (
    <g>
      {eyes}
      {brows}
      <ellipse cx={-11} cy={-74.4} rx={2.5} ry={1.4} fill="#E8907E" opacity={0.75} />
      <ellipse cx={11} cy={-74.4} rx={2.5} ry={1.4} fill="#E8907E" opacity={0.75} />
      {mouth}
      {mood === 'tired' && <path d="M 15 -88 q 2 3 0 5 q -2 -2 0 -5 Z" fill="#8EC6E8" stroke={INK} strokeWidth={0.8} />}
    </g>
  )
}

/**
 * Our person, feet at (x, ground), ``s`` px per unit (standing ~100 units tall).
 * Sitting poses draw a wooden table across the frame with its top at body y -31.
 */
function Hero({ x, ground, s, pose = 'stand', mood = 'happy', female = false, enter = 1 }) {
  const frame = useCurrentFrame()
  const id = useId().replace(/:/g, '')
  const blink = frame % 103 > 98
  const sitting = SITTING.has(pose)
  const p = (POSES[pose] || POSES.stand)(frame)
  const bob = pose === 'cheer' ? -Math.abs(Math.sin(frame / 5)) * 2.2 : pose === 'walk' ? -Math.abs(Math.sin(frame / 5)) * 1.2 : Math.sin(frame / 22) * 0.35
  const R = { x: 15.5, y: -53 }
  const L = { x: -15.5, y: -53 }
  const re = step(R, p.r[0], 11)
  const rh = step(re, p.r[1], 11)
  const le = step(L, 180 - p.l[0], 11)
  const lh = step(le, 180 - p.l[1], 11)
  const ink = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round' }
  const box = { l: -60, t: -114, w: 120, h: 118 }
  const swing = pose === 'walk' ? Math.sin(frame / 5) * 14 : 0
  const legs = [
    { hip: { x: -6, y: -30 }, deg: 92 + swing },
    { hip: { x: 6, y: -30 }, deg: 88 - swing },
  ]
  return (
    <div style={{ position: 'absolute', left: x + box.l * s, top: ground + box.t * s, width: box.w * s, height: box.h * s, opacity: Math.min(1, enter * 1.5), transform: `translateY(${(1 - enter) * 24 * s}px)` }}>
      <svg width={box.w * s} height={box.h * s} viewBox={`${box.l} ${box.t} ${box.w} ${box.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <pattern id={`k${id}`} width={3.6} height={3.6} patternUnits="userSpaceOnUse">
            <rect width={3.6} height={3.6} fill="#FFF6EC" />
            <rect width={1.8} height={3.6} fill={RED} opacity={0.85} />
            <rect width={3.6} height={1.8} fill={RED} opacity={0.6} />
          </pattern>
        </defs>
        <g transform={`translate(0 ${bob})`}>
          {!sitting && <ellipse cx={0} cy={-bob} rx={16} ry={2.4} fill="rgba(43,33,24,0.25)" />}
          {!sitting &&
            legs.map(({ hip, deg }, i) => {
              const foot = step(hip, deg, 27)
              return (
                <g key={i}>
                  <Limb a={hip} b={foot} color={PANTS} w={5.6} />
                  <ellipse cx={foot.x + (i ? 2 : -2)} cy={foot.y + 1} rx={5} ry={2.2} fill="#7A4A2C" {...ink} />
                </g>
              )
            })}
          {/* the shirt: mustard, short sleeves */}
          <path d="M -11.5 -62 Q 0 -57.5 11.5 -62 L 20 -54 L 16.5 -48.5 L 13.5 -51 L 14.5 -28 L -14.5 -28 L -13.5 -51 L -16.5 -48.5 L -20 -54 Z" fill={SHIRT} {...ink} strokeWidth={1.6} />
          <line x1={0} y1={-56} x2={0} y2={-29} stroke="rgba(43,33,24,0.25)" strokeWidth={0.8} />
          {/* arms */}
          <Limb a={R} b={re} />
          <Limb a={re} b={rh} />
          <Limb a={L} b={le} />
          <Limb a={le} b={lh} />
          {/* the krama round the neck, one end hanging down the chest */}
          <path d="M -11 -62 Q 0 -55 11 -62 L 9.5 -57.5 Q 0 -51.5 -9.5 -57.5 Z" fill={`url(#k${id})`} {...ink} strokeWidth={1.1} />
          <path d="M -8.5 -57 L -3.5 -55.5 L -4.5 -42 L -9.5 -43 Z" fill={`url(#k${id})`} {...ink} strokeWidth={1.1} />
          {[-8.8, -7.4, -6, -4.6].map((fx) => <line key={fx} x1={fx} y1={-42.6} x2={fx - 0.2} y2={-40.4} stroke={RED} strokeWidth={0.7} />)}
          {/* the head */}
          <g transform={`rotate(${Math.sin(frame / 40) * 2 + (pose === 'write' ? 4 : 0)} 0 -64)`}>
            <rect x={-3.2} y={-66} width={6.4} height={6} fill={SKIN} {...ink} strokeWidth={1.1} />
            {female && <circle cx={0} cy={-99.5} r={7} fill={HAIR} {...ink} />}
            <circle cx={-17.6} cy={-78} r={3.2} fill={SKIN} {...ink} />
            <circle cx={17.6} cy={-78} r={3.2} fill={SKIN} {...ink} />
            <circle cx={0} cy={-79} r={17.6} fill={SKIN} {...ink} strokeWidth={1.7} />
            {female ? (
              // hair tied back in a bun, a soft fringe
              <path d="M -18 -78 Q -19.5 -98 0 -98 Q 19.5 -98 18 -78 Q 16 -88.5 6 -90 Q -2 -86.5 -9 -90 Q -15.5 -87 -18 -78 Z" fill={HAIR} {...ink} />
            ) : (
              // short hair with a side part
              <path d="M -17.6 -80 Q -18.4 -98.5 0 -98.4 Q 18 -98.4 17.8 -82 Q 13 -92 2 -91 L -1 -92.5 Q -9 -91 -13 -88 Q -16 -85 -17.6 -80 Z" fill={HAIR} {...ink} />
            )}
            <Face mood={mood} blink={blink} />
          </g>
          {sitting && (
            <g>
              {/* the table across the frame: warm wood, a lit edge, grain */}
              <rect x={-420} y={-31} width={840} height={70} fill={WOOD} />
              <rect x={-420} y={-31} width={840} height={2.4} fill="#C48A5C" />
              <rect x={-420} y={-22} width={840} height={1.2} fill="rgba(0,0,0,0.12)" />
              {[-140, -80, -26, 34, 96, 150].map((gx, i) => <path key={i} d={`M ${gx} ${-16 + (i % 3) * 6} q 24 -1.6 48 0`} stroke="rgba(0,0,0,0.14)" strokeWidth={0.9} fill="none" />)}
              {pose === 'write' && (
                <g>
                  {/* the notebook on the table and the pen */}
                  <path d="M 2 -31.5 L 30 -31.5 L 33 -34.5 L 5 -34.5 Z" fill="#FFFDF5" {...ink} strokeWidth={1} />
                  <line x1={rh.x} y1={rh.y} x2={rh.x + 3} y2={rh.y - 7} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
                </g>
              )}
            </g>
          )}
          {pose === 'count' && (
            // a fan of banknotes in both hands
            <g transform={`translate(0 ${-36})`}>
              {[-22, -8, 6].map((a, i) => (
                <g key={a} transform={`rotate(${a + Math.sin(frame / 6 + i) * 2})`}>
                  <rect x={-4.5} y={-16} width={9} height={16} rx={1} fill="#86B97C" {...ink} strokeWidth={0.9} />
                  <circle cx={0} cy={-8} r={2} fill="none" stroke="#3F6E3A" strokeWidth={0.8} />
                </g>
              ))}
            </g>
          )}
          {pose === 'phone' && <rect x={rh.x - 3.4} y={rh.y - 9} width={6.8} height={11} rx={1.4} fill="#2E2E36" {...ink} strokeWidth={1} />}
          {[rh, lh].map((h, i) => (pose === 'cheer' && i === 0 ? <circle key={i} cx={h.x} cy={h.y} r={4.4} fill={SKIN} {...ink} /> : <circle key={i} cx={h.x} cy={h.y} r={3.5} fill={SKIN} {...ink} />))}
        </g>
      </svg>
    </div>
  )
}

/** The person where the scene puts them: standing, or at the table. */
function Person({ scene, host, place = 'stand', enterAt = 2 }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const pose = POSES[scene.pose] ? scene.pose : 'stand'
  const enter = spring({ frame: frame - enterAt, fps: 30, config: { damping: 15 } })
  const female = host?.female === true
  if (SITTING.has(pose)) {
    const at = place === 'center' ? set.sitCenter : set.sit
    return <Hero x={at.x} ground={at.top + 31 * at.s} s={at.s} pose={pose} mood={scene.mood} female={female} />
  }
  const at = set[place] || set.stand
  return <Hero x={at.x} ground={at.ground} s={at.s} pose={pose} mood={scene.mood} female={female} enter={enter} />
}

// ── the rooms ──────────────────────────────────────────────────────────────
/** A flat warm room when no painted one came (three colourings, by place). */
function CodedRoom({ n = 1 }) {
  const { width: W, height: H } = useVideoConfig()
  const tone = [
    { wall: '#F3E2C4', band: '#D9774A', floor: '#B97A4E', sky: '#F4B35E' },
    { wall: '#E7D7B6', band: '#7E9B6E', floor: '#A9714A', sky: '#9CCBE0' },
    { wall: '#F1D9C2', band: '#C8553D', floor: '#8E5B3C', sky: '#F2C46D' },
  ][(n - 1) % 3]
  const floorY = H * (W > H ? 0.74 : 0.7)
  const winW = W > H ? 380 : 340
  const winX = W > H ? W * 0.12 : W * 0.52
  return (
    <AbsoluteFill style={{ backgroundColor: tone.wall }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        <rect x={0} y={floorY - 150} width={W} height={150} fill={tone.band} opacity={0.9} />
        <rect x={0} y={floorY - 154} width={W} height={8} fill="#FFF3DD" opacity={0.7} />
        {/* the window: a flat evening sky and a low sun */}
        <rect x={winX} y={H * 0.12} width={winW} height={winW * 0.95} rx={10} fill={tone.sky} stroke={INK} strokeWidth={8} />
        <circle cx={winX + winW * 0.66} cy={H * 0.12 + winW * 0.62} r={winW * 0.13} fill="#FFE7AE" />
        <line x1={winX + winW / 2} y1={H * 0.12} x2={winX + winW / 2} y2={H * 0.12 + winW * 0.95} stroke={INK} strokeWidth={7} />
        <line x1={winX} y1={H * 0.12 + winW * 0.47} x2={winX + winW} y2={H * 0.12 + winW * 0.47} stroke={INK} strokeWidth={7} />
        <rect x={winX - 20} y={H * 0.12 + winW * 0.95} width={winW + 40} height={18} rx={6} fill="#8E5B3C" stroke={INK} strokeWidth={5} />
        {/* a plant on the sill */}
        <rect x={winX + 26} y={H * 0.12 + winW * 0.95 - 50} width={44} height={50} rx={6} fill="#C8553D" stroke={INK} strokeWidth={5} />
        <path d={`M ${winX + 48} ${H * 0.12 + winW * 0.95 - 50} q -30 -40 -10 -80 q 14 30 10 80 q 18 -50 40 -60 q -6 40 -40 60`} fill="#6E9A5E" stroke={INK} strokeWidth={4} />
        <rect x={0} y={floorY} width={W} height={H - floorY} fill={tone.floor} />
        {[0, 1, 2, 3].map((i) => <line key={i} x1={0} y1={floorY + 40 + i * 70} x2={W} y2={floorY + 40 + i * 70} stroke="rgba(0,0,0,0.12)" strokeWidth={4} />)}
      </svg>
    </AbsoluteFill>
  )
}

/** The painted room for place n (1-3), slowly pushing in — else the coded one. */
function Room({ places, n = 1 }) {
  const frame = useCurrentFrame()
  const src = (places || [])[n - 1] || (places || [])[0]
  if (!src) return <CodedRoom n={n} />
  return (
    <AbsoluteFill style={{ backgroundColor: '#3A2A1E', overflow: 'hidden' }}>
      <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.03 + frame * 0.0005})` }} />
    </AbsoluteFill>
  )
}

function Stage({ brand, places, n = 1, children }) {
  const accent = accentOf(brand)
  return (
    <AbsoluteFill style={{ backgroundColor: '#3A2A1E', '--hl-bg': accent, '--hl-text': lum(accent) > 0.6 ? INK : '#FFFFFF' }}>
      <Room places={places} n={n} />
      {children}
    </AbsoluteFill>
  )
}

/** A cream paper card with a warm ink edge and a hard shadow. */
function Card({ at, delay = 6, children, style }) {
  const frame = useCurrentFrame()
  const k = spring({ frame: frame - delay, fps: 30, config: { damping: 13 } })
  return (
    <div style={{ position: 'absolute', left: at.x, top: at.y, width: at.w, maxHeight: at.h, background: PAPER, border: `5px solid ${INK}`, borderRadius: 28, boxShadow: `9px 11px 0 ${INK}`, padding: '30px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20, opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * 36}px) rotate(${(1 - k) * -1.5}deg)`, ...style }}>
      {children}
    </div>
  )
}

const Amount = ({ text, size, color = INK, style }) => (
  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(text, size), color, lineHeight: 1.25, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', ...style }}>{clean(text)}</div>
)

// ── the props: the story's own numbers, drawn in code ──────────────────────
// Each is laid out on a 600 × 500 board and scaled to the box the scene gives it.
const PAID_AT = 30
const crossAt = (i, done) => 14 + i * Math.min(4, 40 / Math.max(1, done))
const COIN_AT = [12, 20, 28, 36]
const LINE_AT = (i) => 16 + i * 14

function Envelope({ prop, accent }) {
  const frame = useCurrentFrame()
  const open = interpolate(frame, [10, 22], [1, -1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pop = spring({ frame: frame - 22, fps: 30, config: { damping: 11 } })
  // the flap: over the front while closed, behind the letter once open
  const flap = (
    <svg width={520} height={300} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <g transform={`translate(0 3) scale(1 ${open})`}>
        <path d="M 4 0 L 260 160 L 516 0 Z" fill="#EFD4A6" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      </g>
    </svg>
  )
  return (
    <div style={{ position: 'absolute', left: 40, top: 180, width: 520, height: 300 }}>
      {open < 0 && flap}
      {/* the letter rising out */}
      <div style={{ position: 'absolute', left: 40, right: 40, top: 30 - pop * 190, height: 200, background: '#FFFFFF', border: `4px solid ${INK}`, borderRadius: 10, display: 'grid', alignItems: 'start', justifyItems: 'center', paddingTop: 22, boxSizing: 'border-box', opacity: Math.min(1, pop * 2) }}>
        {prop.amount && <Amount text={prop.amount} size={92} style={{ transform: `scale(${0.7 + pop * 0.3})` }} />}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#F6E2BC', border: `5px solid ${INK}`, borderRadius: 14 }} />
      <svg width={520} height={300} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d="M 4 294 L 260 140 L 516 294" fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      </svg>
      {open >= 0 && flap}
      {prop.label && (
        <div style={{ position: 'absolute', left: 30, bottom: 28, padding: '6px 18px', border: `4px solid ${accent}`, color: accent, borderRadius: 8, fontFamily: FONT, fontWeight: 800, fontSize: 40, transform: 'rotate(-6deg)', background: 'rgba(255,255,255,0.5)' }}>{clean(prop.label)}</div>
      )}
    </div>
  )
}

function Bill({ prop }) {
  const frame = useCurrentFrame()
  const stamp = spring({ frame: frame - PAID_AT, fps: 30, config: { damping: 12, mass: 0.7 } })
  return (
    <div style={{ position: 'absolute', left: 110, top: 10, width: 380, height: 480, background: '#FFFDF7', border: `5px solid ${INK}`, borderRadius: 12, padding: '30px 34px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: `8px 9px 0 rgba(43,33,24,0.85)` }}>
      {prop.label && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(prop.label, 46), color: INK, lineHeight: 1.3 }}>{clean(prop.label)}</div>}
      {[0.9, 0.7, 0.8, 0.55].map((w, i) => <div key={i} style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, background: 'rgba(43,33,24,0.16)' }} />)}
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `3px dashed rgba(43,33,24,0.35)`, paddingTop: 14 }}>{prop.amount && <Amount text={prop.amount} size={84} />}</div>
      {prop.paid && (
        <div style={{ position: 'absolute', left: 40, top: 150, padding: '4px 26px', border: `9px solid ${RED}`, borderRadius: 14, color: RED, fontFamily: "'CFLatin', sans-serif", fontWeight: 900, fontSize: 104, letterSpacing: '0.04em', opacity: Math.min(1, stamp * 2) * 0.88, transform: `rotate(-16deg) scale(${2.2 - 1.2 * stamp})`, mixBlendMode: 'multiply' }}>PAID</div>
      )}
    </div>
  )
}

function Calendar({ prop, accent }) {
  const frame = useCurrentFrame()
  const done = Math.max(0, Math.min(31, prop.done ?? 10))
  return (
    <div style={{ position: 'absolute', left: 50, top: 10, width: 500, height: 480, background: '#FFFDF7', border: `5px solid ${INK}`, borderRadius: 14, overflow: 'hidden', boxShadow: `8px 9px 0 rgba(43,33,24,0.85)` }}>
      <div style={{ height: 104, background: accent, borderBottom: `5px solid ${INK}`, display: 'grid', placeItems: 'center', color: lum(accent) > 0.6 ? INK : '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(prop.label || '', 50), lineHeight: 1.3 }}>{clean(prop.label)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, padding: 14 }}>
        {Array.from({ length: 35 }).map((_, i) => {
          const k = interpolate(frame, [crossAt(i, done), crossAt(i, done) + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          return (
            <div key={i} style={{ height: 70, border: '2px solid rgba(43,33,24,0.2)', margin: -1, position: 'relative' }}>
              {i < done && (
                <svg width="100%" height="100%" viewBox="0 0 10 10" style={{ position: 'absolute', inset: 0 }}>
                  <path d="M 2 2 L 8 8" stroke={INK} strokeWidth={1.1} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, k * 2)} />
                  <path d="M 8 2 L 2 8" stroke={INK} strokeWidth={1.1} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0, k * 2 - 1)} />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Jar({ prop, accent }) {
  const frame = useCurrentFrame()
  const level = interpolate(frame, [10, 44], [0.08, 0.72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const coins = Math.round(level * 26)
  return (
    <div style={{ position: 'absolute', left: 120, top: 0, width: 360, height: 500 }}>
      <svg width={360} height={500} viewBox="0 0 360 500" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <rect x={70} y={20} width={220} height={52} rx={12} fill="#B8874F" stroke={INK} strokeWidth={6} />
        <path d="M 60 80 Q 40 110 40 170 L 40 430 Q 40 480 90 480 L 270 480 Q 320 480 320 430 L 320 170 Q 320 110 300 80 Z" fill="rgba(220,238,240,0.55)" stroke={INK} strokeWidth={6} />
        {Array.from({ length: coins }).map((_, i) => {
          const row = Math.floor(i / 5)
          const col = i % 5
          return <ellipse key={i} cx={88 + col * 46 + (row % 2) * 20} cy={452 - row * 30} rx={24} ry={12} fill="#E8B83E" stroke={INK} strokeWidth={4} />
        })}
        <path d="M 70 130 Q 62 200 66 300" stroke="rgba(255,255,255,0.8)" strokeWidth={10} fill="none" strokeLinecap="round" />
      </svg>
      {(prop.label || prop.amount) && (
        <div style={{ position: 'absolute', left: 70, right: 70, top: 150, background: PAPER, border: `4px solid ${INK}`, borderRadius: 12, padding: '10px 14px', textAlign: 'center', transform: 'rotate(-3deg)' }}>
          {prop.label && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: accent, lineHeight: 1.3 }}>{clean(prop.label)}</div>}
          {prop.amount && <Amount text={prop.amount} size={60} />}
        </div>
      )}
    </div>
  )
}

function Phone({ prop, accent }) {
  const frame = useCurrentFrame()
  const pop = spring({ frame: frame - 16, fps: 30, config: { damping: 12 } })
  const ok = spring({ frame: frame - 30, fps: 30, config: { damping: 9 } })
  return (
    <div style={{ position: 'absolute', left: 160, top: 0, width: 280, height: 500, background: '#2E2E36', border: `5px solid ${INK}`, borderRadius: 42, padding: 14, boxSizing: 'border-box', boxShadow: `8px 9px 0 rgba(43,33,24,0.85)` }}>
      <div style={{ width: '100%', height: '100%', background: '#FFFFFF', borderRadius: 30, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ alignSelf: 'stretch', height: 76, background: accent }} />
        {prop.label && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(prop.label, 34), color: '#6B5E52', textAlign: 'center', padding: '0 14px', lineHeight: 1.3 }}>{clean(prop.label)}</div>}
        {prop.amount && <Amount text={prop.amount} size={58} style={{ transform: `scale(${pop})`, textAlign: 'center' }} />}
        <div style={{ width: 92, height: 92, borderRadius: 46, background: '#3E9B5C', border: `4px solid ${INK}`, display: 'grid', placeItems: 'center', transform: `scale(${ok})`, marginTop: 12 }}>
          <Icon name="Check" size={54} color="#FFFFFF" stroke={3.4} />
        </div>
      </div>
    </div>
  )
}

function Notebook({ prop, accent }) {
  const frame = useCurrentFrame()
  const lines = (prop.lines || []).slice(0, 3)
  return (
    <div style={{ position: 'absolute', left: 40, top: 20, width: 520, height: 460, background: '#FFFDF5', border: `5px solid ${INK}`, borderRadius: 12, padding: '34px 40px 26px 64px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: `8px 9px 0 rgba(43,33,24,0.85)`, backgroundImage: 'linear-gradient(rgba(70,120,170,0.18) 2px, transparent 2px)', backgroundSize: '100% 62px', backgroundPosition: '0 30px' }}>
      <div style={{ position: 'absolute', left: 14, top: 26, bottom: 26, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {Array.from({ length: 7 }).map((_, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: 11, border: `4px solid ${INK}`, background: '#E9DFCF' }} />)}
      </div>
      {prop.label && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(prop.label, 44), color: accent, lineHeight: 1.3 }}>{clean(prop.label)}</div>}
      {lines.map((x, i) => {
        const k = interpolate(frame, [LINE_AT(i), LINE_AT(i) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontFamily: FONT, fontWeight: 700, fontSize: 38, color: INK, lineHeight: 1.35, clipPath: `inset(0 ${(1 - k) * 100}% 0 0)` }}>
            <span>{clean(x.text)}</span>
            {x.amount && <span style={{ fontWeight: 800 }}>{clean(x.amount)}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Cash({ prop, accent }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: 500 }}>
      {[-16, -6, 4, 14].map((a, i) => {
        const k = spring({ frame: frame - 8 - i * 5, fps: 30, config: { damping: 12 } })
        return (
          <div key={a} style={{ position: 'absolute', left: 130, top: 170, width: 340, height: 170, background: '#8BBF80', border: `5px solid ${INK}`, borderRadius: 12, transform: `rotate(${a * k}deg) translateY(${(1 - k) * 120}px)`, transformOrigin: '50% 120%', opacity: Math.min(1, k * 2), display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 84, height: 84, borderRadius: 42, border: '5px solid #3F6E3A' }} />
          </div>
        )
      })}
      {(prop.amount || prop.label) && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 40, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ background: PAPER, border: `5px solid ${INK}`, borderRadius: 16, padding: '8px 30px', textAlign: 'center' }}>
            {prop.label && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: accent, lineHeight: 1.3 }}>{clean(prop.label)}</div>}
            {prop.amount && <Amount text={prop.amount} size={70} />}
          </div>
        </div>
      )}
    </div>
  )
}

const PROPS = { envelope: Envelope, bill: Bill, calendar: Calendar, jar: Jar, phone: Phone, notebook: Notebook, cash: Cash }

function Prop({ prop, brand, at }) {
  const frame = useCurrentFrame()
  const P = PROPS[prop?.kind]
  if (!P) return null
  const k = spring({ frame: frame - 6, fps: 30, config: { damping: 13 } })
  const scale = Math.min(at.w / 600, at.h / 500)
  return (
    <div style={{ position: 'absolute', left: at.x + (at.w - 600 * scale) / 2, top: at.y + (at.h - 500 * scale) / 2, width: 600, height: 500, transform: `scale(${scale * (0.85 + 0.15 * k)})`, transformOrigin: '0 0', opacity: Math.min(1, k * 1.6) }}>
      <P prop={prop} accent={accentOf(brand)} />
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
/** The question / title, the person in their first place (their name over their head). */
function Hook({ scene, brand, host, places }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const at = set.center
  const tag = spring({ frame: frame - 18, fps: 30, config: { damping: 12 } })
  const wide = set.wide
  return (
    <Stage brand={brand} places={places} n={1}>
      <Person scene={{ ...scene, pose: scene.mood === 'worried' ? 'worry' : 'stand' }} host={host} place="center" />
      {host?.name && (
        // their name beside the head, like a label
        <div style={{ position: 'absolute', left: at.x + 24 * at.s, top: at.ground - 96 * at.s, transform: `scale(${tag})`, transformOrigin: '0% 100%' }}>
          <div style={{ background: accentOf(brand), color: lum(accentOf(brand)) > 0.6 ? INK : '#FFFFFF', border: `4px solid ${INK}`, borderRadius: 999, padding: '4px 26px', fontFamily: FONT, fontWeight: 800, fontSize: 40, lineHeight: 1.4, whiteSpace: 'nowrap' }}>{clean(host.name)}</div>
        </div>
      )}
      <Card at={set.bigCard} delay={8}>
        {scene.icon && (
          <div style={{ width: 84, height: 84, borderRadius: 24, background: tint(accentOf(brand), 0.16), border: `4px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
            <Icon name={scene.icon} size={48} color={accentOf(brand)} stroke={2.4} />
          </div>
        )}
        <Words text={scene.text} delay={14} color={INK} style={{ fontSize: fitSize(scene.text, wide ? 72 : 78), fontWeight: 800, lineHeight: 1.4 }} />
      </Card>
    </Stage>
  )
}

/** A moment of the story: the person in a place, the caption, the thing that shows it. */
function Moment({ scene, brand, host, places }) {
  const set = useSet()
  const prop = scene.prop && PROPS[scene.prop.kind] ? scene.prop : null
  // no prop: the caption sits where the prop would, a little larger
  const card = prop ? set.card : set.wide ? set.bigCard : set.card
  return (
    <Stage brand={brand} places={places} n={scene.place || 1}>
      <Person scene={scene} host={host} place={prop || set.wide ? 'stand' : 'center'} />
      {prop && <Prop prop={prop} brand={brand} at={set.prop} />}
      {scene.text && (
        <Card at={card} delay={prop ? 4 : 8} style={prop && set.wide ? { padding: '22px 34px' } : undefined}>
          <Words text={scene.text} delay={8} color={INK} style={{ fontSize: fitSize(scene.text, prop ? (set.wide ? 52 : 60) : set.wide ? 66 : 70), fontWeight: 800, lineHeight: 1.4 }} />
        </Card>
      )}
    </Stage>
  )
}

/** Writing it all down: the person at the table, a notebook page of money in and out. */
function Ledger({ scene, brand, host, places }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const lines = (scene.lines || []).slice(0, 5)
  const accent = accentOf(brand)
  const totalAt = LINE_AT(lines.length) + 6
  const t = spring({ frame: frame - totalAt, fps: 30, config: { damping: 12 } })
  const size = set.wide ? 44 : lines.length > 4 ? 38 : 42
  return (
    <Stage brand={brand} places={places} n={scene.place || 1}>
      <Person scene={{ ...scene, pose: 'write', mood: scene.mood || 'thinking' }} host={host} place="center" />
      <Card at={set.book} delay={4} style={{ backgroundImage: 'linear-gradient(rgba(70,120,170,0.16) 2px, transparent 2px)', backgroundSize: `100% ${Math.round(size * 1.9)}px`, gap: set.wide ? 14 : 10 }}>
        {scene.title && <Words text={scene.title} delay={6} color={accent} style={{ fontSize: fitSize(scene.title, set.wide ? 58 : 56), fontWeight: 800, lineHeight: 1.35 }} />}
        {lines.map((x, i) => {
          const k = interpolate(frame, [LINE_AT(i), LINE_AT(i) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, fontFamily: FONT, fontSize: size, color: INK, lineHeight: 1.45, clipPath: `inset(0 ${(1 - k) * 100}% 0 0)` }}>
              <span style={{ fontWeight: 600 }}>{clean(x.label)}</span>
              {x.amount && <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{clean(x.amount)}</span>}
            </div>
          )
        })}
        {scene.total && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, borderTop: `5px double ${INK}`, paddingTop: 10, fontFamily: FONT, fontSize: size * 1.12, fontWeight: 800, color: INK, lineHeight: 1.45, opacity: Math.min(1, t * 1.5), transform: `scale(${0.9 + 0.1 * t})`, transformOrigin: '0 50%' }}>
            <span>{clean(scene.total.label)}</span>
            <span style={{ color: accent, whiteSpace: 'nowrap' }}>{clean(scene.total.amount)}</span>
          </div>
        )}
      </Card>
    </Stage>
  )
}

const CHECK_AT = (i) => 18 + i * 18
/** The lesson: the person points to a note of 1-3 things to remember. */
function Takeaway({ scene, brand, host, places }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const accent = accentOf(brand)
  const checks = (scene.checks || []).slice(0, 3)
  return (
    <Stage brand={brand} places={places} n={1}>
      <Person scene={{ ...scene, pose: 'point', mood: scene.mood || 'proud' }} host={host} place="low" />
      <Card at={set.wide ? set.bigCard : set.card} delay={4} style={{ gap: 22 }}>
        {scene.title && <Words text={scene.title} delay={6} color={INK} style={{ fontSize: fitSize(scene.title, set.wide ? 62 : 66), fontWeight: 800, lineHeight: 1.35 }} />}
        {checks.map((c, i) => {
          const k = spring({ frame: frame - CHECK_AT(i), fps: 30, config: { damping: 13 } })
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, opacity: Math.min(1, k * 1.5), transform: `translateX(${(1 - k) * 40}px)` }}>
              <div style={{ flex: 'none', width: 58, height: 58, borderRadius: 18, background: accent, border: `4px solid ${INK}`, display: 'grid', placeItems: 'center', marginTop: 4 }}>
                <Icon name="Check" size={34} color={lum(accent) > 0.6 ? INK : '#FFFFFF'} stroke={3} />
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(c, set.wide ? 44 : 46), color: INK, lineHeight: 1.4 }}>{clean(c)}</div>
            </div>
          )
        })}
      </Card>
    </Stage>
  )
}

const CTA_BUTTON = 26
function Cta({ scene, brand, host, places }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const accent = accentOf(brand)
  const b = spring({ frame: frame - CTA_BUTTON, fps: 30, config: { damping: 10 } })
  return (
    <Stage brand={brand} places={places} n={1}>
      <Person scene={{ ...scene, pose: 'cheer', mood: 'excited' }} host={host} place="center" />
      <Card at={set.bigCard} delay={4} style={{ alignItems: 'center', textAlign: 'center' }}>
        {brand.logo && <Img src={srcOf(brand.logo)} style={{ height: set.wide ? 86 : 96, maxWidth: 380, objectFit: 'contain' }} />}
        <Words text={scene.text} delay={8} align="center" color={INK} style={{ fontSize: fitSize(scene.text, set.wide ? 60 : 66), fontWeight: 800, lineHeight: 1.4, justifyContent: 'center' }} />
        {scene.button && (
          <div style={{ padding: '16px 50px', borderRadius: 999, background: accent, color: lum(accent) > 0.6 ? INK : '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `6px 7px 0 ${INK}`, fontFamily: FONT, fontWeight: 800, fontSize: set.wide ? 42 : 48, opacity: Math.min(1, b * 1.5), transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.025)})` }}>{clean(scene.button)}</div>
        )}
      </Card>
    </Stage>
  )
}

/** [frame, sound] for a scene — the frames above (sfx.jsx). */
export function lifestoryCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[8, 'pop'], [18, 'pop']]
    case 'moment': {
      const p = scene.prop || {}
      const cues = [[6, 'pop']]
      if (p.kind === 'envelope') cues.push([10, 'page'], [22, 'cash'])
      if (p.kind === 'bill') cues.push([8, 'page'], ...(p.paid ? [[PAID_AT, 'impact']] : []))
      if (p.kind === 'calendar') Array.from({ length: Math.min(8, p.done ?? 10) }).forEach((_, i) => cues.push([crossAt(i, p.done ?? 10), 'tick']))
      if (p.kind === 'jar') COIN_AT.forEach((at) => cues.push([at, 'coin']))
      if (p.kind === 'phone') cues.push([16, 'notify'], [30, 'ding'])
      if (p.kind === 'notebook') (p.lines || []).slice(0, 3).forEach((_, i) => cues.push([LINE_AT(i), 'sketch']))
      if (p.kind === 'cash') cues.push([14, 'cash'])
      return cues
    }
    case 'ledger': {
      const lines = (scene.lines || []).slice(0, 5)
      return [[4, 'page'], ...lines.map((_, i) => [LINE_AT(i), 'sketch']), ...(scene.total ? [[LINE_AT(lines.length) + 6, 'ding']] : [])]
    }
    case 'takeaway':
      return (scene.checks || []).slice(0, 3).map((_, i) => [CHECK_AT(i), 'pop'])
    case 'cta':
      return scene.button ? [[4, 'pop'], [CTA_BUTTON, 'pop']] : [[4, 'pop']]
    default:
      return [[6, 'pop']]
  }
}

export const LIFESTORY = {
  scenes: { hook: Hook, moment: Moment, ledger: Ledger, takeaway: Takeaway, cta: Cta },
  root: { backgroundColor: '#3A2A1E' },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 150 : 1660),
}
