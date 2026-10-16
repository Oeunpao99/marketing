/**
 * Training & Presentation — a team training or a talk turned into a clean,
 * corporate video: title card, chapter cards ("Part 2 · Ownership"), key
 * points, checklists, a big quote, "instead of → do this", a recap and a
 * closing card. In the brand's colour on a light page. Every scene lays out
 * for 16:9 (1920×1080, a meeting-room screen / YouTube / LMS) or 9:16.
 * Script fields come from app/motion.py TRAINING_PROMPT:
 *
 *   { type: "hook",        text, icon? , sub? }              the title card
 *   { type: "chapter",     n, of, title, text? }             "Part n of …"
 *   { type: "list",        title, items: [{ icon, text }] }  key points
 *   { type: "checklist",   title, checks: [text] }           ticked one by one
 *   { type: "quote",       text, author? }
 *   { type: "beforeafter", title?, before, after }           instead of → do this
 *   { type: "recap",       title, points: [{ title, text }] } numbered
 *   { type: "stat",        value, prefix?, suffix?, label, icon? }
 *   { type: "cta",         text, button? }                   closing
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf } from './shared'

const T = { bg: '#F6F7FB', card: '#FFFFFF', ink: '#0F172A', sub: '#526077', line: '#E3E7EF', soft: '#EEF1F7' }

/** The page: a flat colour, a soft grid and a brand bar at the left (wide) or top (tall) — no glow, no gradient. */
function Page({ wide }) {
  return (
    <AbsoluteFill style={{ backgroundColor: T.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${T.line} 1.5px, transparent 1.5px), linear-gradient(90deg, ${T.line} 1.5px, transparent 1.5px)`,
          backgroundSize: '72px 72px',
          opacity: 0.55,
        }}
      />
      <div style={{ position: 'absolute', background: 'var(--brand)', ...(wide ? { left: 0, top: 0, bottom: 0, width: 14 } : { left: 0, right: 0, top: 0, height: 12 }) }} />
    </AbsoluteFill>
  )
}

const useLayout = () => {
  const { width, height } = useVideoConfig()
  const wide = width > height
  // the area scenes use: clear of the top chrome and the subtitles
  return { wide, width, height, pad: wide ? 120 : 72, top: wide ? 150 : 300, bottom: wide ? 210 : 470 }
}

function Body({ children, center = true }) {
  const { pad, top, bottom } = useLayout()
  return (
    <div style={{ position: 'absolute', left: pad, right: pad, top, bottom, display: 'flex', flexDirection: 'column', justifyContent: center ? 'center' : 'flex-start' }}>
      {children}
    </div>
  )
}

function Kicker({ children, delay = 0 }) {
  const frame = useCurrentFrame()
  const s = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 12, padding: '8px 22px', borderRadius: 999, background: 'color-mix(in srgb, var(--brand) 12%, white)', color: 'var(--brand)', fontFamily: FONT, fontWeight: 700, fontSize: 28, letterSpacing: 3, opacity: s, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function IconTile({ name, size = 92, delay = 0 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } })
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: size * 0.3, background: 'var(--brand)', display: 'grid', placeItems: 'center', transform: `scale(${s})`, boxShadow: '0 10px 30px color-mix(in srgb, var(--brand) 35%, transparent)' }}>
      <Icon name={name || 'CircleCheck'} size={size * 0.52} color="white" stroke={2.2} />
    </div>
  )
}

/** One font size for a whole list — fitted to its longest line, bigger on a wide screen. */
const listSize = (texts, base, wide) => Math.round(Math.min(...texts.map((x) => fitSize(x, base))) * (wide ? 1.2 : 1))

const card = { background: T.card, border: `2px solid ${T.line}`, borderRadius: 28, boxShadow: '0 12px 36px rgba(15,23,42,0.06)' }

// ── scenes ─────────────────────────────────────────────────────────────────
function TrTitle({ scene, brand }) {
  const { wide } = useLayout()
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: wide ? 80 : 50 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <Kicker>{clean(brand.name)} · Team training</Kicker>
            <Words text={scene.text} delay={6} color={T.ink} style={{ fontSize: fitSize(scene.text, wide ? 96 : 92), fontWeight: 700, lineHeight: 1.2 }} />
            {scene.sub && <div style={{ fontFamily: FONT, fontSize: wide ? 40 : 40, color: T.sub, fontWeight: 500 }}>{clean(scene.sub)}</div>}
          </div>
          <IconTile name={scene.icon || 'GraduationCap'} size={wide ? 260 : 200} delay={10} />
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrChapter({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const s = spring({ frame, fps, config: { damping: 14 } })
  const line = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 300 : 260, lineHeight: 0.9, color: 'transparent', WebkitTextStroke: '5px var(--brand)', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
          {String(scene.n || 1).padStart(2, '0')}
        </div>
        <div style={{ marginTop: 20, fontFamily: FONT, fontWeight: 700, fontSize: 30, letterSpacing: 4, color: 'var(--brand)' }}>
          PART {scene.n || 1}
          {scene.of ? ` OF ${scene.of}` : ''}
        </div>
        <div style={{ height: 6, width: `${line * (wide ? 40 : 70)}%`, background: 'var(--brand)', borderRadius: 3, margin: '22px 0 30px' }} />
        <Words text={scene.title} delay={8} color={T.ink} style={{ fontSize: fitSize(scene.title, wide ? 90 : 84), fontWeight: 700, lineHeight: 1.2 }} />
        {scene.text && <div style={{ marginTop: 22, fontFamily: FONT, fontSize: 40, color: T.sub, opacity: line }}>{clean(scene.text)}</div>}
      </Body>
    </AbsoluteFill>
  )
}

function TrPoints({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const items = (scene.items || []).slice(0, 4)
  const grid = wide && items.length > 2
  const size = listSize(items.map((x) => x.text), 46, wide)
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body>
        {scene.title && <Words text={scene.title} color={T.ink} style={{ fontSize: fitSize(scene.title, wide ? 84 : 70), fontWeight: 700, marginBottom: wide ? 46 : 54 }} />}
        <div style={{ display: 'grid', gridTemplateColumns: grid ? '1fr 1fr' : '1fr', gap: wide ? 28 : 30 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - 12 - i * 10, fps, config: { damping: 14 } })
            return (
              <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 28, padding: '28px 32px', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
                <IconTile name={it.icon} size={wide ? 100 : 86} delay={14 + i * 10} />
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: size, color: T.ink, lineHeight: 1.3 }}>{clean(it.text)}</div>
              </div>
            )
          })}
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrChecklist({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const checks = (scene.checks || []).slice(0, 6)
  const size = listSize(checks, 42, wide)
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body>
        {scene.title && <Words text={scene.title} color={T.ink} style={{ fontSize: fitSize(scene.title, wide ? 84 : 68), fontWeight: 700, marginBottom: 40 }} />}
        <div style={{ ...card, padding: wide ? '20px 44px' : '16px 34px', display: 'grid', gridTemplateColumns: wide && checks.length > 4 ? '1fr 1fr' : '1fr', columnGap: 60 }}>
          {checks.map((c, i) => {
            const at = 14 + i * 14
            const s = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            const tick = spring({ frame: frame - at - 6, fps, config: { damping: 10 } })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '22px 0', borderBottom: i < checks.length - 1 ? `2px solid ${T.soft}` : 'none', opacity: 0.35 + 0.65 * s }}>
                <div style={{ flex: 'none', width: 58, height: 58, borderRadius: 16, border: '4px solid var(--brand)', display: 'grid', placeItems: 'center', background: tick > 0.5 ? 'var(--brand)' : 'transparent' }}>
                  <div style={{ transform: `scale(${tick})` }}>
                    <Icon name="Check" size={38} color="white" stroke={3.4} />
                  </div>
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: size, color: T.ink, lineHeight: 1.3 }}>{clean(c)}</div>
              </div>
            )
          })}
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrQuote({ scene }) {
  const frame = useCurrentFrame()
  const { wide } = useLayout()
  const who = interpolate(frame, [30, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: wide ? 260 : 220, lineHeight: 0.6, color: 'var(--brand)', height: wide ? 130 : 110 }}>“</div>
        <Words text={scene.text} delay={4} stagger={2} color={T.ink} style={{ fontSize: fitSize(scene.text, wide ? 100 : 76), fontWeight: 700, lineHeight: 1.35 }} />
        {scene.author && <div style={{ marginTop: 34, fontFamily: FONT, fontWeight: 600, fontSize: 36, color: T.sub, opacity: who }}>— {clean(scene.author)}</div>}
      </Body>
    </AbsoluteFill>
  )
}

function TrInsteadOf({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const { wide } = useLayout()
  const a = spring({ frame: frame - 4, fps, config: { damping: 14 } })
  const bAt = Math.min(36, Math.round(durationInFrames * 0.3))
  const b = spring({ frame: frame - bAt, fps, config: { damping: 12 } })
  const box = (label, text, s, good) => (
    <div style={{ ...card, flex: 1, padding: '34px 38px', opacity: s, transform: `translateY(${(1 - s) * 40}px)`, borderColor: good ? 'var(--brand)' : T.line, background: good ? 'color-mix(in srgb, var(--brand) 7%, white)' : T.card }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Icon name={good ? 'CircleCheck' : 'CircleX'} size={44} color={good ? brand.color : '#94A3B8'} stroke={2.6} />
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: good ? 'var(--brand)' : '#94A3B8' }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: Math.round(fitSize(text, 46) * (wide ? 1.2 : 1)), color: T.ink, lineHeight: 1.35 }}>{clean(text)}</div>
    </div>
  )
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        {scene.title && <Words text={scene.title} color={T.ink} style={{ fontSize: fitSize(scene.title, 68), fontWeight: 700, marginBottom: 40 }} />}
        <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 30, alignItems: 'stretch' }}>
          {box('INSTEAD OF', scene.before, a, false)}
          <div style={{ alignSelf: 'center', opacity: b, transform: wide ? 'none' : 'rotate(90deg)' }}>
            <Icon name="ArrowRight" size={64} color={brand.color} stroke={3} />
          </div>
          {box('DO THIS', scene.after, b, true)}
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrRecap({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const points = (scene.points || []).slice(0, 5)
  const tSize = listSize(points.map((x) => x.title), 44, wide)
  const dSize = listSize(points.map((x) => x.text || ''), 32, wide)
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body>
        {scene.title && <Words text={scene.title} color={T.ink} style={{ fontSize: fitSize(scene.title, 70), fontWeight: 700, marginBottom: 40 }} />}
        <div style={{ display: 'grid', gridTemplateColumns: wide ? `repeat(${Math.min(points.length, 4)}, 1fr)` : '1fr', gap: 24 }}>
          {points.map((p, i) => {
            const s = spring({ frame: frame - 10 - i * 12, fps, config: { damping: 13 } })
            return (
              <div key={i} style={{ ...card, padding: wide ? '30px 28px' : '24px 30px', display: 'flex', flexDirection: wide ? 'column' : 'row', gap: wide ? 18 : 24, alignItems: wide ? 'flex-start' : 'center', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
                <div style={{ flex: 'none', width: 72, height: 72, borderRadius: 36, background: 'var(--brand)', color: 'white', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 36 }}>{i + 1}</div>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: tSize, color: T.ink }}>{clean(p.title)}</div>
                  {p.text && <div style={{ marginTop: 6, fontFamily: FONT, fontWeight: 500, fontSize: dSize, color: T.sub, lineHeight: 1.35 }}>{clean(p.text)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrStat({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const s = spring({ frame, fps, config: { damping: 13 } })
  const value = Number(scene.value) || 0
  const shown = value * interpolate(frame, [8, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const digits = Number.isInteger(value) ? Math.round(shown).toLocaleString('en-US') : shown.toFixed(1)
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: wide ? 70 : 30, opacity: s }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 260 : 220, lineHeight: 1, color: 'var(--brand)', letterSpacing: -6 }}>
            {scene.prefix || ''}
            {digits}
            {scene.suffix || ''}
          </div>
          <Words text={scene.label} delay={14} color={T.ink} style={{ fontSize: fitSize(scene.label, 66), fontWeight: 700, maxWidth: wide ? 800 : 'none' }} />
        </div>
      </Body>
    </AbsoluteFill>
  )
}

function TrClosing({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { wide } = useLayout()
  const b = spring({ frame: frame - 24, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Page wide={wide} />
      <Body center>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 40 }}>
          {brand.logo ? (
            <div style={{ ...card, padding: '26px 44px' }}>
              <Img src={srcOf(brand.logo)} style={{ height: wide ? 110 : 120, maxWidth: 560, objectFit: 'contain' }} />
            </div>
          ) : (
            <Kicker>{clean(brand.name)}</Kicker>
          )}
          <Words text={scene.text} delay={4} align="center" color={T.ink} style={{ fontSize: fitSize(scene.text, wide ? 88 : 84), fontWeight: 700, lineHeight: 1.25, textAlign: 'center' }} />
          {scene.button && (
            <div style={{ padding: '22px 56px', borderRadius: 999, background: 'var(--brand)', color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: 44, transform: `scale(${b})`, opacity: b }}>{clean(scene.button)}</div>
          )}
        </div>
      </Body>
    </AbsoluteFill>
  )
}

/** The logo top-left — quiet, like a deck (no progress line). */
function TrainingChrome({ brand }) {
  const { width, height } = useVideoConfig()
  const wide = width > height
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: wide ? 52 : 70, left: wide ? 120 : 72, display: 'flex', alignItems: 'center', gap: 14 }}>
        {brand.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: wide ? 54 : 62, maxWidth: 280, objectFit: 'contain' }} />
        ) : (
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: T.ink }}>{clean(brand.name)}</span>
        )}
      </div>
    </AbsoluteFill>
  )
}

export const TRAINING = {
  scenes: { hook: TrTitle, chapter: TrChapter, list: TrPoints, checklist: TrChecklist, quote: TrQuote, beforeafter: TrInsteadOf, recap: TrRecap, stat: TrStat, cta: TrClosing },
  root: { backgroundColor: T.bg, '--hl-bg': 'var(--brand)', '--hl-text': '#FFFFFF' },
  light: true,
  chrome: TrainingChrome,
  // subtitles above the progress line: wide = 1080 tall, tall = 1920
  captionTop: (h) => (h < 1200 ? h - 175 : 1500),
}
