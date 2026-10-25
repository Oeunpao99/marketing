import { useEffect, useState } from 'react'
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

// The video editor's timeline (Content studio → Video editor): clips on
// tracks — videos, pictures, words and sounds — each with a start, a length,
// where it starts inside its file (a cut), its volume, place, size and fades.
// The same file plays in the editor (@remotion/player in the app) and renders
// the export on the server (app/editor.py → motion.render "Timeline"), so what
// people see while editing is what they download.
//
// props: { ratio, tracks: [{ id, kind: video|text|audio, muted?, hidden? }],
//          clips: [{ id, track, kind: video|image|audio|text, start, dur, from,
//                    src, volume, x, y, scale, fit, fadeIn, fadeOut,
//                    speed, rotate, opacity, brightness, contrast, saturation,
//                    blur, filter, animIn, animInDur, animOut, animOutDur,
//                    text, size, color, look: plain|box|outline }] }
// speed: a video or sound plays that many times faster — `dur` seconds on the
// timeline use dur × speed seconds of the file, from `from`.
// Tracks are listed top to bottom as the editor shows them: a higher track
// draws over a lower one. Times are seconds.

export const EDIT_FPS = 30
export const EDIT_SIZES = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] }

/** The timeline's length: where its last clip ends (one second when empty). */
export const timelineSeconds = (props) => Math.max(1, ...(props?.clips || []).map((c) => (Number(c.start) || 0) + (Number(c.dur) || 0)))
export const timelineFrames = (props) => Math.max(1, Math.round(timelineSeconds(props) * EDIT_FPS))

// the two fonts the templates use: English in Plus Jakarta Sans, Khmer in Kantumruy Pro
let fontsLoading = null
const loadFonts = () => {
  if (!fontsLoading) {
    fontsLoading = Promise.all([
      new FontFace('CFLatin', `url(${staticFile('fonts/PlusJakartaSans.ttf')})`, { weight: '200 800' }).load(),
      new FontFace('Kantumruy', `url(${staticFile('fonts/KantumruyPro.ttf')})`, { weight: '100 700' }).load(),
    ])
      .then((faces) => faces.forEach((f) => document.fonts.add(f)))
      .catch(() => {}) // a missing font falls back to the system's — the video still draws
  }
  return fontsLoading
}
const FONT = 'CFLatin, Kantumruy, sans-serif'

// a stored file ("/media/…" while editing) as it plays here; the server swaps
// those for files next to the render (app/motion.py render)
const srcOf = (src) => (/^(\/media\/|https?:|blob:|data:)/.test(src || '') ? src : staticFile(src || ''))

