/**
 * SaaS launch · Sky — after a SaaS launch film the user liked (2026-10-29): a
 * bright stage of white light with sky-blue glow at the edges, "Introducing"
 * sharpening out of a blur, a big prompt box typing itself, the product's REAL
 * screen (the brand kit's screenshot) in a browser window with the camera
 * flying in on the part that matters, a glossy pointer that clicks it, and a
 * close-up of the window's Publish button being pressed. An original design in
 * the brand's colour.
 *
 * No scene types of its own — the ones the story AI already writes
 * (app/motion.py SKYLAUNCH_PROMPT):
 *   hook   "Introducing", then the promise            {text, badge?}
 *   field  the prompt box types the request           {label?, value, button?}
 *   screen the screenshot in a browser window         {image, imgW, imgH, title?, focus?, action?, result?}
 *   list   "here's what you get", ticking in          {title, items: [{icon, text}]}
 *   button the close-up click (Publish)               {title?, text?, button, result?}
 *   done   the glossy check                           {text}
 *   stat   one true number counting up                {value, prefix?, suffix?, label}
 *   cta    the logo, the line, the button             {text, button}
 * 9:16 and 16:9; nothing in the subtitle band (captionTop).
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { fade } from '@remotion/transitions/fade'
import { FONT, Icon, KHMER_RE, Words, clean, fitSize, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
const INK = '#0F172A'
const SUB = '#64748B'
const SKY = '#7CC4FF' // the glow at the edges, whatever the brand's colour

/** Text split into what a reader sees as letters — Khmer clusters stay whole. */
const letters = (text) => {
  const t = clean(text)
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment)
  } catch {
    return [...t]
  }
}

