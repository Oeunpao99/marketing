/**
 * AI service · Your AI team — an AI-as-a-service told as a team you hire:
 * the work piling up, the AI "workers" each doing a job, one input becoming
 * finished work, you approving with one tap, the results, the plans, the
 * call to action. Deep navy with the brand's glow; every scene lays itself
 * out for 9:16 and 16:9. Words on screen all come from the script (Khmer or
 * English) — the template itself draws icons, never fixed English.
 *
 * Scenes (app/motion.py AITEAM_PROMPT):
 *   { type: "hook", text, icon, sub? }                                the AI core pulsing, the line
 *   { type: "overload", text, tasks: [label] }                        to-dos piling up, a red counter
 *   { type: "crew", text, agents: [{ role, task, icon }] }            AI workers typing their task, ✓
 *   { type: "pipeline", text, input: { icon, label }, outputs: [{ icon, label }] }   one in, many out
 *   { type: "approve", text, post, button?, channels: [name] }        a phone, one tap, out to every page
 *   { type: "gains", text, metrics: [{ label, value, prefix, suffix }] }   numbers counting up
 *   { type: "plans", text, tiers: [{ name, price, note }], pick, badge? }   the plans, one picked
 *   { type: "cta", text, button }                                     the logo, the button, a tap
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const C = {
  bg: '#090E22',
  bg2: '#0E1634',
  panel: '#131C3D',
  panel2: '#18234A',
  line: 'rgba(148,163,209,0.18)',
  ink: '#FFFFFF',
  sub: '#A7B2CF',
  glow: '#38BDF8',
  ok: '#22C55E',
  bad: '#F43F5E',
}
// the channels a post goes out to: each one's colour and an icon that reads as it
// (this lucide has no brand logos)
const CHANNELS = {
  facebook: ['ThumbsUp', '#1877F2'],
  tiktok: ['Music2', '#111827'],
  telegram: ['Send', '#229ED9'],
  youtube: ['Play', '#FF0033'],
  instagram: ['Camera', '#E1306C'],
  linkedin: ['Briefcase', '#0A66C2'],
  messenger: ['MessageCircle', '#0084FF'],
  whatsapp: ['Phone', '#25D366'],
}
const CARD = { background: C.panel, border: `2px solid ${C.line}`, borderRadius: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }

// sound cue frames (sfx.jsx aiteamCues) — the animations below use the same
const TASK_AT = 12 // overload: the first to-do lands, then one every TASK_GAP
const TASK_GAP = 7
const AGENT_AT = 12 // crew: the first worker starts, then one every AGENT_GAP
const AGENT_GAP = 9
const TYPE_SPEED = 1.3 // letters a frame
const CORE_AT = 10 // pipeline: the core lights up, the outputs follow
const OUT_AT = 30
const OUT_GAP = 8
const TAP_AT = 46 // approve: the tap
const COUNT_AT = 16 // gains: the numbers count for COUNT_LEN frames
const COUNT_LEN = 42
const TIER_AT = 10
const TIER_GAP = 7
const BUTTON_AT = 24 // cta

const letters = (t) => [...new Intl.Segmenter('km', { granularity: 'grapheme' }).segment(clean(t))].map((s) => s.segment)
const typedLen = (t) => letters(t).length
const doneAt = (i, task) => AGENT_AT + i * AGENT_GAP + Math.min(60, Math.ceil(typedLen(task) / TYPE_SPEED)) + 6

export function aiteamCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[6, 'whoosh']]
    case 'overload':
      return (scene.tasks || []).slice(0, 5).map((_, i) => [TASK_AT + i * TASK_GAP, 'pop'])
    case 'crew': {
      const agents = (scene.agents || []).slice(0, 4)
      const cues = agents.map((_, i) => [AGENT_AT + i * AGENT_GAP, 'pop'])
      if (agents.length) cues.push([Math.max(...agents.map((a, i) => doneAt(i, a.task))), 'ding'])
      return cues
    }
    case 'pipeline':
      return [[CORE_AT, 'whoosh'], ...(scene.outputs || []).slice(0, 4).map((_, i) => [OUT_AT + i * OUT_GAP, 'pop'])]
    case 'approve':
      return [[TAP_AT, 'click'], [TAP_AT + 8, 'ding']]
    case 'gains':
      return [[COUNT_AT + COUNT_LEN, 'ding']]
    case 'plans':
      return (scene.tiers || []).slice(0, 4).map((_, i) => [TIER_AT + i * TIER_GAP, 'pop'])
    case 'cta':
      return scene.button ? [[BUTTON_AT, 'pop'], [BUTTON_AT + 22, 'click']] : [[BUTTON_AT, 'pop']]
    default:
      return []
  }
}

function useLayout() {
  const { width, height, fps } = useVideoConfig()
  return { width, height, fps, wide: width > height }
}

/** Deep navy, the brand's glow drifting, a fine grid. */
function Bg({ brand }) {
  const frame = useCurrentFrame()
  const x = 50 + Math.sin(frame / 90) * 14
  const y = 36 + Math.cos(frame / 110) * 8
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(55% 42% at ${x}% ${y}%, ${tint(brand.color, 0.42)}, transparent 72%), radial-gradient(45% 35% at 82% 92%, rgba(56,189,248,0.16), transparent 70%), linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
      }}
    >
      <NeatGrid color="rgba(148,163,209,0.07)" size={72} />
    </AbsoluteFill>
  )
}

