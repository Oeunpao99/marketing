/**
 * "Podcast · Story Talk" — the brand's podcaster tells a story or an insight:
 * at the desk in a cosy studio (headphones in the brand's colour, a mic on a
 * desk stand), then out in the places the story goes (a park, a home office,
 * a market…) painted by the image model behind our coded host. The host is
 * drawn in code — an oval face with real hair (a short tuft, or a bob for a
 * woman's voice), the brand's T-shirt with its logo, jeans, sneakers — so he /
 * she is the same person in every scene and every video.
 * The studio room ships with the app (public/decor/podcast/studio.jpg,
 * tools/make_podcast_set.py); the places are props.places (app/doodle.py
 * BACKDROP_STYLE, at most 2 a video).
 * Scene types: hook · onair · visit · list · cta (app/motion.py PODCAST_TYPES).
 */
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf, tint } from './shared'
import { mouthAt } from './presenter'

const INK = '#1B1B1F'
const SKIN = '#FFE1C4'
const HAIR = '#2E211B'
const JEANS = '#34405A'
const WOOD = '#7A4A2C'
const rad = (d) => (d * Math.PI) / 180
const step = (p, deg, len) => ({ x: p.x + Math.cos(rad(deg)) * len, y: p.y + Math.sin(rad(deg)) * len })

const lum = (hex) => {
  const h = String(hex || '#2563EB').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/** Where things sit, for the studio desk and for standing in a place — 16:9 and 9:16. */
function useSet() {
  const { width: W, height: H, fps } = useVideoConfig()
  const wide = W > H
  return wide
    ? { W, H, fps, wide, desk: 820, sitX: 680, sitS: 9, ground: 905, standX: 720, standS: 6.1, card: { x: 1130, y: 140, w: 720, h: 600 } }
    : { W, H, fps, wide, desk: 1480, sitX: 540, sitS: 11.4, ground: 1600, standX: 540, standS: 8.8, card: { x: 60, y: 290, w: 960, h: 520 } }
}

// ── the host ───────────────────────────────────────────────────────────────
/** A limb: ink edge, skin inside. */
function Limb({ a, b, w = 5 }) {
  return (
    <g strokeLinecap="round">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={w + 2.2} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SKIN} strokeWidth={w} />
    </g>
  )
}
const HandDot = ({ p }) => <ellipse cx={p.x} cy={p.y} rx={3.8} ry={3.3} fill={SKIN} stroke={INK} strokeWidth={1.1} />

// arm poses: [upper arm, forearm] for the RIGHT arm (screen right); the left is mirrored unless given
const POSES = {
  stand: (f) => ({ r: [82, 96 + Math.sin(f / 30) * 2], l: [82, 96] }),
  hips: () => ({ r: [42, 138], l: [42, 138] }),
  wave: (f) => ({ r: [-42, -86 + Math.sin(f / 4) * 18], l: [82, 96] }),
  idea: (f) => ({ r: [58, -88 + Math.sin(f / 12) * 4], l: [82, 96] }),
  point: (f) => ({ r: [-12, -22 + Math.sin(f / 14) * 3], l: [82, 96] }),
  shrug: (f) => ({ r: [38, -48 + Math.sin(f / 10) * 4], l: [38, -48 + Math.sin(f / 10) * 4] }),
  // at a desk: the hands rest on it (drawn on top of the desk)
  desk: (f) => ({ r: [74, 112 + Math.sin(f / 26) * 2], l: [74, 112] }),
  talk: (f) => ({ r: [48, -38 + Math.sin(f / 7) * 12], l: [74, 112] }),
  laptop: (f) => ({ r: [74, 112], l: [96, 62 + Math.sin(f / 3) * 3] }),
}
const SITTING = new Set(['desk', 'talk', 'laptop'])

