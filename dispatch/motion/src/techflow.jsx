/**
 * Tech explainer — how a technology works, step by step (after the user's
 * "How the Internet Works" brief, 2026-10-16): a dark navy stage with a faint
 * moving grid, flat line-drawn devices (Device — SVG, no images), glowing cyan
 * data packets (Packet) travelling between network nodes (NetworkNode),
 * emerald for success, amber for a warning.
 *
 * Its own scenes (app/motion.py TECHFLOW_PROMPT):
 *
 *   { type: "hook", text, device? }                                   the device pops in, its screen glows
 *   { type: "send", from: { device, label }, to: { device, label }, text }   packets travel from one to the other
 *   { type: "address", device, from, to, text }                       a label scrambles from one value into another
 *   { type: "lookup", server, question, answer, text? }               a question to a server, the answer types out
 *   { type: "hops", nodes: [{ device, label }], text }                a packet hops across the network on dashed lines
 *   { type: "assemble", device, label, text }                         packets come back and build the page
 *   { type: "checklist", title, checks: [text] }                      the ideas to remember, ticked one by one
 *
 * cta is saas.jsx's in this palette. Every scene lays itself out for 9:16 and 16:9.
 */
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
export const NAVY = '#0B1220'
export const CYAN = '#22D3EE'
export const EMERALD = '#10B981'
export const AMBER = '#F59E0B'
const LINE = '#CFE6FF'
const PANEL = '#111B2E'

/** The stage: navy, a faint cyan grid drifting, darker at the edges. */
export function TechGrid() {
  const frame = useCurrentFrame()
  const size = 72
  return (
    <AbsoluteFill style={{ background: NAVY, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(34,211,238,0.08) 2px, transparent 2px), linear-gradient(90deg, rgba(34,211,238,0.08) 2px, transparent 2px)`,
          backgroundSize: `${size}px ${size}px`,
          backgroundPosition: `${-((frame * 0.3) % size)}px ${-((frame * 0.5) % size)}px`,
          maskImage: 'radial-gradient(ellipse 85% 70% at 50% 45%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 70% at 50% 45%, black 30%, transparent 100%)',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 40%, rgba(34,211,238,0.08), transparent 70%)' }} />
    </AbsoluteFill>
  )
}

/** A flat line-drawn device (viewBox 100×100). `glow` lights the screen / LEDs. */
export function Device({ kind = 'phone', size = 160, color = LINE, glow = 0 }) {
  const sw = 4
  const lit = `rgba(34,211,238,${0.15 + 0.55 * glow})`
  const p = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const shapes = {
    phone: (
      <>
        <rect x="28" y="8" width="44" height="84" rx="9" {...p} />
        <rect x="33" y="17" width="34" height="62" rx="3" fill={lit} stroke="none" />
        <line x1="44" y1="13" x2="56" y2="13" {...p} strokeWidth={3} />
        <circle cx="50" cy="85" r="2.5" fill={color} />
      </>
    ),
    laptop: (
      <>
        <rect x="18" y="20" width="64" height="44" rx="4" {...p} />
        <rect x="23" y="25" width="54" height="34" rx="2" fill={lit} stroke="none" />
        <path d="M8 74 H92 L86 80 H14 Z" {...p} />
      </>
    ),
    router: (
      <>
        <rect x="14" y="50" width="72" height="28" rx="6" {...p} />
        <line x1="30" y1="50" x2="22" y2="20" {...p} />
        <line x1="70" y1="50" x2="78" y2="20" {...p} />
        {[34, 50, 66].map((x, i) => (
          <circle key={x} cx={x} cy="64" r="4" fill={i === 1 ? EMERALD : CYAN} opacity={0.35 + 0.65 * glow} />
        ))}
        <path d="M38 30 Q50 20 62 30 M43 36 Q50 30 57 36" {...p} strokeWidth={3} opacity={0.4 + 0.6 * glow} />
      </>
    ),
    cloud: <path d="M28 72 H74 A16 16 0 0 0 72 40 A22 22 0 0 0 30 38 A17 17 0 0 0 28 72 Z" {...p} fill={lit} />,
    server: (
      <>
        {[12, 40, 68].map((y) => (
          <g key={y}>
            <rect x="18" y={y} width="64" height="22" rx="4" {...p} />
            <circle cx="30" cy={y + 11} r="3.5" fill={EMERALD} opacity={0.35 + 0.65 * glow} />
            <line x1="44" y1={y + 11} x2="70" y2={y + 11} {...p} strokeWidth={3} />
          </g>
        ))}
      </>
    ),
    globe: (
      <>
        <circle cx="50" cy="50" r="36" {...p} fill={lit} />
        <ellipse cx="50" cy="50" rx="15" ry="36" {...p} />
        <line x1="14" y1="50" x2="86" y2="50" {...p} />
        <path d="M20 32 H80 M20 68 H80" {...p} strokeWidth={3} />
      </>
    ),
    database: (
      <>
        <ellipse cx="50" cy="22" rx="30" ry="10" {...p} fill={lit} />
        <path d="M20 22 V76 A30 10 0 0 0 80 76 V22" {...p} />
        <path d="M20 40 A30 10 0 0 0 80 40 M20 58 A30 10 0 0 0 80 58" {...p} strokeWidth={3} />
      </>
    ),
    lock: (
      <>
        <path d="M32 46 V34 A18 18 0 0 1 68 34 V46" {...p} />
        <rect x="22" y="46" width="56" height="42" rx="8" {...p} fill={lit} />
        <circle cx="50" cy="64" r="5" fill={color} />
      </>
    ),
    user: (
      <>
        <circle cx="50" cy="34" r="16" {...p} fill={lit} />
        <path d="M18 88 A32 30 0 0 1 82 88" {...p} />
      </>
    ),
    store: (
      <>
        <path d="M14 36 L22 16 H78 L86 36 Z" {...p} fill={lit} />
        <rect x="20" y="36" width="60" height="50" {...p} />
        <rect x="42" y="58" width="16" height="28" {...p} />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', filter: glow ? `drop-shadow(0 0 ${12 * glow}px rgba(34,211,238,0.55))` : undefined }}>
      {shapes[kind] || shapes.phone}
    </svg>
  )
}

/** A device in its tile, with a label under it. */
export function NetworkNode({ device, label, size = 150, active = 0, done = false }) {
  const ring = done ? EMERALD : CYAN
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          background: PANEL,
          border: `3px solid ${active || done ? ring : 'rgba(207,230,255,0.18)'}`,
          boxShadow: active ? `0 0 ${40 * active}px rgba(34,211,238,${0.45 * active})` : 'none',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Device kind={device} size={size * 0.62} glow={Math.max(active, done ? 0.6 : 0)} />
      </div>
      {label && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: Math.max(30, size * 0.22), color: '#FFFFFF', whiteSpace: 'nowrap' }}>{clean(label)}</div>}
    </div>
  )
}

/** A data packet: a glowing cyan square. */
export function Packet({ x, y, size = 34, color = CYAN, opacity = 1 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: color,
        boxShadow: `0 0 ${size * 0.8}px ${color}, 0 0 ${size * 0.25}px #FFFFFF inset`,
        opacity,
      }}
    />
  )
}

