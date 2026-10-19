/**
 * "Doodle notes" — the Khmer self-help Reel look: pale grey grid paper, the
 * brand's logo top-left, a bold two-line headline with its key words in
 * orange, and under it a hand-drawn ink sketch (a person lying awake, a head
 * full of scribbles…) that draws itself in and then wobbles a little like a
 * pen drawing. The sketches are made per scene by the image model and turned
 * transparent by the server (app/doodle.py → scene.image); without one, the
 * scene's icon is drawn in ink with a few scribbled strokes round it.
 * 9:16 and 16:9. Scene types: hook · doodle · list · quote · cta
 * (app/motion.py DOODLE_TYPES).
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { EM_CLOSE, EM_OPEN, FONT, Icon, NeatGrid, ZWSP, clean, fitSize, srcOf } from './shared'

const C = { paper: '#E7E7E5', grid: 'rgba(255,255,255,0.85)', ink: '#181B1A', orange: '#E8641C', soft: '#55605A' }
const KHMER = /[ក-៿]/
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

function useLayout() {
  const { width, height, fps } = useVideoConfig()
  const wide = width > height
  const u = Math.min(width, height) / 1080
  // tall: the logo sits above 230, the subtitles start at 1480
  return { width, height, fps, wide, u, top: (wide ? 120 : 250) * u, bottom: (wide ? 230 : 460) * u, content: wide ? width * 0.42 : width * 0.86 }
}
const useEnter = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}

/** The page: flat pale grey, white grid lines. */
function Paper() {
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <NeatGrid color={C.grid} size={58} />
    </AbsoluteFill>
  )
}

/**
 * The headline: words pop in one by one; [bracketed] words are orange and a
 * size bigger, the way the Reel says the key word. Khmer is never split
 * inside a word (the script's zero-width spaces mark the breaks).
 */
