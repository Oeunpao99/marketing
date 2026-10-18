/**
 * "Rise · Mindset" — a motivational video told as one climb: a little person
 * (characters.jsx) climbs a staircase a step per idea, each step carrying a
 * habit, while the sky turns from night to sunrise — one flat colour per
 * moment, never a gradient. Old me vs new me side by side, a seed growing into
 * a plant, the lesson at the summit with a flag. Big bold words, key words in
 * gold (dark sky) or orange (light sky). All drawn in code. 9:16 and 16:9.
 * Scene types: hook · climb · mirror · grow · summit · cta (app/motion.py
 * RISE_TYPES); build_props numbers them (n / of) so the climb and the sky
 * move on through the video.
 */
import { AbsoluteFill, Easing, interpolate, interpolateColors, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, clean, fitSize } from './shared'
import { Figure } from './characters'
import { Pop } from './cartoon'

const SKY = ['#141833', '#2A2350', '#5B3769', '#B5577A', '#EE8C6A', '#F8C58C', '#FCE8C8']
const STEP = '#1E1B2E'
const GOLD = '#FFC857'
const ORANGE = '#E8641C'
const HERO = { look: 'ponytail', color: 'orange' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

/** How far through the video this scene is (0 → 1): the climb and the sky follow it. */
function useStage(scene) {
  const { width: W, height: H, fps } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  const of = Math.max(1, Number(scene.of) || 1)
  const n = Math.max(0, Math.min(of - 1, Number(scene.n) || 0))
  const p = of > 1 ? n / (of - 1) : 0
  const sky = interpolateColors(p, SKY.map((_, i) => i / (SKY.length - 1)), SKY)
  const light = p > 0.5
  return {
    W, H, fps, wide, u, n, of, p, sky, light,
    ink: light ? STEP : '#FFFFFF',
    accent: light ? ORANGE : GOLD,
    horizon: wide ? H * 0.78 : H * 0.72,
    text: wide ? { x: 90 * u, y: 120 * u, w: W * 0.46 } : { x: 60 * u, y: 230 * u, w: W - 120 * u },
  }
}

// ── the sky ────────────────────────────────────────────────────────────────
/** One flat sky colour, stars fading as the sun comes up, flat hills, a few clouds. */
function Sky({ stage }) {
  const frame = useCurrentFrame()
  const { W, H, u, p, sky, horizon, wide } = stage
  const sunY = interpolate(p, [0, 1], [horizon + 60 * u, horizon - (wide ? 620 : 900) * u])
  return (
    <AbsoluteFill style={{ backgroundColor: sky, overflow: 'hidden' }}>
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: random(`sx${i}`) * W, top: random(`sy${i}`) * horizon * 0.8, width: (3 + random(`ss${i}`) * 4) * u, height: (3 + random(`ss${i}`) * 4) * u, borderRadius: 9, background: 'white', opacity: Math.max(0, 1 - p * 2.2) * (0.5 + 0.5 * Math.sin(frame / 9 + i)) }} />
      ))}
      <div style={{ position: 'absolute', left: W * (wide ? 0.82 : 0.74) - 110 * u, top: sunY - 110 * u, width: 220 * u, height: 220 * u, borderRadius: '50%', background: GOLD, transform: `scale(${1 + Math.sin(frame / 20) * 0.02})` }} />
      {p > 0.4 &&
        [0.18, 0.6].map((x, i) => (
          <div key={i} style={{ position: 'absolute', left: ((x * W + frame * (0.4 + i * 0.3)) % (W + 300 * u)) - 150 * u, top: horizon * (wide ? 0.38 + i * 0.14 : 0.5 + i * 0.12), width: 260 * u, height: 70 * u, borderRadius: 70 * u, background: 'rgba(255,255,255,0.75)', opacity: Math.min(1, (p - 0.4) * 4) }} />
        ))}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M 0 ${horizon - 120 * u} L ${W * 0.22} ${horizon - 260 * u} L ${W * 0.45} ${horizon - 140 * u} L ${W * 0.7} ${horizon - 300 * u} L ${W} ${horizon - 150 * u} L ${W} ${H} L 0 ${H} Z`} fill="rgba(0,0,0,0.16)" />
        <path d={`M 0 ${horizon - 30 * u} L ${W * 0.3} ${horizon - 120 * u} L ${W * 0.6} ${horizon - 40 * u} L ${W * 0.85} ${horizon - 110 * u} L ${W} ${horizon - 60 * u} L ${W} ${H} L 0 ${H} Z`} fill="rgba(0,0,0,0.24)" />
      </svg>
    </AbsoluteFill>
  )
}

/** The scene's big words at the top (left in 16:9). */
function Words({ stage, title, text, size = 104, delay = 0.15 }) {
  const { u, wide, ink, accent, text: box } = stage
  const line = spring({ frame: useCurrentFrame() - 30, fps: 30, config: { damping: 14 } })
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, display: 'flex', flexDirection: 'column', alignItems: wide ? 'flex-start' : 'center', gap: 22 * u }}>
      {title && <Pop text={title} size={size * u} width={box.w} delay={delay} color={ink} accent={accent} align={wide ? 'left' : 'center'} />}
      {text && (
        <div style={{ width: box.w, transform: `translateY(${(1 - line) * 20}px)`, fontFamily: FONT, fontWeight: 600, fontSize: fitSize(text, 50 * u), lineHeight: 1.5, color: ink, opacity: 0.9 * line, textAlign: wide ? 'left' : 'center' }}>{clean(text)}</div>
      )}
    </div>
  )
}

// ── the staircase ──────────────────────────────────────────────────────────
/** Steps going up to the right; the hero on step ``n``, hopping up from n-1 in a climb. */
function Stairs({ stage, climb = false, word, mood = 'happy', talking = false }) {
  const frame = useCurrentFrame()
  const { W, H, u, n, wide, accent } = stage
  const stepW = (wide ? 200 : 190) * u
  const rise = (wide ? 80 : 104) * u
  const cx = wide ? W * 0.66 : W * 0.38
  const gy = wide ? H * 0.8 : 1320 * u
  const t = climb && n > 0 ? interpolate(frame, [6, 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1
  const pos = n - 1 + t
  const hop = climb ? Math.sin(Math.PI * t) * 46 * u : 0
  const first = Math.floor(pos) - 6
  const steps = Array.from({ length: 16 }, (_, k) => first + k).filter((j) => j >= 0)
  const lit = interpolate(frame, [22, 34], [0, 1], clamp)
  return (
    <>
      {steps.map((j) => {
        const d = j - pos
        const left = cx - stepW / 2 + d * stepW
        const top = gy - d * rise
        if (left > W || left + stepW < 0) return null
        const label = j === n && word
        return (
          <div key={j} style={{ position: 'absolute', left, top, width: stepW + 1, height: H - top + 10, background: STEP, borderTop: `${6 * u}px solid ${j === n ? accent : '#3A355A'}` }}>
            {label && (
              <div style={{ position: 'absolute', left: -stepW * 0.4, width: stepW * 1.8, top: 22 * u, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(word, 40 * u), color: accent, lineHeight: 1.4, opacity: lit, transform: `scale(${0.8 + 0.2 * lit})` }}>{clean(word)}</div>
            )}
          </div>
        )
      })}
      <Figure x={cx} ground={gy - hop + 3 * u} h={(wide ? 300 : 420) * u} {...HERO} mood={mood} talking={talking} wave={false} seed={1} />
    </>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene }) {
  const stage = useStage(scene)
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <Stairs stage={stage} mood={scene.mood || 'thinking'} talking={!!scene.caption} />
      <Words stage={stage} title={scene.text} size={118} />
    </AbsoluteFill>
  )
}

function Climb({ scene }) {
  const stage = useStage(scene)
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <Stairs stage={stage} climb word={scene.word} mood="excited" talking={!!scene.caption} />
      <Words stage={stage} title={scene.title} text={scene.text} />
    </AbsoluteFill>
  )
}

/** Old me and new me, side by side. */
function Mirror({ scene }) {
  const frame = useCurrentFrame()
  const stage = useStage(scene)
  const { W, u, wide, horizon, accent, ink } = stage
  const h = (wide ? 340 : 460) * u
  const gy = wide ? horizon + 110 * u : 1360 * u
  const xs = wide ? [W * 0.6, W * 0.86] : [W * 0.27, W * 0.73]
  const a = spring({ frame: frame - 8, fps: 30, config: { damping: 13 } })
  const b = spring({ frame: frame - 34, fps: 30, config: { damping: 11 } })
  const card = (text, x, good, p) => (
    <div style={{ position: 'absolute', left: x - (wide ? 210 : 230) * u, width: (wide ? 420 : 460) * u, top: gy + 30 * u, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ display: 'inline-block', padding: `${10 * u}px ${22 * u}px`, borderRadius: 22 * u, background: good ? accent : 'rgba(255,255,255,0.14)', border: `${3 * u}px solid ${good ? accent : 'rgba(255,255,255,0.4)'}`, color: good ? STEP : ink, fontFamily: FONT, fontWeight: 700, fontSize: fitSize(text, 38 * u), lineHeight: 1.45 }}>{clean(text)}</div>
    </div>
  )
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: gy, bottom: 0, background: STEP }} />
      <div style={{ filter: 'grayscale(1)', opacity: 0.75 }}>
        <Figure x={xs[0]} ground={gy} h={h * 0.92} look={HERO.look} color="grey" mood="sad" enter={a} seed={2} />
      </div>
      <Figure x={xs[1]} ground={gy} h={h * 1.06} {...HERO} mood="excited" wave={b > 0.9} enter={b} seed={1} />
      <svg width={W} height={200 * u} style={{ position: 'absolute', left: 0, top: gy - h * 0.6 - 100 * u, overflow: 'visible' }}>
        <path d={`M ${xs[0] + 110 * u} ${100 * u} Q ${(xs[0] + xs[1]) / 2} ${30 * u} ${xs[1] - 110 * u} ${100 * u}`} fill="none" stroke={accent} strokeWidth={8 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - interpolate(frame, [20, 40], [0, 1], clamp)} />
        <path d={`M ${xs[1] - 140 * u} ${78 * u} L ${xs[1] - 108 * u} ${102 * u} L ${xs[1] - 142 * u} ${118 * u}`} fill="none" stroke={accent} strokeWidth={8 * u} strokeLinecap="round" strokeLinejoin="round" opacity={interpolate(frame, [36, 42], [0, 1], clamp)} />
      </svg>
      {card(scene.before, xs[0], false, a)}
      {card(scene.after, xs[1], true, b)}
      <Words stage={stage} title={scene.title} />
    </AbsoluteFill>
  )
}

/** A seed in a pot growing into a plant with a flower. */
function Grow({ scene }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const stage = useStage(scene)
  const { W, u, wide, horizon, accent } = stage
  const gy = wide ? horizon + 100 * u : 1340 * u
  const cx = wide ? W * 0.72 : W / 2
  const g = interpolate(frame, [10, Math.max(40, durationInFrames * 0.7)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const stem = (wide ? 380 : 470) * u
  const leaves = [0.3, 0.5, 0.7, 0.85]
  const bloom = interpolate(g, [0.88, 1], [0, 1], clamp)
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: gy, bottom: 0, background: STEP }} />
      <svg width={W} height={gy + 10} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <path d={`M ${cx} ${gy - 150 * u} C ${cx - 40 * u} ${gy - 150 * u - stem * 0.4}, ${cx + 40 * u} ${gy - 150 * u - stem * 0.7}, ${cx} ${gy - 150 * u - stem}`} fill="none" stroke="#3DB36E" strokeWidth={14 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - g} />
        {leaves.map((at, i) => {
          const s = interpolate(g, [at, at + 0.12], [0, 1], clamp)
          const y = gy - 150 * u - stem * at
          const side = i % 2 ? 1 : -1
          return <path key={i} d={`M ${cx} ${y} q ${side * 70 * u} ${-60 * u} ${side * 140 * u} ${-10 * u} q ${-side * 60 * u} ${50 * u} ${-side * 140 * u} ${10 * u} Z`} fill="#3DB36E" stroke={STEP} strokeWidth={4 * u} transform={`translate(${cx} ${y}) scale(${s}) translate(${-cx} ${-y})`} />
        })}
        <g transform={`translate(${cx} ${gy - 150 * u - stem}) scale(${bloom})`}>
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx={0} cy={-38 * u} rx={22 * u} ry={38 * u} fill={accent} stroke={STEP} strokeWidth={4 * u} transform={`rotate(${i * 60 + frame * 0.5})`} />
          ))}
          <circle r={24 * u} fill={GOLD} stroke={STEP} strokeWidth={4 * u} />
        </g>
        <path d={`M ${cx - 110 * u} ${gy - 160 * u} L ${cx + 110 * u} ${gy - 160 * u} L ${cx + 85 * u} ${gy} L ${cx - 85 * u} ${gy} Z`} fill={ORANGE} stroke={STEP} strokeWidth={6 * u} strokeLinejoin="round" />
        <rect x={cx - 125 * u} y={gy - 185 * u} width={250 * u} height={40 * u} rx={10 * u} fill={ORANGE} stroke={STEP} strokeWidth={6 * u} />
      </svg>
      <Words stage={stage} title={scene.title} text={scene.text} />
    </AbsoluteFill>
  )
}

/** The top of the climb: a peak, the hero with a flag, the lesson. */
function Peak({ stage, wave = false, mood = 'excited' }) {
  const frame = useCurrentFrame()
  const { W, H, u, wide } = stage
  const cx = wide ? W * 0.72 : W / 2
  const top = wide ? H * 0.55 : 1180 * u
  const flag = spring({ frame: frame - 14, fps: 30, config: { damping: 12 } })
  return (
    <>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M ${cx - (wide ? 600 : 700) * u} ${H} L ${cx} ${top} L ${cx + (wide ? 600 : 700) * u} ${H} Z`} fill={STEP} />
        <path d={`M ${cx - 90 * u} ${top + 80 * u} L ${cx} ${top} L ${cx + 90 * u} ${top + 80 * u} L ${cx + 40 * u} ${top + 60 * u} L ${cx} ${top + 90 * u} L ${cx - 40 * u} ${top + 60 * u} Z`} fill="white" opacity={0.85} />
        {/* the flag planted on the slope, a little right of the top */}
        <g transform={`translate(${cx + 90 * u} ${top + (90 * u * (H - top)) / ((wide ? 600 : 700) * u) + 4 * u}) scale(1 ${flag})`}>
          <line x1={0} y1={0} x2={0} y2={-260 * u} stroke="white" strokeWidth={8 * u} strokeLinecap="round" />
          <path d={`M 0 ${-260 * u} L ${(120 + Math.sin(frame / 5) * 10) * u} ${-225 * u} L 0 ${-190 * u} Z`} fill={ORANGE} stroke={STEP} strokeWidth={4 * u} />
        </g>
      </svg>
      <Figure x={cx - 20 * u} ground={top + (20 * u * (H - top)) / ((wide ? 600 : 700) * u) + 6 * u} h={(wide ? 280 : 380) * u} {...HERO} mood={mood} wave={wave} seed={1} />
    </>
  )
}

