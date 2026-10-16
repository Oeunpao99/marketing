/**
 * Unveil — a light, airy product launch, after a launch film the user liked
 * (2026-10-16): a bright white stage with soft teal and blue light, one huge
 * thin word filling the top while the real app card rises into focus under
 * it, a card flying past the camera out of focus, a field typing itself in,
 * and a glossy check with confetti falling through the depth of field.
 * Drawn on its own "mist" background (Mist, also saas.jsx's AiBg "mist").
 *
 * Its own scenes (app/motion.py UNVEIL_PROMPT):
 *
 *   { type: "word", word, title?, action?, text?, rows?: [{ name, sub? }] }   the big word sharpens in, the card comes into focus
 *   { type: "field", label?, value, button? }                                  the field types itself, the button is pressed
 *   { type: "done", text, icon? }                                              the glossy check, confetti
 *
 * The rest (hook, list, stat, reveal, screen, dashboard, flow, cta) are
 * saas.jsx's scenes in this palette. Every scene lays itself out for 9:16 and 16:9.
 */
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, clean, fitSize, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
const DEEP = '#163A40' // the dark teal of the confetti and the ink
const SUB = '#6A7C7A'

/** Text split into what a reader sees as letters — Khmer clusters stay whole. */
const letters = (text) => {
  const t = clean(text)
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment)
  } catch {
    return [...t]
  }
}

/** The stage: near-white, soft blue and teal light drifting slowly. */
export function Mist({ P }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const big = Math.max(width, height)
  const glows = [
    { x: 0.1, y: 0.62, d: 0.55, c: tint(P.b, 0.55), sx: 40, sy: 30, k: 90 },
    { x: 0.92, y: 0.3, d: 0.5, c: tint(P.a, 0.22), sx: 30, sy: 40, k: 110 },
    { x: 0.55, y: 1.02, d: 0.6, c: tint(P.b, 0.35), sx: 50, sy: 20, k: 130 },
  ]
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, ${P.bg} 100%)`, overflow: 'hidden' }}>
      {glows.map((g, i) => {
        const d = big * g.d
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: g.x * width - d / 2 + Math.sin(frame / g.k + i) * g.sx,
              top: g.y * height - d / 2 + Math.cos(frame / g.k + i) * g.sy,
              width: d,
              height: d,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${g.c}, transparent 68%)`,
              filter: `blur(${Math.round(d * 0.06)}px)`,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

/** A white card, the way the reference's app panels look. */
const panel = (r = 30) => ({
  background: '#FFFFFF',
  borderRadius: r,
  boxShadow: '0 40px 90px rgba(22,58,64,0.13), 0 3px 10px rgba(22,58,64,0.06)',
  border: '2px solid rgba(22,58,64,0.05)',
})

/** A person's round avatar: their initials, or the plain person mark. */
function Avatar({ name, size }) {
  const init = letters(name).filter((c) => /\S/.test(c))
  const two = /[A-Za-z]/.test(name) ? clean(name).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : init[0] || ''
  return (
    <div style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: '#EEF2F2', display: 'grid', placeItems: 'center', color: '#8A9796', fontFamily: FONT, fontWeight: 700, fontSize: size * 0.36 }}>
      {two || <Icon name="User" size={size * 0.5} color="#8A9796" />}
    </div>
  )
}

/** One row of the card: avatar, name, detail, the ✕. */
function Row({ row, size, P }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.45 }}>
      <Avatar name={row.name} size={size * 1.5} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: size, color: '#141A1C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(row.name)}</div>
        {row.sub && <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: size * 0.72, color: SUB, marginTop: 4 }}>{clean(row.sub)}</div>}
      </div>
      <Icon name="X" size={size * 1.15} color="#1B1F22" stroke={2.2} />
    </div>
  )
}

