/**
 * The cartoon people shared by Story · Characters (cartoon.jsx) and Lesson ·
 * Teacher (lesson.jsx): a round white head with a simple face, a body in its
 * colour, stick arms and legs — the Khmer cartoon-Reel look. Drawn here (not
 * by the image model) so a person stays the same person in every scene.
 */
import { useCurrentFrame } from 'remotion'

export const INK = '#151515'
export const CLOTHES = { green: '#2F8F5B', blue: '#3A6FD8', red: '#E5452F', orange: '#F08A24', purple: '#7B5CD6', grey: '#8A8F98', teal: '#1F8C8C', yellow: '#F2C230' }
const SKIN = '#FFFFFF'
const BLUSH = '#F6A5A5'
const ARM_BASE = (Math.atan2(17, 4) * 180) / Math.PI // the resting arm's direction

/**
 * One person, feet centred at (``x``, ``ground``), ``h`` tall. ``look`` dresses
 * them (cap, apron, tie, glasses, bun, ponytail); ``talking`` moves the mouth
 * and the arm; ``mood`` sets eyes, brows and mouth; ``point`` ({x, y}, same
 * space as x / ground) aims a pointer stick held in the near hand.
 */
export function Figure({ x, ground, h, look, color, fallback = 'teal', mood = 'happy', talking = false, wave = false, point = null, enter = 1, flip = false, seed = 0 }) {
  const frame = useCurrentFrame()
  const s = h / 100 // drawing units: the person is 100 tall
  const body = CLOTHES[color] || CLOTHES[fallback] || CLOTHES.teal
  const blink = (frame + seed * 37) % 96 > 90
  const open = talking && Math.floor(frame / 4) % 2 === 0
  const bob = Math.sin(frame / (talking ? 4 : 18) + seed) * (talking ? 0.6 : 0.35)
  let arm = wave ? -60 + Math.sin(frame / 4) * 22 : talking ? -25 + Math.sin(frame / 6) * 14 : 10
  if (point) {
    // the shoulder on screen, then the angle to the target in the drawing's own (maybe flipped) space
    const sx = x + (flip ? -7 : 7) * s
    const sy = ground - 62 * s
    const dx = (point.x - sx) * (flip ? -1 : 1)
    arm = (Math.atan2(point.y - sy, dx) * 180) / Math.PI - ARM_BASE + Math.sin(frame / 9) * 1.5
  }
  const ink = { stroke: INK, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const eyes = (() => {
    if (blink) return <g {...ink} fill="none"><line x1={-6} y1={-81} x2={-3} y2={-81} /><line x1={3} y1={-81} x2={6} y2={-81} /></g>
    if (mood === 'shocked') return <g {...ink} fill="white"><circle cx={-4.5} cy={-82} r={2.6} /><circle cx={4.5} cy={-82} r={2.6} /><circle cx={-4.5} cy={-82} r={0.9} fill={INK} /><circle cx={4.5} cy={-82} r={0.9} fill={INK} /></g>
    if (mood === 'happy' || mood === 'excited') return <g {...ink} fill="none"><path d="M -7 -81 Q -4.5 -85 -2 -81" /><path d="M 2 -81 Q 4.5 -85 7 -81" /></g>
    const up = mood === 'thinking' ? -1.2 : 0
    return <g fill={INK}><circle cx={-4.5} cy={-81 + up} r={1.3} /><circle cx={4.5} cy={-81 + up} r={1.3} /></g>
  })()
  const brows = mood === 'worried' || mood === 'sad'
    ? <g {...ink} fill="none"><line x1={-7} y1={-85} x2={-2.5} y2={-86.5} /><line x1={2.5} y1={-86.5} x2={7} y2={-85} /></g>
    : mood === 'angry'
      ? <g {...ink} fill="none"><line x1={-7} y1={-87} x2={-2.5} y2={-85} /><line x1={2.5} y1={-85} x2={7} y2={-87} /></g>
      : null
  const mouth = open
    ? <ellipse cx={0} cy={-75.5} rx={2.6} ry={mood === 'shocked' ? 3 : 2.2} fill={INK} />
    : mood === 'sad' || mood === 'worried' || mood === 'angry'
      ? <path d="M -3 -74.5 Q 0 -77 3 -74.5" {...ink} fill="none" />
      : mood === 'shocked'
        ? <ellipse cx={0} cy={-75} rx={2} ry={2.6} fill={INK} />
        : mood === 'thinking'
          ? <line x1={-2} y1={-75.5} x2={2.5} y2={-76} {...ink} />
          : <path d={mood === 'excited' ? 'M -4 -77 Q 0 -71 4 -77 Z' : 'M -3.5 -76.5 Q 0 -73 3.5 -76.5'} {...ink} fill={mood === 'excited' ? INK : 'none'} />
  const hair = {
    apron: <path d="M -11 -88 L -9 -97 L -5 -92 L -1 -99 L 3 -92 L 7 -98 L 9 -89 Q 0 -93 -11 -88 Z" fill={INK} />,
    bun: <g fill={INK}><circle cx={0} cy={-97.5} r={4} /><path d="M -11 -84 Q -11 -95 0 -95 Q 11 -95 11 -84 Q 6 -90 0 -90 Q -6 -90 -11 -84 Z" /></g>,
    ponytail: <g fill={INK}><path d="M -11 -84 Q -11 -95 0 -95 Q 11 -95 11 -84 Q 5 -90 -11 -84 Z" /><path d="M 10 -88 Q 19 -86 17 -72 Q 13 -80 9 -84 Z" /></g>,
    glasses: <path d="M -11.5 -84 Q -11 -95 0 -95 Q 11 -95 11.5 -84 Q 4 -91 -11.5 -84 Z" fill={INK} />,
    tie: <path d="M -11.5 -85 Q -10 -95 0 -95 Q 10 -95 11.5 -85 Q 0 -89 -11.5 -85 Z" fill={INK} />,
  }[look]
  const hat = look === 'cap'
    ? <g {...ink} strokeWidth={1.2} fill={body}><path d="M -11 -86 Q -11 -97 0 -97 Q 11 -97 11 -86 Z" /><path d="M 9 -87 L 19 -86 Q 19 -84 10 -84.5" /></g>
    : null
  return (
    <svg
      width={40 * s}
      height={110 * s}
      viewBox="-20 -105 40 110"
      style={{ position: 'absolute', left: x - 20 * s, top: ground - 105 * s, overflow: 'visible', opacity: Math.min(1, enter * 1.4), transform: `translateY(${(1 - enter) * 0.6 * h}px) scaleX(${flip ? -1 : 1})` }}
    >
      <ellipse cx={0} cy={1.5} rx={13} ry={2} fill="rgba(0,0,0,0.12)" />
      <g transform={`translate(0 ${bob})`}>
        <g {...ink} strokeWidth={1.6} fill="none">
          <line x1={-3} y1={-36} x2={-4} y2={-1} />
          <line x1={3} y1={-36} x2={4} y2={-1} />
        </g>
        <ellipse cx={-6} cy={-0.5} rx={4} ry={1.6} fill="white" {...ink} strokeWidth={1.2} />
        <ellipse cx={6} cy={-0.5} rx={4} ry={1.6} fill="white" {...ink} strokeWidth={1.2} />
        <path d="M -8 -66 Q -11 -50 -7 -35 L 7 -35 Q 11 -50 8 -66 Q 0 -70 -8 -66 Z" fill={look === 'apron' ? '#F3F3F3' : body} {...ink} strokeWidth={1.3} />
        {look === 'apron' && <path d="M -6 -60 L 6 -60 L 7 -37 L -7 -37 Z" fill={body} {...ink} strokeWidth={1.1} />}
        {look === 'tie' && <path d="M 0 -66 L -1.6 -62 L 0 -50 L 1.6 -62 Z" fill="#E5452F" {...ink} strokeWidth={0.8} />}
        <line x1={-7} y1={-62} x2={-11} y2={-45} {...ink} strokeWidth={1.5} />
        <g transform={`rotate(${arm} 7 -62)`}>
          {point && (
            // the pointer stick: on along the arm from the hand, a red tip
            <g strokeLinecap="round">
              <line x1={11} y1={-45} x2={11 + 0.229 * 58} y2={-45 + 0.973 * 58} stroke="#8B5A2B" strokeWidth={1.4} />
              <line x1={11 + 0.229 * 54} y1={-45 + 0.973 * 54} x2={11 + 0.229 * 58} y2={-45 + 0.973 * 58} stroke="#E5452F" strokeWidth={2} />
            </g>
          )}
          <line x1={7} y1={-62} x2={11} y2={-45} {...ink} strokeWidth={1.5} />
          <circle cx={11} cy={-44} r={1.6} fill="white" {...ink} strokeWidth={1} />
        </g>
        <circle cx={0} cy={-81} r={12} fill={SKIN} {...ink} strokeWidth={1.4} />
        {hair}
        {hat}
        <ellipse cx={-7.5} cy={-76.5} rx={2} ry={1.1} fill={BLUSH} />
        <ellipse cx={7.5} cy={-76.5} rx={2} ry={1.1} fill={BLUSH} />
        {eyes}
        {brows}
        {look === 'glasses' && <g {...ink} strokeWidth={0.9} fill="none"><circle cx={-4.5} cy={-81} r={3} /><circle cx={4.5} cy={-81} r={3} /><line x1={-1.5} y1={-81} x2={1.5} y2={-81} /></g>}
        {mouth}
      </g>
    </svg>
  )
}

