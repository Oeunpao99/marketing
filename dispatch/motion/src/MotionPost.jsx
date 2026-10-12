/**
 * A vertical motion post (1080×1920): animated Khmer / Latin text over the
 * brand's photos, a numbered point per scene, and a call-to-action ending.
 * Everything is driven by the script JSON (see ../sample.json):
 *
 *   { brand: { name, color, logo },
 *     scenes: [ { type: "hook" | "point" | "cta", text, title, image, seconds } ] }
 *
 * Khmer comes pre-split into words with zero-width spaces (backend
 * app/khmer_words.py), so words animate one by one and lines only break
 * between whole words. Text is drawn with the real font — never garbled.
 */
import {
  AbsoluteFill,
  Img,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { TransitionSeries, springTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { wipe } from '@remotion/transitions/wipe'

export const FPS = 30
export const TRANSITION = 14 // frames two scenes overlap while they change
const FONT = 'Kantumruy'
const SECONDS = { hook: 3.6, point: 3.4, cta: 3.8 }

export const sceneFrames = (s) => Math.round((s.seconds || SECONDS[s.type] || 3.5) * FPS)

// The Khmer + Latin font — the render waits until it's loaded.
const fontWait = delayRender('Loading the Khmer font')
new FontFace(FONT, `url(${staticFile('fonts/KantumruyPro.ttf')})`, { weight: '100 700' })
  .load()
  .then((f) => {
    document.fonts.add(f)
    continueRender(fontWait)
  })
  .catch((err) => cancelRender(err))

const ZWSP = '​'

/** A script's picture: a full URL, or a file under public/. */
const srcOf = (src) => (!src ? null : /^(https?:|data:)/.test(src) ? src : staticFile(src))

/** Text that appears word by word, each word rising and fading in. Lines
 * wrap only between words (spaces, or zero-width spaces inside Khmer). */
function Words({ text, delay = 0, stagger = 3, style, align = 'left' }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pieces = []
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => pieces.push({ p, gap: i === parts.length - 1 }))
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        fontFamily: FONT,
        lineHeight: 1.45,
        ...style,
      }}
    >
      {pieces.map(({ p, gap }, n) => {
        const s = spring({ frame: frame - delay - n * stagger, fps, config: { damping: 200, mass: 0.6 } })
        return (
          <span
            key={n}
            style={{
              display: 'inline-block',
              marginRight: gap ? '0.28em' : 0,
              opacity: s,
              transform: `translateY(${(1 - s) * 46}px)`,
            }}
          >
            {p}
          </span>
        )
      })}
    </div>
  )
}