function Summit({ scene }) {
  const stage = useStage({ ...scene, n: Math.max(1, (scene.of || 2) - 1) }) // the sky's brightest at the top
  const who = [scene.author].filter(Boolean).map(clean).join('')
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <Peak stage={stage} wave />
      <Words stage={stage} title={scene.text} text={who ? `— ${who}` : ''} size={92} />
    </AbsoluteFill>
  )
}

function Cta({ scene }) {
  const frame = useCurrentFrame()
  const stage = useStage({ ...scene, n: Math.max(1, (scene.of || 2) - 1) })
  const { u, wide, text: box } = stage
  const b = spring({ frame: frame - 26, fps: 30, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <Sky stage={stage} />
      <Peak stage={stage} wave />
      <Words stage={stage} title={scene.text} size={92} />
      {scene.button && (
        <div style={{ position: 'absolute', left: box.x, width: box.w, top: box.y + (wide ? 330 : 400) * u, display: 'flex', justifyContent: wide ? 'flex-start' : 'center' }}>
          <div style={{ padding: `${22 * u}px ${58 * u}px`, borderRadius: 999, background: ORANGE, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: 50 * u, border: `${5 * u}px solid ${STEP}`, boxShadow: `${6 * u}px ${7 * u}px 0 ${STEP}`, transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.02)})` }}>{clean(scene.button)}</div>
        </div>
      )}
    </AbsoluteFill>
  )
}

export const RISE = {
  scenes: { hook: Hook, climb: Climb, mirror: Mirror, grow: Grow, summit: Summit, cta: Cta },
  root: { backgroundColor: SKY[0] },
  light: true, // the logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
