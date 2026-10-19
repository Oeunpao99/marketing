/**
 * AI design — the engine behind "AI design" (style "canvas"): the AI designs
 * each scene as LAYERS (app/motion.py CANVAS_PROMPT, checked by _clean_canvas)
 * and this draws whatever it describes, so every video can look new. The AI
 * writes a design, never code: everything here is pre-built and tested, it
 * only decides what, where, what colour, and how it moves.
 *
 *   { type: "canvas", pal: { bg, a, b, ink, sub, mode }, bg: { kind, … }, layers: [Layer] }
 *
 * Positions are % of the frame (x, y = the layer's centre); sizes are pixels
 * of a 1080-wide frame, scaled to the real one (u). `at` = seconds after the
 * scene starts; `in` = how it arrives; `loop` = what it does after.
 *
 * Layer kinds: text · card · icon · shape · device · logo · image · chart ·
 * metric · pill · list · alert · stream
 * Backgrounds: solid · gradient · grid · dots · city · network · streams ·
 * particles · rings · spotlight · aurora · trails · hex · waves · warp
 *
 * Cinema: scene.pause = seconds of near-black held before the scene shows
 * (the breath before a grand reveal — the music dips, MotionPost.jsx); a
 * layer's hit = a big reveal: a riser builds up to it, an impact lands with a
 * flash and a short shake (sfx.jsx cues the sounds on the same frames).
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace"

/** A colour: a palette token (a, b, ink, sub, bg, white) or a hex. */
const col = (pal, c, fallback) => {
  if (!c) return fallback ?? pal.ink
  if (c in TOKEN) return pal[TOKEN[c]] || fallback || pal.ink
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback ?? pal.ink
}
const TOKEN = { a: 'a', b: 'b', ink: 'ink', sub: 'sub', bg: 'bg', white: 'white', black: 'black' }

