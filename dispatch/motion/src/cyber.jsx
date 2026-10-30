/**
 * Cybersecurity · SOC — asked for by the user (2026-10-30) for security brands (an MSSP, a
 * SOC, an IT-security reseller): a dark navy command room, a dotted globe turning, the
 * network drawn as glowing lines with packets running along them, a hooded attacker whose
 * red pulses break on the brand's shield, a live threat-monitoring console, the SOC wall
 * with its counters and threat level, a padlock closing. Original design, in the brand's colour.
 *
 * No scene types of its own — the ones the story AI already writes (app/motion.py CYBER_PROMPT):
 *   hook       the radar sweeps, a threat blinks red              {text, badge?}
 *   flow       the network: nodes, glowing links, packets         {title?, nodes: [{icon, label, sub?}]}
 *   step       the attack: pulses from the attacker break on the shield, "Blocked"   {title, text?, result?}
 *   notify     the live threat-monitoring console                 {title?, time?, notes: [{app, text}]}
 *   dashboard  the SOC wall: counters and the threat level       {title?, metrics: [{label, value, prefix, suffix, delta}]}
 *   list       the protections, each locking in                   {title?, items: [{icon, text}]}
 *   stat       one true number in the radar                       {value, prefix?, suffix?, label}
 *   reveal     the padlock closes, the network turns calm         {text, icon?}
 *   cta        the logo, the line, the button                     {text, button}
 * 9:16 and 16:9; nothing in the subtitle band (captionTop).
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, KHMER_RE, Words, clean, fitSize, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
const BG = '#040A16'
const CYAN = '#22D3EE'
const RED = '#FF3B5C'
const GREEN = '#34D399'
const AMBER = '#FBBF24'
const SUB = '#8FA3BF'
const MONO = "'JetBrains Mono', 'Consolas', 'Courier New', monospace"

/** The brand's colour for the shield — a dark one is lifted so it glows on navy. */
const accent = (brand) => {
  const c = /^#[0-9a-f]{6}$/i.test(brand?.color || '') ? brand.color : CYAN
  const n = parseInt(c.slice(1), 16)
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l < 0.35 ? CYAN : c
}
const glow = (c, r = 18) => `drop-shadow(0 0 ${r * 0.4}px ${c}) drop-shadow(0 0 ${r}px ${tint(c, 0.55)})`

// ── the stage: navy, a glowing grid floor, scanlines, drifting dust, a camera that keeps moving ──
function Stage({ children, alarm = 0 }) {
  const frame = useCurrentFrame()
  const { width, height, durationInFrames } = useVideoConfig()
  const t = Math.min(1, frame / Math.max(1, durationInFrames))
  const land = interpolate(frame, [0, 16], [1.05, 1], { ...clamp, easing: ease })
  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${tint('#0E3A6B', 0.55)}, transparent 70%)` }} />
      {/* the grid floor, running towards the camera */}
      <div
        style={{
          position: 'absolute', left: -width * 0.6, right: -width * 0.6, bottom: -40, height: height * 0.42,
          transform: 'perspective(700px) rotateX(66deg)', transformOrigin: '50% 100%',
          backgroundImage: `linear-gradient(${tint(CYAN, 0.28)} 1.5px, transparent 1.5px), linear-gradient(90deg, ${tint(CYAN, 0.28)} 1.5px, transparent 1.5px)`,
          backgroundSize: '90px 90px', backgroundPosition: `0 ${(frame * 1.6) % 90}px`,
          maskImage: 'linear-gradient(to top, black 10%, transparent 85%)', WebkitMaskImage: 'linear-gradient(to top, black 10%, transparent 85%)',
        }}
      />
      {/* dust: tiny points of light drifting up */}
      {[...Array(36)].map((_, i) => {
        const x = random(`dx${i}`) * width
        const y = ((random(`dy${i}`) * height - frame * (0.4 + random(`dv${i}`))) % height + height) % height
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 3, height: 3, borderRadius: 2, background: i % 5 ? CYAN : RED, opacity: 0.25 + 0.35 * Math.abs(Math.sin((frame + i * 17) / 20)) }} />
      })}
      {/* a red wash while something is wrong */}
      {alarm > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 40%, ${tint(RED, 0.35 * alarm)})` }} />}
      <AbsoluteFill style={{ transform: `scale(${land * (1.02 + 0.04 * t)})` }}>{children}</AbsoluteFill>
      {/* scanlines and a slow bright line rolling down, like a monitor */}
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, height: 140, top: ((frame * 9) % (height + 280)) - 140, background: `linear-gradient(180deg, transparent, ${tint(CYAN, 0.06)}, transparent)` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 50%, transparent 55%, rgba(0,0,0,0.6))' }} />
    </AbsoluteFill>
  )
}