// ── word: the huge thin word sharpens in, the app card comes into focus ─────
function makeWord(P, Bg) {
  return function Word({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const chars = letters(scene.word)
    // as big as fits the frame: ~0.56 em a Latin letter in this thin weight, Khmer clusters wider
    const khmer = /[ក-៿]/.test(scene.word || '')
    const wordSize = Math.round(Math.min(wide ? 230 : 190, (width - 120) / Math.max(1, chars.length * (khmer ? 0.72 : 0.56))))
    // the card: from below, out of focus, into focus (a camera's focus pull)
    const rise = spring({ frame: frame - 12, fps, config: { damping: 20, mass: 0.9 } })
    const focus = interpolate(frame, [12, 36], [1, 0], { ...clamp, easing: ease })
    const rows = scene.rows || []
    const unit = wide ? 34 : 50
    const cardW = wide ? 1060 : width - 110
    const cardTop = wide ? 360 : 760
    // a copy of the last row lifts off and flies past the camera, out of focus
    const flyStart = 46 + rows.length * 8
    // where the last row sits in the card: padding, the title line, the text line, the rows above it
    const pad = wide ? 40 : 46
    const titleH = scene.title || scene.action ? unit * 1.15 * 1.3 : 0
    const textH = scene.text ? 22 + unit * 0.82 * 1.5 * Math.ceil(clean(scene.text).length / (wide ? 52 : 34)) : 0
    const lastRowTop = cardTop + pad + titleH + textH + 34 + (rows.length - 1) * (unit * 1.5 + 30)
    const fly = rows.length ? interpolate(frame, [flyStart, flyStart + 30], [0, 1], { ...clamp, easing: (t) => t * t }) : 0
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* the word */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 70 : 400, zIndex: 2, display: 'flex', justifyContent: 'center', padding: '0 40px' }}>
          <div style={{ fontFamily: FONT, fontWeight: 300, fontSize: wordSize, letterSpacing: '-0.035em', lineHeight: 1.12, whiteSpace: 'nowrap' }}>
            {chars.map((c, i) => {
              const t = interpolate(frame, [i * 2, i * 2 + 14], [0, 1], { ...clamp, easing: ease })
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'pre',
                    color: 'transparent',
                    backgroundImage: `linear-gradient(180deg, ${tint(P.a, 0.75)}, ${DEEP})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    opacity: t,
                    filter: `blur(${(1 - t) * 14}px)`,
                    transform: `translateY(${(1 - t) * 30}px)`,
                  }}
                >
                  {c}
                </span>
              )
            })}
          </div>
        </div>
        {/* the card */}
        <div
          style={{
            position: 'absolute',
            left: (width - cardW) / 2,
            top: cardTop + (1 - rise) * 220,
            width: cardW,
            ...panel(34),
            padding: wide ? '40px 48px' : '46px 52px',
            opacity: Math.min(1, rise * 1.6),
            filter: `blur(${focus * 18}px)`,
            transform: `scale(${0.94 + 0.06 * rise})`,
            zIndex: 1,
          }}
        >
          {(scene.title || scene.action) && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20 }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: unit * 1.15, color: '#141A1C' }}>{clean(scene.title)}</div>
              {scene.action && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: unit * 0.9, color: P.a }}>{clean(scene.action)}</div>}
            </div>
          )}
          {scene.text && (
            <div style={{ marginTop: 22, fontFamily: FONT, fontWeight: 500, fontSize: unit * 0.82, lineHeight: 1.5, color: '#2B3336', opacity: interpolate(frame, [26, 38], [0, 1], clamp) }}>
              {clean(scene.text)}
            </div>
          )}
          <div style={{ marginTop: rows.length ? 34 : 0, display: 'flex', flexDirection: 'column', gap: 30 }}>
            {rows.map((row, i) => {
              const t = interpolate(frame, [32 + i * 8, 44 + i * 8], [0, 1], { ...clamp, easing: ease })
              return (
                <div key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 24}px)` }}>
                  <Row row={row} size={unit} P={P} />
                </div>
              )
            })}
          </div>
        </div>
        {/* the copy that flies at the camera: bigger, tilting, out of focus */}
        {rows.length > 0 && fly > 0 && (
          <div
            style={{
              position: 'absolute',
              left: (width - cardW) / 2 + 40 + fly * (wide ? 260 : 120),
              top: lastRowTop - 30 + fly * (wide ? 160 : 320),
              width: cardW - 40,
              ...panel(26),
              padding: '30px 40px',
              transform: `scale(${1 + fly * 0.5}) rotate(${fly * 9}deg)`,
              filter: `blur(${2 + fly * 16}px)`,
              opacity: 1 - Math.max(0, fly - 0.75) * 4,
              zIndex: 3,
            }}
          >
            <Row row={rows[rows.length - 1]} size={unit} P={P} />
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

// ── field: the field types itself in, the button is pressed ────────────────
function makeField(P, Bg) {
  return function Field({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const chars = letters(scene.value)
    const typeFrom = 14
    const per = Math.max(1.2, Math.min(3, 40 / Math.max(1, chars.length))) // a long value types faster
    const shown = Math.max(0, Math.min(chars.length, Math.floor((frame - typeFrom) / per)))
    const typed = typeFrom + chars.length * per
    const pressAt = typed + 14
    const press = frame >= pressAt && frame < pressAt + 6 ? 0.93 : 1
    const sent = interpolate(frame, [pressAt + 4, pressAt + 14], [0, 1], clamp)
    const enter = spring({ frame, fps, config: { damping: 18 } })
    const unit = wide ? 38 : 52
    const w = wide ? 1100 : width - 120
    const caret = Math.floor(frame / 15) % 2 === 0 && sent === 0
    // the soft pointer: drifts to the button, a ring when it presses
    const reach = interpolate(frame, [typed - 4, pressAt], [0, 1], { ...clamp, easing: ease })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* out-of-focus cards drifting at the edges, for depth */}
        {[
          { x: -0.08, y: 0.18, w: 0.42, h: 0.12, r: -8, b: 16 },
          { x: 0.7, y: 0.72, w: 0.46, h: 0.14, r: 7, b: 22 },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x * width + Math.sin((frame + i * 40) / 50) * 20,
              top: c.y * height + Math.cos((frame + i * 30) / 60) * 16,
              width: c.w * width,
              height: c.h * height,
              ...panel(28),
              transform: `rotate(${c.r}deg)`,
              filter: `blur(${c.b}px)`,
              opacity: 0.85 * enter,
            }}
          />
        ))}
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: w, transform: `translateY(${(1 - enter) * 60}px)`, opacity: enter }}>
            {scene.label && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: unit * 0.8, color: SUB, marginBottom: 20, paddingLeft: 6 }}>{clean(scene.label)}</div>}
            <div style={{ ...panel(24), display: 'flex', alignItems: 'center', minHeight: unit * 2.6, padding: `0 ${unit * 0.8}px`, border: `3px solid ${frame >= typeFrom && sent === 0 ? tint(P.a, 0.55) : 'rgba(22,58,64,0.10)'}` }}>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: unit * 1.05, color: '#141A1C', whiteSpace: 'pre' }}>
                {chars.slice(0, shown).join('')}
                <span style={{ display: 'inline-block', width: 4, height: unit * 1.15, marginLeft: 4, verticalAlign: 'middle', background: P.a, opacity: caret ? 1 : 0 }} />
              </div>
            </div>
            {scene.button && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 34, position: 'relative' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: `${unit * 0.5}px ${unit * 1.1}px`,
                    borderRadius: 999,
                    background: sent ? DEEP : P.a,
                    color: '#FFFFFF',
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: unit * 0.9,
                    boxShadow: `0 18px 40px ${tint(P.a, 0.35)}`,
                    transform: `scale(${press})`,
                  }}
                >
                  {sent > 0 && <Icon name="Check" size={unit * 0.9} color="#FFFFFF" stroke={3} />}
                  {clean(scene.button)}
                </div>
                {/* the pointer's ring */}
                <div
                  style={{
                    position: 'absolute',
                    right: unit * 1.4 - (1 - reach) * 220,
                    top: unit * 0.4 + (1 - reach) * 160,
                    width: unit * 1.2,
                    height: unit * 1.2,
                    borderRadius: '50%',
                    background: 'rgba(22,58,64,0.18)',
                    border: '3px solid rgba(255,255,255,0.9)',
                    boxShadow: '0 8px 20px rgba(22,58,64,0.18)',
                    transform: `scale(${frame >= pressAt && frame < pressAt + 8 ? 0.8 : 1})`,
                    opacity: reach * (1 - sent),
                  }}
                />
              </div>
            )}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── done: the glossy check, confetti falling through the depth of field ────
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  x: random(`cx${i}`),
  delay: random(`cd${i}`) * 14,
  speed: 0.55 + random(`cs${i}`) * 0.7,
  spin: (random(`cr${i}`) - 0.5) * 9,
  tilt: random(`ct${i}`) * 180,
  near: random(`cn${i}`), // > 0.78: close to the camera — big and out of focus
  hue: Math.floor(random(`ch${i}`) * 4),
}))