/** The brand's colour, or a clear blue when it's missing. */
const accent = (brand) => (/^#[0-9a-f]{6}$/i.test(brand?.color || '') ? brand.color : '#2F7BFF')

/** The stage: white light in the middle, sky-blue glow drifting at the edges. */
function Sky({ brand }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const a = accent(brand)
  const big = Math.max(width, height)
  const glows = [
    { x: -0.05, y: 0.15, d: 0.75, c: tint(SKY, 0.85), k: 80 },
    { x: 1.05, y: 0.85, d: 0.8, c: tint(SKY, 0.8), k: 95 },
    { x: 0.95, y: -0.05, d: 0.55, c: tint(a, 0.28), k: 120 },
    { x: 0.05, y: 1.05, d: 0.6, c: tint(a, 0.22), k: 105 },
  ]
  return (
    <AbsoluteFill style={{ background: '#F4FAFF', overflow: 'hidden' }}>
      {glows.map((g, i) => {
        const d = big * g.d
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: g.x * width - d / 2 + Math.sin(frame / g.k + i) * 40,
              top: g.y * height - d / 2 + Math.cos(frame / g.k + i * 2) * 30,
              width: d,
              height: d,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${g.c}, transparent 66%)`,
              filter: `blur(${Math.round(d * 0.05)}px)`,
            }}
          />
        )
      })}
      {/* the white light in the middle */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 48% at 50% 50%, rgba(255,255,255,0.95), rgba(255,255,255,0) 70%)' }} />
    </AbsoluteFill>
  )
}

/** The glossy pointer: a blue arrow with a white edge and a soft shadow. */
function Cursor({ x, y, size, pressed = false, opacity = 1, color }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: size, height: size, opacity, transform: `scale(${pressed ? 0.86 : 1})`, transformOrigin: '10% 8%', filter: 'drop-shadow(0 14px 18px rgba(15,23,42,0.28))', zIndex: 30 }}>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient id="sky-cursor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tint(color, 0.75)} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d="M8 4 L8 52 L21 40 L30 60 L39 56 L30 37 L48 37 Z" fill="url(#sky-cursor)" stroke="#FFFFFF" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** The ring a click leaves. */
function Ripple({ x, y, at, size, color }) {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [at, at + 18], [0, 1], clamp)
  if (frame < at || t >= 1) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x - (size * (0.4 + t)) / 2,
        top: y - (size * (0.4 + t)) / 2,
        width: size * (0.4 + t),
        height: size * (0.4 + t),
        borderRadius: '50%',
        border: `${Math.max(3, size * 0.05)}px solid ${tint(color, 0.7 * (1 - t))}`,
        zIndex: 29,
      }}
    />
  )
}

/** A browser window: the bar (dots, the brand, Share + the main button) and the page. */
function Window({ brand, w, h, image, imgW, imgH, button = 'Publish', pressed = false, children, bar = 1 }) {
  const a = accent(brand)
  const barH = Math.round(Math.max(44, w * 0.045) * bar)
  const fs = barH * 0.38
  const name = clean(brand?.name || '')
  return (
    <div style={{ width: w, height: h, borderRadius: barH * 0.36, background: '#FFFFFF', boxShadow: '0 40px 90px rgba(30,64,120,0.22), 0 0 0 1.5px rgba(15,23,42,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: barH, flex: 'none', display: 'flex', alignItems: 'center', gap: barH * 0.3, padding: `0 ${barH * 0.4}px`, borderBottom: '1.5px solid #EEF2F7', fontFamily: FONT }}>
        {['#FF6159', '#FFBD2E', '#28C941'].map((c) => (
          <span key={c} style={{ width: barH * 0.22, height: barH * 0.22, borderRadius: '50%', background: c, flex: 'none' }} />
        ))}
        {brand?.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: barH * 0.5, maxWidth: barH * 2.4, objectFit: 'contain', marginLeft: barH * 0.2 }} />
        ) : (
          name && <span style={{ fontWeight: 800, fontSize: fs * 1.05, color: INK, marginLeft: barH * 0.2 }}>{name}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, fontSize: fs, color: INK, padding: `${barH * 0.13}px ${barH * 0.34}px`, borderRadius: barH * 0.2, border: '1.5px solid #E2E8F0' }}>Share</span>
        <span style={{ fontWeight: 700, fontSize: fs, color: '#FFFFFF', padding: `${barH * 0.13}px ${barH * 0.4}px`, borderRadius: barH * 0.2, background: a, transform: `scale(${pressed ? 0.92 : 1})`, boxShadow: `0 6px 16px ${tint(a, 0.35)}` }}>{clean(button)}</span>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#F8FAFC' }}>
        {image ? (
          <Img src={srcOf(image)} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: imgW && imgH ? (w * imgH) / imgW : '100%', objectFit: 'cover', objectPosition: 'top' }} />
        ) : (
          <Skeleton a={a} />
        )}
        {children}
      </div>
    </div>
  )
}

/** A page drawn in the brand's colour when there's no screenshot. */
function Skeleton({ a }) {
  const bar = (w, h, c = '#E2E8F0', r = 10) => ({ width: w, height: h, borderRadius: r, background: c })
  return (
    <div style={{ position: 'absolute', inset: '6%', display: 'flex', flexDirection: 'column', gap: '4%' }}>
      <div style={{ ...bar('100%', '42%', `linear-gradient(135deg, ${tint(a, 0.85)}, ${tint(a, 0.45)})`, 18) }} />
      <div style={{ display: 'flex', gap: '3%', height: '40%' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...bar('100%', '70%', tint(a, 0.12 + i * 0.05), 14) }} />
            <div style={bar('80%', 14)} />
            <div style={bar('55%', 12)} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A headline: word by word, ⟦highlighted⟧ words in the brand's colour. */
function Headline({ text, size, align = 'center', delay = 6, brand }) {
  return (
    <Words
      text={text}
      delay={delay}
      align={align}
      color={accent(brand)}
      style={{ fontFamily: FONT, fontWeight: KHMER_RE.test(text || '') ? 700 : 800, fontSize: size, lineHeight: KHMER_RE.test(text || '') ? 1.45 : 1.1, letterSpacing: KHMER_RE.test(text || '') ? 0 : '-0.02em', color: INK }}
    />
  )
}

// ── hook: "Introducing" sharpens out of the blur, then the promise ─────────
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const khmer = KHMER_RE.test(scene.text || '')
  const intro = khmer ? 'ណែនាំ' : 'Introducing'
  const focus = interpolate(frame, [0, 26], [0, 1], { ...clamp, easing: ease })
  const lift = spring({ frame: frame - 34, fps, config: { damping: 200 } })
  const unit = wide ? 1 : 0.9
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: wide ? '0 160px' : '0 80px' }}>
        <div style={{ transform: `translateY(${wide ? -40 : -120}px)`, textAlign: 'center', width: '100%' }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: (wide ? 110 : 120) * (1.12 - 0.12 * focus) * (1 - 0.35 * lift),
              color: tint('#334155', 0.9),
              letterSpacing: khmer ? 0 : '-0.01em',
              filter: `blur(${(1 - focus) * 18}px)`,
              opacity: 0.25 + 0.75 * focus,
              transform: `translateY(${-lift * (wide ? 70 : 90)}px)`,
            }}
          >
            {intro}
          </div>
          {lift > 0.02 && (
            <div style={{ marginTop: wide ? 10 : 20, opacity: lift }}>
              <Headline text={scene.text} size={fitSize(scene.text, (wide ? 104 : 96) * unit)} brand={brand} delay={36} />
            </div>
          )}
          {scene.badge && lift > 0.4 && (
            <div style={{ marginTop: 36, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 30px', borderRadius: 999, background: '#FFFFFF', boxShadow: '0 12px 30px rgba(30,64,120,0.14)', fontFamily: FONT, fontWeight: 700, fontSize: wide ? 34 : 38, color: accent(brand), opacity: interpolate(frame, [52, 64], [0, 1], clamp) }}>
              <Icon name="Sparkles" size={wide ? 34 : 38} color={accent(brand)} stroke={2.5} />
              {clean(scene.badge)}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── field: the big prompt box typing the request, then sent ───────────────
function Prompt({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const chars = letters(scene.value)
  const typeFrom = 12
  const per = Math.max(1, Math.min(2.6, 70 / Math.max(1, chars.length)))
  const shown = Math.max(0, Math.min(chars.length, Math.floor((frame - typeFrom) / per)))
  const typed = typeFrom + chars.length * per
  const sendAt = typed + 12
  const sent = frame >= sendAt
  const enter = spring({ frame, fps, config: { damping: 20 } })
  const push = interpolate(frame, [0, 150], [1, 1.06], clamp) // the camera leans in
  const w = wide ? 1360 : width - 100
  const unit = wide ? 44 : 46
  const caret = Math.floor(frame / 14) % 2 === 0 && !sent
  const glow = 0.55 + 0.25 * Math.sin(frame / 12)
  const name = clean(brand?.name || 'AI')
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: w, transform: `translateY(${(1 - enter) * 80 + (wide ? 0 : -140)}px) scale(${push})`, opacity: enter }}>
          {scene.label && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: unit * 0.85, color: SUB, margin: `0 0 22px 10px` }}>{clean(scene.label)}</div>}
          <div
            style={{
              borderRadius: unit * 0.9,
              background: '#FFFFFF',
              padding: `${unit * 0.9}px ${unit * 0.9}px ${unit * 0.6}px`,
              boxShadow: `0 0 0 3px ${tint(SKY, glow)}, 0 0 60px ${tint(SKY, glow * 0.9)}, 0 30px 70px rgba(30,64,120,0.18)`,
            }}
          >
            <div style={{ minHeight: unit * 3.2, fontFamily: FONT, fontWeight: 500, fontSize: unit * 1.02, lineHeight: KHMER_RE.test(scene.value || '') ? 1.6 : 1.35, color: INK }}>
              {chars.slice(0, shown).join('')}
              <span style={{ display: 'inline-block', width: 4, height: unit * 1.15, marginLeft: 4, verticalAlign: 'middle', background: INK, opacity: caret ? 1 : 0 }} />
            </div>
            {/* the box's tools: +, the product's name, the send button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: unit * 0.55, marginTop: unit * 0.5, fontFamily: FONT, color: SUB }}>
              <span style={{ width: unit * 1.45, height: unit * 1.45, borderRadius: '50%', border: '2.5px solid #CBD5E1', display: 'grid', placeItems: 'center' }}>
                <Icon name="Plus" size={unit * 0.8} color="#475569" stroke={2.4} />
              </span>
              <span style={{ fontWeight: 800, fontStyle: 'italic', fontSize: unit * 0.8, color: INK }}>{name}</span>
              <Icon name="Palette" size={unit * 0.8} color="#94A3B8" stroke={2} />
              <span style={{ flex: 1 }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: unit * 0.72 }}>
                <Icon name="Lightbulb" size={unit * 0.75} color="#94A3B8" stroke={2} />
                {scene.button ? clean(scene.button) : ''}
              </span>
              <span
                style={{
                  width: unit * 1.45,
                  height: unit * 1.45,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: shown >= chars.length ? a : '#E2E8F0',
                  transform: `scale(${frame >= sendAt && frame < sendAt + 6 ? 0.85 : 1})`,
                  boxShadow: shown >= chars.length ? `0 8px 20px ${tint(a, 0.4)}` : 'none',
                }}
              >
                <Icon name={sent ? 'Check' : 'ArrowUp'} size={unit * 0.8} color="#FFFFFF" stroke={3} />
              </span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── screen: the real screen in a browser window, the camera flying in ──────
function Screen({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const enter = spring({ frame, fps, config: { damping: 22, mass: 0.9 } })
  // the window: wide in a wide video; in a tall one wider than the frame (the camera crops it)
  const w = wide ? 1500 : 1240
  const ratio = scene.imgW && scene.imgH ? scene.imgH / scene.imgW : 0.62
  const barH = Math.max(44, w * 0.045)
  const h = Math.min(wide ? 860 : 1100, w * ratio + barH)
  const top = wide ? (scene.title ? 170 : 110) : scene.title ? 560 : 440
  // where the window sits before the camera moves
  const left0 = (width - w) / 2
  const box = Array.isArray(scene.focus) && scene.focus.length === 4 ? scene.focus : null
  // the page is seen through a view that starts under the title — zoomed in, it never slides behind the words
  const view = scene.title ? (wide ? 150 : 470) : 0
  // the camera: settles, then flies in on the focus (else drifts down the page)
  const fly = interpolate(frame, [28, 70], [0, 1], { ...clamp, easing: ease })
  let zoom = 1
  let dx = 0
  let dy = 0
  let cx = null
  let cy = null
  if (box) {
    const [bx, by, bw, bh] = box
    const imgH = w * ratio
    const px = left0 + (bx + bw / 2) * w
    const py = top + barH + (by + bh / 2) * imgH
    zoom = 1 + (Math.max(1.15, Math.min(2.4, (width * 0.42) / Math.max(40, bw * w))) - 1) * fly
    // the focus moves to the middle of the page's view: under the title, above the subtitles
    const goalX = width / 2
    const goalY = scene.title ? (view + (wide ? height - 180 : 1500)) / 2 : wide ? height * 0.5 : height * 0.42
    dx = (goalX - px) * fly
    dy = (goalY - py) * fly
    cx = goalX
    cy = goalY
  } else {
    dy = -interpolate(frame, [20, durationInFrames], [0, Math.max(0, h - (wide ? 760 : 900))], clamp) * 0.6
  }
  const tilt = (1 - enter) * 14
  const clickAt = 82
  const reach = interpolate(frame, [54, clickAt], [0, 1], { ...clamp, easing: ease })
  const showResult = scene.result && frame >= clickAt + 6
  const csize = wide ? 70 : 84
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      {scene.title && (
        <div style={{ position: 'absolute', left: wide ? 120 : 70, right: wide ? 120 : 70, top: wide ? 50 : 250, zIndex: 10, opacity: interpolate(frame, [4, 16], [0, 1], clamp) }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 64 : 76)} brand={brand} delay={4} />
        </div>
      )}
      {/* the view: everything above its top edge is cut off, the edge itself fades softly */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: view, bottom: 0, overflow: 'hidden', ...(view ? { WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 60px)', maskImage: 'linear-gradient(180deg, transparent 0, #000 60px)' } : {}) }}>
      <div
        style={{
          position: 'absolute',
          left: left0,
          top: top - view,
          transformOrigin: '0 0',
          // the focus is the scale's origin (below), so it stays put while the window grows — this moves it to the middle
          transform: `translate(${dx}px, ${dy + (1 - enter) * 120}px)`,
          opacity: enter,
        }}
      >
        <div
          style={{
            transformOrigin: box ? `${((box[0] + box[2] / 2) * 100).toFixed(1)}% ${(((box[1] + box[3] / 2) * w * ratio + barH) / h * 100).toFixed(1)}%` : '50% 0%',
            transform: `perspective(2400px) rotateX(${tilt}deg) scale(${zoom})`,
          }}
        >
          <Window brand={brand} w={w} h={h} image={scene.image} imgW={scene.imgW} imgH={scene.imgH}>
            {/* a soft highlight round the part that matters */}
            {box && (
              <div
                style={{
                  position: 'absolute',
                  left: `${box[0] * 100}%`,
                  top: box[1] * w * ratio,
                  width: `${box[2] * 100}%`,
                  height: box[3] * w * ratio,
                  borderRadius: 12,
                  boxShadow: `0 0 0 ${4 / zoom}px ${tint(a, 0.9 * fly)}, 0 0 0 ${14 / zoom}px ${tint(a, 0.18 * fly)}`,
                }}
              />
            )}
          </Window>
        </div>
      </div>
      </div>
      {box && scene.action !== 'highlight' && (
        <>
          <Cursor x={cx + (1 - reach) * width * 0.4} y={cy + (1 - reach) * height * 0.25} size={csize} pressed={frame >= clickAt && frame < clickAt + 6} opacity={reach} color={a} />
          <Ripple x={cx} y={cy} at={clickAt} size={csize * 2.2} color={a} />
        </>
      )}
      {showResult && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: wide ? height * 0.68 : height * 0.66, // clear of the subtitles
            transform: `translateX(-50%) translateY(${(1 - spring({ frame: frame - clickAt - 6, fps, config: { damping: 16 } })) * 40}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 34px',
            borderRadius: 999,
            background: INK,
            color: '#FFFFFF',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: wide ? 34 : 40,
            whiteSpace: 'nowrap',
            boxShadow: '0 18px 40px rgba(15,23,42,0.28)',
            zIndex: 31,
          }}
        >
          <Icon name="CheckCircle2" size={wide ? 36 : 42} color="#4ADE80" stroke={2.6} />
          {clean(scene.result)}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── list: "here's what you get", ticking in on a panel ────────────────────
function Features({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const items = scene.items || []
  const enter = spring({ frame, fps, config: { damping: 20 } })
  const w = wide ? 1100 : width - 110
  const unit = wide ? 40 : 56
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: wide ? 'center' : 'flex-start', paddingTop: wide ? 0 : 400 }}>
        <div style={{ width: w, transform: `translateY(${(1 - enter) * 70}px)`, opacity: enter, borderRadius: unit * 0.8, background: '#FFFFFF', padding: `${unit * 1.1}px ${unit * 1.2}px`, boxShadow: '0 30px 80px rgba(30,64,120,0.18), 0 0 0 1.5px rgba(15,23,42,0.05)' }}>
          {/* who's speaking: the product, like an AI assistant's answer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT, fontWeight: 700, fontSize: unit * 0.7, color: SUB, marginBottom: unit * 0.6 }}>
            <span style={{ width: unit * 1.1, height: unit * 1.1, borderRadius: '50%', background: a, display: 'grid', placeItems: 'center' }}>
              <Icon name="Sparkles" size={unit * 0.62} color="#FFFFFF" stroke={2.4} />
            </span>
            {clean(brand?.name || '')}
          </div>
          {scene.title && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.title, unit * 1.25), lineHeight: KHMER_RE.test(scene.title) ? 1.45 : 1.15, color: INK, marginBottom: unit * 0.7 }}>{clean(scene.title)}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: unit * 0.55 }}>
            {items.map((it, i) => {
              const at = 16 + i * 14
              const s = spring({ frame: frame - at, fps, config: { damping: 18 } })
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: unit * 0.5, opacity: s, transform: `translateX(${(1 - s) * 40}px)` }}>
                  <span style={{ width: unit * 1.15, height: unit * 1.15, borderRadius: unit * 0.32, background: tint(a, 0.12), display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Icon name={it.icon || 'Check'} size={unit * 0.66} color={a} stroke={2.4} />
                  </span>
                  <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: unit * 0.88, lineHeight: KHMER_RE.test(it.text || '') ? 1.5 : 1.25, color: INK }}>{clean(it.text)}</span>
                  <span style={{ flex: 1 }} />
                  <Icon name="Check" size={unit * 0.7} color="#22C55E" stroke={3} />
                </div>
              )
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── button: the close-up — the window's top corner, the pointer presses it ─
function Press({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const enter = spring({ frame, fps, config: { damping: 22 } })
  const clickAt = 46
  const reach = interpolate(frame, [12, clickAt], [0, 1], { ...clamp, easing: ease })
  const pressed = frame >= clickAt && frame < clickAt + 7
  const done = frame >= clickAt + 7
  // the bar, big: a window three times the frame, seen through its top-right corner
  const bw = wide ? 1500 : 1000
  const barScale = wide ? 2.1 : 2.4
  const btn = { x: width * (wide ? 0.66 : 0.6), y: height * (wide ? 0.4 : 0.36) }
  const toast = spring({ frame: frame - clickAt - 10, fps, config: { damping: 15 } })
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      {scene.title && (
        <div style={{ position: 'absolute', left: wide ? 120 : 70, right: wide ? 120 : 70, top: wide ? 60 : 250, zIndex: 10 }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 64 : 76)} brand={brand} delay={2} />
          {scene.text && <div style={{ marginTop: 18, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: wide ? 34 : 40, color: SUB, opacity: interpolate(frame, [14, 26], [0, 1], clamp) }}>{clean(scene.text)}</div>}
        </div>
      )}
      {/* the window's corner, zoomed on its button: the button's middle is the scale's
          origin and sits on btn (the bar's button is ~72 px in from the right, mid-bar) */}
      <div
        style={{
          position: 'absolute',
          left: btn.x - (bw - 72),
          top: btn.y - Math.max(44, bw * 0.045) / 2,
          transformOrigin: `${bw - 72}px ${Math.max(44, bw * 0.045) / 2}px`,
          transform: `scale(${barScale * (0.94 + 0.06 * enter)})`,
          opacity: enter,
        }}
      >
        <Window brand={brand} w={bw} h={420} button={scene.button} pressed={pressed} />
      </div>
      <Cursor x={btn.x + (1 - reach) * width * 0.35 - 10} y={btn.y + (1 - reach) * height * 0.22 + 6} size={wide ? 80 : 96} pressed={pressed} opacity={reach} color={a} />
      <Ripple x={btn.x} y={btn.y + 10} at={clickAt} size={wide ? 190 : 230} color={a} />
      {done && scene.result && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: wide ? height * 0.66 : height * 0.6,
            transform: `translateX(-50%) translateY(${(1 - toast) * 50}px) scale(${0.9 + 0.1 * toast})`,
            opacity: toast,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: wide ? '22px 40px' : '26px 46px',
            borderRadius: 28,
            background: '#FFFFFF',
            boxShadow: '0 24px 60px rgba(30,64,120,0.22)',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: wide ? 40 : 46,
            color: INK,
            whiteSpace: 'nowrap',
            zIndex: 31,
          }}
        >
          <span style={{ width: wide ? 50 : 58, height: wide ? 50 : 58, borderRadius: '50%', background: '#22C55E', display: 'grid', placeItems: 'center' }}>
            <Icon name="Check" size={wide ? 30 : 36} color="#FFFFFF" stroke={3.4} />
          </span>
          {clean(scene.result)}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── done: a glossy check in the brand's colour, rings spreading ───────────
function Done({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const pop = spring({ frame: frame - 4, fps, config: { damping: 11, mass: 0.7 } })
  const d = wide ? 230 : 280
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${wide ? -40 : -160}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wide ? 40 : 56 }}>
          <div style={{ position: 'relative', width: d, height: d }}>
            {[0, 1, 2].map((i) => {
              const t = ((frame - 10 - i * 12) % 48) / 48
              return frame > 10 + i * 12 ? (
                <div key={i} style={{ position: 'absolute', inset: -d * 0.6 * t, borderRadius: '50%', border: `3px solid ${tint(a, 0.4 * (1 - t))}` }} />
              ) : null
            })}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${tint('#FFFFFF', 0.9)}, ${a} 55%)`, boxShadow: `0 30px 60px ${tint(a, 0.4)}`, display: 'grid', placeItems: 'center', transform: `scale(${pop})` }}>
              <Icon name="Check" size={d * 0.5} color="#FFFFFF" stroke={3.4} />
            </div>
          </div>
          <Headline text={scene.text} size={fitSize(scene.text, wide ? 88 : 92)} brand={brand} delay={14} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── stat: one true number counting up on a glass card ─────────────────────
function Stat({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const value = Number(scene.value) || 0
  const t = interpolate(frame, [8, 44], [0, 1], { ...clamp, easing: ease })
  const shown = value % 1 ? (value * t).toFixed(1) : Math.round(value * t).toLocaleString('en-US')
  const enter = spring({ frame, fps, config: { damping: 18 } })
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${(1 - enter) * 60 + (wide ? -30 : -160)}px)`, opacity: enter, textAlign: 'center', padding: wide ? '50px 90px' : '60px 70px', borderRadius: 48, background: 'rgba(255,255,255,0.75)', boxShadow: '0 30px 80px rgba(30,64,120,0.16)' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 190 : 200, lineHeight: 1, letterSpacing: '-0.04em', color: a }}>
            {clean(scene.prefix)}
            {shown}
            {clean(scene.suffix)}
          </div>
          <div style={{ marginTop: 22, fontFamily: FONT, fontWeight: 600, fontSize: fitSize(scene.label, wide ? 48 : 52), lineHeight: KHMER_RE.test(scene.label || '') ? 1.5 : 1.2, color: INK, maxWidth: wide ? 1100 : 860 }}>{clean(scene.label)}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── cta: the logo, the line, the button the pointer presses ───────────────
