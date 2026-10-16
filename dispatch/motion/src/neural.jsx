/**
 * "AI explainer · Neural" — navy, a slowly drifting neural network behind
 * every scene, electric blue / purple accents and amber highlights; big
 * question hooks, split-screen before / after, a timeline, two people side
 * by side, a slow-zoom quote. Ported from the "AI with Pao" template; the
 * brand's own logo chip stays (MotionPost Chrome). 9:16 and 16:9.
 *
 * Scenes (app/motion.py NEURAL_TYPES — the fields their cleaners keep):
 *   hook {text, icon} · list {title, items[{icon, text}]} · beforeafter {title, before, after}
 *   timeline {title, steps[{when, text}]} · compare {title, left/right {name, mood, value, tone}}
 *   quote {text, author, role} · stat {value, prefix, suffix, label, icon} · cta {text, button}
 * Text goes through Words (shared.jsx): Khmer stays whole between its
 * zero-width word breaks, and [bracketed] words get the amber marker.
 */
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize } from './shared'

// black, navy and red: `purple` (the second accent) and `amber` (highlights, the
// latest moment, the big number) are both red now — no purple anywhere
const C = { bg: '#05070D', surface: '#0E1A3A', blue: '#2F5BFF', purple: '#E5243B', amber: '#FF3B4E', text: '#FFFFFF', muted: '#A9B4C8' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const a = (hex, o) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${o})`
}
const KHMER = /[ក-៿]/

function useLayout() {
  const { width, height, fps } = useVideoConfig()
  const wide = width > height
  const u = Math.min(width, height) / 1080
  return { width, height, fps, wide, u, content: wide ? width * 0.72 : width * 0.86, top: (wide ? 140 : 230) * u, bottom: (wide ? 250 : 380) * u } // the bottom stays clear for the subtitles
}

function useEnter(delay = 0, damping = 16) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}
const rise = (p, d = 40) => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * d}px)` })

// ── the background: nodes drifting, lines between near ones ────────────────
function NeuralBg() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const short = Math.min(width, height)
  const N = 34
  const nodes = Array.from({ length: N }, (_, i) => {
    const t = frame / 30
    return {
      x: (random(`nx${i}`) + Math.sin(t * (0.004 + random(`sx${i}`) * 0.01) * 6 + i) * 0.03) * width,
      y: (random(`ny${i}`) + Math.cos(t * (0.004 + random(`sy${i}`) * 0.01) * 6 + i * 2) * 0.03) * height,
      r: 2 + random(`nr${i}`) * 3,
      c: i % 3 === 0 ? C.purple : C.blue,
    }
  })
  const links = []
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) / short
      if (d < 0.2) links.push(<line key={`${i}-${j}`} x1={nodes[i].x} y1={nodes[i].y} x2={nodes[j].x} y2={nodes[j].y} stroke={a(C.blue, (1 - d / 0.2) * 0.22 * (0.7 + 0.3 * Math.sin(frame / 40 + i + j)))} strokeWidth={1.4} />)
    }
  const u = short / 1080
  const t = frame / 30
  // soft glowing orbs, blurred, drifting slowly
  const orbs = [
    { c: '#1E3A8A', x: 0.22 + Math.sin(t / 7) * 0.06, y: 0.28 + Math.cos(t / 9) * 0.05, r: 0.6, o: 0.6 }, // navy
    { c: C.purple, x: 0.82 + Math.cos(t / 8) * 0.05, y: 0.62 + Math.sin(t / 6) * 0.06, r: 0.55, o: 0.3 }, // red
    { c: C.amber, x: 0.5 + Math.sin(t / 11) * 0.08, y: 0.95, r: 0.35, o: 0.14 },
  ]
  // the grid: flat and faint up top, a glowing floor in perspective below, moving toward us
  const cell = 90 * u
  const scroll = (frame * 1.6 * u) % cell
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      {orbs.map((o, i) => (
        <div key={i} style={{ position: 'absolute', left: o.x * width - (o.r * short) / 2, top: o.y * height - (o.r * short) / 2, width: o.r * short, height: o.r * short, borderRadius: '50%', background: o.c, opacity: o.o, filter: `blur(${110 * u}px)` }} />
      ))}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${a(C.blue, 0.16)} 1px, transparent 1px), linear-gradient(90deg, ${a(C.blue, 0.16)} 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
          maskImage: 'radial-gradient(ellipse 110% 90% at 50% 40%, black 45%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 110% 90% at 50% 40%, black 45%, transparent 100%)',
        }}
      />
      <div style={{ position: 'absolute', left: -width * 0.5, right: -width * 0.5, bottom: -height * 0.05, height: height * 0.55, perspective: 700 * u, overflow: 'hidden', maskImage: 'linear-gradient(to top, black 30%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 95%)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'rotateX(62deg)',
            transformOrigin: 'center bottom',
            backgroundImage: `linear-gradient(${a(C.blue, 0.42)} 2px, transparent 2px), linear-gradient(90deg, ${a(C.purple, 0.32)} 2px, transparent 2px)`,
            backgroundSize: `${cell}px ${cell}px`,
            backgroundPosition: `center ${scroll}px`,
            filter: `drop-shadow(0 0 ${6 * u}px ${a(C.blue, 0.8)})`,
          }}
        />
      </div>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {links}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.c} opacity={0.45 + 0.4 * Math.sin(frame / 25 + i)} style={{ filter: `drop-shadow(0 0 ${6 * u}px ${n.c})` }} />
        ))}
      </svg>
      {/* a vignette: the edges fall into the dark */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(4,6,18,0.7))' }} />
    </AbsoluteFill>
  )
}

