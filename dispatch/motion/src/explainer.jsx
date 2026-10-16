/**
 * The Explainer style — a light, friendly "teach me" look for awareness and
 * education videos (inspired by Khmer money-explainer TikToks): a cream
 * background with soft pastel circles, one big dark title per scene, a stick
 * figure with a mood, objects with price tags, line charts that grow, two
 * people compared — and the narration as subtitles in a black pill.
 *
 * Scenes (script fields — written by app/motion.py):
 *   hook      { text, icon? }
 *   character { title, mood, icon?, tag? }        a person (+ an object with a tag)
 *   compare   { title, left: {name, mood, value, tone}, right: {…} }
 *   chart     { title, prefix?, suffix?, labels: [], series: [{ name, tone, values: [] }] }
 *   list      { title, items: [{ icon, text }] }
 *   stat      { value, prefix?, suffix?, label, icon? }
 *   cta       { text, button }
 * Any scene may carry `caption` (its spoken line) — shown as subtitles.
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, FPS, Icon, NeatGrid, Words, ZWSP, clean, fitSize, srcOf } from './shared'

export const EX = {
  bg: '#FBF6EC',
  ink: '#151515',
  sub: '#55524c',
  yellow: '#F4C542',
  green: '#1E9E5B',
  red: '#E5533D',
  blobA: '#F7DCA8',
  blobB: '#D3E8CC',
  blobC: '#F6E2C9',
}
const TONE = { good: EX.green, bad: EX.red, neutral: '#3B82F6' }
const GROUND = 1100 // y of the ground line

/** Cream paper with soft pastel circles drifting slowly. */
function Paper({ ground = false }) {
  const frame = useCurrentFrame()
  const a = frame / 70
  const blob = (color, size, left, top, dx, dy) => (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        opacity: 0.75,
        left: left + Math.sin(a) * dx,
        top: top + Math.cos(a * 0.8) * dy,
        filter: 'blur(2px)',
      }}
    />
  )
  return (
    <AbsoluteFill style={{ backgroundColor: EX.bg, overflow: 'hidden' }}>
      {blob(EX.blobA, 520, 760, 380, 30, 20)}
      {blob(EX.blobB, 560, -260, 1300, 25, 30)}
      {blob(EX.blobC, 300, 820, 1500, 20, 15)}
      <NeatGrid color="rgba(31,26,20,0.06)" />
      {ground && <div style={{ position: 'absolute', left: 70, right: 70, top: GROUND, height: 6, borderRadius: 3, background: EX.ink }} />}
    </AbsoluteFill>
  )
}

/** The scene's big dark title at the top. */
function Title({ text, top = 250, size = 104, delay = 0 }) {
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top, left: 60, right: 60 }}>
      <Words text={text} delay={delay} align="center" color={EX.ink} style={{ fontSize: size, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
    </div>
  )
}

/** A stick figure with a face that shows a mood; it breathes a little. */
export function StickFigure({ mood = 'happy', x, y, scale = 1, delay = 0, color = EX.ink }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } })
  const bob = Math.sin(frame / 14) * 3
  const mouth = {
    happy: 'M 82 62 Q 100 80 118 62',
    excited: 'M 80 60 Q 100 92 120 60 Z',
    sad: 'M 82 76 Q 100 60 118 76',
    worried: 'M 80 72 Q 90 64 100 72 Q 110 80 120 70',
    thinking: 'M 86 72 L 116 68',
  }[mood] || 'M 82 62 Q 100 80 118 62'
  const eyeY = mood === 'thinking' ? 40 : 46
  return (
    <svg
      width={200 * scale}
      height={400 * scale}
      viewBox="0 0 200 400"
      style={{ position: 'absolute', left: x - 100 * scale, top: y - 400 * scale + bob, opacity: s, transform: `scale(${0.6 + 0.4 * s})`, transformOrigin: 'bottom center' }}
    >
      <g fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="56" r="44" fill="white" />
        <path d="M 100 100 L 100 250" />
        <path d={mood === 'excited' ? 'M 100 140 L 50 90 M 100 140 L 150 90' : mood === 'thinking' ? 'M 100 140 L 60 200 M 100 140 L 128 110 L 112 70' : 'M 100 140 L 58 210 M 100 140 L 142 210'} />
        <path d="M 100 250 L 66 392 M 100 250 L 134 392" />
        <path d={mouth} fill={mood === 'excited' ? color : 'none'} />
      </g>
      <circle cx="84" cy={eyeY} r="6" fill={color} />
      <circle cx="116" cy={eyeY} r="6" fill={color} />
    </svg>
  )
}

