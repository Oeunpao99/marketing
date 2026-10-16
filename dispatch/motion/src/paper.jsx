/**
 * "AI notes · Paper" — a light, editorial AI explainer: warm paper with a dot
 * grid, black and red only; a spaced red kicker, a bold italic headline whose
 * words light up as they're said (the current one red, the rest still grey),
 * tech icons floating around the text, dots and sparkles, a red line drawing
 * itself — and, faint behind it all, AI maths (σ(wx+b), ∑, ∂L/∂w, softmax…)
 * and a network. 9:16 and 16:9. Same scene types as AI explainer · Neural
 * (app/motion.py NEURAL_TYPES): hook · list · beforeafter · timeline ·
 * compare · quote · stat · cta.
 */
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { EM_CLOSE, EM_OPEN, FONT, Icon, ZWSP, clean, fitSize } from './shared'

const C = { paper: '#F6F4F0', ink: '#111111', red: '#D7263D', grey: '#B9B6B0', soft: '#6B6862', dot: 'rgba(17,17,17,0.13)' }
const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace"
const KHMER = /[ក-៿]/
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const TECH = ['Brain', 'Cpu', 'Network', 'Database', 'Bot', 'Sparkles', 'CircuitBoard', 'Code', 'Layers', 'Zap']
const MATH = ['σ(wx + b)', '∑ wᵢxᵢ', '∂L/∂w', 'softmax(z)', 'f(x) = Wx + b', 'ReLU(x)', 'P(y | x)', '∇θ J(θ)', 'y = mx + c', 'eˣ / ∑ eᶻ']
const KICKER = { hook: 'AI · TECH', list: 'KEY POINTS', beforeafter: 'BEFORE · AFTER', timeline: 'TIMELINE', compare: 'TWO CHOICES', stat: 'BY THE NUMBERS', quote: 'REMEMBER', cta: 'YOUR TURN' }

