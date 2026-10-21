/**
 * "3D · App demo" — a mobile-app promo in soft, glassy 3D: the app's screens as
 * layered cards fanned in space, a tilted phone floating with the app on it,
 * a glass bubble, soft silk colours from the brand and a big headline at the
 * bottom. After the look of the bank-app ads the user liked (2026-10-21) — an
 * original design, in the brand's own colour and with the brand's own
 * screenshots (Products → Brand kit).
 *
 * Pure CSS 3D (perspective + rotate + translateZ) — no WebGL, so it renders as
 * fast as any other template and Khmer text on the cards is always right.
 *
 * Scenes (app/motion.py APPDEMO_PROMPT) — the same types Clarity / Offer use:
 *   { type: "hook",     text, icon?, image? }                 the phone flies in over layered pages; the headline lands
 *   { type: "list",     title, items: [{ icon, text }] }      the app's features as glass cards fanned in 3D
 *   { type: "platform", text, image? }                        the phone, big, turning slowly with a screenshot on it
 *   { type: "stat",     value, prefix, suffix, label, icon }  one number on a tilted glass card
 *   { type: "cta",      text, button, image? }                the phone small, the logo and a button
 * No screenshot → the phone shows a drawn app screen in the brand colour.
 * 9:16 (a phone demo is tall).
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, clean, fitSize, srcOf, tint } from './shared'
import { Pop } from './cartoon'

const INK = '#0E2A2F'
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

/** "#E5452F" blended towards "#ffffff" by t (0..1). */
function mix(hex, to, t) {
  const rgb = (h) => {
    const s = String(h || '#1F4E8C').replace('#', '')
    const n = parseInt(s.length === 3 ? s.replace(/./g, '$&$&') : s, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = rgb(hex)
  const b = rgb(to)
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// The coloured top edge of each glass card: the brand, then friendly neighbours.
const EDGES = (c) => [c, '#27B07B', '#2E9BD6', '#F2B632']

function useU() {
  const { width, height, fps } = useVideoConfig()
  return { u: Math.min(width, height) / 1080, W: width, H: height, fps }
}

// ── the set ────────────────────────────────────────────────────────────────
/** Soft silk: brand-colour gradient, light streaks drifting, a glow. */
function Silk({ color, children }) {
  const frame = useCurrentFrame()
  const { u, W, H } = useU()
  const top = mix(color, '#ffffff', 0.7)
  const mid = mix(color, '#ffffff', 0.38)
  const bottom = mix(color, '#05201e', 0.22)
  const drift = (k, sp) => Math.sin(frame / sp + k) * 40 * u
  return (
    <AbsoluteFill style={{ background: `linear-gradient(168deg, ${top} 0%, ${mid} 48%, ${bottom} 100%)`, overflow: 'hidden' }}>
      {[
        { l: -0.2, t: 0.12, w: 1.5, h: 0.2, r: -14, o: 0.32, sp: 52, k: 0 },
        { l: -0.1, t: 0.4, w: 1.4, h: 0.16, r: -10, o: 0.22, sp: 61, k: 2 },
        { l: -0.3, t: 0.62, w: 1.6, h: 0.22, r: -18, o: 0.18, sp: 47, k: 4 },
      ].map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: W * b.l + drift(b.k, b.sp),
            top: H * b.t + drift(b.k + 1, b.sp * 1.3),
            width: W * b.w,
            height: H * b.h,
            borderRadius: '50%',
            background: `radial-gradient(ellipse at center, rgba(255,255,255,${b.o}) 0%, transparent 70%)`,
            transform: `rotate(${b.r}deg)`,
            filter: `blur(${22 * u}px)`,
          }}
        />
      ))}
      {children}
    </AbsoluteFill>
  )
}

