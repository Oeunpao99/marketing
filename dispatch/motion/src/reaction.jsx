/**
 * "Reaction meme" — the TikTok reaction-cat meme: a screenshot / photo of the
 * situation behind (slowly pushing in, the funny bit circled in red), a
 * white meme caption on top, and one or two cut-out animals popping up in
 * front, flapping their mouths on the beat ("pop!") or freezing in shock.
 *
 * The animals are our own — drawn once per film by the image model as a
 * two-panel sheet (mouth closed | mouth open) on chroma green; the server
 * keys the green out and splits it (app/doodle.py draw_cast_meme) →
 * props.cast = [{ who, closed, open }]. Without them a big emoji face stands in.
 * 9:16. Scene types: hook · react · punch · cta (app/motion.py REACTION_TYPES) — the
 * hook is the first meme moment, drawn like a react scene.
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, srcOf } from './shared'

const C = { bg: '#0D0D0F', white: '#FFFFFF', ink: '#111111', red: '#FF2B2B', yellow: '#FFE03A', dim: 'rgba(255,255,255,0.08)' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const FACE = { shock: '😱', laugh: '🤣', pop: '😮', side: '😒', cry: '😭', cool: '😎' }

function useLayout() {
  const { width, height, fps } = useVideoConfig()
  const wide = width > height
  const u = Math.min(width, height) / 1080
  return { width, height, fps, wide, u }
}
const useEnter = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - Math.round(delay * fps), fps, config: { damping } })
}

/** When the mouth is open. pop: on the beat, a quick flap every ~0.4 s;
 * laugh: fast flaps; shock: opens on the hit and stays; side/cool: shut. */
function mouthOpen(mood, f, fps, start) {
  const t = f - Math.round(start * fps)
  if (t < 0) return false
  if (mood === 'shock' || mood === 'cry') return t >= Math.round(0.35 * fps)
  if (mood === 'laugh') return Math.floor(t / 4) % 2 === 0
  if (mood === 'pop') return t % Math.round(0.42 * fps) < Math.round(0.16 * fps)
  return false
}
export const mouthBeats = (mood, frames, fps = 30, start = 0.5) => {
  // the frames a mouth opens on — sfx.jsx puts a "pop" there
  const out = []
  for (let f = 1; f < frames; f++) if (mouthOpen(mood, f, fps, start) && !mouthOpen(mood, f - 1, fps, start)) out.push(f)
  return out
}

/** One cut-out animal: rises in from the bottom edge, mouth on the beat. */
function Animal({ who, mood = 'pop', side = 'left', size, delay = 0.25, start = 0.5 }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const enter = useEnter(delay, 11)
  const open = mouthOpen(mood, frame, fps, start)
  const shocked = (mood === 'shock' || mood === 'cry') && open
  // a squash on every flap, a shiver when shocked, a slow breath otherwise
  const flap = open && mood !== 'shock' ? 1.04 : 1
  const shiver = shocked ? Math.sin(frame * 2.3) * 6 : 0
  const bob = Math.sin(frame / 14 + (side === 'left' ? 0 : 2)) * 6
  const x = side === 'left' ? -0.06 * size : width - size * 0.94
  const src = who && srcOf(open ? who.open || who.closed : who.closed || who.open)
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        bottom: -size * 0.08,
        width: size,
        height: size * 1.25,
        transform: `translateY(${(1 - enter) * size * 0.9 + bob}px) translateX(${shiver}px) scale(${flap}, ${2 - flap}) scaleX(${side === 'right' ? -1 : 1})`,
        transformOrigin: '50% 100%',
        zIndex: 5,
      }}
    >
      {src ? (
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: '50% 100%', filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))' }} />
      ) : (
        <div style={{ position: 'absolute', bottom: size * 0.1, width: '100%', textAlign: 'center', fontSize: size * 0.62, lineHeight: 1 }}>{FACE[mood] || FACE.pop}</div>
      )}
    </div>
  )
}

/** The meme caption: black bold text on a white band, at the top. */
function TopText({ text, delay = 0.05, big = false }) {
  const { u, width, wide } = useLayout()
  const s = useEnter(delay, 16)
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top: (wide ? 70 : 262) * u, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 6, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * -30}px)` }}>
      <div style={{ maxWidth: width * (wide ? 0.7 : 0.9), background: C.white, borderRadius: 26 * u, padding: `${20 * u}px ${36 * u}px ${24 * u}px`, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(0,0,0,0.35)` }}>
        <Words text={text} align="center" color={C.ink} style={{ fontSize: (big ? 78 : 64) * u, fontWeight: 700, lineHeight: 1.35, justifyContent: 'center', '--hl-bg': C.yellow, '--hl-text': C.ink }} />
      </div>
    </div>
  )
}