/** A photo filling the frame, slowly zooming and drifting (Ken Burns). */
function KenBurns({ src, from = 1.04, to = 1.16, drift = 30 }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#111' }}>
      {src && (
        <Img
          src={srcOf(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${from + (to - from) * t}) translateX(${-drift * t}px)`,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

function HookScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const bar = spring({ frame: frame - 4, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill>
      <KenBurns src={scene.image} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.9) 85%)' }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 84px 330px' }}>
        <div style={{ width: 120 * bar, height: 12, borderRadius: 6, background: brand.color, marginBottom: 36 }} />
        <Words
          text={scene.text}
          delay={8}
          style={{ color: 'white', fontSize: 96, fontWeight: 700, textShadow: '0 4px 24px rgba(0,0,0,0.45)' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function PointScene({ scene, brand, n }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const panel = spring({ frame, fps, config: { damping: 18, mass: 0.8 } })
  const badge = spring({ frame: frame - 8, fps, config: { damping: 9, mass: 0.6 } })
  const icon = spring({ frame: frame - 2, fps, config: { damping: 8, mass: 0.7 } })
  return (
    <AbsoluteFill style={{ backgroundColor: '#f6f7fb' }}>
      <AbsoluteFill style={{ height: '70%' }}>
        {scene.image ? (
          <KenBurns src={scene.image} from={1.12} to={1.02} drift={-24} />
        ) : (
          // No photo: the brand colour, slowly turning light, and a big icon floating.
          <AbsoluteFill
            style={{
              background: `conic-gradient(from ${frame * 1.2}deg at 50% 45%, ${brand.color}, #0b1020, ${brand.color})`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 560,
                height: 560,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                display: 'grid',
                placeItems: 'center',
                transform: `scale(${icon}) translateY(${Math.sin(frame / 12) * 18 - 60}px)`,
              }}
            >
              <span style={{ fontSize: 300 }}>{scene.icon || '✓'}</span>
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          top: 'auto',
          height: '36%',
          backgroundColor: 'white',
          borderRadius: '64px 64px 0 0',
          boxShadow: '0 -24px 60px rgba(0,0,0,0.18)',
          transform: `translateY(${(1 - panel) * 760}px)`,
          padding: '120px 84px 0',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -78,
            left: 84,
            width: 156,
            height: 156,
            borderRadius: 78,
            background: brand.color,
            color: 'white',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 84,
            display: 'grid',
            placeItems: 'center',
            border: '10px solid white',
            transform: `scale(${badge})`,
          }}
        >
          {n}
        </div>
        <Words text={scene.title} delay={12} style={{ color: '#111827', fontSize: 74, fontWeight: 700 }} />
        {scene.text && (
          <Words
            text={scene.text}
            delay={26}
            stagger={2}
            style={{ color: '#4b5563', fontSize: 46, fontWeight: 500, marginTop: 18 }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function CtaScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 4, fps, config: { damping: 10, mass: 0.7 } })
  const button = spring({ frame: frame - 30, fps, config: { damping: 12 } })
  const pulse = 1 + Math.sin(frame / 6) * 0.025 * button
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${brand.color}ee 0%, ${brand.color} 45%, #0b1020 120%)`,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 90px',
      }}
    >
      {scene.image && (
        // The product, faint behind the brand colour.
        <AbsoluteFill style={{ opacity: 0.22, mixBlendMode: 'luminosity' }}>
          <KenBurns src={scene.image} from={1.2} to={1.08} drift={0} />
        </AbsoluteFill>
      )}
      {/* soft circles drifting behind */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 520 + i * 260,
            height: 520 + i * 260,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.12)',
            transform: `scale(${1 + ((frame / 90 + i / 3) % 1) * 0.25})`,
            opacity: 1 - ((frame / 90 + i / 3) % 1),
          }}
        />
      ))}
      {brand.logo && (
        <div
          style={{
            background: 'white',
            borderRadius: 40,
            padding: '26px 40px',
            marginBottom: 70,
            transform: `scale(${logo})`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          <Img src={srcOf(brand.logo)} style={{ height: 120, objectFit: 'contain' }} />
        </div>
      )}
      <Words
        text={scene.text}
        delay={14}
        align="center"
        style={{ color: 'white', fontSize: 84, fontWeight: 700, textAlign: 'center' }}
      />
      {scene.button && (
        <div
          style={{
            marginTop: 70,
            background: 'white',
            color: brand.color,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 52,
            padding: '26px 64px',
            borderRadius: 999,
            opacity: button,
            transform: `scale(${button * pulse})`,
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
          }}
        >
          {scene.button.replaceAll(ZWSP, '')}
        </div>
      )}
    </AbsoluteFill>
  )
}

/** Story-style bars at the top (one per scene) and the brand chip. */
function Chrome({ scenes, brand }) {
  const frame = useCurrentFrame()
  let start = 0
  const spans = scenes.map((s, i) => {
    const len = sceneFrames(s) - (i < scenes.length - 1 ? TRANSITION : 0)
    const span = [start, start + len]
    start += len
    return span
  })
  return (
    <AbsoluteFill style={{ padding: '56px 48px 0', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {spans.map(([a, b], i) => (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'white',
                width: `${interpolate(frame, [a, b], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 30,
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 999,
          padding: brand.logo ? '10px 28px 10px 12px' : '14px 28px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        {brand.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: 52, maxWidth: 180, objectFit: 'contain' }} />
        ) : (
          <div style={{ width: 22, height: 22, borderRadius: 11, background: brand.color }} />
        )}
        <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: '#111827' }}>{brand.name}</span>
      </div>
    </AbsoluteFill>
  )
}

const PRESENTATIONS = [
  () => slide({ direction: 'from-right' }),
  () => wipe({ direction: 'from-bottom-left' }),
  () => fade(),
  () => slide({ direction: 'from-bottom' }),
]

export const MotionPost = ({ brand, scenes }) => {
  let point = 0
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const body =
            scene.type === 'hook' ? (
              <HookScene scene={scene} brand={brand} />
            ) : scene.type === 'cta' ? (
              <CtaScene scene={scene} brand={brand} />
            ) : (
              <PointScene scene={scene} brand={brand} n={++point} />
            )
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={sceneFrames(scene)}>
              {body}
            </TransitionSeries.Sequence>,
          ]
          if (i < scenes.length - 1) {
            out.push(
              <TransitionSeries.Transition
                key={`t${i}`}
                presentation={PRESENTATIONS[i % PRESENTATIONS.length]()}
                timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION })}
              />,
            )
          }
          return out
        })}
      </TransitionSeries>
      <Chrome scenes={scenes} brand={brand} />
    </AbsoluteFill>
  )
}