/** A headline: white words, the ⟦key words⟧ in glowing cyan (or red). */
function Headline({ text, size, align = 'center', delay = 6, hot = CYAN }) {
  return (
    <div style={{ '--hl-bg': 'transparent', '--hl-text': hot, filter: `drop-shadow(0 0 18px ${tint(hot, 0.35)})` }}>
      <Words
        text={text}
        delay={delay}
        align={align}
        color="#FFFFFF"
        style={{ fontFamily: FONT, fontWeight: KHMER_RE.test(text || '') ? 700 : 800, fontSize: size, lineHeight: KHMER_RE.test(text || '') ? 1.45 : 1.12, letterSpacing: KHMER_RE.test(text || '') ? 0 : '-0.02em', textAlign: align }}
      />
    </div>
  )
}

/** A small mono label in a glowing frame — "THREAT DETECTED", "LIVE", "BLOCKED". */
function Tag({ text, color = CYAN, blink = false, size = 26 }) {
  const frame = useCurrentFrame()
  const on = !blink || Math.sin(frame / 4) > -0.4
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: `${size * 0.4}px ${size * 0.8}px`, borderRadius: 8, border: `2px solid ${color}`, background: tint(color, 0.12), color, fontFamily: MONO, fontWeight: 700, fontSize: size, letterSpacing: '0.12em', boxShadow: `0 0 24px ${tint(color, 0.35)}, inset 0 0 18px ${tint(color, 0.15)}`, opacity: on ? 1 : 0.35, whiteSpace: 'nowrap' }}>
      <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: color, boxShadow: `0 0 12px ${color}` }} />
      {text}
    </span>
  )
}

// ── the dotted globe: points on a sphere, turning ──
const GLOBE = (() => {
  const pts = []
  const n = 520
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const th = i * 2.399963 // the golden angle — evenly spread
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r])
  }
  return pts
})()

function Globe({ cx, cy, r, spin = 0, color = CYAN, opacity = 1 }) {
  return (
    <svg style={{ position: 'absolute', left: cx - r - 10, top: cy - r - 10, overflow: 'visible', opacity }} width={2 * r + 20} height={2 * r + 20}>
      <circle cx={r + 10} cy={r + 10} r={r} fill="none" stroke={tint(color, 0.25)} strokeWidth={2} />
      {GLOBE.map(([x, y, z], i) => {
        const a = spin
        const X = x * Math.cos(a) + z * Math.sin(a)
        const Z = -x * Math.sin(a) + z * Math.cos(a)
        if (Z < -0.15) return null
        return <circle key={i} cx={r + 10 + X * r} cy={r + 10 + y * r} r={1.6 + Z * 1.6} fill={color} opacity={0.18 + 0.6 * Math.max(0, Z)} />
      })}
    </svg>
  )
}

/** A glowing line drawn from a to b by ``t`` (0→1), with packets running along it once drawn. */
function Link({ a, b, t, color = CYAN, packets = 2, speed = 1, frame, bend = 0.12, width = 3 }) {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend
  const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend
  const d = `M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.1
  const at = (u) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * mx + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * my + u * u * b[1]]
  return (
    <g>
      <path d={d} fill="none" stroke={tint(color, 0.25)} strokeWidth={width * 3.5} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - t)} style={{ filter: 'blur(6px)' }} />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - t)} />
      {t >= 1 &&
        [...Array(packets)].map((_, k) => {
          const u = ((frame * 0.012 * speed + k / packets) % 1 + 1) % 1
          const [x, y] = at(u)
          return <circle key={k} cx={x} cy={y} r={width * 2.2} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        })}
    </g>
  )
}

/** A network node: a glowing ring with its icon, a label under it. */
function Node({ x, y, size, icon, label, sub, color = CYAN, s = 1, frame }) {
  const pulse = 1 + 0.08 * Math.sin(frame / 9 + x)
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, transform: `scale(${s})`, opacity: Math.min(1, s * 1.4), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <div style={{ position: 'absolute', inset: -size * 0.18, borderRadius: '50%', border: `2px solid ${tint(color, 0.35)}`, transform: `scale(${pulse})` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${tint(color, 0.35)}, ${tint('#06142B', 0.95)} 70%)`, border: `3px solid ${color}`, boxShadow: `0 0 30px ${tint(color, 0.55)}, inset 0 0 22px ${tint(color, 0.3)}`, display: 'grid', placeItems: 'center' }}>
          <Icon name={icon || 'Server'} size={size * 0.46} color="#FFFFFF" stroke={2} />
        </div>
      </div>
      {label && <div style={{ marginTop: 14, fontFamily: FONT, fontWeight: 700, fontSize: size * 0.27, color: '#FFFFFF', textAlign: 'center', whiteSpace: 'nowrap', textShadow: `0 0 12px ${tint(color, 0.6)}` }}>{clean(label)}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: size * 0.19, color: SUB, whiteSpace: 'nowrap' }}>{clean(sub)}</div>}
    </div>
  )
}

