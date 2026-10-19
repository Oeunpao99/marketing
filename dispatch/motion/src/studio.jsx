/**
 * "Collage · Studio" — the polished academy / studio Reel: a soft light-grey
 * set with slow light streaks, big thin words in the brand's deep colour, the
 * brand's own photos as rounded cards that stick together like a collage, and
 * depth from cut-out decorations — vines framing the edges, loose leaves
 * drifting past blurred in front, a stone column as a pedestal, clouds. The
 * decorations are drawn once and ship with the app (tools/make_decor.py →
 * public/decor/studio); the pictures are the brand kit's (app/motion.py
 * pick_pictures), else icon cards.
 * 9:16. Scene types: hook · collage · statement · pedestal · cta (app/motion.py STUDIO_TYPES).
 */
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, srcOf } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const decor = (name) => staticFile(`decor/studio/${name}.png`)

/** The brand's colour as [r, g, b] (props.brand.color may be "rgb(…)", "#hex" or a list). */
function rgbOf(c) {
  if (Array.isArray(c)) return c
  const s = String(c || '')
  const hex = s.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
  const nums = s.match(/\d+/g)
  return nums && nums.length >= 3 ? nums.slice(0, 3).map(Number) : [110, 30, 40]
}
const mix = ([r, g, b], [r2, g2, b2], t) => `rgb(${Math.round(r + (r2 - r) * t)}, ${Math.round(g + (g2 - g) * t)}, ${Math.round(b + (b2 - b) * t)})`
/** The ink: the brand's colour, deepened (a maroon from a red, a navy from a blue). */
const palette = (brand) => {
  const c = rgbOf(brand?.color)
  return { ink: mix(c, [18, 10, 14], 0.55), accent: mix(c, [0, 0, 0], 0.1), soft: mix(c, [255, 255, 255], 0.85) }
}

const useEnter = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}

/** The set: light grey, a soft white glow, a faint grid and slow diagonal light streaks. */
function Set() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ backgroundColor: '#E9E9EA', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.95), rgba(255,255,255,0) 62%)' }} />
      <AbsoluteFill
        style={{
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: -height * 0.2,
            left: width * (0.55 + i * 0.16) + Math.sin(frame / 90 + i) * 40,
            width: 60 + i * 50,
            height: height * 1.4,
            background: 'rgba(255,255,255,0.75)',
            filter: 'blur(26px)',
            transform: 'rotate(28deg)',
            opacity: 0.55,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

/** A cut-out decoration, drifting a little; `blur` for the ones in front (depth). */
function Decor({ name, x, y, w, rotate = 0, flip = false, blur = 0, drift = 1, delay = 0, opacity = 1, fringe = false }) {
  const frame = useCurrentFrame()
  const s = useEnter(delay, 22)
  const dx = Math.sin(frame / 70 + x) * 14 * drift
  const dy = Math.cos(frame / 85 + y) * 10 * drift
  const style = {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    transform: `translate(${dx}px, ${dy + (1 - s) * 60}px) rotate(${rotate}deg) scaleX(${flip ? -1 : 1})`,
    filter: blur ? `blur(${blur}px)` : undefined,
    opacity: opacity * Math.min(1, s * 1.4),
  }
  if (fringe) {
    // a lens's colour fringe on the nearest object: red and blue copies, offset
    return (
      <div style={style}>
        <Img src={decor(name)} style={{ position: 'absolute', width: '100%', left: -10, mixBlendMode: 'multiply', opacity: 0.55, filter: 'sepia(1) saturate(6) hue-rotate(-50deg)' }} />
        <Img src={decor(name)} style={{ position: 'absolute', width: '100%', left: 10, mixBlendMode: 'multiply', opacity: 0.55, filter: 'sepia(1) saturate(6) hue-rotate(180deg)' }} />
        <Img src={decor(name)} style={{ position: 'relative', width: '100%' }} />
      </div>
    )
  }
  return <Img src={decor(name)} style={style} />
}

/** A big thin word ("Creative", "Portfolio") in the brand's deep colour. */
function BigWord({ text, top, align = 'center', size = 170, ink, delay = 0.1, left = 0, right = 0 }) {
  const s = useEnter(delay, 20)
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top, left, right, textAlign: align, fontFamily: FONT, fontWeight: 200, fontSize: size, lineHeight: 1.1, color: ink, letterSpacing: '-0.01em', opacity: s, transform: `translateY(${(1 - s) * 40}px)`, filter: `blur(${(1 - s) * 10}px)` }}>
      {clean(text)}
    </div>
  )
}

