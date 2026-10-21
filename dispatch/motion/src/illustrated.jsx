/**
 * "Illustrated · Everyday Cambodia" — a calm documentary-style story in a muted,
 * hand-drawn look: warm faded colours, thin warm outlines, paper grain over it
 * all. Our own drawings of everyday Cambodia — a phsar with scalloped stall
 * awnings (fish, rice, baskets, hanging lamps) before a row of shophouses with
 * sugar palms and power lines, a street with motos and a tuk-tuk, a bank front
 * with an ATM, a home, rice fields with a stilt house. Tall slim people in
 * collared shirts, sarongs, straw hats and kramas; the story's main person
 * walks through it, and close-ups show their face beside the thing that
 * matters (an ATM, a phone, money, a paper, a stall, a laptop).
 *
 * The world is a 2400 × 1080 panorama the camera pans across; a tall frame
 * shows a band of it with sky above and ground below. Scenes (app/motion.py
 * ILLUSTRATED_TYPES): hook · wide · closeup · fact · cta. props.cast = [the
 * main person] (app/motion.py clean_lead). 9:16 and 16:9.
 */
import { useMemo } from 'react'
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, clean, fitSize } from './shared'
import { Pop } from './cartoon'

const INK = '#5A4636' // the thin warm outline
const P = {
  cream: '#EFE6D2', sand: '#E2D3B4', ground: '#D9C7A3', road: '#BDB4A3', teal: '#4E8C8A', rust: '#C0603A', mustard: '#D8A845',
  navy: '#2E3F5C', sky: '#E9E2D0', shirt: '#A9C6E0', wood: '#9C7A55', woodDark: '#7A5C3E', palm: '#5E8A63', plum: '#7B4E7E', beige: '#E8DCC2',
}
const SKINS = { light: '#E3B48F', tan: '#C98E5F', brown: '#A86E46', deep: '#7E5032' }
const SHIRTS = { blue: '#A9C6E0', white: '#F2EEE4', yellow: '#E7C76A', teal: '#7FB0AC', rust: '#D58A66', green: '#9DBB8A', pink: '#E3A9B0', navy: '#4A5E80' }
const BOTTOMS = { pants: '#2E3F5C', khaki: '#A88F68', sarong: '#7B4E7E', skirt: '#4E6E8A' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const WORLD = { w: 2400, h: 1080, ground: 900 }

// sound cue frames (sfx.jsx illustratedCues) — the animations below use the same
const CARD_AT = 8
const COUNT_AT = 14
const COUNT_LEN = 45
const BUTTON_AT = 26

export function illustratedCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[CARD_AT + 4, 'pop']]
    case 'closeup':
      return scene.text ? [[CARD_AT + 10, 'pop']] : []
    case 'fact':
      return scene.value ? [[CARD_AT, 'pop'], [COUNT_AT + COUNT_LEN, 'ding']] : [[CARD_AT, 'pop']]
    case 'cta':
      return scene.button ? [[CARD_AT, 'pop'], [BUTTON_AT, 'pop']] : [[CARD_AT, 'pop']]
    default:
      return scene.title ? [[CARD_AT + 6, 'pop']] : []
  }
}

function useStage() {
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  // how the panorama sits in the frame: a wide frame shows its full height; a tall one a band
  const band = wide ? { top: 0, h: H } : { top: 330 * u, h: 1220 * u }
  const s = band.h / WORLD.h
  const viewW = W / s // world units across the frame
  return { W, H, fps, durationInFrames, wide, u, band, s, viewW }
}

// ── paper grain: a small noise tile, made once ─────────────────────────────
let grainUrl = null
function grain() {
  if (grainUrl) return grainUrl
  const c = document.createElement('canvas')
  c.width = c.height = 160
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(160, 160)
  for (let i = 0; i < 160 * 160; i++) {
    const v = Math.floor(random(`grain-${i}`) * 255)
    img.data.set([v, v, v, 22], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  grainUrl = c.toDataURL()
  return grainUrl
}

/** The faded, papery finish over every scene. */
function Finish() {
  const url = useMemo(() => grain(), [])
  return (
    <>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(255,246,225,0.28), transparent 70%)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ backgroundImage: `url(${url})`, mixBlendMode: 'multiply', opacity: 0.55, pointerEvents: 'none' }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(90,70,54,0.28)', pointerEvents: 'none' }} />
    </>
  )
}

// ── people ─────────────────────────────────────────────────────────────────
/**
 * A tall slim person, feet at (x, y) in world units, ``h`` tall. ``p``: who
 * (gender, skin, hair, shirt, bottom, hat); ``walk``: legs moving; ``pose``:
 * stand | walk | carry | phone | talk | point; ``item``: what the near hand holds.
 */
