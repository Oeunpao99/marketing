/**
 * "Story · Characters" — the Khmer cartoon-story Reel: two simple characters
 * (round heads, stick bodies, a cap or an apron) in one place — a shop, a
 * market, an office — drawn once per video by the image model
 * (app/doodle.py draw_place → props.place.image), talking in speech bubbles,
 * thinking in clouds with an icon, the thing they talk about popping up next
 * to them, a clipboard list ticking itself off. The characters are drawn
 * here, so they stay the same people in every scene; the camera moves to who
 * is speaking. The story's question stays on top, key words in red.
 * 9:16 and 16:9. Scene types: hook · talk · note · cta
 * (app/motion.py CARTOON_TYPES); props.cast = the two characters.
 */
import { createContext, useContext } from 'react'
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { EM_CLOSE, EM_OPEN, FONT, Icon, ZWSP, clean, fitSize, srcOf } from './shared'
import { Figure } from './characters'

const C = { ink: '#151515', red: '#E5452F', skin: '#FFFFFF', blush: '#F6A5A5', wall: '#F4EBDD', floor: '#E2D6C4', paper: '#FFFFFF' }
const KHMER = /[ក-៿]/
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

/** Where everything goes. The world is wider than a tall frame: the camera
 * moves along it to whoever is speaking. */
function useWorld() {
  const { width: W, height: H, fps } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  const worldW = wide ? W * 1.08 : H * 1.5
  const xs = wide ? [0.3, 0.7] : [0.385, 0.615]
  return {
    W, H, fps, wide, u, worldW,
    ground: wide ? H * 0.8 : 1420 * u,
    charH: (wide ? 520 : 640) * u,
    x: (who) => worldW * xs[who === 2 ? 1 : 0],
  }
}

// What the camera sees of the world (Stage sets it): bubbles, items and the
// clipboard keep inside it.
const View = createContext({ left: 0, right: 99999 })
const inView = (view, center, w, pad) => Math.max(view.left + pad + w / 2, Math.min(view.right - pad - w / 2, center))

