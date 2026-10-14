/**
 * SaaS / AI templates — one dark "AI" look (a glowing perspective grid,
 * drifting light, rising particles, glass cards), four stories:
 *
 *   trend  (Awareness)        AI news: what's new, what it means for you
 *   pov    (Increase Reach)   a relatable "POV:" moment, the phone blowing up
 *   demo   (Solution)         the product shown working in an app window, step by step
 *   offer  (Conversion)       a glowing pricing card, what you get, a clear CTA
 *
 * Script fields come from app/motion.py (TREND_PROMPT, POV_PROMPT,
 * DEMO_PROMPT, OFFER_PROMPT):
 *
 *   { type: "news",   tag?, headline, text? }                   trend
 *   { type: "notify", title?, notes: [{ app, text }] }          pov
 *   { type: "step",   n, title, text?, icon?, result? }         demo (n added by build_props)
 *   { type: "offer",  plan?, price?, period?, was?, badge?, features: [], image? }
 *
 * plus their own hook / list / stat / reveal / cta in this look.
 *
 * "custom" (Designed for you): the AI picks the look per video — colours,
 * dark or light, background — and composes these scenes plus `screen` (the
 * brand's real screenshot: zoom to the part that matters, dim the rest, a
 * pointer clicks it, the result pops):
 *
 *   { type: "screen", image, imgW, imgH, title?, text?, focus?: [x, y, w, h] (0-1),
 *     action: "click" | "highlight" | "zoom", result? }
 *   { type: "dashboard", title?, metrics: [{ label, value, prefix?, suffix?, delta? }], chart? }
 *   { type: "flow", title?, nodes: [{ icon, label, sub? }] }
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf, tint } from './shared'

/** A full palette from its base colours: { bg, a (accent), b (second accent),
 * mode: "dark" | "light", background: "grid" | "dots" | "clean" } — flat backgrounds, no glow / gradient. */
export function palette(base) {
  const light = base.mode === 'light'
  return {
    kicker: '',
    icon: 'Sparkles',
    background: 'grid',
    ...base,
    light,
    ink: light ? '#0F172A' : '#FFFFFF',
    sub: light ? 'rgba(15,23,42,0.66)' : 'rgba(226,232,255,0.72)',
    glass: light ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.06)',
    glass2: light ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.09)',
    faint: light ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.06)',
    faint2: light ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.16)',
    card: base.card || (light ? '#FFFFFF' : '#0B1220'),
    onA: light ? '#FFFFFF' : base.bg, // text on an accent-gradient button
    shadow: light ? '0 24px 60px rgba(15,23,42,0.12)' : '0 30px 80px rgba(0,0,0,0.45)',
    dot: light ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.09)',
    // corners, from the brand's own app (look.radius): sharp / soft / round
    rad: base.radius === 'sharp' ? 0.35 : base.radius === 'round' ? 1.35 : 1,
  }
}

const PALETTES = {
  trend: palette({ bg: '#050A18', a: '#22D3EE', b: '#6366F1', kicker: 'AI NEWS', icon: 'Newspaper' }),
  pov: palette({ bg: '#0B0618', a: '#C084FC', b: '#F472B6', kicker: 'POV', icon: 'Smartphone' }),
  demo: palette({ bg: '#040B1C', a: '#3B82F6', b: '#22D3EE', kicker: 'LIVE DEMO', icon: 'LayoutDashboard' }),
  offer: palette({ bg: '#03110D', a: '#34D399', b: '#FBBF24', kicker: 'SPECIAL OFFER', icon: 'BadgePercent', card: '#07170F' }),
}

const ON = '#FFFFFF' // on an accent tile / a dark phone — white in every look
const glass = (P, strong = false) => ({
  background: strong ? P.glass2 : P.glass,
  border: `2px solid ${tint(P.a, strong ? 0.45 : 0.22)}`,
  borderRadius: Math.round(40 * P.rad),
  boxShadow: `${P.shadow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
})
const gradientText = (P) => ({
  background: `linear-gradient(135deg, ${P.ink} 10%, ${P.a} 55%, ${P.b})`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
})

const DOTS = [...Array(26)].map((_, i) => ({
  x: random(`x${i}`) * 1080,
  y: random(`y${i}`) * 1920,
  r: 3 + random(`r${i}`) * 5,
  v: 0.6 + random(`v${i}`) * 1.6,
  o: 0.25 + random(`o${i}`) * 0.5,
}))

/** The background: a flat colour, and by P.background — grid: a grid floor
 * moving towards the viewer, a dot grid at the top, small particles rising;
 * dots: a dot grid all over; clean: the colour alone. No glow, no gradient. */
function AiBg({ P }) {
  const frame = useCurrentFrame()
  const fade = 'linear-gradient(to top, black 5%, transparent 80%)'
  const kind = P.background === 'glow' ? 'grid' : P.background // an old "glow" look draws as grid
  return (
    <AbsoluteFill style={{ backgroundColor: P.bg, overflow: 'hidden' }}>
      {(kind === 'grid' || kind === 'dots') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(${P.dot} 2px, transparent 2px)`,
            backgroundSize: '54px 54px',
            ...(kind === 'grid' && { maskImage: 'linear-gradient(to bottom, black, transparent 55%)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 55%)' }),
          }}
        />
      )}
      {kind === 'grid' && <div
        style={{
          position: 'absolute',
          left: -700,
          right: -700,
          bottom: 0,
          height: 1000,
          transform: 'perspective(800px) rotateX(64deg)',
          transformOrigin: 'center bottom',
          backgroundImage: `linear-gradient(${tint(P.a, 0.4)} 2px, transparent 2px), linear-gradient(90deg, ${tint(P.a, 0.4)} 2px, transparent 2px)`,
          backgroundSize: '130px 130px',
          backgroundPosition: `0 ${(frame * 1.4) % 130}px`,
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />}
      {kind === 'grid' && DOTS.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.x,
            top: (((d.y - frame * d.v) % 1920) + 1920) % 1920,
            width: d.r,
            height: d.r,
            borderRadius: d.r,
            background: i % 3 ? P.a : P.b,
            opacity: d.o * (P.light ? 0.5 : 1) * (0.6 + 0.4 * Math.sin((frame + i * 13) / 14)),
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

/** A glowing icon with a spinning gradient ring. */
function Orb({ P, icon, size = 240, delay = 0 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } })
  const half = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, transform: `scale(${s})` }}>
      <div style={{ position: 'absolute', inset: -30, borderRadius: half + 30, background: `radial-gradient(circle, ${tint(P.a, 0.45)}, transparent 70%)` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: half, background: `conic-gradient(from ${frame * 4}deg, ${P.a}, ${P.b}, transparent 55%, ${P.a})` }} />
      <div style={{ position: 'absolute', inset: 9, borderRadius: half - 9, background: `radial-gradient(circle at 35% 30%, ${tint(P.a, 0.3)}, ${P.bg} 70%)` }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Icon name={icon} size={size * 0.44} color={P.ink} stroke={2} />
      </div>
    </div>
  )
}