/** A glass bubble that bobs (the ✦ of the reference ads). */
function Bubble({ x, y, size = 120, delay = 0, color }) {
  const frame = useCurrentFrame()
  const { u, fps } = useU()
  const s = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 12, mass: 0.7 } })
  return (
    <div
      style={{
        position: 'absolute',
        left: x * u - (size * u) / 2,
        top: y * u - (size * u) / 2 + Math.sin(frame / 16 + x) * 12 * u,
        width: size * u,
        height: size * u,
        borderRadius: '50%',
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 28%, ${tint(color, 0.35)} 70%, ${tint(color, 0.15)} 100%)`,
        border: `${2 * u}px solid rgba(255,255,255,0.7)`,
        boxShadow: `0 ${14 * u}px ${34 * u}px rgba(0,0,0,0.18), inset 0 -${10 * u}px ${18 * u}px rgba(255,255,255,0.35)`,
        transform: `scale(${s})`,
      }}
    />
  )
}

// ── the phone ──────────────────────────────────────────────────────────────
/** A drawn app screen (no words — shapes only) for a brand with no screenshot. */
function MockScreen({ color }) {
  const row = (n) => (
    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 22, background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
      <span style={{ width: 54, height: 54, borderRadius: 16, background: tint(color, 0.18), flex: 'none' }} />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ height: 14, width: `${70 - n * 12}%`, borderRadius: 9, background: '#D9DEE3' }} />
        <span style={{ height: 11, width: `${46 + n * 6}%`, borderRadius: 9, background: '#EBEEF1' }} />
      </span>
      <span style={{ width: 70, height: 16, borderRadius: 9, background: tint(color, 0.35) }} />
    </div>
  )
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F3F6F8', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '70px 24px 26px', background: `linear-gradient(180deg, ${color}, ${mix(color, '#ffffff', 0.45)})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,0.9)' }} />
          <span style={{ flex: 1, height: 52, borderRadius: 26, background: 'rgba(255,255,255,0.75)' }} />
          <span style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.6)' }} />
        </div>
        <div style={{ marginTop: 30, height: 22, width: '34%', borderRadius: 11, background: 'rgba(255,255,255,0.7)' }} />
        <div style={{ marginTop: 14, height: 46, width: '56%', borderRadius: 14, background: 'rgba(255,255,255,0.95)' }} />
      </div>
      <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[0, 1].map((n) => (
            <div key={n} style={{ flex: 1, height: 170, borderRadius: 26, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.07)', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ width: 52, height: 52, borderRadius: 16, background: tint(color, n ? 0.3 : 0.2) }} />
              <span style={{ height: 18, width: '70%', borderRadius: 10, background: '#D9DEE3' }} />
            </div>
          ))}
        </div>
        {[0, 1, 2].map(row)}
      </div>
      <div style={{ height: 120, background: '#fff', borderTop: '2px solid #ECEFF2', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 30px 18px' }}>
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} style={{ width: 46, height: 46, borderRadius: 14, background: n === 0 ? tint(color, 0.9) : '#E1E5E9' }} />
        ))}
      </div>
    </div>
  )
}

/** The phone: a silver body with real thickness (layers in depth), a black bezel and the screen. */
function Phone({ image, color, width = 470, style }) {
  const { u } = useU()
  const w = width * u
  const h = w * 2.04
  const r = w * 0.15
  const depth = Array.from({ length: 9 }, (_, i) => i + 1)
  return (
    <div style={{ position: 'absolute', width: w, height: h, transformStyle: 'preserve-3d', ...style }}>
      {/* the soft shadow on the "floor" */}
      <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: -h * 0.045, height: h * 0.05, borderRadius: '50%', background: 'rgba(0,0,0,0.28)', filter: `blur(${22 * u}px)`, transform: 'translateZ(-40px)' }} />
      {/* the body's edge — layers one behind another */}
      {depth.map((i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: r, background: `linear-gradient(135deg, #F4F6F8, #AEB6BE ${50 + i * 3}%, #7D858D)`, transform: `translateZ(${-i * 2.6 * u}px)` }} />
      ))}
      {/* the front: bezel + screen */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: r, background: '#0B0D10', padding: w * 0.028, boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,0.35)`, border: `${3 * u}px solid #D4D9DE` }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: r * 0.82, overflow: 'hidden', background: '#fff' }}>
          {image ? <Img src={srcOf(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : <MockScreen color={color} />}
          {/* the notch */}
          <span style={{ position: 'absolute', top: w * 0.03, left: '50%', width: w * 0.22, height: w * 0.055, marginLeft: -w * 0.11, borderRadius: 99, background: '#0B0D10' }} />
          {/* a soft reflection across the glass */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 32%, transparent 52%)' }} />
        </div>
      </div>
    </div>
  )
}