/** Eyes, brows and mouth for a mood; ``mouth`` 0-1 opens it with the voice. */
function Face({ mood = 'happy', mouth = 0, blink }) {
  const ink = { stroke: INK, strokeWidth: 1.3, strokeLinecap: 'round', fill: 'none' }
  const up = mood === 'thinking' ? -1 : 0
  const look = mood === 'thinking' ? 1.2 : 0
  let eyes
  if (blink) eyes = <g {...ink}><line x1={-8.5} y1={-79} x2={-4} y2={-79} /><line x1={4} y1={-79} x2={8.5} y2={-79} /></g>
  else if (mood === 'excited') eyes = <g {...ink} strokeWidth={1.6}><path d="M -9 -78 Q -6.2 -82.5 -3.5 -78" /><path d="M 3.5 -78 Q 6.2 -82.5 9 -78" /></g>
  else {
    const ry = mood === 'surprised' ? 3.4 : 2.8
    eyes = (
      <g>
        {[-6.2, 6.2].map((x) => (
          <g key={x}>
            <ellipse cx={x + look} cy={-79 + up} rx={2.2} ry={ry} fill={INK} />
            <circle cx={x + look + 0.7} cy={-80 + up} r={0.8} fill="white" />
          </g>
        ))}
      </g>
    )
  }
  const brows = {
    worried: <g {...ink}><path d="M -9.5 -84 L -4 -85.8" /><path d="M 4 -85.8 L 9.5 -84" /></g>,
    sad: <g {...ink}><path d="M -9.5 -84 L -4 -85.8" /><path d="M 4 -85.8 L 9.5 -84" /></g>,
    thinking: <g {...ink}><path d="M -9.5 -85 Q -6.5 -86.5 -4 -85.5" /><path d="M 4 -87.5 Q 6.5 -89 9.5 -87" /></g>,
    surprised: <g {...ink}><path d="M -9.5 -86.5 Q -6.5 -88.5 -3.5 -86.5" /><path d="M 3.5 -86.5 Q 6.5 -88.5 9.5 -86.5" /></g>,
  }[mood] || <g {...ink}><path d="M -9.5 -85 Q -6.5 -86.8 -3.5 -85.4" /><path d="M 3.5 -85.4 Q 6.5 -86.8 9.5 -85" /></g>
  // the mouth: a smile, or open with the voice (a red inside, a tongue)
  const open = Math.max(mouth, mood === 'surprised' ? 0.5 : 0)
  const sad = mood === 'sad' || mood === 'worried'
  const m = open > 0.05 ? (
    <g>
      <path d={`M -4.8 -71 Q 0 -70 4.8 -71 Q 4 ${-71 + 2 + 5 * open} 0 ${-71 + 2.5 + 5.5 * open} Q -4 ${-71 + 2 + 5 * open} -4.8 -71 Z`} fill="#B8323A" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <ellipse cx={0.6} cy={-71 + 1.6 + 4 * open} rx={2.4} ry={1.1 * open + 0.3} fill="#F07C84" />
    </g>
  ) : sad ? (
    <path d="M -3.8 -69.5 Q 0 -72.2 3.8 -69.5" {...ink} />
  ) : (
    <path d="M -4.6 -71.6 Q 0 -67.6 4.6 -71.6" {...ink} />
  )
  return (
    <g>
      {eyes}
      {brows}
      <ellipse cx={-10.8} cy={-73.8} rx={2.4} ry={1.3} fill="#F5A9A0" opacity={0.8} />
      <ellipse cx={10.8} cy={-73.8} rx={2.4} ry={1.3} fill="#F5A9A0" opacity={0.8} />
      {m}
    </g>
  )
}

/**
 * The host, feet centred at (x, ground), ``s`` px per unit (standing 100 units
 * tall). ``desk`` = sitting at a desk whose top is at body y -31 (drawn here,
 * across the frame, with the hands on it); ``thing`` = what is on the desk
 * ("mic" | "laptop").
 */
