/**
 * "Picture story" — a narrated story told over full-screen AI pictures: one
 * picture per scene (app/images/doodle.py picture_style, in the art style picked),
 * a slow camera move on each (in, out, or a drift — never the same twice in a
 * row), soft crossfades between them, and a short line of text on every
 * picture in the colours the person picked (scene.ink: text + highlight,
 * ⟦words⟧ in the highlight), the subtitles below. A picture that couldn't be
 * painted leaves a calm dark frame with the words.
 *
 * Scenes (app/video/motion/ PICTURE_TYPES): shot {title, image, ink}. 9:16 and 16:9.
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

// a stick-figure page's drawing sits between the title and the subtitles — never under them:
// [top, bottom] of its box (the drawing fitted inside, centred)
const PAGE_BOX = { wide: ['36%', '15%'], tall: ['28%', '23.5%'] } // tall: under a two-line title (ends ~y 530)
// a wide page with a title (the user, 2026-10-30): the drawing on one half, the big title on the
// other — [left, right] of the drawing's box when the title is on the left / on the right
const WIDE_SIDE = { left: ['46%', '3%'], right: ['3%', '46%'] }
const WIDE_SIDE_Y = ['12%', '15%'] // under the logo chip, over the subtitles

function Picture({ src, seed, page = false, side = null }) {
  const frame = useCurrentFrame()
  const { durationInFrames, width, height } = useVideoConfig()
  const [boxTop, boxBottom] = page ? (side ? WIDE_SIDE_Y : PAGE_BOX[width > height ? 'wide' : 'tall']) : [0, 0]
  const [boxLeft, boxRight] = side ? WIDE_SIDE[side] : ['0%', '0%']
  const [s0, s1, dx, dy] = MOVES[Math.floor(random(seed) * MOVES.length)]
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  // a stick-figure page: the whole drawing fits (painted 2:3, the video 9:16 — cover cut its sides),
  // standing on the bottom of the white page, the camera only leaning in a little, from the bottom
  const scale = page ? 1 + Math.min(0.05, Math.abs(s1 - s0) * 0.4) * t : s0 + (s1 - s0) * t
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: page ? '#FFFFFF' : '#0d0f14' }}>
      {src && (
        <Img
          src={srcOf(src)}
          style={{
            position: 'absolute',
            left: boxLeft,
            top: boxTop,
            width: `calc(100% - ${boxLeft} - ${boxRight})`,
            height: page ? `calc(100% - ${boxTop} - ${boxBottom})` : '100%',
            objectFit: page ? 'contain' : 'cover',
            objectPosition: page ? '50% 50%' : undefined,
            transform: page ? `scale(${scale})` : `scale(${scale}) translate(${dx * (t - 0.5)}%, ${dy * (t - 0.5)}%)`,
            transformOrigin: page ? '50% 50%' : undefined,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

/** The line on the picture, word by word; ⟦marked⟧ words in the highlight colour. */
function Title({ text, ink, wide, page = false, side = null, card = false }) {
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
  // a stick-figure page: one centred title across the top, under the logo — or, wide, beside the drawing
  // a colour stick-figure card (the user, 2026-11-04: "a bit smaller"): a label, not a thumbnail
  const box = card ? (wide ? 760 : 900) : side ? 760 : page && wide ? 1600 : wide ? 800 : 940
  const len = Math.max(6, [...clean(text)].filter((ch) => !/[ា-៓៝]/.test(ch)).length)
  // a tall video's two lines stay inside the picture's calm top (y 250–610 of 1920),
  // off the person below: 112 px tops (two Khmer lines with the bigger key word ≈ 355 px)
  // (a tall video: a Khmer letter ≈ 0.9 em with its marks, gaps and the bigger key word, measured — 0.62
  // let long titles wrap to three over the person; a wide one has the side free, three big lines are fine)
  // a wide stick-figure page: two lines in its white top band (WIDE_PAGE_TOP), measured like a tall one
  const per = khmer ? (wide && !page && !card ? 0.62 : 0.9) : 0.68
  // a stick-figure page's title a little smaller than a photo's: it reads under the logo, the drawing is the hero
  // …but beside the drawing it's the half the drawing left: big, one or two lines
  const most = card ? (wide ? 124 : 104) : side ? 140 : page ? (wide ? 76 : 100) : wide ? 150 : 112
  const size = Math.max(card ? (wide ? 64 : 56) : side ? 64 : page ? (wide ? 48 : 58) : wide ? 70 : 64, Math.min(most, (box * 2) / (len * per)))
  const align = side ? (side === 'right' ? 'flex-end' : 'flex-start') : 'center'
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: khmer ? 700 : 800,
        letterSpacing: khmer ? 0 : '-0.015em',
        fontSize: size,
        // a card's rows set very close (the user, 2026-11-05), still room for the Khmer marks above and feet below (ម្ចាស់, ឬ)
        lineHeight: khmer ? (card ? 1.12 : 1.45) : card ? 1.02 : 1.08,
        color: ink.text,
        textWrap: 'balance', // two even lines, not one long and one word
        // readable on any picture: a soft dark halo, no box (none on a white stick-figure page)
        // a colour stick-figure title: a thick dark outline round each letter, cartoon-caption style,
        // readable on a pale wall, a sky or a night window alike — no box behind it
        // (a dark outline round light words, a white one round dark words)
        // (a colour stick-figure card: clean letters, no outline, glow or shadow — the user, 2026-11-05;
        // their colour follows the picture behind them, Shot)
        textShadow: page || card ? 'none' : '0 4px 24px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.55)',
        textAlign: page ? (side || 'center') : card ? side || 'center' : undefined,
        // a page's title always wraps between its words — a long Khmer line never runs off the edges
        ...(page ? { display: 'flex', flexWrap: 'wrap', justifyContent: align, alignItems: 'baseline' } : {}),
        // a card: its two rows stacked, lined up on its side (or centred)
        ...(card ? { display: 'flex', flexDirection: 'column', alignItems: align } : {}),
      }}
    >
      {card
        ? twoRows(pieces).map((row, r) => (
            <div key={r} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align, alignItems: 'baseline' }}>
              {row.map((piece) => word(piece))}
            </div>
          ))
        : pieces.map((piece, n) => word({ ...piece, n }))}
    </div>
  )

  function word({ p, gap, em: hi, n }) {
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
          ...(hi && card ? { lineHeight: 1 } : {}), // …without pushing its row away from the other
        }}
      >
        {p}
      </span>
    )
  }
}

