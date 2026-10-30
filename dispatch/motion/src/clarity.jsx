/**
 * SaaS explainer — after an explainer the user liked (2026-10-14): calm white
 * and light blue, thin concentric rings, words that sharpen into place, the
 * real app rising in a device frame, chips orbiting the thing that matters,
 * notifications flying in from every side. Drawn on saas.jsx's "rings" background.
 *
 * Its own scenes (app/motion.py CLARITY_PROMPT):
 *
 *   { type: "platform", text, image?, imgW?, imgH? }                logo bubble, the line, the app rising in a frame
 *   { type: "orbit", text?, center: { icon, title, sub? }, tags: [{ icon, label }] }   chips pop in round one item
 *   { type: "chaos", text, cards: [{ app, title, sub? }] }           notifications fly in round one calm line
 *   { type: "phones", words: [], images?: [{ src }] }                 four phones turning round a word that changes
 *   { type: "pair", left, right, icon?, label? }                     "Any language [glass card] Instantly", a hand on the card
 *
 * The rest (list, stat, step, screen, dashboard, flow, cta) are saas.jsx's
 * scenes in this palette. Every scene lays itself out for 9:16 and 16:9.
 *
 * The After Effects pass (the boss's references, 2026-10-30 — "lively, not
 * boring"): every scene sits under a camera that keeps drifting in
 * (withCamera), the lines land word by word out of a blur with the
 * ⟦highlights⟧ in a moving blue gradient (Kinetic), a four-point sparkle
 * flies through and settles, things that fly in carry motion blur, the app
 * comes in as a tilted 3D screen, and scenes change with a blue swoosh, a
 * whip pan or a zoom (CLARITY_TRANSITIONS) — never a plain slide.
 *
 *   { type: "hook", text }       the line alone, big, a sparkle landing by it
 *   { type: "reveal", text }     the same, with a ring pulse behind it
 *   { type: "gallery", title, tabs?, cards: [{ title, sub?, icon? }], images?: [{ src }], text? }
 *                                the app's library: a big window tilted in 3D, the cards popping in
 *
 * The swoosh carries a phone lying on its side at the ribbon's head (the reference's phone shot).
 */
import { Pointer } from 'lucide-react'
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, ZWSP, clean, fitSize, srcOf, tint } from './shared'
import { appLook } from './showcase'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const out = Easing.bezier(0.16, 1, 0.3, 1) // AE "easy ease out" — fast, then a long soft landing
const inOut = Easing.bezier(0.7, 0, 0.3, 1)

/** The line's words (and ⟦highlight⟧ runs), as Sharpen and Kinetic lay them out. */
function pieces(text) {
  const list = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === '⟦') em = true
        else if (bit === '⟧') em = false
        else list.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && list.length) list[list.length - 1].gap = true
    })
  }
  return list
}

/** Kinetic type: each word rises out of a blur and lands with a little
 * overshoot, one after another; ⟦highlights⟧ are filled with a blue gradient
 * that keeps sliding. The whole line then breathes in very slowly. */
export function Kinetic({ text, P, size, delay = 0, align = 'center', color = INK, stagger = 4 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const list = pieces(text).map((x, n) => ({ ...x, n }))
  // the pieces of one word ("today" + "?") never wrap apart
  const words = []
  let cur = []
  for (const x of list) {
    cur.push(x)
    if (x.gap) {
      words.push(cur)
      cur = []
    }
  }
  if (cur.length) words.push(cur)
  const settle = interpolate(frame, [delay, delay + 90], [0.985, 1.02], clamp)
  const piece = ({ p, gap, em, n }) => {
    const at = delay + n * stagger
    const s = spring({ frame: frame - at, fps, config: { damping: 13, mass: 0.7, stiffness: 140 } })
    const t = interpolate(frame, [at, at + 10], [0, 1], { ...clamp, easing: out })
    const look = em
      ? {
          backgroundImage: `linear-gradient(100deg, ${P.b}, ${P.a} 45%, #7C5CFF 70%, ${P.b})`,
          backgroundSize: '220% 100%',
          backgroundPosition: `${(frame * 1.2) % 220}% 0`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }
      : { color }
    return (
      <span
        key={n}
        style={{
          display: 'inline-block',
          marginRight: gap ? '0.26em' : 0,
          paddingBottom: '0.08em',
          ...look,
          opacity: t,
          filter: `blur(${(1 - t) * 16}px)`,
          transform: `translateY(${(1 - s) * 0.55 * size}px) scale(${0.9 + 0.1 * s}) rotate(${(1 - s) * 4}deg)`,
          transformOrigin: '50% 100%',
        }}
      >
        {p}
      </span>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: '-0.025em', lineHeight: 1.2, transform: `scale(${settle})` }}>
      {words.map((w, k) => (
        <span key={k} style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          {w.map(piece)}
        </span>
      ))}
    </div>
  )
}

/** The motif: a four-point sparkle in the blue gradient that flies in on a
 * curve (blurred while it moves), spins and settles at (x, y), then twinkles. */