function Title({ text, top, size, left, right, align = 'center' }) {
  const { wide } = useLayout()
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top, left: left ?? (wide ? 180 : 64), right: right ?? (wide ? 180 : 64) }}>
      <Words text={text} align={align} color={C.ink} style={{ fontSize: fitSize(text, size ?? (wide ? 62 : 70)), fontWeight: 700, textAlign: align, lineHeight: 1.25 }} />
    </div>
  )
}

/** The AI: a glowing orb, rings pulsing out, a ring of light turning round it. */
function Core({ x, y, size, icon = 'Sparkles', brand, delay = 0 }) {
  const frame = useCurrentFrame()
  const { fps } = useLayout()
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } })
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${s})` }}>
      {[0, 1, 2].map((k) => {
        const p = (((frame - delay + k * 20) % 60) + 60) % 60 / 60
        return (
          <div
            key={k}
            style={{ position: 'absolute', inset: -size * 0.45 * p, borderRadius: '50%', border: `3px solid ${tint('#38BDF8', 0.55 * (1 - p))}` }}
          />
        )
      })}
      <div
        style={{
          position: 'absolute',
          inset: -10,
          borderRadius: '50%',
          background: `conic-gradient(from ${frame * 4}deg, transparent 0deg, ${C.glow} 60deg, transparent 140deg, ${brand.color} 220deg, transparent 300deg)`,
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${tint('#FFFFFF', 0.35)}, transparent 45%), linear-gradient(135deg, ${brand.color}, ${C.glow})`,
          boxShadow: `0 0 ${size * 0.45}px ${tint('#38BDF8', 0.55)}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={icon} size={size * 0.42} color="#FFFFFF" stroke={2} />
      </div>
    </div>
  )
}

/** The hand — taps at ``at``. */
function Tap({ x, y, at, size = 84 }) {
  const frame = useCurrentFrame()
  const come = interpolate(frame, [at - 16, at - 2], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const press = frame >= at && frame < at + 6 ? 0.86 : 1
  const gone = interpolate(frame, [at + 24, at + 34], [1, 0], clamp)
  if (frame < at - 16) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x + (1 - come) * 160,
        top: y + (1 - come) * 220,
        opacity: Math.min(come * 1.4, gone),
        transform: `scale(${press})`,
        filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
      }}
    >
      <Icon name="Pointer" size={size} color="#FFFFFF" stroke={1.6} />
    </div>
  )
}

// ── hook: the AI core, the line ──────────────────────────────────────────────
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width } = useLayout()
  const core = wide ? { x: width / 2, y: 330, size: 210 } : { x: width / 2, y: 650, size: 270 }
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      {/* little lights orbiting the core */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = frame / 40 + (i * Math.PI) / 3
        const r = core.size * (0.95 + (i % 2) * 0.25)
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: core.x + Math.cos(a) * r - 7, top: core.y + Math.sin(a) * r * 0.55 - 7, width: 14, height: 14, borderRadius: 7, background: i % 2 ? C.glow : brand.color, boxShadow: `0 0 16px ${C.glow}`, opacity: interpolate(frame, [8, 20], [0, 1], clamp) }}
          />
        )
      })}
      <Core {...core} icon={scene.icon || 'Sparkles'} brand={brand} />
      <div style={{ position: 'absolute', left: wide ? 200 : 64, right: wide ? 200 : 64, top: wide ? 560 : 1000 }}>
        <Words text={scene.text} delay={8} align="center" color={C.ink} style={{ fontSize: fitSize(scene.text, wide ? 76 : 84), fontWeight: 700, textAlign: 'center', lineHeight: 1.22 }} />
        {scene.sub && (
          <div style={{ marginTop: 26, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: wide ? 34 : 40, color: C.sub, opacity: interpolate(frame, [26, 38], [0, 1], clamp) }}>{clean(scene.sub)}</div>
        )}
      </div>
    </AbsoluteFill>
  )
}

// ── overload: to-dos piling up, a red counter ───────────────────────────────
function Overload({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const tasks = (scene.tasks || []).slice(0, 5)
  const W = wide ? 900 : 880
  const H = wide ? 104 : 132
  const top = wide ? 290 : 520
  const gap = wide ? 112 : 150
  const landed = tasks.filter((_, i) => frame >= TASK_AT + i * TASK_GAP).length
  const shaky = frame > TASK_AT + tasks.length * TASK_GAP + 8
  const badge = spring({ frame: frame - TASK_AT, fps, config: { damping: 10 } })
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} top={wide ? 110 : 260} />
      {tasks.map((t, i) => {
        const s = spring({ frame: frame - TASK_AT - i * TASK_GAP, fps, config: { damping: 13, mass: 0.8 } })
        const tilt = (i % 2 ? 1 : -1) * (1.5 + i * 0.6) + (shaky ? Math.sin((frame + i * 9) / 3.2) * 1.4 : 0)
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: width / 2 - W / 2 + (i % 2 ? 18 : -18),
              top: top + i * gap - (1 - s) * 260,
              width: W,
              height: H,
              opacity: Math.min(1, s * 1.6),
              transform: `rotate(${tilt}deg)`,
              ...CARD,
              background: C.panel2,
              display: 'flex',
              alignItems: 'center',
              gap: 26,
              padding: '0 32px',
            }}
          >
            <div style={{ width: H * 0.56, height: H * 0.56, flex: 'none', borderRadius: 16, background: tint('#F43F5E', 0.16), display: 'grid', placeItems: 'center' }}>
              <Icon name="Clock" size={H * 0.32} color={C.bad} stroke={2.4} />
            </div>
            <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontWeight: 600, fontSize: wide ? 38 : 44, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(t)}</span>
            <div style={{ width: 22, height: 22, flex: 'none', borderRadius: 11, background: C.bad, boxShadow: `0 0 16px ${C.bad}` }} />
          </div>
        )
      })}
      {/* the red counter: how many are waiting */}
      {tasks.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: width / 2 + W / 2 - 50,
            top: top - 54,
            width: 100,
            height: 100,
            borderRadius: 50,
            background: C.bad,
            border: '6px solid #FFFFFF',
            display: 'grid',
            placeItems: 'center',
            transform: `scale(${badge * (shaky ? 1 + Math.sin(frame / 2.5) * 0.06 : 1)})`,
            boxShadow: `0 0 30px ${tint('#F43F5E', 0.6)}`,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 46,
            color: '#FFFFFF',
            zIndex: 2,
          }}
        >
          {landed}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── crew: the AI workers, each typing its job, then ✓ ──────────────────────
function Agent({ a, i, w, h, wide, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useLayout()
  const at = AGENT_AT + i * AGENT_GAP
  const s = spring({ frame: frame - at, fps, config: { damping: 13 } })
  const all = letters(a.task)
  const shown = Math.max(0, Math.min(all.length, Math.floor((frame - at - 6) * TYPE_SPEED)))
  const done = frame >= doneAt(i, a.task)
  const check = spring({ frame: frame - doneAt(i, a.task), fps, config: { damping: 10 } })
  const typing = !done && frame > at
  const av = wide ? 112 : 128
  const status = (
    <div style={{ width: 64, height: 64, flex: 'none', position: 'relative' }}>
      {!done && (
        <div
          style={{
            position: 'absolute',
            inset: 6,
            borderRadius: '50%',
            border: `5px solid ${tint('#38BDF8', 0.2)}`,
            borderTopColor: C.glow,
            transform: `rotate(${frame * 12}deg)`,
            opacity: typing ? 1 : 0.4,
          }}
        />
      )}
      {done && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.ok, display: 'grid', placeItems: 'center', transform: `scale(${check})`, boxShadow: `0 0 22px ${tint('#22C55E', 0.6)}` }}>
          <Icon name="Check" size={36} color="#FFFFFF" stroke={3.2} />
        </div>
      )}
    </div>
  )
  const avatar = (
    <div style={{ width: av, height: av, flex: 'none', borderRadius: '50%', background: `linear-gradient(135deg, ${brand.color}, ${C.glow})`, display: 'grid', placeItems: 'center', boxShadow: `0 0 ${typing ? 34 : 14}px ${tint('#38BDF8', 0.5)}` }}>
      <Icon name={a.icon || 'Bot'} size={av * 0.46} color="#FFFFFF" stroke={2.1} />
    </div>
  )
  const role = <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 36 : 44, color: C.ink, lineHeight: 1.2 }}>{clean(a.role)}</div>
  const task = (
    <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: wide ? 28 : 33, color: C.sub, lineHeight: 1.4, marginTop: 6 }}>
      {all.slice(0, shown).join('')}
      {typing && <span style={{ display: 'inline-block', width: 3, height: '1em', marginLeft: 3, verticalAlign: '-0.12em', background: C.glow, opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2 }} />}
    </div>
  )
  return (
    <div style={{ width: w, height: h, ...CARD, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 60}px) scale(${0.92 + s * 0.08})`, ...(done ? { borderColor: tint('#22C55E', 0.55) } : null) }}>
      {wide ? (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 26px', gap: 14 }}>
          {avatar}
          {role}
          <div style={{ flex: 1 }}>{task}</div>
          {status}
        </div>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 28, padding: '0 32px' }}>
          {avatar}
          <div style={{ flex: 1, minWidth: 0 }}>
            {role}
            {task}
          </div>
          {status}
        </div>
      )}
    </div>
  )
}