// ── backgrounds ────────────────────────────────────────────────────────────
function Background({ bg = {}, pal }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const base = col(pal, bg.color, pal.bg)
  const a = col(pal, bg.accent, pal.a)
  const b = col(pal, bg.color2, pal.b)
  const dark = pal.mode !== 'light'
  const line = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)'
  const kind = bg.kind || 'solid'
  return (
    <AbsoluteFill style={{ background: kind === 'gradient' ? `linear-gradient(${bg.angle ?? 160}deg, ${base}, ${b})` : base, overflow: 'hidden' }}>
      {(kind === 'grid' || kind === 'dots') && (
        <AbsoluteFill
          style={{
            backgroundImage:
              kind === 'grid'
                ? `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`
                : `radial-gradient(${line} 3px, transparent 3px)`,
            backgroundSize: '64px 64px',
            backgroundPosition: `center ${-((frame * 0.4) % 64)}px`,
            maskImage: 'radial-gradient(ellipse 85% 70% at 50% 45%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 70% at 50% 45%, black 30%, transparent 100%)',
          }}
        />
      )}
      {kind === 'spotlight' && <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 45% at 50% ${40 + Math.sin(frame / 60) * 4}%, ${tint(a, 0.28)}, transparent 70%)` }} />}
      {kind === 'rings' &&
        [0.3, 0.5, 0.72].map((r, i) => (
          <div key={i} style={{ position: 'absolute', left: width / 2 - (Math.max(width, height) * r) / 2, top: height * 0.45 - (Math.max(width, height) * r) / 2, width: Math.max(width, height) * r, height: Math.max(width, height) * r, borderRadius: '50%', border: `2px solid ${tint(a, 0.18 - i * 0.04)}`, transform: `scale(${1 + Math.sin((frame + i * 30) / 50) * 0.02})` }} />
        ))}
      {kind === 'city' && <City width={width} height={height} a={a} dark={dark} frame={frame} />}
      {kind === 'network' && <Network width={width} height={height} a={a} b={b} frame={frame} />}
      {kind === 'streams' && <Streams width={width} height={height} a={a} b={b} frame={frame} />}
      {kind === 'aurora' && <Aurora a={a} b={b} frame={frame} dark={dark} />}
      {kind === 'trails' && <Trails width={width} height={height} a={a} b={b} frame={frame} />}
      {kind === 'hex' && <Hex width={width} height={height} a={a} frame={frame} dark={dark} />}
      {kind === 'waves' && <Waves width={width} height={height} a={a} b={b} frame={frame} />}
      {kind === 'warp' && <Warp width={width} height={height} a={a} b={b} frame={frame} />}
      {kind === 'particles' &&
        Array.from({ length: 40 }, (_, i) => {
          const x = random(`px${i}`) * width
          const y = (random(`py${i}`) * height - frame * (0.4 + random(`ps${i}`))) % height
          return <div key={i} style={{ position: 'absolute', left: x, top: y < 0 ? y + height : y, width: 4 + random(`pr${i}`) * 6, height: 4 + random(`pr${i}`) * 6, borderRadius: '50%', background: i % 3 ? a : b, opacity: 0.25 + random(`po${i}`) * 0.5 }} />
        })}
      {/* a soft vignette, so text in the middle always reads */}
      <AbsoluteFill style={{ background: dark ? 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 50%, rgba(0,0,0,0.45))' : 'none' }} />
    </AbsoluteFill>
  )
}

/** A line-drawn city skyline with lit windows and a data line over it. */
function City({ width, height, a, dark, frame }) {
  const ground = height * 0.78
  const blocks = Array.from({ length: 16 }, (_, i) => {
    const w = width * (0.05 + random(`cw${i}`) * 0.05)
    return { x: (i / 16) * width * 1.05 - width * 0.02, w, h: height * (0.18 + random(`ch${i}`) * 0.32) }
  })
  const stroke = dark ? tint(a, 0.55) : 'rgba(15,23,42,0.35)'
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {blocks.map((bl, i) => (
        <g key={i}>
          <rect x={bl.x} y={ground - bl.h} width={bl.w} height={bl.h} fill={dark ? 'rgba(8,14,30,0.85)' : 'rgba(255,255,255,0.6)'} stroke={stroke} strokeWidth="2" />
          {Array.from({ length: Math.floor(bl.h / 46) }, (_, k) => (
            <rect key={k} x={bl.x + bl.w * 0.25} y={ground - bl.h + 18 + k * 46} width={bl.w * 0.5} height="10" fill={a} opacity={random(`win${i}-${k}-${Math.floor(frame / 20)}`) > 0.55 ? 0.7 : 0.12} />
          ))}
        </g>
      ))}
      <line x1="0" y1={ground} x2={width} y2={ground} stroke={stroke} strokeWidth="2" />
      {/* data flying between the roofs */}
      {blocks.slice(0, 15).map((bl, i) => {
        const nx = blocks[i + 1]
        const t = ((frame + i * 11) % 60) / 60
        const x = bl.x + bl.w / 2 + (nx.x + nx.w / 2 - bl.x - bl.w / 2) * t
        const y = ground - bl.h + (nx.h - bl.h) * -t - Math.sin(t * Math.PI) * 60
        return i % 2 ? null : <circle key={`d${i}`} cx={x} cy={y} r="5" fill={a} opacity="0.9" />
      })}
    </svg>
  )
}

/** Nodes joined by lines, pulses travelling along them. */
function Network({ width, height, a, b, frame }) {
  const nodes = Array.from({ length: 14 }, (_, i) => ({ x: (0.08 + random(`nx${i}`) * 0.84) * width, y: (0.1 + random(`ny${i}`) * 0.8) * height }))
  const links = nodes.flatMap((n, i) => [nodes[(i + 3) % nodes.length], nodes[(i + 5) % nodes.length]].map((m) => [n, m]))
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {links.map(([p, q], i) => {
        const t = ((frame + i * 7) % 90) / 90
        return (
          <g key={i}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={tint(a, 0.16)} strokeWidth="2" />
            {i % 3 === 0 && <circle cx={p.x + (q.x - p.x) * t} cy={p.y + (q.y - p.y) * t} r="4" fill={i % 2 ? a : b} />}
          </g>
        )
      })}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={6 + (i % 3) * 3} fill={tint(a, 0.5)} />
      ))}
    </svg>
  )
}

/** Light streaks of data flowing across the frame. */
function Streams({ width, height, a, b, frame }) {
  return (
    <AbsoluteFill>
      {Array.from({ length: 22 }, (_, i) => {
        const y = random(`sy${i}`) * height
        const len = width * (0.12 + random(`sl${i}`) * 0.25)
        const speed = 6 + random(`ss${i}`) * 10
        const x = ((frame * speed + random(`sx${i}`) * width * 2) % (width + len * 2)) - len
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: len, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${i % 2 ? a : b})`, opacity: 0.5 }} />
      })}
    </AbsoluteFill>
  )
}