export function Sparkle({ P, x, y, size = 90, delay = 0, from = [-0.6, 0.5] }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const t = interpolate(frame, [delay, delay + 26], [0, 1], { ...clamp, easing: out })
  if (frame < delay) return null
  const sx = from[0] * width
  const sy = from[1] * height
  const arc = Math.sin(t * Math.PI) * -0.18 * height // flies on a curve, not a line
  const px = sx + (x - sx) * t
  const py = sy + (y - sy) * t + arc
  const speed = 1 - t
  const twinkle = 1 + 0.12 * Math.sin((frame - delay) / 6)
  const id = `spk${Math.round(x)}${Math.round(y)}`
  return (
    <div style={{ position: 'absolute', left: px - size / 2, top: py - size / 2, width: size, height: size, transform: `rotate(${(1 - t) * 300 + frame * 0.6}deg) scale(${(0.4 + 0.6 * t) * twinkle})`, filter: `blur(${speed * 6}px) drop-shadow(0 0 ${18 + 10 * Math.sin(frame / 8)}px ${tint(P.b, 0.7)})` }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={P.b} />
            <stop offset="1" stopColor={P.a} />
          </linearGradient>
        </defs>
        <path d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}

/** An icon the AE way: a gradient tile that pops in with a little spin, a
 * soft glow under it that breathes, a light sweeping across its face now and
 * then, and the icon itself landing a beat later. */
export function GlowIcon({ P, name, size = 64, delay = 0, radius = 0.28, colors }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const [c1, c2] = colors || [P.b, P.a]
  const pop = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 160 } })
  const mark = spring({ frame: frame - delay - 5, fps, config: { damping: 9, stiffness: 180 } })
  const breathe = 0.5 + 0.5 * Math.sin((frame - delay) / 14)
  const sweep = ((frame - delay) % 75) / 75 // a sheen across the face every 2.5 s
  return (
    <div style={{ position: 'relative', flex: 'none', width: size, height: size, transform: `scale(${pop}) rotate(${(1 - pop) * -25}deg)` }}>
      <div style={{ position: 'absolute', inset: -size * 0.18, borderRadius: size * radius * 1.3, background: `radial-gradient(closest-side, ${tint(c2, 0.55)}, transparent)`, filter: `blur(${size * 0.12}px)`, opacity: 0.55 + 0.45 * breathe }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: size * radius, overflow: 'hidden', background: `linear-gradient(140deg, ${c1}, ${c2})`, boxShadow: `0 ${size * 0.14}px ${size * 0.4}px ${tint(c2, 0.45)}, inset 0 2px 0 rgba(255,255,255,0.45)` }}>
        <div style={{ position: 'absolute', top: '-30%', bottom: '-30%', width: '45%', left: `${-60 + sweep * 220}%`, transform: 'skewX(-20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', transform: `scale(${0.5 + 0.5 * mark})`, opacity: mark, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' }}>
        <Icon name={name || 'Sparkles'} size={size * 0.54} color="#FFFFFF" stroke={2.4} />
      </div>
    </div>
  )
}

/** Every scene under a camera: it lands with a small push (the cut feels like
 * a move), then keeps drifting in and across, slowly — nothing is ever still. */
export function withCamera(Scene) {
  return function Camera(props) {
    const frame = useCurrentFrame()
    const { durationInFrames } = useVideoConfig()
    const land = interpolate(frame, [0, 18], [1.06, 1], { ...clamp, easing: out })
    const t = Math.min(1, frame / Math.max(1, durationInFrames))
    return (
      <AbsoluteFill style={{ transform: `scale(${land * (1.03 + 0.05 * t)}) translateX(${(t - 0.5) * -24}px)`, transformOrigin: '50% 46%' }}>
        <Scene {...props} />
      </AbsoluteFill>
    )
  }
}

// ── transitions (presentations for @remotion/transitions) ──────────────────
/** A blue ribbon sweeps across from the right; the old scene pushes away and
 * blurs behind it, the new one is revealed in its wake. */