function useLayout() {
  const { width, height, fps, durationInFrames } = useVideoConfig()
  const wide = width > height
  const u = Math.min(width, height) / 1080
  return { width, height, fps, durationInFrames, wide, u, content: wide ? width * 0.68 : width * 0.84, top: (wide ? 130 : 260) * u, bottom: (wide ? 250 : 400) * u }
}
function useEnter(delay = 0, damping = 15) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}
const rise = (p, d = 36) => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * d}px)` })

// ── the paper: dot grid, faint AI maths and a network, floating icons ──────
function Paper({ icon }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const u = Math.min(width, height) / 1080
  const t = frame / 30
  const nodes = Array.from({ length: 12 }, (_, i) => ({ x: random(`pn${i}`) * width, y: random(`pm${i}`) * height }))
  // icons float in a loose ring around the text, each bobbing on its own
  const icons = [icon, ...TECH].filter(Boolean).slice(0, 6)
  // where the text never is: above / below it in 9:16, the side margins in 16:9
  const spots = width > height
    ? [[0.06, 0.28], [0.94, 0.24], [0.05, 0.62], [0.95, 0.58], [0.1, 0.9], [0.9, 0.88]]
    : [[0.13, 0.19], [0.87, 0.21], [0.1, 0.84], [0.9, 0.82], [0.32, 0.9], [0.68, 0.92]]
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.dot} ${2.2 * u}px, transparent ${2.4 * u}px)`, backgroundSize: `${44 * u}px ${44 * u}px` }} />
      {/* the network, faint */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.18 }}>
        {nodes.map((n, i) => {
          const m = nodes[(i + 3) % nodes.length]
          return <line key={i} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke={C.ink} strokeWidth={1.2 * u} strokeDasharray={`${6 * u} ${8 * u}`} strokeDashoffset={-frame * 0.8} />
        })}
        {nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={(i % 3 ? 4 : 6) * u} fill={i % 4 ? C.ink : C.red} />
        ))}
      </svg>
      {/* AI maths, drifting slowly */}
      {MATH.map((m, i) => (
        <div key={m} style={{ position: 'absolute', left: random(`mx${i}`) * width * 0.85, top: ((random(`my${i}`) * height + t * (6 + i)) % (height + 60)) - 30, fontFamily: MONO, fontSize: (22 + random(`ms${i}`) * 14) * u, color: C.ink, opacity: 0.1, transform: `rotate(${(random(`mr${i}`) - 0.5) * 16}deg)`, whiteSpace: 'nowrap' }}>
          {m}
        </div>
      ))}
      {/* tech icons floating around the text */}
      {icons.map((name, i) => {
        const [x, y] = spots[i]
        const red = i === 0 || i === 3
        return (
          <div key={i} style={{ position: 'absolute', left: x * width - 42 * u, top: y * height - 42 * u + Math.sin(t * 1.3 + i) * 14 * u, transform: `rotate(${Math.sin(t * 0.8 + i * 2) * 8}deg)`, width: 84 * u, height: 84 * u, borderRadius: 84 * u, display: 'grid', placeItems: 'center', background: red ? C.red : C.ink, boxShadow: `0 ${8 * u}px ${20 * u}px rgba(0,0,0,0.12)`, opacity: interpolate(frame, [i * 4, i * 4 + 12], [0, 0.95], clamp) }}>
            <Icon name={name} size={40 * u} color="white" />
          </div>
        )
      })}
      {/* dots and sparkles */}
      {Array.from({ length: 10 }, (_, i) => (
        <div key={`d${i}`} style={{ position: 'absolute', left: random(`dx${i}`) * width, top: random(`dy${i}`) * height + Math.sin(t * 2 + i) * 10 * u, width: (8 + random(`dr${i}`) * 18) * u, height: (8 + random(`dr${i}`) * 18) * u, borderRadius: 99, background: i % 3 ? C.ink : C.red, opacity: 0.85 }} />
      ))}
      {[[0.08, 0.17], [0.9, 0.16], [0.84, 0.6]].map(([x, y], i) => (
        <div key={`s${i}`} style={{ position: 'absolute', left: x * width, top: y * height, fontSize: (34 + i * 10) * u, color: i === 1 ? C.ink : C.red, transform: `rotate(${frame * (i % 2 ? 1.2 : -1)}deg) scale(${0.85 + 0.15 * Math.sin(t * 2 + i)})` }}>✦</div>
      ))}
      {/* a red line drawing itself near the bottom */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M ${width * 0.06} ${height * 0.93} q ${width * 0.06} ${-40 * u} ${width * 0.12} 0 t ${width * 0.12} 0`} fill="none" stroke={C.red} strokeWidth={6 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - interpolate(frame, [10, 40], [0, 1], clamp)} />
      </svg>
    </AbsoluteFill>
  )
}

/** A scene: the paper, the spaced red kicker, the content centred. */
function Page({ scene, children, gap = 34 }) {
  const { u, top, bottom } = useLayout()
  const k = useEnter(0)
  return (
    <AbsoluteFill>
      <Paper icon={scene.icon} />
      <div style={{ position: 'absolute', top: top - 90 * u, left: 0, right: 0, textAlign: 'center', fontFamily: MONO, fontSize: 30 * u, letterSpacing: '0.32em', color: C.red, ...rise(k, 12) }}>{KICKER[scene.type] || 'AI'}</div>
      <AbsoluteFill style={{ top, bottom, justifyContent: 'center', alignItems: 'center', gap: gap * u, fontFamily: FONT }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}

/**
 * The headline, its words lighting up in turn: said = black, the one being
 * said = red, still to come = grey. Words are the script's own pieces (spaces
 * and the zero-width breaks between Khmer words) — Khmer is never split
 * inside a word. [bracketed] words stay red once said.
 */
function Lit({ text, size, width, italic = true, span = 0.6, color = C.ink, align = 'center' }) {
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
  const lit = interpolate(frame, [8, durationInFrames * span], [0, pieces.length], clamp)
  const km = KHMER.test(clean(text))
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', fontSize: fitSize(text, size), fontWeight: 800, fontStyle: italic && !km ? 'italic' : 'normal', lineHeight: km ? 1.55 : 1.15, letterSpacing: km ? 0 : '-0.02em' }}>
      {pieces.map(({ p, gap, em: hi }, n) => {
        const now = n < lit && n >= lit - 1
        const done = n < lit - 1
        return (
          <span key={n} style={{ marginRight: gap ? '0.26em' : 0, color: now || (done && hi) ? C.red : done ? color : C.grey, transition: 'none' }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

/** A body line in plain black (Khmer-safe). */
function Text({ text, size, width, color = C.ink, weight = 600, align = 'center' }) {
  return <div style={{ width, color, fontWeight: weight, fontSize: fitSize(text, size), lineHeight: KHMER.test(clean(text)) ? 1.55 : 1.25, textAlign: align }}>{clean(text)}</div>
}

/** The black badge with a red arc running round it. */
function Badge({ children, size, delay = 0.4 }) {
  const frame = useCurrentFrame()
  const p = useEnter(delay, 11)
  const r = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, transform: `scale(${p})` }}>
      <svg width={size * 1.16} height={size * 1.16} style={{ position: 'absolute', left: -size * 0.08, top: -size * 0.08, transform: `rotate(${frame * 2}deg)` }}>
        <circle cx={r * 1.16} cy={r * 1.16} r={r * 1.08} fill="none" stroke={C.red} strokeWidth={size * 0.018} strokeDasharray={`${r * 2.2} ${r * 10}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.ink, display: 'grid', placeItems: 'center', boxShadow: `0 ${size * 0.06}px ${size * 0.14}px rgba(0,0,0,0.22)`, color: 'white', textAlign: 'center' }}>{children}</div>
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene }) {
  const { u, content } = useLayout()
  return (
    <Page scene={scene} gap={50}>
      <Lit text={scene.text} size={108 * u} width={content} span={0.55} />
      <Badge size={230 * u}>
        <Icon name={scene.icon || 'Brain'} size={100 * u} color="white" />
      </Badge>
    </Page>
  )
}