/** Frosted glass in the template's light: blurs what's behind it, a thin
 * light edge, a soft blue glow — and a slow sweep of light across it. */
function glass(u, tone = 'blue') {
  const edge = tone === 'grey' ? a('#FFFFFF', 0.08) : tone === 'amber' ? a(C.amber, 0.5) : a(C.blue, 0.42)
  return {
    position: 'relative',
    overflow: 'hidden',
    background: tone === 'grey' ? 'linear-gradient(135deg, rgba(60,66,92,0.55), rgba(30,34,52,0.55))' : `linear-gradient(135deg, ${a('#2A3A8A', 0.5)}, ${a(C.surface, 0.42)})`,
    backdropFilter: `blur(${18 * u}px)`,
    WebkitBackdropFilter: `blur(${18 * u}px)`,
    border: `1px solid ${edge}`,
    boxShadow: tone === 'grey' ? `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.35)` : `0 0 ${36 * u}px ${a(C.blue, 0.22)}, inset 0 1px 0 ${a('#FFFFFF', 0.12)}`,
  }
}

/** The light sweeping across a glass card now and then. */
function Sweep({ delay = 0 }) {
  const frame = useCurrentFrame()
  const p = ((frame + delay * 30) % 150) / 150
  return <div style={{ position: 'absolute', top: 0, bottom: 0, width: '35%', left: `${-40 + p * 180}%`, background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.08), transparent)', pointerEvents: 'none' }} />
}