function Swoosh({ children, presentationDirection, presentationProgress, passedProps }) {
  const { width } = useVideoConfig()
  const P = passedProps.P
  const p = presentationProgress
  const e = inOut(p)
  if (presentationDirection === 'exiting') {
    return <AbsoluteFill style={{ transform: `translateX(${-e * 0.18 * width}px) scale(${1 + 0.06 * e})`, filter: `blur(${e * 14}px)` }}>{children}</AbsoluteFill>
  }
  const { height } = useVideoConfig()
  const edge = 1.25 - 1.7 * e // the ribbon's middle, in widths: from off the right to past the left
  const reveal = Math.max(0, Math.min(100, (edge + 0.12) * 100))
  const ph = height * (width > height ? 0.95 : 0.55) // the phone, lying on its side
  const pw = ph * 0.48
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${reveal}%)`, transform: `translateX(${(1 - e) * 0.08 * width}px) scale(${1.04 - 0.04 * e})`, filter: `blur(${(1 - e) * 8}px)` }}>{children}</AbsoluteFill>
      <div style={{ position: 'absolute', top: '-40%', bottom: '-40%', left: (edge - 0.36) * width, width: 0.72 * width, transform: 'rotate(14deg)', borderRadius: '50%', background: `linear-gradient(90deg, transparent, ${P.a} 22%, #3B4BF5 50%, ${P.b} 80%, transparent)`, filter: 'blur(16px)', opacity: Math.min(1, Math.sin(p * Math.PI) * 1.6) }} />
      {/* a phone rushes past at the ribbon's head, the blue trailing behind it */}
      <div style={{ position: 'absolute', left: (edge - 0.42) * width - pw / 2, top: height / 2 - ph / 2, width: pw, height: ph, perspective: 1600, filter: `blur(${Math.sin(p * Math.PI) * 5}px)` }}>
        <div style={{ width: '100%', height: '100%', transform: `rotateY(${-38 + 30 * e}deg) rotateX(18deg) rotateZ(${-78 + 14 * e}deg)` }}>
          <SidePhone P={P} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

/** A phone body with a drawn app screen — for the swoosh, where it only flashes past. */
function SidePhone({ P }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: '13% / 6.5%', background: '#0E1016', padding: '3.2%', boxShadow: '0 40px 80px rgba(20,30,80,0.35)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '11% / 5.4%', overflow: 'hidden', background: '#FFFFFF', fontFamily: FONT }}>
        <div style={{ position: 'absolute', top: '1.6%', left: '34%', right: '34%', height: '3.4%', borderRadius: 99, background: '#0E1016' }} />
        <div style={{ position: 'absolute', top: '9%', left: '8%', right: '8%', height: '5%', borderRadius: 99, background: '#F1F4F8', border: '2px solid #E6EAF0' }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ position: 'absolute', left: '8%', right: '8%', top: `${19 + i * 7}%`, height: '2.4%', borderRadius: 99, background: i === 1 ? tint(P.a, 0.35) : '#E3E8EF', width: `${84 - i * 12}%` }} />
        ))}
        <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', bottom: '8%', borderRadius: 18, background: `linear-gradient(150deg, #6D5BFF, ${P.a})` }} />
      </div>
    </div>
  )
}

/** A whip pan: both scenes rush sideways with heavy motion blur. */
function Whip({ children, presentationDirection, presentationProgress }) {
  const { width } = useVideoConfig()
  const e = inOut(presentationProgress)
  const entering = presentationDirection === 'entering'
  const x = entering ? (1 - e) * 0.6 * width : -e * 0.6 * width
  const blur = Math.sin(presentationProgress * Math.PI) * 26
  return <AbsoluteFill style={{ transform: `translateX(${x}px) skewX(${(entering ? 1 - e : e) * -6}deg)`, filter: `blur(${blur}px)`, opacity: entering ? Math.min(1, presentationProgress * 2.5) : 1 }}>{children}</AbsoluteFill>
}

/** A zoom through: the old scene rushes into the lens, the new one rises out of it. */
function Zoom({ children, presentationDirection, presentationProgress }) {
  const p = presentationProgress
  const e = inOut(p)
  const entering = presentationDirection === 'entering'
  return (
    <AbsoluteFill style={{ transform: `scale(${entering ? 0.8 + 0.2 * e : 1 + 0.35 * e})`, filter: `blur(${entering ? (1 - e) * 18 : e * 22}px)`, opacity: entering ? Math.min(1, p * 2) : 1 - e }}>
      {children}
    </AbsoluteFill>
  )
}

/** SaaS explainer's scene changes, taken in turn. */
export function clarityTransitions(P) {
  return [() => ({ component: Swoosh, props: { P } }), () => ({ component: Whip, props: {} }), () => ({ component: Zoom, props: {} })]
}

// ── hook / reveal: the line alone, big — the sparkle lands by it ───────────
function makeLine(P, Bg, kind) {
  return function Line({ scene }) {
    const frame = useCurrentFrame()
    const { width, height } = useVideoConfig()
    const wide = width > height
    const size = fitSize(scene.text, kind === 'hook' ? (wide ? 118 : 108) : wide ? 110 : 100)
    const words = pieces(scene.text).length
    const top = wide ? 300 : 560
    const boxH = wide ? 420 : 640
    const pulse = interpolate(frame, [6, 40], [0, 1], { ...clamp, easing: out })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* a soft blue glow that swells behind the line */}
        <div style={{ position: 'absolute', left: width / 2 - 520, top: top + boxH / 2 - 300, width: 1040, height: 600, borderRadius: '50%', background: `radial-gradient(closest-side, ${tint(P.b, 0.22)}, transparent)`, transform: `scale(${0.6 + 0.5 * pulse})`, opacity: pulse }} />
        {kind === 'reveal' && [0, 1].map((k) => {
          const r = interpolate(frame, [10 + k * 10, 60 + k * 10], [0, 1], { ...clamp, easing: out })
          return <div key={k} style={{ position: 'absolute', left: width / 2 - 400, top: top + boxH / 2 - 400, width: 800, height: 800, borderRadius: '50%', border: `3px solid ${tint(P.a, 0.35)}`, transform: `scale(${0.3 + 0.9 * r})`, opacity: 1 - r }} />
        })}
        <div style={{ position: 'absolute', left: wide ? 180 : 70, right: wide ? 180 : 70, top, height: boxH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 40 : 56 }}>
          {scene.icon && <GlowIcon P={P} name={scene.icon} size={wide ? 120 : 150} delay={2} />}
          <Kinetic text={scene.text} P={P} size={size} delay={scene.icon ? 10 : 4} />
        </div>
        <Sparkle P={P} x={wide ? width - 300 : width - 170} y={top + (wide ? 70 : 90)} size={wide ? 96 : 104} delay={8 + words * 4} from={[1.2, 1.1]} />
        <Sparkle P={P} x={wide ? 260 : 150} y={top + boxH - (wide ? 60 : 80)} size={wide ? 48 : 54} delay={14 + words * 4} from={[-0.2, 1.2]} />
      </AbsoluteFill>
    )
  }
}