function Crew({ scene, brand }) {
  const { wide, width } = useLayout()
  const agents = (scene.agents || []).slice(0, 4)
  const n = Math.max(1, agents.length)
  const w = wide ? Math.min(400, (width - 260 - (n - 1) * 30) / n) : 920
  const h = wide ? 440 : n > 3 ? 210 : 240
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} top={wide ? 100 : 250} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: wide ? 300 : 500,
          display: 'flex',
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: wide ? 30 : 26,
        }}
      >
        {agents.map((a, i) => (
          <Agent key={i} a={a} i={i} w={w} h={h} wide={wide} brand={brand} />
        ))}
      </div>
    </AbsoluteFill>
  )
}

// ── pipeline: one input → the AI → finished work ────────────────────────────
function Box({ icon, label, x, y, w, h, s, accent, wide }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        ...CARD,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '0 24px',
        opacity: Math.min(1, s * 1.5),
        transform: `scale(${0.8 + s * 0.2})`,
      }}
    >
      <div style={{ width: h * 0.56, height: h * 0.56, flex: 'none', borderRadius: 16, background: accent, display: 'grid', placeItems: 'center' }}>
        <Icon name={icon || 'Sparkles'} size={h * 0.3} color="#FFFFFF" stroke={2.2} />
      </div>
      <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontWeight: 600, fontSize: wide ? 30 : 34, color: C.ink, lineHeight: 1.25 }}>{clean(label)}</span>
    </div>
  )
}