/** The scene's line on screen — big, white, the ⟦key word⟧ in cyan. */
function Title({ text, wide, top, delay = 0 }) {
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top, left: wide ? 160 : 70, right: wide ? 160 : 70 }}>
      <Words text={text} delay={delay} align="center" color="#FFFFFF" style={{ fontWeight: 700, fontSize: fitSize(text, wide ? 76 : 80), justifyContent: 'center', textAlign: 'center' }} />
    </div>
  )
}

// ── hook: the device pops in, its screen glows ─────────────────────────────
function makeHook() {
  return function Hook({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pop = spring({ frame: frame - 2, fps, config: { damping: 10 } })
    const glow = 0.55 + 0.45 * Math.sin(frame / 9) * interpolate(frame, [10, 20], [0, 1], clamp)
    const kind = scene.device || 'phone'
    return (
      <AbsoluteFill>
        <TechGrid />
        <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 150 : 430, display: 'flex', justifyContent: 'center', transform: `scale(${pop})` }}>
          <Device kind={kind} size={wide ? 300 : 360} glow={Math.max(0, glow)} />
        </div>
        <Title text={scene.text} wide={wide} top={wide ? 560 : 920} delay={10} />
      </AbsoluteFill>
    )
  }
}

// ── send: packets travel from one device to the next ──────────────────────
function makeSend() {
  return function Send({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const a = wide ? { x: width * 0.28, y: 560 } : { x: width / 2, y: 640 }
    const b = wide ? { x: width * 0.72, y: 560 } : { x: width / 2, y: 1300 }
    const size = wide ? 210 : 280
    const inA = spring({ frame, fps, config: { damping: 14 } })
    const inB = spring({ frame: frame - 6, fps, config: { damping: 14 } })
    const line = interpolate(frame, [8, 22], [0, 1], { ...clamp, easing: ease })
    const arrived = frame > 40
    return (
      <AbsoluteFill>
        <TechGrid />
        <Title text={scene.text} wide={wide} top={wide ? 120 : 230} delay={4} />
        {/* the dashed wire */}
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <line
            x1={a.x}
            y1={a.y}
            x2={a.x + (b.x - a.x) * line}
            y2={a.y + (b.y - a.y) * line}
            stroke="rgba(34,211,238,0.45)"
            strokeWidth="5"
            strokeDasharray="14 14"
            strokeDashoffset={-frame * 2}
          />
        </svg>
        {/* the packets, a stream of them */}
        {[0, 1, 2, 3, 4].map((k) => {
          const t = ((frame - 20 - k * 9) % 46) / 46
          if (frame < 20 + k * 9) return null
          const e = ease(Math.max(0, Math.min(1, t)))
          return <Packet key={k} x={a.x + (b.x - a.x) * e} y={a.y + (b.y - a.y) * e} size={wide ? 30 : 36} opacity={t < 0.92 ? 1 : (1 - t) * 12} />
        })}
        <div style={{ position: 'absolute', left: a.x - 200, top: a.y - size / 2, width: 400, display: 'flex', justifyContent: 'center', transform: `scale(${inA})` }}>
          <NetworkNode device={scene.from?.device || 'phone'} label={scene.from?.label} size={size} active={0.6} />
        </div>
        <div style={{ position: 'absolute', left: b.x - 200, top: b.y - size / 2, width: 400, display: 'flex', justifyContent: 'center', transform: `scale(${inB})` }}>
          <NetworkNode device={scene.to?.device || 'router'} label={scene.to?.label} size={size} active={arrived ? 0.5 + 0.5 * Math.abs(Math.sin(frame / 6)) : 0} />
        </div>
      </AbsoluteFill>
    )
  }
}

// ── address: a label scrambles from one value into another ────────────────
const SCRAMBLE = '0123456789ABCDEFx.'
function makeAddress() {
  return function Address({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pop = spring({ frame, fps, config: { damping: 14 } })
    const from = clean(scene.from)
    const to = clean(scene.to)
    const start = 34
    const len = Math.max(from.length, to.length)
    // each character settles one after another, the rest flicker
    const text = Array.from({ length: len }, (_, i) => {
      const settle = start + 8 + i * 2
      if (frame < start) return from[i] || ''
      if (frame >= settle) return to[i] || ''
      return to[i] === undefined ? '' : SCRAMBLE[Math.floor(random(`s${i}-${frame}`) * SCRAMBLE.length)]
    }).join('')
    const done = frame >= start + 8 + len * 2
    const color = done ? EMERALD : frame >= start ? AMBER : CYAN
    return (
      <AbsoluteFill>
        <TechGrid />
        <Title text={scene.text} wide={wide} top={wide ? 120 : 230} delay={4} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 50, paddingTop: wide ? 120 : 160 }}>
          <div style={{ transform: `scale(${pop})` }}>
            <NetworkNode device={scene.device || 'router'} size={wide ? 240 : 360} active={0.4 + 0.3 * Math.sin(frame / 8)} done={done} />
          </div>
          <div
            style={{
              padding: '20px 44px',
              borderRadius: 22,
              background: PANEL,
              border: `3px solid ${color}`,
              boxShadow: `0 0 34px ${color}55`,
              fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
              fontWeight: 700,
              fontSize: wide ? 64 : 86,
              letterSpacing: '0.02em',
              color: '#FFFFFF',
              minWidth: len * (wide ? 40 : 54),
              textAlign: 'center',
              opacity: interpolate(frame, [8, 16], [0, 1], clamp),
            }}
          >
            {text}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── lookup: a question to a server, the answer types out ───────────────────
function makeLookup() {
  return function Lookup({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const q = spring({ frame: frame - 8, fps, config: { damping: 13 } })
    const answer = clean(scene.answer)
    const typeAt = 40
    const shown = Math.max(0, Math.min(answer.length, Math.floor((frame - typeAt) / 2)))
    const done = shown >= answer.length
    const bubble = (side, children, s, border) => (
      <div
        style={{
          maxWidth: wide ? 620 : 760,
          padding: '22px 34px',
          borderRadius: side === 'left' ? '30px 30px 30px 8px' : '30px 30px 8px 30px',
          background: PANEL,
          border: `3px solid ${border}`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: wide ? 54 : 70,
          color: '#FFFFFF',
          transform: `scale(${s})`,
          transformOrigin: side === 'left' ? 'left bottom' : 'right bottom',
        }}
      >
        {children}
      </div>
    )
    return (
      <AbsoluteFill>
        <TechGrid />
        {scene.text && <Title text={scene.text} wide={wide} top={wide ? 90 : 200} delay={4} />}
        <AbsoluteFill style={{ justifyContent: 'center', padding: wide ? '120px 220px 160px' : '250px 70px 380px', display: 'flex', flexDirection: 'column', gap: wide ? 40 : 60 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26 }}>
            <div style={{ position: 'relative', width: 90, height: 90, flex: 'none' }}>
              <Packet x={45} y={45} size={70} />
            </div>
            {bubble('left', clean(scene.question), q, CYAN)}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, justifyContent: 'flex-end' }}>
            {frame >= typeAt - 6 &&
              bubble(
                'right',
                <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace", color: done ? EMERALD : '#FFFFFF' }}>
                  {answer.slice(0, shown)}
                  <span style={{ opacity: !done && Math.floor(frame / 8) % 2 === 0 ? 1 : 0, color: CYAN }}>▍</span>
                </span>,
                spring({ frame: frame - typeAt + 6, fps, config: { damping: 13 } }),
                done ? EMERALD : 'rgba(207,230,255,0.25)',
              )}
            <NetworkNode device="server" label={scene.server} size={wide ? 170 : 230} active={frame >= typeAt - 6 && !done ? 0.8 : 0.3} done={done} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── hops: a packet hops across the network on dashed lines ────────────────
function makeHops() {
  return function Hops({ scene }) {
    const frame = useCurrentFrame()
    const { width, height } = useVideoConfig()
    const wide = width > height
    const nodes = (scene.nodes || []).slice(0, 5)
    const n = nodes.length
    // a map-like zigzag through the frame
    const pts = nodes.map((_, i) => {
      const f = n > 1 ? i / (n - 1) : 0
      return wide
        ? { x: 220 + f * (width - 440), y: 560 + (i % 2 ? -150 : 130) }
        : { x: i % 2 ? width * 0.72 : width * 0.28, y: 560 + f * 860 }
    })
    const hop = 22 // frames a hop takes
    const startAt = 12
    const pos = Math.max(0, Math.min(n - 1, (frame - startAt) / hop))
    const k = Math.floor(pos)
    const t = ease(pos - k)
    const here = k >= n - 1 ? pts[n - 1] : { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t, y: pts[k].y + (pts[k + 1].y - pts[k].y) * t }
    const size = wide ? 140 : 190
    return (
      <AbsoluteFill>
        <TechGrid />
        <Title text={scene.text} wide={wide} top={wide ? 90 : 200} delay={4} />
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          {pts.slice(1).map((p, i) => {
            const draw = interpolate(frame, [4 + i * 4, 16 + i * 4], [0, 1], clamp)
            const a = pts[i]
            const walked = pos >= i + 1
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={a.x + (p.x - a.x) * draw}
                y2={a.y + (p.y - a.y) * draw}
                stroke={walked ? 'rgba(16,185,129,0.7)' : 'rgba(34,211,238,0.4)'}
                strokeWidth="5"
                strokeDasharray="14 14"
                strokeDashoffset={-frame * 2}
              />
            )
          })}
        </svg>
        {nodes.map((nd, i) => {
          const s = interpolate(frame, [i * 4, i * 4 + 10], [0, 1], { ...clamp, easing: ease })
          const visited = frame >= startAt && pos >= i
          return (
            <div key={i} style={{ position: 'absolute', left: pts[i].x - 160, top: pts[i].y - size / 2, width: 320, display: 'flex', justifyContent: 'center', opacity: s, transform: `scale(${0.7 + 0.3 * s})` }}>
              <NetworkNode device={nd.device} label={nd.label} size={size} active={Math.abs(pos - i) < 0.3 ? 1 : 0} done={visited && i < pos - 0.3} />
            </div>
          )
        })}
        {frame >= startAt && <Packet x={here.x} y={here.y - size * 0.62} size={wide ? 32 : 38} />}
      </AbsoluteFill>
    )
  }
}

// ── assemble: packets come back and build the page ────────────────────────
function makeAssemble() {
  return function Assemble({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pop = spring({ frame, fps, config: { damping: 14 } })
    const W = wide ? 380 : 470
    const H = W * 1.9
    const cx = width / 2
    const top = wide ? 260 : 520
    const blocks = [
      { y: 0.05, h: 0.07, w: 0.9, c: 'rgba(207,230,255,0.25)', bar: true },
      { y: 0.16, h: 0.26, w: 0.9, c: 'rgba(34,211,238,0.35)' },
      { y: 0.46, h: 0.05, w: 0.8, c: 'rgba(207,230,255,0.3)' },
      { y: 0.54, h: 0.05, w: 0.65, c: 'rgba(207,230,255,0.3)' },
      { y: 0.64, h: 0.14, w: 0.42, c: 'rgba(16,185,129,0.45)' },
      { y: 0.64, h: 0.14, w: 0.42, c: 'rgba(245,158,11,0.4)', right: true },
    ]
    const label = clean(scene.label)
    return (
      <AbsoluteFill>
        <TechGrid />
        <Title text={scene.text} wide={wide} top={wide ? 90 : 210} delay={4} />
        {/* the phone */}
        <div style={{ position: 'absolute', left: cx - W / 2, top, width: W, height: H, borderRadius: W * 0.14, border: `6px solid ${LINE}`, background: PANEL, transform: `scale(${pop})`, overflow: 'hidden' }}>
          {blocks.map((b, i) => {
            const at = 18 + i * 9
            const s = spring({ frame: frame - at, fps, config: { damping: 14 } })
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: `${b.y * 100}%`,
                  left: b.right ? `${(1 - b.w - 0.05) * 100}%` : '5%',
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                  borderRadius: 14,
                  background: b.c,
                  opacity: s,
                  transform: `scale(${0.6 + 0.4 * s})`,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 18,
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: W * 0.06,
                  color: '#FFFFFF',
                }}
              >
                {b.bar && label}
              </div>
            )
          })}
        </div>
        {/* the packets flying in from above, each landing on its block */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const at = 6 + i * 9
          const t = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: ease })
          if (t <= 0 || t >= 1) return null
          const sx = cx + (random(`ax${i}`) - 0.5) * width * 0.9
          const b = blocks[i]
          const tx = cx - W / 2 + W * ((b.right ? 1 - b.w - 0.05 : 0.05) + b.w / 2)
          const ty = top + H * (b.y + b.h / 2)
          return <Packet key={i} x={sx + (tx - sx) * t} y={-60 + (ty + 60) * t} size={wide ? 30 : 36} />
        })}
      </AbsoluteFill>
    )
  }
}