function Person({ x, y = WORLD.ground, h = 400, p = {}, walk = false, pose = 'stand', item = 'none', face = 1, seed = 0 }) {
  const frame = useCurrentFrame()
  const s = h / 100
  const skin = SKINS[p.skin] || SKINS.tan
  const shirt = SHIRTS[p.shirt] || SHIRTS.blue
  const bottom = BOTTOMS[p.bottom] || (p.gender === 'female' ? BOTTOMS.sarong : BOTTOMS.pants)
  const wrap = p.bottom === 'sarong' || p.bottom === 'skirt' || (!p.bottom && p.gender === 'female')
  const step = walk ? Math.sin(frame / 4 + seed) : 0
  const bob = walk ? -Math.abs(Math.cos(frame / 4 + seed)) * 1 : 0
  const ink = { stroke: INK, strokeWidth: 0.55, strokeLinejoin: 'round', strokeLinecap: 'round' }
  // arms: [upper-arm angle, forearm angle] from straight down; + swings forward (towards where they face)
  const arms = {
    stand: [[4, 8], [-4, -8]],
    walk: [[18 * step, 22 * step + 10], [-18 * step, -22 * step + 10]],
    carry: [[6, 20], [-4, -8]],
    phone: [[-10, 125], [-4, -8]],
    talk: [[28 + Math.sin(frame / 6) * 6, 70], [-4, -8]],
    point: [[70, 80], [-4, -8]],
  }[walk ? 'walk' : pose] || [[4, 8], [-4, -8]]
  const arm = ([a, b], back) => (
    <g transform={`translate(${back ? -1.5 : 1.5} -79) rotate(${-a})`}>
      <line x1={0} y1={0} x2={0} y2={17} stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
      <line x1={0} y1={0} x2={0} y2={17} stroke={shirt} strokeWidth={3.4} strokeLinecap="round" />
      <g transform={`translate(0 17) rotate(${-(b - a)})`}>
        <line x1={0} y1={0} x2={0} y2={15} stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
        <line x1={0} y1={0} x2={0} y2={15} stroke={back ? shirt : shirt} strokeWidth={2.6} strokeLinecap="round" />
        <circle cx={0} cy={16.5} r={1.9} fill={skin} {...ink} />
        {!back && item === 'basket' && <path d="M -5 18 L 5 18 L 4 25 L -4 25 Z" fill="#B88A55" {...ink} />}
        {!back && item === 'bag' && <rect x={-4} y={18} width={8} height={9} rx={1} fill={P.rust} {...ink} />}
        {!back && item === 'phone' && <rect x={-1.5} y={13} width={3} height={5.5} rx={0.6} fill="#2B2B33" {...ink} />}
        {!back && item === 'money' && <rect x={-3} y={14} width={6} height={4} fill="#8FB08A" {...ink} />}
      </g>
    </g>
  )
  const hair = p.hair === 'long' ? (
    <path d="M -7.2 -94 Q -7 -103 0 -102.6 Q 7.6 -102.6 7.2 -94 L 7.6 -84 L 4 -86 L 4 -95 Q 0 -98.6 -4 -95 L -4 -86 L -7.6 -84 Z" fill="#2A211B" {...ink} />
  ) : p.hair === 'bun' ? (
    <g fill="#2A211B" {...ink}><circle cx={-4.6} cy={-101} r={2.6} /><path d="M -7.2 -93 Q -7 -102.6 0 -102.6 Q 7.4 -102.6 7.2 -93 Q 3 -98 -7.2 -93 Z" /></g>
  ) : (
    <path d="M -7.2 -92.5 Q -7.6 -102.8 0.5 -102.6 Q 7.6 -102.4 7.2 -94 Q 3 -99 -2 -97.6 Q -5.4 -96.4 -7.2 -92.5 Z" fill="#2A211B" {...ink} />
  )
  const hat =
    p.hat === 'straw' ? (
      <g fill="#D9B978" {...ink}><ellipse cx={0} cy={-99} rx={13} ry={2.6} /><path d="M -6.4 -99.4 Q -6 -106 0 -106.2 Q 6 -106 6.4 -99.4 Z" /></g>
    ) : p.hat === 'cap' ? (
      <g fill={P.rust} {...ink}><path d="M -7.4 -97 Q -7.4 -104.6 0 -104.6 Q 7.4 -104.6 7.4 -97 Z" /><path d="M 5 -97.6 L 12 -97 L 6 -96 Z" /></g>
    ) : p.hat === 'krama' ? (
      <g {...ink}><path d="M -7.6 -97 Q -7.4 -104 0 -104 Q 7.4 -104 7.6 -97 Z" fill="#C6544B" /><path d="M -7.4 -99 L 7.4 -99 M -6 -102 L 6 -102" stroke="#F3E7DA" strokeWidth={0.7} /></g>
    ) : null
  return (
    <g transform={`translate(${x} ${y + bob * s}) scale(${s * face} ${s})`}>
      <ellipse cx={0} cy={0.5} rx={10} ry={1.4} fill="rgba(90,70,54,0.18)" />
      {arm(arms[1], true)}
      {wrap ? (
        <g>
          {[-3, 3].map((dx, i) => <line key={dx} x1={dx} y1={-10} x2={dx + (i ? step : -step) * 3} y2={-1} stroke={skin} strokeWidth={2.4} strokeLinecap="round" />)}
          <path d={`M -9 -46 L 9 -46 L ${8 + step} -9 L ${-8 + step} -9 Z`} fill={bottom} {...ink} />
          {[-34, -24, -16].map((yy) => <line key={yy} x1={-8.4} y1={yy} x2={8.4} y2={yy} stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} />)}
        </g>
      ) : (
        [-1, 1].map((d) => (
          <g key={d} transform={`rotate(${d * step * 18} ${d * 3.6} -46)`}>
            <path d={`M ${d * 3.6 - 3.4} -46 L ${d * 3.6 + 3.4} -46 L ${d * 3.6 + 2.6} -3 L ${d * 3.6 - 2.6} -3 Z`} fill={bottom} {...ink} />
          </g>
        ))
      )}
      {[-1, 1].map((d) => <ellipse key={d} cx={d * 3.8 + (wrap ? d * step * 3 : 0) + 1.2} cy={-1.2} rx={3.6} ry={1.4} fill="#3A2C22" />)}
      {/* the shirt: collar, buttons */}
      <path d="M -10.5 -81 Q -11.6 -64 -9.6 -45 L 9.6 -45 Q 11.6 -64 10.5 -81 Q 0 -84.5 -10.5 -81 Z" fill={shirt} {...ink} />
      <path d="M -3.6 -83 L 0 -77.6 L 3.6 -83 L 1.6 -84 L 0 -81.4 L -1.6 -84 Z" fill={shirt} {...ink} />
      {[-72, -64, -56].map((yy) => <circle key={yy} cx={0.4} cy={yy} r={0.55} fill="white" />)}
      <rect x={-2.2} y={-87} width={4.4} height={4.6} fill={skin} />
      {/* the head, a little turned the way they face */}
      <ellipse cx={0.6} cy={-93.6} rx={6.8} ry={8.4} fill={skin} {...ink} />
      <ellipse cx={-5.6} cy={-93} rx={1.4} ry={2} fill={skin} {...ink} />
      {hair}
      {hat}
      <path d="M 1.6 -94.4 Q 3 -95.4 4.6 -94.4 Q 3 -93.6 1.6 -94.4 Z" fill="#2A211B" />
      <path d="M 6.8 -94 L 7.8 -90.2 L 6.4 -89.8" fill="none" {...ink} />
      <path d="M 3.6 -87.4 Q 5 -86.8 6 -87.6" fill="none" {...ink} />
      {arm(arms[0], false)}
    </g>
  )
}