function Pipeline({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const outs = (scene.outputs || []).slice(0, 4)
  const inp = scene.input || {}
  // where everything sits
  const core = wide ? { x: 900, y: 520, size: 190 } : { x: width / 2, y: 820, size: 210 }
  const inBox = wide ? { x: 380, y: 520, w: 440, h: 140 } : { x: width / 2, y: 520, w: 640, h: 150 }
  const outSpots = wide
    ? outs.map((_, i) => ({ x: 1480, y: 520 + (i - (outs.length - 1) / 2) * 150, w: 500, h: 124 }))
    : outs.map((_, i) => ({ x: width / 2 + (i % 2 ? 235 : -235) * (outs.length > 1 ? 1 : 0), y: 1110 + Math.floor(i / 2) * 175, w: 440, h: 150 }))
  const inS = spring({ frame, fps, config: { damping: 14 } })
  const lit = interpolate(frame, [CORE_AT, CORE_AT + 12], [0, 1], clamp)
  // the paths: input → core, core → each output
  const paths = [
    { from: wide ? [inBox.x + inBox.w / 2, inBox.y] : [inBox.x, inBox.y + inBox.h / 2], to: wide ? [core.x - core.size / 2, core.y] : [core.x, core.y - core.size / 2], at: 4 },
    ...outSpots.map((o, i) => ({ from: wide ? [core.x + core.size / 2, core.y] : [core.x, core.y + core.size / 2], to: wide ? [o.x - o.w / 2, o.y] : [o.x, o.y - o.h / 2], at: OUT_AT - 10 + i * OUT_GAP })),
  ]
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} top={wide ? 100 : 250} />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {paths.map((p, i) => {
          const draw = interpolate(frame, [p.at, p.at + 10], [0, 1], clamp)
          const [x1, y1] = p.from
          const [x2, y2] = p.to
          const mx = wide ? (x1 + x2) / 2 : x1
          const my = wide ? y1 : (y1 + y2) / 2
          const d = wide ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
          const len = Math.hypot(x2 - x1, y2 - y1) * 1.3
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={tint('#38BDF8', 0.35)} strokeWidth={4} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} strokeLinecap="round" />
              {draw >= 1 &&
                [0, 1].map((k) => {
                  const t = (((frame - p.at + k * 14) % 28) + 28) % 28 / 28
                  // a point along the curve (the same Bézier)
                  const bx = wide ? (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * mx + 3 * (1 - t) * t ** 2 * mx + t ** 3 * x2 : (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3 * x2
                  const by = wide ? (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y2 : (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * my + 3 * (1 - t) * t ** 2 * my + t ** 3 * y2
                  return <circle key={k} cx={bx} cy={by} r={8} fill={C.glow} style={{ filter: `drop-shadow(0 0 8px ${C.glow})` }} />
                })}
            </g>
          )
        })}
      </svg>
      <Box icon={inp.icon} label={inp.label} {...inBox} s={inS} accent={tint('#A7B2CF', 0.25)} wide={wide} />
      <div style={{ opacity: 0.4 + lit * 0.6 }}>
        <Core {...core} icon="Sparkles" brand={brand} delay={CORE_AT - 6} />
      </div>
      {outs.map((o, i) => {
        const s = spring({ frame: frame - OUT_AT - i * OUT_GAP, fps, config: { damping: 12 } })
        return <Box key={i} icon={o.icon} label={o.label} {...outSpots[i]} s={s} accent={`linear-gradient(135deg, ${brand.color}, ${C.glow})`} wide={wide} />
      })}
    </AbsoluteFill>
  )
}

// ── approve: a phone, one tap, out to every page ────────────────────────────
function Approve({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const ph = wide ? { x: 250, y: 190, w: 380, h: 720 } : { x: width / 2 - 290, y: 440, w: 580, h: 1030 }
  const k = ph.w / 580 // phone sizes are set for a 580-wide phone
  const rise = spring({ frame, fps, config: { damping: 16 } })
  const tapped = frame >= TAP_AT
  const ok = spring({ frame: frame - TAP_AT, fps, config: { damping: 11 } })
  const channels = (scene.channels || []).slice(0, 5)
  // the button, inside the phone (for the hand)
  const btn = { x: ph.x + ph.w * 0.53, y: ph.y + ph.h - 150 * k, w: ph.w * 0.4, h: 92 * k }
  const spots = wide
    ? channels.map((_, i) => [840 + i * 190, 660])
    : channels.map((_, i) => [i % 2 ? width - 130 : 130, 520 + i * 170])
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      {wide ? <Title text={scene.text} top={260} size={60} left={760} right={140} align="left" /> : <Title text={scene.text} top={250} size={66} />}
      {/* the phone */}
      <div
        style={{
          position: 'absolute',
          left: ph.x,
          top: ph.y + (1 - rise) * 300,
          width: ph.w,
          height: ph.h,
          borderRadius: 64 * k,
          background: '#0B1020',
          border: `${10 * k}px solid #2A3557`,
          boxShadow: '0 40px 90px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          opacity: Math.min(1, rise * 1.4),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: '#F4F6FB', padding: `${70 * k}px ${30 * k}px ${30 * k}px`, display: 'flex', flexDirection: 'column', gap: 22 * k }}>
          {/* the app bar: the brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 * k }}>
            <div style={{ width: 64 * k, height: 64 * k, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {brand.logo ? <Img src={srcOf(brand.logo)} style={{ width: '72%', height: '72%', objectFit: 'contain' }} /> : <span style={{ width: 26 * k, height: 26 * k, borderRadius: '50%', background: brand.color }} />}
            </div>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32 * k, color: '#111827' }}>{clean(brand.name)}</span>
          </div>
          {/* the post, ready */}
          <div style={{ flex: 1, borderRadius: 26 * k, background: '#FFFFFF', boxShadow: '0 6px 20px rgba(17,24,39,0.08)', padding: 24 * k, display: 'flex', flexDirection: 'column', gap: 18 * k }}>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 30 * k, color: '#1F2937', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{clean(scene.post)}</div>
            <div style={{ flex: 1, borderRadius: 20 * k, background: `linear-gradient(135deg, ${brand.color}, ${C.glow})`, display: 'grid', placeItems: 'center', minHeight: 160 * k }}>
              <Icon name="Image" size={90 * k} color="rgba(255,255,255,0.85)" stroke={1.6} />
            </div>
          </div>
          {/* edit · approve */}
          <div style={{ display: 'flex', gap: 18 * k, height: 92 * k }}>
            <div style={{ flex: 1, borderRadius: 22 * k, background: '#E5E9F2', display: 'grid', placeItems: 'center' }}>
              <Icon name="Pencil" size={38 * k} color="#475569" stroke={2.2} />
            </div>
            <div
              style={{
                flex: 1.4,
                borderRadius: 22 * k,
                background: tapped ? C.ok : brand.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12 * k,
                color: '#FFFFFF',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 32 * k,
                transform: `scale(${tapped ? 1 + (1 - ok) * 0.08 : 1})`,
              }}
            >
              <Icon name="Check" size={36 * k} color="#FFFFFF" stroke={3} />
              {scene.button ? clean(scene.button) : null}
            </div>
          </div>
        </div>
      </div>
      <Tap x={btn.x + btn.w * 0.35} y={btn.y + btn.h * 0.3} at={TAP_AT} size={wide ? 70 : 92} />
      {/* out to every page */}
      {channels.map((c, i) => {
        const s = spring({ frame: frame - TAP_AT - 6 - i * 5, fps, config: { damping: 12 } })
        const [tx, ty] = spots[i]
        const fx = ph.x + ph.w / 2
        const fy = ph.y + ph.h / 2
        const [icon, color] = CHANNELS[String(c).toLowerCase()] || ['Globe', C.glow]
        const size = wide ? 104 : 120
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: fx + (tx - fx) * s - size / 2,
              top: fy + (ty - fy) * s - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              border: '5px solid #FFFFFF',
              display: 'grid',
              placeItems: 'center',
              opacity: Math.min(1, s * 2),
              transform: `scale(${0.4 + s * 0.6})`,
              boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
            }}
          >
            <Icon name={icon} size={size * 0.46} color="#FFFFFF" stroke={2.4} />
            <div style={{ position: 'absolute', right: -4, bottom: -4, width: size * 0.38, height: size * 0.38, borderRadius: '50%', background: C.ok, border: '4px solid #FFFFFF', display: 'grid', placeItems: 'center' }}>
              <Icon name="Check" size={size * 0.2} color="#FFFFFF" stroke={3.4} />
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

// ── gains: the results, counting up ──────────────────────────────────────────
const fmt = (v, decimals) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

function Gains({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const metrics = (scene.metrics || []).slice(0, 3)
  const n = Math.max(1, metrics.length)
  const w = wide ? Math.min(480, (width - 300 - (n - 1) * 34) / n) : 900
  const h = wide ? 380 : n === 3 ? 270 : 320
  const p = interpolate(frame, [COUNT_AT, COUNT_AT + COUNT_LEN], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} top={wide ? 100 : 250} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 330 : 500, display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 34 : 30 }}>
        {metrics.map((m, i) => {
          const s = spring({ frame: frame - 6 - i * 6, fps, config: { damping: 14 } })
          const value = Number(m.value) || 0
          const decimals = Number.isInteger(value) ? 0 : 1
          return (
            <div key={i} style={{ width: w, height: h, ...CARD, position: 'relative', overflow: 'hidden', opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 50}px)`, padding: wide ? '54px 34px' : '30px 40px', display: 'flex', flexDirection: 'column', justifyContent: wide ? 'flex-start' : 'center', alignItems: wide ? 'center' : 'flex-start', textAlign: wide ? 'center' : 'left' }}>
              {/* bars rising behind the number */}
              <div style={{ position: 'absolute', ...(wide ? { left: 34, right: 34, justifyContent: 'space-between', height: h * 0.26, opacity: 0.3 } : { right: 30, gap: 12, height: h * 0.7, opacity: 0.35 }), bottom: 0, display: 'flex', alignItems: 'flex-end' }}>
                {[0.35, 0.5, 0.45, 0.7, 0.85, 1].map((b, k) => (
                  <div key={k} style={{ width: 22, height: `${b * 100 * interpolate(frame, [COUNT_AT + k * 3, COUNT_AT + 20 + k * 3], [0, 1], clamp)}%`, borderRadius: '8px 8px 0 0', background: `linear-gradient(180deg, ${C.glow}, ${brand.color})` }} />
                ))}
              </div>
              <div style={{ position: 'relative', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 104 : 120, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {clean(m.prefix)}
                {fmt(value * p, decimals)}
                {clean(m.suffix)}
              </div>
              <div style={{ position: 'relative', marginTop: 16, fontFamily: FONT, fontWeight: 600, fontSize: wide ? 32 : 38, color: C.sub, lineHeight: 1.3 }}>{clean(m.label)}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── plans: the tiers, the one we suggest lifted ─────────────────────────────
function Plans({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const tiers = (scene.tiers || []).slice(0, 4)
  const n = Math.max(1, tiers.length)
  const pick = Math.min(n - 1, Math.max(0, Number(scene.pick) || 0))
  const w = wide ? Math.min(380, (width - 300 - (n - 1) * 28) / n) : 900
  const h = wide ? 420 : n > 3 ? 190 : 220
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} top={wide ? 100 : 250} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 300 : 500, display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 28 : 24 }}>
        {tiers.map((t, i) => {
          const s = spring({ frame: frame - TIER_AT - i * TIER_GAP, fps, config: { damping: 13 } })
          const on = i === pick
          const lift = on ? spring({ frame: frame - TIER_AT - n * TIER_GAP - 6, fps, config: { damping: 12 } }) : 0
          return (
            <div
              key={i}
              style={{
                width: w,
                height: h,
                ...CARD,
                position: 'relative',
                background: on ? `linear-gradient(160deg, ${tint(brand.color, 0.55)}, ${C.panel2})` : C.panel,
                borderColor: on ? C.glow : C.line,
                boxShadow: on ? `0 0 ${40 * lift}px ${tint('#38BDF8', 0.45)}, 0 24px 60px rgba(0,0,0,0.35)` : CARD.boxShadow,
                opacity: Math.min(1, s * 1.5),
                transform: `translateY(${(1 - s) * 50}px) scale(${1 + lift * 0.04})`,
                padding: wide ? '40px 30px' : '0 40px',
                display: 'flex',
                flexDirection: wide ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: wide ? 'center' : 'space-between',
                gap: wide ? 16 : 24,
                textAlign: wide ? 'center' : 'left',
              }}
            >
              {on && scene.badge && (
                <div style={{ position: 'absolute', top: -24, right: wide ? undefined : 40, left: wide ? '50%' : undefined, transform: wide ? 'translateX(-50%)' : undefined, padding: '8px 20px', borderRadius: 999, background: C.glow, color: C.bg, fontFamily: FONT, fontWeight: 800, fontSize: 26, whiteSpace: 'nowrap', opacity: lift }}>{clean(scene.badge)}</div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 40 : 46, color: C.ink, lineHeight: 1.2 }}>{clean(t.name)}</div>
                {t.note && <div style={{ marginTop: 8, fontFamily: FONT, fontWeight: 500, fontSize: wide ? 26 : 30, color: C.sub, lineHeight: 1.35 }}>{clean(t.note)}</div>}
              </div>
              {t.price && <div style={{ flex: 'none', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 58 : 60, color: on ? '#FFFFFF' : C.ink, letterSpacing: '-0.02em' }}>{clean(t.price)}</div>}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── cta: the logo, the line, the button, a tap ──────────────────────────────
function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, fps } = useLayout()
  const L = wide ? { size: 180, top: 110, tTop: 360, bTop: 640 } : { size: 240, top: 380, tTop: 720, bTop: 1130 }
  const s = spring({ frame, fps, config: { damping: 12 } })
  const b = spring({ frame: frame - BUTTON_AT, fps, config: { damping: 11 } })
  const pulse = 1 + Math.sin(frame / 7) * 0.025
  const bw = wide ? 520 : 620
  const bh = wide ? 104 : 124
  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <div style={{ position: 'absolute', left: width / 2 - L.size / 2, top: L.top, width: L.size, height: L.size, transform: `scale(${s})` }}>
        <div style={{ position: 'absolute', inset: -26, borderRadius: '50%', background: `radial-gradient(circle, ${tint('#38BDF8', 0.45)}, transparent 70%)` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#FFFFFF', display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
          {brand.logo ? (
            <Img src={srcOf(brand.logo)} style={{ width: '66%', height: '66%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: L.size * 0.18, color: brand.color, textAlign: 'center', padding: 12 }}>{clean(brand.name)}</span>
          )}
        </div>
      </div>
      <div style={{ position: 'absolute', left: wide ? 220 : 64, right: wide ? 220 : 64, top: L.tTop }}>
        <Words text={scene.text} delay={8} align="center" color={C.ink} style={{ fontSize: fitSize(scene.text, wide ? 70 : 78), fontWeight: 700, textAlign: 'center', lineHeight: 1.22 }} />
      </div>
      {scene.button && (
        <>
          <div
            style={{
              position: 'absolute',
              left: width / 2 - bw / 2,
              top: L.bTop,
              width: bw,
              height: bh,
              borderRadius: bh / 2,
              background: `linear-gradient(135deg, ${brand.color}, ${C.glow})`,
              boxShadow: `0 0 40px ${tint('#38BDF8', 0.5)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: wide ? 42 : 50,
              color: '#FFFFFF',
              transform: `scale(${b * pulse})`,
            }}
          >
            {clean(scene.button)}
            <Icon name="ArrowRight" size={wide ? 40 : 48} color="#FFFFFF" stroke={2.6} />
          </div>
          <Tap x={width / 2 + bw * 0.18} y={L.bTop + bh * 0.35} at={BUTTON_AT + 22} size={wide ? 72 : 90} />
        </>
      )}
    </AbsoluteFill>
  )
}

export const AITEAM = {
  scenes: { hook: Hook, overload: Overload, crew: Crew, pipeline: Pipeline, approve: Approve, gains: Gains, plans: Plans, cta: Cta },
  root: { backgroundColor: C.bg },
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}