/** The brand's shield, glowing; ``hit`` (0→1) sends a ripple across it. */
function Shield({ size, color, hit = 0, children }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'relative', width: size, height: size * 1.15, filter: glow(color, 22) }}>
      <svg viewBox="0 0 100 115" width={size} height={size * 1.15}>
        <defs>
          <linearGradient id="cyber-shield" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tint(color, 0.55)} />
            <stop offset="1" stopColor={tint(color, 0.12)} />
          </linearGradient>
        </defs>
        <path d="M50 3 L94 18 V55 C94 83 74 102 50 112 C26 102 6 83 6 55 V18 Z" fill="url(#cyber-shield)" stroke={color} strokeWidth={3.5} />
        <path d="M50 14 L84 26 V55 C84 77 69 92 50 100 C31 92 16 77 16 55 V26 Z" fill="none" stroke={tint(color, 0.5)} strokeWidth={1.5} strokeDasharray="4 5" strokeDashoffset={-frame * 0.6} />
      </svg>
      {hit > 0 && <div style={{ position: 'absolute', inset: -size * 0.1, borderRadius: '45%', border: `4px solid ${color}`, transform: `scale(${0.8 + 0.6 * hit})`, opacity: 1 - hit }} />}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: size * 0.08 }}>{children}</div>
    </div>
  )
}

/** The attacker: a hooded figure in red, a faint face under the hood, glitching now and then. */
function Attacker({ size, frame }) {
  const glitch = Math.sin(frame * 1.7) > 0.93 ? (random(`g${frame}`) - 0.5) * 18 : 0
  return (
    <div style={{ position: 'relative', width: size, height: size * 1.1, transform: `translateX(${glitch}px)`, filter: glow(RED, 20) }}>
      <svg viewBox="0 0 100 110" width={size} height={size * 1.1}>
        <path d="M50 4 C24 4 14 26 14 46 C14 58 18 66 22 72 L8 108 H92 L78 72 C82 66 86 58 86 46 C86 26 76 4 50 4 Z" fill="#0A0F1C" stroke={RED} strokeWidth={3} />
        <path d="M50 24 C36 24 30 38 30 50 C30 62 38 70 50 70 C62 70 70 62 70 50 C70 38 64 24 50 24 Z" fill="#05070D" />
        <rect x="37" y="46" width="10" height="4" rx="2" fill={RED} opacity={0.6 + 0.4 * Math.sin(frame / 5)} />
        <rect x="53" y="46" width="10" height="4" rx="2" fill={RED} opacity={0.6 + 0.4 * Math.sin(frame / 5)} />
      </svg>
      {glitch !== 0 && <div style={{ position: 'absolute', inset: 0, transform: 'translateX(8px)', opacity: 0.5, mixBlendMode: 'screen', filter: 'hue-rotate(160deg)' }} />}
    </div>
  )
}