function Kicker({ P, text, delay = 0, live = false }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } })
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 28px',
        borderRadius: 999,
        background: tint(P.a, 0.14),
        border: `2px solid ${tint(P.a, 0.5)}`,
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 32,
        letterSpacing: 4,
        color: P.a,
        opacity: s,
        transform: `translateY(${(1 - s) * -24}px)`,
      }}
    >
      {live && <span style={{ width: 16, height: 16, borderRadius: 8, background: '#F43F5E', opacity: 0.5 + 0.5 * Math.sin(frame / 4), boxShadow: '0 0 16px #F43F5E' }} />}
      {text}
    </div>
  )
}

const center = { position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center' }

// ── the shared scenes, in each palette ─────────────────────────────────────
function makeHook(P, id) {
  return function AiHook({ scene }) {
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {P.kicker && (
          <div style={{ ...center, top: 300 }}>
            <Kicker P={P} text={P.kicker} live={id === 'trend' || id === 'demo'} />
          </div>
        )}
        <div style={{ ...center, top: 440 }}>
          <Orb P={P} icon={scene.icon || P.icon} delay={3} />
        </div>
        <div style={{ position: 'absolute', top: 780, left: 64, right: 64 }}>
          <Words text={scene.text} delay={8} align="center" color={P.ink} style={{ fontSize: fitSize(scene.text, 98), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
        </div>
      </AbsoluteFill>
    )
  }
}

/** Glass rows slide in one by one, each with a gradient icon tile and a ✓. */
function makeList(P) {
  return function AiList({ scene }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const items = (scene.items || []).slice(0, 4)
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', top: 290, left: 64, right: 64 }}>
            <Words text={scene.title} align="center" color={P.ink} style={{ fontSize: fitSize(scene.title, 76), fontWeight: 700, textAlign: 'center' }} />
          </div>
        )}
        <div style={{ position: 'absolute', top: scene.title ? 520 : 420, left: 64, right: 64, display: 'flex', flexDirection: 'column', gap: 30 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - 14 - i * 12, fps, config: { damping: 14 } })
            const tick = spring({ frame: frame - 26 - i * 12, fps, config: { damping: 10 } })
            return (
              <div key={i} style={{ ...glass(P), display: 'flex', alignItems: 'center', gap: 28, padding: '28px 30px', opacity: s, transform: `translateX(${(1 - s) * 140}px)` }}>
                <div style={{ flex: 'none', width: 104, height: 104, borderRadius: 30, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', boxShadow: `0 10px 30px ${tint(P.a, 0.4)}` }}>
                  <Icon name={it.icon || 'CircleCheck'} size={56} color={ON} stroke={2.2} />
                </div>
                <div style={{ flex: 1, fontFamily: FONT, fontWeight: 600, fontSize: fitSize(it.text, 50), color: P.ink, lineHeight: 1.35 }}>{clean(it.text)}</div>
                <div style={{ flex: 'none', transform: `scale(${tick})` }}>
                  <Icon name="CircleCheck" size={54} color={P.a} stroke={2.6} />
                </div>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    )
  }
}

/** One big number counting up inside a filling ring. */
function makeStat(P) {
  return function AiStat({ scene }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const s = spring({ frame, fps, config: { damping: 13 } })
    const value = Number(scene.value) || 0
    const p = interpolate(frame, [8, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 })
    const shown = value * p
    const digits = Number.isInteger(value) ? Math.round(shown).toLocaleString('en-US') : shown.toFixed(1)
    const R = 300
    const C = 2 * Math.PI * R
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        <div style={{ ...center, top: 330 }}>
          <div style={{ position: 'relative', width: 700, height: 700, transform: `scale(${0.85 + 0.15 * s})`, opacity: s }}>
            <svg width="700" height="700" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={P.a} />
                  <stop offset="1" stopColor={P.b} />
                </linearGradient>
              </defs>
              <circle cx="350" cy="350" r={R} fill="none" stroke={P.faint2} strokeWidth="26" />
              <circle cx="350" cy="350" r={R} fill="none" stroke="url(#ring)" strokeWidth="26" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - 0.82 * p)} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name={scene.icon || 'TrendingUp'} size={70} color={P.a} stroke={2.2} />
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 190, letterSpacing: -4, lineHeight: 1.1, ...gradientText(P) }}>
                {scene.prefix || ''}
                {digits}
                {scene.suffix || ''}
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 1110, left: 80, right: 80 }}>
          <Words text={scene.label} delay={16} align="center" color={P.ink} style={{ fontSize: fitSize(scene.label, 70), fontWeight: 700, textAlign: 'center' }} />
        </div>
      </AbsoluteFill>
    )
  }
}