/** A comic bubble by an animal's head ("ខ្សឹប ខ្សឹប…"). */
function Bubble({ text, side = 'left', size, delay = 0.9 }) {
  const { u, width, height } = useLayout()
  const s = useEnter(delay, 9)
  if (!text) return null
  const left = side === 'left'
  return (
    <div
      style={{
        position: 'absolute',
        bottom: size * 1.02,
        ...(left ? { left: size * 0.32 } : { right: size * 0.32 }),
        maxWidth: width * 0.5,
        zIndex: 7,
        transform: `scale(${s})`,
        transformOrigin: left ? '20% 100%' : '80% 100%',
      }}
    >
      <div style={{ position: 'relative', background: C.white, color: C.ink, border: `${5 * u}px solid ${C.ink}`, borderRadius: 40 * u, padding: `${16 * u}px ${30 * u}px`, fontFamily: FONT, fontWeight: 700, fontSize: 50 * u, lineHeight: 1.35, textAlign: 'center', boxShadow: `${6 * u}px ${8 * u}px 0 ${C.ink}` }}>
        {clean(text)}
        <div style={{ position: 'absolute', bottom: -30 * u, [left ? 'left' : 'right']: 50 * u, width: 0, height: 0, borderLeft: `${22 * u}px solid transparent`, borderRight: `${22 * u}px solid transparent`, borderTop: `${30 * u}px solid ${C.ink}` }} />
      </div>
    </div>
  )
}