/** Motion blur for something flying in: strong at the start of ``s`` (0→1), gone when it lands. */
const flyBlur = (s, most = 12) => `blur(${Math.max(0, 1 - s) * most}px)`
const INK = '#1F2733'
const SUB = '#6B7686'
const SHADOW = '0 18px 40px rgba(31,39,51,0.10), 0 2px 6px rgba(31,39,51,0.06)'

/** The line, word by word — each one fading in from a blur, ⟦highlights⟧ in the accent. */
export function Sharpen({ text, P, size, delay = 0, align = 'center', color = INK }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
      {pieces(text).map(({ p, gap, em: hi }, n) => {
        const t = interpolate(frame, [delay + n * 3, delay + n * 3 + 12], [0, 1], clamp)
        return (
          <span key={n} style={{ display: 'inline-block', marginRight: gap ? '0.26em' : 0, color: hi ? P.a : color, opacity: 0.15 + 0.85 * t, filter: `blur(${(1 - t) * 10}px)`, transform: `translateY(${(1 - t) * 14}px)` }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

// ── platform: the logo bubble, the line, the app rising in a frame ──────────
function makePlatform(P, Bg) {
  return function Platform({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const L = wide ? { bubble: 120, bTop: 50, tTop: 190, dTop: 300, dW: 1480 } : { bubble: 200, bTop: 270, tTop: 520, dTop: 800, dW: 980 }
    const bub = spring({ frame, fps, config: { damping: 11 } })
    const rise = spring({ frame: frame - 16, fps, config: { damping: 18, mass: 1.2 } })
    // the device takes the screenshot's own shape — the whole screen shows, nothing cut off its
    // sides — and ends above the subtitles (the user, 2026-10-30)
    const aspect = scene.image && scene.imgW && scene.imgH ? scene.imgH / scene.imgW : 0.66
    const maxH = (wide ? 870 : 1430) - L.dTop
    const dW = Math.min(L.dW, Math.round((maxH - 36) / aspect + 36))
    const dH = Math.round((dW - 36) * aspect + 36)
    L.dW = dW
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* the logo in a speech bubble */}
        <div style={{ position: 'absolute', left: width / 2 - L.bubble / 2, top: L.bTop, width: L.bubble, height: L.bubble, transform: `scale(${bub})` }}>
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'rgba(255,255,255,0.55)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#FFFFFF', boxShadow: SHADOW, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {brand.logo ? (
              <Img src={srcOf(brand.logo)} style={{ width: '64%', height: '64%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: L.bubble * 0.2, color: P.b, letterSpacing: '0.04em', textAlign: 'center', padding: 10 }}>{clean(brand.name).toUpperCase().slice(0, 10)}</span>
            )}
          </div>
          <div style={{ position: 'absolute', left: L.bubble * 0.08, bottom: -L.bubble * 0.06, width: L.bubble * 0.26, height: L.bubble * 0.26, background: '#FFFFFF', clipPath: 'polygon(0 100%, 30% 0, 100% 40%)' }} />
        </div>
        <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: L.tTop }}>
          <Kinetic text={scene.text} P={P} size={fitSize(scene.text, wide ? 84 : 80)} delay={6} />
        </div>
        {/* the device: a tilted 3D screen that swings up from below (blurred while it moves),
            then keeps turning slowly — a light sheen crossing its glass */}
        <div style={{ position: 'absolute', left: width / 2 - L.dW / 2, top: L.dTop + (1 - rise) * (height - L.dTop) * 0.8, width: L.dW, height: dH, perspective: 2200, filter: flyBlur(rise, 14) }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 40, padding: 18, background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.75))', boxShadow: `0 50px 110px rgba(31,39,51,0.2), 0 0 0 3px ${tint(P.b, 0.35)}`, transform: `rotateX(${(1 - rise) * 34 + 9}deg) rotateY(${(1 - rise) * -26 - 8 + frame * 0.07}deg) rotateZ(${(1 - rise) * 6}deg)`, transformOrigin: '50% 100%' }}>
            <div style={{ position: 'absolute', inset: 18, borderRadius: 24, overflow: 'hidden', zIndex: 2, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '22%', left: `${interpolate(frame, [24, 70], [-40, 140], clamp)}%`, transform: 'skewX(-18deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)' }} />
            </div>
            <div style={{ width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden', background: '#FFFFFF', border: '2px solid #E6EAF0' }}>
              {scene.image ? (
                <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center', display: 'block' }} />
              ) : (
                <SampleApp P={P} brand={brand} wide={wide} />
              )}
            </div>
          </div>
        </div>
        <Sparkle P={P} x={width / 2 + L.dW / 2 - 30} y={L.dTop + 10} size={wide ? 80 : 90} delay={30} from={[1.15, 0.2]} />
      </AbsoluteFill>
    )
  }
}

/** No screenshot: a plain drawn app — a top bar, a title, rows of a list. */
function SampleApp({ P, brand, wide }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ width: '100%', height: '100%', fontFamily: FONT }}>
      <div style={{ height: wide ? 64 : 70, display: 'flex', alignItems: 'center', gap: 16, padding: '0 26px', borderBottom: '2px solid #EEF1F5' }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, background: `linear-gradient(135deg, ${P.a}, ${P.b})` }} />
        <span style={{ fontWeight: 700, fontSize: 26, color: INK }}>{clean(brand.name)}</span>
        <span style={{ marginLeft: 'auto', width: 260, height: 34, borderRadius: 17, background: '#F1F4F8' }} />
      </div>
      <div style={{ padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: '40%', height: 26, borderRadius: 13, background: '#E3E8EF' }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: wide ? 54 : 60, padding: '0 18px', borderRadius: 14, background: i === 1 ? tint(P.a, 0.08) : '#F7F9FB', opacity: interpolate(frame, [26 + i * 4, 34 + i * 4], [0, 1], clamp) }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 1 ? P.a : '#D5DCE5' }} />
            <span style={{ flex: 1, height: 16, borderRadius: 8, background: '#E3E8EF', maxWidth: `${50 + ((i * 17) % 30)}%` }} />
            <span style={{ width: 90, height: 24, borderRadius: 12, background: tint(P.b, 0.25) }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── orbit: chips pop in round the item that matters ─────────────────────────
const TAG_SPOTS_TALL = [[0.24, 0.29], [0.76, 0.26], [0.17, 0.46], [0.83, 0.44], [0.27, 0.61], [0.73, 0.63]]
const TAG_SPOTS_WIDE = [[0.17, 0.27], [0.58, 0.16], [0.82, 0.25], [0.29, 0.55], [0.78, 0.58], [0.12, 0.6]]

function makeOrbit(P, Bg) {
  return function Orbit({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const tags = (scene.tags || []).slice(0, 6)
    const c = scene.center || {}
    const hub = wide ? { x: 960, y: 470, r: 150 } : { x: 540, y: 880, r: 170 }
    const hubIn = spring({ frame, fps, config: { damping: 13 } })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', left: hub.x - hub.r, top: hub.y - hub.r, width: hub.r * 2, height: hub.r * 2, transform: `scale(${hubIn})` }}>
          <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', boxShadow: SHADOW }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#EEF1F5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <GlowIcon P={P} name={c.icon || 'FileText'} size={hub.r * 0.66} delay={4} />
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 24 : 28, color: INK, textAlign: 'center', padding: '0 16px', lineHeight: 1.2 }}>{clean(c.title)}</div>
            {c.sub && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 17 : 20, color: SUB }}>{clean(c.sub)}</div>}
          </div>
        </div>
        {tags.map((tg, i) => {
          const [fx, fy] = (wide ? TAG_SPOTS_WIDE : TAG_SPOTS_TALL)[i]
          const s = spring({ frame: frame - 10 - i * 5, fps, config: { damping: 12 } })
          const bob = Math.sin((frame + i * 29) / 24) * 6
          // each chip shoots out of the hub to its place, blurred on the way
          const x = hub.x + (fx * width - hub.x) * s
          const y = hub.y + (fy * height - hub.y) * s + bob
          return (
            <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.4 + 0.6 * s})`, opacity: Math.min(1, s * 1.5), filter: flyBlur(s, 10) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: wide ? '14px 26px 14px 14px' : '16px 30px 16px 16px', borderRadius: 18, background: '#FFFFFF', border: '2px solid #E6EAF0', boxShadow: SHADOW, whiteSpace: 'nowrap' }}>
                <GlowIcon P={P} name={tg.icon || 'Check'} size={wide ? 54 : 64} delay={14 + i * 5} />
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 30 : 34, color: INK }}>{clean(tg.label)}</span>
              </div>
            </div>
          )
        })}
        {scene.text && (
          <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 760 : 1290 }}>
            <Kinetic text={scene.text} P={P} size={fitSize(scene.text, wide ? 72 : 70)} delay={10 + tags.length * 5} />
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

// ── chaos: notifications fly in from every side round one calm line ────────
// clear of the logo chip (top-left) and of the edges the drifting camera crops
const CARD_SPOTS_TALL = [[0.4, 0.17, 1], [0.7, 0.23, 0.9], [0.3, 0.31, 0.85], [0.72, 0.58, 0.9], [0.3, 0.64, 1], [0.68, 0.71, 0.85]]
const CARD_SPOTS_WIDE = [[0.25, 0.25, 1], [0.76, 0.17, 0.9], [0.83, 0.42, 0.85], [0.16, 0.58, 0.9], [0.78, 0.69, 1], [0.33, 0.75, 0.85]]

function makeChaos(P, Bg) {
  return function Chaos({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const cards = (scene.cards || []).slice(0, 6)
    const cardW = wide ? 470 : 520
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {cards.map((cd, i) => {
          const [fx, fy, depth] = (wide ? CARD_SPOTS_WIDE : CARD_SPOTS_TALL)[i]
          const s = spring({ frame: frame - 4 - i * 4, fps, config: { damping: 15 } })
          // fly in from the edge it sits nearest
          const dx = (fx - 0.5) * 2
          const dy = (fy - 0.45) * 2
          const drift = Math.sin((frame + i * 37) / 30) * 8
          const { icon, color } = appLook({ name: cd.app }, i)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: fx * width,
                top: fy * height + drift,
                width: cardW,
                transform: `translate(-50%, -50%) translate(${(1 - s) * dx * 600}px, ${(1 - s) * dy * 500}px) scale(${depth * (0.85 + 0.15 * s)})`,
                filter: `blur(${(depth < 0.9 ? 1.5 : 0) + Math.max(0, 1 - s) * 14}px)`,
                opacity: Math.min(1, s * 1.3) * (depth < 0.9 ? 0.85 : 1),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', borderRadius: 22, background: '#FFFFFF', boxShadow: SHADOW }}>
                <div style={{ position: 'relative', flex: 'none' }}>
                  <GlowIcon P={P} name={icon} size={76} delay={8 + i * 4} colors={[color, color]} />
                  <span style={{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, background: '#EF4444', border: '3px solid #FFFFFF', transform: `scale(${spring({ frame: frame - 16 - i * 4, fps, config: { damping: 8 } })})` }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(cd.title)}</div>
                  {cd.sub && <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 24, color: SUB, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(cd.sub)}</div>}
                </div>
              </div>
            </div>
          )
        })}
        {/* the calm line in the middle, on a soft white haze */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 330 : 700, height: wide ? 380 : 400, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,255,255,0.95), rgba(255,255,255,0) 75%)' }} />
        <div style={{ position: 'absolute', left: wide ? 260 : 60, right: wide ? 260 : 60, top: wide ? 430 : 790, height: wide ? 180 : 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Kinetic text={scene.text} P={P} size={fitSize(scene.text, wide ? 96 : 88)} delay={8 + cards.length * 4} />
        </div>
      </AbsoluteFill>
    )
  }
}

// ── phones: four phones in a ring, turning, round a word that changes ──────
function makePhones(P, Bg) {
  return function Phones({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const words = (scene.words || []).map(clean).filter(Boolean)
    const pics = scene.images || []
    const pw = wide ? 500 : 560
    const ph = Math.round(pw * 2.05)
    const R = ph / 2 + (wide ? 250 : 270) // from the centre to each phone's centre — the word keeps clear space
    const pull = spring({ frame, fps, config: { damping: 30, mass: 2 } }) // the camera pulling back
    const spin = frame * 0.18
    const each = Math.max(18, Math.round((durationInFrames - 10) / Math.max(1, words.length)))
    const k = Math.min(words.length - 1, Math.floor(Math.max(0, frame - 6) / each))
    const word = words[k] || ''
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ transform: `scale(${1.25 - 0.25 * pull})` }}>
          {[0, 90, 180, 270].map((a, i) => (
            <div key={a} style={{ position: 'absolute', left: width / 2 - pw / 2, top: height / 2 - ph / 2, width: pw, height: ph, transform: `rotate(${a + spin}deg) translateY(${R}px)` }}>
              <div style={{ width: '100%', height: '100%', borderRadius: pw * 0.17, background: '#111318', padding: pw * 0.035, boxShadow: '0 40px 80px rgba(31,39,51,0.25)' }}>
                <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: pw * 0.14, overflow: 'hidden', background: '#FFFFFF' }}>
                  {pics.length ? (
                    <Img src={srcOf(pics[i % pics.length].src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                  ) : (
                    <SampleApp P={P} brand={brand} wide={false} />
                  )}
                  <div style={{ position: 'absolute', top: pw * 0.03, left: '50%', width: pw * 0.3, height: pw * 0.07, marginLeft: -pw * 0.15, borderRadius: 99, background: '#111318' }} />
                </div>
              </div>
            </div>
          ))}
        </AbsoluteFill>
        <div key={k} style={{ position: 'absolute', left: 0, right: 0, top: height / 2 - 90, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Kinetic text={`⟦${word}⟧`} P={P} size={fitSize(word, wide ? 120 : 110)} delay={k ? 6 + k * each : 0} />
        </div>
      </AbsoluteFill>
    )
  }
}

// ── pair: a word, a floating glass card, a word — a hand on the card ───────
function makePair(P, Bg) {
  return function Pair({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const card = spring({ frame: frame - 6, fps, config: { damping: 11 } })
    const hand = spring({ frame: frame - 22, fps, config: { damping: 14 } })
    const press = interpolate(frame, [30, 34, 40], [1, 0.92, 1], clamp)
    const bob = Math.sin(frame / 18) * 8
    const C = wide ? 300 : 340
    const size = wide ? 96 : 104
    const word = (text, color, delay) => <Kinetic text={text} P={P} size={fitSize(text, size)} delay={delay} color={color} />
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ paddingTop: wide ? 150 : 300, paddingBottom: wide ? 200 : 460, display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 70 : 60 }}>
          <div style={{ flex: wide ? 1 : 'none', display: 'flex', justifyContent: wide ? 'flex-end' : 'center' }}>{word(scene.left, INK, 2)}</div>
          <div style={{ position: 'relative', flex: 'none', width: C, height: C * 0.9, transform: `perspective(1400px) translateY(${bob + (1 - card) * 260}px) scale(${card * press}) rotateY(${(1 - card) * 70 + Math.sin(frame / 30) * 6}deg) rotateX(${(1 - card) * 25}deg) rotate(${(1 - card) * -12}deg)`, filter: flyBlur(card, 12) }}>
            {/* the back of the card and two pages peeking out */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 26, background: `linear-gradient(160deg, ${P.a}, ${P.b})` }} />
            {[0, 1].map((k) => (
              <div key={k} style={{ position: 'absolute', left: 50 + k * 26, right: 40 - k * 20, top: 22 + k * 8, height: C * 0.42, borderRadius: 12, background: k ? '#E8EDF5' : '#FFFFFF', border: '2px solid rgba(31,39,51,0.08)', transform: `rotate(${k ? 4 : -2}deg)`, display: 'grid', placeItems: 'center' }}>
                {!k && <Icon name={scene.icon || 'BookOpen'} size={C * 0.14} color={P.a} stroke={2} />}
              </div>
            ))}
            {/* the frosted front */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', borderRadius: '0 26px 26px 26px', background: 'linear-gradient(180deg, rgba(190,220,255,0.75), rgba(120,180,250,0.85))', backdropFilter: 'blur(6px)', border: '2px solid rgba(255,255,255,0.6)', padding: '0 24px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', boxShadow: `0 30px 60px ${tint(P.a, 0.25)}` }}>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: C * 0.1, color: '#FFFFFF' }}>{clean(scene.label || 'Folder')}</div>
              <Icon name="Settings" size={C * 0.08} color="#FFFFFF" stroke={2.4} />
            </div>
            <div style={{ position: 'absolute', right: -C * 0.18, bottom: -C * 0.16, opacity: hand, transform: `translate(${(1 - hand) * 120}px, ${(1 - hand) * 120}px) scale(${press}) rotate(-12deg)`, filter: 'drop-shadow(0 8px 12px rgba(31,39,51,0.25))' }}>
              <Pointer size={C * 0.3} color="#1E3A8A" fill="#FFFFFF" strokeWidth={1.6} />
            </div>
          </div>
          <div style={{ flex: wide ? 1 : 'none', display: 'flex', justifyContent: wide ? 'flex-start' : 'center' }}>{word(scene.right, P.b, 14)}</div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── gallery: the app's library — a big app window tilted in 3D, cards popping in ──
const THUMBS = [null, ['#F59E0B', '#EF4444'], ['#10B981', '#06B6D4'], ['#8B5CF6', '#EC4899'], ['#0EA5E9', '#6366F1'], ['#F97316', '#FACC15']]

function makeGallery(P, Bg) {
  return function Gallery({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const cards = (scene.cards || []).slice(0, 6)
    const pics = scene.images || []
    const tabs = scene.tabs?.length ? scene.tabs : ['All', 'Videos', 'Images']
    const active = Math.min(1, tabs.length - 1)
    // the window: comes in swinging from the right, blurred, then keeps turning slowly
    const inn = spring({ frame, fps, config: { damping: 20, mass: 1.1 } })
    const drift = Math.min(1, frame / Math.max(1, durationInFrames))
    const W = 1700
    const H = 1000
    const k = wide ? 1 : 0.92 // the window's scale on screen
    const left = wide ? 150 : 40
    const top = wide ? 110 : scene.text ? 560 : 470
    const ry = (1 - inn) * -42 - 20 + drift * 8
    const rx = 12 - (1 - inn) * 6
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {scene.text && (
          <div style={{ position: 'absolute', left: 70, right: 70, top: wide ? 40 : 250 }}>
            <Kinetic text={scene.text} P={P} size={fitSize(scene.text, wide ? 64 : 76)} delay={4} />
          </div>
        )}
        {/* the window fades out before the subtitles — nothing of it under them */}
        <AbsoluteFill style={{ maskImage: `linear-gradient(to bottom, black ${wide ? 70 : 68}%, transparent ${wide ? 82 : 76}%)`, WebkitMaskImage: `linear-gradient(to bottom, black ${wide ? 70 : 68}%, transparent ${wide ? 82 : 76}%)` }}>
        <div style={{ position: 'absolute', left, top: top + (wide && scene.text ? 60 : 0), width: W * k, height: H * k, perspective: 2600, filter: flyBlur(inn, 12), maskImage: 'linear-gradient(to right, black 62%, transparent 98%)', WebkitMaskImage: 'linear-gradient(to right, black 62%, transparent 98%)' }}>
          <div style={{ width: W, height: H, transform: `scale(${k}) translateX(${(1 - inn) * 500}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${-2 + (1 - inn) * -4}deg)`, transformOrigin: '0 0' }}>
            <div style={{ display: 'flex', width: '100%', height: '100%', borderRadius: 34, background: '#FFFFFF', border: `4px solid ${tint(P.b, 0.55)}`, boxShadow: `0 60px 120px rgba(31,39,51,0.18), -30px 0 80px ${tint(P.b, 0.25)}`, overflow: 'hidden', fontFamily: FONT }}>
              {/* the sidebar */}
              <div style={{ width: 300, flex: 'none', borderRight: '2px solid #EEF1F5', padding: '34px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
                  {brand.logo ? <Img src={srcOf(brand.logo)} style={{ height: 44, maxWidth: 190, objectFit: 'contain' }} /> : <span style={{ fontWeight: 800, fontSize: 30, color: INK }}>{clean(brand.name)}</span>}
                </div>
                {[['House', 'Home'], ['PlaySquare', clean(scene.title) || 'Library']].map(([ic, label], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, background: i ? tint(P.a, 0.09) : 'transparent', color: i ? INK : SUB, fontSize: 26, fontWeight: 600 }}>
                    <Icon name={ic} size={28} color={i ? P.a : SUB} stroke={2.2} />
                    {label}
                  </div>
                ))}
              </div>
              {/* the page */}
              <div style={{ flex: 1, padding: '34px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: INK }}>{clean(scene.title) || 'Library'}</div>
                <div style={{ display: 'flex', gap: 34, borderBottom: '2px solid #EEF1F5', position: 'relative' }}>
                  {tabs.map((t, i) => (
                    <div key={i} style={{ paddingBottom: 12, fontSize: 25, fontWeight: 600, color: i === active ? P.a : SUB, borderBottom: i === active ? `4px solid ${P.a}` : '4px solid transparent', marginBottom: -2, opacity: interpolate(frame, [8 + i * 3, 16 + i * 3], [0, 1], clamp) }}>
                      {clean(t)}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 420, height: 56, padding: '0 18px', borderRadius: 14, border: '2px solid #E6EAF0', color: SUB, fontSize: 22 }}>
                  <Icon name="Search" size={24} color={SUB} stroke={2.2} />
                  Search
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  {cards.map((c, i) => {
                    const s = spring({ frame: frame - 16 - i * 5, fps, config: { damping: 13 } })
                    const pal = THUMBS[i % THUMBS.length] || [P.b, P.a]
                    return (
                      <div key={i} style={{ borderRadius: 20, border: '2px solid #EEF1F5', background: '#FFFFFF', padding: 12, boxShadow: '0 10px 24px rgba(31,39,51,0.06)', transform: `translateY(${(1 - s) * 60}px) scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s * 1.4), filter: flyBlur(s, 10) }}>
                        <div style={{ position: 'relative', height: 200, borderRadius: 14, overflow: 'hidden', background: `linear-gradient(140deg, ${pal[0]}, ${pal[1]})`, display: 'grid', placeItems: 'center' }}>
                          {pics.length ? (
                            <Img src={srcOf(pics[i % pics.length].src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                          ) : (
                            <>
                              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), transparent 55%)' }} />
                              <div style={{ transform: `scale(${0.6 + 0.4 * s})`, filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.25))' }}>
                                <Icon name={c.icon || 'Image'} size={74} color="#FFFFFF" stroke={2} />
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '0 4px' }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(c.title)}</span>
                          <Icon name="Ellipsis" size={24} color={SUB} stroke={2.4} />
                        </div>
                        {c.sub && <div style={{ fontSize: 19, color: SUB, padding: '2px 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(c.sub)}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

/** SaaS explainer's own scenes in palette P, drawn on background Bg (saas.jsx AiBg). */
export function clarityScenes(P, Bg) {
  return {
    platform: makePlatform(P, Bg),
    orbit: makeOrbit(P, Bg),
    chaos: makeChaos(P, Bg),
    phones: makePhones(P, Bg),
    pair: makePair(P, Bg),
    gallery: makeGallery(P, Bg),
    hook: makeLine(P, Bg, 'hook'),
    reveal: makeLine(P, Bg, 'reveal'),
  }
}