/** A card's words in two rows of about the same length, broken between words
 * (a short title stays one row). Each piece keeps its place ``n`` for the word-by-word entrance. */
function twoRows(pieces) {
  const all = pieces.map((x, n) => ({ ...x, n }))
  const glyphs = (x) => [...x.p].filter((ch) => !/[ា-៓៝]/.test(ch)).length * (x.em ? 1.18 : 1)
  const total = all.reduce((a, x) => a + glyphs(x), 0)
  if (total < 9) return [all]
  let best = -1
  let gapBest = Infinity
  let run = 0
  all.forEach((x, i) => {
    run += glyphs(x)
    if (x.gap && i < all.length - 1 && Math.abs(total / 2 - run) < gapBest) {
      gapBest = Math.abs(total / 2 - run)
      best = i
    }
  })
  return best < 0 ? [all] : [all.slice(0, best + 1), all.slice(best + 1)]
}

/** A wide stick-figure page's title, like a YouTube thumbnail (the user's sample, 2026-10-30):
 * the words before the ⟦key words⟧ small, the key words big in the highlight colour, the words
 * after small again — three lines lined up on the side they sit on. No marked words: Title. */
function StackTitle({ text, ink, side }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const raw = String(text || '')
  const m = raw.match(/^(.*?)⟦(.+?)⟧(.*)$/s)
  if (!m) return <Title text={text} ink={ink} wide page side={side} />
  const tidy = (s) => clean(s.replace(/[⟦⟧]/g, '')).replace(/​/g, '').trim()
  const [before, key, after] = [tidy(m[1]), tidy(m[2]), tidy(m[3])]
  const W = 760
  const glyphs = (s) => Math.max(3, [...s].filter((ch) => !/[ា-៓៝\s]/.test(ch)).length)
  const per = KHMER_RE.test(raw) ? 0.82 : 0.6
  const big = Math.round(Math.max(84, Math.min(190, W / (glyphs(key) * per))))
  const small = (s) => Math.round(Math.max(44, Math.min(big * 0.45, (W * 1.6) / (glyphs(s) * per))))
  const lines = [before && { t: before, size: small(before), color: ink.text }, { t: key, size: big, color: ink.accent }, after && { t: after, size: small(after), color: ink.text }].filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: side === 'right' ? 'flex-end' : 'flex-start', textAlign: side, fontFamily: FONT, fontWeight: 700 }}>
      {lines.map((L, i) => {
        const s = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 16, mass: 0.6 } })
        return (
          <div key={i} style={{ fontSize: L.size, lineHeight: KHMER_RE.test(L.t) ? 1.42 : 1.08, color: L.color, opacity: s, transform: `translateX(${(1 - s) * (side === 'right' ? 60 : -60)}px)` }}>
            {L.t}
          </div>
        )
      })}
    </div>
  )
}