function Host({ x, ground, s, pose = 'stand', mood = 'happy', mouth = 0, female, shirt, logo, print, phones = false, thing = null, enter = 1 }) {
  const frame = useCurrentFrame()
  const blink = frame % 97 > 92
  const sitting = SITTING.has(pose)
  const bob = Math.sin(frame / (mouth > 0 ? 5 : 22)) * (mouth > 0 ? 0.5 : 0.35)
  const p = (POSES[pose] || POSES.stand)(frame)
  const R = { x: 16, y: -50 }
  const L = { x: -16, y: -50 }
  const re = step(R, p.r[0], 11)
  const rh = step(re, p.r[1], 11)
  const le = step(L, 180 - p.l[0], 11)
  const lh = step(le, 180 - p.l[1], 11)
  const ink = { stroke: INK, strokeWidth: 1.3, strokeLinejoin: 'round' }
  const box = { l: -60, t: -112, w: 120, h: 116 }
  const head = (
    <g transform={`translate(0 ${bob}) rotate(${Math.sin(frame / 40) * 2 + mouth * 1.5} 0 -62)`}>
      {/* hair behind (the bob's back) */}
      {female && <path d="M -19 -80 Q -21 -66 -16 -62 L 16 -62 Q 21 -66 19 -80 Z" fill={HAIR} {...ink} />}
      <circle cx={-17.4} cy={-76} r={3.4} fill={SKIN} {...ink} />
      <circle cx={17.4} cy={-76} r={3.4} fill={SKIN} {...ink} />
      <ellipse cx={0} cy={-78} rx={17.5} ry={19.5} fill={SKIN} {...ink} strokeWidth={1.6} />
      {female ? (
        // a bob with a side fringe
        <path d="M -18.5 -76 Q -20 -99 0 -98.5 Q 20 -99 18.5 -76 Q 16 -86 6 -88 Q -4 -84 -12 -88 Q -16 -84 -18.5 -76 Z" fill={HAIR} {...ink} />
      ) : (
        // short hair with a tuft on top
        <path d="M -17 -82 Q -18 -97 0 -97.5 Q 4 -103 9 -101 Q 6 -99.5 7 -97.2 Q 18 -95 17 -82 Q 12 -90 2 -90 Q -8 -91 -17 -82 Z" fill={HAIR} {...ink} />
      )}
      <Face mood={mood} mouth={mouth} blink={blink} />
      {phones && (
        // headphones in the brand's colour
        <g>
          <path d="M -19 -80 Q -21 -104 0 -104 Q 21 -104 19 -80" fill="none" stroke={INK} strokeWidth={4.6} strokeLinecap="round" />
          <path d="M -19 -80 Q -21 -104 0 -104 Q 21 -104 19 -80" fill="none" stroke={shirt} strokeWidth={2.6} strokeLinecap="round" />
          {[-1, 1].map((k) => <rect key={k} x={k < 0 ? -24 : 17} y={-84} width={7} height={13} rx={3.2} fill={shirt} {...ink} />)}
        </g>
      )}
    </g>
  )
  return (
    <div style={{ position: 'absolute', left: x + box.l * s, top: ground + box.t * s, width: box.w * s, height: box.h * s, opacity: Math.min(1, enter * 1.5), transform: `translateY(${(1 - enter) * 30 * s}px)` }}>
      <svg width={box.w * s} height={box.h * s} viewBox={`${box.l} ${box.t} ${box.w} ${box.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {!sitting && <ellipse cx={0} cy={0} rx={15} ry={2.2} fill="rgba(0,0,0,0.22)" />}
        {/* legs: jeans and sneakers */}
        {!sitting && (
          <g>
            <path d="M -13 -31 L -12.5 -5 L -3.5 -5 L -1 -24 L 1 -24 L 3.5 -5 L 12.5 -5 L 13 -31 Z" fill={JEANS} {...ink} />
            {[-8, 8].map((k) => (
              <g key={k}>
                <path d={`M ${k - 6.5} -1 Q ${k - 6.5} -6.5 ${k} -6.5 Q ${k + 7.5} -6.5 ${k + 7.5} -1 Z`} fill="white" {...ink} />
                <line x1={k - 4} y1={-3.6} x2={k + 4} y2={-3.6} stroke={shirt} strokeWidth={1.4} />
              </g>
            ))}
          </g>
        )}
        {/* the T-shirt */}
        <path d="M -12 -61 Q 0 -56.5 12 -61 L 21.5 -51 L 17 -45.5 L 14.5 -48.5 L 14.5 -30 L -14.5 -30 L -14.5 -48.5 L -17 -45.5 L -21.5 -51 Z" fill={shirt} {...ink} strokeWidth={1.5} />
        <path d="M -6 -59.3 Q 0 -54 6 -59.3" fill={SKIN} {...ink} />
        {/* arms (the hands come after the desk) */}
        <Limb a={R} b={re} />
        <Limb a={re} b={rh} />
        <Limb a={L} b={le} />
        <Limb a={le} b={lh} />
        {head}
        {sitting && (
          <g>
            {/* the desk across the frame: wood, a lit edge, a little grain */}
            <rect x={-400} y={-31} width={800} height={60} fill={WOOD} />
            <rect x={-400} y={-31} width={800} height={2.2} fill="#A8714A" />
            {[-120, -64, -20, 30, 88, 140].map((gx, i) => <path key={i} d={`M ${gx} ${-26 + (i % 3) * 5} q 22 -1.5 44 0`} stroke="rgba(0,0,0,0.13)" strokeWidth={0.8} fill="none" />)}
            {thing === 'mic' && (
              <g>
                <ellipse cx={-20} cy={-31} rx={9} ry={2} fill="#141418" />
                <rect x={-21} y={-50} width={2.2} height={19} fill="#26262C" />
                <g transform="rotate(-18 -20 -57)">
                  <rect x={-25.5} y={-71} width={11} height={20} rx={5.5} fill="#2A2A31" {...ink} />
                  {[-67, -64, -61].map((gy) => <line key={gy} x1={-24} y1={gy} x2={-16} y2={gy} stroke="#4A4A55" strokeWidth={0.9} />)}
                  <rect x={-24} y={-53} width={8} height={3} rx={1} fill={shirt} />
                </g>
              </g>
            )}
            {thing === 'laptop' && (
              <g>
                <path d="M -34 -31 L -2 -31 L 1 -33 L -37 -33 Z" fill="#B9BEC8" {...ink} strokeWidth={1} />
                <path d="M -35 -33 L -31 -56 L -3 -56 L 0 -33 Z" fill="#8C929E" {...ink} />
                <circle cx={-17} cy={-45} r={2} fill="rgba(255,255,255,0.35)" />
              </g>
            )}
          </g>
        )}
        <HandDot p={rh} />
        <HandDot p={lh} />
      </svg>
      {/* the logo on the T-shirt — printed in white, or on a white patch */}
      {logo && (
        <div style={{ position: 'absolute', left: (-6.5 - box.l) * s, top: (-52 - box.t) * s, width: 13 * s, height: 8 * s, display: 'grid', placeItems: 'center', ...(print ? {} : { background: '#FFFFFF', borderRadius: 1.2 * s, padding: 0.8 * s, boxSizing: 'border-box' }) }}>
          <Img src={srcOf(logo)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: print ? 'brightness(0) invert(1)' : 'none' }} />
        </div>
      )}
    </div>
  )
}

// ── backgrounds ────────────────────────────────────────────────────────────
/** A painted backdrop filling the frame, slowly pushing in; ``fallback`` a flat colour when there is none. */
function Backdrop({ src, fallback = '#2A2F3A' }) {
  const frame = useCurrentFrame()
  if (!src) {
    return (
      <AbsoluteFill style={{ backgroundColor: fallback }}>
        <NeatGrid color="rgba(255,255,255,0.06)" size={70} />
      </AbsoluteFill>
    )
  }
  return (
    <AbsoluteFill style={{ backgroundColor: fallback, overflow: 'hidden' }}>
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.02 + frame * 0.0006})` }} />
    </AbsoluteFill>
  )
}