/** The thin pages stacked behind the phone (the app's other screens). */
function Pages({ color, width = 470, count = 3, shown = 1 }) {
  const { u } = useU()
  const w = width * u
  const h = w * 2.04
  return Array.from({ length: count }, (_, i) => {
    const k = i + 1
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          width: w,
          height: h,
          borderRadius: w * 0.15,
          background: `linear-gradient(90deg, ${mix(color, '#27B07B', 0.35 * k * 0.5)} 0, ${mix(color, '#ffffff', 0.2)} ${14 * u}px, rgba(255,255,255,0.62) ${14 * u}px)`,
          border: `${2 * u}px solid rgba(255,255,255,0.7)`,
          boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,0.12)`,
          opacity: shown * (0.9 - k * 0.2),
          transform: `translate3d(${-k * 78 * u * shown}px, ${k * 14 * u * shown}px, ${-k * 120 * u}px)`,
        }}
      />
    )
  })
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Headline({ text, top, size = 104, delay = 0.5, align = 'center', color = '#FFFFFF', accent = '#FFE27A', width }) {
  const { u, W } = useU()
  if (!text) return null
  const wd = (width || 940) * u
  return (
    <div style={{ position: 'absolute', left: (W - wd) / 2, top: top * u, width: wd, display: 'flex', justifyContent: align === 'left' ? 'flex-start' : 'center', textShadow: '0 4px 26px rgba(0,0,0,0.28)' }}>
      <Pop text={text} size={size * u} width={wd} delay={delay} color={color} accent={accent} align={align} step={2} />
    </div>
  )
}

function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, W, fps } = useU()
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.9 } })
  const turn = -22 + Math.sin(frame / 34) * 4
  const w = 520
  return (
    <Silk color={brand.color}>
      <div style={{ position: 'absolute', inset: 0, perspective: 2600 * u, perspectiveOrigin: '50% 40%' }}>
        <div
          style={{
            position: 'absolute',
            left: (W - w * u) / 2 + 24 * u,
            top: 150 * u,
            width: w * u,
            height: w * 2.04 * u,
            transformStyle: 'preserve-3d',
            transform: `translateY(${(1 - s) * 520 * u + Math.sin(frame / 20) * 9 * u}px) rotateX(${8}deg) rotateY(${-70 + (turn + 70) * s}deg) rotateZ(${-4}deg)`,
          }}
        >
          <Pages color={brand.color} width={w} shown={s} />
          <Phone image={scene.image} color={brand.color} width={w} />
        </div>
      </div>
      <Bubble x={900} y={1010} size={130} delay={0.8} color={brand.color} />
      <Bubble x={150} y={520} size={70} delay={1.1} color={brand.color} />
      <Headline text={scene.text} top={1330} />
    </Silk>
  )
}

function List({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, W, fps } = useU()
  const items = (scene.items || []).slice(0, 4)
  const edges = EDGES(brand.color)
  return (
    <Silk color={brand.color}>
      <div style={{ position: 'absolute', left: (W - 940 * u) / 2, top: 270 * u, width: 940 * u, display: 'flex', justifyContent: 'center' }}>
        <Pop text={scene.title} size={84 * u} width={940 * u} delay={0.1} color={INK} accent={mix(brand.color, '#000000', 0.15)} step={2} />
      </div>
      <div style={{ position: 'absolute', inset: 0, perspective: 2200 * u, perspectiveOrigin: '30% 40%' }}>
        <div style={{ position: 'absolute', left: 150 * u, top: 580 * u, width: 700 * u, height: 1000 * u, transformStyle: 'preserve-3d', transform: 'rotateX(10deg) rotateY(-24deg) rotateZ(-7deg)' }}>
          {items.map((it, i) => {
            const t = spring({ frame: frame - Math.round((0.35 + i * 0.3) * fps), fps, config: { damping: 13, mass: 0.7 } })
            const idx = i // later cards sit in front and lower
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: idx * 46 * u,
                  top: idx * 200 * u,
                  width: 660 * u,
                  height: 250 * u,
                  borderRadius: 40 * u,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.78))',
                  border: `${3 * u}px solid rgba(255,255,255,0.9)`,
                  boxShadow: `0 ${26 * u}px ${60 * u}px rgba(0,0,0,0.2)`,
                  overflow: 'hidden',
                  transform: `translateZ(${idx * 60 * u}px) translate3d(${(1 - t) * 420 * u}px, ${(1 - t) * 80 * u}px, 0) rotateY(${(1 - t) * 40}deg)`,
                  opacity: Math.min(1, t * 1.6),
                }}
              >
                <div style={{ height: 22 * u, background: `linear-gradient(90deg, ${edges[i % 4]}, ${mix(edges[i % 4], '#ffffff', 0.4)})` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 30 * u, padding: `${28 * u}px ${40 * u}px` }}>
                  <span style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 110 * u, height: 110 * u, borderRadius: 34 * u, background: tint(edges[i % 4], 0.16) }}>
                    <Icon name={it.icon || 'Sparkles'} size={58 * u} color={edges[i % 4]} stroke={2.2} />
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT, fontWeight: 800, fontSize: fitSize(it.text, 50 * u), color: INK, lineHeight: 1.45 }}>{clean(it.text)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <Bubble x={900} y={1330} size={110} delay={1.2} color={brand.color} />
    </Silk>
  )
}

function Platform({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, W, fps, H } = useU()
  const { durationInFrames } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.9 } })
  const turn = interpolate(frame, [0, durationInFrames], [-30, 12], clamp)
  const w = 600
  return (
    <Silk color={brand.color}>
      <div style={{ position: 'absolute', inset: 0, perspective: 2600 * u, perspectiveOrigin: '50% 40%' }}>
        <div
          style={{
            position: 'absolute',
            left: (W - w * u) / 2,
            top: 90 * u,
            width: w * u,
            height: w * 2.04 * u,
            transformStyle: 'preserve-3d',
            transform: `translateY(${(1 - s) * 400 * u + Math.sin(frame / 22) * 8 * u}px) rotateX(6deg) rotateY(${turn}deg) rotateZ(-2deg) scale(${0.9 + 0.1 * s})`,
          }}
        >
          <Phone image={scene.image} color={brand.color} width={w} />
        </div>
      </div>
      <Bubble x={930} y={620} size={90} delay={0.6} color={brand.color} />
      <Headline text={scene.text} top={H * 0.76} size={92} />
    </Silk>
  )
}

function Stat({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, W, H, fps } = useU()
  const value = Number(String(scene.value ?? '').replace(/[^\d.]/g, '')) || 0
  const decimals = (String(scene.value).split('.')[1] || '').length
  const n = interpolate(frame, [0.4 * fps, 1.9 * fps], [0, value], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const shown = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const s = spring({ frame, fps, config: { damping: 14 } })
  return (
    <Silk color={brand.color}>
      <div style={{ position: 'absolute', inset: 0, perspective: 2400 * u, perspectiveOrigin: '50% 45%' }}>
        <div
          style={{
            position: 'absolute',
            left: (W - 820 * u) / 2,
            top: H * 0.3,
            width: 820 * u,
            padding: `${70 * u}px ${50 * u}px`,
            borderRadius: 60 * u,
            textAlign: 'center',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(255,255,255,0.7))',
            border: `${3 * u}px solid rgba(255,255,255,0.9)`,
            boxShadow: `0 ${40 * u}px ${90 * u}px rgba(0,0,0,0.22)`,
            fontFamily: FONT,
            transform: `translateY(${(1 - s) * 300 * u}px) rotateX(9deg) rotateY(${-14 + (1 - s) * 40}deg) rotateZ(-3deg)`,
            opacity: Math.min(1, s * 1.5),
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 190 * u, lineHeight: 1.1, letterSpacing: '-0.03em', color: brand.color }}>
            {clean(scene.prefix)}
            {shown}
            {clean(scene.suffix)}
          </div>
          <div style={{ marginTop: 14 * u, fontWeight: 700, fontSize: fitSize(scene.label, 56 * u), lineHeight: 1.45, color: INK }}>{clean(scene.label)}</div>
        </div>
      </div>
      <Bubble x={160} y={H * 0.27} size={100} delay={0.5} color={brand.color} />
      <Bubble x={920} y={H * 0.7} size={140} delay={0.8} color={brand.color} />
    </Silk>
  )
}

function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { u, W, fps } = useU()
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.9 } })
  const b = spring({ frame: frame - Math.round(1.0 * fps), fps, config: { damping: 11 } })
  const w = 430
  return (
    <Silk color={brand.color}>
      <div style={{ position: 'absolute', inset: 0, perspective: 2400 * u, perspectiveOrigin: '50% 30%' }}>
        <div
          style={{
            position: 'absolute',
            left: (W - w * u) / 2,
            top: 150 * u,
            width: w * u,
            height: w * 2.04 * u,
            transformStyle: 'preserve-3d',
            transform: `translateY(${(1 - s) * 400 * u + Math.sin(frame / 20) * 8 * u}px) rotateX(8deg) rotateY(${-24 + Math.sin(frame / 30) * 5}deg) rotateZ(-4deg)`,
          }}
        >
          <Pages color={brand.color} width={w} shown={s} count={2} />
          <Phone image={scene.image} color={brand.color} width={w} />
        </div>
      </div>
      <Bubble x={900} y={470} size={110} delay={0.7} color={brand.color} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1140 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 * u }}>
        {brand.logo && <Img src={srcOf(brand.logo)} style={{ height: 100 * u, maxWidth: 400 * u, objectFit: 'contain', background: 'white', borderRadius: 22 * u, padding: 14 * u, opacity: Math.min(1, b * 1.5), boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.18)` }} />}
        <Pop text={scene.text} size={96 * u} width={900 * u} delay={0.4} color="#FFFFFF" accent="#FFE27A" step={2} />
        {scene.button && (
          <div style={{ padding: `${24 * u}px ${64 * u}px`, borderRadius: 999, background: '#FFFFFF', color: mix(brand.color, '#000000', 0.2), fontFamily: FONT, fontWeight: 800, fontSize: 48 * u, lineHeight: 1.45, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(0,0,0,0.25)`, transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.025)})` }}>{clean(scene.button)}</div>
        )}
      </div>
    </Silk>
  )
}

export const APPDEMO = {
  scenes: { hook: Hook, list: List, platform: Platform, stat: Stat, cta: Cta },
  root: { backgroundColor: '#CFE8E4' },
  light: true, // the white logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 150 : 1720),
}
