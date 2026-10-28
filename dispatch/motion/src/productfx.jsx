/**
 * "Product showcase" — the customer's REAL product photo, its background taken
 * away (app/cutout.py), floating over shape effects drawn in the brand's colours:
 * a colour blob that keeps changing shape behind it, rings and paint-like splashes
 * bursting as it lands, callout lines drawing out to its features, a spinning
 * price badge, rings pulsing round the call to action. The photo itself is never
 * redrawn — the label and the logo on the product stay exactly as they are.
 *
 * Same scenes as Offer (app/motion.py PRODUCTFX_PROMPT / OFFER_TYPES):
 *   { type: "hook",  text, icon, image?, cut? }              the product drops in, the burst
 *   { type: "list",  title, items: [{ icon, text }], image? } callouts from the product to 3 features
 *   { type: "offer", plan, price, period, was, badge, features, image? }   the price badge beside it
 *   { type: "stat",  value, prefix, suffix, label, icon }     the number counts up round it
 *   { type: "cta",   text, button, image? }                    pulsing rings, the button
 * `cut`: the photo has a see-through background — else it sits on a white card.
 * Every move is a function of the frame: the MP4 renders the same every time.
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const TAU = Math.PI * 2

/** #hex a mixed towards #hex b by t (0 = a). */
function mix(a, b, t) {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : [59, 130, 246])
  const x = p(a)
  const y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}
const alpha = (hex, a) => {
  const p = /^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [59, 130, 246]
  return `rgba(${p.join(',')},${a})`
}

function useStage() {
  const { width: W, height: H, fps } = useVideoConfig()
  const wide = W > H
  return { W, H, fps, wide, u: Math.min(W, H) / 1080 }
}

/** The brand's colour, deep, with a soft glow where the product stands. */
function Backdrop({ color, gx, gy }) {
  const frame = useCurrentFrame()
  const { W, H } = useStage()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${mix(color, '#05070D', 0.78)}, ${mix(color, '#05070D', 0.92)})` }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${gx * 100}% ${gy * 100}%, ${alpha(color, 0.32)}, transparent ${55 + Math.sin(frame / 40) * 4}%)` }} />
      {/* a few soft specks drifting up */}
      {Array.from({ length: 18 }, (_, i) => {
        const x = random(`sx${i}`) * W
        const y = (((random(`sy${i}`) * H - frame * (0.3 + random(`sv${i}`) * 0.5)) % H) + H) % H
        const r = 3 + random(`sr${i}`) * 5
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: r, height: r, borderRadius: '50%', background: 'white', opacity: 0.08 + random(`so${i}`) * 0.14 }} />
      })}
    </AbsoluteFill>
  )
}

/** A colour blob that keeps changing shape — its edge a ring of points, each
 * breathing in and out at its own pace. */