const STUDIO = staticFile('decor/podcast/studio.jpg')

function useHost(brand, host, scene, voiceAt) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return {
    mouth: mouthAt(scene, frame, fps, voiceAt),
    female: host?.female !== false,
    shirt: lum(brand.color) > 0.75 ? '#3A6FD8' : brand.color || '#3A6FD8', // a near-white brand colour: a blue tee, so the print reads
    logo: brand.logo,
    print: !!host?.print,
  }
}

/** At the studio desk. */
function Studio({ brand, host, scene, voiceAt, pose = 'desk', mood, children }) {
  const set = useSet()
  const h = useHost(brand, host, scene, voiceAt)
  return (
    <AbsoluteFill style={{ backgroundColor: '#1C1612', '--hl-bg': brand.color, '--hl-text': lum(brand.color) > 0.6 ? INK : '#FFFFFF' }}>
      <Backdrop src={STUDIO} fallback="#2B211A" />
      <Host x={set.sitX} ground={set.desk + 31 * set.sitS} s={set.sitS} pose={pose} mood={mood || scene.mood} phones thing="mic" {...h} />
      {children}
    </AbsoluteFill>
  )
}

/** A card: white, an ink edge, a hard shadow — the comic look of the host. */
function Card({ children, delay = 6, style }) {
  const frame = useCurrentFrame()
  const { card: c } = useSet()
  const k = spring({ frame: frame - delay, fps: 30, config: { damping: 13 } })
  return (
    <div style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, minHeight: 0, maxHeight: c.h, background: '#FFFFFF', border: `5px solid ${INK}`, borderRadius: 30, boxShadow: `10px 12px 0 ${INK}`, padding: '40px 46px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 26, opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * 40}px) rotate(${(1 - k) * 2}deg)`, ...style }}>
      {children}
    </div>
  )
}

