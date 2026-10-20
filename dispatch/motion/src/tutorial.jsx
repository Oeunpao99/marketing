/**
 * How-to videos for the app itself (the "Video tutorials" page): real
 * screenshots of Smart Marketing, 1920×1080, one step per scene. The camera
 * eases in on the part of the screen the step is about, a box draws itself
 * round it, the cursor glides over and clicks, and the Khmer narration plays
 * with word-timed subtitles.
 *
 *   { title, sub, lesson, next?,
 *     intro: { say, audio, words, seconds },
 *     steps: [ { shot, box?: [x, y, w, h] (screenshot px), label, say, audio, words, seconds,
 *                click?: false, zoom?: number } ],
 *     outro: { title, say, audio, words, seconds } }
 *
 * Screenshots are 1920×1080 (the app at 1600×900, scale 1.2), so a box is in
 * the same pixels as the frame. Made by motion/tools/make_tutorial.py.
 */
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { FONT, NeatGrid, srcOf } from './shared'

const BRAND = '#1f4e8c'
const HOT = '#f97316' // the box and the click: orange stands out on the app's blues and greys
const INK = '#0b1020'
const XFADE = 12

export const tutorialFrames = (s, fps = 30) => Math.round((s.seconds || 4) * fps)

/** Subtitles for a wide frame: phrases of up to ~46 characters, each shown when
 * its first word is spoken (words from app/speech.py speak_timed). */
function phrasesOf(words, fps, max = 46) {
  const out = []
  let cur = null
  for (const w of words || []) {
    const piece = (cur && w.sp ? ' ' : '') + w.w
    const at = Math.max(0, Math.round(w.t * fps) - 2)
    if (!cur || (cur.c + piece).length > max) {
      if (cur) out.push(cur)
      cur = { c: w.w, from: at, end: w.e }
    } else {
      cur.c += piece
      cur.end = w.e
    }
    if (/[.!?។៕]$/.test(w.w)) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out.map((p, i) => ({ c: p.c, from: p.from, to: i < out.length - 1 ? out[i + 1].from : Math.round((p.end + 0.6) * fps) }))
}

function Subtitle({ words, delay = 0 }) {
  const frame = useCurrentFrame() - delay
  const { fps } = useVideoConfig()
  const phrases = phrasesOf(words, fps)
  const now = [...phrases].reverse().find((p) => frame >= p.from)
  if (!now || frame >= now.to) return null
  const a = interpolate(frame, [now.from, now.from + 5], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 54, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(11,16,32,0.88)',
          color: 'white',
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 40,
          lineHeight: 1.45,
          padding: '14px 34px',
          borderRadius: 22,
          boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
          opacity: a,
          transform: `translateY(${(1 - a) * 8}px)`,
        }}
      >
        {now.c}
      </div>
    </div>
  )
}

/** The camera: from the whole screen, eases in on the box (never past the
 * screenshot's edges). */
function camera(box, frame, fps, zoom) {
  if (!box) {
    const s = interpolate(frame, [0, 6 * fps], [1, 1.04], { extrapolateRight: 'clamp' })
    return { s, x: 960, y: 540 }
  }
  const [bx, by, bw, bh] = box
  const target = zoom || Math.max(1, Math.min(1.75, Math.min((1920 * 0.42) / bw, (1080 * 0.42) / bh)))
  const p = spring({ frame: frame - 8, fps, config: { damping: 200 }, durationInFrames: 26 })
  const s = 1 + (target - 1) * p
  // keep the frame inside the screenshot at this scale
  const half = (v, size) => Math.min(Math.max(v, size / 2 / s), size - size / 2 / s)
  const cx = half(bx + bw / 2, 1920)
  const cy = half(by + bh / 2, 1080)
  return { s, x: 960 + (cx - 960) * p, y: 540 + (cy - 540) * p }
}

