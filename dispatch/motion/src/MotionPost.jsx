/**
 * A vertical Remotion video (1080×1920): a short story told with animated
 * app-style graphics — a hook, the problem, the solution shown working (a chat
 * on a phone, the product), the proof (a list, a number) and a call to action.
 * Driven by the script JSON (see ../sample.json), written by the backend
 * (app/motion.py):
 *
 *   { brand: { name, color, logo },
 *     scenes: [
 *       { type: "hook",    text, icon?, image? },
 *       { type: "problem", icon, title, text, count? },
 *       { type: "chat",    title, messages: [{ from: "customer" | "brand", text }] },
 *       { type: "list",    title, items: [{ icon, text }] },
 *       { type: "stat",    value, prefix?, suffix?, label, icon? },
 *       { type: "product", image?, title, chips: [] },
 *       { type: "cta",     text, button, image? },
 *     ] }   — each scene may also carry seconds and audio (its voice-over line)
 *
 * Icons are Lucide names. Khmer comes split into words with zero-width spaces
 * (app/khmer_words.py), so words animate one by one and lines break only
 * between words; ⟦…⟧ marks the words to highlight in the brand colour.
 */
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { useMemo } from 'react'
import { TransitionSeries, springTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { wipe } from '@remotion/transitions/wipe'
import {
  FONT,
  FPS,
  INK,
  TRANSITION,
  Icon,
  NeatGrid,
  Words,
  chipLogo,
  chipOpacity,
  chipTop,
  clean,
  defaultSeconds,
  fitSize,
  sceneFrames,
  srcOf,
  tint,
} from './shared'
import { EX, EXPLAINER_SCENES, Caption, ExplainerChrome } from './explainer'
import { CANVAS } from './canvas'
import { POLL, QUOTE, VERSUS } from './goaltemplates'
import { TESTIMONIAL } from './testimonial'
import { CASESTUDY, CLARITY, COUNTDOWN, DEMO, FAQ, GRIDCARDS, HOTTAKE, TECHFLOW, LAUNCH, OFFER, POV, REPORT, REVIEWS, SHOWCASE, THISORTHAT, TIPS, TREND, UNVEIL, customTemplate } from './saas'
import { SceneSfx } from './sfx'
import { NEURAL } from './neural'
import { PAPER } from './paper'
import { DOODLE } from './doodle'
import { REACTION } from './reaction'
import { STUDIO } from './studio'
import { PRESENTER } from './presenter'
import { PODCAST } from './podcast'
import { PARABLE } from './parable'
import { DIALOGUE } from './dialogue'
import { STREET } from './street3d'
import { CARTOON } from './cartoon'
import { SPOTLIGHT } from './spotlight'
import { APPDEMO } from './appdemo'
import { LESSON } from './lesson'
import { RISE } from './rise'
import { TRAINING } from './training'

export { FPS, TRANSITION, defaultSeconds, sceneFrames }

/** The scene background when there's no photo: deep ink and a neat grid —
 * one look across the whole video. */
function Backdrop() {
  return (
    <AbsoluteFill style={{ backgroundColor: INK, overflow: 'hidden' }}>
      <NeatGrid color="rgba(255,255,255,0.07)" size={72} />
    </AbsoluteFill>
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

/** A rounded icon tile that pops in (and shakes a little, for a problem). */
function IconBadge({ name, size = 220, color, bg, delay = 0, wobble = false }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, mass: 0.7 } })
  const shake = wobble ? Math.sin(frame / 2.2) * 4 * Math.max(0, 1 - frame / 40) : 0
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: bg,
        display: 'grid',
        placeItems: 'center',
        transform: `scale(${s}) rotate(${shake}deg)`,
        boxShadow: `0 24px 60px ${tint(color, 0.35)}`,
      }}
    >
      <Icon name={name} size={size * 0.48} color={color} stroke={2.2} />
    </div>
  )
}

