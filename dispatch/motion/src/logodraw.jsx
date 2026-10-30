/**
 * "Logo · Drawing" — a 10-second logo intro, no voice: the brand's own logo drawn from scratch.
 *
 *   0.0 s  a cream drafting page, its grid drawing itself
 *   0.4 s  the construction: circles round the logo's box, diagonals, axes, little nodes
 *   2.8 s  the logo's lines drawn in ink, sweeping round clockwise (a pencil scratching)
 *   6.0 s  the real logo fills in from the middle (a whoosh), the guides fade back
 *   7.2 s  the brand's name and tagline rise under it (a chime and a deep hit), a light sweep
 *
 * The lines come from the uploaded logo picture (app/logo_draw.py line_art → scene.art: the
 * line drawing and the logo, cropped to the same box, and the guides measured from its shapes —
 * each part's outer and inner circle, its axis, its outermost points). No logo → the brand's name is drawn
 * (its letters outlined, then filled). Sounds: logodrawCues, on the same frames (sfx.jsx).
 * Scenes (app/motion.py LOGODRAW_TYPES): draw {name, tagline, art}. 9:16 and 16:9.
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, KHMER_RE, clean, srcOf } from './shared'

const PAPER = '#EFEBE1'
const GRID = 'rgba(70, 64, 50, 0.13)'
const GUIDE = '#5E7F77'
const INK = '#182426'
// the timeline, in frames (30 fps)
export const F = { grid: 0, guides: 12, draw: 84, fill: 180, name: 216, end: 300 }

const ease = (f, a, b) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 })

/** [frame, sound] cues for sfx.jsx — beside the moves they sound for. */
export const logodrawCues = () => [
  [F.guides, 'riser'],
  [F.draw, 'sketch'],
  [F.draw + 96, 'sketch'], // the pencil keeps going while the drawing does
  [F.fill - 4, 'whoosh'],
  [F.name - 4, 'ding'],
  [F.name, 'impact'],
]

/** A line that draws itself from ``at`` over ``dur`` frames (SVG dash offset). */
function Draw({ d, at, dur, width = 1.6, color = GUIDE, opacity = 1, frame }) {
  const p = ease(frame, at, at + dur)
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} opacity={opacity} />
}

const circle = (cx, cy, r) => `M ${cx} ${cy - r} a ${r} ${r} 0 1 1 0 ${2 * r} a ${r} ${r} 0 1 1 0 ${-2 * r}`