/** The "aha" line: a big orb and the words. */
function makeReveal(P) {
  return function AiReveal({ scene }) {
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        <div style={{ ...center, top: 400 }}>
          <Orb P={P} icon={scene.icon || 'Sparkles'} size={300} />
        </div>
        <div style={{ position: 'absolute', top: 820, left: 64, right: 64 }}>
          <Words text={scene.text} delay={8} align="center" color={P.ink} style={{ fontSize: fitSize(scene.text, 90), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
        </div>
      </AbsoluteFill>
    )
  }
}

/** Logo on glass, the line, a gradient button with a shine and a pointer tapping it. */
function makeCta(P) {
  return function AiCta({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const b = spring({ frame: frame - 20, fps, config: { damping: 11 } })
    const tap = spring({ frame: frame - 44, fps, config: { damping: 9 } })
    const press = interpolate(frame, [50, 54, 60], [1, 0.94, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const shine = interpolate((frame - 30) % 60, [0, 30], [-120, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {brand.logo && (
          <div style={{ ...center, top: 320 }}>
            <div style={{ ...glass(P, true), background: 'rgba(255,255,255,0.95)', padding: '24px 40px' }}>
              <Img src={srcOf(brand.logo)} style={{ height: 110, maxWidth: 520, objectFit: 'contain' }} />
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', top: brand.logo ? 610 : 520, left: 64, right: 64 }}>
          <Words text={scene.text} delay={2} align="center" color={P.ink} style={{ fontSize: fitSize(scene.text, 92), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
          {scene.button && (
            <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', transform: `scale(${b * press})`, opacity: b }}>
                <div
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                    padding: '28px 64px',
                    borderRadius: 999,
                    background: `linear-gradient(135deg, ${P.a}, ${P.b})`,
                    boxShadow: `0 20px 60px ${tint(P.a, 0.5)}`,
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 56,
                    color: P.onA,
                  }}
                >
                  {clean(scene.button)}
                  <Icon name="ArrowRight" size={50} color={P.onA} stroke={3} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${shine}%`, width: 120, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', transform: 'skewX(-20deg)' }} />
                </div>
                <div style={{ position: 'absolute', right: -30, bottom: -70, opacity: tap, transform: `translate(${(1 - tap) * 80}px, ${(1 - tap) * 80}px) scale(${press})` }}>
                  <Icon name="MousePointer2" size={90} color={P.ink} stroke={2} />
                </div>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    )
  }
}

// ── AI News (trend) ────────────────────────────────────────────────────────
function makeNews(P) {
  return function AiNews({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const card = spring({ frame: frame - 2, fps, config: { damping: 14 } })
  const why = interpolate(frame, [34, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const tick = clean(scene.tag || 'AI') + '  •  '
  return (
    <AbsoluteFill>
      <AiBg P={P} />
      <div style={{ position: 'absolute', top: 330, left: 0, right: 0 }}>
        <div style={{ margin: '0 56px', ...glass(P, true), padding: '44px 46px 50px', opacity: card, transform: `translateY(${(1 - card) * 80}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30 }}>
            <span style={{ padding: '8px 22px', borderRadius: 999, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, fontFamily: FONT, fontWeight: 700, fontSize: 30, color: P.onA, letterSpacing: 2 }}>NEW</span>
            {scene.tag && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: P.a }}>{clean(scene.tag)}</span>}
          </div>
          <Words text={scene.headline} delay={8} color={P.ink} style={{ fontSize: fitSize(scene.headline, 76), fontWeight: 700, lineHeight: 1.3 }} />
          {scene.text && (
            <div style={{ marginTop: 34, paddingTop: 30, borderTop: `2px solid ${tint(P.a, 0.25)}`, opacity: why, transform: `translateY(${(1 - why) * 20}px)` }}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ flex: 'none', marginTop: 4 }}>
                  <Icon name="Lightbulb" size={48} color={P.a} stroke={2.2} />
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, 46), color: P.sub, lineHeight: 1.45 }}>{clean(scene.text)}</div>
              </div>
            </div>
          )}
        </div>
        {/* a live AI signal under the card */}
        <div style={{ margin: '60px 90px 0', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: card }}>
          {[...Array(30)].map((_, i) => {
            const h = 18 + 120 * Math.abs(Math.sin((frame + i * 7) / 9) * Math.sin((frame * 0.7 + i * 3) / 17))
            return <div key={i} style={{ width: 12, height: h, borderRadius: 6, background: `linear-gradient(180deg, ${P.a}, ${P.b})`, opacity: 0.85 }} />
          })}
        </div>
        {/* the news ticker */}
        <div style={{ position: 'relative', marginTop: 50, height: 70, background: tint(P.a, 0.12), borderTop: `2px solid ${tint(P.a, 0.4)}`, borderBottom: `2px solid ${tint(P.a, 0.4)}`, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 12, left: -((frame * 6) % 900), whiteSpace: 'nowrap', fontFamily: FONT, fontWeight: 700, fontSize: 34, color: P.a, letterSpacing: 3 }}>
            {(tick + 'AI NEWS  •  ').repeat(10)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
  }
}

// ── POV (pov) ──────────────────────────────────────────────────────────────
function makeNotify(P) {
  return function AiNotify({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const notes = (scene.notes || []).slice(0, 4)
  const phone = spring({ frame, fps, config: { damping: 15 } })
  const gap = Math.max(10, Math.min(28, Math.round((durationInFrames * 0.6) / Math.max(1, notes.length))))
  const shown = notes.filter((_, i) => frame >= 12 + i * gap).length
  const shake = shown ? Math.sin(frame * 2.4) * Math.max(0, 6 - (frame - 12 - (shown - 1) * gap) / 2) : 0
  return (
    <AbsoluteFill>
      <AiBg P={P} />
      {scene.title && (
        <div style={{ position: 'absolute', top: 250, left: 64, right: 64 }}>
          <Words text={scene.title} align="center" color={P.ink} style={{ fontSize: fitSize(scene.title, 70), fontWeight: 700, textAlign: 'center' }} />
        </div>
      )}
      <div style={{ ...center, top: scene.title ? 440 : 360 }}>
        <div
          style={{
            position: 'relative',
            width: 640,
            height: 940,
            borderRadius: 80,
            border: '14px solid #1F1A2E',
            background: `linear-gradient(170deg, ${tint(P.a, 0.35)}, ${tint(P.b, 0.25)} 60%, #120B22)`,
            boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 80px ${tint(P.a, 0.25)}`,
            transform: `translateY(${(1 - phone) * 200}px) rotate(${shake * 0.4}deg)`,
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 18, left: 230, width: 152, height: 40, borderRadius: 20, background: '#0A0614' }} />
          <div style={{ position: 'absolute', top: 96, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontWeight: 300, fontSize: 130, color: ON, letterSpacing: -2 }}>
            {clean(scene.time) || '23:47'}
          </div>
          <div style={{ position: 'absolute', top: 290, left: 26, right: 26, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {notes.map((n, i) => {
              const s = spring({ frame: frame - 12 - i * gap, fps, config: { damping: 13 } })
              return (
                <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '20px 22px', borderRadius: 34, background: 'rgba(255,255,255,0.88)', opacity: s, transform: `translateY(${(1 - s) * -60}px) scale(${0.9 + 0.1 * s})` }}>
                  <div style={{ flex: 'none', width: 74, height: 74, borderRadius: 20, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center' }}>
                    <Icon name={['MessageCircle', 'Bell', 'Mail', 'MessagesSquare'][i % 4]} size={42} color={ON} stroke={2.2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, color: '#4B3F63' }}>{clean(n.app) || 'Messenger'}</div>
                    <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: fitSize(n.text, 36), color: '#151022', lineHeight: 1.3 }}>{clean(n.text)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* the unread badge, counting up as they land */}
      {shown > 0 && (
        <div style={{ position: 'absolute', top: (scene.title ? 440 : 360) - 34, left: 790, width: 110, height: 110, borderRadius: 55, background: '#F43F5E', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 54, color: ON, boxShadow: '0 10px 40px rgba(244,63,94,0.6)', transform: `scale(${1 + 0.15 * Math.max(0, Math.sin(frame / 3))})` }}>
          {shown * 9 + 3}
        </div>
      )}
    </AbsoluteFill>
  )
  }
}

// ── Product demo (demo) ────────────────────────────────────────────────────
function makeStep(P) {
  return function AiStep({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const win = spring({ frame, fps, config: { damping: 15 } })
  const clickAt = Math.min(62, Math.round(durationInFrames * 0.45))
  // the pointer glides to the button, clicks, the result toast drops in
  const move = interpolate(frame, [18, clickAt - 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 })
  const press = interpolate(frame, [clickAt - 4, clickAt, clickAt + 6], [1, 0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ripple = interpolate(frame, [clickAt, clickAt + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const done = spring({ frame: frame - clickAt - 4, fps, config: { damping: 12 } })
  const W = 960
  return (
    <AbsoluteFill>
      <AiBg P={P} />
      <div style={{ position: 'absolute', top: 300, left: 60, width: W, height: 1000, ...glass(P, true), borderRadius: Math.round(44 * P.rad), overflow: 'hidden', opacity: win, transform: `translateY(${(1 - win) * 90}px) scale(${0.95 + 0.05 * win})` }}>
        {/* title bar */}
        <div style={{ height: 84, display: 'flex', alignItems: 'center', gap: 14, padding: '0 30px', background: P.faint, borderBottom: `2px solid ${tint(P.a, 0.18)}` }}>
          {['#F87171', '#FBBF24', '#34D399'].map((c) => (
            <span key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c }} />
          ))}
          <div style={{ marginLeft: 24, flex: 1, height: 46, borderRadius: 23, background: P.faint, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', fontFamily: FONT, fontSize: 28, color: P.sub }}>
            <Icon name="Lock" size={24} color={P.sub} stroke={2.2} />
            {clean(brand.name).toLowerCase().replace(/\s+/g, '')}.app
          </div>
        </div>
        <div style={{ display: 'flex', height: 916 }}>
          {/* sidebar */}
          <div style={{ width: 120, padding: '36px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34, borderRight: `2px solid ${tint(P.a, 0.12)}` }}>
            {['LayoutDashboard', 'MessageCircle', 'ChartColumn', 'Users', 'Workflow'].map((n, i) => (
              <div key={n} style={{ width: 72, height: 72, borderRadius: 22, display: 'grid', placeItems: 'center', background: i === 0 ? tint(P.a, 0.22) : 'transparent' }}>
                <Icon name={n} size={38} color={i === 0 ? P.a : P.sub} stroke={2.2} />
              </div>
            ))}
          </div>
          {/* main */}
          <div style={{ flex: 1, padding: '44px 44px 0', position: 'relative' }}>
            <div style={{ display: 'inline-block', padding: '8px 22px', borderRadius: 999, background: tint(P.a, 0.16), border: `2px solid ${tint(P.a, 0.45)}`, fontFamily: FONT, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: P.a }}>
              STEP {scene.n || 1}
            </div>
            <div style={{ marginTop: 26 }}>
              <Words text={scene.title} delay={6} color={P.ink} style={{ fontSize: fitSize(scene.title, 66), fontWeight: 700, lineHeight: 1.25 }} />
            </div>
            {scene.text && <div style={{ marginTop: 18, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, 40), color: P.sub, lineHeight: 1.45, opacity: interpolate(frame, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{clean(scene.text)}</div>}
            {/* the feature card with its button */}
            <div style={{ position: 'absolute', left: 44, right: 44, top: 430, borderRadius: 34, padding: '34px 34px', background: P.faint, border: `2px solid ${tint(P.a, 0.25)}`, display: 'flex', alignItems: 'center', gap: 28 }}>
              <div style={{ flex: 'none', width: 120, height: 120, borderRadius: 34, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', boxShadow: `0 10px 40px ${tint(P.a, 0.45)}` }}>
                <Icon name={scene.icon || 'Zap'} size={64} color={ON} stroke={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 22, width: '80%', borderRadius: 11, background: P.faint2 }} />
                <div style={{ height: 22, width: '55%', borderRadius: 11, background: P.faint, marginTop: 16 }} />
              </div>
              <div style={{ position: 'relative', flex: 'none', padding: '20px 34px', borderRadius: 999, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, fontFamily: FONT, fontWeight: 700, fontSize: 34, color: P.onA, transform: `scale(${press})` }}>
                <Icon name="Play" size={34} color={P.onA} stroke={3} />
                <span
                  style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `4px solid ${P.a}`, transform: `scale(${1 + ripple * 0.8})`, opacity: ripple ? 1 - ripple : 0 }}
                />
              </div>
            </div>
            {/* the result toast */}
            {scene.result && (
              <div style={{ position: 'absolute', left: 44, right: 44, top: 670, display: 'flex', alignItems: 'center', gap: 20, padding: '24px 30px', borderRadius: 30, background: 'rgba(16,185,129,0.16)', border: '2px solid rgba(52,211,153,0.6)', opacity: done, transform: `translateY(${(1 - done) * 40}px)` }}>
                <Icon name="CircleCheck" size={52} color="#34D399" stroke={2.6} />
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.result, 42), color: P.ink }}>{clean(scene.result)}</div>
              </div>
            )}
            {/* the pointer */}
            <div style={{ position: 'absolute', left: interpolate(move, [0, 1], [560, 708]), top: interpolate(move, [0, 1], [880, 528]), transform: `scale(${press})`, opacity: interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
              <Icon name="MousePointer2" size={84} color={P.ink} stroke={2} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
  }
}

// ── Offer (offer) ──────────────────────────────────────────────────────────
function makeOffer(P) {
  return function AiOffer({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const card = spring({ frame, fps, config: { damping: 14 } })
  const price = spring({ frame: frame - 14, fps, config: { damping: 9 } })
  const strike = interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const features = (scene.features || []).slice(0, 4)
  const top = scene.image ? 300 : 400
  return (
    <AbsoluteFill>
      <AiBg P={P} />
      <div style={{ position: 'absolute', top, left: 80, right: 80, opacity: card, transform: `translateY(${(1 - card) * 90}px)` }}>
        {/* a glowing gradient border, turning */}
        <div style={{ position: 'absolute', inset: -4, borderRadius: 48, background: `conic-gradient(from ${frame * 3}deg, ${P.a}, ${P.b}, ${P.a}, transparent 70%, ${P.a})`, boxShadow: `0 0 90px ${tint(P.a, 0.35)}` }} />
        <div style={{ position: 'relative', borderRadius: 44, background: P.card, padding: '44px 50px 50px', textAlign: 'center' }}>
          {scene.badge && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 26px', borderRadius: 999, background: `linear-gradient(135deg, ${P.b}, #F59E0B)`, fontFamily: FONT, fontWeight: 700, fontSize: 30, color: '#1A1200' }}>
              <Icon name="Crown" size={30} color="#1A1200" stroke={2.4} />
              {clean(scene.badge)}
            </div>
          )}
          {scene.image && (
            <div style={{ margin: '28px auto 0', width: 260, height: 260, borderRadius: 40, overflow: 'hidden', border: `3px solid ${tint(P.a, 0.4)}` }}>
              <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          {scene.plan && <div style={{ marginTop: 26, fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.plan, 54), color: P.ink }}>{clean(scene.plan)}</div>}
          {scene.price && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 18, transform: `scale(${price})` }}>
              {scene.was && (
                <span style={{ position: 'relative', fontFamily: FONT, fontWeight: 600, fontSize: 64, color: P.sub }}>
                  {clean(scene.was)}
                  <span style={{ position: 'absolute', left: -4, right: -4, top: '52%', height: 6, borderRadius: 3, background: '#F43F5E', transform: `scaleX(${strike})`, transformOrigin: 'left' }} />
                </span>
              )}
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.price, 170), letterSpacing: -3, ...gradientText(P) }}>{clean(scene.price)}</span>
              {scene.period && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 44, color: P.sub }}>{clean(scene.period)}</span>}
            </div>
          )}
          <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'left' }}>
            {features.map((f, i) => {
              const s = spring({ frame: frame - 30 - i * 10, fps, config: { damping: 13 } })
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: s, transform: `translateX(${(1 - s) * 60}px)` }}>
                  <div style={{ flex: 'none', width: 56, height: 56, borderRadius: 28, background: tint(P.a, 0.18), display: 'grid', placeItems: 'center' }}>
                    <Icon name="Check" size={36} color={P.a} stroke={3} />
                  </div>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: fitSize(f, 46), color: P.ink, lineHeight: 1.3 }}>{clean(f)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
  }
}