/** The red hand-drawn circle around the funny bit (mark in % of the picture). */
function RedCircle({ mark, delay = 0.7 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!mark) return null
  const t = interpolate(frame - Math.round(delay * fps), [0, 14], [0, 1], clamp)
  const { x = 50, y = 50, w = 30, h = 14 } = mark
  // a loose ellipse that overshoots its start, like a quick marker stroke
  const N = 72
  const pts = []
  for (let i = 0; i <= Math.round(N * t); i++) {
    const a = -Math.PI * 0.6 + (i / N) * Math.PI * 2.15
    const wob = 1 + (random(`c${i}`) - 0.5) * 0.04
    pts.push([x + Math.cos(a) * (w / 2) * wob * (1 + i / 700), y + Math.sin(a) * (h / 2) * wob])
  }
  if (pts.length < 2) return null
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={C.red} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** The situation: the screenshot / photo in a rounded card, slowly pushing
 * in towards the circled bit. Without a picture: the scene's icon, big. */
function Screen({ scene, top, bottom }) {
  const frame = useCurrentFrame()
  const { u, width, height, wide } = useLayout()
  const s = useEnter(0.05, 18)
  const src = scene.image && srcOf(scene.image)
  const m = scene.mark || { x: 50, y: 50 }
  const zoom = 1 + interpolate(frame, [0, 150], [0, 0.12], clamp)
  const w = wide ? width * 0.5 : width * 0.86
  const boxH = height - top - bottom
  // a picture of known shape is laid at full width, slid so the circled bit is in
  // view — the circle is drawn on the picture itself, so it lands on the right spot
  const picH = scene.imgW && scene.imgH ? (w * scene.imgH) / scene.imgW : null
  const shift = picH ? Math.max(Math.min(0, boxH - picH), Math.min(0, boxH / 2 - (m.y / 100) * picH)) : 0
  return (
    <div style={{ position: 'absolute', top, bottom, left: (width - w) / 2, width: w, borderRadius: 34 * u, overflow: 'hidden', background: '#1B1B1F', border: `${4 * u}px solid rgba(255,255,255,0.12)`, opacity: s, transform: `scale(${0.92 + 0.08 * s})` }}>
      <div style={picH ? { position: 'absolute', left: 0, top: shift, width: '100%', height: picH, transform: `scale(${zoom})`, transformOrigin: `${m.x}% ${m.y}%` } : { position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${m.x}% ${m.y}%` }}>
        {src ? (
          <Img src={src} style={{ width: '100%', height: '100%', objectFit: picH ? 'fill' : 'cover' }} />
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={scene.icon || 'Smartphone'} size={300 * u} color="rgba(255,255,255,0.85)" stroke={1.6} />
          </AbsoluteFill>
        )}
        <RedCircle mark={scene.mark} />
      </div>
    </div>
  )
}

/** The punch of a hit: the frame jolts and flashes once. */
function useJolt(at) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const d = frame - Math.round(at * fps)
  if (d < 0 || d > 18) return { transform: undefined, flash: 0 }
  const k = Math.exp(-d / 4)
  return { transform: `translate(${Math.sin(d * 2.9) * 14 * k}px, ${Math.cos(d * 3.3) * 10 * k}px) scale(${1 + 0.05 * k})`, flash: interpolate(d, [0, 2, 8], [0, 0.35, 0], clamp) }
}

const castOf = (cast, i) => (cast || [])[i] || null

function React_({ scene, cast }) {
  const { u, height, wide } = useLayout()
  const size = (wide ? 460 : 560) * u
  const who = (scene.who || [0]).slice(0, 2)
  const moods = scene.moods || []
  const shockAt = moods.includes('shock') ? 0.85 : null
  const jolt = useJolt(shockAt ?? 99)
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill style={{ transform: jolt.transform }}>
        <Screen scene={scene} top={(wide ? 170 : 480) * u} bottom={wide ? 60 * u : height - 1420 * u} />
        <TopText text={scene.text} />
        {who.map((k, i) => (
          <Animal key={i} who={castOf(cast, k)} mood={moods[i] || 'pop'} side={i ? 'right' : 'left'} size={size} delay={0.3 + i * 0.25} start={0.55 + i * 0.2} />
        ))}
        {scene.bubble && <Bubble text={scene.bubble} side={who.length > 1 ? 'right' : 'left'} size={size} />}
      </AbsoluteFill>
      {jolt.flash > 0 && <AbsoluteFill style={{ background: C.white, opacity: jolt.flash }} />}
    </AbsoluteFill>
  )
}

/** The punchline: a big caption and one animal close up, screaming. */
function Punch({ scene, cast }) {
  const { u, wide } = useLayout()
  const jolt = useJolt(0.6)
  const mood = (scene.moods || [])[0] || 'shock'
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill style={{ transform: jolt.transform }}>
        <TopText text={scene.text} big />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: (wide ? 760 : 1260) * u }}>
          <Animal who={castOf(cast, (scene.who || [0])[0])} mood={mood} side="left" size={(wide ? 700 : 1000) * u} delay={0.15} start={0.25} />
        </div>
      </AbsoluteFill>
      {jolt.flash > 0 && <AbsoluteFill style={{ background: C.white, opacity: jolt.flash }} />}
    </AbsoluteFill>
  )
}

function MemeCta({ scene, brand, cast }) {
  const { u, wide } = useLayout()
  const logo = useEnter(0.15, 12)
  const b = useEnter(0.9, 11)
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingBottom: (wide ? 120 : 520) * u, gap: 44 * u }}>
      {brand?.logo && (
        <div style={{ background: C.white, borderRadius: 24 * u, padding: `${18 * u}px ${30 * u}px`, transform: `scale(${logo})` }}>
          <Img src={srcOf(brand.logo)} style={{ height: 130 * u, maxWidth: 520 * u, objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ maxWidth: (wide ? 1100 : 900) * u, opacity: logo }}>
        <Words text={scene.text} align="center" color={C.white} style={{ fontSize: 96 * u, fontWeight: 700, lineHeight: 1.35, justifyContent: 'center', '--hl-bg': C.yellow, '--hl-text': C.ink }} />
      </div>
      {scene.button && (
        <div style={{ padding: `${22 * u}px ${56 * u}px`, borderRadius: 999, background: C.yellow, color: C.ink, fontFamily: FONT, fontWeight: 800, fontSize: 48 * u, opacity: Math.min(1, b * 1.4), transform: `translateY(${(1 - b) * 30}px) scale(${1 + Math.sin(frame / 8) * 0.025 * b})` }}>{clean(scene.button)}</div>
      )}
      <Animal who={castOf(cast, 0)} mood="pop" side="left" size={(wide ? 400 : 560) * u} delay={0.5} start={0.8} />
      {cast?.length > 1 && <Animal who={castOf(cast, 1)} mood="laugh" side="right" size={(wide ? 400 : 560) * u} delay={0.7} start={1.0} />}
    </AbsoluteFill>
  )
}

export const REACTION = {
  scenes: { hook: React_, react: React_, punch: Punch, cta: MemeCta },
  root: { backgroundColor: C.bg },
  light: false,
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
  // the meme's own caption is the text — subtitles at the bottom would cover the animals
  noCaption: ['hook', 'react', 'punch', 'cta'],
}