/** 0 → 1 over the fade in, 1 → 0 over the fade out (frames inside the clip). */
const fadeAt = (f, len, clip) => {
  const fi = Math.round((Number(clip.fadeIn) || 0) * EDIT_FPS)
  const fo = Math.round((Number(clip.fadeOut) || 0) * EDIT_FPS)
  let a = 1
  if (fi > 0) a = Math.min(a, interpolate(f, [0, fi], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  if (fo > 0) a = Math.min(a, interpolate(f, [len - fo, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  return a
}

// The looks a picture or video can have (CapCut's filters) — CSS filters, so the
// editor's preview and the export draw them the same.
export const FILTERS = {
  none: '',
  bw: 'grayscale(1) contrast(1.1)',
  warm: 'sepia(0.28) saturate(1.25) hue-rotate(-10deg)',
  cool: 'saturate(1.1) hue-rotate(14deg) brightness(1.03)',
  vintage: 'sepia(0.5) contrast(0.9) brightness(1.06) saturate(0.85)',
  vivid: 'saturate(1.55) contrast(1.12)',
  fade: 'contrast(0.82) brightness(1.12) saturate(0.75)',
  drama: 'contrast(1.35) saturate(0.85) brightness(0.92)',
}

// How a clip comes in and goes out (CapCut's Animation): a move, a zoom or a pop
export const ANIMS = ['none', 'fade', 'zoom', 'zoom-out', 'pop', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'spin']

const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))

/** A clip's adjustments and filter as one CSS filter ('' = none). */
const filterOf = (clip) => {
  const parts = []
  const b = num(clip.brightness, 1)
  const c = num(clip.contrast, 1)
  const s = num(clip.saturation, 1)
  if (b !== 1) parts.push(`brightness(${b})`)
  if (c !== 1) parts.push(`contrast(${c})`)
  if (s !== 1) parts.push(`saturate(${s})`)
  if (FILTERS[clip.filter]) parts.push(FILTERS[clip.filter])
  return parts.join(' ')
}

/** One animation at `p` (0 = hidden, 1 = in place): a shift (% of the frame), a scale, a turn, an opacity. */
const animAt = (type, p) => {
  const q = 1 - p
  switch (type) {
    case 'fade':
      return { o: p }
    case 'zoom':
      return { s: 0.6 + 0.4 * p, o: p }
    case 'zoom-out':
      return { s: 1.4 - 0.4 * p, o: p }
    case 'pop': {
      // a little past full size, then back (easeOutBack)
      const k = 1.70158
      const e = 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2
      return { s: Math.max(0, e), o: Math.min(1, p * 2.5) }
    }
    case 'slide-left':
      return { x: -100 * q }
    case 'slide-right':
      return { x: 100 * q }
    case 'slide-up':
      return { y: 100 * q }
    case 'slide-down':
      return { y: -100 * q }
    case 'spin':
      return { r: -180 * q, s: 0.4 + 0.6 * p, o: p }
    default:
      return {}
  }
}

const ease = (t) => 1 - (1 - t) ** 3

/** The in / out animations at frame `f` of a clip `len` frames long, put together. */
const motionAt = (f, len, clip) => {
  let x = 0
  let y = 0
  let s = 1
  let r = 0
  let o = 1
  const add = (m) => {
    x += m.x || 0
    y += m.y || 0
    s *= m.s == null ? 1 : m.s
    r += m.r || 0
    o *= m.o == null ? 1 : m.o
  }
  const inLen = Math.round(num(clip.animInDur, 0.5) * EDIT_FPS)
  const outLen = Math.round(num(clip.animOutDur, 0.5) * EDIT_FPS)
  if (clip.animIn && clip.animIn !== 'none' && inLen > 0 && f < inLen) add(animAt(clip.animIn, ease(f / inLen)))
  if (clip.animOut && clip.animOut !== 'none' && outLen > 0 && f > len - outLen) add(animAt(clip.animOut, ease((len - f) / outLen)))
  return { x, y, s, r, o }
}

/** A clip's place on the frame: moved by x / y (% of the frame from the centre), scaled, turned — plus its animation. */
const placed = (clip, m) => ({
  transform: `translate(${(Number(clip.x) || 0) + m.x}%, ${(Number(clip.y) || 0) + m.y}%) rotate(${num(clip.rotate, 0) + m.r}deg) scale(${num(clip.scale, 1) * m.s})`,
})

function Words({ clip, len }) {
  const f = useCurrentFrame()
  const { width } = useVideoConfig()
  const k = width / 1080 // sizes are set for a 1080-wide frame
  const size = (Number(clip.size) || 64) * k
  const look = clip.look || 'box'
  const color = clip.color || '#ffffff'
  const m = motionAt(f, len, clip)
  const pop = clip.animIn && clip.animIn !== 'none' ? 1 : interpolate(f, [0, 8], [0.92, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fadeAt(f, len, clip) * num(clip.opacity, 1) * m.o }}>
      <div
        style={{
          transform: `translate(${(Number(clip.x) || 0) + m.x}%, ${(Number(clip.y) || 0) + m.y}%) rotate(${num(clip.rotate, 0) + m.r}deg) scale(${num(clip.scale, 1) * pop * m.s})`,
          maxWidth: '86%',
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.45,
          color,
          whiteSpace: 'pre-wrap',
          padding: look === 'box' ? `${size * 0.22}px ${size * 0.45}px` : 0,
          borderRadius: size * 0.3,
          background: look === 'box' ? 'rgba(0,0,0,0.62)' : 'transparent',
          textShadow: look === 'outline' ? `0 0 ${size * 0.08}px #000, 0 ${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.9)` : 'none',
          WebkitTextStroke: look === 'outline' ? `${Math.max(2, size * 0.05)}px rgba(0,0,0,0.85)` : undefined,
          paintOrder: 'stroke fill',
        }}
      >
        {clip.text || ''}
      </div>
    </AbsoluteFill>
  )
}

function Picture({ clip, len, muted }) {
  const f = useCurrentFrame()
  const fit = clip.fit || 'contain'
  const { width } = useVideoConfig()
  const blur = num(clip.blur, 0) * (width / 1080) // set for a 1080-wide frame
  const look = [filterOf(clip), blur > 0 ? `blur(${blur}px)` : ''].filter(Boolean).join(' ')
  const box = { width: '100%', height: '100%', objectFit: fit, filter: look || undefined }
  const from = Math.max(0, Math.round((Number(clip.from) || 0) * EDIT_FPS))
  const vol = clip.volume == null ? 1 : Number(clip.volume)
  const speed = Math.min(4, Math.max(0.25, num(clip.speed, 1)))
  const m = motionAt(f, len, clip)
  return (
    <AbsoluteFill style={{ opacity: fadeAt(f, len, clip) * num(clip.opacity, 1) * m.o, ...placed(clip, m) }}>
      {clip.kind === 'image' ? (
        <Img src={srcOf(clip.src)} style={box} />
      ) : (
        <OffthreadVideo
          src={srcOf(clip.src)}
          trimBefore={from || undefined}
          playbackRate={speed}
          muted={muted || vol <= 0}
          volume={(i) => vol * fadeAt(i, len, clip)}
          style={box}
        />
      )}
    </AbsoluteFill>
  )
}

function Sound({ clip, len, muted }) {
  const from = Math.max(0, Math.round((Number(clip.from) || 0) * EDIT_FPS))
  const vol = clip.volume == null ? 1 : Number(clip.volume)
  const speed = Math.min(4, Math.max(0.25, num(clip.speed, 1)))
  if (muted || vol <= 0) return null
  return <Audio src={srcOf(clip.src)} trimBefore={from || undefined} playbackRate={speed} volume={(i) => vol * fadeAt(i, len, clip)} />
}

export function Timeline(props) {
  const [wait] = useState(() => delayRender('Loading the fonts'))
  useEffect(() => {
    loadFonts().then(() => continueRender(wait))
  }, [wait])
  const tracks = props.tracks || []
  const clips = props.clips || []
  // bottom track first, so a higher track draws over it
  const order = [...tracks].reverse()
  return (
    <AbsoluteFill style={{ background: props.background || '#000' }}>
      {order.map((t) =>
        t.hidden
          ? null
          : clips
              .filter((c) => c.track === t.id && Number(c.dur) > 0)
              .map((c) => {
                const from = Math.round((Number(c.start) || 0) * EDIT_FPS)
                const len = Math.max(1, Math.round(Number(c.dur) * EDIT_FPS))
                return (
                  <Sequence key={c.id} from={from} durationInFrames={len} layout="none">
                    {c.kind === 'text' ? (
                      <Words clip={c} len={len} />
                    ) : c.kind === 'audio' ? (
                      <Sound clip={c} len={len} muted={t.muted} />
                    ) : (
                      <Picture clip={c} len={len} muted={t.muted} />
                    )}
                  </Sequence>
                )
              }),
      )}
    </AbsoluteFill>
  )
}
