/**
 * "Picture story" — a narrated story told over full-screen AI pictures: one
 * picture per scene (app/doodle.py picture_style, in the art style picked),
 * a slow camera move on each (in, out, or a drift — never the same twice in a
 * row), soft crossfades between them, and a short line of text on every
 * picture in the colours the person picked (scene.ink: text + highlight,
 * ⟦words⟧ in the highlight), the subtitles below. A picture that couldn't be
 * painted leaves a calm dark frame with the words.
 *
 * Scenes (app/motion.py PICTURE_TYPES): shot {title, image, ink}. 9:16 and 16:9.
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { fade } from '@remotion/transitions/fade'
import { EM_CLOSE, EM_OPEN, FONT, KHMER_RE, ZWSP, clean, srcOf } from './shared'

// the camera moves, by seed: [scale from, scale to, x drift %, y drift %]
const MOVES = [
  [1.0, 1.12, 0, 0], // slow push in
  [1.14, 1.02, 0, 0], // slow pull out
  [1.1, 1.1, -3.5, 0], // drift left
  [1.1, 1.1, 3.5, 0], // drift right
  [1.04, 1.14, 0, -2.5], // push in, rising
]

function Picture({ src, seed }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const [s0, s1, dx, dy] = MOVES[Math.floor(random(seed) * MOVES.length)]
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  const scale = s0 + (s1 - s0) * t
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#0d0f14' }}>
      {src && (
        <Img
          src={srcOf(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${dx * (t - 0.5)}%, ${dy * (t - 0.5)}%)`,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

/** The line on the picture, word by word; ⟦marked⟧ words in the highlight colour. */
function Title({ text, ink, wide }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pieces = []
  let em = false
  for (const word of String(text || '').split(' ').filter(Boolean)) {
    const parts = word.split(ZWSP).filter(Boolean)
    parts.forEach((p, i) => {
      for (const bit of p.split(/([⟦⟧])/).filter(Boolean)) {
        if (bit === EM_OPEN) em = true
        else if (bit === EM_CLOSE) em = false
        else pieces.push({ p: bit, gap: false, em })
      }
      if (i === parts.length - 1 && pieces.length) pieces[pieces.length - 1].gap = true
    })
  }
  const khmer = KHMER_RE.test(text || '')
  const len = clean(text).length
  // big for a few words, smaller for a long line — it never covers the picture
  const size = (wide ? 84 : 92) * (len > 34 ? 0.72 : len > 22 ? 0.85 : 1)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        fontFamily: FONT,
        fontWeight: khmer ? 700 : 800,
        letterSpacing: khmer ? 0 : '-0.012em',
        fontSize: size,
        lineHeight: khmer ? 1.5 : 1.12,
        color: ink.text,
        // readable on any picture: a soft dark halo, no box
        textShadow: '0 3px 18px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.6)',
      }}
    >
      {pieces.map(({ p, gap, em: hi }, n) => {
        const s = spring({ frame: frame - 10 - n * 2, fps, config: { damping: 40, mass: 0.5 } })
        return (
          <span
            key={n}
            style={{
              display: 'inline-block',
              marginRight: gap ? '0.26em' : 0,
              opacity: s,
              transform: `translateY(${(1 - s) * 34}px)`,
              color: hi ? ink.accent : undefined,
            }}
          >
            {p}
          </span>
        )
      })}
    </div>
  )
}

function Shot({ scene }) {
  const { width, height } = useVideoConfig()
  const wide = width > height
  const ink = { text: '#FFFFFF', accent: '#FFD400', ...(scene.ink || {}) }
  const seed = clean(scene.caption || scene.title || '') || 'picture'
  return (
    <AbsoluteFill>
      <Picture src={scene.image} seed={seed} />
      {/* a light shade under the words only — the picture stays clear */}
      {scene.title && (
        <AbsoluteFill
          style={{
            background: wide
              ? 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0) 50%)'
              : 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 24%, rgba(0,0,0,0) 46%)',
          }}
        />
      )}
      {scene.title && (
        <div
          style={{
            position: 'absolute',
            left: wide ? 110 : 72,
            right: wide ? 520 : 72,
            top: wide ? 200 : 300, // under the logo chip (shared.jsx chipTop)
          }}
        >
          <Title text={scene.title} ink={ink} wide={wide} />
        </div>
      )}
    </AbsoluteFill>
  )
}

export const PICTURE = {
  scenes: { shot: Shot },
  root: { backgroundColor: '#0d0f14' },
  transitions: [() => fade()], // a soft crossfade every time — never a slide over a picture
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}