/** The people who fill a place (stall keepers, shoppers): seeded looks and spots. */
function Extras({ n, place, frame }) {
  const spots = {
    market: [[330, 'stand', 'straw'], [700, 'talk', 'none'], [1150, 'stand', 'krama'], [1520, 'carry', 'straw'], [1880, 'stand', 'cap'], [2150, 'talk', 'none']],
    street: [[420, 'stand', 'none'], [1300, 'phone', 'none'], [1900, 'walk', 'cap'], [800, 'carry', 'straw'], [2200, 'stand', 'none'], [150, 'walk', 'none']],
    field: [[600, 'carry', 'straw'], [1700, 'stand', 'straw'], [1100, 'stand', 'krama']],
    bank: [[700, 'stand', 'none'], [1100, 'phone', 'none']],
    home: [[1500, 'talk', 'none']],
  }[place] || []
  return spots.slice(0, n).map(([x, pose, hat], i) => {
    const r = (k) => random(`${place}-${i}-${k}`)
    const p = {
      gender: r('g') > 0.5 ? 'female' : 'male',
      skin: ['light', 'tan', 'brown', 'deep'][Math.floor(r('s') * 4)],
      shirt: Object.keys(SHIRTS)[Math.floor(r('c') * 8)],
      hair: r('h') > 0.6 ? 'bun' : 'short',
      hat,
    }
    const walking = pose === 'walk'
    const dx = walking ? ((frame * 1.4 * (i % 2 ? -1 : 1)) % 600) : 0
    return <Person key={i} x={x + dx} y={WORLD.ground - (place === 'market' ? 40 : 0)} h={place === 'market' ? 330 : 380} p={p} pose={pose} walk={walking} face={i % 2 ? -1 : 1} seed={i} item={pose === 'carry' ? 'basket' : 'none'} />
  })
}

// ── places (world units: 2400 wide, ground at 900) ─────────────────────────
function Palm({ x, base, h = 520 }) {
  const top = base - h
  return (
    <g>
      <path d={`M ${x - 6} ${base} Q ${x - 14} ${base - h / 2} ${x - 2} ${top} L ${x + 6} ${top} Q ${x - 2} ${base - h / 2} ${x + 8} ${base} Z`} fill="#8C7356" stroke={INK} strokeWidth={2} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return <ellipse key={i} cx={x + Math.cos(a) * 46} cy={top + Math.sin(a) * 26} rx={58} ry={16} transform={`rotate(${(a * 180) / Math.PI} ${x + Math.cos(a) * 46} ${top + Math.sin(a) * 26})`} fill={i % 2 ? P.palm : '#6F9A72'} stroke={INK} strokeWidth={2} />
      })}
    </g>
  )
}

function Shophouses({ base, h = 380, n = 8, scale = 1 }) {
  const w = WORLD.w / n
  const tones = [P.beige, P.cream, '#E6D6B8', '#DCCDAE']
  const bands = [P.rust, P.teal, P.mustard, '#C9B79A']
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x = i * w
        const hh = h * (0.85 + random(`sh-h-${i}`) * 0.3) * scale
        const y = base - hh
        return (
          <g key={i} stroke={INK} strokeWidth={2}>
            <rect x={x + 4} y={y} width={w - 8} height={hh} fill={tones[i % 4]} />
            <rect x={x} y={y - 14} width={w} height={16} fill="#D3C3A3" />
            {[0.18, 0.5].map((ky) =>
              [0.12, 0.42, 0.72].map((kx) => <rect key={`${kx}${ky}`} x={x + w * kx} y={y + hh * ky} width={w * 0.18} height={hh * 0.16} fill={random(`win-${i}-${kx}-${ky}`) > 0.3 ? P.navy : '#7A6A58'} />),
            )}
            <rect x={x + 4} y={y + hh * 0.72} width={w - 8} height={hh * 0.06} fill={bands[i % 4]} />
            {random(`sign-${i}`) > 0.4 && <rect x={x + w * 0.3} y={y + hh * 0.38} width={w * 0.14} height={hh * 0.07} fill={bands[(i + 1) % 4]} />}
            <rect x={x + w * 0.12} y={y + hh * 0.8} width={w * 0.76} height={hh * 0.2} fill="#8F8577" />
            {Array.from({ length: 5 }, (_, k) => <line key={k} x1={x + w * 0.12} y1={y + hh * (0.82 + k * 0.035)} x2={x + w * 0.88} y2={y + hh * (0.82 + k * 0.035)} stroke="#A49A8B" strokeWidth={1.4} />)}
          </g>
        )
      })}
    </g>
  )
}