/** Soft bands of colour drifting like northern lights. */
function Aurora({ a, b, frame, dark }) {
  const k = frame / 90
  const blob = (c, x, y, w, h, o) => `radial-gradient(ellipse ${w}% ${h}% at ${x}% ${y}%, ${tint(c, o)}, transparent 70%)`
  return (
    <AbsoluteFill
      style={{
        background: [
          blob(a, 30 + Math.sin(k) * 14, 30 + Math.cos(k * 0.8) * 8, 60, 38, dark ? 0.42 : 0.3),
          blob(b, 70 + Math.cos(k * 0.9) * 12, 42 + Math.sin(k * 1.1) * 10, 55, 34, dark ? 0.36 : 0.26),
          blob(a, 50 + Math.sin(k * 0.6) * 20, 75 + Math.cos(k) * 6, 70, 28, dark ? 0.22 : 0.16),
        ].join(', '),
      }}
    />
  )
}

/** Light trails racing out of the centre — speed, a city at night, the future. */
function Trails({ width, height, a, b, frame }) {
  const cx = width / 2
  const cy = height * 0.46
  const R = Math.hypot(width, height) * 0.62
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 34 }, (_, i) => {
        const ang = random(`ta${i}`) * Math.PI * 2
        const p = ((frame / 45 + random(`tp${i}`)) % 1) ** 2.2
        const q = Math.min(1, p + 0.08 + random(`tl${i}`) * 0.1)
        const c = i % 3 ? a : b
        return (
          <line
            key={i}
            x1={cx + Math.cos(ang) * R * p}
            y1={cy + Math.sin(ang) * R * p * 0.7}
            x2={cx + Math.cos(ang) * R * q}
            y2={cy + Math.sin(ang) * R * q * 0.7}
            stroke={c}
            strokeWidth={1 + p * 5}
            strokeLinecap="round"
            opacity={0.15 + p * 0.7}
          />
        )
      })}
      <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.1} fill={tint(a, 0.18)} />
    </svg>
  )
}

/** A honeycomb grid, a few cells lighting up — security, structure, tech. */
function Hex({ width, height, a, frame, dark }) {
  const r = 46
  const w = Math.sqrt(3) * r
  const cols = Math.ceil(width / w) + 1
  const rows = Math.ceil(height / (r * 1.5)) + 1
  const pts = (x, y) => Array.from({ length: 6 }, (_, k) => `${x + r * Math.cos(((60 * k - 30) * Math.PI) / 180)},${y + r * Math.sin(((60 * k - 30) * Math.PI) / 180)}`).join(' ')
  const cells = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const lit = random(`hx${i}-${j}-${Math.floor((frame + i * 7 + j * 13) / 40)}`) > 0.93
      cells.push(<polygon key={`${i}-${j}`} points={pts(i * w + (j % 2) * (w / 2), j * r * 1.5)} fill={lit ? tint(a, 0.22) : 'none'} stroke={dark ? tint(a, 0.16) : 'rgba(15,23,42,0.08)'} strokeWidth="1.5" />)
    }
  const mask = 'radial-gradient(ellipse 80% 70% at 50% 45%, black 25%, transparent 100%)'
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, maskImage: mask, WebkitMaskImage: mask }}>
      {cells}
    </svg>
  )
}

