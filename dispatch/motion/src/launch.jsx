/**
 * Product launch — after a launch video the user liked (2026-10-14): deep
 * purple light, a big tilted app card with a glowing mint edge, the camera
 * pushing in on one button and a cartoon hand clicking it. Drawn on
 * saas.jsx's "launch" background.
 *
 * Its own scenes (app/motion.py LAUNCH_PROMPT):
 *
 *   { type: "launch", name, text?, badge? }                     "Introducing" + the product, a "Now live" badge
 *   { type: "button", title?, text?, button, result? }          the card, the push-in, the hand clicks, the result
 *   { type: "form", title?, fields: [{ label, value }], toggle? } fields type themselves in, the hand flips the toggle
 *
 * The rest (hook, list, stat, reveal, step, screen, dashboard, flow, cta) are
 * saas.jsx's scenes in this palette. Every scene lays itself out for 9:16 and 16:9.
 */
import { Pointer } from 'lucide-react'
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const CARD_INK = '#1B1530'
const CARD_SUB = '#6B6585'

/** Text split into what a reader sees as letters — Khmer clusters stay whole. */
const letters = (text) => {
  const t = clean(text)
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment)
  } catch {
    return [...t]
  }
}

/** The cartoon hand: a white pointing glove with a dark outline. */
function Hand({ x, y, press = 1, opacity = 1, size = 150 }) {
  return (
    <div style={{ position: 'absolute', left: x - size * 0.3, top: y - size * 0.06, opacity, transform: `scale(${press}) rotate(-8deg)`, transformOrigin: '30% 6%', filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.35))' }}>
      <Pointer size={size} color="#111111" fill="#FFFFFF" strokeWidth={1.5} />
    </div>
  )
}

/** The tilted card: near-white, a lilac wash in the corner, the mint edge glowing. */
function cardStyle(P, glow) {
  return {
    position: 'absolute',
    borderRadius: 44,
    background: 'linear-gradient(135deg, #CDBDF5 0%, #F1ECFB 38%, #FCFBF7 70%)',
    border: `5px solid ${P.b}`,
    boxShadow: `0 0 ${30 + 50 * glow}px ${tint(P.b, 0.35 + 0.4 * glow)}, 0 70px 140px rgba(0,0,0,0.55)`,
    overflow: 'hidden',
  }
}