function Wires({ y }) {
  return [0, 1].map((k) => <path key={k} d={`M 0 ${y + k * 22} Q 600 ${y + 50 + k * 22} 1200 ${y + k * 22} T 2400 ${y + k * 22}`} fill="none" stroke="#6E6152" strokeWidth={2.2} />)
}

/** A market stall: posts, a scalloped awning, a table with its goods. */
function Stall({ x, w, color, goods }) {
  const top = 520
  const tableY = 770
  const scallops = Math.max(3, Math.round(w / 70))
  const step = (w + 40) / scallops
  // right to left along the bottom: one dip per scallop
  const edge = Array.from({ length: scallops }, (_, i) => {
    const x0 = x + w + 20 - i * step
    return `Q ${x0 - step / 2} ${top + 104} ${x0 - step} ${top + 74}`
  }).join(' ')
  return (
    <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
      {[x + 14, x + w - 14].map((px) => <rect key={px} x={px - 5} y={top} width={10} height={WORLD.ground - top} fill={P.woodDark} />)}
      <path d={`M ${x - 20} ${top - 10} L ${x + w + 20} ${top - 10} L ${x + w + 20} ${top + 74} ${edge} Z`} fill={color} />
      <path d={`M ${x - 20} ${top - 10} L ${x + w + 20} ${top - 10}`} stroke={INK} strokeWidth={6} />
      {[0.25, 0.5, 0.75].map((k) => (
        <g key={k}>
          <line x1={x + w * k} y1={top + 70} x2={x + w * k} y2={top + 120} stroke="#6E6152" strokeWidth={1.4} />
          <ellipse cx={x + w * k} cy={top + 132} rx={14} ry={16} fill="#F3E9D2" />
        </g>
      ))}
      <rect x={x} y={tableY} width={w} height={WORLD.ground - tableY} fill={P.wood} />
      <rect x={x} y={tableY} width={w} height={14} fill="#B08E66" />
      {goods === 'fish' &&
        [0.2, 0.5, 0.8].map((k) => (
          <g key={k}>
            <ellipse cx={x + w * k} cy={tableY - 6} rx={w * 0.13} ry={10} fill="#E9E4D8" />
            {[-1, 0, 1].map((d) => <ellipse key={d} cx={x + w * k + d * 22} cy={tableY - 14} rx={20} ry={7} fill="#9AA7AE" />)}
          </g>
        ))}
      {goods === 'rice' &&
        [0.3, 0.7].map((k) => (
          <g key={k}>
            <path d={`M ${x + w * k - 70} ${tableY} L ${x + w * k - 60} ${tableY - 60} L ${x + w * k + 60} ${tableY - 60} L ${x + w * k + 70} ${tableY} Z`} fill="#F1ECE0" />
            <ellipse cx={x + w * k} cy={tableY - 62} rx={62} ry={30} fill="#FAF7EF" />
          </g>
        ))}
      {goods === 'fruit' &&
        [0.2, 0.5, 0.8].map((k, i) => (
          <g key={k}>
            <path d={`M ${x + w * k - 50} ${tableY - 40} L ${x + w * k + 50} ${tableY - 40} L ${x + w * k + 40} ${tableY} L ${x + w * k - 40} ${tableY} Z`} fill="#B88A55" />
            {[-26, 0, 26].map((d) => <circle key={d} cx={x + w * k + d} cy={tableY - 48} r={16} fill={[P.mustard, '#8FB06A', '#7D5A86'][i]} />)}
          </g>
        ))}
      {goods === 'greens' &&
        [0.25, 0.65].map((k) => (
          <g key={k}>
            <path d={`M ${x + w * k - 60} ${tableY - 36} L ${x + w * k + 60} ${tableY - 36} L ${x + w * k + 48} ${tableY} L ${x + w * k - 48} ${tableY} Z`} fill="#B88A55" />
            {[-30, 0, 30].map((d) => <ellipse key={d} cx={x + w * k + d} cy={tableY - 46} rx={26} ry={16} fill="#7FA86A" />)}
          </g>
        ))}
    </g>
  )
}