// ── scenes ─────────────────────────────────────────────────────────────────
function HookScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const bar = spring({ frame, fps, config: { damping: 40 } })
  const photo = !!scene.image
  return (
    <AbsoluteFill>
      {photo ? (
        <>
          <KenBurns src={scene.image} />
          <AbsoluteFill
            style={{ background: 'linear-gradient(180deg, rgba(11,16,32,0.1) 20%, rgba(11,16,32,0.7) 55%, rgba(11,16,32,0.95) 85%)' }}
          />
        </>
      ) : (
        <Backdrop color={brand.color} />
      )}
      <AbsoluteFill style={{ justifyContent: photo ? 'flex-end' : 'center', padding: photo ? '0 84px 330px' : '0 84px' }}>
        {!photo && scene.icon && (
          <div style={{ marginBottom: 70 }}>
            <IconBadge name={scene.icon} size={200} color="white" bg={brand.color} />
          </div>
        )}
        <div style={{ width: 140 * bar, height: 12, borderRadius: 6, background: brand.color, marginBottom: 40 }} />
        <Words
          text={scene.text}
          delay={0}
          color="white"
          style={{ fontSize: 100, fontWeight: 800, letterSpacing: '-0.012em', textShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function ProblemScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const count = Number(scene.count) || 0
  const shown = Math.round(interpolate(frame, [12, 57], [0, count], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const pop = spring({ frame: frame - 12, fps, config: { damping: 8 } })
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 84px' }}>
        <div style={{ position: 'relative', marginBottom: 90 }}>
          <IconBadge name={scene.icon} size={300} color="#fecaca" bg="rgba(239,68,68,0.18)" wobble />
          {count > 0 && (
            <div
              style={{
                position: 'absolute',
                top: -34,
                right: -44,
                minWidth: 120,
                height: 120,
                padding: '0 24px',
                borderRadius: 60,
                background: '#ef4444',
                color: 'white',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 60,
                display: 'grid',
                placeItems: 'center',
                border: `8px solid ${INK}`,
                transform: `scale(${pop})`,
              }}
            >
              {shown}
            </div>
          )}
        </div>
        <Words text={scene.title} delay={2} align="center" color="white" style={{ fontSize: 84, fontWeight: 700, textAlign: 'center' }} />
        {scene.text && (
          <Words
            text={scene.text}
            delay={10}
            stagger={1}
            align="center"
            color="rgba(255,255,255,0.72)"
            style={{ fontSize: 48, fontWeight: 500, marginTop: 24, textAlign: 'center' }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** The product working: a phone with a chat — typing dots, then each bubble. */
function ChatScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const messages = (scene.messages || []).slice(0, 4)
  const phone = spring({ frame, fps, config: { damping: 16, mass: 0.9 } })
  const STEP = 45 // frames per message
  const FIRST = 24
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 250 }}>
        {scene.title && (
          <Words
            text={scene.title}
            delay={0}
            align="center"
            color="white"
            style={{ fontSize: 66, fontWeight: 800, letterSpacing: '-0.012em', textAlign: 'center', padding: '0 80px', marginBottom: 46 }}
          />
        )}
        <div
          style={{
            width: 700,
            height: 1240,
            borderRadius: 72,
            background: '#f8fafc',
            border: '14px solid #1f2937',
            boxShadow: '0 40px 120px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            transform: `translateY(${(1 - phone) * 900}px)`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* app header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '46px 34px 26px', background: 'white', borderBottom: '2px solid #eef2f7' }}>
            <div style={{ width: 76, height: 76, borderRadius: 38, background: brand.color, display: 'grid', placeItems: 'center' }}>
              {brand.logo ? (
                <Img src={srcOf(brand.logo)} style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 27, background: 'white' }} />
              ) : (
                <Icon name="Store" size={40} />
              )}
            </div>
            <div style={{ fontFamily: FONT }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: '#111827' }}>{brand.name}</div>
              <div style={{ fontSize: 24, color: '#10b981', fontWeight: 600 }}>● Online</div>
            </div>
          </div>
          {/* messages */}
          <div style={{ flex: 1, padding: '34px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {messages.map((m, i) => {
              const start = FIRST + i * STEP
              const mine = m.from === 'brand'
              const typing = frame >= start - 18 && frame < start
              const s = spring({ frame: frame - start, fps, config: { damping: 14 } })
              if (frame < start - 18) return null
              return (
                <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  {typing ? (
                    <div style={{ display: 'flex', gap: 10, padding: '24px 28px', borderRadius: 34, background: mine ? tint(brand.color, 0.2) : '#e5e7eb' }}>
                      {[0, 1, 2].map((d) => (
                        <div
                          key={d}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            background: '#6b7280',
                            opacity: 0.4 + 0.6 * Math.abs(Math.sin((frame + d * 5) / 5)),
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        maxWidth: '82%',
                        padding: '22px 30px',
                        borderRadius: 34,
                        borderBottomRightRadius: mine ? 10 : 34,
                        borderBottomLeftRadius: mine ? 34 : 10,
                        background: mine ? brand.color : 'white',
                        color: mine ? 'white' : '#111827',
                        boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
                        fontFamily: FONT,
                        fontSize: 36,
                        lineHeight: 1.45,
                        transform: `scale(${s})`,
                        transformOrigin: mine ? 'right bottom' : 'left bottom',
                      }}
                    >
                      {clean(m.text)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function ListScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const items = (scene.items || []).slice(0, 4)
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 76px' }}>
        <Words text={scene.title} delay={0} color="white" style={{ fontSize: 80, fontWeight: 700, marginBottom: 64 }} />
        {items.map((it, i) => {
          const start = 22 + i * 26
          const s = spring({ frame: frame - start, fps, config: { damping: 15 } })
          const tick = spring({ frame: frame - start - 14, fps, config: { damping: 9 } })
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 34,
                padding: '30px 34px',
                marginBottom: 28,
                borderRadius: 36,
                background: 'rgba(255,255,255,0.08)',
                border: '2px solid rgba(255,255,255,0.12)',
                opacity: s,
                transform: `translateX(${(1 - s) * 260}px)`,
              }}
            >
              <div style={{ flex: 'none', width: 120, height: 120, borderRadius: 34, background: brand.color, display: 'grid', placeItems: 'center' }}>
                <Icon name={it.icon} size={62} />
              </div>
              <div style={{ flex: 1, fontFamily: FONT, fontSize: 50, fontWeight: 600, color: 'white', lineHeight: 1.35 }}>{clean(it.text)}</div>
              <div style={{ flex: 'none', transform: `scale(${tick})` }}>
                <Icon name="CircleCheck" size={58} color="#34d399" stroke={2.4} />
              </div>
            </div>
          )
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function StatScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const value = Number(scene.value) || 0
  const decimals = Number.isInteger(value) ? 0 : 1
  const shown = interpolate(frame, [8, 50], [0, value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pop = spring({ frame: frame - 4, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
        {scene.icon && (
          <div style={{ marginBottom: 50 }}>
            <IconBadge name={scene.icon} size={170} color="white" bg={tint(brand.color, 0.9)} />
          </div>
        )}
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 250,
            lineHeight: 1.1,
            color: 'white',
            transform: `scale(${0.7 + 0.3 * pop})`,
            textShadow: `0 10px 60px ${tint(brand.color, 0.8)}`,
            whiteSpace: 'nowrap',
          }}
        >
          {scene.prefix || ''}
          {shown.toFixed(decimals)}
          {scene.suffix || ''}
        </div>
        <Words
          text={scene.label}
          delay={4}
          align="center"
          color="rgba(255,255,255,0.85)"
          style={{ fontSize: 60, fontWeight: 600, textAlign: 'center', marginTop: 30 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** The product, floating in a card, with its selling points popping around it. */
function ProductScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const card = spring({ frame, fps, config: { damping: 14 } })
  const float = Math.sin(frame / 18) * 14
  const chips = (scene.chips || []).slice(0, 3)
  const spots = [
    { left: 40, top: 300 },
    { right: 40, top: 760 },
    { left: 70, top: 1130 },
  ]
  return (
    <AbsoluteFill>
      <Backdrop color={brand.color} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 260 }}>
        <div
          style={{
            width: 760,
            height: 900,
            borderRadius: 64,
            overflow: 'hidden',
            background: scene.image ? '#111' : tint(brand.color, 0.25),
            boxShadow: '0 50px 120px rgba(0,0,0,0.55)',
            transform: `translateY(${(1 - card) * 400 + float}px) rotate(${(1 - card) * -8 - 2}deg)`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {scene.image ? (
            <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Icon name={scene.icon || 'Package'} size={320} />
          )}
        </div>
        <Words
          text={scene.title}
          delay={4}
          align="center"
          color="white"
          style={{ fontSize: 78, fontWeight: 800, letterSpacing: '-0.012em', textAlign: 'center', marginTop: 70, padding: '0 70px' }}
        />
      </AbsoluteFill>
      {chips.map((c, i) => {
        const s = spring({ frame: frame - 26 - i * 12, fps, config: { damping: 10 } })
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...spots[i],
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '20px 30px',
              borderRadius: 999,
              background: 'white',
              color: INK,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 40,
              boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
              transform: `scale(${s})`,
            }}
          >
            <Icon name="CircleCheck" size={40} color={brand.color} stroke={2.6} />
            {clean(c)}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/** Older scripts' points (photo or icon above, a white card with the text). */
function PointScene({ scene, brand, n }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const panel = spring({ frame, fps, config: { damping: 18, mass: 0.8 } })
  return (
    <AbsoluteFill style={{ backgroundColor: '#f6f7fb' }}>
      <AbsoluteFill style={{ height: '70%' }}>
        {scene.image ? (
          <KenBurns src={scene.image} from={1.12} to={1.02} drift={-24} />
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Backdrop color={brand.color} />
            <IconBadge name={scene.icon} size={300} color="white" bg={tint(brand.color, 0.9)} />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          top: 'auto',
          height: '36%',
          backgroundColor: 'white',
          borderRadius: '64px 64px 0 0',
          transform: `translateY(${(1 - panel) * 760}px)`,
          padding: '110px 84px 0',
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
          }}
        >
          {scene.badge || n}
        </div>
        <Words text={scene.title} delay={12} color="#111827" style={{ fontSize: 74, fontWeight: 700 }} />
        {scene.text && <Words text={scene.text} delay={26} stagger={2} color="#4b5563" style={{ fontSize: 46, fontWeight: 500, marginTop: 18 }} />}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function CtaScene({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 4, fps, config: { damping: 10, mass: 0.7 } })
  const button = spring({ frame: frame - 30, fps, config: { damping: 12 } })
  const pulse = 1 + Math.sin(frame / 6) * 0.03 * button
  const tap = Math.max(0, Math.sin((frame - 40) / 9)) // the hand taps the button
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${brand.color} 0%, ${tint(brand.color, 0.85)} 40%, ${INK} 115%)`,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 90px',
      }}
    >
      {scene.image && (
        <AbsoluteFill style={{ opacity: 0.18, mixBlendMode: 'luminosity' }}>
          <KenBurns src={scene.image} from={1.2} to={1.08} drift={0} />
        </AbsoluteFill>
      )}
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
            borderRadius: 10,
            border: 0,
            padding: '26px 40px',
            marginBottom: 70,
            transform: `scale(${logo})`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          <Img src={srcOf(brand.logo)} style={{ height: 120, objectFit: 'contain' }} />
        </div>
      )}
      <Words text={scene.text} delay={4} align="center" color="white" style={{ fontSize: fitSize(scene.text, 86), fontWeight: 700, textAlign: 'center' }} />
      {scene.button && (
        <div style={{ position: 'relative', marginTop: 80 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              background: 'white',
              color: brand.color,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 52,
              padding: '28px 64px',
              borderRadius: 999,
              opacity: button,
              transform: `scale(${button * pulse})`,
              boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
            }}
          >
            <Icon name="Send" size={48} color={brand.color} stroke={2.4} />
            {clean(scene.button)}
          </div>
          <div style={{ position: 'absolute', right: -30, bottom: -90, opacity: button, transform: `translate(${-tap * 14}px, ${-tap * 14}px)` }}>
            <Icon name="Pointer" size={110} color="white" stroke={1.8} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}

/** The brand chip, top-left (no progress bars — they cluttered the top). */
function Chrome({ scenes, brand }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ padding: `${chipTop(width, height)}px 48px 0`, pointerEvents: 'none', opacity: chipOpacity(scenes, frame) }}>
      <div
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 10,
          border: 0,
          padding: brand.logo ? '10px 14px' : '14px 28px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* The logo alone — it already says who we are; the name only when there's no logo. */}
        {brand.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: chipLogo(width, height), maxWidth: 260, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: brand.color }} />
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: '#111827' }}>{brand.name}</span>
          </>
        )}
      </div>
    </AbsoluteFill>
  )
}

/** The background track (props.music, a file under public/music/<mood>/):
 * ducked under the voice-over, louder between lines, faded in and out, looped
 * if the video is longer than the track. */
function BackgroundMusic({ src, scenes }) {
  const { durationInFrames } = useVideoConfig()
  let start = 0
  const spans = scenes.map((s, i) => {
    const len = sceneFrames(s) - (i < scenes.length - 1 ? TRANSITION : 0)
    const span = { from: start, to: start + len, voiced: !!s.audio, hush: start + Math.round((Number(s.pause) || 0) * FPS) }
    start += len
    return span
  })
  const volume = (f) => {
    const span = spans.find((x) => f >= x.from && f < x.to)
    const level = f < span?.hush ? 0.06 : span?.voiced ? 0.22 : 0.5 // tracks are levelled to -19 dB (tools/make_music.py); a scene's pause dips it
    const fadeIn = interpolate(f, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const fadeOut = interpolate(f, [durationInFrames - 45, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return level * fadeIn * fadeOut
  }
  return <Html5Audio src={srcOf(src)} loop volume={volume} />
}

/** A long video (props.musicList): a new track at each chapter card, each
 * looped through its chapter and crossfaded into the next over a second — so
 * a 10-minute training doesn't repeat one 30-second loop. Same ducking under
 * the voice as BackgroundMusic. */
const XFADE = 30 // frames
function ChapterMusic({ list, scenes }) {
  const { durationInFrames } = useVideoConfig()
  let start = 0
  const spans = scenes.map((s, i) => {
    const len = sceneFrames(s) - (i < scenes.length - 1 ? TRANSITION : 0)
    const span = { from: start, to: start + len, voiced: !!s.audio, chapter: s.type === 'chapter' }
    start += len
    return span
  })
  // where each track starts: the beginning, then every chapter card
  const cuts = [0, ...spans.filter((x, i) => x.chapter && i > 0).map((x) => x.from)]
  const level = (f) => {
    const span = spans.find((x) => f >= x.from && f < x.to)
    const fadeOut = interpolate(f, [durationInFrames - 45, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (span?.voiced ? 0.22 : 0.5) * fadeOut
  }
  return cuts.map((from, k) => {
    const to = k < cuts.length - 1 ? cuts[k + 1] : durationInFrames
    const begin = Math.max(0, from - XFADE)
    return (
      <Sequence key={k} from={begin} durationInFrames={Math.max(1, Math.min(durationInFrames, to + XFADE) - begin)} layout="none">
        <Html5Audio
          src={srcOf(list[k % list.length])}
          loop
          volume={(f) => {
            const abs = f + begin
            const fadeIn = k === 0 ? interpolate(abs, [0, 30], [0, 1], { extrapolateRight: 'clamp' }) : interpolate(abs, [from - XFADE, from + XFADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            const fadeOutCut = k < cuts.length - 1 ? interpolate(abs, [to - XFADE, to + XFADE], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1
            return level(abs) * fadeIn * fadeOutCut
          }}
        />
      </Sequence>
    )
  })
}

const PRESENTATIONS = [
  () => slide({ direction: 'from-right' }),
  () => fade(),
  () => wipe({ direction: 'from-bottom-left' }),
  () => slide({ direction: 'from-bottom' }),
]

const SCENES = {
  hook: HookScene,
  problem: ProblemScene,
  chat: ChatScene,
  list: ListScene,
  stat: StatScene,
  product: ProductScene,
  cta: CtaScene,
}

// The templates — one per kind of story (app/motion.py style_for picks it from
// the post's content goal). Tech is the default.
const TEMPLATES = {
  tech: { scenes: SCENES, root: { backgroundColor: INK }, light: false, captionTop: 1660 },
  explainer: { scenes: { ...SCENES, ...EXPLAINER_SCENES }, root: { backgroundColor: EX.bg, '--hl-bg': EX.yellow, '--hl-text': EX.ink }, light: true, captionTop: 1225 },
  versus: { ...VERSUS, scenes: { ...SCENES, ...VERSUS.scenes } },
  poll: { ...POLL, scenes: { ...SCENES, ...POLL.scenes } },
  quote: { ...QUOTE, scenes: { ...SCENES, ...QUOTE.scenes } },
  testimonial: { ...TESTIMONIAL, scenes: { ...SCENES, ...TESTIMONIAL.scenes } },
  trend: { ...TREND, scenes: { ...SCENES, ...TREND.scenes } },
  pov: { ...POV, scenes: { ...SCENES, ...POV.scenes } },
  demo: { ...DEMO, scenes: { ...SCENES, ...DEMO.scenes } },
  offer: { ...OFFER, scenes: { ...SCENES, ...OFFER.scenes } },
  spotlight: { ...SPOTLIGHT, scenes: { ...SCENES, ...SPOTLIGHT.scenes } }, // 3D · Spotlight (three.js)
  appdemo: { ...APPDEMO, scenes: { ...SCENES, ...APPDEMO.scenes } }, // 3D · App demo (CSS 3D)
  showcase: { ...SHOWCASE, scenes: { ...SCENES, ...SHOWCASE.scenes } },
  launch: { ...LAUNCH, scenes: { ...SCENES, ...LAUNCH.scenes } },
  unveil: { ...UNVEIL, scenes: { ...SCENES, ...UNVEIL.scenes } },
  neural: { ...NEURAL, scenes: { ...SCENES, ...NEURAL.scenes } },
  paper: { ...PAPER, scenes: { ...SCENES, ...PAPER.scenes } },
  doodle: { ...DOODLE, scenes: { ...SCENES, ...DOODLE.scenes } },
  cartoon: { ...CARTOON, scenes: { ...SCENES, ...CARTOON.scenes } },
  lesson: { ...LESSON, scenes: { ...SCENES, ...LESSON.scenes } },
  rise: { ...RISE, scenes: { ...SCENES, ...RISE.scenes } },
  reaction: { ...REACTION, scenes: { ...SCENES, ...REACTION.scenes } },
  studio: { ...STUDIO, scenes: { ...SCENES, ...STUDIO.scenes } },
  presenter: { ...PRESENTER, scenes: { ...SCENES, ...PRESENTER.scenes } },
  podcast: { ...PODCAST, scenes: { ...SCENES, ...PODCAST.scenes } },
  parable: { ...PARABLE, scenes: { ...SCENES, ...PARABLE.scenes } }, // Parable · Two paths
  dialogue: { ...DIALOGUE, scenes: { ...SCENES, ...DIALOGUE.scenes } }, // Dialogue · Two voices
  street3d: { ...STREET, scenes: { ...SCENES, ...STREET.scenes } }, // 3D · Street (three.js)
  gridcards: { ...GRIDCARDS, scenes: { ...SCENES, ...GRIDCARDS.scenes } },
  techflow: { ...TECHFLOW, scenes: { ...SCENES, ...TECHFLOW.scenes } },
  canvas: { ...CANVAS, scenes: { ...SCENES, ...CANVAS.scenes } }, // AI design — the AI designs every scene
  clarity: { ...CLARITY, scenes: { ...SCENES, ...CLARITY.scenes } },
  countdown: { ...COUNTDOWN, scenes: { ...SCENES, ...COUNTDOWN.scenes } },
  thisorthat: { ...THISORTHAT, scenes: { ...SCENES, ...THISORTHAT.scenes } },
  reviews: { ...REVIEWS, scenes: { ...SCENES, ...REVIEWS.scenes } },
  tips: { ...TIPS, scenes: { ...SCENES, ...TIPS.scenes } },
  hottake: { ...HOTTAKE, scenes: { ...SCENES, ...HOTTAKE.scenes } },
  casestudy: { ...CASESTUDY, scenes: { ...SCENES, ...CASESTUDY.scenes } },
  faq: { ...FAQ, scenes: { ...SCENES, ...FAQ.scenes } },
  report: { ...REPORT, scenes: { ...SCENES, ...REPORT.scenes } },
  training: { ...TRAINING, scenes: { ...SCENES, ...TRAINING.scenes } },
}

export const MotionPost = ({ brand, scenes, music, musicList, style, look, cast, place, places, host, sfx = true }) => {
  let point = 0
  // "custom": its scenes are drawn in the look the AI picked for this video
  const custom = useMemo(() => (style === 'custom' ? customTemplate(look) : null), [style, look])
  const t = custom ? { ...custom, scenes: { ...SCENES, ...custom.scenes } } : TEMPLATES[style] || TEMPLATES.tech
  const noCaption = ['chat', ...(t.noCaption || [])]
  // Story · Characters: its two people, its place and the question kept on top (cartoon.jsx)
  const story = useMemo(() => ({ title: scenes.find((s) => s.type === 'hook')?.text }), [scenes])
  const { height } = useVideoConfig()
  const captionTop = typeof t.captionTop === 'function' ? t.captionTop(height) : t.captionTop
  return (
    <AbsoluteFill style={{ ...t.root, '--brand': brand.color }}>
      {musicList?.length > 1 ? <ChapterMusic list={musicList} scenes={scenes} /> : music && <BackgroundMusic src={music} scenes={scenes} />}
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const Scene = t.scenes[scene.type]
          // the frame its voice starts on (the Sequence below) — Presenter's host moves her mouth with it
          const voiceAt = (i ? TRANSITION : 0) + 6 + Math.round((Number(scene.pause) || 0) * FPS)
          const body = Scene ? <Scene scene={scene} brand={brand} cast={cast} place={place} story={story} host={host} places={places} voiceAt={voiceAt} /> : <PointScene scene={scene} brand={brand} n={++point} />
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={sceneFrames(scene)}>
              {body}
              {/* whoosh / pop / blop … on the scene's moves (sfx.jsx) */}
              {sfx && <SceneSfx scene={scene} style={style} frames={sceneFrames(scene)} first={i === 0} />}
              {/* The voice-over line (app/motion.py add_voice) and its subtitles start together, once
                  the scene has slid in + 6 frames breathing room so the visual title is registered right as or slightly before the voice speaks.
                  An AI design scene's pause (canvas.jsx) comes first: the voice waits for the reveal. */}
              <Sequence from={voiceAt} layout="none">
                {/* Subtitles — not where the screen says it already (the chat's bubbles, a quote). */}
                {scene.caption && !noCaption.includes(scene.type) && (
                  <Caption text={scene.caption} words={scene.voiceWords} pauses={scene.pauses} seconds={scene.voiceSeconds || sceneFrames(scene) / FPS - 0.6} top={captionTop} look={t.caption} />
                )}
                {scene.audio && <Html5Audio src={srcOf(scene.audio)} />}
              </Sequence>
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
      {/* "No logo" (app/motion.py Unbranded): no corner chip */}
      {!brand.logo && !brand.name ? null : t.chrome ? <t.chrome scenes={scenes} brand={brand} /> : t.light ? <ExplainerChrome scenes={scenes} brand={brand} /> : <Chrome scenes={scenes} brand={brand} />}
    </AbsoluteFill>
  )
}