// ── hook: the radar sweeps, a threat blinks red ──
function Hook({ scene }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const R = wide ? 300 : 330
  const cx = wide ? width * 0.72 : width / 2
  const cy = wide ? height * 0.5 : height * 0.33
  const sweep = (frame * 4.2) % 360
  const found = spring({ frame: frame - 24, fps, config: { damping: 9 } })
  const blip = [cx + R * 0.48, cy - R * 0.3]
  return (
    <Stage alarm={0.6 * found * (0.6 + 0.4 * Math.sin(frame / 5))}>
      <div style={{ position: 'absolute', left: cx - R, top: cy - R, width: 2 * R, height: 2 * R, borderRadius: '50%', background: `radial-gradient(circle, ${tint(CYAN, 0.08)}, transparent 70%)`, border: `2px solid ${tint(CYAN, 0.5)}`, boxShadow: `0 0 40px ${tint(CYAN, 0.25)}` }}>
        {[0.33, 0.66].map((k) => <div key={k} style={{ position: 'absolute', inset: R * (1 - k), borderRadius: '50%', border: `1.5px solid ${tint(CYAN, 0.3)}` }} />)}
        <div style={{ position: 'absolute', left: R, top: 0, bottom: 0, width: 1.5, background: tint(CYAN, 0.25) }} />
        <div style={{ position: 'absolute', top: R, left: 0, right: 0, height: 1.5, background: tint(CYAN, 0.25) }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from ${sweep}deg, ${tint(CYAN, 0.55)}, transparent 22%)` }} />
      </div>
      {[[0.2, 0.55], [-0.5, 0.2], [-0.25, -0.6], [0.62, 0.36]].map(([dx, dy], i) => (
        <div key={i} style={{ position: 'absolute', left: cx + dx * R - 7, top: cy + dy * R - 7, width: 14, height: 14, borderRadius: 7, background: CYAN, boxShadow: `0 0 14px ${CYAN}`, opacity: interpolate(frame, [6 + i * 4, 14 + i * 4], [0, 0.85], clamp) }} />
      ))}
      <div style={{ position: 'absolute', left: blip[0] - 18, top: blip[1] - 18, width: 36, height: 36, borderRadius: 18, background: RED, boxShadow: `0 0 30px ${RED}`, transform: `scale(${found})` }} />
      {[0, 1].map((k) => {
        const p = ((frame - 24 - k * 15) % 30) / 30
        return frame > 24 ? <div key={k} style={{ position: 'absolute', left: blip[0] - 60, top: blip[1] - 60, width: 120, height: 120, borderRadius: 60, border: `3px solid ${RED}`, transform: `scale(${0.3 + p * 1.4})`, opacity: 1 - p }} /> : null
      })}
      <div style={{ position: 'absolute', ...(wide ? { left: 130, width: width * 0.48, top: 0, bottom: 160 } : { left: 70, right: 70, top: cy + R + 50, height: 520 }), display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: wide ? 'flex-start' : 'center', gap: 34 }}>
        <div style={{ opacity: found }}>
          <Tag text={clean(scene.badge) || 'THREAT DETECTED'} color={RED} blink size={wide ? 26 : 30} />
        </div>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 90 : 92)} align={wide ? 'left' : 'center'} delay={30} hot={RED} />
      </div>
    </Stage>
  )
}

// ── flow: the network — nodes on a turning globe, glowing links, packets ──
const SPOTS_TALL = [[0.22, 0.32], [0.78, 0.29], [0.5, 0.5], [0.2, 0.68], [0.8, 0.66]]
const SPOTS_WIDE = [[0.14, 0.42], [0.36, 0.22], [0.62, 0.3], [0.86, 0.44], [0.5, 0.7]]

function Network({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const nodes = (scene.nodes || []).slice(0, 5)
  const spots = (wide ? SPOTS_WIDE : SPOTS_TALL).slice(0, Math.max(2, nodes.length))
  const pts = spots.map(([x, y]) => [x * width, y * height + (wide ? 40 : 0)])
  const size = wide ? 112 : 128
  const a = accent(brand)
  const links = pts.slice(1).map((p, i) => [pts[i], p])
  if (pts.length > 3) links.push([pts[0], pts[pts.length - 1]])
  return (
    <Stage>
      <Globe cx={width / 2} cy={height * (wide ? 0.52 : 0.5)} r={wide ? 420 : 470} spin={frame * 0.01} opacity={0.55} />
      <svg style={{ position: 'absolute', inset: 0 }} width={width} height={height}>
        {links.map(([p, q], i) => (
          <Link key={i} a={p} b={q} t={interpolate(frame, [14 + i * 8, 34 + i * 8], [0, 1], { ...clamp, easing: ease })} frame={frame} color={i % 2 ? a : CYAN} packets={2} speed={1 + (i % 3) * 0.3} bend={i % 2 ? -0.14 : 0.14} />
        ))}
      </svg>
      {nodes.map((n, i) => (
        <Node key={i} x={pts[i][0]} y={pts[i][1]} size={size} icon={n.icon} label={n.label} sub={n.sub} color={i === 0 ? a : CYAN} s={spring({ frame: frame - 6 - i * 6, fps, config: { damping: 12 } })} frame={frame} />
      ))}
      {scene.title && (
        <div style={{ position: 'absolute', left: 80, right: 80, top: wide ? 60 : 280 }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 70 : 76)} delay={4} />
        </div>
      )}
    </Stage>
  )
}

// ── step: the attack — red pulses from the attacker break on the shield ──
function Attack({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const atk = wide ? [width * 0.2, height * 0.5] : [width * 0.5, height * 0.25]
  const shd = wide ? [width * 0.72, height * 0.5] : [width * 0.5, height * 0.54]
  const inn = spring({ frame, fps, config: { damping: 14 } })
  const shots = [10, 26, 42, 58]
  const blocked = spring({ frame: frame - 66, fps, config: { damping: 10 } })
  // the pulse in flight: where, and the shield's ripple when one lands
  let hit = 0
  const pulses = shots.map((at, k) => {
    const u = (frame - at) / 14
    if (u >= 1 && u < 2) hit = Math.max(hit, 1 - (u - 1))
    return { u, k }
  })
  const SW = wide ? 300 : 330
  return (
    <Stage alarm={frame < 64 ? 0.45 * (0.5 + 0.5 * Math.sin(frame / 4)) : 0}>
      {/* the line of attack */}
      <svg style={{ position: 'absolute', inset: 0 }} width={width} height={height}>
        <line x1={atk[0]} y1={atk[1]} x2={shd[0]} y2={shd[1]} stroke={tint(RED, 0.35)} strokeWidth={3} strokeDasharray="10 12" strokeDashoffset={-frame * 3} />
        {pulses.map(({ u, k }) =>
          u > 0 && u < 1 ? (
            <circle key={k} cx={atk[0] + (shd[0] - atk[0]) * u * 0.82} cy={atk[1] + (shd[1] - atk[1]) * u * 0.82} r={16} fill={RED} style={{ filter: `drop-shadow(0 0 14px ${RED}) drop-shadow(0 0 30px ${RED})` }} />
          ) : null,
        )}
        {/* each pulse shatters into sparks on the shield */}
        {pulses.map(({ u, k }) =>
          u >= 1 && u < 1.8
            ? [...Array(8)].map((_, j) => {
                const ang = (j / 8) * Math.PI * 2 + k
                const d = (u - 1) * 140
                const ox = atk[0] + (shd[0] - atk[0]) * 0.82
                const oy = atk[1] + (shd[1] - atk[1]) * 0.82
                return <circle key={`${k}-${j}`} cx={ox + Math.cos(ang) * d} cy={oy + Math.sin(ang) * d} r={5} fill={AMBER} opacity={1 - (u - 1) / 0.8} />
              })
            : null,
        )}
      </svg>
      <div style={{ position: 'absolute', left: atk[0] - 110, top: atk[1] - 130, transform: `scale(${inn}) translateX(${(1 - inn) * -200}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Attacker size={220} frame={frame} />
        <Tag text="ATTACKER" color={RED} size={wide ? 22 : 24} />
      </div>
      <div style={{ position: 'absolute', left: shd[0] - SW / 2, top: shd[1] - SW * 0.58, transform: `scale(${0.6 + 0.4 * inn})` }}>
        <Shield size={SW} color={a} hit={hit}>
          {brand.logo ? <Img src={srcOf(brand.logo)} style={{ width: SW * 0.42, height: SW * 0.3, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} /> : <Icon name="ShieldCheck" size={SW * 0.32} color="#FFFFFF" stroke={2} />}
        </Shield>
      </div>
      <div style={{ position: 'absolute', left: shd[0] - 200, width: 400, top: shd[1] + SW * 0.66, display: 'flex', justifyContent: 'center', transform: `scale(${blocked})`, opacity: Math.min(1, blocked * 1.5) }}>
        <Tag text={(clean(scene.result) || 'BLOCKED').toUpperCase()} color={GREEN} size={wide ? 28 : 32} />
      </div>
      <div style={{ position: 'absolute', ...(wide ? { left: 90, right: 90, top: 60 } : { left: 70, right: 70, top: height * 0.795 - 150 }) }}>
        <Headline text={scene.title} size={fitSize(scene.title, wide ? 64 : 70)} delay={4} hot={RED} />
        {scene.text && <div style={{ marginTop: 14, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: wide ? 30 : 34, color: SUB, opacity: interpolate(frame, [18, 30], [0, 1], clamp) }}>{clean(scene.text)}</div>}
      </div>
    </Stage>
  )
}

// ── notify: the live threat-monitoring console ──
const LEVELS = [['HIGH', RED], ['MED', AMBER], ['LOW', GREEN], ['INFO', CYAN]]

function Monitor({ scene }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const notes = (scene.notes || []).slice(0, 5)
  const W = wide ? 1240 : 960
  const left = (width - W) / 2
  const top = wide ? 170 : 460
  const inn = spring({ frame, fps, config: { damping: 16 } })
  const [hh, mm] = (String(scene.time || '23:47').match(/(\d{1,2}):(\d{2})/) || [0, '23', '47']).slice(1)
  // the traffic: a calm line, a red spike, calm again
  const pts = [...Array(60)].map((_, i) => {
    const x = i / 59
    const spike = Math.exp(-((x - 0.55) ** 2) / 0.004) * 0.85
    return [x, 0.25 + 0.08 * Math.sin(i * 1.3 + frame * 0.2) + spike * interpolate(frame, [20, 40], [0, 1], clamp)]
  })
  const drawn = interpolate(frame, [8, 50], [0, 1], clamp)
  const GH = wide ? 150 : 170
  return (
    <Stage>
      {scene.title && (
        <div style={{ position: 'absolute', left: 80, right: 80, top: wide ? 46 : 280 }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 60 : 70)} delay={2} />
        </div>
      )}
      <div style={{ position: 'absolute', left, top: top + (1 - inn) * 120, width: W, opacity: inn, borderRadius: 22, border: `2px solid ${tint(CYAN, 0.45)}`, background: 'rgba(4,14,32,0.88)', boxShadow: `0 0 60px ${tint(CYAN, 0.2)}, 0 40px 90px rgba(0,0,0,0.5)`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 28px', borderBottom: `1.5px solid ${tint(CYAN, 0.25)}`, fontFamily: MONO, fontSize: wide ? 24 : 26, color: CYAN }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>THREAT MONITORING</span>
          <span style={{ marginLeft: 'auto' }}>
            <Tag text="LIVE" color={RED} blink size={wide ? 18 : 20} />
          </span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          {notes.map((n, i) => {
            const s = spring({ frame: frame - 10 - i * 9, fps, config: { damping: 15 } })
            const [lvl, col] = LEVELS[Math.min(i, LEVELS.length - 1)]
            const sec = String((Number(mm) * 60 + i * 7) % 60).padStart(2, '0')
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 10px', borderBottom: i < notes.length - 1 ? `1px solid ${tint(CYAN, 0.1)}` : 'none', transform: `translateX(${(1 - s) * -80}px)`, opacity: s, background: i === 0 && frame % 20 < 10 && frame < 70 ? tint(RED, 0.08) : 'transparent', borderRadius: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: wide ? 22 : 24, color: SUB, flex: 'none' }}>{`${hh}:${mm}:${sec}`}</span>
                <span style={{ flex: 'none', width: wide ? 82 : 92, textAlign: 'center', padding: '5px 0', borderRadius: 6, background: tint(col, 0.16), border: `1.5px solid ${col}`, color: col, fontFamily: MONO, fontWeight: 700, fontSize: wide ? 19 : 21 }}>{lvl}</span>
                <span style={{ flex: 'none', fontFamily: MONO, fontWeight: 700, fontSize: wide ? 22 : 24, color: '#FFFFFF' }}>{clean(n.app)}</span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontSize: wide ? 26 : 28, color: '#D7E3F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(n.text)}</span>
              </div>
            )
          })}
        </div>
        <div style={{ position: 'relative', height: GH, borderTop: `1.5px solid ${tint(CYAN, 0.2)}`, margin: '0 18px 18px' }}>
          <svg width={W - 36} height={GH} style={{ position: 'absolute', inset: 0 }}>
            <polyline
              points={pts.slice(0, Math.max(2, Math.round(pts.length * drawn))).map(([x, y]) => `${x * (W - 36)},${GH - y * GH}`).join(' ')}
              fill="none"
              stroke={frame > 30 && frame < 60 ? RED : CYAN}
              strokeWidth={3}
              style={{ filter: `drop-shadow(0 0 8px ${frame > 30 && frame < 60 ? RED : CYAN})` }}
            />
          </svg>
          <span style={{ position: 'absolute', right: 6, top: 10, fontFamily: MONO, fontSize: 18, color: SUB }}>NETWORK TRAFFIC</span>
        </div>
      </div>
    </Stage>
  )
}

// ── dashboard: the SOC wall — counters and the threat level ──
function Soc({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const metrics = (scene.metrics || []).slice(0, 3)
  const a = accent(brand)
  const level = interpolate(frame, [20, 70], [0.9, 0.22], { ...clamp, easing: ease }) // the threat falls: high → low
  const lvlColor = level > 0.6 ? RED : level > 0.4 ? AMBER : GREEN
  const lvlText = level > 0.6 ? 'HIGH' : level > 0.4 ? 'MEDIUM' : 'LOW'
  const R = wide ? 150 : 170
  const C = 2 * Math.PI * R
  const tileW = wide ? 340 : 440
  const title = clean(scene.title) || 'Security Operations Center'
  const count = (m, i) => {
    const raw = String(m.value || '0').replace(/,/g, '')
    const n = Number(raw)
    if (!Number.isFinite(n)) return clean(m.value)
    const v = n * interpolate(frame, [12 + i * 6, 52 + i * 6], [0, 1], { ...clamp, easing: ease })
    return (Number.isInteger(n) ? Math.round(v).toLocaleString('en-US') : v.toFixed(1))
  }
  return (
    <Stage>
      <div style={{ position: 'absolute', left: 80, right: 80, top: wide ? 50 : 280, display: 'flex', justifyContent: 'center' }}>
        <Tag text={title.toUpperCase()} color={CYAN} size={wide ? 24 : 26} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 90 : 70, paddingTop: wide ? 40 : 0, paddingBottom: wide ? 60 : 300 }}>
        {/* the threat level ring */}
        <div style={{ position: 'relative', width: 2 * R + 40, height: 2 * R + 40, flex: 'none' }}>
          <Globe cx={R + 20} cy={R + 20} r={R * 0.72} spin={frame * 0.02} opacity={0.5} color={lvlColor} />
          <svg width={2 * R + 40} height={2 * R + 40} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke={tint(CYAN, 0.15)} strokeWidth={18} />
            <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke={lvlColor} strokeWidth={18} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - level)} style={{ filter: `drop-shadow(0 0 12px ${lvlColor})` }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: wide ? 20 : 22, color: SUB, letterSpacing: '0.12em' }}>THREAT LEVEL</span>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 56 : 62, color: lvlColor, textShadow: `0 0 24px ${lvlColor}` }}>{lvlText}</span>
          </div>
        </div>
        {/* the counters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {metrics.map((m, i) => {
            const s = spring({ frame: frame - 8 - i * 6, fps, config: { damping: 14 } })
            return (
              <div key={i} style={{ width: tileW, padding: '20px 26px', borderRadius: 18, border: `2px solid ${tint(i === 0 ? a : CYAN, 0.5)}`, background: 'rgba(6,20,43,0.85)', boxShadow: `0 0 30px ${tint(CYAN, 0.12)}`, transform: `translateX(${(1 - s) * 120}px)`, opacity: s }}>
                <div style={{ fontFamily: MONO, fontSize: wide ? 19 : 21, color: SUB, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{clean(m.label)}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 56 : 62, color: '#FFFFFF', textShadow: `0 0 18px ${tint(CYAN, 0.5)}`, fontVariantNumeric: 'tabular-nums' }}>
                    {clean(m.prefix)}
                    {count(m, i)}
                    {clean(m.suffix)}
                  </span>
                  {m.delta && <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: wide ? 22 : 24, color: String(m.delta).startsWith('-') ? GREEN : CYAN }}>{clean(m.delta)}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Stage>
  )
}

// ── list: the protections, each locking in ──
function Protections({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const items = (scene.items || []).slice(0, 4)
  const a = accent(brand)
  const W = wide ? 1100 : 940
  return (
    <Stage>
      <div style={{ position: 'absolute', left: (width - W) / 2, width: W, top: 0, bottom: wide ? 120 : 470, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: wide ? 20 : 26 }}>
        {scene.title && (
          <div style={{ marginBottom: 16 }}>
            <Headline text={scene.title} size={fitSize(scene.title, wide ? 64 : 72)} align={wide ? 'left' : 'center'} delay={2} />
          </div>
        )}
        {items.map((it, i) => {
          const s = spring({ frame: frame - 12 - i * 12, fps, config: { damping: 15 } })
          const lock = spring({ frame: frame - 20 - i * 12, fps, config: { damping: 10 } })
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: wide ? '18px 24px' : '22px 26px', borderRadius: 18, border: `2px solid ${tint(CYAN, 0.25 + 0.35 * lock)}`, background: 'rgba(6,20,43,0.8)', boxShadow: `0 0 ${24 * lock}px ${tint(CYAN, 0.25)}`, transform: `translateX(${(1 - s) * (i % 2 ? 140 : -140)}px)`, opacity: s }}>
              <div style={{ flex: 'none', width: wide ? 64 : 74, height: wide ? 64 : 74, borderRadius: 16, display: 'grid', placeItems: 'center', background: tint(a, 0.18), border: `2px solid ${a}`, boxShadow: `0 0 18px ${tint(a, 0.5)}` }}>
                <Icon name={it.icon || 'ShieldCheck'} size={wide ? 34 : 40} color="#FFFFFF" stroke={2.2} />
              </div>
              <span style={{ flex: 1, fontFamily: FONT, fontWeight: 700, fontSize: wide ? 38 : 42, color: '#FFFFFF' }}>{clean(it.text)}</span>
              <div style={{ flex: 'none', transform: `scale(${lock})`, filter: glow(GREEN, 10) }}>
                <Icon name="LockKeyhole" size={wide ? 38 : 44} color={GREEN} stroke={2.4} />
              </div>
            </div>
          )
        })}
      </div>
    </Stage>
  )
}

// ── stat: one true number in the radar ──
function Stat({ scene }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const wide = width > height
  const raw = String(scene.value || '').replace(/,/g, '')
  const n = Number(raw)
  const v = Number.isFinite(n) ? n * interpolate(frame, [8, 48], [0, 1], { ...clamp, easing: ease }) : null
  const shown = v == null ? clean(scene.value) : Number.isInteger(n) ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)
  const R = wide ? 330 : 380
  const cy = wide ? height * 0.48 : height * 0.4
  return (
    <Stage>
      {[0, 1, 2].map((k) => {
        const p = ((frame + k * 20) % 60) / 60
        return <div key={k} style={{ position: 'absolute', left: width / 2 - R, top: cy - R, width: 2 * R, height: 2 * R, borderRadius: '50%', border: `2px solid ${tint(CYAN, 0.6)}`, transform: `scale(${0.4 + p * 0.8})`, opacity: 1 - p }} />
      })}
      <div style={{ position: 'absolute', left: 60, right: 60, top: cy - 160, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 190 : 200, lineHeight: 1, color: '#FFFFFF', textShadow: `0 0 40px ${tint(CYAN, 0.8)}`, fontVariantNumeric: 'tabular-nums' }}>
          {clean(scene.prefix)}
          {shown}
          {clean(scene.suffix)}
        </span>
        <div style={{ marginTop: 26 }}>
          <Headline text={scene.label} size={fitSize(scene.label, wide ? 54 : 60)} delay={20} />
        </div>
      </div>
    </Stage>
  )
}

// ── reveal: the padlock closes, the network turns calm ──
function Reveal({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const close = spring({ frame: frame - 18, fps, config: { damping: 9, mass: 0.8 } })
  const calm = interpolate(frame, [20, 40], [0, 1], clamp)
  const col = calm < 1 ? RED : CYAN
  const L = wide ? 230 : 260
  const cy = wide ? height * 0.42 : height * 0.34
  return (
    <Stage alarm={0.5 * (1 - calm)}>
      <Globe cx={width / 2} cy={cy} r={wide ? 380 : 430} spin={frame * 0.012} opacity={0.45} color={col} />
      {calm > 0 && <div style={{ position: 'absolute', left: width / 2 - 500, top: cy - 500, width: 1000, height: 1000, borderRadius: '50%', background: `radial-gradient(circle, ${tint(a, 0.35)}, transparent 60%)`, transform: `scale(${0.3 + 0.9 * calm})`, opacity: 1 - 0.5 * calm }} />}
      <div style={{ position: 'absolute', left: width / 2 - L / 2, top: cy - L * 0.75, width: L, height: L * 1.3, filter: glow(calm >= 1 ? a : RED, 26) }}>
        <svg viewBox="0 0 100 130" width={L} height={L * 1.3}>
          <path d={`M28 ${58 - (1 - close) * 22} V36 C28 20 38 10 50 10 C62 10 72 20 72 36 V${58 - (1 - close) * 22}`} fill="none" stroke={calm >= 1 ? '#FFFFFF' : '#FFD7DE'} strokeWidth={9} strokeLinecap="round" transform={`translate(${(1 - close) * 12} ${-(1 - close) * 6})`} />
          <rect x="14" y="56" width="72" height="64" rx="12" fill={tint(calm >= 1 ? a : RED, 0.35)} stroke={calm >= 1 ? a : RED} strokeWidth={4} />
          <circle cx="50" cy="84" r="8" fill="#FFFFFF" />
          <rect x="47" y="86" width="6" height="16" rx="3" fill="#FFFFFF" />
        </svg>
      </div>
      <div style={{ position: 'absolute', left: 70, right: 70, top: cy + L * 0.75, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ opacity: calm }}>
          <Tag text="PROTECTED" color={GREEN} size={wide ? 24 : 28} />
        </div>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 76 : 80)} delay={24} />
      </div>
    </Stage>
  )
}

// ── cta: the logo, the line, the button ──
function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const inn = spring({ frame, fps, config: { damping: 14 } })
  const btn = spring({ frame: frame - 22, fps, config: { damping: 11 } })
  return (
    <Stage>
      <Globe cx={width / 2} cy={height * 0.5} r={wide ? 420 : 470} spin={frame * 0.01} opacity={0.35} />
      <div style={{ position: 'absolute', left: 80, right: 80, top: 0, bottom: wide ? 120 : 460, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 40 : 54 }}>
        <div style={{ transform: `scale(${inn})`, opacity: inn }}>
          <Shield size={wide ? 170 : 200} color={a}>
            {brand.logo ? <Img src={srcOf(brand.logo)} style={{ width: wide ? 80 : 94, height: wide ? 60 : 70, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} /> : <Icon name="ShieldCheck" size={wide ? 64 : 76} color="#FFFFFF" stroke={2} />}
          </Shield>
        </div>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 82 : 86)} delay={8} />
        {scene.button && (
          <span style={{ padding: wide ? '22px 58px' : '26px 66px', borderRadius: 16, border: `2px solid ${CYAN}`, background: tint(CYAN, 0.14), color: '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 42 : 48, boxShadow: `0 0 ${30 + 14 * Math.sin(frame / 8)}px ${tint(CYAN, 0.5)}, inset 0 0 20px ${tint(CYAN, 0.2)}`, transform: `scale(${btn})`, opacity: btn, whiteSpace: 'nowrap' }}>
            {clean(scene.button)}
          </span>
        )}
      </div>
    </Stage>
  )
}

/** The scene change: a short glitch — the frame tears into slices, splits red / cyan and settles. */
function Glitch({ children, presentationDirection, presentationProgress }) {
  const p = presentationProgress
  const entering = presentationDirection === 'entering'
  const k = Math.sin(p * Math.PI) // strongest mid-way
  const jitter = (random(`gl${Math.round(p * 14)}`) - 0.5) * 60 * k
  return (
    <AbsoluteFill style={{ opacity: entering ? Math.min(1, p * 2.2) : 1 - p * 0.6, transform: `translateX(${jitter}px) skewX(${jitter * 0.08}deg)`, filter: `blur(${k * 3}px) saturate(${1 + k}) hue-rotate(${k * 40}deg)` }}>
      {children}
      {k > 0.2 && (
        <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, ${tint(CYAN, 0.18 * k)} 0 3px, transparent 3px ${10 + Math.round(random(`gs${Math.round(p * 14)}`) * 30)}px)`, mixBlendMode: 'screen' }} />
      )}
    </AbsoluteFill>
  )
}

export const CYBER = {
  scenes: { hook: Hook, flow: Network, step: Attack, notify: Monitor, dashboard: Soc, list: Protections, stat: Stat, reveal: Reveal, cta: Cta },
  root: { backgroundColor: BG },
  transitions: [() => ({ component: Glitch, props: {} })],
  linearTransitions: true,
  captionTop: (h) => (h < 1200 ? h - 150 : 1520),
}