function Blob({ cx, cy, r, color, grow = 1 }) {
  const frame = useCurrentFrame()
  const t = frame / 30
  const n = 9
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU
    const k = 1 + 0.11 * Math.sin(t * 1.3 + i * 1.7) + 0.06 * Math.sin(t * 0.7 + i * 2.9)
    return [cx + Math.cos(a) * r * k * grow, cy + Math.sin(a) * r * k * grow]
  })
  // a smooth closed curve through the points (Catmull-Rom → cubic Bézier)
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`
  }
  const id = `blob${Math.round(cx)}${Math.round(cy)}`
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mix(color, '#FFFFFF', 0.25)} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} opacity={0.95} />
    </>
  )
}

/** As the product lands: three rings opening out and paint-like drops flying
 * from it, then settling as dots round the blob. */
function Burst({ cx, cy, r, color, at = 0.35 }) {
  const frame = useCurrentFrame()
  const { fps } = useStage()
  const f = frame - at * fps
  if (f < 0) return null
  const colours = [color, mix(color, '#FFFFFF', 0.45), '#FFFFFF', mix(color, '#FFD166', 0.6)]
  return (
    <>
      {[0, 1, 2].map((i) => {
        const p = interpolate(f - i * 5, [0, 34], [0, 1], clamp)
        return p > 0 && p < 1 ? <circle key={`r${i}`} cx={cx} cy={cy} r={r * (0.7 + p * 0.9)} fill="none" stroke={colours[i % 2]} strokeWidth={10 * (1 - p)} opacity={1 - p} /> : null
      })}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * TAU + random(`ba${i}`) * 0.3
        const go = spring({ frame: f, fps, config: { damping: 14, mass: 0.6 } })
        const far = r * (1.05 + random(`bd${i}`) * 0.45)
        const size = r * (0.03 + random(`bs${i}`) * 0.05) * (1 + (1 - go) * 0.6)
        return <circle key={`d${i}`} cx={cx + Math.cos(a) * far * go} cy={cy + Math.sin(a) * far * go + Math.sin(frame / 18 + i) * 4} r={size} fill={colours[i % colours.length]} opacity={0.9} />
      })}
    </>
  )
}

/** A software product's screenshot (app/cutout.py screen_kind) in a device:
 * "laptop" for a wide screen, "phone" for a tall one — the screen shows its top. */
function Device({ kind, src, size, tallest }) {
  const { W, u, wide } = useStage()
  if (kind === 'phone') {
    const h = Math.min(tallest, size * 1.35)
    const w = h * 0.49
    return (
      <div style={{ position: 'relative', width: w, height: h, borderRadius: w * 0.14, background: '#0B0D12', padding: w * 0.035, boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,0.5), inset 0 0 0 ${2 * u}px rgba(255,255,255,0.14)` }}>
        <div style={{ width: '100%', height: '100%', borderRadius: w * 0.11, overflow: 'hidden', background: 'white' }}>
          <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        </div>
        <div style={{ position: 'absolute', top: w * 0.06, left: '50%', width: w * 0.3, height: w * 0.07, marginLeft: -w * 0.15, borderRadius: 99, background: '#0B0D12' }} />
      </div>
    )
  }
  // wide: under half the frame — the words beside it start at 0.56 of the width (0.52 covered them)
  const w = Math.min(size * 1.5, wide ? W * 0.42 : W * 0.86)
  const sw = w * 0.86 // the screen inside its bezel
  const sh = sw * 0.625 // 16:10
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: `drop-shadow(0 ${30 * u}px ${40 * u}px rgba(0,0,0,0.45))` }}>
      <div style={{ width: sw + w * 0.04, padding: w * 0.02, paddingBottom: w * 0.028, borderRadius: `${w * 0.03}px ${w * 0.03}px ${w * 0.008}px ${w * 0.008}px`, background: '#0B0D12', boxShadow: `inset 0 0 0 ${2 * u}px rgba(255,255,255,0.12)` }}>
        <div style={{ width: sw, height: sh, borderRadius: w * 0.008, overflow: 'hidden', background: 'white' }}>
          <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        </div>
      </div>
      {/* the keyboard deck, seen from the front */}
      <div style={{ width: w, height: w * 0.035, borderRadius: `0 0 ${w * 0.04}px ${w * 0.04}px`, background: 'linear-gradient(#D7DBE2, #9AA1AD)' }} />
    </div>
  )
}

/** The real product: drops in with a bounce and a soft shadow, then floats
 * and tilts a little. A photo that couldn't be cut out sits on a white card;
 * an app's screenshot sits in a laptop or a phone. */