function List({ scene }) {
  const { u, content } = useLayout()
  return (
    <Page scene={scene} gap={30}>
      {scene.title && <Lit text={scene.title} size={84 * u} width={content} span={0.3} />}
      <div style={{ width: content, display: 'flex', flexDirection: 'column', gap: 22 * u }}>
        {(scene.items || []).map((it, i) => (
          <Row key={i} delay={0.6 + i * 0.6}>
            <span style={{ flex: 'none', width: 22 * u, height: 22 * u, borderRadius: 22 * u, background: i % 2 ? C.ink : C.red, marginTop: 4 * u }} />
            <Text text={it.text} size={52 * u} align="left" />
          </Row>
        ))}
      </div>
    </Page>
  )
}
function Row({ delay, children }) {
  const { u } = useLayout()
  const p = useEnter(delay)
  return <div style={{ display: 'flex', alignItems: 'center', gap: 22 * u, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -50 * u}px)` }}>{children}</div>
}

function BeforeAfter({ scene }) {
  const { u, content, wide } = useLayout()
  const km = KHMER.test(clean(`${scene.before} ${scene.after}`))
  const b = useEnter(0.5)
  const a = useEnter(1.3, 12)
  const card = (label, text, after, p) => (
    <div style={{ flex: 1, ...rise(p, 40), padding: `${30 * u}px ${28 * u}px`, borderRadius: 28 * u, background: after ? C.ink : 'white', border: after ? 'none' : `2px dashed ${C.grey}`, display: 'flex', flexDirection: 'column', gap: 18 * u, boxShadow: after ? `0 ${16 * u}px ${36 * u}px rgba(0,0,0,0.18)` : 'none' }}>
      {/* spaced mono for English only — letter-spacing tears Khmer apart */}
      <div style={{ fontFamily: km ? FONT : MONO, fontWeight: km ? 700 : 400, fontSize: (km ? 34 : 30) * u, letterSpacing: km ? 0 : '0.18em', color: after ? C.red : C.soft, lineHeight: 1.5 }}>{label}</div>
      <Text text={text} size={(wide ? 52 : 48) * u} color={after ? 'white' : C.soft} align="left" />
    </div>
  )
  return (
    <Page scene={scene} gap={36}>
      {scene.title && <Lit text={scene.title} size={78 * u} width={content} span={0.25} />}
      <div style={{ width: content, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 26 * u }}>
        {card(km ? '✗ របៀបចាស់' : '✗ BEFORE', scene.before, false, b)}
        {card(km ? '✓ ជាមួយ AI' : '✓ AFTER', scene.after, true, a)}
      </div>
    </Page>
  )
}

function Timeline({ scene }) {
  const { u, content } = useLayout()
  const steps = scene.steps || []
  const { fps, durationInFrames } = useVideoConfig()
  const step = Math.max(0.6, (durationInFrames / fps - 2) / Math.max(1, steps.length))
  return (
    <Page scene={scene} gap={30}>
      {scene.title && <Lit text={scene.title} size={78 * u} width={content} span={0.25} />}
      <div style={{ width: content, display: 'flex', flexDirection: 'column', gap: 22 * u, borderLeft: `4px dashed ${C.ink}`, paddingLeft: 36 * u }}>
        {steps.map((s, i) => (
          <Row key={i} delay={0.6 + step * i}>
            <span style={{ flex: 'none', width: 26 * u, height: 26 * u, borderRadius: 26 * u, background: i === steps.length - 1 ? C.red : C.ink, marginLeft: -50 * u, boxShadow: `0 0 0 ${6 * u}px ${C.paper}` }} />
            <span style={{ flex: 'none', fontFamily: MONO, fontSize: 38 * u, fontWeight: 700, color: C.red, minWidth: 130 * u }}>{clean(s.when)}</span>
            <Text text={s.text} size={42 * u} align="left" />
          </Row>
        ))}
      </div>
    </Page>
  )
}

const FACE = { happy: '😄', excited: '🤩', sad: '😞', worried: '😟', thinking: '🤔' }
function Compare({ scene }) {
  const { u, content, width, wide } = useLayout()
  const vs = useEnter(0.4, 9)
  const col = width * (wide ? 0.28 : 0.36)
  const person = (who = {}, delay) => <Person who={who} width={col} delay={delay} />
  return (
    <Page scene={scene} gap={40}>
      {scene.title && <Lit text={scene.title} size={74 * u} width={content} span={0.25} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.035 }}>
        {person(scene.left, 0.3)}
        <div style={{ flex: 'none', width: 88 * u, height: 88 * u, borderRadius: 88 * u, display: 'grid', placeItems: 'center', background: C.red, color: 'white', fontWeight: 800, fontSize: 32 * u, transform: `scale(${vs})` }}>VS</div>
        {person(scene.right, 0.6)}
      </div>
    </Page>
  )
}
function Person({ who, width, delay }) {
  const { u } = useLayout()
  const p = useEnter(delay, 12)
  const good = who.tone !== 'bad'
  return (
    <div style={{ width, ...rise(p, 40), padding: `${30 * u}px ${20 * u}px`, borderRadius: 28 * u, background: good ? C.ink : 'white', border: good ? 'none' : `2px dashed ${C.grey}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * u }}>
      <div style={{ fontSize: 110 * u, lineHeight: 1.1 }}>{FACE[who.mood] || '🙂'}</div>
      <Text text={who.name || ''} size={52 * u} weight={800} color={good ? 'white' : C.ink} />
      {who.value && <Text text={who.value} size={40 * u} color={good ? C.red : C.soft} />}
    </div>
  )
}