// ── checklist: the ideas to remember, ticked one by one ───────────────────
function makeChecklist() {
  return function Checklist({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const checks = (scene.checks || []).slice(0, 5)
    return (
      <AbsoluteFill>
        <TechGrid />
        <Title text={scene.title} wide={wide} top={wide ? 110 : 330} delay={2} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: wide ? 140 : 160 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: wide ? 24 : 34, width: wide ? 900 : width - 200 }}>
            {checks.map((c, i) => {
              const at = 10 + i * 12
              const s = spring({ frame: frame - at, fps, config: { damping: 14 } })
              const tick = spring({ frame: frame - at - 8, fps, config: { damping: 10 } })
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '22px 30px', borderRadius: 24, background: PANEL, border: '2px solid rgba(207,230,255,0.12)', opacity: s, transform: `translateX(${(1 - s) * -80}px)` }}>
                  <span style={{ width: 64, height: 64, flex: 'none', borderRadius: '50%', background: EMERALD, display: 'grid', placeItems: 'center', transform: `scale(${tick})`, boxShadow: `0 0 26px ${EMERALD}88` }}>
                    <Icon name="Check" size={38} color="#FFFFFF" stroke={3.2} />
                  </span>
                  <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 54 : 60, color: '#FFFFFF' }}>{clean(c)}</span>
                </div>
              )
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

export function techScenes() {
  return {
    hook: makeHook(),
    send: makeSend(),
    address: makeAddress(),
    lookup: makeLookup(),
    hops: makeHops(),
    assemble: makeAssemble(),
    checklist: makeChecklist(),
  }
}