function Moto({ x, y, color = P.navy }) {
  return (
    <g stroke={INK} strokeWidth={2.4} transform={`translate(${x} ${y})`}>
      {[-70, 70].map((dx) => <circle key={dx} cx={dx} cy={-34} r={32} fill="#3A3A40" />)}
      {[-70, 70].map((dx) => <circle key={dx} cx={dx} cy={-34} r={12} fill="#BDB4A3" />)}
      <path d="M -90 -60 Q -60 -100 0 -90 L 40 -90 Q 70 -110 80 -140 L 96 -136 Q 86 -96 60 -64 Z" fill={color} />
      <rect x={-50} y={-108} width={70} height={16} rx={6} fill="#2B2B33" />
      <line x1={86} y1={-138} x2={70} y2={-172} />
      <line x1={58} y1={-172} x2={88} y2={-172} />
    </g>
  )
}

function TukTuk({ x, y }) {
  return (
    <g stroke={INK} strokeWidth={2.4} transform={`translate(${x} ${y})`}>
      <rect x={-150} y={-230} width={200} height={14} fill={P.navy} />
      {[-146, 40].map((px) => <rect key={px} x={px} y={-220} width={8} height={150} fill="#3A3A40" />)}
      <path d="M -160 -80 L 50 -80 L 50 -130 L -160 -130 Z" fill={P.rust} />
      <rect x={-150} y={-150} width={180} height={24} fill="#8F4A33" />
      {[-110, 10].map((dx) => <circle key={dx} cx={dx} cy={-40} r={36} fill="#3A3A40" />)}
      <path d="M 50 -120 L 180 -120 L 200 -70 L 50 -70 Z" fill={P.navy} />
      <circle cx={180} cy={-40} r={34} fill="#3A3A40" />
    </g>
  )
}

/** One place, in world units — its ground, its buildings, its life. */
function World({ place, brand, frame, crowd = 3 }) {
  const g = WORLD.ground
  if (place === 'home') {
    return (
      <g>
        <rect x={0} y={0} width={WORLD.w} height={g} fill="#E9D8BC" />
        <rect x={0} y={g - 60} width={WORLD.w} height={20} fill="#D3BE9C" stroke={INK} strokeWidth={2} />
        <rect x={0} y={g} width={WORLD.w} height={WORLD.h - g} fill="#B9926A" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} x1={i * 200} y1={g} x2={i * 200 - 60} y2={WORLD.h} stroke="#A9825C" strokeWidth={2} />)}
        <g stroke={INK} strokeWidth={2.4}>
          <rect x={420} y={240} width={420} height={330} fill="#C9DCD6" />
          <rect x={420} y={460} width={420} height={110} fill="#9DBB8A" />
          <line x1={630} y1={240} x2={630} y2={570} strokeWidth={8} stroke="#F2EEE4" />
          <rect x={1620} y={280} width={200} height={150} fill={P.mustard} />
          <rect x={1660} y={315} width={120} height={80} fill="#E9E2D0" />
          <rect x={1250} y={650} width={560} height={30} fill={P.wood} />
          {[1290, 1770].map((px) => <rect key={px} x={px} y={680} width={16} height={g - 680} fill={P.woodDark} />)}
          <path d="M 1450 650 L 1470 600 L 1530 600 L 1550 650 Z" fill="#E9E4D8" />
        </g>
        <Palm x={520} base={570} h={240} />
        <Extras n={Math.min(crowd, 1)} place="home" frame={frame} />
      </g>
    )
  }
  return (
    <g>
      <rect x={0} y={0} width={WORLD.w} height={g} fill={P.sky} />
      {place === 'field' ? (
        <>
          <path d={`M 0 640 Q 400 560 900 620 Q 1400 540 1900 610 Q 2200 580 2400 620 L 2400 700 L 0 700 Z`} fill="#B7C29A" stroke={INK} strokeWidth={2} />
          <rect x={0} y={690} width={WORLD.w} height={WORLD.h - 690} fill="#A9C27E" />
          {Array.from({ length: 6 }, (_, i) => <line key={i} x1={0} y1={720 + i * 60} x2={WORLD.w} y2={720 + i * 60 + (i % 2 ? 8 : -8)} stroke="#8FAE68" strokeWidth={4} />)}
          <path d={`M 1000 ${WORLD.h} Q 1200 820 1150 700 L 1250 700 Q 1320 820 1500 ${WORLD.h} Z`} fill={P.ground} stroke={INK} strokeWidth={2} />
          <g stroke={INK} strokeWidth={2.4}>
            {[1780, 2000].map((px) => <rect key={px} x={px} y={560} width={10} height={120} fill={P.woodDark} />)}
            <rect x={1760} y={480} width={270} height={90} fill="#B88A5E" />
            <path d="M 1740 490 L 1895 400 L 2050 490 Z" fill={P.rust} />
          </g>
          {[300, 700, 2250].map((px, i) => <Palm key={px} x={px} base={690} h={420 + i * 40} />)}
        </>
      ) : (
        <>
          <Shophouses base={place === 'street' ? 760 : 680} h={place === 'street' ? 520 : 400} n={place === 'street' ? 6 : 8} />
          <Wires y={place === 'street' ? 150 : 230} />
          {[240, 1950].map((px) => <Palm key={px} x={px} base={place === 'street' ? 760 : 680} h={place === 'street' ? 640 : 560} />)}
          <rect x={0} y={place === 'street' ? 760 : 680} width={WORLD.w} height={90} fill={P.road} stroke={INK} strokeWidth={2} />
          {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 260 + 40} y={place === 'street' ? 800 : 720} width={120} height={8} fill="#E9E2D0" />)}
          <rect x={0} y={place === 'street' ? 850 : 770} width={WORLD.w} height={WORLD.h} fill={P.ground} />
        </>
      )}
      {place === 'market' && (
        <>
          <Moto x={260} y={760} />
          {[
            [80, 560, P.beige, 'fish'],
            [700, 560, P.rust, 'rice'],
            [1320, 560, P.teal, 'fruit'],
            [1940, 460, P.mustard, 'greens'],
          ].map(([x, w, c, goods]) => <Stall key={x} x={x} w={w} color={c} goods={goods} />)}
        </>
      )}
      {place === 'street' && (
        <>
          <Moto x={520} y={g} color={P.rust} />
          <Moto x={820} y={g} />
          <TukTuk x={1700} y={g + 20} />
        </>
      )}
      {place === 'bank' && (
        <g stroke={INK} strokeWidth={2.6}>
          <rect x={300} y={260} width={1800} height={g - 260} fill="#E4DCCB" />
          <rect x={300} y={220} width={1800} height={60} fill={brand?.color || P.navy} />
          <text x={1200} y={262} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={40} fill="white" stroke="none">{clean(brand?.name || '')}</text>
          {[520, 820].map((px) => <rect key={px} x={px} y={420} width={260} height={g - 420} fill="#B8CBD3" />)}
          <ATMBox x={1450} y={g} />
        </g>
      )}
      {place !== 'bank' && <Extras n={crowd} place={place} frame={frame} />}
      {place === 'bank' && <Extras n={Math.min(crowd, 2)} place="bank" frame={frame} />}
    </g>
  )
}