function Stat({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, content } = useLayout()
  const p = interpolate(frame, [0.4 * fps, 1.8 * fps], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const v = Number(scene.value) || 0
  const shown = Number.isInteger(v) ? Math.round(v * p).toLocaleString() : (v * p).toFixed(1)
  return (
    <Page scene={scene} gap={44}>
      <Badge size={380 * u} delay={0.1}>
        <div style={{ fontWeight: 800, fontSize: 130 * u, lineHeight: 1 }}>
          {clean(scene.prefix)}
          {shown}
          <span style={{ fontSize: 70 * u, color: C.red }}>{clean(scene.suffix)}</span>
        </div>
      </Badge>
      <Lit text={scene.label} size={62 * u} width={content} italic={false} span={0.5} />
    </Page>
  )
}

function Quote({ scene }) {
  const { u, content } = useLayout()
  const by = useEnter(1.6)
  const who = [scene.author, scene.role].filter(Boolean).map(clean).join(' · ')
  return (
    <Page scene={scene} gap={26}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 200 * u, lineHeight: 0.5, color: C.red }}>“</div>
      <Lit text={scene.text} size={80 * u} width={content} span={0.6} />
      {who && <div style={{ fontFamily: KHMER.test(who) ? FONT : MONO, fontSize: 32 * u, letterSpacing: KHMER.test(who) ? 0 : '0.18em', color: C.soft, opacity: by, lineHeight: 1.6 }}>— {who}</div>}
    </Page>
  )
}

function Cta({ scene }) {
  const frame = useCurrentFrame()
  const { u, content } = useLayout()
  const b = useEnter(1.2, 11)
  return (
    <Page scene={scene} gap={50}>
      <Lit text={scene.text} size={84 * u} width={content} span={0.45} />
      {scene.button && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u, padding: `${22 * u}px ${44 * u}px`, borderRadius: 999, background: C.ink, color: 'white', fontWeight: 800, fontSize: 44 * u, opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) scale(${1 + Math.sin(frame / 8) * 0.02 * b})`, boxShadow: `0 ${12 * u}px ${30 * u}px rgba(0,0,0,0.2)` }}>
          <span style={{ width: 18 * u, height: 18 * u, borderRadius: 18 * u, background: C.red }} />
          {clean(scene.button)}
        </div>
      )}
    </Page>
  )
}

export const PAPER = {
  scenes: { hook: Hook, list: List, beforeafter: BeforeAfter, timeline: Timeline, compare: Compare, quote: Quote, stat: Stat, cta: Cta },
  root: { backgroundColor: C.paper, '--hl-bg': C.red, '--hl-text': '#FFFFFF' },
  light: true,
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