function Draft({ scene, brand }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const wide = width > height
  const art = scene.art
  // the logo's box: fitted in a square of ~46% of the short side, its own proportions
  const side = Math.min(width, height) * (wide ? 0.5 : 0.56)
  const k = art ? Math.min(side / art.w, side / art.h) : 1
  const bw = art ? art.w * k : side
  const bh = art ? art.h * k : side * 0.4
  const cx = width / 2
  const cy = height * (wide ? 0.42 : 0.4)
  const R = Math.hypot(bw, bh) / 2 // the circle that holds the logo
  // the drafting page: a frame inset from the edges, its grid in cells of the logo's quarter
  const inset = Math.min(width, height) * 0.06
  const cell = Math.max(48, Math.round(Math.min(bw, bh) / 4))
  const cols = []
  for (let x = cx % cell; x < width; x += cell) if (x > inset && x < width - inset) cols.push(x)
  const rows = []
  for (let y = cy % cell; y < height; y += cell) if (y > inset && y < height - inset) rows.push(y)
  const settle = ease(frame, F.fill, F.fill + 40) // the guides step back once the logo fills
  const guideOpacity = 1 - 0.75 * settle
  // the drawing: revealed by a clockwise sweep from the top
  const sweep = ease(frame, F.draw, F.fill + 6) * 360
  const fill = ease(frame, F.fill, F.fill + 36)
  const lineOpacity = 1 - 0.85 * ease(frame, F.fill + 12, F.fill + 48)
  const camera = 1 + 0.035 * ease(frame, F.fill, F.end)
  const nameIn = spring({ frame: frame - F.name, fps: 30, config: { damping: 16, mass: 0.7 } })
  const tagIn = spring({ frame: frame - F.name - 10, fps: 30, config: { damping: 18 } })
  const shine = interpolate(frame, [F.name + 6, F.name + 40], [-0.3, 1.3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const accent = brand.color || INK
  // the nodes: where the guides cross the box's corners and the axes
  const nodes = [
    [cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2], [cx - bw / 2, cy + bh / 2], [cx + bw / 2, cy + bh / 2],
    [cx, cy - R], [cx, cy + R], [cx - R, cy], [cx + R, cy], [cx, cy],
  ]
  const g = (i) => F.guides + i * 7 // each guide starts a little after the one before
  // the logo's own construction (app/logo_draw.py guides), in its pixels → on screen
  const own = art?.guides?.circles?.length ? art.guides : null
  const X = (x) => cx - bw / 2 + x * k
  const Y = (y) => cy - bh / 2 + y * k
  const nameSize = Math.round(Math.min(width, height) * (wide ? 0.06 : 0.075))
  // no logo: the name itself is drawn — one line, as big as the page allows
  const word = clean(scene.name || brand.name)
  const wordSize = Math.min(bh * 0.9, (width * 0.78) / Math.max(4, [...word].length * 0.56))

  return (
    <AbsoluteFill style={{ background: PAPER, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${camera})` }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          {/* the page's grid, inside a ruled frame */}
          {cols.map((x, i) => (
            <Draw key={`c${i}`} d={`M ${x} ${inset} V ${height - inset}`} at={F.grid + i * 0.6} dur={20} width={1} color={GRID} frame={frame} />
          ))}
          {rows.map((y, i) => (
            <Draw key={`r${i}`} d={`M ${inset} ${y} H ${width - inset}`} at={F.grid + i * 0.6} dur={20} width={1} color={GRID} frame={frame} />
          ))}
          <Draw d={`M ${inset} ${inset} H ${width - inset} V ${height - inset} H ${inset} Z`} at={F.grid} dur={30} width={1.6} color="rgba(70,64,50,0.3)" frame={frame} />
          {/* the construction, fading back once the logo is filled */}
          <g opacity={guideOpacity}>
            {own ? (
              // THIS logo's construction (app/logo_draw.py guides): the circle round it all, then part by
              // part its outer circle, the largest circle inside it and the axis it leans along, then nodes
              <>
                {own.circles.map(([x, y, r, kind], i) => (
                  <Draw
                    key={`o${i}`}
                    d={circle(X(x), Y(y), r * k)}
                    at={kind === 'all' ? g(0) : F.guides + 6 + (i / own.circles.length) * 44}
                    dur={kind === 'all' ? 32 : 22}
                    width={kind === 'all' ? 1.6 : kind === 'outer' ? 1.3 : 1.1}
                    frame={frame}
                  />
                ))}
                {own.lines.map(([x1, y1, x2, y2], i) => (
                  <Draw key={`l${i}`} d={`M ${X(x1)} ${Y(y1)} L ${X(x2)} ${Y(y2)}`} at={F.guides + 12 + (i / own.lines.length) * 40} dur={22} width={1} opacity={0.8} frame={frame} />
                ))}
                <Draw d={`M ${cx} ${cy - R * 1.15} V ${cy + R * 1.15}`} at={g(2)} dur={28} width={1} frame={frame} />
                <Draw d={`M ${cx - R * 1.15} ${cy} H ${cx + R * 1.15}`} at={g(2)} dur={28} width={1} frame={frame} />
                <Draw d={`M ${cx - bw / 2} ${cy - bh / 2} H ${cx + bw / 2} V ${cy + bh / 2} H ${cx - bw / 2} Z`} at={g(4)} dur={30} width={1.2} frame={frame} />
                {own.nodes.map(([x, y], i) => {
                  const s = spring({ frame: frame - F.guides - 50 - i * 0.6, fps: 30, config: { damping: 12 } })
                  return <circle key={`n${i}`} cx={X(x)} cy={Y(y)} r={4.5 * s} fill={PAPER} stroke={GUIDE} strokeWidth={1.4} />
                })}
              </>
            ) : (
              // no logo to measure (the name is drawn): a classic construction round its box
              <>
                <Draw d={circle(cx, cy, R)} at={g(0)} dur={36} frame={frame} />
                <Draw d={circle(cx, cy, R * 0.62)} at={g(1)} dur={32} frame={frame} />
                <Draw d={circle(cx - R * 0.5, cy, R * 0.62)} at={g(2)} dur={34} width={1.1} frame={frame} />
                <Draw d={circle(cx + R * 0.5, cy, R * 0.62)} at={g(3)} dur={34} width={1.1} frame={frame} />
                <Draw d={`M ${cx - R * 1.25} ${cy - R * 1.25} L ${cx + R * 1.25} ${cy + R * 1.25}`} at={g(4)} dur={30} width={1.1} frame={frame} />
                <Draw d={`M ${cx + R * 1.25} ${cy - R * 1.25} L ${cx - R * 1.25} ${cy + R * 1.25}`} at={g(5)} dur={30} width={1.1} frame={frame} />
                <Draw d={`M ${cx} ${cy - R * 1.3} V ${cy + R * 1.3}`} at={g(5)} dur={28} width={1.1} frame={frame} />
                <Draw d={`M ${cx - R * 1.3} ${cy} H ${cx + R * 1.3}`} at={g(6)} dur={28} width={1.1} frame={frame} />
                <Draw d={`M ${cx - bw / 2} ${cy - bh / 2} H ${cx + bw / 2} V ${cy + bh / 2} H ${cx - bw / 2} Z`} at={g(6)} dur={30} width={1.3} frame={frame} />
                {nodes.map(([x, y], i) => {
                  const s = spring({ frame: frame - g(7) - i * 3, fps: 30, config: { damping: 12 } })
                  return <circle key={i} cx={x} cy={y} r={5 * s} fill={PAPER} stroke={GUIDE} strokeWidth={1.4} />
                })}
              </>
            )}
          </g>
        </svg>

        {/* the logo: drawn in ink, then filled with itself */}
        <div style={{ position: 'absolute', left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh }}>
          {art ? (
            <>
              <Img
                src={srcOf(art.line)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: lineOpacity,
                  WebkitMaskImage: `conic-gradient(from 0deg, #000 ${sweep}deg, transparent ${sweep}deg)`,
                  maskImage: `conic-gradient(from 0deg, #000 ${sweep}deg, transparent ${sweep}deg)`,
                }}
              />
              <Img
                src={srcOf(art.fill)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  clipPath: `circle(${fill * 75}% at 50% 50%)`,
                  filter: 'drop-shadow(0 18px 30px rgba(24,36,38,0.18))',
                }}
              />
              {/* a light sweeping across the finished logo */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  WebkitMaskImage: `url(${srcOf(art.fill)})`,
                  maskImage: `url(${srcOf(art.fill)})`,
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                  background: `linear-gradient(105deg, transparent ${shine * 100 - 18}%, rgba(255,255,255,0.75) ${shine * 100}%, transparent ${shine * 100 + 18}%)`,
                }}
              />
            </>
          ) : (
            // no logo: the brand's name, outlined in ink, then filled in its colour
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <span
                style={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: wordSize, whiteSpace: 'nowrap',
                  letterSpacing: '-0.02em',
                  color: `rgba(0,0,0,0)`,
                  WebkitTextStroke: `${Math.max(2, bh * 0.012)}px ${INK}`,
                  WebkitMaskImage: `linear-gradient(90deg, #000 ${(sweep / 360) * 100}%, transparent ${(sweep / 360) * 100}%)`,
                  maskImage: `linear-gradient(90deg, #000 ${(sweep / 360) * 100}%, transparent ${(sweep / 360) * 100}%)`,
                  opacity: lineOpacity,
                  position: 'absolute',
                }}
              >
                {word}
              </span>
              <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: wordSize, whiteSpace: 'nowrap', letterSpacing: '-0.02em', color: accent, opacity: fill, position: 'absolute' }}>{word}</span>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* the name and the tagline, under the logo */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + Math.max(bh / 2, R * 0.75) + (wide ? 34 : 70), textAlign: 'center', fontFamily: FONT }}>
        {art && (
          <div style={{ fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.02em', color: INK, opacity: nameIn, transform: `translateY(${(1 - nameIn) * 30}px)` }}>
            {clean(scene.name || brand.name)}
          </div>
        )}
        {scene.tagline && (
          <div style={{ marginTop: 14, fontSize: Math.round(nameSize * (KHMER_RE.test(scene.tagline) ? 0.5 : 0.42)), fontWeight: 600, ...(KHMER_RE.test(scene.tagline) ? {} : { letterSpacing: '0.18em', textTransform: 'uppercase' }), color: accent, opacity: tagIn, transform: `translateY(${(1 - tagIn) * 20}px)` }}>
            {clean(scene.tagline)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

export const LOGODRAW = {
  scenes: { draw: Draft },
  root: { backgroundColor: PAPER },
  chrome: () => null, // the logo is the whole video — no corner chip
  noCaption: ['draw'], // no voice, no subtitles
}