function Product({ scene, brand, cx, cy, size, at = 0.1 }) {
  const frame = useCurrentFrame()
  const { fps, u, H, wide } = useStage()
  // a tall product gets more height than width — but never into the subtitles'
  // band at the bottom (a bottle on a wide video reached it)
  const tallest = Math.min(size * 1.4, wide ? H * 0.68 : H * 0.46)
  const src = scene.image || brand.logo
  const land = spring({ frame: frame - at * fps, fps, config: { damping: 11, mass: 0.9 } })
  const float = Math.sin(frame / 22) * 10 * u
  // a device turns a little in 3D instead of rocking like a can
  const tilt = scene.screen ? 0 : Math.sin(frame / 34) * 3 + (1 - land) * -14
  const turn = scene.screen ? `perspective(${2400 * u}px) rotateY(${-10 + Math.sin(frame / 40) * 4 + (1 - land) * -20}deg) ` : ''
  const card = src && !scene.cut && !scene.screen
  return (
    <>
      <div style={{ position: 'absolute', left: cx - size * 0.34, top: cy + size * 0.64, width: size * 0.68, height: size * 0.09, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', filter: `blur(${14 * u}px)`, opacity: land * (0.8 - float / (40 * u)), transform: `scale(${0.7 + land * 0.3})` }} />
      <div
        style={{
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          opacity: Math.min(1, land * 2),
          transform: `${turn}translateY(${(1 - land) * -size * 0.7 + float}px) scale(${0.75 + land * 0.25}) rotate(${tilt}deg)`,
        }}
      >
        {src && scene.screen ? (
          <Device kind={scene.screen} src={src} size={size} tallest={tallest} />
        ) : src ? (
          <Img
            src={srcOf(src)}
            style={{
              // pixels (a percentage didn't hold): a tall product — a can, a bottle — gets
              // more height than width, a wide one is held by its width
              maxWidth: size,
              maxHeight: tallest,
              objectFit: 'contain',
              filter: card ? undefined : `drop-shadow(0 ${24 * u}px ${30 * u}px rgba(0,0,0,0.35))`,
              ...(card ? { background: 'white', padding: size * 0.06, borderRadius: 32 * u, boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.4)`, maxWidth: size * 0.86, maxHeight: size * 0.86 } : null),
            }}
          />
        ) : (
          <Icon name={scene.icon || 'Package'} size={size * 0.5} color="white" stroke={1.6} />
        )}
      </div>
    </>
  )
}

/** The scene's words, big, the key words in the brand's colour. */
function Headline({ text, size, align = 'left', color, delay = 8 }) {
  const { u } = useStage()
  return (
    <Words
      text={text}
      delay={delay}
      align={align === 'center' ? 'center' : 'left'}
      color="white"
      style={{ fontSize: fitSize(text, size * u), fontWeight: 800, lineHeight: 1.12, rowGap: 4 * u, '--hl-bg': 'transparent', '--hl-text': mix(color, '#FFFFFF', 0.25) }}
    />
  )
}

function Shapes({ children }) {
  const { W, H } = useStage()
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {children}
    </svg>
  )
}

// ── the scenes ────────────────────────────────────────────────────────────
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, H, fps, wide } = useStage()
  const cx = wide ? W * 0.68 : W / 2
  const cy = wide ? H * 0.5 : H * 0.38
  const size = wide ? H * 0.62 : W * 0.66
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} gx={cx / W} gy={cy / H} />
      <Shapes>
        <Blob cx={cx} cy={cy} r={size * 0.42} color={brand.color} grow={spring({ frame, fps, config: { damping: 16 } })} />
        <Burst cx={cx} cy={cy} r={size * 0.42} color={brand.color} />
      </Shapes>
      <Product scene={scene} brand={brand} cx={cx} cy={cy} size={size} />
      <div style={{ position: 'absolute', ...(wide ? { left: W * 0.07, top: H * 0.28, width: W * 0.4 } : { left: W * 0.08, top: H * 0.7, width: W * 0.84 }), fontFamily: FONT }}>
        <Headline text={scene.text} size={wide ? 96 : 92} align={wide ? 'left' : 'center'} color={brand.color} delay={14} />
      </div>
    </AbsoluteFill>
  )
}

function Callout({ x1, y1, x2, y2, item, color, at, side = 'right' }) {
  const frame = useCurrentFrame()
  const { fps, u } = useStage()
  const f = frame - at * fps
  const draw = interpolate(f, [0, 14], [0, 1], clamp)
  const center = side === 'center' // a label alone, centred on x2 — no line
  const pop = spring({ frame: f - (center ? 0 : 10), fps, config: { damping: 13 } })
  if (f < 0) return null
  const len = center ? 0 : Math.hypot(x2 - x1, y2 - y1)
  return (
    <>
      {!center && (
        <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width="100%" height="100%">
          <circle cx={x1} cy={y1} r={9 * u} fill={color} opacity={draw} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeOpacity={0.7} strokeWidth={3 * u} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} strokeLinecap="round" />
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: center ? x2 : side === 'right' ? x2 + 14 * u : undefined,
          right: side === 'left' ? `calc(100% - ${x2 - 14 * u}px)` : undefined,
          top: y2,
          transform: `${center ? 'translateX(-50%) ' : ''}translateY(-50%) scale(${0.6 + pop * 0.4})`,
          transformOrigin: center ? 'center' : side === 'right' ? 'left center' : 'right center',
          opacity: Math.min(1, pop * 1.5),
          display: 'flex',
          alignItems: 'center',
          gap: 14 * u,
          padding: `${14 * u}px ${26 * u}px ${14 * u}px ${14 * u}px`,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.1)',
          border: `${2 * u}px solid rgba(255,255,255,0.22)`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: fitSize(item.text, 40 * u),
          color: 'white',
          whiteSpace: 'nowrap',
          maxWidth: 760 * u,
        }}
      >
        <span style={{ display: 'grid', placeItems: 'center', width: 56 * u, height: 56 * u, borderRadius: '50%', background: color, flex: 'none' }}>
          <Icon name={item.icon || 'Check'} size={30 * u} color="white" stroke={2.2} />
        </span>
        {clean(item.text)}
      </div>
    </>
  )
}

function List({ scene, brand }) {
  const { W, H, wide } = useStage()
  const items = (scene.items || []).slice(0, 3)
  const cx = wide ? W * 0.3 : W / 2
  const cy = wide ? H * 0.55 : H * 0.37
  const size = wide ? H * 0.52 : W * 0.42
  // both clear of the subtitles' band at the bottom
  const rows = items.map((_, i) => (wide ? H * (0.3 + i * 0.17) : H * (0.6 + i * 0.08)))
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} gx={cx / W} gy={cy / H} />
      <Shapes>
        <Blob cx={cx} cy={cy} r={size * 0.4} color={brand.color} />
      </Shapes>
      <Product scene={scene} brand={brand} cx={cx} cy={cy} size={size} at={0} />
      {/* below the corner logo chip */}
      <div style={{ position: 'absolute', left: wide ? W * 0.07 : W * 0.08, top: wide ? H * 0.15 : H * 0.13, width: wide ? W * 0.86 : W * 0.84, fontFamily: FONT, textAlign: wide ? 'left' : 'center' }}>
        <Headline text={scene.title} size={wide ? 64 : 70} align={wide ? 'left' : 'center'} color={brand.color} delay={4} />
      </div>
      {items.map((it, i) =>
        wide ? (
          // wide: lines draw out from beside the product to the features on the right
          <Callout key={i} item={it} color={brand.color} at={0.6 + i * 0.7} x1={cx + size * 0.22} y1={cy - size * 0.18 + i * size * 0.2} x2={W * 0.58} y2={rows[i]} />
        ) : (
          // tall: a column under the product — lines across it would cover its label
          <Callout key={i} item={it} color={brand.color} at={0.6 + i * 0.6} x2={W / 2} y2={rows[i]} side="center" />
        ),
      )}
    </AbsoluteFill>
  )
}

/** A starburst badge that turns slowly, the price on it. */
function PriceBadge({ cx, cy, r, color, scene }) {
  const frame = useCurrentFrame()
  const { fps, u } = useStage()
  const pop = spring({ frame: frame - 0.5 * fps, fps, config: { damping: 10 } })
  const n = 14
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * TAU
    const rr = i % 2 ? r * 0.86 : r
    return `${Math.cos(a) * rr},${Math.sin(a) * rr}`
  }).join(' ')
  const price = clean(scene.price || '')
  return (
    <div style={{ position: 'absolute', left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, transform: `scale(${pop}) rotate(${(1 - pop) * -40}deg)` }}>
      <svg width={2 * r} height={2 * r} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} style={{ position: 'absolute', inset: 0, transform: `rotate(${frame * 0.6}deg)` }}>
        {/* gold, a touch of the brand: the brand mixed half with yellow went grey for a blue brand */}
        <polygon points={pts} fill={mix('#FFC93C', color, 0.12)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', fontFamily: FONT, color: '#1A1205' }}>
        <div>
          {scene.was && <div style={{ fontSize: r * 0.2, fontWeight: 600, textDecoration: 'line-through', opacity: 0.6 }}>{clean(scene.was)}</div>}
          <div style={{ fontSize: fitSize(price || clean(scene.badge || ''), r * 0.46), fontWeight: 800, lineHeight: 1 }}>{price || clean(scene.badge || '')}</div>
          {scene.period && <div style={{ fontSize: r * 0.16, fontWeight: 700, marginTop: 4 * u }}>{clean(scene.period)}</div>}
        </div>
      </div>
    </div>
  )
}

function Offer({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, H, fps, wide, u } = useStage()
  const cx = wide ? W * 0.32 : W / 2
  const cy = wide ? H * 0.52 : H * 0.34
  const size = wide ? H * 0.62 : W * 0.6
  const feats = (scene.features || []).slice(0, 3)
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} gx={cx / W} gy={cy / H} />
      <Shapes>
        <Blob cx={cx} cy={cy} r={size * 0.42} color={brand.color} />
      </Shapes>
      <Product scene={scene} brand={brand} cx={cx} cy={cy} size={size} at={0} />
      {(scene.price || scene.badge) && <PriceBadge cx={cx + size * 0.36} cy={cy - size * 0.32} r={(wide ? 120 : 130) * u} color={brand.color} scene={scene} />}
      <div style={{ position: 'absolute', ...(wide ? { left: W * 0.56, top: H * 0.24, width: W * 0.38 } : { left: W * 0.08, top: H * 0.64, width: W * 0.84, textAlign: 'center' }), fontFamily: FONT, color: 'white' }}>
        {scene.badge && scene.price && <div style={{ display: 'inline-block', padding: `${8 * u}px ${22 * u}px`, borderRadius: 999, background: brand.color, fontWeight: 800, fontSize: 30 * u, marginBottom: 18 * u }}>{clean(scene.badge)}</div>}
        <div style={{ fontSize: fitSize(scene.plan || '', (wide ? 84 : 80) * u), fontWeight: 800, lineHeight: 1.1 }}>{clean(scene.plan || '')}</div>
        <div style={{ marginTop: 26 * u, display: 'flex', flexDirection: 'column', gap: 14 * u, alignItems: wide ? 'flex-start' : 'center' }}>
          {feats.map((t, i) => {
            const k = spring({ frame: frame - (0.9 + i * 0.35) * fps, fps, config: { damping: 14 } })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontSize: fitSize(t, 40 * u), fontWeight: 600, opacity: k, transform: `translateX(${(1 - k) * 40 * u}px)` }}>
                <span style={{ width: 40 * u, height: 40 * u, borderRadius: '50%', background: brand.color, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon name="Check" size={24 * u} color="white" stroke={3} />
                </span>
                {clean(t)}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

function Stat({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, H, fps, wide, u } = useStage()
  const cx = wide ? W * 0.3 : W / 2
  const cy = wide ? H * 0.52 : H * 0.34
  const size = wide ? H * 0.5 : W * 0.52
  const target = parseFloat(String(scene.value || '0').replace(/[^0-9.]/g, '')) || 0
  const n = interpolate(frame, [0.3 * fps, 1.6 * fps], [0, target], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const shown = Number.isInteger(target) ? Math.round(n).toLocaleString() : n.toFixed(1)
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} gx={cx / W} gy={cy / H} />
      <Shapes>
        <Blob cx={cx} cy={cy} r={size * 0.42} color={brand.color} />
        <circle cx={cx} cy={cy} r={size * 0.58} fill="none" stroke="white" strokeOpacity={0.25} strokeWidth={4 * u} strokeDasharray={`${18 * u} ${16 * u}`} strokeDashoffset={-frame * 2} />
      </Shapes>
      <Product scene={scene} brand={brand} cx={cx} cy={cy} size={size} at={0} />
      <div style={{ position: 'absolute', ...(wide ? { left: W * 0.56, top: H * 0.3, width: W * 0.38 } : { left: W * 0.08, top: H * 0.64, width: W * 0.84, textAlign: 'center' }), fontFamily: FONT, color: 'white' }}>
        <div style={{ fontSize: (wide ? 170 : 160) * u, fontWeight: 800, lineHeight: 1, color: mix(brand.color, '#FFFFFF', 0.25) }}>
          {clean(scene.prefix || '')}
          {shown}
          {clean(scene.suffix || '')}
        </div>
        <div style={{ marginTop: 18 * u, fontSize: fitSize(scene.label || '', 48 * u), fontWeight: 700 }}>{clean(scene.label || '')}</div>
      </div>
    </AbsoluteFill>
  )
}

function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, H, fps, wide, u } = useStage()
  // wide: the product left, the words and button right — under it they sat on the subtitles
  const cx = wide ? W * 0.31 : W / 2
  const cy = wide ? H * 0.45 : H * 0.36
  const size = wide ? H * 0.52 : W * 0.56
  const btn = spring({ frame: frame - 0.8 * fps, fps, config: { damping: 11 } })
  const beat = 1 + Math.max(0, Math.sin(frame / 7)) * 0.04
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} gx={cx / W} gy={cy / H} />
      <Shapes>
        {[0, 1, 2].map((i) => {
          const p = ((frame / fps + i * 0.7) % 2.1) / 2.1
          return <circle key={i} cx={cx} cy={cy} r={size * (0.4 + p * 0.45)} fill="none" stroke={brand.color} strokeWidth={6 * u} opacity={(1 - p) * 0.7} />
        })}
        <Blob cx={cx} cy={cy} r={size * 0.4} color={brand.color} />
      </Shapes>
      <Product scene={scene} brand={brand} cx={cx} cy={cy} size={size} at={0} />
      <div style={{ position: 'absolute', ...(wide ? { left: W * 0.59, width: W * 0.35, top: H * 0.26, textAlign: 'left' } : { left: W * 0.08, width: W * 0.84, top: H * 0.64, textAlign: 'center' }), fontFamily: FONT, color: 'white' }}>
        <Headline text={scene.text} size={wide ? 72 : 76} align={wide ? 'left' : 'center'} color={brand.color} delay={4} />
        {scene.button && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14 * u,
              marginTop: 34 * u,
              padding: `${22 * u}px ${56 * u}px`,
              borderRadius: 999,
              background: brand.color,
              fontWeight: 800,
              fontSize: fitSize(scene.button, 46 * u),
              boxShadow: `0 ${16 * u}px ${40 * u}px ${alpha(brand.color, 0.5)}`,
              opacity: Math.min(1, btn * 1.4),
              transform: `scale(${(0.6 + btn * 0.4) * beat})`,
            }}
          >
            <Icon name="ArrowRight" size={42 * u} color="white" stroke={2.6} />
            {clean(scene.button)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

export const PRODUCTFX = {
  scenes: { hook: Hook, list: List, offer: Offer, stat: Stat, cta: Cta },
  root: { backgroundColor: '#05070D' },
  light: false, // the dark logo chip
  captionTop: (h) => (h < 1200 ? h - 150 : 1660),
}