function Headline({ text, size, width, delay = 0.1, align = 'center' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pieces = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === EM_OPEN) em = true
        else if (bit === EM_CLOSE) em = false
        else pieces.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && pieces.length) pieces[pieces.length - 1].gap = true
    })
  }
  const km = KHMER.test(clean(text))
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily: FONT, fontSize: fitSize(text, size), fontWeight: 800, lineHeight: km ? 1.5 : 1.12, letterSpacing: km ? 0 : '-0.02em', color: C.ink }}>
      {pieces.map(({ p, gap, em: hi }, n) => {
        const s = spring({ frame: frame - Math.round(delay * fps) - n * 3, fps, config: { damping: 12, mass: 0.5 } })
        return (
          <span key={n} style={{ display: 'inline-block', marginRight: gap ? '0.26em' : 0, color: hi ? C.orange : C.ink, fontSize: hi ? '1.22em' : '1em', opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 30}px) scale(${0.8 + 0.2 * s})` }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

/** A body line in ink (Khmer-safe). */
function Line({ text, size, width, color = C.soft, align = 'center', weight = 600 }) {
  return <div style={{ width, fontFamily: FONT, color, fontWeight: weight, fontSize: fitSize(text, size), lineHeight: KHMER.test(clean(text)) ? 1.55 : 1.25, textAlign: align }}>{clean(text)}</div>
}

/** Pen "boil": the drawing shifts a hair every few frames, like a hand-drawn cartoon. */
const boil = (frame, seed, u) => {
  const k = Math.floor(frame / 5)
  return `translate(${(random(`${seed}x${k}`) - 0.5) * 3 * u}px, ${(random(`${seed}y${k}`) - 0.5) * 3 * u}px) rotate(${(random(`${seed}r${k}`) - 0.5) * 0.7}deg)`
}

/**
 * The scene's sketch, drawing itself in: a soft edge sweeps across it, top
 * left to bottom right, then it keeps a gentle pen wobble. No sketch → the
 * icon drawn line by line, with scribbled strokes round it.
 */
function Sketch({ scene, box, delay = 0.35 }) {
  const frame = useCurrentFrame()
  const { fps, u } = { ...useVideoConfig(), ...useLayout() }
  const p = interpolate(frame, [delay * fps, delay * fps + 1.3 * fps], [0, 1], clamp)
  const at = -30 + p * 160 // the wipe's edge, % along the diagonal
  const mask = `linear-gradient(135deg, black ${at - 25}%, transparent ${at}%)`
  if (scene.image) {
    return (
      <div style={{ width: box, height: box, display: 'grid', placeItems: 'center', transform: boil(frame, 'sk', u) }}>
        <Img src={srcOf(scene.image)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', maskImage: mask, WebkitMaskImage: mask }} />
      </div>
    )
  }
  const icon = box * 0.26 // a small ink icon — the drawing is the star, this only stands in for it
  return (
    <div style={{ position: 'relative', width: box * 0.6, height: box * 0.48, display: 'grid', placeItems: 'center', transform: boil(frame, 'sk', u) }}>
      <Scribbles size={box * 0.6} progress={p} />
      {/* stroke-dash props inherit into the icon's paths: they draw themselves */}
      <div style={{ strokeDasharray: 140, strokeDashoffset: 140 * (1 - p) }}>
        <Icon name={scene.icon || 'Brain'} size={icon} color={C.ink} stroke={0.9} />
      </div>
    </div>
  )
}

/** Short pen strokes round a drawing — stress lines, the Reel's hatching. */
function Scribbles({ size, progress }) {
  const r = size / 2
  const marks = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + random(`a${i}`) * 0.3
    const d = r * (0.62 + random(`d${i}`) * 0.22)
    const len = size * (0.05 + random(`l${i}`) * 0.05)
    const tilt = a + (random(`t${i}`) - 0.5) * 0.9
    const x = r + Math.cos(a) * d
    const y = r * 0.8 + Math.sin(a) * d * 0.72
    return { x1: x, y1: y, x2: x + Math.cos(tilt) * len, y2: y + Math.sin(tilt) * len, at: i / 14 }
  })
  return (
    <svg width={size} height={size * 0.8} style={{ position: 'absolute', inset: 0 }}>
      {marks.map((m, i) => (
        <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={i % 5 === 2 ? C.orange : C.ink} strokeWidth={size * 0.006} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - interpolate(progress, [m.at * 0.7, m.at * 0.7 + 0.3], [0, 1], clamp)} />
      ))}
    </svg>
  )
}

/** A hand-drawn orange line under something, drawing itself. */
function Underline({ width, delay = 0.6 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u } = useLayout()
  const p = interpolate(frame, [delay * fps, delay * fps + 12], [0, 1], clamp)
  const h = 26 * u
  return (
    <svg width={width} height={h} style={{ overflow: 'visible' }}>
      <path d={`M 4 ${h * 0.6} C ${width * 0.3} ${h * 0.15}, ${width * 0.6} ${h * 0.95}, ${width - 4} ${h * 0.35}`} fill="none" stroke={C.orange} strokeWidth={7 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  )
}

/** A scene: the paper and its content — stacked in 9:16, side by side in 16:9. */
function Page({ children, gap = 40 }) {
  const { u, top, bottom } = useLayout()
  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ top, bottom, height: 'auto', justifyContent: 'center', alignItems: 'center', gap: gap * u, fontFamily: FONT }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}
function Split({ text, sketch }) {
  const { u, width } = useLayout()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60 * u, width: width * 0.84 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 26 * u }}>{text}</div>
      {sketch}
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene }) {
  const { u, wide, content } = useLayout()
  const head = <Headline text={scene.text} size={(wide ? 104 : 118) * u} width={content} align={wide ? 'left' : 'center'} />
  const sketch = <Sketch scene={scene} box={(wide ? 600 : 760) * u} delay={0.45} />
  return <Page gap={30}>{wide ? <Split text={head} sketch={sketch} /> : [<div key="h">{head}</div>, <div key="s">{sketch}</div>]}</Page>
}

function Doodle({ scene }) {
  const { u, wide, content } = useLayout()
  const line = useEnter(1.1)
  const head = <Headline text={scene.title} size={(wide ? 88 : 96) * u} width={content} align={wide ? 'left' : 'center'} />
  const text = scene.text && (
    <div style={{ opacity: line, transform: `translateY(${(1 - line) * 20}px)` }}>
      <Line text={scene.text} size={(wide ? 46 : 50) * u} width={content} align={wide ? 'left' : 'center'} />
    </div>
  )
  const sketch = <Sketch scene={scene} box={(wide ? 580 : scene.text ? 640 : 720) * u} />
  if (wide) return <Page><Split text={[<div key="h">{head}</div>, <div key="t">{text}</div>]} sketch={sketch} /></Page>
  return (
    <Page gap={26}>
      {head}
      {sketch}
      {text}
    </Page>
  )
}

function List({ scene }) {
  const { u, content, wide } = useLayout()
  return (
    <Page gap={44}>
      {scene.title && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u }}>
          <Headline text={scene.title} size={92 * u} width={content * (wide ? 1.6 : 1)} />
          <Underline width={260 * u} delay={0.5} />
        </div>
      )}
      <div style={{ maxWidth: wide ? content * 1.5 : content, display: 'flex', flexDirection: 'column', gap: 30 * u }}>
        {(scene.items || []).map((it, i) => (
          <Item key={i} text={it.text} delay={22 + i * 26} />
        ))}
      </div>
    </Page>
  )
}
/** A list line: a hand-drawn box gets ticked, the line slides in. */
function Item({ text, delay }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, wide } = useLayout()
  const p = spring({ frame: frame - delay, fps, config: { damping: 14 } })
  const tick = interpolate(frame, [delay + 6, delay + 16], [0, 1], clamp)
  const s = 64 * u
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 * u, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -40 * u}px)` }}>
      <svg width={s} height={s} style={{ flex: 'none', overflow: 'visible' }}>
        <path d={`M ${s * 0.1} ${s * 0.14} L ${s * 0.9} ${s * 0.08} L ${s * 0.94} ${s * 0.9} L ${s * 0.08} ${s * 0.94} Z`} fill="white" stroke={C.ink} strokeWidth={4 * u} strokeLinejoin="round" />
        <path d={`M ${s * 0.2} ${s * 0.5} L ${s * 0.44} ${s * 0.74} L ${s * 1.05} ${s * 0.02}`} fill="none" stroke={C.orange} strokeWidth={8 * u} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tick} />
      </svg>
      <Line text={text} size={(wide ? 52 : 56) * u} color={C.ink} align="left" weight={700} />
    </div>
  )
}