/** A scene: the background, then its content centred in the safe area. */
function Stage({ children, gap = 32 }) {
  const { u, top, bottom } = useLayout()
  return (
    <AbsoluteFill>
      <NeuralBg />
      <AbsoluteFill style={{ top, bottom, justifyContent: 'center', alignItems: 'center', gap: gap * u, fontFamily: FONT }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Text in the template's type: Khmer-safe (Words), a size that shrinks as it grows. */
function T({ text, size, weight = 700, color = C.text, align = 'center', delay = 0, width }) {
  return (
    <div style={{ width, color, fontWeight: weight, fontSize: fitSize(text, size), lineHeight: KHMER.test(clean(text)) ? 1.55 : 1.2, textAlign: align, textShadow: weight >= 700 ? `0 0 ${Math.round(size * 0.35)}px ${a(C.blue, 0.45)}` : undefined }}>
      <Words text={text} delay={delay} align={align} />
    </div>
  )
}

// ── hook: the big question, punching in with a glow ────────────────────────
function Hook({ scene }) {
  const frame = useCurrentFrame()
  const { u, content, wide } = useLayout()
  const punch = useEnter(0, 9)
  const glow = 30 + Math.sin(frame / 12) * 12
  return (
    <Stage gap={40}>
      {scene.icon && (
        <div style={{ ...rise(punch), width: 120 * u, height: 120 * u, borderRadius: 30 * u, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, boxShadow: `0 0 ${40 * u}px ${a(C.blue, 0.5)}` }}>
          <Icon name={scene.icon} size={64 * u} color="white" />
        </div>
      )}
      <div style={{ transform: `scale(${1.3 - 0.3 * punch})`, opacity: Math.min(1, punch * 2), filter: `drop-shadow(0 0 ${glow * u}px ${a(C.blue, 0.55)})` }}>
        <T text={scene.text} size={(wide ? 104 : 100) * u} width={content} />
      </div>
    </Stage>
  )
}

// ── list: a title, then lines sliding in one by one ────────────────────────
function List({ scene }) {
  const { u, content } = useLayout()
  const bar = useEnter(0)
  return (
    <Stage gap={30}>
      <div style={{ width: 120 * u * bar, height: 8 * u, borderRadius: 4 * u, background: `linear-gradient(90deg, ${C.blue}, ${C.purple})`, boxShadow: `0 0 20px ${a(C.blue, 0.6)}` }} />
      {scene.title && <T text={scene.title} size={78 * u} width={content} />}
      {(scene.items || []).map((it, i) => (
        <Line key={i} item={it} delay={0.4 + i * 0.6} width={content} />
      ))}
    </Stage>
  )
}
function Line({ item, delay, width }) {
  const { u } = useLayout()
  const p = useEnter(delay)
  return (
    <div style={{ ...glass(u), width, display: 'flex', alignItems: 'center', gap: 22 * u, padding: `${16 * u}px ${24 * u}px`, borderRadius: 22 * u, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -60 * u}px)` }}>
      <Sweep delay={delay} />
      <div style={{ flex: 'none', width: 60 * u, height: 60 * u, borderRadius: 16 * u, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, boxShadow: `0 0 ${22 * u}px ${a(C.blue, 0.6)}` }}>
        <Icon name={item.icon || 'Check'} size={34 * u} color="white" />
      </div>
      <T text={item.text} size={50 * u} weight={600} align="left" />
    </div>
  )
}

// ── before / after: split screen, a glowing divider wipes across ───────────
function BeforeAfter({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, width, wide, content, top, bottom, height } = useLayout()
  const km = KHMER.test(clean(`${scene.before} ${scene.after}`))
  const x = interpolate(frame, [0.6 * fps, 1.6 * fps], [width, width / 2], { ...clamp, easing: Easing.inOut(Easing.cubic) })
  const title = useEnter(0)
  const half = width / 2
  const side = (label, text, after) => (
    <div style={{ position: 'absolute', left: after ? half : 0, width: half, top: top + 140 * u, bottom, padding: `0 ${(wide ? 70 : 40) * u}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 * u, filter: after ? 'none' : 'grayscale(1)', opacity: after ? 1 : 0.75, background: after ? `linear-gradient(180deg, ${a(C.blue, 0.14)}, transparent)` : a('#000000', 0.18) }}>
      <div style={{ fontSize: 50 * u, fontWeight: 700, color: after ? C.blue : C.muted, textAlign: 'center', lineHeight: 1.5 }}>{label}</div>
      <div style={{ ...glass(u, after ? 'blue' : 'grey'), padding: `${22 * u}px ${26 * u}px`, borderRadius: 24 * u }}>
        {after && <Sweep />}
        <T text={text} size={(wide ? 54 : 46) * u} weight={600} color={after ? C.text : C.muted} delay={after ? 1.5 : 0.3} />
      </div>
    </div>
  )
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <NeuralBg />
      {scene.title && (
        <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', ...rise(title) }}>
          <T text={scene.title} size={68 * u} width={content} />
        </div>
      )}
      {side(km ? '❌ របៀបចាស់' : '❌ Before', scene.before, false)}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${x}px)` }}>{side(km ? '✅ ជាមួយ AI' : '✅ After', scene.after, true)}</div>
      <div style={{ position: 'absolute', top: top + 120 * u, height: height - top - bottom - 120 * u, left: x - 3 * u, width: 6 * u, borderRadius: 3 * u, background: C.blue, boxShadow: `0 0 ${30 * u}px ${C.blue}` }} />
    </AbsoluteFill>
  )
}

// ── timeline: moments along a vertical line, one by one ────────────────────
function Timeline({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const { u, width, wide, content, top, bottom, height } = useLayout()
  const steps = scene.steps || []
  const n = Math.max(1, steps.length)
  const first = 0.6
  const step = Math.max(0.7, (durationInFrames / fps - first - 1.5) / n)
  const y0 = top + (scene.title ? 130 : 20) * u
  const rowH = (height - bottom - y0) / n
  const lineX = wide ? width * 0.28 : width * 0.16
  const shown = interpolate(frame, [first * fps, (first + step * (n - 1)) * fps + 10], [0, 1], clamp)
  const title = useEnter(0)
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <NeuralBg />
      {scene.title && (
        <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', ...rise(title) }}>
          <T text={scene.title} size={70 * u} width={content} />
        </div>
      )}
      <div style={{ position: 'absolute', left: lineX - 2 * u, top: y0 + rowH / 2, width: 4 * u, height: rowH * (n - 1) * shown, background: `linear-gradient(180deg, ${C.blue}, ${C.purple})` }} />
      {steps.map((s, i) => (
        <Moment key={i} when={s.when} text={s.text} delay={first + step * i} y={y0 + rowH * i} h={rowH} x={lineX} latest={i === n - 1} />
      ))}
    </AbsoluteFill>
  )
}
function Moment({ when, text, delay, y, h, x, latest }) {
  const { u, wide, width } = useLayout()
  const p = useEnter(delay, 12)
  const dot = 22 * u
  const col = latest ? C.amber : C.blue
  return (
    <div style={{ position: 'absolute', top: y, height: h, left: 0, right: 0, display: 'flex', alignItems: 'center' }}>
      <div style={{ position: 'absolute', left: x - dot / 2, width: dot, height: dot, borderRadius: dot, background: col, boxShadow: `0 0 ${20 * u}px ${col}`, transform: `scale(${p})` }} />
      <div style={{ position: 'absolute', left: x + 40 * u, right: 60 * u, ...rise(p, 24), display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: (wide ? 18 : 4) * u }}>
        {when && <div style={{ flex: 'none', width: wide ? 230 * u : undefined, fontWeight: 800, fontSize: 46 * u, color: col, lineHeight: 1.3 }}>{clean(when)}</div>}
        <div style={{ ...glass(u, latest ? 'amber' : 'blue'), padding: `${8 * u}px ${18 * u}px`, borderRadius: 14 * u, maxWidth: width - x - 140 * u }}>
          <T text={text} size={40 * u} weight={600} align="left" />
        </div>
      </div>
    </div>
  )
}

// ── compare: two people side by side ───────────────────────────────────────
const FACE = { happy: '😄', excited: '🤩', sad: '😞', worried: '😟', thinking: '🤔' }
function Compare({ scene }) {
  const { u, width, wide, content, top } = useLayout()
  const title = useEnter(0)
  const colW = width * (wide ? 0.32 : 0.38)
  const vs = useEnter(0.35, 9)
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <NeuralBg />
      {scene.title && (
        <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', ...rise(title) }}>
          <T text={scene.title} size={66 * u} width={content} />
        </div>
      )}
      <AbsoluteFill style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: width * 0.04 }}>
        <Person who={scene.left} width={colW} delay={0.2} />
        <div style={{ flex: 'none', width: 92 * u, height: 92 * u, borderRadius: 92 * u, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, color: C.text, fontWeight: 800, fontSize: 34 * u, transform: `scale(${vs})`, boxShadow: `0 0 ${30 * u}px ${a(C.purple, 0.6)}` }}>VS</div>
        <Person who={scene.right} width={colW} delay={0.5} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
function Person({ who = {}, width, delay }) {
  const { u } = useLayout()
  const p = useEnter(delay, 12)
  const good = who.tone !== 'bad'
  return (
    <div style={{ ...glass(u, good ? 'blue' : 'grey'), width, ...rise(p, 50), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * u, padding: `${36 * u}px ${22 * u}px`, borderRadius: 32 * u, filter: good ? 'none' : 'grayscale(0.6)' }}>
      {good && <Sweep delay={delay} />}
      <div style={{ fontSize: 120 * u, lineHeight: 1.1, transform: `scale(${0.6 + 0.4 * p})` }}>{FACE[who.mood] || '🙂'}</div>
      <T text={who.name || ''} size={56 * u} color={good ? C.blue : C.text} />
      {who.value && <T text={who.value} size={44 * u} weight={600} color={good ? C.amber : C.muted} />}
    </div>
  )
}

// ── quote: large, centred, a slow zoom ──────────────────────────────────────
function Quote({ scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const { u, content } = useLayout()
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.07])
  const mark = useEnter(0)
  const by = useEnter(1.4)
  const who = [scene.author, scene.role].filter(Boolean).map(clean).join(' · ')
  return (
    <Stage>
      <div style={{ transform: `scale(${zoom})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 * u }}>
        <div style={{ fontSize: 170 * u, lineHeight: 0.6, color: C.purple, opacity: mark, fontFamily: 'Georgia, serif' }}>“</div>
        <T text={scene.text} size={78 * u} width={content} delay={0.3} />
        {who && <div style={{ fontSize: 36 * u, color: C.amber, lineHeight: 1.6, opacity: by }}>— {who}</div>}
      </div>
    </Stage>
  )
}