function makeDone(P, Bg) {
  return function Done({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pop = spring({ frame: frame - 4, fps, config: { damping: 9, mass: 0.7 } })
    const glow = interpolate(frame, [4, 30], [0, 1], clamp)
    const words = interpolate(frame, [14, 28], [0, 1], { ...clamp, easing: ease })
    const D = wide ? 240 : 270
    const colors = [P.a, DEEP, tint(P.b, 0.9), tint(P.a, 0.55)]
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {CONFETTI.map((c, i) => {
          const t = Math.max(0, frame - c.delay)
          const near = c.near > 0.78
          const size = near ? 150 : 34 + c.near * 70
          const y = -size - 80 + t * (near ? 34 : 14 + c.near * 12) * c.speed
          const x = c.x * width + Math.sin((t + i * 20) / 18) * 26
          const fast = near ? 10 : c.near > 0.5 ? 2.5 : 0 // depth of field + a little motion blur
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: size,
                height: size * 0.62,
                borderRadius: 4,
                background: colors[c.hue],
                opacity: near ? 0.75 : 0.95,
                transform: `rotate(${c.tilt + t * c.spin}deg) skewX(${Math.sin(t / 9 + i) * 18}deg)`,
                filter: fast ? `blur(${fast}px)` : undefined,
              }}
            />
          )
        })}
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: wide ? 46 : 60, flexDirection: 'column' }}>
          {/* the glossy check */}
          <div style={{ position: 'relative', width: D, height: D, transform: `scale(${pop})` }}>
            <div style={{ position: 'absolute', inset: -D * 0.18, borderRadius: '50%', background: `radial-gradient(circle, ${tint(P.a, 0.28 * glow)}, transparent 70%)` }} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle at 32% 26%, ${tint(P.a, 0.55)} 0%, ${P.a} 45%, ${DEEP} 100%)`,
                boxShadow: `0 30px 70px ${tint(DEEP, 0.35)}, inset 0 -14px 30px rgba(0,0,0,0.18), inset 0 10px 24px rgba(255,255,255,0.25)`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={scene.icon || 'Check'} size={D * 0.5} color="#FFFFFF" stroke={3.2} />
            </div>
            {/* the glass highlight */}
            <div style={{ position: 'absolute', left: D * 0.16, top: D * 0.08, width: D * 0.5, height: D * 0.3, borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0))', transform: 'rotate(-18deg)' }} />
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 400,
              fontSize: fitSize(scene.text, wide ? 110 : 100),
              letterSpacing: '-0.02em',
              color: tint(DEEP, 0.85),
              textAlign: 'center',
              padding: '0 60px',
              opacity: words,
              filter: `blur(${(1 - words) * 10}px)`,
              transform: `translateY(${(1 - words) * 20}px)`,
            }}
          >
            {clean(scene.text)}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

export function unveilScenes(P, Bg) {
  const B = Bg || Mist
  return { word: makeWord(P, B), field: makeField(P, B), done: makeDone(P, B) }
}
