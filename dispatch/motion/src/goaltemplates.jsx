/**
 * One template per content goal (app/goals.py) — phase 1:
 *
 *   versus  (Authority)   old way vs new way, myth vs fact, a verdict
 *   poll    (Engagement)  a question, A/B/C options with a countdown, "comment"
 *   quote   (Followers)   one strong quote over a cinematic photo, "follow"
 *
 * Each exports its scenes, its root colours and which chrome / subtitle spot
 * it uses; MotionPost.jsx picks them by props.style. The script fields are
 * written by app/motion.py (VERSUS_PROMPT, POLL_PROMPT, QUOTE_PROMPT).
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf } from './shared'

// ── Comparison (Authority) ─────────────────────────────────────────────────
const V = { bg: '#F7F7F5', ink: '#141414', sub: '#56595f', red: '#E5533D', redSoft: '#FDE4DF', green: '#1E9E5B', greenSoft: '#DDF3E6' }

function VsPaper({ split = false }) {
  return (
    <AbsoluteFill style={{ backgroundColor: V.bg }}>
      {split && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', background: V.redSoft }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', background: V.greenSoft }} />
        </>
      )}
      <NeatGrid color="rgba(20,20,20,0.06)" />
      {split && (
        <>
          <div style={{ position: 'absolute', left: 537, top: 0, bottom: 0, width: 6, background: V.ink, opacity: 0.85 }} />
        </>
      )}
    </AbsoluteFill>
  )
}

function VsHook({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 4, fps, config: { damping: 10 } })
  return (
    <AbsoluteFill>
      <VsPaper split />
      <div style={{ position: 'absolute', top: 420, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 260 }}>
        <div style={{ transform: `scale(${s})`, width: 150, height: 150, borderRadius: 75, background: V.red, display: 'grid', placeItems: 'center' }}>
          <Icon name="CircleX" size={90} color="white" stroke={2.4} />
        </div>
        <div style={{ transform: `scale(${s})`, width: 150, height: 150, borderRadius: 75, background: V.green, display: 'grid', placeItems: 'center' }}>
          <Icon name="CircleCheck" size={90} color="white" stroke={2.4} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 680, left: 60, right: 60, background: 'white', border: `6px solid ${V.ink}`, borderRadius: 40, padding: '40px 40px' }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color={V.ink} style={{ fontSize: 96, fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

/** Old way (✗, red) vs new way (✓, green): the two columns fill in turn. */
function VsSplit({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const left = scene.left || {}
  const right = scene.right || {}
  const n = Math.max((left.points || []).length, (right.points || []).length)
  const column = (side, data, x, good) => {
    const head = spring({ frame: frame - (good ? 10 : 2), fps, config: { damping: 12 } })
    return (
      <div style={{ position: 'absolute', left: x, top: 400, width: 470 }}>
        <div style={{ transform: `scale(${head})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 150, height: 150, borderRadius: 40, background: good ? V.green : V.red, display: 'grid', placeItems: 'center' }}>
            <Icon name={data.icon || (good ? 'Rocket' : 'Hourglass')} size={84} color="white" stroke={2.2} />
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 800, letterSpacing: '-0.012em', fontSize: 60, color: V.ink, textAlign: 'center', lineHeight: 1.3 }}>{clean(data.label)}</div>
        </div>
        <div style={{ marginTop: 50 }}>
          {(data.points || []).slice(0, 3).map((p, i) => {
            // left 1 → right 1 → left 2 → right 2 …
            const s = spring({ frame: frame - 26 - (i * 2 + (good ? 1 : 0)) * 14, fps, config: { damping: 13 } })
            return (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 28, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
                <div style={{ flex: 'none', marginTop: 6 }}>
                  <Icon name={good ? 'CircleCheck' : 'CircleX'} size={52} color={good ? V.green : V.red} stroke={2.6} />
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 44, color: V.ink, lineHeight: 1.35 }}>{clean(p)}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <AbsoluteFill>
      <VsPaper split />
      {scene.title && (
        <div style={{ position: 'absolute', top: 200, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 940, background: 'white', border: `5px solid ${V.ink}`, borderRadius: 999, padding: '14px 44px' }}>
            <Words text={scene.title} align="center" color={V.ink} style={{ fontSize: 56, fontWeight: 700, textAlign: 'center' }} />
          </div>
        </div>
      )}
      {column('left', left, 40, false)}
      {column('right', right, 570, true)}
      <div style={{ position: 'absolute', left: 540 - 55, top: 440, width: 110, height: 110, borderRadius: 55, background: V.ink, color: 'white', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 42, opacity: n ? 1 : 0 }}>
        VS
      </div>
    </AbsoluteFill>
  )
}

/** "MYTH" — struck through — then "FACT" slides in under it. */
function VsMyth({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const myth = spring({ frame, fps, config: { damping: 13 } })
  const strike = interpolate(frame, [26, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const factAt = Math.min(48, Math.round(durationInFrames * 0.35))
  const fact = spring({ frame: frame - factAt, fps, config: { damping: 12 } })
  const card = (label, color, soft, text, s, struck) => (
    <div style={{ position: 'relative', margin: '0 70px 40px', background: soft, border: `6px solid ${color}`, borderRadius: 40, padding: '30px 40px 40px', opacity: s, transform: `translateY(${(1 - s) * 80}px)` }}>
      <div style={{ display: 'inline-block', background: color, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: 40, padding: '6px 24px', borderRadius: 999, marginBottom: 16 }}>{label}</div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.35,
          color: struck && strike > 0.5 ? V.sub : V.ink,
          textDecorationLine: struck && strike > 0 ? 'line-through' : 'none',
          textDecorationColor: `rgba(229,83,61,${strike})`,
          textDecorationThickness: 8,
        }}
      >
        {clean(text)}
      </div>
      {struck && (
        <div style={{ position: 'absolute', right: -20, top: -30, transform: `scale(${strike}) rotate(-12deg)`, width: 110, height: 110, borderRadius: 55, background: V.red, display: 'grid', placeItems: 'center' }}>
          <Icon name="X" size={70} color="white" stroke={3} />
        </div>
      )}
    </div>
  )
  return (
    <AbsoluteFill>
      <VsPaper />
      <div style={{ position: 'absolute', top: 330, left: 0, right: 0 }}>
        {card('MYTH', V.red, V.redSoft, scene.myth, myth, true)}
        {card('FACT', V.green, V.greenSoft, scene.fact, fact, false)}
      </div>
    </AbsoluteFill>
  )
}

function VsVerdict({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 9 } })
  return (
    <AbsoluteFill>
      <VsPaper />
      <div style={{ position: 'absolute', top: 360, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${s}) rotate(${(1 - s) * -20}deg)`, width: 240, height: 240, borderRadius: 120, background: V.green, display: 'grid', placeItems: 'center', boxShadow: '0 20px 50px rgba(30,158,91,0.35)' }}>
          <Icon name={scene.icon || 'Award'} size={130} color="white" stroke={2.2} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 700, left: 70, right: 70 }}>
        <Words text={scene.text} delay={4} stagger={1} align="center" color={V.ink} style={{ fontSize: 92, fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

function VsCta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = spring({ frame: frame - 22, fps, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <VsPaper />
      {brand.logo && (
        <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'white', border: 0, borderRadius: 10, padding: '22px 36px' }}>
            <Img src={srcOf(brand.logo)} style={{ height: 110, objectFit: 'contain' }} />
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', top: brand.logo ? 610 : 520, left: 70, right: 70 }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color={V.ink} style={{ fontSize: fitSize(scene.text, 90), fontWeight: 700, textAlign: 'center' }} />
      {/* the button follows the text, however many lines it wraps to */}
      {scene.button && (
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: V.green, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: 54, padding: '24px 58px', borderRadius: 999, transform: `scale(${b})`, opacity: b }}>
            <Icon name="Share2" size={48} color="white" stroke={2.4} />
            {clean(scene.button)}
          </div>
        </div>
      )}
      </div>
    </AbsoluteFill>
  )
}

export const VERSUS = {
  scenes: { hook: VsHook, split: VsSplit, myth: VsMyth, verdict: VsVerdict, cta: VsCta },
  root: { backgroundColor: V.bg, '--hl-bg': V.green, '--hl-text': 'white' },
  light: true,
  captionTop: 1430,
}

// ── Poll / quiz (Engagement) ───────────────────────────────────────────────
const P = { bg: '#1B1446', bg2: '#2E1F7A', ink: '#FFFFFF', gold: '#FFC93C', pink: '#FF5C8A', teal: '#22D3B6', sky: '#4FA8FF' }
const OPTION_COLORS = [P.pink, P.teal, P.gold, P.sky]

function Stage() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ backgroundColor: P.bg, overflow: 'hidden' }}>
      <NeatGrid color="rgba(255,255,255,0.07)" />
      {[...Array(18)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (i * 157) % 1080,
            top: ((i * 263) % 1800) + Math.sin((frame + i * 20) / 30) * 20,
            width: 10,
            height: 10,
            borderRadius: 5,
            background: OPTION_COLORS[i % 4],
            opacity: 0.5,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

function PollQuestion({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 11 } })
  const bob = Math.sin(frame / 10) * 8
  return (
    <AbsoluteFill>
      <Stage />
      <div style={{ position: 'absolute', top: 330 + bob, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${s}) rotate(${-8 + bob / 4}deg)`, width: 230, height: 230, borderRadius: 60, background: P.gold, display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 800, letterSpacing: '-0.012em', fontSize: 170, color: P.bg }}>?</div>
      </div>
      <div style={{ position: 'absolute', top: 650, left: 60, right: 60, background: 'rgba(255,255,255,0.08)', border: '4px solid rgba(255,255,255,0.25)', borderRadius: 44, padding: '44px 40px' }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color={P.ink} style={{ fontSize: 88, fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

/** A/B/C/D buttons pop in; a 5-second ring counts down; then the answer (if
 * the quiz has one) lights up — else "comment your answer". */
function PollOptions({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const opts = (scene.options || []).slice(0, 4)
  const countFrom = 24 + opts.length * 10
  const countLen = Math.max(60, Math.min(5 * fps, durationInFrames - countFrom - 30))
  const left = interpolate(frame, [countFrom, countFrom + countLen], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const secs = Math.ceil(left * (countLen / fps))
  const done = frame >= countFrom + countLen
  const answer = Number.isInteger(scene.answer) ? scene.answer : -1
  const R = 70
  const C = 2 * Math.PI * R
  return (
    <AbsoluteFill>
      <Stage />
      {scene.question && (
        <div style={{ position: 'absolute', top: 180, left: 60, right: 60 }}>
          <Words text={scene.question} align="center" color={P.ink} style={{ fontSize: 56, fontWeight: 700, textAlign: 'center' }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: 430, left: 70, right: 70 }}>
        {opts.map((o, i) => {
          const s = spring({ frame: frame - 14 - i * 10, fps, config: { damping: 11 } })
          const win = done && answer === i
          const lose = done && answer >= 0 && answer !== i
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                marginBottom: 26,
                padding: '18px 30px',
                borderRadius: 999,
                background: win ? P.gold : 'white',
                opacity: s * (lose ? 0.45 : 1),
                transform: `translateX(${(1 - s) * (i % 2 ? 300 : -300)}px) scale(${win ? 1.06 : 1})`,
                boxShadow: win ? `0 0 50px ${P.gold}` : '0 10px 30px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ flex: 'none', width: 92, height: 92, borderRadius: 46, background: OPTION_COLORS[i], color: 'white', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 52 }}>
                {'ABCD'[i]}
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, color: P.bg, lineHeight: 1.3 }}>{clean(o)}</div>
            </div>
          )
        })}
      </div>
      {/* countdown ring */}
      <div style={{ position: 'absolute', top: 430 + opts.length * 158 + 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: frame >= countFrom ? 1 : 0 }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={R} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="14" />
          <circle cx="90" cy="90" r={R} fill="none" stroke={P.gold} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left)} transform="rotate(-90 90 90)" />
          <text x="90" y="112" textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="64" fill="white">
            {done ? '✓' : secs}
          </text>
        </svg>
      </div>
    </AbsoluteFill>
  )
}

function PollReveal({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 9 } })
  return (
    <AbsoluteFill>
      <Stage />
      <div style={{ position: 'absolute', top: 360, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${s})`, width: 220, height: 220, borderRadius: 110, background: P.teal, display: 'grid', placeItems: 'center' }}>
          <Icon name={scene.icon || 'Lightbulb'} size={120} color="white" stroke={2.2} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 680, left: 70, right: 70 }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color={P.ink} style={{ fontSize: 80, fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

function PollCta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = spring({ frame: frame - 20, fps, config: { damping: 10 } })
  const bubbles = [0, 1, 2]
  return (
    <AbsoluteFill>
      <Stage />
      {bubbles.map((i) => {
        const s = spring({ frame: frame - 8 - i * 8, fps, config: { damping: 10 } })
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: [150, 690, 420][i], top: [330, 380, 250][i] + Math.sin((frame + i * 12) / 12) * 10, transform: `scale(${s})`, width: 170, height: 130, borderRadius: 40, background: OPTION_COLORS[i], display: 'grid', placeItems: 'center' }}
          >
            <Icon name="MessageCircle" size={70} color="white" stroke={2.4} />
          </div>
        )
      })}
      <div style={{ position: 'absolute', top: 640, left: 70, right: 70 }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color={P.ink} style={{ fontSize: fitSize(scene.text, 88), fontWeight: 700, textAlign: 'center' }} />
      {/* the button follows the text, however many lines it wraps to */}
      {scene.button && (
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: P.gold, color: P.bg, fontFamily: FONT, fontWeight: 800, letterSpacing: '-0.012em', fontSize: 56, padding: '24px 60px', borderRadius: 999, transform: `scale(${b * (1 + Math.sin(frame / 6) * 0.03)})`, opacity: b }}>
            <Icon name="MessageCircle" size={50} color={P.bg} stroke={2.6} />
            {clean(scene.button)}
          </div>
        </div>
      )}
      </div>
      {brand.logo && (
        <div style={{ position: 'absolute', bottom: 470, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'white', border: 0, borderRadius: 10, padding: '14px 26px' }}>
            <Img src={srcOf(brand.logo)} style={{ height: 70, objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}

export const POLL = {
  scenes: { hook: PollQuestion, question: PollQuestion, options: PollOptions, reveal: PollReveal, cta: PollCta },
  root: { backgroundColor: P.bg, '--hl-bg': P.gold, '--hl-text': P.bg },
  light: false,
  captionTop: 1330,
}

// ── Quote (Followers) ──────────────────────────────────────────────────────
function Cinema({ image }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: '#0c0c0f', overflow: 'hidden' }}>
      {image ? (
        <Img src={srcOf(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.08 + 0.1 * t})`, filter: 'brightness(0.3) saturate(0.7)' }} />
      ) : (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%, #3a2f24 0%, #0c0c0f 75%)' }} />
      )}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 45% at 50% 52%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%), linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.65) 100%)' }} />
      {/* letterbox bars */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 150, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: '#000' }} />
    </AbsoluteFill>
  )
}

function QuoteTitle({ scene }) {
  const frame = useCurrentFrame()
  const line = interpolate(frame, [6, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Cinema image={scene.image} />
      <div style={{ position: 'absolute', top: 780, left: 90, right: 90 }}>
        <div style={{ width: 160 * line, height: 6, background: '#E8C77A', marginBottom: 36 }} />
        <Words text={scene.text} delay={4} stagger={2} color="#F3EBDD" style={{ fontSize: 78, fontWeight: 600, letterSpacing: 1 }} />
      </div>
    </AbsoluteFill>
  )
}

/** The quote, written in slowly under a big quotation mark; then who said it. */
function QuoteScene({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const mark = spring({ frame, fps, config: { damping: 14 } })
  const authorAt = Math.round(durationInFrames * 0.62)
  const author = interpolate(frame, [authorAt, authorAt + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Cinema image={scene.image} />
      <div style={{ position: 'absolute', top: 340, left: 80, opacity: mark, transform: `translateY(${(1 - mark) * -30}px)`, fontFamily: 'Georgia, serif', fontSize: 300, lineHeight: 1, color: '#E8C77A' }}>“</div>
      <div style={{ position: 'absolute', top: 600, left: 90, right: 90 }}>
        <Words text={scene.text} delay={6} stagger={2} color="#F7F1E6" style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.5 }} />
      </div>
      {scene.author && (
        <div style={{ position: 'absolute', top: 1290, left: 90, right: 90, display: 'flex', alignItems: 'center', gap: 22, opacity: author }}>
          <div style={{ width: 70, height: 5, background: '#E8C77A' }} />
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 48, color: '#E8C77A' }}>{clean(scene.author)}</div>
        </div>
      )}
    </AbsoluteFill>
  )
}

function QuoteCta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = spring({ frame: frame - 18, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Cinema image={scene.image} />
      {brand.logo && (
        <div style={{ position: 'absolute', top: 470, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: b }}>
          <div style={{ background: 'rgba(255,255,255,0.92)', border: 0, borderRadius: 10, padding: '18px 30px' }}>
            <Img src={srcOf(brand.logo)} style={{ height: 96, objectFit: 'contain' }} />
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', top: 720, left: 90, right: 90 }}>
        <Words text={scene.text} delay={2} stagger={1} align="center" color="#F7F1E6" style={{ fontSize: fitSize(scene.text, 80), fontWeight: 600, textAlign: 'center' }} />
      {/* the button follows the text, however many lines it wraps to */}
      {scene.button && (
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, border: '4px solid #E8C77A', color: '#E8C77A', fontFamily: FONT, fontWeight: 700, fontSize: 52, padding: '22px 56px', borderRadius: 999, opacity: b, transform: `scale(${0.9 + 0.1 * b})` }}>
            <Icon name="UserPlus" size={48} color="#E8C77A" stroke={2.4} />
            {clean(scene.button)}
          </div>
        </div>
      )}
      </div>
    </AbsoluteFill>
  )
}

export const QUOTE = {
  scenes: { hook: QuoteTitle, title: QuoteTitle, quote: QuoteScene, cta: QuoteCta },
  root: { backgroundColor: '#000', '--hl-bg': '#E8C77A', '--hl-text': '#141414' },
  light: false,
  captionTop: 1500,
  noCaption: ['quote'], // the quote is on screen already — no subtitles over it
}