// ── stat: a number counting up, its label under it ─────────────────────────
function Stat({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, content } = useLayout()
  const p = interpolate(frame, [0.3 * fps, 1.6 * fps], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const v = Number(scene.value) || 0
  const shown = Number.isInteger(v) ? Math.round(v * p).toLocaleString() : (v * p).toFixed(1)
  const lab = useEnter(1)
  return (
    <Stage gap={26}>
      <div style={{ fontWeight: 800, fontSize: 210 * u, lineHeight: 1.05, color: C.amber, textShadow: `0 0 ${50 * u}px ${a(C.amber, 0.45)}` }}>
        {clean(scene.prefix)}
        {shown}
        <span style={{ fontSize: 110 * u }}>{clean(scene.suffix)}</span>
      </div>
      <div style={rise(lab)}>
        <T text={scene.label} size={58 * u} weight={600} width={content} />
      </div>
    </Stage>
  )
}

// ── cta: the question, then a pulsing button ───────────────────────────────
function Cta({ scene }) {
  const frame = useCurrentFrame()
  const { u, content } = useLayout()
  const q = useEnter(0.1)
  const b = useEnter(1, 11)
  const pulse = 1 + Math.sin(frame / 8) * 0.025 * b
  return (
    <Stage gap={46}>
      <div style={rise(q)}>
        <T text={scene.text} size={80 * u} width={content} />
      </div>
      {scene.button && (
        <div style={{ opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) scale(${pulse})`, padding: `${22 * u}px ${48 * u}px`, borderRadius: 999, background: `linear-gradient(90deg, ${C.blue}, ${C.purple})`, boxShadow: `0 ${10 * u}px ${40 * u}px ${a(C.blue, 0.45)}`, color: C.text, fontWeight: 700, fontSize: 46 * u, lineHeight: 1.5 }}>
          {clean(scene.button)} →
        </div>
      )}
    </Stage>
  )
}

export const NEURAL = {
  scenes: { hook: Hook, list: List, beforeafter: BeforeAfter, timeline: Timeline, compare: Compare, quote: Quote, stat: Stat, cta: Cta },
  root: { backgroundColor: C.bg, '--hl-bg': C.amber, '--hl-text': '#FFFFFF' },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
