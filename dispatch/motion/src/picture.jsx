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

function Picture({ src, seed, page = false }) {
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
            transform: `scale(${scale}) translate(${dx * (t - 0.5)}%, ${(page ? 0 : dy) * (t - 0.5)}%)`,
            // a stick-figure page grows from its top edge: the drawing never rises into the title
            transformOrigin: page ? '50% 0%' : undefined,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

/** The line on the picture, word by word; ⟦marked⟧ words in the highlight colour. */
function Title({ text, ink, wide, page = false }) {
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
  // like a YouTube thumbnail: as big as two lines across the free side allow
  // (Khmer marks stack on their letters, so a Khmer character is narrower)
  const box = page && wide ? 1640 : wide ? 800 : 940 // a stick-figure page: one centred title across the top
  const len = Math.max(6, [...clean(text)].filter((ch) => !/[ា-៓៝]/.test(ch)).length)
  // a tall video's two lines stay inside the picture's calm top (y 250–610 of 1920),
  // off the person below: 112 px tops (two Khmer lines with the bigger key word ≈ 355 px)
  // (a tall video: a Khmer letter ≈ 0.9 em with its marks, gaps and the bigger key word, measured — 0.62
  // let long titles wrap to three over the person; a wide one has the side free, three big lines are fine)
  const size = Math.max(wide ? 70 : 64, Math.min(wide ? 150 : 112, (box * 2) / (len * (khmer ? (wide ? 0.62 : 0.9) : 0.68))))
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: khmer ? 700 : 800,
        letterSpacing: khmer ? 0 : '-0.015em',
        fontSize: size,
        lineHeight: khmer ? 1.45 : 1.08,
        color: ink.text,
        textWrap: 'balance', // two even lines, not one long and one word
        // readable on any picture: a soft dark halo, no box (none on a white stick-figure page)
        textShadow: page ? 'none' : '0 4px 24px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.55)',
        textAlign: page ? 'center' : undefined,
      }}
    >
      {pieces.map(({ p, gap, em: hi }, n) => {
        const s = spring({ frame: frame - 10 - n * 2, fps, config: { damping: 40, mass: 0.5 } })
        return (
          <span
            key={n}
            style={{
              display: 'inline-block',
              marginRight: gap ? '0.24em' : 0,
              opacity: s,
              transform: `translateY(${(1 - s) * 34}px)`,
              color: hi ? ink.accent : undefined,
              fontSize: hi ? '1.18em' : undefined, // the key word, bigger — the thumbnail look
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
  const right = scene.side === 'right'
  const ink = { text: '#FFFFFF', accent: '#FFD400', ...(scene.ink || {}) }
  const seed = clean(scene.caption || scene.title || '') || 'picture'
  if (scene.art === 'stickman') {
    // Stick figures: black-ink drawings on a white page, the title centred across the white top
    return (
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
        <Picture src={scene.image} seed={seed} page />
        {scene.title && (
          <div style={{ position: 'absolute', left: wide ? 140 : 60, right: wide ? 140 : 60, top: wide ? 70 : 250 }}>
            <Title text={scene.title} ink={ink} wide={wide} page />
          </div>
        )}
      </AbsoluteFill>
    )
  }
  return (
    <AbsoluteFill>
      <Picture src={scene.image} seed={seed} />
      {/* a light shade under the words only — the picture stays clear */}
      {scene.title && (
        <AbsoluteFill
          style={{
            background: wide
              ? `linear-gradient(${right ? 270 : 90}deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.32) 30%, rgba(0,0,0,0) 55%)`
              : 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.42) 22%, rgba(0,0,0,0) 46%)',
          }}
        />
      )}
      {/* the words on the side the picture left calm (app/motion.py picture_room):
          left or right, in the middle, in a wide video — at the top in a tall one */}
      {scene.title &&
        (wide ? (
          <div style={{ position: 'absolute', top: 150, bottom: 170, [right ? 'right' : 'left']: 100, width: 800, display: 'flex', alignItems: 'center', textAlign: right ? 'right' : 'left' }}>
            <div style={{ width: '100%' }}>
              <Title text={scene.title} ink={ink} wide />
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 70, right: 70, top: 250 }}>
            <Title text={scene.title} ink={ink} wide={false} />
          </div>
        ))}
    </AbsoluteFill>
  )
}

export const PICTURE = {
  scenes: { shot: Shot },
  root: { backgroundColor: '#0d0f14' },
  transitions: [() => fade()], // a soft crossfade every time — never a slide over a picture
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}