/** Flowing lines of light, like sound or data in waves. */
function Waves({ width, height, a, b, frame }) {
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const y0 = height * (0.55 + i * 0.045)
        const amp = height * (0.035 + i * 0.008)
        const d = Array.from({ length: 41 }, (_, k) => {
          const x = (k / 40) * width
          const y = y0 + Math.sin(k / 6 + frame / (30 + i * 4) + i) * amp
          return `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
        return <path key={i} d={d} fill="none" stroke={i % 2 ? b : a} strokeWidth="2.5" opacity={0.18 + (i % 3) * 0.12} />
      })}
    </svg>
  )
}

/** Stars streaking past — the jump into something new. */
function Warp({ width, height, a, b, frame }) {
  const cx = width / 2
  const cy = height / 2
  const R = Math.hypot(width, height) / 2
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 70 }, (_, i) => {
        const ang = random(`wa${i}`) * Math.PI * 2
        const p = (frame / 70 + random(`wp${i}`)) % 1
        const d1 = R * p ** 2.5
        const d2 = R * Math.min(1, (p + 0.04) ** 2.5)
        return <line key={i} x1={cx + Math.cos(ang) * d1} y1={cy + Math.sin(ang) * d1} x2={cx + Math.cos(ang) * d2} y2={cy + Math.sin(ang) * d2} stroke={i % 4 ? '#FFFFFF' : i % 2 ? a : b} strokeWidth={1 + p * 3} opacity={p} strokeLinecap="round" />
      })}
    </svg>
  )
}

// ── layers ─────────────────────────────────────────────────────────────────
/** How far in (0..1) a layer is, and its style while arriving. */
function arrive(L, frame, fps, delay = 0) {
  const at = Math.round((L.at || 0) * fps) + delay
  const f = frame - at
  const s = spring({ frame: f, fps, config: { damping: L.in === 'pop' ? 9 : 15 } })
  const t = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease })
  const style = {
    fade: { opacity: t },
    rise: { opacity: t, transform: `translateY(${(1 - s) * 70}px)` },
    drop: { opacity: t, transform: `translateY(${(1 - s) * -70}px)` },
    scale: { opacity: t, transform: `scale(${0.6 + 0.4 * s})` },
    pop: { opacity: Math.min(1, s * 2), transform: `scale(${s})` },
    'slide-left': { opacity: t, transform: `translateX(${(1 - s) * 160}px)` },
    'slide-right': { opacity: t, transform: `translateX(${(1 - s) * -160}px)` },
    blur: { opacity: t, filter: `blur(${(1 - t) * 18}px)` },
    zoom: { opacity: t, transform: `scale(${1.4 - 0.4 * s})`, filter: `blur(${(1 - t) * 8}px)` },
  }[L.in || 'fade'] || { opacity: t }
  return { f, t, s, style }
}

function loopStyle(L, frame) {
  const k = (frame + (L.x || 0) * 3) / 1
  return {
    float: { transform: `translateY(${Math.sin(k / 20) * 8}px)` },
    pulse: { transform: `scale(${1 + Math.sin(k / 10) * 0.035})` },
    spin: { transform: `rotate(${frame * 1.2}deg)` },
    glow: { filter: `drop-shadow(0 0 ${14 + Math.sin(k / 9) * 8}px currentColor)` },
  }[L.loop] || {}
}

function Layer({ L, pal, brand, u, delay }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const { f, t, style } = arrive(L, frame, fps, delay)
  if (f < 0) return null
  const loop = loopStyle(L, frame)
  const color = col(pal, L.color)
  const w = L.w ? L.w * u : undefined
  const h = L.h ? L.h * u : undefined
  const box = { position: 'absolute', left: `${L.x ?? 50}%`, top: `${L.y ?? 50}%`, transform: `translate(-50%, -50%) rotate(${L.rotate || 0}deg)`, zIndex: L.z || 1 }
  const fill = (c, d) => col(pal, c, d)
  const glass = pal.mode === 'light' ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.07)'
  const border = pal.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.14)'
  const cardBg = L.fill ? fill(L.fill) : L.glass === false ? (pal.mode === 'light' ? '#FFFFFF' : '#0E1526') : glass

  let body = null
  switch (L.kind) {
    case 'text': {
      const size = (L.size || 64) * u
      body = (
        <div style={{ width: L.maxw ? (L.maxw / 100) * width : undefined, maxWidth: width * 0.92, textAlign: L.align || 'center' }}>
          {L.in === 'type' ? (
            <span style={{ fontFamily: L.mono ? MONO : FONT, fontWeight: L.weight || 700, fontSize: size, color, lineHeight: 1.2, letterSpacing: L.weight && L.weight <= 400 ? '-0.03em' : '-0.015em' }}>
              {clean(L.text).slice(0, Math.max(0, Math.floor(f / 1.5)))}
            </span>
          ) : (
            <Words text={L.text} delay={0} align={L.align === 'left' ? 'left' : 'center'} color={color} style={{ fontSize: size, fontWeight: L.weight || 700, justifyContent: L.align === 'left' ? 'flex-start' : 'center', letterSpacing: L.weight && L.weight <= 400 ? '-0.03em' : undefined, ...(L.highlight ? { '--hl-bg': fill(L.highlight), '--hl-text': fill(L.highlightText, pal.bg) } : null) }} />
          )}
        </div>
      )
      break
    }
    case 'card': {
      const lines = (L.lines || []).slice(0, 5)
      body = (
        <div style={{ width: w || 520 * u, minHeight: h, padding: 30 * u, borderRadius: (L.radius ?? 28) * u, background: cardBg, border: `2px solid ${L.border ? fill(L.border) : border}`, boxShadow: L.shadow === false ? 'none' : '0 30px 70px rgba(0,0,0,0.25)', backdropFilter: L.glass === false ? undefined : 'blur(14px)', display: 'flex', flexDirection: 'column', gap: 14 * u }}>
          {(L.icon || L.title) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u }}>
              {L.icon && (
                <span style={{ width: 64 * u, height: 64 * u, flex: 'none', borderRadius: 18 * u, background: fill(L.iconBg, pal.a), display: 'grid', placeItems: 'center' }}>
                  <Icon name={L.icon} size={34 * u} color={pal.mode === 'light' ? '#FFFFFF' : pal.bg} stroke={2.4} />
                </span>
              )}
              {L.title && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: (L.size || 40) * u, color: fill(L.color), lineHeight: 1.2 }}>{clean(L.title)}</span>}
            </div>
          )}
          {lines.map((ln, i) => {
            const k = interpolate(f, [10 + i * 6, 20 + i * 6], [0, 1], clamp)
            return (
              <div key={i} style={{ fontFamily: FONT, fontWeight: 500, fontSize: (L.size || 40) * 0.72 * u, color: pal.sub, opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>
                {clean(ln)}
              </div>
            )
          })}
        </div>
      )
      break
    }
    case 'icon':
      body = L.tile ? (
        <div style={{ width: (L.size || 120) * u, height: (L.size || 120) * u, borderRadius: (L.size || 120) * 0.26 * u, background: fill(L.tile), display: 'grid', placeItems: 'center', boxShadow: `0 20px 50px ${tint(fill(L.tile), 0.35)}` }}>
          <Icon name={L.name} size={(L.size || 120) * 0.5 * u} color={col(pal, L.color, '#FFFFFF')} stroke={2.2} />
        </div>
      ) : (
        <span style={{ color }}>
          <Icon name={L.name} size={(L.size || 120) * u} color={color} stroke={L.stroke || 1.8} />
        </span>
      )
      break
    case 'shape': {
      const sw = (L.stroke || 0) * u
      const c = fill(L.color, pal.a)
      if (L.shape === 'line') {
        const len = (L.w || 400) * u
        body = <div style={{ width: len * t, height: Math.max(2, sw || 4 * u), background: c, borderRadius: 4 }} />
      } else {
        body = (
          <div
            style={{
              width: w || 200 * u,
              height: h || w || 200 * u,
              borderRadius: L.shape === 'circle' || L.shape === 'ring' ? '50%' : (L.radius ?? 20) * u,
              background: L.shape === 'ring' || sw ? 'transparent' : L.gradient ? `linear-gradient(135deg, ${c}, ${fill(L.gradient)})` : c,
              border: L.shape === 'ring' || sw ? `${Math.max(2, sw || 4 * u)}px solid ${c}` : undefined,
              opacity: L.opacity ?? 1,
              filter: L.blur ? `blur(${L.blur * u}px)` : undefined,
            }}
          />
        )
      }
      break
    }
    case 'device': {
      const dw = (L.w || (L.device === 'phone' ? 360 : 760)) * u
      const ratio = { phone: 2.05, tablet: 1.35, laptop: 0.64, monitor: 0.6, screen: 0.5625 }[L.device] || 0.64
      const dh = L.device === 'phone' || L.device === 'tablet' ? dw * ratio : dw * ratio
      const src = imageOf(L.src, brand)
      const lines = (L.lines || []).slice(0, 6)
      body = (
        <div style={{ width: dw }}>
          <div style={{ width: dw, height: dh, borderRadius: (L.device === 'phone' ? 46 : 18) * u, border: `${(L.device === 'screen' ? 10 : 14) * u}px solid ${pal.mode === 'light' ? '#1B2033' : '#0A0F1C'}`, background: pal.mode === 'light' ? '#FFFFFF' : '#0B1222', overflow: 'hidden', boxShadow: `0 40px 90px rgba(0,0,0,0.35), 0 0 0 2px ${border}`, position: 'relative' }}>
            {src ? (
              <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
            ) : (
              <div style={{ padding: 24 * u, display: 'flex', flexDirection: 'column', gap: 14 * u }}>
                <div style={{ height: 22 * u, width: '40%', borderRadius: 8, background: pal.a, opacity: 0.85 }} />
                {lines.map((ln, i) => {
                  const k = interpolate(f, [8 + i * 6, 18 + i * 6], [0, 1], clamp)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${12 * u}px ${16 * u}px`, borderRadius: 12 * u, background: tint(pal.a, 0.1), opacity: k, fontFamily: FONT, fontWeight: 600, fontSize: 26 * u, color: pal.ink }}>
                      <span style={{ width: 12 * u, height: 12 * u, borderRadius: '50%', background: i % 3 === 2 ? pal.b : pal.a }} />
                      {clean(ln)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {L.device === 'laptop' && <div style={{ width: dw * 1.16, marginLeft: -dw * 0.08, height: 22 * u, borderRadius: `0 0 ${16 * u}px ${16 * u}px`, background: pal.mode === 'light' ? '#C9CEDA' : '#1C2436' }} />}
        </div>
      )
      break
    }
    case 'logo':
    case 'image': {
      const src = L.kind === 'logo' ? brand?.logo : imageOf(L.src, brand)
      if (!src) {
        // no logo uploaded: the brand's name, set as a wordmark
        body = L.kind === 'logo' ? <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: (L.size || 90) * u, color: col(pal, L.color, pal.ink), letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'center' }}>{clean(brand?.name || '')}</div> : null
      } else if (L.kind === 'image' && L.sketch) {
        // an ink sketch (app/doodle.py, as Doodle notes draws them): a soft edge
        // sweeps across it top-left to bottom-right, then a little pen wobble
        const p = interpolate(f, [0, 1.3 * fps], [0, 1], clamp)
        const at = -30 + p * 160
        const mask = `linear-gradient(135deg, black ${at - 25}%, transparent ${at}%)`
        const k = Math.floor(frame / 5)
        const boil = `translate(${(random(`bx${k}`) - 0.5) * 3 * u}px, ${(random(`by${k}`) - 0.5) * 3 * u}px) rotate(${(random(`br${k}`) - 0.5) * 0.7}deg)`
        body = <Img src={srcOf(src)} style={{ width: w || 360 * u, height: h, objectFit: 'contain', maskImage: mask, WebkitMaskImage: mask, transform: boil }} />
      } else {
        body = <Img src={srcOf(src)} style={{ width: w || 360 * u, height: h, objectFit: 'contain', borderRadius: L.kind === 'image' ? (L.radius ?? 24) * u : 0 }} />
      }
      break
    }
    case 'chart': {
      const vals = (L.values || []).slice(0, 8).map(Number).filter((n) => !Number.isNaN(n))
      const cw = w || 620 * u
      const ch = h || 320 * u
      const max = Math.max(1, ...vals)
      const c = fill(L.color, pal.a)
      const grow = interpolate(f, [6, 30], [0, 1], { ...clamp, easing: ease })
      body =
        L.chart === 'donut' ? (
          <svg width={ch} height={ch} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke={tint(c, 0.15)} strokeWidth="12" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={c} strokeWidth="12" strokeLinecap="round" strokeDasharray={251} strokeDashoffset={251 * (1 - (Math.min(100, vals[0] || 70) / 100) * grow)} transform="rotate(-90 50 50)" />
            <text x="50" y="57" textAnchor="middle" fontFamily={FONT} fontWeight="800" fontSize="20" fill={pal.ink}>{Math.round((vals[0] || 70) * grow)}%</text>
          </svg>
        ) : L.chart === 'bars' ? (
          <div style={{ width: cw, height: ch, display: 'flex', alignItems: 'flex-end', gap: 14 * u }}>
            {vals.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / max) * 100 * interpolate(f, [6 + i * 3, 26 + i * 3], [0, 1], { ...clamp, easing: ease })}%`, borderRadius: `${10 * u}px ${10 * u}px 0 0`, background: i === vals.length - 1 ? c : tint(c, 0.45) }} />
            ))}
          </div>
        ) : (
          <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ overflow: 'visible' }}>
            <polyline
              points={vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * cw},${ch - (v / max) * ch * 0.9}`).join(' ')}
              fill="none"
              stroke={c}
              strokeWidth={6 * u}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={cw * 3}
              strokeDashoffset={cw * 3 * (1 - grow)}
            />
          </svg>
        )
      break
    }
    case 'metric': {
      const n = Number(L.value) || 0
      const k = interpolate(f, [4, 34], [0, 1], { ...clamp, easing: ease })
      const v = Number.isInteger(n) ? Math.round(n * k).toLocaleString('en-US') : (n * k).toFixed(1)
      body = (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: (L.size || 150) * u, color: col(pal, L.color, pal.a), letterSpacing: '-0.04em', lineHeight: 1 }}>
            {clean(L.prefix)}
            {v}
            {clean(L.suffix)}
          </div>
          {L.label && <div style={{ marginTop: 14 * u, fontFamily: FONT, fontWeight: 600, fontSize: (L.size || 150) * 0.28 * u, color: pal.sub }}>{clean(L.label)}</div>}
        </div>
      )
      break
    }
    case 'pill':
      body = (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 * u, padding: `${14 * u}px ${30 * u}px`, borderRadius: 999, background: L.fill ? fill(L.fill) : tint(pal.a, 0.14), border: `2px solid ${tint(col(pal, L.color, pal.a), 0.5)}`, fontFamily: FONT, fontWeight: 700, fontSize: Math.max(30, L.size || 34) * u, color: col(pal, L.color, pal.a), whiteSpace: 'nowrap', letterSpacing: L.caps ? '0.12em' : undefined, textTransform: L.caps ? 'uppercase' : undefined }}>
          {L.icon && <Icon name={L.icon} size={(L.size || 34) * 1.05 * u} color={col(pal, L.color, pal.a)} stroke={2.4} />}
          {clean(L.text)}
        </div>
      )
      break
    case 'list': {
      const items = (L.items || []).slice(0, 6)
      body = (
        <div style={{ width: w || 760 * u, display: 'flex', flexDirection: 'column', gap: 18 * u }}>
          {items.map((it, i) => {
            const k = spring({ frame: f - 6 - i * 7, fps, config: { damping: 14 } })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 * u, padding: `${18 * u}px ${24 * u}px`, borderRadius: 22 * u, background: glass, border: `2px solid ${border}`, opacity: k, transform: `translateX(${(1 - k) * -60}px)` }}>
                <span style={{ width: 58 * u, height: 58 * u, flex: 'none', borderRadius: 16 * u, background: col(pal, L.color, pal.a), display: 'grid', placeItems: 'center' }}>
                  <Icon name={it.icon || 'Check'} size={30 * u} color={pal.mode === 'light' ? '#FFFFFF' : pal.bg} stroke={2.4} />
                </span>
                <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: (L.size || 44) * u, color: pal.ink }}>{clean(it.text)}</span>
              </div>
            )
          })}
        </div>
      )
      break
    }
    case 'alert': {
      const lv = { info: pal.a, warn: '#F59E0B', danger: '#EF4444', ok: '#10B981' }[L.level] || pal.a
      body = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u, padding: `${18 * u}px ${26 * u}px`, borderRadius: 20 * u, background: pal.mode === 'light' ? '#FFFFFF' : '#0E1526', borderLeft: `${8 * u}px solid ${lv}`, boxShadow: `0 20px 50px rgba(0,0,0,0.3), 0 0 ${24 * u}px ${tint(lv, 0.25)}`, fontFamily: FONT, fontWeight: 700, fontSize: (L.size || 34) * u, color: pal.ink, whiteSpace: 'nowrap' }}>
          <Icon name={L.icon || (L.level === 'danger' ? 'ShieldAlert' : L.level === 'ok' ? 'ShieldCheck' : 'Bell')} size={(L.size || 34) * 1.1 * u} color={lv} stroke={2.4} />
          {clean(L.text)}
        </div>
      )
      break
    }
    case 'stream': {
      // packets flowing from one point to another (both in % of the frame)
      const [x1, y1] = L.from || [10, 50]
      const [x2, y2] = L.to || [50, 50]
      const c = col(pal, L.color, pal.a)
      const n = Math.min(10, L.count || 6)
      return (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, zIndex: L.z || 0 }}>
          <line x1={(x1 / 100) * width} y1={(y1 / 100) * height} x2={(x1 / 100) * width + ((x2 - x1) / 100) * width * t} y2={(y1 / 100) * height + ((y2 - y1) / 100) * height * t} stroke={tint(c, 0.35)} strokeWidth={3 * u} strokeDasharray={`${14 * u} ${12 * u}`} strokeDashoffset={-frame * 2} />
          {Array.from({ length: n }, (_, i) => {
            const p = ((f + i * (40 / n)) % 40) / 40
            return <rect key={i} x={((x1 + (x2 - x1) * p) / 100) * width - 9 * u} y={((y1 + (y2 - y1) * p) / 100) * height - 9 * u} width={18 * u} height={18 * u} rx={4 * u} fill={c} opacity={t * (p < 0.9 ? 1 : (1 - p) * 10)} style={{ filter: `drop-shadow(0 0 ${10 * u}px ${c})` }} />
          })}
        </svg>
      )
    }
    default:
      return null
  }
  if (!body) return null
  return (
    <div style={box}>
      <div style={style}>
        <div style={loop}>{body}</div>
      </div>
    </div>
  )
}