function Pointer({ x, y, press }) {
  return (
    <svg width="44" height="54" viewBox="0 0 22 27" style={{ position: 'absolute', left: x - 4, top: y - 2, transform: `scale(${press})`, transformOrigin: '4px 2px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))' }}>
      <path d="M2 1 L2 21 L7.2 16.4 L10.6 24.6 L14 23.2 L10.7 15.2 L17.6 15.2 Z" fill="white" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function StepScene({ step, n, of, from }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const box = step.box
  const cam = camera(box, frame, fps, step.zoom)

  // the box draws itself once the camera has arrived
  const DRAW = 34
  const draw = interpolate(frame, [DRAW, DRAW + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const dim = interpolate(frame, [DRAW, DRAW + 12], [0, 0.42], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pulse = frame > DRAW + 18 ? 0.5 + 0.5 * Math.sin((frame - DRAW - 18) / 7) : 0

  // the cursor glides in from where the last step left it, then clicks
  const click = step.click !== false && box
  const [sx, sy] = from || [1100, 760]
  const go = spring({ frame: frame - 18, fps, config: { damping: 200 }, durationInFrames: 30 })
  const tx = box ? box[0] + box[2] * 0.5 : sx
  const ty = box ? box[1] + box[3] * 0.55 : sy
  const px = sx + (tx - sx) * go
  const py = sy + (ty - sy) * go
  const CLICK = DRAW + 22
  const press = click ? interpolate(frame, [CLICK, CLICK + 3, CLICK + 8], [1, 0.82, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1
  const ring = interpolate(frame, [CLICK, CLICK + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const chip = spring({ frame: frame - 4, fps, config: { damping: 18 } })

  return (
    <AbsoluteFill style={{ background: '#e9edf5', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${cam.s}) translate(${960 - cam.x}px, ${540 - cam.y}px)`, transformOrigin: '960px 540px' }}>
        <Img src={srcOf(step.shot)} style={{ width: 1920, height: 1080 }} />
        {box && (
          <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <mask id={`hole${n}`}>
                <rect width="1920" height="1080" fill="white" />
                <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx="14" fill="black" />
              </mask>
            </defs>
            <rect width="1920" height="1080" fill={`rgba(11,16,32,${dim})`} mask={`url(#hole${n})`} />
            <rect
              x={box[0]}
              y={box[1]}
              width={box[2]}
              height={box[3]}
              rx="14"
              fill="none"
              stroke={HOT}
              strokeWidth={5 / Math.max(1, cam.s * 0.8)}
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - draw}
              style={{ filter: `drop-shadow(0 0 ${6 + pulse * 10}px rgba(249,115,22,0.75))` }}
            />
          </svg>
        )}
        {click && ring > 0 && ring < 1 && (
          <div
            style={{
              position: 'absolute',
              left: tx - 40,
              top: ty - 40,
              width: 80,
              height: 80,
              borderRadius: '50%',
              border: `4px solid ${HOT}`,
              transform: `scale(${0.3 + ring * 1.2})`,
              opacity: 1 - ring,
            }}
          />
        )}
        {box && <Pointer x={px} y={py} press={press} />}
      </AbsoluteFill>

      {/* the step: number and what to do */}
      {step.label && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 26px 12px 12px',
            background: 'white',
            borderRadius: 999,
            boxShadow: '0 14px 34px rgba(11,16,32,0.18)',
            fontFamily: FONT,
            transform: `translateY(${(1 - chip) * -30}px)`,
            opacity: chip,
          }}
        >
          <span style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', background: BRAND, color: 'white', fontWeight: 800, fontSize: 26 }}>{n}</span>
          <span style={{ fontWeight: 700, fontSize: 32, color: INK }}>{step.label}</span>
          <span style={{ fontWeight: 600, fontSize: 22, color: '#64748b', marginLeft: 6 }}>
            {n}/{of}
          </span>
        </div>
      )}
      <Subtitle words={step.words} delay={6} />
      <Sequence from={click ? CLICK : 100000} durationInFrames={20}>
        <Html5Audio src={staticFile('sfx/click.mp3')} volume={0.5} />
      </Sequence>
      {step.audio && (
        <Sequence from={6}>
          <Html5Audio src={srcOf(step.audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}

function Card({ kicker, title, sub, say, words, audio, done }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const a = spring({ frame, fps, config: { damping: 16 } })
  const b = spring({ frame: frame - 8, fps, config: { damping: 18 } })
  return (
    <AbsoluteFill style={{ background: '#f6f8fc', fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
      <NeatGrid color="rgba(31,78,140,0.07)" size={72} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transform: `translateY(${(1 - a) * 40}px)`, opacity: a }}>
        {done ? (
          <div style={{ width: 130, height: 130, borderRadius: '50%', background: '#10b981', display: 'grid', placeItems: 'center', boxShadow: '0 20px 50px rgba(16,185,129,0.35)', transform: `scale(${a})` }}>
            <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - b} />
            </svg>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Img src={staticFile('ours/smart-marketing.png')} style={{ height: 76 }} />
          </div>
        )}
        {kicker && (
          <div style={{ marginTop: 44, padding: '10px 26px', borderRadius: 999, background: BRAND, color: 'white', fontWeight: 700, fontSize: 30, opacity: b }}>{kicker}</div>
        )}
        <div style={{ marginTop: 28, fontWeight: 800, fontSize: 92, lineHeight: 1.3, color: INK, maxWidth: 1500, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>{title}</div>
        {sub && <div style={{ marginTop: 14, fontWeight: 500, fontSize: 36, color: '#475569', opacity: b }}>{sub}</div>}
      </div>
      <Subtitle words={words} delay={10} />
      {audio && (
        <Sequence from={10}>
          <Html5Audio src={srcOf(audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}

export function tutorialLength(props, fps = 30) {
  const scenes = [props.intro, ...props.steps, props.outro]
  return scenes.reduce((n, s) => n + tutorialFrames(s, fps), 0) - XFADE * (scenes.length - 1)
}

export function Tutorial(props) {
  const { title, sub, lesson, steps, intro, outro } = props
  const t = linearTiming({ durationInFrames: XFADE })
  const items = []
  items.push(
    <TransitionSeries.Sequence key="intro" durationInFrames={tutorialFrames(intro)}>
      <Card kicker={lesson} title={title} sub={sub} {...intro} />
    </TransitionSeries.Sequence>,
  )
  steps.forEach((s, i) => {
    const prev = steps[i - 1]?.box
    const from = prev ? [prev[0] + prev[2] * 0.5, prev[1] + prev[3] * 0.55] : null
    items.push(<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={t} />)
    items.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={tutorialFrames(s)}>
        <StepScene step={s} n={i + 1} of={steps.length} from={from} />
      </TransitionSeries.Sequence>,
    )
  })
  items.push(<TransitionSeries.Transition key="tout" presentation={fade()} timing={t} />)
  items.push(
    <TransitionSeries.Sequence key="outro" durationInFrames={tutorialFrames(outro)}>
      <Card title={outro.title} sub={outro.sub} done {...outro} />
    </TransitionSeries.Sequence>,
  )
  return (
    <AbsoluteFill style={{ background: 'white' }}>
      <TransitionSeries>{items}</TransitionSeries>
    </AbsoluteFill>
  )
}
