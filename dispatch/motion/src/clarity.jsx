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
 * The rest (hook, list, stat, reveal, step, screen, dashboard, flow, cta) are
 * saas.jsx's scenes in this palette. Every scene lays itself out for 9:16 and 16:9.
 */
import { Pointer } from 'lucide-react'
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, ZWSP, clean, fitSize, srcOf, tint } from './shared'
import { appLook } from './showcase'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const INK = '#1F2733'
const SUB = '#6B7686'
const SHADOW = '0 18px 40px rgba(31,39,51,0.10), 0 2px 6px rgba(31,39,51,0.06)'

/** The line, word by word — each one fading in from a blur, ⟦highlights⟧ in the accent. */
export function Sharpen({ text, P, size, delay = 0, align = 'center', color = INK }) {
  const frame = useCurrentFrame()
  const pieces = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === '⟦') em = true
        else if (bit === '⟧') em = false
        else pieces.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && pieces.length) pieces[pieces.length - 1].gap = true
    })
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
      {pieces.map(({ p, gap, em: hi }, n) => {
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
    const L = wide ? { bubble: 150, bTop: 70, tTop: 250, dTop: 380, dW: 1480 } : { bubble: 200, bTop: 270, tTop: 520, dTop: 800, dW: 980 }
    const bub = spring({ frame, fps, config: { damping: 11 } })
    const rise = spring({ frame: frame - 16, fps, config: { damping: 18, mass: 1.2 } })
    const dH = Math.round(L.dW * 0.66)
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
          <Sharpen text={scene.text} P={P} size={fitSize(scene.text, wide ? 84 : 80)} delay={6} />
        </div>
        {/* the device: a thick white frame, the app inside, rising from below */}
        <div style={{ position: 'absolute', left: width / 2 - L.dW / 2, top: L.dTop + (1 - rise) * (height - L.dTop), width: L.dW, height: dH, perspective: 2400 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 40, padding: 18, background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.75))', boxShadow: '0 40px 90px rgba(31,39,51,0.18)', transform: `rotateX(${(1 - rise) * 18}deg)`, transformOrigin: 'bottom center' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden', background: '#FFFFFF', border: '2px solid #E6EAF0' }}>
              {scene.image ? (
                <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
              ) : (
                <SampleApp P={P} brand={brand} wide={wide} />
              )}
            </div>
          </div>
        </div>
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
            <div style={{ width: hub.r * 0.62, height: hub.r * 0.78, borderRadius: 10, background: '#FFFFFF', boxShadow: '0 6px 16px rgba(31,39,51,0.08)', display: 'grid', placeItems: 'center' }}>
              <Icon name={c.icon || 'FileText'} size={hub.r * 0.4} color={P.b} stroke={2} />
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 24 : 28, color: INK, textAlign: 'center', padding: '0 16px', lineHeight: 1.2 }}>{clean(c.title)}</div>
            {c.sub && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 17 : 20, color: SUB }}>{clean(c.sub)}</div>}
          </div>
        </div>
        {tags.map((tg, i) => {
          const [fx, fy] = (wide ? TAG_SPOTS_WIDE : TAG_SPOTS_TALL)[i]
          const s = spring({ frame: frame - 10 - i * 5, fps, config: { damping: 12 } })
          const bob = Math.sin((frame + i * 29) / 24) * 6
          return (
            <div key={i} style={{ position: 'absolute', left: fx * width, top: fy * height + bob, transform: `translate(-50%, -50%) scale(${s})`, opacity: Math.min(1, s * 1.5) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: wide ? '14px 26px 14px 14px' : '16px 30px 16px 16px', borderRadius: 18, background: '#FFFFFF', border: '2px solid #E6EAF0', boxShadow: SHADOW, whiteSpace: 'nowrap' }}>
                <div style={{ width: wide ? 54 : 64, height: wide ? 54 : 64, borderRadius: 14, background: `linear-gradient(135deg, ${P.b}, ${P.a})`, display: 'grid', placeItems: 'center' }}>
                  <Icon name={tg.icon || 'Check'} size={wide ? 30 : 36} color="#FFFFFF" stroke={2.4} />
                </div>
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 30 : 34, color: INK }}>{clean(tg.label)}</span>
              </div>
            </div>
          )
        })}
        {scene.text && (
          <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 760 : 1290 }}>
            <Sharpen text={scene.text} P={P} size={fitSize(scene.text, wide ? 72 : 70)} delay={10 + tags.length * 5} />
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

// ── chaos: notifications fly in from every side round one calm line ────────
const CARD_SPOTS_TALL = [[0.33, 0.15, 1], [0.7, 0.21, 0.9], [0.3, 0.3, 0.85], [0.72, 0.58, 0.9], [0.3, 0.64, 1], [0.68, 0.71, 0.85]]
const CARD_SPOTS_WIDE = [[0.2, 0.2, 1], [0.78, 0.15, 0.9], [0.87, 0.4, 0.85], [0.13, 0.58, 0.9], [0.8, 0.69, 1], [0.32, 0.75, 0.85]]

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
                filter: depth < 0.9 ? 'blur(1.5px)' : undefined,
                opacity: Math.min(1, s * 1.3) * (depth < 0.9 ? 0.85 : 1),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', borderRadius: 22, background: '#FFFFFF', boxShadow: SHADOW }}>
                <div style={{ position: 'relative', flex: 'none', width: 76, height: 76, borderRadius: 18, background: '#F1F4F8', display: 'grid', placeItems: 'center' }}>
                  <Icon name={icon} size={42} color={color} stroke={2.2} />
                  <span style={{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, background: '#EF4444', border: '3px solid #FFFFFF' }} />
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
          <Sharpen text={scene.text} P={P} size={fitSize(scene.text, wide ? 96 : 88)} delay={8 + cards.length * 4} />
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
          <Sharpen text={word} P={P} size={fitSize(word, wide ? 120 : 110)} color={P.a} />
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
    const word = (text, color, delay) => <Sharpen text={text} P={P} size={fitSize(text, size)} delay={delay} color={color} />
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ paddingTop: wide ? 150 : 300, paddingBottom: wide ? 200 : 460, display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 70 : 60 }}>
          <div style={{ flex: wide ? 1 : 'none', display: 'flex', justifyContent: wide ? 'flex-end' : 'center' }}>{word(scene.left, INK, 2)}</div>
          <div style={{ position: 'relative', flex: 'none', width: C, height: C * 0.9, transform: `translateY(${bob}px) scale(${card * press}) rotate(${(1 - card) * -12}deg)` }}>
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

/** SaaS explainer's own scenes in palette P, drawn on background Bg (saas.jsx AiBg). */
export function clarityScenes(P, Bg) {
  return {
    platform: makePlatform(P, Bg),
    orbit: makeOrbit(P, Bg),
    chaos: makeChaos(P, Bg),
    phones: makePhones(P, Bg),
    pair: makePair(P, Bg),
  }
}