/** A round face marker for chart lines — happy for good, sad for bad. */
function Face({ x, y, tone = 'good', size = 78 }) {
  const c = TONE[tone] || EX.ink
  const happy = tone !== 'bad'
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', left: x - size / 2, top: y - size / 2 }}>
      <circle cx="50" cy="50" r="44" fill="white" stroke={c} strokeWidth="8" />
      <circle cx="35" cy="42" r="6" fill={EX.ink} />
      <circle cx="65" cy="42" r="6" fill={EX.ink} />
      <path d={happy ? 'M 32 60 Q 50 76 68 60' : 'M 32 70 Q 50 56 68 70'} fill="none" stroke={EX.ink} strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

/** A price tag (yellow by default) with its hole — pops in with a little swing. */
function Tag({ text, x, y, color = EX.yellow, delay = 10, size = 64, anchor = 'center' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 9 } })
  if (!text) return null
  const swing = Math.sin(frame / 10) * 2 * s
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(${anchor === 'center' ? '-50%' : '0'}, -50%) scale(${s}) rotate(${-4 + swing}deg)`,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: `${size * 0.22}px ${size * 0.7}px ${size * 0.22}px ${size * 0.5}px`,
        background: color,
        border: `5px solid ${EX.ink}`,
        borderRadius: 14,
        clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)',
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size,
        color: EX.ink,
        whiteSpace: 'nowrap',
      }}
    >
      {clean(text)}
      <span style={{ width: size * 0.26, height: size * 0.26, borderRadius: '50%', border: `5px solid ${EX.ink}`, background: 'white' }} />
    </div>
  )
}

/** The narration as subtitles: a dark pill showing a phrase at a time.
 *
 * With ``words`` (app/speech.py speak_timed — when Azure says each word) a
 * phrase appears the moment its first word is spoken; without them the
 * phrases are spread over the line (``seconds``) by how long they take to
 * say. The pill fades in and out; inside it each new phrase fades up. */
export function Caption({ text, seconds, words, pauses, top = 1225, look }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const MAX = 22 // characters per phrase — one line
  const phrases = words?.length ? fromWords(words, fps, MAX) : fromText(text, seconds, fps, MAX, pauses)
  if (!phrases.length) return null
  const now = [...phrases].reverse().find((p) => frame >= p.from)
  const last = phrases[phrases.length - 1]
  if (!now || frame >= last.to) return null
  const FADE = 6 // frames
  const pill = Math.min(
    interpolate(frame, [phrases[0].from, phrases[0].from + FADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [last.to - FADE, last.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  )
  const line = interpolate(frame, [now.from, now.from + FADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (look?.kind === 'karaoke' && now.ws?.length) {
    // Karaoke (a template's caption look): no pill — big bold words; the ones
    // said are ink, the one being said has the marker sweeping under it, the
    // ones still to come are grey
    const cur = [...now.ws].reverse().find((w) => frame >= w.from) || now.ws[0]
    return (
      <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 70px', opacity: pill }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', fontFamily: FONT, fontWeight: 700, fontSize: look.size || 64, lineHeight: 1.35, opacity: line, transform: `translateY(${(1 - line) * 8}px)` }}>
          {now.ws.map((w, k) => {
            const said = frame >= w.from
            const on = w === cur
            const next = now.ws[k + 1]
            const sweep = on ? interpolate(frame, [w.from, next ? next.from : w.from + 12], [0.15, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
            return (
              <span key={k} style={{ position: 'relative', display: 'inline-block', marginLeft: w.sp ? '0.28em' : 0, color: said ? look.ink : look.todo, textShadow: '0 2px 14px rgba(255,255,255,0.9)' }}>
                {on && (
                  <span
                    style={{
                      position: 'absolute',
                      left: '-0.04em',
                      right: '-0.04em',
                      bottom: '0.06em',
                      height: '0.42em',
                      background: look.marker,
                      transform: `scaleX(${sweep})`,
                      transformOrigin: 'left center',
                      zIndex: -1,
                    }}
                  />
                )}
                {w.w}
              </span>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 70px', opacity: pill }}>
      <div
        style={{
          background: '#141414',
          color: 'white',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 50,
          lineHeight: 1.4,
          padding: '20px 40px',
          borderRadius: 26,
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        }}
      >
        <span style={{ display: 'inline-block', opacity: line, transform: `translateY(${(1 - line) * 8}px)` }}>{now.c}</span>
      </div>
    </div>
  )
}

const LEAD = 2 // frames — a phrase shows a hair before its first word is heard

/** Phrases from timed words: a new one when the line is full or a sentence ends. */
function fromWords(words, fps, max) {
  const out = []
  let cur = null
  for (const w of words) {
    const piece = (cur && w.sp ? ' ' : '') + w.w
    const at = Math.max(0, Math.round(w.t * fps) - LEAD)
    if (!cur || (cur.c + piece).length > max) {
      if (cur) out.push(cur)
      cur = { c: w.w, from: at, end: w.e, ws: [{ w: w.w, sp: false, from: at }] }
    } else {
      cur.c += piece
      cur.end = w.e
      cur.ws.push({ w: w.w, sp: !!w.sp, from: at })
    }
    if (/[.!?។៕]$/.test(w.w)) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out.map((p, i) => ({ c: p.c, ws: p.ws, from: p.from, to: i < out.length - 1 ? out[i + 1].from : Math.round((p.end + 0.5) * fps) }))
}

/** Phrases spread over the line by how long they take to say — measured in
 * spoken sounds, not characters: Khmer vowel signs and subscripts (្) are
 * part of a syllable, and a comma or full stop is a short pause. */
function fromText(text, seconds, fps, max, pauses = []) {
  if (!text) return []
  const pieces = []
  for (const w of String(text).split(' ').filter(Boolean)) {
    const parts = w.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => pieces.push({ p, gap: i === parts.length - 1 }))
  }
  const chunks = []
  let cur = ''
  for (const { p, gap } of pieces) {
    const next = cur + p + (gap ? ' ' : '')
    if (clean(next).trim().length > max && cur) {
      chunks.push(cur.trim())
      cur = p + (gap ? ' ' : '')
    } else cur = next
    // a comma or full stop ends the phrase, so a break falls where the voice breathes
    if (/[,.!?។៕]$/.test(clean(p)) && clean(cur).trim().length >= 8) {
      chunks.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  const weight = (c) => {
    let w = 0
    for (const ch of clean(c)) w += /[\u17B6-\u17D3\u17DD]/.test(ch) ? 0.25 : /[,.!?។៕:;—]/.test(ch) ? 3 : 1
    return Math.max(1, w)
  }
  const span = Math.max(1, (seconds || 3) * fps)
  const total = chunks.reduce((n, c) => n + weight(c), 0) || 1
  // where each phrase would start by its length — then moved onto the voice's
  // own pause nearest to it (app/motion.py _pauses), when there is one close by
  const starts = [0]
  let at = 0
  chunks.slice(0, -1).forEach((c) => {
    at += (weight(c) / total) * span
    let best = at
    for (const p of pauses || []) {
      const f = p * fps
      if (Math.abs(f - at) < Math.abs(best - at) && Math.abs(f - at) < 0.6 * fps && f > starts[starts.length - 1] + 0.5 * fps) best = f
    }
    starts.push(best)
  })
  const snapped = (pauses || []).length > 0
  return chunks.map((c, i) => {
    const from = i ? Math.round(starts[i]) - (snapped ? 0 : LEAD + 5) : 0
    const to = i < chunks.length - 1 ? Math.round(starts[i + 1]) - (snapped ? 0 : LEAD + 5) : Math.round(span + 0.4 * fps)
    // its words (Khmer split at the zero-width spaces), each starting by how long the ones before take to say
    const parts = []
    for (const w of c.split(' ').filter(Boolean)) w.split(ZWSP).filter(Boolean).forEach((p, k) => parts.push({ w: clean(p), sp: k === 0 && parts.length > 0 }))
    const sum = parts.reduce((n, p) => n + weight(p.w), 0) || 1
    const len = Math.max(1, (i < chunks.length - 1 ? starts[i + 1] : span) - starts[i])
    let acc = 0
    const ws = parts.map((p) => {
      const at = Math.max(0, from) + Math.round((acc / sum) * len * 0.92)
      acc += weight(p.w)
      return { ...p, from: at }
    })
    return { c: clean(c), ws, from: Math.max(0, from), to }
  })
}

// ── scenes ─────────────────────────────────────────────────────────────────
function ExHook({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <Paper />
      {scene.icon && (
        <div style={{ position: 'absolute', top: 360, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${s})` }}>
          <div style={{ width: 230, height: 230, borderRadius: 70, background: EX.yellow, border: `6px solid ${EX.ink}`, display: 'grid', placeItems: 'center' }}>
            <Icon name={scene.icon} size={120} color={EX.ink} stroke={2.2} />
          </div>
        </div>
      )}
      <Title text={scene.text} top={scene.icon ? 680 : 520} size={112} delay={0} />
    </AbsoluteFill>
  )
}