/** "logo", or a picture the server already put in (app/motion.py resolves
 * "shot:N" / "product:Name" from the brand kit) — else none. */
function imageOf(src, brand) {
  if (!src) return null
  if (src === 'logo') return brand?.logo || null
  // run-…/N.jpg: the render wrote the picture to a file (app/motion.py _to_files)
  return /^(data:|\/media\/|https?:|run-[\w-]+\/)/.test(src) ? src : null
}

/** The frames (in the scene) the big reveals land on — sfx.jsx puts the impacts there. */
export const hitFrames = (scene, fps = 30) => {
  const delay = Math.round((Number(scene.pause) || 0) * fps)
  return (scene.layers || []).filter((L) => L.hit).map((L) => Math.round((L.at || 0) * fps) + delay)
}

/** One AI-designed scene: its background and its layers, in its act's palette. */
export function CanvasScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const u = Math.min(width, height) / 1080
  const pal = { bg: '#070B16', a: '#3B82F6', b: '#22D3EE', ink: '#FFFFFF', sub: 'rgba(226,232,255,0.72)', mode: 'dark', white: '#FFFFFF', black: '#000000', ...(scene.pal || {}) }
  // the breath before a reveal: near-black, then the scene fades up
  const delay = Math.round((Number(scene.pause) || 0) * fps)
  const dark = delay ? interpolate(frame, [delay - 2, delay + 12], [0.94, 0], clamp) : 0
  // a big reveal lands: a flash and a short, settling shake
  let flash = 0
  let shake = 0
  for (const h of hitFrames(scene, fps)) {
    const d = frame - h
    if (d >= 0 && d < 24) {
      flash = Math.max(flash, interpolate(d, [0, 2, 10], [0, 0.32, 0], clamp))
      shake = Math.max(shake, Math.exp(-d / 5) * 9 * u)
    }
  }
  const jolt = shake ? `translate(${Math.sin(frame * 2.7) * shake}px, ${Math.cos(frame * 3.1) * shake}px)` : undefined
  return (
    <AbsoluteFill style={{ backgroundColor: pal.bg }}>
      <AbsoluteFill style={{ transform: jolt }}>
        <Background bg={scene.bg} pal={pal} />
        {(scene.layers || []).map((L, i) => (
          <Layer key={i} L={L} pal={pal} brand={brand} u={u} delay={delay} />
        ))}
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: pal.mode === 'light' ? '#FFFFFF' : tint(pal.a, 0.9), opacity: flash, mixBlendMode: 'screen' }} />}
      {dark > 0 && <AbsoluteFill style={{ background: '#000', opacity: dark }} />}
    </AbsoluteFill>
  )
}

export const CANVAS = {
  scenes: { canvas: CanvasScene },
  root: { backgroundColor: '#05070F' },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