function ATMBox({ x, y, k = 1 }) {
  return (
    <g stroke={INK} strokeWidth={2.6 / k} transform={`translate(${x} ${y}) scale(${k})`}>
      <rect x={0} y={-560} width={300} height={560} fill="#DAD5CA" />
      <rect x={30} y={-520} width={240} height={150} fill="#2E3F5C" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={50 + i * 50} y={-490} width={34} height={14} fill={P.mustard} stroke="none" />)}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={50 + i * 50} y={-455} width={34} height={12} fill="#7FB0AC" stroke="none" />)}
      <rect x={60} y={-330} width={180} height={130} fill="#E9E4D8" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={72 + (i % 4) * 42} y={-318 + Math.floor(i / 4) * 40} width={30} height={26} rx={4} fill="#F5F1E8" />)}
      <rect x={0} y={-170} width={300} height={20} fill={P.navy} />
    </g>
  )
}

// ── the frame round the world: camera, sky / ground for a tall frame ──────
function Panorama({ place, time, brand, crowd, pan = [0.15, 0.35], blur = 0, children }) {
  const frame = useCurrentFrame()
  const { W, H, band, s, viewW, durationInFrames } = useStage()
  const k = interpolate(frame, [0, durationInFrames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) })
  const spare = Math.max(0, WORLD.w - viewW)
  const camX = spare * (pan[0] + (pan[1] - pan[0]) * k)
  const evening = time === 'evening'
  return (
    <AbsoluteFill style={{ background: place === 'home' ? '#E9D8BC' : P.sky, overflow: 'hidden' }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, filter: `saturate(0.92)${blur ? ` blur(${blur}px)` : ''}` }}>
        {/* a tall frame: the sky above the band, the ground below it */}
        <rect x={0} y={band.top + band.h - 2} width={W} height={H} fill={place === 'home' ? '#B9926A' : place === 'field' ? '#A9C27E' : P.ground} />
        <g transform={`translate(0 ${band.top}) scale(${s}) translate(${-camX} 0)`}>
          <World place={place} brand={brand} frame={frame} crowd={crowd} />
          {children && children(camX)}
        </g>
        {evening && <rect x={0} y={0} width={W} height={H} fill="rgba(214,120,70,0.16)" />}
      </svg>
      <Finish />
    </AbsoluteFill>
  )
}