function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const enter = spring({ frame, fps, config: { damping: 18 } })
  const clickAt = 52
  const reach = interpolate(frame, [26, clickAt], [0, 1], { ...clamp, easing: ease })
  const pressed = frame >= clickAt && frame < clickAt + 7
  const btnY = wide ? height * 0.62 : height * 0.58
  return (
    <AbsoluteFill>
      <Sky brand={brand} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: wide ? height * 0.14 : height * 0.2 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wide ? 34 : 46, opacity: enter, transform: `translateY(${(1 - enter) * 50}px)`, padding: wide ? '0 160px' : '0 70px' }}>
          {brand?.logo ? (
            <div style={{ padding: wide ? '18px 30px' : '22px 36px', borderRadius: 30, background: '#FFFFFF', boxShadow: '0 18px 44px rgba(30,64,120,0.14)' }}>
              <Img src={srcOf(brand.logo)} style={{ height: wide ? 90 : 110, maxWidth: wide ? 420 : 520, objectFit: 'contain' }} />
            </div>
          ) : (
            brand?.name && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 70 : 80, color: INK }}>{clean(brand.name)}</div>
          )}
          <Headline text={scene.text} size={fitSize(scene.text, wide ? 80 : 84)} brand={brand} delay={10} />
        </div>
      </AbsoluteFill>
      {scene.button && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: btnY, display: 'flex', justifyContent: 'center', opacity: interpolate(frame, [18, 30], [0, 1], clamp) }}>
          <div style={{ position: 'relative', padding: wide ? '26px 64px' : '30px 72px', borderRadius: 999, background: a, color: '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 46 : 52, boxShadow: `0 20px 44px ${tint(a, 0.4)}`, transform: `scale(${pressed ? 0.93 : 1})`, whiteSpace: 'nowrap' }}>
            {clean(scene.button)}
          </div>
        </div>
      )}
      {scene.button && (
        <>
          <Cursor x={width / 2 + (wide ? 120 : 110) + (1 - reach) * width * 0.3} y={btnY + (wide ? 40 : 50) + (1 - reach) * height * 0.2} size={wide ? 74 : 88} pressed={pressed} opacity={reach} color={a} />
          <Ripple x={width / 2 + (wide ? 120 : 110)} y={btnY + (wide ? 44 : 54)} at={clickAt} size={wide ? 170 : 210} color={a} />
        </>
      )}
    </AbsoluteFill>
  )
}

export const SKYLAUNCH = {
  scenes: { hook: Hook, field: Prompt, screen: Screen, list: Features, button: Press, done: Done, stat: Stat, cta: Cta },
  root: { backgroundColor: '#F4FAFF' },
  light: true, // the light corner chip (ExplainerChrome)
  transitions: [() => fade()],
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}