// ── Your screenshot (custom) ───────────────────────────────────────────────
/** The brand's real screenshot in a window (a phone frame when it's tall):
 * the camera zooms to `focus`, the rest dims, a pointer clicks it (action
 * "click") and the result pops — or it's only lit up ("highlight") / zoomed
 * ("zoom"). No focus = a slow push-in on the whole screen. */
function makeScreen(P) {
  return function AiScreen({ scene }) {
    const frame = useCurrentFrame()
    const { fps, durationInFrames } = useVideoConfig()
    const win = spring({ frame, fps, config: { damping: 15 } })
    const iw = scene.imgW || 1600
    const ih = scene.imgH || 1000
    const phone = ih > iw * 1.25
    const area = scene.title ? (scene.text ? 540 : 470) : 300 // below the title, above the subtitles
    const bar = phone ? 0 : 64
    const fit = Math.min((phone ? 620 : 980) / iw, (1430 - area - bar) / ih)
    const W = Math.round(iw * fit)
    const H = Math.round(ih * fit)
    const top = area + Math.round((1430 - area - bar - H) * 0.4)
    const f = Array.isArray(scene.focus) && scene.focus.length === 4 ? scene.focus : null
    const action = f ? scene.action || 'click' : 'zoom'
    const clickAt = Math.min(78, Math.round(durationInFrames * 0.55))
    const p = interpolate(frame, [16, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) })
    // the zoom: the focus box's centre to the window's centre, edges kept inside
    let z = 1
    let tx = 0
    let ty = 0
    let box = null
    if (f) {
      box = { x: f[0] * W, y: f[1] * H, w: Math.max(8, f[2] * W), h: Math.max(8, f[3] * H) }
      z = Math.max(1.15, Math.min(2.1, (0.42 * W) / box.w, (0.42 * H) / box.h))
      const cx = box.x + box.w / 2
      const cy = box.y + box.h / 2
      tx = Math.min(0, Math.max(W - W * z, W / 2 - cx * z))
      ty = Math.min(0, Math.max(H - H * z, H / 2 - cy * z))
    }
    const sNow = f ? 1 + (z - 1) * p : interpolate(frame, [0, durationInFrames], [1, 1.08])
    const txNow = f ? tx * p : (W - W * sNow) / 2
    const tyNow = f ? ty * p : (H - H * sNow) / 2
    const lit = interpolate(frame, [42, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    // the pointer, in window coordinates: from the lower right to the focus centre
    const target = box ? { x: (box.x + box.w / 2) * z + tx, y: (box.y + box.h / 2) * z + ty } : null
    const move = interpolate(frame, [46, clickAt - 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 })
    const press = interpolate(frame, [clickAt - 4, clickAt, clickAt + 6], [1, 0.88, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const ripple = interpolate(frame, [clickAt, clickAt + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const done = spring({ frame: frame - (action === 'click' ? clickAt + 4 : 58), fps, config: { damping: 12 } })
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', top: 250, left: 64, right: 64 }}>
            <Words text={scene.title} align="center" color={P.ink} style={{ fontSize: fitSize(scene.title, 70), fontWeight: 700, textAlign: 'center', lineHeight: 1.25 }} />
            {scene.text && (
              <div style={{ marginTop: 14, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, 40), color: P.sub, opacity: interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
                {clean(scene.text)}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top,
            left: (1080 - W) / 2 - (phone ? 14 : 0),
            borderRadius: phone ? 64 : Math.round(34 * P.rad),
            border: phone ? '14px solid #11131A' : `2px solid ${tint(P.a, 0.35)}`,
            background: P.card,
            boxShadow: `${P.shadow}, 0 0 80px ${tint(P.a, 0.18)}`,
            overflow: 'hidden',
            opacity: win,
            transform: `translateY(${(1 - win) * 90}px) scale(${0.94 + 0.06 * win})`,
          }}
        >
          {!phone && (
            <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', background: P.faint, borderBottom: `2px solid ${tint(P.a, 0.15)}` }}>
              {['#F87171', '#FBBF24', '#34D399'].map((c) => (
                <span key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
              ))}
            </div>
          )}
          <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${txNow}px, ${tyNow}px) scale(${sNow})` }}>
              <Img src={srcOf(scene.image)} style={{ width: W, height: H, display: 'block' }} />
              {box && (
                <div
                  style={{
                    position: 'absolute',
                    left: box.x - 8,
                    top: box.y - 8,
                    width: box.w + 16,
                    height: box.h + 16,
                    borderRadius: 14,
                    border: `${5 / z}px solid ${P.a}`,
                    boxShadow: `0 0 0 4000px rgba(5,8,20,${0.5 * lit}), 0 0 ${30 / z}px ${tint(P.a, 0.8 * lit)}`,
                    opacity: lit,
                  }}
                />
              )}
            </div>
            {action === 'click' && target && (
              <>
                <span
                  style={{ position: 'absolute', left: target.x - 40, top: target.y - 40, width: 80, height: 80, borderRadius: 40, border: `5px solid ${P.a}`, transform: `scale(${0.4 + ripple * 1.4})`, opacity: ripple ? 1 - ripple : 0 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: interpolate(move, [0, 1], [W * 0.82, target.x - 6]),
                    top: interpolate(move, [0, 1], [H * 0.98, target.y - 4]),
                    transform: `scale(${press})`,
                    opacity: interpolate(frame, [40, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
                  }}
                >
                  <Icon name="MousePointer2" size={76} color="#FFFFFF" stroke={2} />
                </div>
              </>
            )}
            {scene.result && action !== 'zoom' && (
              <div style={{ position: 'absolute', left: 24, right: 24, ...(target && target.y > H * 0.55 ? { top: 24 } : { bottom: 24 }), display: 'flex', alignItems: 'center', gap: 18, padding: '20px 26px', borderRadius: 26, background: 'rgba(6,78,59,0.92)', border: '2px solid rgba(52,211,153,0.7)', opacity: done, transform: `translateY(${(1 - done) * (target && target.y > H * 0.55 ? -40 : 40)}px)` }}>
                <Icon name="CircleCheck" size={46} color="#34D399" stroke={2.6} />
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.result, 38), color: '#FFFFFF' }}>{clean(scene.result)}</div>
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

// ── Live dashboard (custom, demo) ──────────────────────────────────────────
/** The product's dashboard: KPI cards counting up with a green change chip,
 * and a chart drawing itself — sample data of a demo account, so the
 * template never prints a claim. Script: { type: "dashboard", title?,
 * metrics: [{ label, value, prefix?, suffix?, delta? }], chart?: "line" | "bars" }. */
const SAMPLE_TREND = [0.18, 0.24, 0.21, 0.33, 0.3, 0.42, 0.48, 0.45, 0.6, 0.66, 0.74, 0.86]

function makeDashboard(P) {
  return function AiDashboard({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const win = spring({ frame, fps, config: { damping: 15 } })
    const metrics = (scene.metrics || []).slice(0, 3)
    const count = interpolate(frame, [12, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 })
    const draw = interpolate(frame, [20, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 2 })
    const CW = 840
    const CH = 360
    const pts = SAMPLE_TREND.map((v, i) => [(i / (SAMPLE_TREND.length - 1)) * CW, CH - v * CH * 0.92])
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${CW},${CH} L0,${CH} Z`
    const shown = Math.max(1, Math.round(draw * (SAMPLE_TREND.length - 1)))
    const [hx, hy] = pts[shown]
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', top: 250, left: 64, right: 64 }}>
            <Words text={scene.title} align="center" color={P.ink} style={{ fontSize: fitSize(scene.title, 70), fontWeight: 700, textAlign: 'center' }} />
          </div>
        )}
        <div style={{ position: 'absolute', top: scene.title ? 440 : 340, left: 60, width: 960, ...glass(P, true), borderRadius: Math.round(44 * P.rad), padding: '34px 40px 40px', opacity: win, transform: `translateY(${(1 - win) * 90}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <Icon name="LayoutDashboard" size={34} color={P.a} stroke={2.2} />
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: P.ink }}>{clean(brand.name)}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#10B981', letterSpacing: 2 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: '#10B981', opacity: 0.5 + 0.5 * Math.sin(frame / 5) }} />
              LIVE
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {metrics.map((m, i) => {
              const s = spring({ frame: frame - 10 - i * 8, fps, config: { damping: 13 } })
              const v = Number(m.value) || 0
              const now = v * count
              const digits = Number.isInteger(v) ? Math.round(now).toLocaleString('en-US') : now.toFixed(1)
              return (
                <div key={i} style={{ flex: 1, minWidth: 0, borderRadius: Math.round(28 * P.rad), padding: '22px 24px', background: P.faint, border: `2px solid ${tint(P.a, 0.2)}`, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 24, color: P.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(m.label)}</div>
                  <div style={{ marginTop: 6, fontFamily: FONT, fontWeight: 700, fontSize: metrics.length > 2 ? 58 : 72, color: P.ink, letterSpacing: -1 }}>
                    {m.prefix || ''}
                    {digits}
                    {m.suffix || ''}
                  </div>
                  {m.delta && (
                    <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#10B981', opacity: count }}>
                      <Icon name={String(m.delta).trim().startsWith('-') ? 'TrendingDown' : 'TrendingUp'} size={22} color="#10B981" stroke={2.6} />
                      {clean(m.delta)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 34, position: 'relative', height: CH }}>
            <svg width={CW} height={CH} style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={P.a} stopOpacity="0.35" />
                  <stop offset="1" stopColor={P.a} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="dash-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor={P.b} />
                  <stop offset="1" stopColor={P.a} />
                </linearGradient>
                <clipPath id="dash-clip">
                  <rect x="0" y="-20" width={CW * draw} height={CH + 40} />
                </clipPath>
              </defs>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2={CW} y1={CH * g} y2={CH * g} stroke={P.faint2} strokeWidth="2" strokeDasharray="6 10" />
              ))}
              {scene.chart === 'bars' ? (
                SAMPLE_TREND.map((v, i) => {
                  const grow = interpolate(frame, [20 + i * 3, 34 + i * 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
                  const bw = CW / SAMPLE_TREND.length - 14
                  return <rect key={i} x={i * (CW / SAMPLE_TREND.length) + 7} y={CH - v * CH * 0.92 * grow} width={bw} height={v * CH * 0.92 * grow} rx="10" fill="url(#dash-line)" opacity={0.55 + 0.45 * (i / SAMPLE_TREND.length)} />
                })
              ) : (
                <g clipPath="url(#dash-clip)">
                  <path d={area} fill="url(#dash-area)" />
                  <path d={line} fill="none" stroke="url(#dash-line)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
              {scene.chart !== 'bars' && draw > 0.05 && <circle cx={hx} cy={hy} r="14" fill={P.a} stroke={P.card} strokeWidth="5" />}
            </svg>
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

// ── Automation flow (custom, demo) ─────────────────────────────────────────
/** How the work moves: 3-4 steps (apps / actions) stacked and joined, each
 * lighting up in turn as a pulse of data runs down the line, the last one
 * ticked. Script: { type: "flow", title?, nodes: [{ icon, label, sub? }] }. */
function makeFlow(P) {
  return function AiFlow({ scene }) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const nodes = (scene.nodes || []).slice(0, 4)
    const n = nodes.length
    const top = scene.title ? 470 : 360
    const gapY = n > 3 ? 230 : 280
    const STEP = 16
    return (
      <AbsoluteFill>
        <AiBg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', top: 250, left: 64, right: 64 }}>
            <Words text={scene.title} align="center" color={P.ink} style={{ fontSize: fitSize(scene.title, 70), fontWeight: 700, textAlign: 'center' }} />
          </div>
        )}
        {/* the line between the steps, with data pulses running down it */}
        {nodes.slice(1).map((_, i) => {
          const y0 = top + i * gapY + 150
          const len = gapY - 150
          const lit = interpolate(frame, [12 + (i + 1) * STEP - 10, 12 + (i + 1) * STEP], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          return (
            <div key={i} style={{ position: 'absolute', left: 538, top: y0, width: 6, height: len, borderRadius: 3, background: P.faint2, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: `${lit * 100}%`, background: `linear-gradient(180deg, ${P.b}, ${P.a})` }} />
              {lit >= 1 &&
                [0, 0.5].map((o) => (
                  <div key={o} style={{ position: 'absolute', left: -5, top: `${(((frame / 30 + o) % 1) * 100).toFixed(1)}%`, width: 16, height: 16, borderRadius: 8, background: P.a, boxShadow: `0 0 16px ${P.a}` }} />
                ))}
            </div>
          )
        })}
        {nodes.map((node, i) => {
          const s = spring({ frame: frame - 12 - i * STEP, fps, config: { damping: 13 } })
          const last = i === n - 1
          const tick = spring({ frame: frame - 12 - n * STEP, fps, config: { damping: 10 } })
          return (
            <div key={i} style={{ position: 'absolute', top: top + i * gapY, left: 150, right: 150, ...glass(P, true), borderRadius: Math.round(34 * P.rad), padding: '26px 30px', display: 'flex', alignItems: 'center', gap: 26, opacity: s, transform: `scale(${0.9 + 0.1 * s})`, boxShadow: last && tick > 0.5 ? `${P.shadow}, 0 0 60px ${tint(P.a, 0.35)}` : P.shadow }}>
              <div style={{ flex: 'none', width: 96, height: 96, borderRadius: 28, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center' }}>
                <Icon name={node.icon || 'Zap'} size={52} color={ON} stroke={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(node.label, 46), color: P.ink, lineHeight: 1.25 }}>{clean(node.label)}</div>
                {node.sub && <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 30, color: P.sub }}>{clean(node.sub)}</div>}
              </div>
              {last && (
                <div style={{ flex: 'none', transform: `scale(${tick})` }}>
                  <Icon name="CircleCheck" size={60} color="#10B981" stroke={2.6} />
                </div>
              )}
            </div>
          )
        })}
      </AbsoluteFill>
    )
  }
}

function template(P, id, own) {
  return {
    scenes: { hook: makeHook(P, id), list: makeList(P), stat: makeStat(P), reveal: makeReveal(P), cta: makeCta(P), ...own },
    root: { backgroundColor: P.bg, '--hl-bg': P.a, '--hl-text': P.onA },
    light: P.light,
    captionTop: 1480,
  }
}

export const TREND = template(PALETTES.trend, 'trend', { news: makeNews(PALETTES.trend) })
export const POV = template(PALETTES.pov, 'pov', { notify: makeNotify(PALETTES.pov) })
export const DEMO = template(PALETTES.demo, 'demo', { step: makeStep(PALETTES.demo), screen: makeScreen(PALETTES.demo), dashboard: makeDashboard(PALETTES.demo), flow: makeFlow(PALETTES.demo) })
export const OFFER = template(PALETTES.offer, 'offer', { offer: makeOffer(PALETTES.offer) })

/** "Designed for you": the look the AI picked for this video (props.look). */
export function customTemplate(look = {}) {
  const P = palette({ bg: '#0A0F1F', a: '#6366F1', b: '#22D3EE', mode: 'dark', ...look })
  return template(P, 'custom', { news: makeNews(P), notify: makeNotify(P), step: makeStep(P), offer: makeOffer(P), screen: makeScreen(P), dashboard: makeDashboard(P), flow: makeFlow(P) })
}