/** A paper card with words — titles, facts, the close. */
function Card({ children, top, width, delay = CARD_AT, center = true }) {
  const frame = useCurrentFrame()
  const { W, u, fps } = useStage()
  const s = spring({ frame: frame - delay, fps, config: { damping: 15 } })
  return (
    <div style={{ position: 'absolute', left: center ? (W - width) / 2 : 60 * u, top, width, transform: `translateY(${(1 - s) * 30 * u}px)`, opacity: Math.min(1, s * 1.5) }}>
      <div style={{ background: '#F6EFDF', border: `${3 * u}px solid ${INK}`, borderRadius: 10 * u, padding: `${28 * u}px ${36 * u}px`, boxShadow: `${6 * u}px ${8 * u}px 0 rgba(90,70,54,0.25)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * u }}>
        {children}
      </div>
    </div>
  )
}

const lead = (cast) => ({ gender: 'male', skin: 'tan', hair: 'short', shirt: 'blue', bottom: 'pants', hat: 'none', ...((cast || [])[0] || {}) })

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene, brand, cast }) {
  const { W, u, wide } = useStage()
  return (
    <AbsoluteFill>
      <Panorama place={scene.place || 'market'} time={scene.time} brand={brand} crowd={5} pan={[0.05, 0.4]} />
      <Card top={(wide ? 110 : 240) * u} width={W * (wide ? 0.6 : 0.86)}>
        <Pop text={scene.text} size={(wide ? 76 : 84) * u} width={W * (wide ? 0.54 : 0.78)} color={INK} accent={P.rust} delay={(CARD_AT + 4) / 30} />
      </Card>
    </AbsoluteFill>
  )
}

/** A wide shot: the place, its people, the main person walking in or doing something. */
function Wide({ scene, brand, cast }) {
  const frame = useCurrentFrame()
  const { W, u, wide, viewW, fps } = useStage()
  const p = lead(cast)
  const walking = scene.pose === 'walk'
  return (
    <AbsoluteFill>
      <Panorama place={scene.place || 'market'} time={scene.time} brand={brand} crowd={scene.crowd ?? 3}>
        {(camX) => {
          // the main person: in the middle of what the camera sees (walking in from the left)
          const centre = camX + viewW * (wide ? 0.42 : 0.5)
          const x = walking ? interpolate(frame, [0, 3.5 * fps], [camX + viewW * 0.08, centre], clamp) : centre
          return <Person x={x} y={WORLD.ground + 60} h={470} p={p} walk={walking && frame < 3.5 * fps} pose={scene.pose || 'stand'} item={scene.item || 'none'} seed={7} />
        }}
      </Panorama>
      {scene.title && (
        <Card top={(wide ? 60 : 160) * u} width={W * (wide ? 0.5 : 0.8)} center={!wide}>
          <Pop text={scene.title} size={(wide ? 54 : 62) * u} width={W * (wide ? 0.44 : 0.72)} color={INK} accent={P.rust} delay={(CARD_AT + 6) / 30} />
        </Card>
      )}
    </AbsoluteFill>
  )
}

// ── close-ups: the main person's face beside the thing that matters ───────
function Bust({ p, x, y, size }) {
  const frame = useCurrentFrame()
  const skin = SKINS[p.skin] || SKINS.tan
  const shirt = SHIRTS[p.shirt] || SHIRTS.blue
  const blink = frame % 110 > 104
  const breathe = Math.sin(frame / 22) * 0.6
  const ink = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round', strokeLinecap: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute', left: x, top: y, overflow: 'visible' }}>
      <g transform={`translate(0 ${breathe})`}>
        {/* shoulders and the arm reaching out to the thing */}
        <path d="M 20 205 Q 18 150 60 138 L 120 136 Q 150 140 165 160 L 210 168 L 212 188 L 160 186 Q 150 205 150 205 Z" fill={shirt} {...ink} />
        <path d="M 80 128 L 94 146 L 104 128" fill={shirt} {...ink} />
        <circle cx={214} cy={178} r={9} fill={skin} {...ink} />
        <rect x={84} y={112} width={20} height={22} fill={skin} />
        <ellipse cx={96} cy={84} rx={34} ry={42} fill={skin} {...ink} />
        <ellipse cx={66} cy={86} rx={7} ry={10} fill={skin} {...ink} />
        {p.hair === 'long' || p.hair === 'bun' ? (
          <path d="M 60 80 Q 56 38 98 38 Q 134 40 130 74 Q 112 58 84 62 Q 70 66 64 96 Z" fill="#2A211B" {...ink} />
        ) : (
          <path d="M 60 82 Q 56 40 98 40 Q 132 42 130 70 Q 112 56 88 60 Q 70 64 64 90 Z" fill="#2A211B" {...ink} />
        )}
        {p.hair === 'bun' && <circle cx={76} cy={40} r={12} fill="#2A211B" {...ink} />}
        {blink ? <path d="M 106 82 L 120 82" {...ink} /> : <g><path d="M 104 82 Q 112 75 121 82 Q 112 87 104 82 Z" fill="white" {...ink} /><circle cx={114} cy={81.6} r={3.2} fill="#2A211B" /></g>}
        <path d="M 102 72 Q 112 68 122 72" fill="none" {...ink} strokeWidth={1.8} />
        <path d="M 126 86 L 132 104 L 124 106" fill="none" {...ink} />
        <path d="M 112 116 Q 120 118 126 114" fill="none" {...ink} />
      </g>
    </svg>
  )
}

/** The thing beside the face — drawn big. */
function Thing({ kind, brand, x, y, size }) {
  const frame = useCurrentFrame()
  const ink = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' }
  const glow = 0.6 + 0.4 * Math.abs(Math.sin(frame / 12))
  const body = {
    atm: <ATMBox x={50} y={600} k={1} />,
    phone: (
      <g {...ink}>
        <rect x={70} y={40} width={250} height={500} rx={30} fill="#2B2B33" />
        <rect x={88} y={80} width={214} height={420} rx={10} fill="#F2EEE4" />
        <rect x={88} y={80} width={214} height={70} fill={brand?.color || P.teal} />
        {[0, 1, 2].map((i) => <rect key={i} x={108} y={180 + i * 80} width={174} height={56} rx={10} fill={i === 1 ? '#E7C76A' : '#E2D3B4'} opacity={i === 1 ? glow : 1} />)}
      </g>
    ),
    money: (
      <g {...ink}>
        {[-14, -4, 6].map((r, i) => <rect key={i} x={60} y={220 + i * 26} width={300} height={140} rx={8} fill={['#8FB08A', '#D99C8A', '#A9B9D8'][i]} transform={`rotate(${r} 210 290)`} />)}
        {[0, 1, 2, 3].map((i) => <ellipse key={i} cx={130 + i * 18} cy={470 - i * 14} rx={50} ry={16} fill={P.mustard} />)}
      </g>
    ),
    paper: (
      <g {...ink}>
        <rect x={80} y={60} width={260} height={360} fill="#F7F2E6" transform="rotate(4 210 240)" />
        {Array.from({ length: 7 }, (_, i) => <line key={i} x1={110} y1={110 + i * 34} x2={300 - (i % 3) * 40} y2={110 + i * 34} stroke="#B8AC96" strokeWidth={6} transform="rotate(4 210 240)" />)}
        <circle cx={270} cy={360} r={40} fill="none" stroke={P.rust} strokeWidth={6} transform="rotate(4 210 240)" />
      </g>
    ),
    stall: (
      <g transform="translate(-60 -150) scale(0.42)">
        <Stall x={0} w={900} color={P.teal} goods="fruit" />
      </g>
    ),
    laptop: (
      <g {...ink}>
        <rect x={60} y={170} width={320} height={210} rx={10} fill="#3A3A40" />
        <rect x={76} y={186} width={288} height={178} fill={brand?.color || P.teal} opacity={0.85} />
        <path d="M 20 380 L 420 380 L 440 410 L 0 410 Z" fill="#BDB4A3" />
      </g>
    ),
  }[kind]
  if (!body) return null
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 440 616" style={{ position: 'absolute', left: x, top: y, overflow: 'visible' }}>
      {body}
    </svg>
  )
}

function Closeup({ scene, brand, cast }) {
  const frame = useCurrentFrame()
  const { W, H, u, wide, fps } = useStage()
  const p = lead(cast)
  const push = interpolate(frame, [0, 4 * fps], [1, 1.05], clamp)
  const bust = wide ? 760 * u : 820 * u
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* the place behind, soft — the close-up is in front of it */}
      <Panorama place={scene.place || 'street'} time={scene.time} brand={brand} crowd={2} blur={6 * u} pan={[0.3, 0.36]} />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '30% 80%' }}>
        <Thing kind={scene.object} brand={brand} x={wide ? W * 0.55 : W * 0.5} y={wide ? H * 0.12 : H * 0.3} size={wide ? 520 * u : 500 * u} />
        <Bust p={p} x={wide ? W * 0.08 : -60 * u} y={wide ? H - bust * 0.95 : H * 0.5} size={bust} />
      </AbsoluteFill>
      {scene.text && (
        <Card top={(wide ? 60 : 170) * u} width={W * (wide ? 0.46 : 0.8)} center={!wide} delay={CARD_AT + 10}>
          <Pop text={scene.text} size={(wide ? 54 : 60) * u} width={W * (wide ? 0.4 : 0.72)} color={INK} accent={P.rust} delay={(CARD_AT + 14) / 30} />
        </Card>
      )}
      <Finish />
    </AbsoluteFill>
  )
}

/** A fact on a paper card over the softened place — a number counting when there is one. */
function Fact({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, u, wide } = useStage()
  const k = interpolate(frame, [COUNT_AT, COUNT_AT + COUNT_LEN], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const value = Number(scene.value) || 0
  return (
    <AbsoluteFill>
      <Panorama place={scene.place || 'market'} time={scene.time} brand={brand} crowd={4} blur={8 * u} pan={[0.4, 0.5]} />
      <Card top={(wide ? 150 : 520) * u} width={W * (wide ? 0.56 : 0.86)}>
        <div style={{ width: 120 * u, height: 120 * u, borderRadius: '50%', background: P.rust, border: `${3 * u}px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
          <Icon name={scene.icon || 'Lightbulb'} size={64 * u} color="#F6EFDF" stroke={2.2} />
        </div>
        {scene.title && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.title, 40 * u), color: P.rust, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.4 }}>{clean(scene.title)}</div>}
        {value > 0 && (
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 130 * u, color: INK, lineHeight: 1.05 }}>
            {scene.prefix}
            {Math.round(value * k).toLocaleString('en-US')}
            {scene.suffix}
          </div>
        )}
        <Pop text={scene.text} size={(wide ? 56 : 62) * u} width={W * (wide ? 0.5 : 0.76)} color={INK} accent={P.rust} delay={(CARD_AT + 8) / 30} />
      </Card>
    </AbsoluteFill>
  )
}