// ── launch: "Introducing" + the product, letter by letter ───────────────────
function makeLaunchReveal(P, Bg) {
  return function LaunchReveal({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const chars = letters(scene.name || brand.name)
    const size = Math.round(Math.min(wide ? 200 : 170, (wide ? 1500 : 960) / Math.max(4, chars.length * 0.62)))
    const kick = spring({ frame, fps, config: { damping: 14 } })
    const done = 8 + chars.length * 2
    const line = interpolate(frame, [done, done + 14], [0, 1], { ...clamp, easing: easeInOut })
    const sub = interpolate(frame, [done + 6, done + 18], [0, 1], clamp)
    const badge = spring({ frame: frame - done - 14, fps, config: { damping: 10 } })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ paddingTop: wide ? 170 : 300, paddingBottom: wide ? 220 : 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 26 : 34, textAlign: 'center' }}>
          {brand.logo ? (
            <div style={{ opacity: kick, transform: `translateY(${(1 - kick) * -20}px)`, background: 'rgba(255,255,255,0.95)', borderRadius: 24, padding: '14px 28px' }}>
              <Img src={srcOf(brand.logo)} style={{ height: wide ? 64 : 80, maxWidth: 380, objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{ opacity: kick, fontFamily: FONT, fontWeight: 700, fontSize: wide ? 34 : 38, letterSpacing: 8, color: tint(P.b, 0.9) }}>INTRODUCING</div>
          )}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'center', fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#FFFFFF', whiteSpace: 'nowrap' }}>
              {chars.map((c, i) => {
                const s = spring({ frame: frame - 8 - i * 2, fps, config: { damping: 13 } })
                return (
                  <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: s, transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * 8}deg)` }}>
                    {c}
                  </span>
                )
              })}
            </div>
            <div style={{ height: Math.max(8, size * 0.06), borderRadius: 99, marginTop: 6, background: `linear-gradient(90deg, ${P.a}, ${P.b})`, transform: `scaleX(${line})`, transformOrigin: 'left center', boxShadow: `0 0 24px ${tint(P.b, 0.6)}` }} />
          </div>
          {scene.text && (
            <div style={{ maxWidth: wide ? 1300 : 940, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, wide ? 50 : 54), color: 'rgba(240,235,255,0.82)', lineHeight: 1.4, opacity: sub, transform: `translateY(${(1 - sub) * 24}px)` }}>
              {clean(scene.text)}
            </div>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 30px', borderRadius: 999, background: tint(P.b, 0.14), border: `2px solid ${tint(P.b, 0.7)}`, fontFamily: FONT, fontWeight: 700, fontSize: wide ? 30 : 34, letterSpacing: 3, color: P.b, transform: `scale(${badge})`, opacity: badge }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: P.b, boxShadow: `0 0 14px ${P.b}`, opacity: 0.5 + 0.5 * Math.sin(frame / 4) }} />
            {clean(scene.badge || 'NOW LIVE').toUpperCase()}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── button: the push-in on one button, the hand clicks it ───────────────────
function makeLaunchButton(P, Bg) {
  return function LaunchButton({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const C = wide ? { x: 330, y: 190, w: 1260, h: 600, bh: 120, bw: 620, font: 52 } : { x: 70, y: 470, w: 940, h: 780, bh: 124, bw: 600, font: 50 }
    const bx = C.x + C.w / 2 // the button's centre, in frame coordinates
    const by = C.y + C.h - 60 - C.bh / 2
    const clickAt = Math.min(Math.round(durationInFrames * 0.5), 62)
    const card = spring({ frame, fps, config: { damping: 16 } })
    const tilt = interpolate(frame, [0, clickAt], [1, 0.35], { ...clamp, easing: easeInOut })
    const zoom = 1 + (wide ? 0.28 : 0.42) * interpolate(frame, [12, clickAt - 2], [0, 1], { ...clamp, easing: easeInOut })
    const handIn = interpolate(frame, [clickAt - 26, clickAt - 4], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const press = interpolate(frame, [clickAt - 4, clickAt, clickAt + 6], [1, 0.92, 1], clamp)
    const glow = interpolate(frame, [clickAt, clickAt + 6, clickAt + 30], [0, 1, 0.4], clamp)
    const ripple = interpolate(frame, [clickAt, clickAt + 20], [0, 1], clamp)
    const done = spring({ frame: frame - clickAt - 6, fps, config: { damping: 11 } })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ perspective: 2200, transformOrigin: `${bx}px ${by}px`, transform: `scale(${zoom})` }}>
          <div style={{ ...cardStyle(P, glow), left: C.x, top: C.y, width: C.w, height: C.h, opacity: card, transform: `translateY(${(1 - card) * 160}px) rotateX(${12 * tilt}deg) rotateY(${-14 * tilt}deg) rotateZ(${2 * tilt}deg)` }}>
            <div style={{ position: 'absolute', left: 50, right: 50, top: 46 }}>
              {scene.title && <Words text={scene.title} delay={6} color={CARD_INK} style={{ fontSize: fitSize(scene.title, wide ? 58 : 60), fontWeight: 700, lineHeight: 1.2 }} />}
              {scene.text && <div style={{ marginTop: 12, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, 34), color: CARD_SUB, lineHeight: 1.4 }}>{clean(scene.text)}</div>}
            </div>
            {/* an inner panel, like the reference's message box */}
            <div style={{ position: 'absolute', left: 50, right: 50, top: wide ? 230 : 300, bottom: 60 + C.bh + 60, borderRadius: 30, background: 'rgba(255,255,255,0.55)', border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 20px 40px rgba(76,61,160,0.12)' }}>
              {[0.72, 0.5, 0.6].map((w, i) => (
                <div key={i} style={{ height: 18, width: `${w * 100}%`, margin: `${i ? 18 : 34}px 34px 0`, borderRadius: 9, background: 'rgba(27,21,48,0.08)' }} />
              ))}
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60 + C.bh + 30, height: 2, background: 'rgba(27,21,48,0.08)' }} />
          </div>
          {/* the button, drawn outside the tilt so the push-in lands on it exactly */}
          <div style={{ position: 'absolute', left: bx - C.bw / 2, top: by - C.bh / 2, width: C.bw, height: C.bh, opacity: card, transform: `scale(${press}) rotateX(${12 * tilt}deg) rotateY(${-14 * tilt}deg)` }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `5px solid ${P.b}`, transform: `scale(${1 + ripple * 0.35})`, opacity: ripple ? 1 - ripple : 0 }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: `linear-gradient(135deg, #7C3AED, ${P.a} 55%, #A855F7)`, boxShadow: '0 18px 40px rgba(124,58,237,0.45), inset 0 2px 0 rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.button, C.font), color: '#FFFFFF', whiteSpace: 'nowrap' }}>
              {frame >= clickAt + 4 && <Icon name="Check" size={C.font * 0.9} color="#FFFFFF" stroke={3} />}
              {clean(scene.button)}
            </div>
          </div>
          <Hand x={interpolate(handIn, [0, 1], [bx + 420, bx + 10])} y={interpolate(handIn, [0, 1], [by + 520, by - 6])} press={press} opacity={handIn > 0 ? 1 : 0} size={wide ? 140 : 150} />
        </AbsoluteFill>
        {scene.result && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: by - C.bh * 0.5 * 1.42 - (wide ? 110 : 130), display: 'flex', justifyContent: 'center', opacity: done, transform: `translateY(${(1 - done) * -40}px) scale(${0.9 + 0.1 * done})` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 34px', borderRadius: 999, background: 'rgba(16,10,32,0.85)', border: `2px solid ${tint(P.b, 0.8)}`, boxShadow: `0 0 40px ${tint(P.b, 0.35)}`, fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.result, wide ? 40 : 44), color: '#FFFFFF' }}>
              <Icon name="CircleCheck" size={wide ? 44 : 50} color={P.b} stroke={2.6} />
              {clean(scene.result)}
            </div>
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

// ── form: the fields type themselves in, the hand flips the toggle ──────────
function makeLaunchForm(P, Bg) {
  return function LaunchForm({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const fields = (scene.fields || []).slice(0, 3)
    const C = wide ? { x: 360, y: 160, w: 1200, rowH: 120, font: 32 } : { x: 70, y: scene.title ? 400 : 360, w: 940, rowH: 180, font: 42 }
    const head = scene.title ? (wide ? 120 : 160) : 40
    const H = head + fields.length * C.rowH + (scene.toggle ? C.rowH : 0) + 50
    const card = spring({ frame, fps, config: { damping: 16 } })
    const tilt = interpolate(frame, [0, 60], [1, 0.25], { ...clamp, easing: easeInOut })
    // each field types in after the one before
    let at = 14
    const typing = fields.map((f) => {
      const ch = letters(f.value)
      const from = at
      at += Math.max(10, Math.round(ch.length * 1.1)) + 6
      return { ch, from }
    })
    const flipAt = at + 18
    const toggleY = C.y + head + fields.length * C.rowH + C.rowH / 2
    const toggleX = C.x + C.w - 50 - 70
    const handIn = interpolate(frame, [flipAt - 22, flipAt - 3], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const press = interpolate(frame, [flipAt - 3, flipAt, flipAt + 6], [1, 0.9, 1], clamp)
    const on = spring({ frame: frame - flipAt, fps, config: { damping: 14 } })
    const glow = scene.toggle ? interpolate(frame, [flipAt, flipAt + 6, flipAt + 30], [0, 1, 0.4], clamp) : 0
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ perspective: 2200 }}>
          <div style={{ ...cardStyle(P, glow), left: C.x, top: C.y, width: C.w, height: H, opacity: card, transform: `translateY(${(1 - card) * 160}px) rotateX(${10 * tilt}deg) rotateY(${12 * tilt}deg) rotateZ(${-1.5 * tilt}deg)` }}>
            {scene.title && (
              <div style={{ position: 'absolute', left: 50, right: 50, top: 40 }}>
                <Words text={scene.title} delay={4} color={CARD_INK} style={{ fontSize: fitSize(scene.title, wide ? 54 : 58), fontWeight: 700, lineHeight: 1.2 }} />
              </div>
            )}
            {fields.map((f, i) => {
              const { ch, from } = typing[i]
              const shown = Math.max(0, Math.min(ch.length, Math.floor((frame - from) / 1.1)))
              const active = frame >= from && shown < ch.length
              return (
                <div key={i} style={{ position: 'absolute', left: 50, right: 50, top: head + i * C.rowH, height: C.rowH - 24 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: C.font * 0.66, color: CARD_SUB, marginBottom: 8 }}>{clean(f.label)}</div>
                  <div style={{ height: C.rowH - 24 - C.font * 0.66 - 16, borderRadius: 18, background: '#FFFFFF', border: `3px solid ${active ? P.a : 'rgba(27,21,48,0.10)'}`, display: 'flex', alignItems: 'center', padding: '0 24px', fontFamily: FONT, fontWeight: 600, fontSize: C.font, color: CARD_INK, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {ch.slice(0, shown).join('')}
                    {active && <span style={{ width: 3, height: C.font * 1.1, marginLeft: 3, background: P.a, opacity: Math.floor(frame / 8) % 2 ? 0.2 : 1 }} />}
                  </div>
                </div>
              )
            })}
            {scene.toggle && (
              <div style={{ position: 'absolute', left: 50, right: 50, top: head + fields.length * C.rowH, height: C.rowH - 24, display: 'flex', alignItems: 'center', gap: 20, fontFamily: FONT, fontWeight: 700, fontSize: C.font, color: CARD_INK }}>
                <span style={{ flex: 1 }}>{clean(scene.toggle)}</span>
                <span style={{ position: 'relative', width: 140, height: 76, borderRadius: 38, background: on > 0.5 ? P.b : 'rgba(27,21,48,0.15)', transition: 'none' }}>
                  <span style={{ position: 'absolute', top: 8, left: 8 + 64 * on, width: 60, height: 60, borderRadius: 30, background: '#FFFFFF', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }} />
                </span>
              </div>
            )}
          </div>
          {scene.toggle && <Hand x={interpolate(handIn, [0, 1], [toggleX + 380, toggleX + 20])} y={interpolate(handIn, [0, 1], [toggleY + 460, toggleY - 4])} press={press} opacity={handIn > 0 ? 1 : 0} size={wide ? 130 : 140} />}
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── stack: the brand's screenshots arrive one by one, the deck pushed back ──
function makeLaunchStack(P, Bg) {
  return function LaunchStack({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const pages = (scene.images || []).slice(0, 4)
    const words = (scene.words || []).map(clean).filter(Boolean)
    const n = Math.max(1, pages.length)
    const step = Math.max(14, Math.min(30, Math.round((durationInFrames * 0.6) / n)))
    // pos: how many pages have arrived (springs — 0.5 = the next one half way in)
    let pos = 0
    for (let i = 0; i < n; i++) pos += spring({ frame: frame - 4 - i * step, fps, config: { damping: 16 } })
    const front = Math.max(0, Math.min(n - 1, Math.round(pos) - 1))
    const W = wide ? 1500 : 960
    const H = wide ? 480 : 800
    const top = wide ? 380 : 600
    const word = words.length ? words[Math.min(words.length - 1, Math.round((front * (words.length - 1)) / Math.max(1, n - 1)))] : ''
    const wordIn = spring({ frame: frame - 4 - front * step, fps, config: { damping: 14 } })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {word && (
          <div key={word} style={{ position: 'absolute', left: 0, right: 0, top: wide ? 150 : 300, zIndex: 10, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(word, wide ? 110 : 120), letterSpacing: '-0.03em', color: '#FFFFFF', opacity: wordIn, transform: `translateY(${(1 - wordIn) * 40}px)` }}>
            {word}
          </div>
        )}
        {pages.map((pg, i) => {
          const d = pos - 1 - i // 0 = in front, 1 = one back …; below 0 = still coming up from below
          if (d < -1) return null
          const back = Math.max(0, d)
          const up = Math.max(0, -d) // 1 → off the bottom
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: (width - W) / 2,
                top: top - back * (wide ? 60 : 70) + up * (height - top + 40),
                width: W,
                height: H,
                borderRadius: 30,
                overflow: 'hidden',
                background: '#FFFFFF',
                border: i === front ? `4px solid ${P.b}` : '4px solid rgba(255,255,255,0.6)',
                boxShadow: i === front ? `0 0 40px ${tint(P.b, 0.35)}, 0 50px 100px rgba(0,0,0,0.55)` : '0 30px 60px rgba(0,0,0,0.4)',
                transform: `scale(${1 - back * 0.07})`,
                transformOrigin: 'top center',
                filter: `brightness(${1 - Math.min(0.5, back * 0.22)})`,
                zIndex: i,
              }}
            >
              <Img src={srcOf(pg.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
            </div>
          )
        })}
      </AbsoluteFill>
    )
  }
}

/** Product launch's own scenes in palette P, drawn on background Bg (saas.jsx AiBg). */
export function launchScenes(P, Bg) {
  return {
    launch: makeLaunchReveal(P, Bg),
    button: makeLaunchButton(P, Bg),
    form: makeLaunchForm(P, Bg),
    stack: makeLaunchStack(P, Bg),
  }
}