function Quote({ scene }) {
  const { u, content, wide } = useLayout()
  const by = useEnter(1.5)
  const who = [scene.author, scene.role].filter(Boolean).map(clean).join(' · ')
  return (
    <Page gap={30}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 220 * u, lineHeight: 0.5, color: C.orange, height: 110 * u }}>“</div>
      <Headline text={scene.text} size={86 * u} width={wide ? content * 1.6 : content} />
      {who && <div style={{ fontFamily: FONT, fontSize: 38 * u, fontWeight: 600, color: C.soft, opacity: by, lineHeight: 1.6 }}>— {who}</div>}
    </Page>
  )
}

function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, content, wide } = useLayout()
  const logo = useEnter(0.1, 12)
  const b = useEnter(1.1, 11)
  return (
    <Page gap={scene.image ? 36 : 50}>
      {scene.image && <Sketch scene={scene} box={(wide ? 420 : 520) * u} delay={0.1} />}
      {brand?.logo && !scene.image && (
        <div style={{ background: 'white', borderRadius: 20 * u, padding: `${16 * u}px ${26 * u}px`, transform: `scale(${logo})`, boxShadow: `0 ${8 * u}px ${22 * u}px rgba(0,0,0,0.08)` }}>
          <Img src={srcOf(brand.logo)} style={{ height: 130 * u, maxWidth: 520 * u, objectFit: 'contain' }} />
        </div>
      )}
      <Headline text={scene.text} size={92 * u} width={wide ? content * 1.6 : content} delay={0.3} />
      {scene.button && (
        <div style={{ position: 'relative', opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) rotate(-1.5deg) scale(${1 + Math.sin(frame / 8) * 0.02 * b})` }}>
          {/* a sketchy pill: ink outline drawn twice, slightly off */}
          <div style={{ padding: `${22 * u}px ${56 * u}px`, borderRadius: 999, background: C.orange, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: 48 * u, border: `${4 * u}px solid ${C.ink}`, boxShadow: `${6 * u}px ${7 * u}px 0 ${C.ink}` }}>{clean(scene.button)}</div>
        </div>
      )}
    </Page>
  )
}

export const DOODLE = {
  scenes: { hook: Hook, doodle: Doodle, list: List, quote: Quote, cta: Cta },
  root: { backgroundColor: C.paper },
  light: true, // the white logo chip top-left (ExplainerChrome), like the Reel
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
