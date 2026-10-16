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
import { EM_CLOSE, EM_OPEN, FONT, Icon, Words, ZWSP, clean, fitSize } from './shared'

const ORANGE = '#F26B1D' // the floating icon tiles
const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace"
const TECH = ['Brain', 'Cpu', 'Network', 'Database', 'Bot', 'Sparkles', 'CircuitBoard', 'Code']
const MATH = ['σ(wx + b)', '∑ wᵢxᵢ', '∂L/∂w', 'softmax(z)', 'f(x) = Wx + b', 'ReLU(x)', 'P(y | x)', '∇θ J(θ)', 'eˣ / ∑ eᶻ', 'argmax ŷ']

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
  return { width, height, fps, wide, u, content: wide ? width * 0.72 : width * 0.86, top: (wide ? 140 : 230) * u, bottom: (wide ? 250 : 460) * u } // the bottom stays clear for the subtitles
}

function useEnter(delay = 0, damping = 16) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}
const rise = (p, d = 40) => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * d}px)` })

// ── the background: nodes drifting, lines between near ones ────────────────
function NeuralBg({ icon }) {
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
      {/* space: stars twinkling, a glowing planet with its ring, a shooting star */}
      {Array.from({ length: 70 }, (_, i) => (
        <div key={`st${i}`} style={{ position: 'absolute', left: random(`stx${i}`) * width, top: random(`sty${i}`) * height, width: (1 + random(`sts${i}`) * 2.6) * u, height: (1 + random(`sts${i}`) * 2.6) * u, borderRadius: 9, background: '#FFFFFF', opacity: 0.25 + 0.55 * Math.abs(Math.sin(t * (0.6 + random(`stw${i}`)) + i)) }} />
      ))}
      <div style={{ position: 'absolute', right: -short * 0.12, top: height * 0.08, width: short * 0.42, height: short * 0.42, transform: `translateY(${Math.sin(t / 5) * 10 * u}px)` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${a('#3B5BDB', 0.9)}, ${a('#0B1430', 0.95)} 62%)`, boxShadow: `0 0 ${80 * u}px ${a(C.blue, 0.35)}, inset ${-18 * u}px ${-14 * u}px ${40 * u}px rgba(0,0,0,0.6)`, opacity: 0.55 }} />
        <div style={{ position: 'absolute', left: '-22%', right: '-22%', top: '42%', height: '18%', borderRadius: '50%', border: `${3 * u}px solid ${a(C.purple, 0.45)}`, transform: 'rotate(-18deg)', boxShadow: `0 0 ${18 * u}px ${a(C.purple, 0.4)}` }} />
      </div>
      {(() => {
        const p = (frame % 150) / 150 // a streak every 5 s, across the top
        if (p > 0.18) return null
        const k = p / 0.18
        return <div style={{ position: 'absolute', left: width * (0.15 + 0.6 * k), top: height * (0.06 + 0.12 * k), width: 160 * u, height: 2.5 * u, borderRadius: 2, background: `linear-gradient(90deg, transparent, #FFFFFF)`, transform: 'rotate(20deg)', opacity: 1 - k }} />
      })()}
      {/* AI maths, faint, drifting up */}
      {MATH.map((m, i) => (
        <div key={m} style={{ position: 'absolute', left: random(`mx${i}`) * width * 0.85, top: ((random(`my${i}`) * height - t * (5 + i)) % (height + 60) + height + 60) % (height + 60) - 30, fontFamily: MONO, fontSize: (22 + random(`ms${i}`) * 14) * u, color: '#FFFFFF', opacity: 0.09, transform: `rotate(${(random(`mr${i}`) - 0.5) * 14}deg)`, whiteSpace: 'nowrap' }}>
          {m}
        </div>
      ))}
      {/* tech icons floating round the content — where the text never is */}
      {[icon, ...TECH].filter(Boolean).slice(0, 6).map((name, i) => {
        const [x, y] = (width > height
          ? [[0.06, 0.3], [0.94, 0.26], [0.05, 0.62], [0.95, 0.6], [0.1, 0.9], [0.9, 0.88]]
          : [[0.13, 0.19], [0.87, 0.21], [0.1, 0.84], [0.9, 0.82], [0.32, 0.9], [0.68, 0.92]])[i]
        const red = i === 0 || i === 3
        return (
          <div key={`i${i}`} style={{ position: 'absolute', left: x * width - 44 * u, top: y * height - 44 * u + Math.sin(t * 1.3 + i) * 14 * u, width: 88 * u, height: 88 * u, borderRadius: 26 * u, display: 'grid', placeItems: 'center', transform: `rotate(${Math.sin(t * 0.8 + i * 2) * 8}deg)`, background: red ? `linear-gradient(135deg, ${ORANGE}, ${a(ORANGE, 0.65)})` : a('#1E3A8A', 0.32), border: `1px solid ${red ? a('#FFFFFF', 0.3) : a('#6E8BFF', 0.45)}`, boxShadow: `0 0 ${26 * u}px ${red ? a(ORANGE, 0.6) : a(C.blue, 0.4)}`, backdropFilter: `blur(${18 * u}px)`, WebkitBackdropFilter: `blur(${18 * u}px)`, opacity: interpolate(frame, [i * 4, i * 4 + 12], [0, 0.95], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            <Icon name={name} size={42 * u} color="white" />
          </div>
        )
      })}
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
function Stage({ children, gap = 32, icon }) {
  const { u, top, bottom } = useLayout()
  return (
    <AbsoluteFill>
      <NeuralBg icon={icon} />
      <AbsoluteFill style={{ top, bottom, height: 'auto', justifyContent: 'center', alignItems: 'center', gap: gap * u, fontFamily: FONT }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Text in the template's type: Khmer-safe (Words), a size that shrinks as it grows. */
/** A headline lighting up as it's said: said = white, the word being said = red
 * (glowing), still to come = dim. Words are the script's own pieces (spaces and
 * the zero-width breaks between Khmer words) — Khmer is never split inside a
 * word; [bracketed] words stay red once said. */
function Lit({ text, size, width, span = 0.6, align = 'center' }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
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
  const lit = interpolate(frame, [8, durationInFrames * span], [0, pieces.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const km = KHMER.test(clean(text))
  const px = fitSize(text, size)
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', fontSize: px, fontWeight: 800, lineHeight: km ? 1.55 : 1.2, letterSpacing: km ? 0 : '-0.015em' }}>
      {pieces.map(({ p, gap, em: hi }, n) => {
        const now = n < lit && n >= lit - 1
        const done = n < lit - 1
        const red = now || (done && hi)
        return (
          <span key={n} style={{ marginRight: gap ? '0.26em' : 0, color: red ? C.amber : done ? C.text : a('#FFFFFF', 0.24), textShadow: red ? `0 0 ${px * 0.4}px ${a(C.amber, 0.7)}` : done ? `0 0 ${px * 0.3}px ${a(C.blue, 0.45)}` : 'none' }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

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
    <Stage gap={40} icon={scene.icon}>
      {scene.icon && (
        <div style={{ ...rise(punch), width: 120 * u, height: 120 * u, borderRadius: 30 * u, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, boxShadow: `0 0 ${40 * u}px ${a(C.blue, 0.5)}` }}>
          <Icon name={scene.icon} size={64 * u} color="white" />
        </div>
      )}
      <div style={{ transform: `scale(${1.3 - 0.3 * punch})`, opacity: Math.min(1, punch * 2), filter: `drop-shadow(0 0 ${glow * u}px ${a(C.blue, 0.55)})` }}>
        <Lit text={scene.text} size={(wide ? 104 : 100) * u} width={content} span={0.55} />
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
      {scene.title && <Lit text={scene.title} size={78 * u} width={content} span={0.3} />}
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
          <Lit text={scene.title} size={68 * u} width={content} span={0.25} />
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
          <Lit text={scene.title} size={70 * u} width={content} span={0.25} />
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
          <Lit text={scene.title} size={66 * u} width={content} span={0.25} />
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
  const frameIn = useEnter(0.1, 14)
  return (
    <Stage>
      <div style={{ transform: `scale(${zoom * (0.94 + 0.06 * frameIn)})`, opacity: Math.min(1, frameIn * 1.4), width: content, ...glass(u), borderRadius: 40 * u, padding: `${48 * u}px ${56 * u}px ${56 * u}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 * u, boxShadow: `0 0 ${60 * u}px ${a(C.purple, 0.25)}, inset 0 1px 0 ${a('#FFFFFF', 0.12)}` }}>
        <Sweep />
        <div style={{ width: 92 * u, height: 92 * u, borderRadius: 92 * u, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.purple}, ${a(C.purple, 0.7)})`, boxShadow: `0 0 ${30 * u}px ${a(C.purple, 0.6)}`, fontSize: 90 * u, lineHeight: 1, paddingTop: 30 * u, boxSizing: 'border-box', color: '#FFFFFF', fontFamily: 'Georgia, serif', opacity: mark, transform: `scale(${0.6 + 0.4 * mark})` }}>“</div>
        <Lit text={scene.text} size={74 * u} width={content - 112 * u} span={0.6} />
        {who && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u, opacity: by }}>
            <div style={{ width: 64 * u, height: 64 * u, borderRadius: 64 * u, display: 'grid', placeItems: 'center', background: a(C.blue, 0.25), border: `2px solid ${a(C.blue, 0.6)}`, color: '#FFFFFF', fontWeight: 800, fontSize: 30 * u }}>{who.slice(0, 1)}</div>
            <div style={{ fontSize: 34 * u, color: C.muted, lineHeight: 1.5 }}>{who}</div>
          </div>
        )}
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
    <Stage gap={26} icon={scene.icon}>
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
        <Lit text={scene.text} size={80 * u} width={content} span={0.45} />
      </div>
      {scene.button && (
        <div style={{ opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) scale(${pulse})`, padding: `${22 * u}px ${48 * u}px`, borderRadius: 999, background: `linear-gradient(90deg, ${C.blue}, ${C.purple})`, boxShadow: `0 ${10 * u}px ${40 * u}px ${a(C.blue, 0.45)}`, color: C.text, fontWeight: 700, fontSize: 46 * u, lineHeight: 1.5 }}>
          {clean(scene.button)} →
        </div>
      )}
    </Stage>
  )
}

// ── dataset: a small table of examples, rows streaming in like data ────────
function Table({ scene }) {
  const { u, content, wide } = useLayout()
  const cols = scene.columns || []
  const rows = scene.rows || []
  const head = useEnter(0.3)
  return (
    <Stage gap={wide ? 20 : 30} icon="Database">
      {scene.title && <Lit text={scene.title} size={(wide ? 62 : 72) * u} width={content} span={0.25} />}
      <div style={{ width: content * (wide ? 0.8 : 1), ...glass(u), borderRadius: 28 * u, padding: `${10 * u}px ${18 * u}px ${18 * u}px` }}>
        <Sweep />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 12 * u, padding: `${14 * u}px ${10 * u}px`, borderBottom: `1px solid ${a(C.blue, 0.35)}`, ...rise(head, 16) }}>
          {cols.map((c, i) => (
            <div key={i} style={{ fontFamily: KHMER.test(c) ? FONT : MONO, fontWeight: 700, fontSize: 32 * u, letterSpacing: KHMER.test(c) ? 0 : '0.08em', textTransform: KHMER.test(c) ? 'none' : 'uppercase', color: i === cols.length - 1 ? C.amber : C.blue, lineHeight: 1.5 }}>{clean(c)}</div>
          ))}
        </div>
        {rows.map((row, i) => (
          <DataRow key={i} cells={row} cols={cols.length} delay={0.7 + i * 0.45} tight={wide} />
        ))}
      </div>
    </Stage>
  )
}
function DataRow({ cells, cols, delay, tight }) {
  const { u } = useLayout()
  const p = useEnter(delay, 18)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 * u, padding: `${(tight ? 8 : 14) * u}px ${10 * u}px`, borderBottom: `1px solid ${a('#FFFFFF', 0.06)}`, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 60 * u}px)` }}>
      {cells.map((c, i) => {
        const last = i === cells.length - 1
        return (
          <div key={i} style={{ fontSize: 34 * u, fontWeight: last ? 700 : 500, color: last ? C.text : C.muted, lineHeight: 1.5 }}>
            {last ? <span style={{ padding: `${2 * u}px ${14 * u}px`, borderRadius: 999, background: a(C.amber, 0.18), border: `1px solid ${a(C.amber, 0.5)}`, color: '#FFFFFF' }}>{clean(c)}</span> : clean(c)}
          </div>
        )
      })}
    </div>
  )
}

// ── meme: the setup, the reaction, the punchline ────────────────────────────
const MEME_FACE = { laughing: '😂', shocked: '😱', thinking: '🤔', cool: '😎', crying: '😭', happy: '😄' }
function Meme({ scene }) {
  const frame = useCurrentFrame()
  const { u, content, wide } = useLayout()
  const top = useEnter(0.1)
  const face = useEnter(0.9, 8)
  const punch = useEnter(1.5, 12)
  const wobble = Math.sin(frame / 5) * 6 * Math.min(1, face)
  return (
    <Stage gap={wide ? 16 : 34} icon="Laugh">
      <div style={{ ...rise(top), width: content, ...glass(u), borderRadius: 28 * u, padding: `${(wide ? 16 : 26) * u}px ${30 * u}px` }}>
        <T text={scene.top} size={(wide ? 50 : 58) * u} weight={700} />
      </div>
      <div style={{ fontSize: (wide ? 140 : 230) * u, lineHeight: 1.05, transform: `scale(${face}) rotate(${wobble}deg)`, filter: `drop-shadow(0 0 ${40 * u}px ${a(C.amber, 0.5)})` }}>{MEME_FACE[scene.mood] || '😂'}</div>
      <div style={{ ...rise(punch, 30), padding: `${(wide ? 14 : 22) * u}px ${34 * u}px`, borderRadius: 28 * u, background: `linear-gradient(135deg, ${C.purple}, ${a(C.purple, 0.75)})`, boxShadow: `0 0 ${40 * u}px ${a(C.purple, 0.5)}`, width: content }}>
        <T text={scene.bottom} size={(wide ? 52 : 60) * u} weight={800} />
      </div>
    </Stage>
  )
}

export const NEURAL = {
  scenes: { hook: Hook, list: List, beforeafter: BeforeAfter, timeline: Timeline, compare: Compare, quote: Quote, stat: Stat, cta: Cta, table: Table, meme: Meme },
  root: { backgroundColor: C.bg, '--hl-bg': C.amber, '--hl-text': '#FFFFFF' },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