const Kicker = ({ icon, text, color, live = false }) => {
  const frame = useCurrentFrame()
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 12, padding: '6px 22px 6px 14px', borderRadius: 999, background: INK, color: '#FFFFFF', fontFamily: FONT, fontWeight: 700, fontSize: 32, lineHeight: 1.5 }}>
      {live && <div style={{ width: 16, height: 16, borderRadius: 8, background: '#FF3B3B', opacity: Math.floor(frame / 15) % 2 ? 0.35 : 1 }} />}
      <Icon name={icon} size={30} color={color} stroke={2.4} />
      {clean(text)}
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
/** On air: the episode's title on a card, the host waves hello. */
function Hook({ scene, brand, host, voiceAt }) {
  const { wide } = useSet()
  return (
    <Studio brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose={useCurrentFrame() < 50 ? 'talk' : 'desk'} mood="excited">
      <Card delay={8}>
        <Kicker icon="Mic" text={host?.kicker || 'PODCAST'} color={brand.color} live />
        <Words text={scene.text} delay={14} color={INK} style={{ fontSize: fitSize(scene.text, wide ? 70 : 78), fontWeight: 800, lineHeight: 1.4 }} />
      </Card>
    </Studio>
  )
}

/** At the desk, talking: the point on a card. */
function OnAir({ scene, brand, host, voiceAt }) {
  const { wide } = useSet()
  return (
    <Studio brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose={scene.gesture === 'shrug' ? 'shrug' : 'talk'}>
      <Card>
        <div style={{ width: wide ? 96 : 110, height: wide ? 96 : 110, borderRadius: 28, background: tint(brand.color, 0.14), border: `4px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
          <Icon name={scene.icon || 'MessageCircle'} size={wide ? 54 : 62} color={brand.color} stroke={2.4} />
        </div>
        <Words text={scene.text} delay={10} color={INK} style={{ fontSize: fitSize(scene.text, wide ? 62 : 70), fontWeight: 800, lineHeight: 1.4 }} />
      </Card>
    </Studio>
  )
}

/** Out in a place the story goes: the host stands there (or sits at a laptop), the line on a card. */
function Visit({ scene, brand, host, voiceAt, places }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const h = useHost(brand, host, scene, voiceAt)
  const src = (places || [])[(scene.place || 1) - 1]
  const pose = POSES[scene.pose] ? scene.pose : 'stand'
  const enter = spring({ frame: frame - 2, fps: 30, config: { damping: 15 } })
  const sit = pose === 'laptop'
  const think = spring({ frame: frame - 16, fps: 30, config: { damping: 10 } })
  const headTop = sit ? set.desk + 31 * set.sitS - 104 * set.sitS : set.ground - 100 * set.standS
  const hx = sit ? set.sitX : set.standX
  return (
    <AbsoluteFill style={{ backgroundColor: '#2A2F3A', '--hl-bg': brand.color, '--hl-text': lum(brand.color) > 0.6 ? INK : '#FFFFFF' }}>
      <Backdrop src={src ? srcOf(src) : null} />
      {sit ? (
        <Host x={set.sitX} ground={set.desk + 31 * set.sitS} s={set.sitS} pose="laptop" mood={scene.mood} thing="laptop" {...h} />
      ) : (
        <Host x={set.standX} ground={set.ground} s={set.standS} pose={pose} mood={scene.mood} enter={enter} {...h} />
      )}
      {scene.icon && (
        // what's on their mind, in a thought cloud by the head
        <div style={{ position: 'absolute', left: hx + (set.wide ? 110 : 120), top: headTop - (set.wide ? 40 : 60), transform: `scale(${think})`, transformOrigin: '0% 100%' }}>
          <div style={{ width: 130, height: 130, borderRadius: 65, background: '#FFFFFF', border: `5px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
            <Icon name={scene.icon} size={66} color={brand.color} stroke={2.4} />
          </div>
          <div style={{ position: 'absolute', left: -18, bottom: -10, width: 28, height: 28, borderRadius: 14, background: '#FFFFFF', border: `4px solid ${INK}` }} />
        </div>
      )}
      {scene.text && (
        <Card delay={8} style={set.wide ? { top: 90, minHeight: 0 } : { top: 280 }}>
          <Words text={scene.text} delay={12} color={INK} style={{ fontSize: fitSize(scene.text, set.wide ? 56 : 64), fontWeight: 800, lineHeight: 1.4 }} />
        </Card>
      )}
    </AbsoluteFill>
  )
}