function Cta({ scene, brand, cast }) {
  const frame = useCurrentFrame()
  const { W, u, wide, fps } = useStage()
  const b = spring({ frame: frame - BUTTON_AT, fps, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <Panorama place={scene.place || 'market'} time={scene.time || 'evening'} brand={brand} crowd={5} pan={[0.4, 0.55]} />
      <Card top={(wide ? 120 : 420) * u} width={W * (wide ? 0.56 : 0.86)}>
        <Pop text={scene.text} size={(wide ? 70 : 78) * u} width={W * (wide ? 0.5 : 0.76)} color={INK} accent={P.rust} delay={(CARD_AT + 4) / 30} />
        {scene.button && (
          <div style={{ marginTop: 10 * u, padding: `${16 * u}px ${48 * u}px`, borderRadius: 999, background: brand?.color || P.rust, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.button, 46 * u), border: `${3 * u}px solid ${INK}`, transform: `scale(${Math.max(0.001, b)})`, whiteSpace: 'nowrap' }}>
            {clean(scene.button)}
          </div>
        )}
      </Card>
    </AbsoluteFill>
  )
}

export const ILLUSTRATED = {
  scenes: { hook: Hook, wide: Wide, closeup: Closeup, fact: Fact, cta: Cta },
  root: { backgroundColor: P.sky },
  light: true, // the logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 140 : 1610),
}
