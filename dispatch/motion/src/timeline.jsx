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
//                    text, size, color, look: plain|box|outline }] }
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

/** A picture or video clip's place on the frame: moved by x / y (% of the frame from the centre), scaled. */
const placed = (clip) => ({
  transform: `translate(${Number(clip.x) || 0}%, ${Number(clip.y) || 0}%) scale(${clip.scale == null ? 1 : Number(clip.scale)})`,
})

function Words({ clip, len }) {
  const f = useCurrentFrame()
  const { width } = useVideoConfig()
  const k = width / 1080 // sizes are set for a 1080-wide frame
  const size = (Number(clip.size) || 64) * k
  const look = clip.look || 'box'
  const color = clip.color || '#ffffff'
  const pop = interpolate(f, [0, 8], [0.92, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fadeAt(f, len, clip) }}>
      <div
        style={{
          transform: `translate(${Number(clip.x) || 0}%, ${Number(clip.y) || 0}%) scale(${(clip.scale == null ? 1 : Number(clip.scale)) * pop})`,
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
  const box = { width: '100%', height: '100%', objectFit: fit }
  const from = Math.max(0, Math.round((Number(clip.from) || 0) * EDIT_FPS))
  const vol = clip.volume == null ? 1 : Number(clip.volume)
  return (
    <AbsoluteFill style={{ opacity: fadeAt(f, len, clip), ...placed(clip) }}>
      {clip.kind === 'image' ? (
        <Img src={srcOf(clip.src)} style={box} />
      ) : (
        <OffthreadVideo
          src={srcOf(clip.src)}
          trimBefore={from || undefined}
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
  if (muted || vol <= 0) return null
  return <Audio src={srcOf(clip.src)} trimBefore={from || undefined} volume={(i) => vol * fadeAt(i, len, clip)} />
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