const LIST_AT = (i) => 20 + i * 22 // podcastCues pops on these
function List({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const items = (scene.items || []).slice(0, 4)
  return (
    <Studio brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="talk">
      <Card delay={4}>
        {scene.title && <Words text={scene.title} delay={8} color={INK} style={{ fontSize: fitSize(scene.title, wide ? 54 : 60), fontWeight: 800, lineHeight: 1.4 }} />}
        {items.map((it, i) => {
          const k = spring({ frame: frame - LIST_AT(i), fps: 30, config: { damping: 13 } })
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: Math.min(1, k * 1.5), transform: `translateX(${(1 - k) * 40}px)` }}>
              <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 20, background: brand.color, border: `4px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
                <Icon name={it.icon || 'Check'} size={34} color="#FFFFFF" stroke={2.6} />
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(it.text, wide ? 42 : 46), color: INK, lineHeight: 1.4 }}>{clean(it.text)}</div>
            </div>
          )
        })}
      </Card>
    </Studio>
  )
}

const CTA_BUTTON = 26
function Cta({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const b = spring({ frame: frame - CTA_BUTTON, fps: 30, config: { damping: 10 } })
  return (
    <Studio brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="talk" mood="excited">
      <Card delay={4} style={{ alignItems: 'center', textAlign: 'center' }}>
        {brand.logo && <Img src={srcOf(brand.logo)} style={{ height: wide ? 90 : 104, maxWidth: 400, objectFit: 'contain' }} />}
        <Words text={scene.text} delay={8} align="center" color={INK} style={{ fontSize: fitSize(scene.text, wide ? 58 : 66), fontWeight: 800, lineHeight: 1.4, justifyContent: 'center' }} />
        {scene.button && (
          <div style={{ padding: '18px 52px', borderRadius: 999, background: brand.color, color: lum(brand.color) > 0.6 ? INK : '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `6px 7px 0 ${INK}`, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 42 : 48, opacity: Math.min(1, b * 1.5), transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.025)})` }}>{clean(scene.button)}</div>
        )}
      </Card>
    </Studio>
  )
}

/** [frame, sound] for a scene — the frames above (sfx.jsx). */
export function podcastCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[8, 'pop'], [14, 'pop']]
    case 'visit':
      return scene.icon ? [[8, 'pop'], [16, 'blop']] : [[8, 'pop']]
    case 'list':
      return (scene.items || []).slice(0, 4).map((_, i) => [LIST_AT(i), 'pop'])
    case 'cta':
      return scene.button ? [[4, 'pop'], [CTA_BUTTON, 'pop']] : [[4, 'pop']]
    default: // onair
      return [[6, 'pop']]
  }
}

export const PODCAST = {
  scenes: { hook: Hook, onair: OnAir, visit: Visit, list: List, cta: Cta },
  root: { backgroundColor: '#1C1612' },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 150 : 1660),
}