// ── the place ──────────────────────────────────────────────────────────────
/** The AI-drawn place, or a plain room when there's none. */
function Place({ place }) {
  const { H, worldW, ground, u } = useWorld()
  if (place?.image) {
    return (
      <div style={{ position: 'absolute', left: 0, top: 0, width: worldW, height: H }}>
        <Img src={srcOf(place.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* a little lighter, so the characters stand out from the drawing */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.22)' }} />
      </div>
    )
  }
  return (
    <svg width={worldW} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
      <rect width={worldW} height={H} fill={C.wall} />
      <rect y={ground - 30 * u} width={worldW} height={H} fill={C.floor} />
      <line x1={0} x2={worldW} y1={ground - 30 * u} y2={ground - 30 * u} stroke={C.ink} strokeWidth={4 * u} />
      {[0.14, 0.5, 0.86].map((x, i) => (
        <g key={i} stroke={C.ink} strokeWidth={4 * u} fill="#DDEBF2">
          <rect x={worldW * x - 150 * u} y={H * 0.2} width={300 * u} height={260 * u} rx={10 * u} />
          <line x1={worldW * x} x2={worldW * x} y1={H * 0.2} y2={H * 0.2 + 260 * u} />
        </g>
      ))}
    </svg>
  )
}

// ── the characters ─────────────────────────────────────────────────────────
/** One of the two (characters.jsx), standing at their place in the world. */
function Person({ who, cast, ...rest }) {
  const { x, ground, charH } = useWorld()
  const p = cast || {}
  return <Figure x={x(who)} ground={ground} h={charH} look={p.look} color={p.color} fallback={who === 2 ? 'grey' : 'teal'} seed={who} {...rest} />
}

// ── words ──────────────────────────────────────────────────────────────────
function pieces(text) {
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

/** Words popping in one by one; [key words] in red. Khmer never splits inside a word. */
export function Pop({ text, size, width, delay = 0, outline = false, color = C.ink, accent = C.red, align = 'center', step = 2 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const km = KHMER.test(clean(text))
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', justifyContent: align === 'left' ? 'flex-start' : 'center', alignItems: 'baseline', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(text, size), lineHeight: km ? 1.45 : 1.12, letterSpacing: km ? 0 : '-0.015em' }}>
      {pieces(text).map(({ p, gap, em }, n) => {
        const s = spring({ frame: frame - Math.round(delay * fps) - n * step, fps, config: { damping: 12, mass: 0.5 } })
        return (
          <span key={n} style={{ display: 'inline-block', marginRight: gap ? '0.24em' : 0, color: em ? accent : color, opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 22}px) scale(${0.85 + 0.15 * s})`, WebkitTextStroke: outline ? `0.16em white` : undefined, paintOrder: 'stroke fill' }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

/** The story's question across the top of every scene, like the Reel. */
function TopTitle({ text, delay = 0, big = false }) {
  const { W, wide, u } = useWorld()
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 40 : big ? 230 : 190) * u, display: 'flex', justifyContent: 'center' }}>
      <Pop text={text} size={(big ? (wide ? 96 : 104) : wide ? 64 : 72) * u} width={W * (wide ? 0.7 : 0.9)} delay={delay} outline step={big ? 2 : 0} />
    </div>
  )
}

/** A speech bubble over the speaker (or a thought cloud with an icon). */
function Bubble({ who, text, think, icon, delay = 0.2 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { x, ground, charH, u, wide } = useWorld()
  const p = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 11, mass: 0.6 } })
  const w = (think && !text ? 300 : wide ? 620 : 660) * u // a cloud with just its icon stays small
  const headTop = ground - charH * 0.97
  const view = useContext(View)
  const cx = inView(view, x(who) + (who === 1 ? 1 : -1) * (wide ? 120 : 90) * u, w, 30 * u)
  // wide frames are short: a thought with words sits lower and leaves its icon
  // out, or it runs into the story's title across the top
  const roomy = !(wide && think && text)
  const bottom = headTop - (think ? (roomy ? 70 : 44) : 34) * u
  const tail = x(who) + (who === 1 ? 30 : -30) * u
  return (
    <div style={{ position: 'absolute', left: cx - w / 2, width: w, top: bottom, transform: `translateY(-100%) scale(${p})`, transformOrigin: `${tail - (cx - w / 2)}px 100%`, opacity: Math.min(1, p * 2) }}>
      {think ? (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u, padding: `${34 * u}px ${44 * u}px`, background: 'white', border: `${5 * u}px solid ${C.ink}`, borderRadius: '48% 52% 46% 54% / 56% 50% 50% 44%' }}>
          {icon && roomy && <Icon name={icon} size={(text ? 92 : 140) * u} color={C.red} stroke={2.2} />}
          {text && <Pop text={text} size={50 * u} width={w * 0.82} delay={delay + 0.2} />}
        </div>
      ) : (
        <div style={{ padding: `${26 * u}px ${34 * u}px`, background: 'white', border: `${5 * u}px solid ${C.ink}`, borderRadius: 40 * u, boxShadow: `${6 * u}px ${7 * u}px 0 rgba(0,0,0,0.12)` }}>
          <Pop text={text} size={54 * u} width={w - 78 * u} delay={delay + 0.15} />
        </div>
      )}
      {/* the tail: a triangle to the mouth, or two small puffs to the head */}
      {think ? (
        [18, 11].map((r, i) => <div key={i} style={{ position: 'absolute', left: tail - (cx - w / 2) - r * u + (who === 1 ? -1 : 1) * i * 14 * u, top: `calc(100% + ${(8 + i * 30) * u}px)`, width: r * 2 * u, height: r * 2 * u, borderRadius: 99, background: 'white', border: `${4 * u}px solid ${C.ink}` }} />)
      ) : (
        <svg width={60 * u} height={42 * u} style={{ position: 'absolute', left: tail - (cx - w / 2) - 30 * u, top: `calc(100% - ${5 * u}px)`, overflow: 'visible' }}>
          <path d={`M ${8 * u} 0 L ${30 * u + (who === 1 ? -14 : 14) * u} ${40 * u} L ${52 * u} 0`} fill="white" stroke={C.ink} strokeWidth={5 * u} strokeLinejoin="round" />
          <rect x={10 * u} y={-6 * u} width={40 * u} height={8 * u} fill="white" />
        </svg>
      )}
    </div>
  )
}

/** The thing a line is about, popping up beside the speaker (outer side). */
function Item({ who, item, delay = 0.6 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { x, ground, charH, u } = useWorld()
  const p = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 10, mass: 0.6 } })
  const size = 230 * u
  const view = useContext(View)
  // between the two, as if shown to the other one
  const left = inView(view, x(who) + (who === 1 ? 1 : -1) * 175 * u, size, 20 * u) - size / 2
  const float = Math.sin(frame / 10) * 6 * u
  return (
    <div style={{ position: 'absolute', left, top: ground - charH * 0.62 - size / 2 + float, width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 * u, transform: `scale(${p}) rotate(${(1 - p) * -20 + (who === 1 ? -4 : 4)}deg)` }}>
      <div style={{ width: size * 0.78, height: size * 0.78, borderRadius: 34 * u, background: 'white', border: `${5 * u}px solid ${C.ink}`, display: 'grid', placeItems: 'center', boxShadow: `${6 * u}px ${7 * u}px 0 rgba(0,0,0,0.12)` }}>
        <Icon name={item.icon || 'Package'} size={size * 0.44} color={C.red} stroke={2.2} />
      </div>
      {item.label && <div style={{ padding: `${4 * u}px ${18 * u}px`, borderRadius: 999, background: C.ink, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: fitSize(item.label, 38 * u), lineHeight: 1.5, whiteSpace: 'nowrap' }}>{clean(item.label)}</div>}
    </div>
  )
}

/** A clipboard held up beside the speaker, its lines ticking off. */
function Clipboard({ who, title, checks = [], delay = 0.3 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { x, ground, charH, u, wide } = useWorld()
  const p = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 12 } })
  const w = (wide ? 420 : 440) * u
  const view = useContext(View)
  const left = inView(view, x(who) + (who === 1 ? 1 : -1) * (110 * u + w / 2), w, 24 * u) - w / 2
  return (
    <div style={{ position: 'absolute', left, top: ground - charH * 1.02, width: w, transform: `translateY(${(1 - p) * 120 * u}px) rotate(${who === 1 ? -3 : 3}deg)`, opacity: Math.min(1, p * 1.5) }}>
      <div style={{ background: '#C9873E', border: `${5 * u}px solid ${C.ink}`, borderRadius: 22 * u, padding: 20 * u }}>
        <div style={{ position: 'relative', background: C.paper, border: `${3 * u}px solid ${C.ink}`, borderRadius: 10 * u, padding: `${36 * u}px ${24 * u}px ${24 * u}px`, display: 'flex', flexDirection: 'column', gap: 14 * u }}>
          <div style={{ position: 'absolute', left: '50%', top: -26 * u, transform: 'translateX(-50%)', width: 130 * u, height: 40 * u, borderRadius: 10 * u, background: '#B8BCC4', border: `${4 * u}px solid ${C.ink}` }} />
          {title && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(title, 46 * u), color: C.ink, lineHeight: 1.45, textAlign: 'center' }}>{clean(title)}</div>}
          {checks.map((c, i) => {
            const at = delay * fps + 14 + i * 16
            const tick = interpolate(frame, [at, at + 8], [0, 1], clamp)
            const show = interpolate(frame, [at - 8, at], [0, 1], clamp)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 * u, opacity: show }}>
                <svg width={40 * u} height={40 * u} style={{ flex: 'none', overflow: 'visible' }}>
                  <rect x={2 * u} y={2 * u} width={34 * u} height={34 * u} rx={5 * u} fill="white" stroke={C.ink} strokeWidth={3.5 * u} />
                  <path d={`M ${8 * u} ${20 * u} L ${17 * u} ${29 * u} L ${40 * u} ${2 * u}`} fill="none" stroke={C.red} strokeWidth={6 * u} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tick} />
                </svg>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(c, 38 * u), color: C.ink, lineHeight: 1.45 }}>{clean(c)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Small sparkles round the place — the Reel's ✦. */
function Sparkles() {
  const frame = useCurrentFrame()
  const { worldW, H, u } = useWorld()
  return Array.from({ length: 6 }, (_, i) => {
    const s = 0.6 + 0.4 * Math.sin(frame / 7 + i * 1.7)
    return <div key={i} style={{ position: 'absolute', left: random(`cx${i}`) * worldW, top: H * (0.3 + random(`cy${i}`) * 0.4), fontSize: 44 * u, color: '#F2C230', transform: `scale(${s})`, textShadow: `0 0 ${2 * u}px ${C.ink}` }}>✦</div>
  })
}

// ── the stage: the world, the camera and the two people ────────────────────
function Stage({ scene, cast, place, story, focus, children, title = true, mood }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()
  const { W, H, worldW, x } = useWorld()
  // the camera: centred between the two, leaning towards whoever is in focus, pushing in a little
  const mid = (x(1) + x(2)) / 2
  const lean = focus ? (x(focus) - mid) * 0.18 : 0
  const ease = interpolate(frame, [0, Math.min(durationInFrames, 1.2 * fps)], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const center = mid + lean * ease
  const camX = Math.max(0, Math.min(worldW - W, center - W / 2))
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.04], clamp)
  const speaker = scene.who === 2 ? 2 : 1
  const people = cast?.length ? cast : [{}, {}]
  return (
    <AbsoluteFill style={{ backgroundColor: C.wall, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: worldW, height: H, transform: `scale(${zoom}) translateX(${-camX}px)`, transformOrigin: `${center}px ${H * 0.6}px` }}>
        <View.Provider value={{ left: camX + W * 0.03, right: camX + W * 0.97 }}>
        <Place place={place} />
        <Sparkles />
        <Person who={1} cast={people[0]} mood={speaker === 1 ? mood || scene.mood : 'happy'} talking={focus === 1} wave={scene.type === 'cta'} enter={1} />
        <Person who={2} cast={people[1]} mood={speaker === 2 ? mood || scene.mood : 'happy'} talking={focus === 2} wave={scene.type === 'cta'} enter={1} flip />
        {children}
        </View.Provider>
      </div>
      {title && story?.title && <TopTitle text={story.title} />}
    </AbsoluteFill>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene, cast, place }) {
  return (
    <Stage scene={scene} cast={cast} place={place} title={false} mood={scene.mood || 'thinking'}>
      {scene.icon && <Bubble who={scene.who === 2 ? 2 : 1} think icon={scene.icon} delay={0.9} />}
      <HookTitle text={scene.text} />
    </Stage>
  )
}
function HookTitle({ text }) {
  const { worldW, x } = useWorld()
  // drawn in the world, so it sits above the pair wherever the camera is
  return (
    <div style={{ position: 'absolute', left: (x(1) + x(2)) / 2 - worldW / 2, width: worldW }}>
      <TopTitle text={text} big />
    </div>
  )
}

function Talk({ scene, cast, place, story }) {
  const who = scene.who === 2 ? 2 : 1
  return (
    <Stage scene={scene} cast={cast} place={place} story={story} focus={who}>
      <Bubble who={who} text={scene.text} think={scene.think} icon={scene.icon} />
      {scene.item && <Item who={who} item={scene.item} />}
    </Stage>
  )
}

function Note({ scene, cast, place, story }) {
  const who = scene.who === 2 ? 2 : 1
  return (
    <Stage scene={scene} cast={cast} place={place} story={story} focus={who}>
      <Clipboard who={who} title={scene.title} checks={scene.checks} />
    </Stage>
  )
}

function Cta({ scene, cast, place, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, worldW, x, wide } = useWorld()
  const b = spring({ frame: frame - Math.round(1.0 * fps), fps, config: { damping: 11 } })
  return (
    <Stage scene={scene} cast={cast} place={place} title={false} mood="excited">
      <HookTitle text={scene.text} />
      {scene.button && (
        <div style={{ position: 'absolute', left: (x(1) + x(2)) / 2 - worldW / 2, width: worldW, top: (wide ? 210 : 560) * u, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 * u }}>
          {brand?.logo && <Img src={srcOf(brand.logo)} style={{ height: 110 * u, maxWidth: 420 * u, objectFit: 'contain', background: 'white', borderRadius: 18 * u, padding: 12 * u, opacity: Math.min(1, b * 1.5) }} />}
          <div style={{ padding: `${20 * u}px ${54 * u}px`, borderRadius: 999, background: C.red, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: 48 * u, border: `${5 * u}px solid ${C.ink}`, boxShadow: `${6 * u}px ${7 * u}px 0 ${C.ink}`, transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.02)}) rotate(-2deg)` }}>{clean(scene.button)}</div>
        </div>
      )}
    </Stage>
  )
}

export const CARTOON = {
  scenes: { hook: Hook, talk: Talk, note: Note, cta: Cta },
  root: { backgroundColor: C.wall },
  light: true, // the logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