/** How light a #rrggbb colour is, 0 (black) to 1 (white). */
function lightness(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return 1
  const n = parseInt(m[1], 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

function Shot({ scene, brand }) {
  const { width, height } = useVideoConfig()
  const wide = width > height
  const right = scene.side === 'right'
  let ink = { text: '#FFFFFF', accent: '#FFD400', ...(scene.ink || {}) }
  if (scene.art === 'stickman') {
    // a white page (the user, 2026-10-30): the key words in the brand's own colour — navy for a
    // navy logo, orange for orange — the rest in dark ink, never white text on the white page
    const text = lightness(ink.text) > 0.6 ? '#16181D' : ink.text
    const own = brand?.color && lightness(brand.color) < 0.72 ? brand.color : null
    ink = { text, accent: own || (lightness(ink.accent) < 0.72 ? ink.accent : text) }
  }
  const seed = clean(scene.caption || scene.title || '') || 'picture'
  if (scene.art === 'stickman') {
    // Stick figures: black-ink drawings on a white page. Tall: the title centred across the white
    // top. Wide: the drawing on one half and the title, big, on the other (scene.side, else left).
    if (wide && scene.title) {
      const side = right ? 'right' : 'left'
      return (
        <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
          <Picture src={scene.image} seed={seed} page side={side} />
          <div style={{ position: 'absolute', top: 175, bottom: 175, [side]: 110, width: 760, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <StackTitle text={scene.title} ink={ink} side={side} />
            </div>
          </div>
        </AbsoluteFill>
      )
    }
    return (
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
        <Picture src={scene.image} seed={seed} page />
        {/* the title under the logo chip (it ends ~y 165 wide / ~240 tall), never beside it */}
        {scene.title && (
          <div style={{ position: 'absolute', left: wide ? 160 : 60, right: wide ? 160 : 60, top: wide ? 185 : 265 }}>
            <Title text={scene.title} ink={ink} wide={wide} page />
          </div>
        )}
      </AbsoluteFill>
    )
  }
  if (scene.art === 'stickcolor') {
    // Colour stick figures (the user, 2026-11-04: smaller words, in the best place, no box, the
    // brand's colours): the words in the text colour picked (white by default) with a cartoon
    // outline, the key words in the highlight picked — the brand's own colour unless they chose
    // another (app/video/motion/ build_props) — exactly that colour; a dark one (navy) gets a white
    // outline instead of the dark one (Title). In the calm top centre of a tall picture (under the
    // logo, over the people), on the calm half of a wide one (app/video/motion/ picture_room keeps
    // those parts free). No dark shade.
    // No outline (the user, 2026-11-05: "remove the black border"): the rooms are soft and light,
    // so light words (the white default) turn the deep ink, and a light highlight (yellow) a deeper
    // shade of itself — both read on the wall without a border. Dark colours picked stay exact.
    // On a dark picture (scene.tone "dark" — app/video/motion/ title_tone measures where the words go;
    // no picture = the dark page) it's the other way round: light words, a light highlight.
    const accent = scene.ink?.accent || brand?.color || '#FFD400'
    const dark = scene.tone === 'dark' || !scene.image
    const cardInk = dark
      ? {
          text: lightness(ink.text) < 0.6 ? '#FFF8EE' : ink.text,
          accent: lightness(accent) < 0.45 ? `color-mix(in srgb, ${accent} 55%, #FFFFFF)` : accent,
        }
      : {
          text: lightness(ink.text) > 0.6 ? '#2A211B' : ink.text,
          accent: lightness(accent) > 0.6 ? `color-mix(in srgb, ${accent} 62%, #3A2410)` : accent,
        }
    const side = right ? 'right' : 'left'
    return (
      <AbsoluteFill>
        <Picture src={scene.image} seed={seed} />
        {scene.title &&
          (wide ? (
            // two big rows, in the middle of the calm side (app/video/motion/ picture_room keeps it free),
            // above the subtitle band
            <div style={{ position: 'absolute', top: 150, bottom: 190, [side]: 110, width: 760, display: 'flex', alignItems: 'center', justifyContent: right ? 'flex-end' : 'flex-start' }}>
              <Title text={scene.title} ink={cardInk} wide card side={side} />
            </div>
          ) : (
            <div style={{ position: 'absolute', left: 60, right: 60, top: 270, display: 'flex', justifyContent: 'center' }}>
              <Title text={scene.title} ink={cardInk} card />
            </div>
          ))}
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
      {/* the words on the side the picture left calm (app/video/motion/ picture_room):
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
  caption: { size: 40 }, // the subtitles a little smaller than other templates'
}