/** A rounded photo card that drops in and "sticks" — a slight overshoot, a settle, a soft shadow. */
function Card({ src, icon, label, x, y, w, h, rotate = 0, delay = 0, zoom = true, children, ink }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 11, mass: 0.7 } })
  const f = frame - Math.round(delay * fps)
  if (f < 0) return null
  const push = zoom ? 1 + interpolate(f, [0, 180], [0, 0.08], clamp) : 1
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 34,
        overflow: 'hidden',
        background: '#FFFFFF',
        boxShadow: `0 ${30 * s}px ${70 * s}px rgba(0,0,0,${0.22 * s})`,
        transform: `scale(${1.18 - 0.18 * s}) rotate(${rotate * s + (1 - s) * rotate * 3}deg)`,
        opacity: Math.min(1, s * 2),
      }}
    >
      {src ? (
        <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${push})` }} />
      ) : (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 18, background: '#F7F7F8' }}>
          <Icon name={icon || 'Sparkles'} size={Math.min(w, h) * 0.32} color={ink} stroke={1.4} />
          {label && <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: Math.min(42, w * 0.11), color: ink, textAlign: 'center', padding: '0 20px' }}>{clean(label)}</div>}
        </AbsoluteFill>
      )}
      {children}
    </div>
  )
}

// ── hook: a big thin word + the main card with its line on it ─────────────
function Hook({ scene, brand }) {
  const { width } = useVideoConfig()
  const P = palette(brand)
  const line = useEnter(0.8, 18)
  return (
    <AbsoluteFill>
      <Set />
      <Decor name="vines" x={width - 520} y={150} w={620} rotate={8} flip delay={0.2} drift={0.6} />
      <BigWord text={scene.word} top={270} ink={P.ink} />
      <Card src={scene.image} icon={scene.icon} x={(width - 880) / 2} y={500} w={880} h={900} delay={0.25} ink={P.ink}>
        {scene.image && <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55))' }} />}
        <div style={{ position: 'absolute', left: 50, right: 50, bottom: 60, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
          <Words text={scene.text} align="center" color={scene.image ? '#FFFFFF' : P.ink} style={{ fontSize: 62, fontWeight: 500, lineHeight: 1.4, justifyContent: 'center', textShadow: scene.image ? '0 2px 18px rgba(0,0,0,0.5)' : undefined, '--hl-bg': P.accent, '--hl-text': '#FFFFFF' }} />
        </div>
      </Card>
      <Decor name="leaves" x={-330} y={1440} w={700} blur={9} drift={1.6} delay={0.4} opacity={0.95} />
    </AbsoluteFill>
  )
}

// ── collage: 2-5 cards sticking together + a big thin word ────────────────
const SPOTS = [
  // x, y, w, h, rotate — a loose wall: one big, the rest around it
  [70, 400, 560, 660, -3],
  [660, 360, 360, 450, 4],
  [650, 850, 380, 430, -2],
  [110, 1090, 440, 290, 3],
  [440, 250, 250, 280, -6],
]
function Collage({ scene, brand }) {
  const P = palette(brand)
  const frame = useCurrentFrame()
  const pics = (scene.images || []).slice(0, 5)
  const items = (scene.tiles || []).slice(0, 5)
  const n = Math.max(2, Math.min(5, pics.length || items.length || 3))
  const pan = interpolate(frame, [0, 200], [0, -40], clamp)
  return (
    <AbsoluteFill>
      <Set />
      <Decor name="sprig" x={800} y={190} w={240} rotate={-150} delay={0.6} drift={0.5} />
      <AbsoluteFill style={{ transform: `translateY(${pan}px)` }}>
        {SPOTS.slice(0, n).map(([x, y, w, h, r], i) => (
          <Card key={i} src={pics[i]} icon={items[i]?.icon} label={items[i]?.label} x={x} y={y} w={w} h={h} rotate={r} delay={0.2 + i * 0.32} ink={P.ink} />
        ))}
      </AbsoluteFill>
      <BigWord text={scene.word} top={1300} align="right" right={70} size={130} ink={P.ink} delay={0.3 + n * 0.32} />
      <Decor name="leaves" x={-300} y={-60} w={700} rotate={160} blur={10} drift={2.2} delay={0.1} opacity={0.9} />
    </AbsoluteFill>
  )
}

// ── statement: one line framed by vines, the column rising below ─────────
function Statement({ scene, brand }) {
  const { width } = useVideoConfig()
  const P = palette(brand)
  const frame = useCurrentFrame()
  const push = 1 + interpolate(frame, [0, 200], [0, 0.05], clamp)
  const sub = useEnter(1.2, 18)
  return (
    <AbsoluteFill>
      <Set />
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Decor name="vines" x={-120} y={120} w={640} delay={0.05} drift={0.7} />
        <Decor name="vines" x={width - 430} y={40} w={500} rotate={-8} flip delay={0.15} drift={0.7} />
        <div style={{ position: 'absolute', left: 90, right: 120, top: 640 }}>
          <Words text={scene.text} align="left" color={P.ink} delay={8} style={{ fontSize: 92, fontWeight: 300, lineHeight: 1.35, justifyContent: 'flex-start', '--hl-bg': P.soft, '--hl-text': P.ink }} />
          {scene.sub && (
            <div style={{ marginTop: 30, fontFamily: FONT, fontWeight: 300, fontSize: 46, color: P.ink, opacity: 0.75 * sub }}>{clean(scene.sub)}</div>
          )}
        </div>
        <Decor name="column" x={(width - 900) / 2 - 60} y={1080} w={900} delay={0.35} drift={0.3} />
      </AbsoluteFill>
      <Decor name="leaves" x={560} y={1250} w={720} rotate={20} blur={11} drift={2.4} delay={0.5} />
    </AbsoluteFill>
  )
}

// ── pedestal: the logo / product on the column, clouds, two side captions ─
function Pedestal({ scene, brand }) {
  const { width } = useVideoConfig()
  const P = palette(brand)
  const frame = useCurrentFrame()
  const tile = useEnter(0.45, 11)
  const title = useEnter(0.9, 14)
  const sides = useEnter(1.3, 18)
  const src = scene.image || brand?.logo
  const float = Math.sin(frame / 22) * 10
  return (
    <AbsoluteFill>
      <Set />
      <Decor name="clouds" x={-200} y={1150} w={1480} delay={0} drift={0.8} opacity={0.95} />
      <Decor name="column" x={(width - 860) / 2} y={1010} w={860} delay={0.15} drift={0.2} />
      <Decor name="sprig" x={70} y={620} w={240} rotate={-30} delay={0.6} />
      <Decor name="sprig" x={width - 310} y={620} w={240} rotate={30} flip delay={0.7} />
      {/* the hero tile on the pedestal */}
      <div
        style={{
          position: 'absolute',
          left: (width - 440) / 2,
          top: 560 + float,
          width: 440,
          height: 440,
          borderRadius: 96,
          overflow: 'hidden',
          background: src ? '#FFFFFF' : P.accent,
          border: '10px solid rgba(255,255,255,0.85)',
          boxShadow: `0 30px 80px ${P.accent.replace('rgb', 'rgba').replace(')', ', 0.45)')}, 0 0 0 2px rgba(0,0,0,0.04)`,
          transform: `scale(${tile})`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {src ? <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: scene.image ? 'cover' : 'contain', padding: scene.image ? 0 : 40 }} /> : <Icon name={scene.icon || 'Sparkles'} size={220} color="#FFFFFF" stroke={1.6} />}
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 1030, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 88, letterSpacing: '0.02em', color: P.ink, opacity: title, transform: `translateY(${(1 - title) * 30}px)`, textShadow: '0 4px 30px rgba(255,255,255,0.9)' }}>
        {clean(scene.title)}
      </div>
      {[scene.left, scene.right].map((t, i) =>
        t ? (
          <div key={i} style={{ position: 'absolute', top: 330, [i ? 'right' : 'left']: 70, width: 400, textAlign: i ? 'right' : 'left', fontFamily: FONT, fontWeight: 300, fontSize: 44, lineHeight: 1.3, color: P.ink, opacity: sides, transform: `translateX(${(1 - sides) * (i ? 40 : -40)}px)` }}>
            {clean(t)}
          </div>
        ) : null,
      )}
      <Decor name="column" x={width - 260} y={1180} w={700} rotate={-8} blur={7} fringe drift={1.4} delay={0.3} opacity={0.9} />
    </AbsoluteFill>
  )
}

// ── cta ────────────────────────────────────────────────────────────────────
function Cta({ scene, brand }) {
  const { width } = useVideoConfig()
  const P = palette(brand)
  const frame = useCurrentFrame()
  const b = useEnter(1.0, 12)
  const logo = useEnter(0.2, 14)
  return (
    <AbsoluteFill>
      <Set />
      <Decor name="vines" x={-140} y={60} w={620} delay={0} drift={0.6} />
      <Decor name="vines" x={width - 480} y={60} w={620} flip delay={0.1} drift={0.6} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 50, paddingBottom: 260 }}>
        {brand?.logo && (
          <div style={{ background: '#FFFFFF', borderRadius: 30, padding: '22px 34px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)', transform: `scale(${logo})` }}>
            <Img src={srcOf(brand.logo)} style={{ height: 120, maxWidth: 520, objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ maxWidth: 900 }}>
          <Words text={scene.text} align="center" color={P.ink} delay={6} style={{ fontSize: 88, fontWeight: 300, lineHeight: 1.35, justifyContent: 'center', '--hl-bg': P.soft, '--hl-text': P.ink }} />
        </div>
        {scene.button && (
          <div style={{ padding: '24px 60px', borderRadius: 999, background: P.ink, color: '#FFFFFF', fontFamily: FONT, fontWeight: 600, fontSize: 46, opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) scale(${1 + Math.sin(frame / 9) * 0.02 * b})`, boxShadow: '0 18px 40px rgba(0,0,0,0.2)' }}>
            {clean(scene.button)}
          </div>
        )}
      </AbsoluteFill>
      <Decor name="leaves" x={-200} y={1300} w={760} blur={10} drift={2.2} delay={0.4} />
    </AbsoluteFill>
  )
}

export const STUDIO = {
  scenes: { hook: Hook, collage: Collage, statement: Statement, pedestal: Pedestal, cta: Cta },
  root: { backgroundColor: '#E9E9EA' },
  light: true, // the white logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