function ExCharacter({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const obj = spring({ frame: frame - 8, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Paper ground />
      <Title text={scene.title} />
      <StickFigure mood={scene.mood} x={scene.icon ? 300 : 540} y={GROUND} scale={1.25} />
      {scene.icon && (
        <div style={{ position: 'absolute', left: 560, top: GROUND - 470, width: 360, height: 460, display: 'grid', placeItems: 'end center', transform: `translateY(${(1 - obj) * 80}px)`, opacity: obj }}>
          <Icon name={scene.icon} size={330} color={EX.ink} stroke={1.6} />
        </div>
      )}
      {scene.icon && <Tag text={scene.tag} x={740} y={GROUND - 520} delay={18} />}
      {!scene.icon && scene.tag && <Tag text={scene.tag} x={540} y={GROUND - 560} delay={18} />}
    </AbsoluteFill>
  )
}

function ExCompare({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const vs = spring({ frame: frame - 14, fps, config: { damping: 10 } })
  const side = (p, x, delay) =>
    p ? (
      <>
        <StickFigure mood={p.mood} x={x} y={GROUND} scale={1.05} delay={delay} />
        <div style={{ position: 'absolute', left: x - 170, width: 340, top: GROUND + 30, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 54, color: EX.ink }}>{clean(p.name)}</div>
        <Tag text={p.value} x={x} y={GROUND - 500} color={p.tone === 'bad' ? '#F6B3A8' : p.tone === 'good' ? '#A8DDBE' : EX.yellow} delay={delay + 14} size={54} />
      </>
    ) : null
  return (
    <AbsoluteFill>
      <Paper ground />
      <Title text={scene.title} />
      {side(scene.left, 290, 4)}
      {side(scene.right, 790, 12)}
      <div style={{ position: 'absolute', left: 540 - 60, top: GROUND - 260, width: 120, height: 120, borderRadius: 60, background: EX.ink, color: 'white', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 46, transform: `scale(${vs})` }}>VS</div>
    </AbsoluteFill>
  )
}

const fmt = (v, prefix = '', suffix = '') => {
  const n = Math.round(v)
  return `${n < 0 ? '-' : ''}${prefix}${Math.abs(n).toLocaleString('en-US')}${suffix}`
}

/** One or two lines growing left to right, each ending in a face; the first
 * good line carries a tag that counts up with it. */
function ExChart({ scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const series = (scene.series || []).filter((s) => (s.values || []).length >= 2).slice(0, 2)
  const labels = scene.labels || []
  const all = series.flatMap((s) => s.values)
  const lo = Math.min(0, ...all)
  const hi = Math.max(1, ...all) * 1.15
  const X0 = 150
  const X1 = 960
  const Y0 = 560
  const Y1 = 1040
  const yOf = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)
  const zeroY = yOf(0)
  const labelY = Math.max(zeroY, yOf(lo)) + 64 // under the lowest point, clear of the lines
  const p = interpolate(frame, [14, Math.max(30, durationInFrames * 0.7)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const tagged = series.findIndex((s) => s.tone === 'good')
  return (
    <AbsoluteFill>
      <Paper />
      <Title text={scene.title} top={200} size={96} />
      {/* legend */}
      <div style={{ position: 'absolute', top: 420, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 50 }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT, fontWeight: 700, fontSize: 46, color: EX.ink }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: TONE[s.tone] || EX.ink }} />
            {clean(s.name)}
          </div>
        ))}
      </div>
      <svg width="1080" height="1920" style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={X0} y1={Y0 - 40} x2={X0} y2={Y1 + 30} stroke={EX.ink} strokeWidth="6" strokeLinecap="round" />
        <line x1={X0} y1={zeroY} x2={X1 + 20} y2={zeroY} stroke={EX.ink} strokeWidth="6" strokeLinecap="round" />
        {series.map((s, i) => {
          const n = s.values.length
          const f = p * (n - 1)
          const k = Math.floor(f)
          const pts = s.values.slice(0, k + 1).map((v, j) => [X0 + (j / (n - 1)) * (X1 - X0), yOf(v)])
          if (k < n - 1) {
            const v = s.values[k] + (s.values[k + 1] - s.values[k]) * (f - k)
            pts.push([X0 + (f / (n - 1)) * (X1 - X0), yOf(v)])
          }
          return (
            <polyline
              key={i}
              points={pts.map((q) => q.join(',')).join(' ')}
              fill="none"
              stroke={TONE[s.tone] || EX.ink}
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
        {labels.slice(0, 8).map((l, j) => {
          const n = Math.max(2, labels.length)
          const x = X0 + (j / (n - 1)) * (X1 - X0)
          return (
            <g key={j}>
              <line x1={x} y1={zeroY - 12} x2={x} y2={zeroY + 12} stroke={EX.ink} strokeWidth="5" />
              <text x={x} y={labelY} textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="40" fill={EX.sub}>
                {clean(l)}
              </text>
            </g>
          )
        })}
        <text x={X0 - 20} y={zeroY + 14} textAnchor="end" fontFamily={FONT} fontWeight="700" fontSize="40" fill={EX.sub}>
          {fmt(0, scene.prefix, '')}
        </text>
      </svg>
      {series.map((s, i) => {
        const n = s.values.length
        const f = p * (n - 1)
        const k = Math.min(n - 2, Math.floor(f))
        const v = s.values[k] + (s.values[k + 1] - s.values[k]) * (f - k)
        const x = X0 + (f / (n - 1)) * (X1 - X0)
        const y = yOf(v)
        return (
          <div key={i}>
            <Face x={x} y={y} tone={s.tone} />
            {i === tagged && (
              <Tag text={fmt(v, scene.prefix, scene.suffix)} x={Math.min(Math.max(x, 230), 850)} y={y - 110} color="#A8DDBE" delay={0} size={52} />
            )}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

function ExList({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <AbsoluteFill>
      <Paper />
      <Title text={scene.title} top={230} size={96} />
      <div style={{ position: 'absolute', top: 520, left: 80, right: 80 }}>
        {(scene.items || []).slice(0, 4).map((it, i) => {
          const s = spring({ frame: frame - 18 - i * 22, fps, config: { damping: 14 } })
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 30,
                marginBottom: 30,
                padding: '24px 30px',
                background: 'white',
                border: `5px solid ${EX.ink}`,
                borderRadius: 34,
                opacity: s,
                transform: `translateX(${(1 - s) * 200}px)`,
              }}
            >
              <div style={{ flex: 'none', width: 104, height: 104, borderRadius: 52, background: EX.yellow, border: `5px solid ${EX.ink}`, display: 'grid', placeItems: 'center' }}>
                <Icon name={it.icon} size={54} color={EX.ink} stroke={2.3} />
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 50, color: EX.ink, lineHeight: 1.35 }}>{clean(it.text)}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

function ExStat({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const value = Number(scene.value) || 0
  const shown = interpolate(frame, [8, 50], [0, value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pop = spring({ frame: frame - 4, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Paper />
      {scene.icon && (
        <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <Icon name={scene.icon} size={150} color={EX.ink} stroke={1.8} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 520,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 240,
          color: EX.ink,
          transform: `scale(${0.7 + 0.3 * pop})`,
        }}
      >
        {scene.prefix || ''}
        {(Number.isInteger(value) ? Math.round(shown) : shown.toFixed(1)).toLocaleString('en-US')}
        {scene.suffix || ''}
      </div>
      <div style={{ position: 'absolute', top: 870, left: 80, right: 80 }}>
        <Words text={scene.label} delay={18} align="center" color={EX.sub} style={{ fontSize: 64, fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

function ExCta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = spring({ frame: frame - 26, fps, config: { damping: 11 } })
  const logo = spring({ frame: frame - 2, fps, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <Paper />
      {brand.logo && (
        <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${logo})` }}>
          <div style={{ background: 'white', border: `5px solid ${EX.ink}`, borderRadius: 40, padding: '24px 40px' }}>
            <Img src={srcOf(brand.logo)} style={{ height: 120, objectFit: 'contain' }} />
          </div>
        </div>
      )}
      {/* The words, then the button right under them — however many lines the words wrap to. */}
      <div style={{ position: 'absolute', top: brand.logo ? 620 : 500, left: 60, right: 60 }}>
        <Words
          text={scene.text}
          delay={4}
          align="center"
          color={EX.ink}
          style={{ fontSize: fitSize(scene.text, 100), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}
        />
      {scene.button && (
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              background: EX.yellow,
              border: `6px solid ${EX.ink}`,
              color: EX.ink,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 56,
              padding: '26px 60px',
              borderRadius: 999,
              transform: `scale(${b * (1 + Math.sin(frame / 6) * 0.03)})`,
              opacity: b,
            }}
          >
            <Icon name="Bookmark" size={52} color={EX.ink} stroke={2.4} />
            {clean(scene.button)}
          </div>
        </div>
      )}
      </div>
    </AbsoluteFill>
  )
}

export const EXPLAINER_SCENES = {
  hook: ExHook,
  character: ExCharacter,
  compare: ExCompare,
  chart: ExChart,
  list: ExList,
  stat: ExStat,
  cta: ExCta,
}

/** The brand chip, top-left (no progress bars — they cluttered the top). */
export function ExplainerChrome({ brand }) {
  return (
    <AbsoluteFill style={{ padding: '64px 48px 0', pointerEvents: 'none' }}>
      <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 14, background: 'white', border: `4px solid ${EX.ink}`, borderRadius: 999, padding: brand.logo ? '8px 22px' : '12px 26px' }}>
        {/* The logo alone; the name only when there's no logo. */}
        {brand.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: 58, maxWidth: 250, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: EX.yellow, border: `3px solid ${EX.ink}` }} />
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: EX.ink }}>{brand.name}</span>
          </>
        )}
      </div>
    </AbsoluteFill>
  )
}

export { FPS }
