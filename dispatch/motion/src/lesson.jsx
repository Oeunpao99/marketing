/**
 * "Lesson · Teacher" — a cartoon teacher with a pointer stick explains one
 * idea on a whiteboard, then shows it with 2-3 example people (Dara saves,
 * Sokha spends…). The board fills itself part by part — a list, steps with
 * arrows, a sum (a + b = c), bars — and the stick follows: the part being
 * explained is ringed in orange. Every person is drawn in code
 * (characters.jsx), so they look the same all video. A plain classroom, no
 * AI pictures. 9:16 and 16:9.
 * Scene types: hook · whiteboard · example · remember · cta (app/motion.py LESSON_TYPES).
 */
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, clean, fitSize } from './shared'
import { Figure, INK } from './characters'
import { Pop } from './cartoon'

const C = { wall: '#F4EEE3', floor: '#E4D7C3', board: '#FFFFFF', frame: '#9A6A3C', orange: '#F08A24', red: '#E5452F', green: '#2F9E5B', soft: '#6B6257', tile: '#FFF4E6' }
const TEACHER = { look: 'glasses', color: 'blue' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = Easing.inOut(Easing.cubic)

function useRoom() {
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  return {
    W, H, fps, durationInFrames, wide, u,
    ground: wide ? 900 * u : 1440 * u,
    board: wide ? { x: 560 * u, y: 150 * u, w: W - 620 * u, h: 640 * u } : { x: 60 * u, y: 340 * u, w: W - 120 * u, h: 620 * u },
    teacher: wide ? { x: 290 * u, h: 560 * u } : { x: 170 * u, h: 440 * u }, // tall: under the board, pointing up
  }
}

/** The part being explained at this frame, and the stick's target easing between parts. */
function usePointer(targets, start = 0.6) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const n = targets.length
  const step = Math.max(0.7 * fps, Math.min(1.6 * fps, (durationInFrames - start * fps - 0.8 * fps) / Math.max(1, n)))
  const t = (frame - start * fps) / step
  const i = Math.max(0, Math.min(n - 1, Math.floor(t)))
  const prev = targets[Math.max(0, i - 1)]
  const cur = targets[i]
  const k = i === 0 ? 1 : ease(Math.min(1, ((t - i) * step) / 8))
  return {
    current: t < 0 ? -1 : i,
    shown: (j) => interpolate(frame, [start * fps + j * step - 4, start * fps + j * step + 8], [0, 1], clamp),
    at: cur ? { x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k } : null,
  }
}

// ── the room ───────────────────────────────────────────────────────────────
function Room({ children, plant = true }) {
  const { W, H, ground, u, wide } = useRoom()
  return (
    <AbsoluteFill style={{ backgroundColor: C.wall, overflow: 'hidden' }}>
      <NeatGrid color="rgba(120,90,50,0.07)" size={60} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ground - 20 * u, bottom: 0, background: C.floor, borderTop: `${5 * u}px solid ${INK}` }} />
      {/* a plant in the corner and a clock on the wall — a classroom */}
      {plant && !wide && (
      <svg width={160 * u} height={220 * u} style={{ position: 'absolute', left: W - 170 * u, top: ground - 200 * u }} viewBox="0 0 160 220">
        <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
          <path d="M 80 120 Q 30 90 20 30 Q 70 50 80 120 Z" fill={C.green} />
          <path d="M 80 120 Q 130 80 145 20 Q 95 45 80 120 Z" fill={C.green} />
          <path d="M 80 120 Q 70 60 85 5 Q 100 60 80 120 Z" fill="#3DB36E" />
          <path d="M 40 120 L 120 120 L 108 210 L 52 210 Z" fill={C.orange} />
        </g>
      </svg>
      )}
      {wide && (
        <svg width={120 * u} height={120 * u} viewBox="0 0 120 120" style={{ position: 'absolute', left: 80 * u, top: 150 * u }}>
          <circle cx={60} cy={60} r={52} fill="white" stroke={INK} strokeWidth={6} />
          <path d="M 60 60 L 60 28 M 60 60 L 82 70" stroke={INK} strokeWidth={6} strokeLinecap="round" />
        </svg>
      )}
      {children}
    </AbsoluteFill>
  )
}

/** The whiteboard on the wall: a wooden frame, a marker tray. */
function Board({ children }) {
  const { board: b, u } = useRoom()
  const p = spring({ frame: useCurrentFrame(), fps: 30, config: { damping: 16 } })
  return (
    <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, transform: `scale(${0.94 + 0.06 * p})`, opacity: Math.min(1, p * 2) }}>
      <div style={{ position: 'absolute', inset: 0, background: C.board, border: `${14 * u}px solid ${C.frame}`, borderRadius: 18 * u, boxShadow: `inset 0 0 0 ${4 * u}px ${INK}, 0 0 0 ${4 * u}px ${INK}, ${8 * u}px ${10 * u}px 0 rgba(0,0,0,0.12)` }} />
      <div style={{ position: 'absolute', left: '22%', right: '22%', bottom: -26 * u, height: 22 * u, background: C.frame, border: `${4 * u}px solid ${INK}`, borderRadius: 6 * u }} />
      {[C.red, '#3A6FD8', C.green].map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: `${30 + i * 8}%`, bottom: -16 * u, width: 60 * u, height: 14 * u, borderRadius: 6 * u, background: c, border: `${3 * u}px solid ${INK}` }} />
      ))}
      {children}
    </div>
  )
}

/** The title at the top of the screen, key words in red. */
function Title({ text, big = false }) {
  const { W, u, wide } = useRoom()
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 30 : 190) * u, display: 'flex', justifyContent: 'center' }}>
      <Pop text={text} size={(big ? (wide ? 84 : 96) : wide ? 66 : 74) * u} width={W * (wide ? 0.8 : 0.92)} outline />
    </div>
  )
}

/** The teacher, at the side of the board, pointing at ``at`` (or waving). */
function Teacher({ at, talking, wave = false, mood = 'happy', x, h }) {
  const room = useRoom()
  const e = spring({ frame: useCurrentFrame(), fps: room.fps, config: { damping: 14 } })
  return <Figure x={x ?? room.teacher.x} ground={room.ground} h={h ?? room.teacher.h} {...TEACHER} mood={mood} talking={talking} wave={wave} point={wave ? null : at} enter={e} seed={3} />
}

/** An orange ring round the part being explained. */
const ring = (on, u) => (on ? { boxShadow: `0 0 0 ${6 * u}px ${C.orange}`, transform: 'scale(1.04)' } : {})

/** A tile: an icon on a warm square, a label under it (and a value). */
function Tile({ part, size, on, show, u }) {
  return (
    <div style={{ width: size * 1.25, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * u, opacity: show, transform: `translateY(${(1 - show) * 30 * u}px)` }}>
      <div style={{ width: size, height: size, borderRadius: 28 * u, background: C.tile, border: `${5 * u}px solid ${INK}`, display: 'grid', placeItems: 'center', transition: 'none', ...ring(on, u) }}>
        <Icon name={part.icon || 'Sparkles'} size={size * 0.52} color={C.red} stroke={2.2} />
      </div>
      {part.value && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(part.value, 46 * u), color: C.red, lineHeight: 1.3 }}>{clean(part.value)}</div>}
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(part.label, 36 * u), color: INK, lineHeight: 1.45, textAlign: 'center' }}>{clean(part.label)}</div>
    </div>
  )
}

// ── what the board shows ───────────────────────────────────────────────────
/** Each kind lays its parts out and says where each one is (for the stick). */
function layout(kind, n, b, wide, u) {
  const pad = 50 * u
  const inner = { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad }
  if (kind === 'list') {
    const rowH = inner.h / n
    return Array.from({ length: n }, (_, i) => ({ x: inner.x + 55 * u, y: inner.y + rowH * (i + 0.5) }))
  }
  if (kind === 'bars') {
    const col = inner.w / n
    return Array.from({ length: n }, (_, i) => ({ x: inner.x + col * (i + 0.5), y: inner.y + inner.h * 0.45 }))
  }
  const across = kind === 'sum' || wide
  if (across) {
    const col = inner.w / n
    return Array.from({ length: n }, (_, i) => ({ x: inner.x + col * (i + 0.5), y: inner.y + inner.h * 0.42 }))
  }
  const rowH = inner.h / n
  return Array.from({ length: n }, (_, i) => ({ x: inner.x + 70 * u, y: inner.y + rowH * (i + 0.5) })) // steps down the left, words beside them
}

function BoardParts({ kind, parts, pointer, b, wide, u }) {
  const n = parts.length
  const spots = layout(kind, n, b, wide, u)
  const local = spots.map((p) => ({ x: p.x - b.x, y: p.y - b.y }))
  const frame = useCurrentFrame()
  if (kind === 'list') {
    return local.map((p, i) => {
      const s = pointer.shown(i)
      return (
        <div key={i} style={{ position: 'absolute', left: p.x - 55 * u, top: p.y - 55 * u, right: 50 * u, height: 110 * u, display: 'flex', alignItems: 'center', gap: 28 * u, opacity: s, transform: `translateX(${(1 - s) * -40 * u}px)` }}>
          <div style={{ flex: 'none', width: 110 * u, height: 110 * u, borderRadius: 26 * u, background: C.tile, border: `${5 * u}px solid ${INK}`, display: 'grid', placeItems: 'center', ...ring(pointer.current === i, u) }}>
            <Icon name={parts[i].icon || 'CircleCheck'} size={58 * u} color={C.red} stroke={2.2} />
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(parts[i].label, (wide ? 50 : 52) * u), color: INK, lineHeight: 1.45 }}>
            {clean(parts[i].label)}
            {parts[i].value && <span style={{ color: C.red, marginLeft: 16 * u }}>{clean(parts[i].value)}</span>}
          </div>
        </div>
      )
    })
  }
  if (kind === 'bars') {
    const nums = parts.map((p) => Math.max(0, Number(String(p.value || '').replace(/[^0-9.]/g, '')) || 0))
    const top = Math.max(1, ...nums)
    const maxH = b.h - 290 * u
    const col = (b.w - 100 * u) / n
    return (
      <>
        <div style={{ position: 'absolute', left: 50 * u, right: 50 * u, top: b.h - 170 * u, height: 5 * u, background: INK }} />
        {local.map((p, i) => {
          const s = pointer.shown(i)
          const g = interpolate(s, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) })
          const h = Math.max(24 * u, (nums[i] / top) * maxH) * g
          return (
            <div key={i} style={{ position: 'absolute', left: p.x - col * 0.32, width: col * 0.64, top: b.h - 170 * u - h, height: h, background: i === pointer.current ? C.orange : '#F6C58A', border: `${5 * u}px solid ${INK}`, borderBottom: 'none', borderRadius: `${14 * u}px ${14 * u}px 0 0` }}>
              <div style={{ position: 'absolute', left: -40 * u, right: -40 * u, top: -66 * u, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 44 * u, color: INK, opacity: s }}>{clean(parts[i].value)}</div>
              <div style={{ position: 'absolute', left: -50 * u, right: -50 * u, top: h + 18 * u, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: fitSize(parts[i].label, 36 * u), color: INK, lineHeight: 1.4, opacity: s }}>{clean(parts[i].label)}</div>
            </div>
          )
        })}
      </>
    )
  }
  // flow and sum: tiles with arrows / + and = between
  const across = kind === 'sum' || wide
  const size = (across ? Math.min(170, (b.w / u - 100) / n - 70) : Math.min(130, (b.h / u - 100) / n - 70)) * u
  return (
    <>
      {local.map((p, i) => {
        const s = pointer.shown(i)
        const between = i < n - 1 && local[i + 1]
        const op = kind === 'sum' && i < n - 1 ? (i === n - 2 ? '=' : parts[i + 1].op || '+') : null // a part's own sign: − × ÷
        return (
          <div key={i}>
            <div style={{ position: 'absolute', left: p.x - size * (across ? 0.625 : 0.5), top: p.y - size / 2 }}>
              {across ? (
                <Tile part={parts[i]} size={size} on={pointer.current === i} show={s} u={u} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 * u, opacity: s }}>
                  <div style={{ flex: 'none', width: size, height: size, borderRadius: 26 * u, background: C.tile, border: `${5 * u}px solid ${INK}`, display: 'grid', placeItems: 'center', ...ring(pointer.current === i, u) }}>
                    <Icon name={parts[i].icon || 'Sparkles'} size={size * 0.52} color={C.red} stroke={2.2} />
                  </div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(parts[i].label, 46 * u), color: INK, lineHeight: 1.45, whiteSpace: 'nowrap' }}>
                    {clean(parts[i].label)}
                    {parts[i].value && <span style={{ color: C.red, marginLeft: 14 * u }}>{clean(parts[i].value)}</span>}
                  </div>
                </div>
              )}
            </div>
            {between && (
              <div style={{ position: 'absolute', left: across ? (p.x + between.x) / 2 - 40 * u : p.x - 40 * u, top: across ? p.y - 40 * u : (p.y + between.y) / 2 - 40 * u, width: 80 * u, height: 80 * u, display: 'grid', placeItems: 'center', opacity: pointer.shown(i + 1), fontFamily: FONT, fontWeight: 800, fontSize: 84 * u, color: INK, lineHeight: 1 }}>
                {op || <Icon name={across ? 'ArrowRight' : 'ArrowDown'} size={64 * u} color={INK} stroke={3} />}
              </div>
            )}
          </div>
        )
      })}
      {/* a little marker squiggle under the result */}
      {kind === 'sum' && (
        <svg width={b.w} height={b.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <path d={`M ${local[n - 1].x - size * 0.6} ${local[n - 1].y + size * 1.62} q ${size * 0.3} ${-18 * u} ${size * 0.6} 0 t ${size * 0.6} 0`} fill="none" stroke={C.red} strokeWidth={7 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - pointer.shown(n - 1) * Math.min(1, frame / 40)} />
        </svg>
      )}
    </>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene }) {
  const frame = useCurrentFrame()
  const { board: b, u } = useRoom()
  const p = spring({ frame: frame - 12, fps: 30, config: { damping: 9 } })
  const size = Math.min(b.w, b.h) * 0.42
  const target = { x: b.x + b.w / 2 - size * 0.45, y: b.y + b.h / 2 }
  return (
    <Room>
      <Board>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: size, height: size, borderRadius: '50%', background: C.tile, border: `${7 * u}px solid ${INK}`, display: 'grid', placeItems: 'center', transform: `scale(${p}) rotate(${Math.sin(frame / 12) * 4}deg)` }}>
            <Icon name={scene.icon || 'Lightbulb'} size={size * 0.5} color={C.red} stroke={2.2} />
          </div>
        </div>
        {['?', '!', '?'].map((m, i) => (
          <div key={i} style={{ position: 'absolute', left: `${[18, 76, 70][i]}%`, top: `${[16, 22, 70][i]}%`, fontFamily: FONT, fontWeight: 800, fontSize: 90 * u, color: i === 1 ? C.orange : C.red, transform: `rotate(${(i - 1) * 14}deg) translateY(${Math.sin(frame / 8 + i) * 8 * u}px)`, opacity: interpolate(frame, [20 + i * 6, 30 + i * 6], [0, 1], clamp) }}>{m}</div>
        ))}
      </Board>
      <Teacher at={target} talking={!!scene.caption} mood={scene.mood || 'excited'} />
      <Title text={scene.text} big />
    </Room>
  )
}

function BoardScene({ scene }) {
  const { board: b, wide, u } = useRoom()
  const parts = (scene.parts || []).slice(0, 4)
  const spots = layout(scene.kind, parts.length, b, wide, u)
  const pointer = usePointer(spots)
  return (
    <Room>
      <Board>
        <BoardParts kind={scene.kind} parts={parts} pointer={pointer} b={b} wide={wide} u={u} />
      </Board>
      <Teacher at={pointer.at} talking={!!scene.caption} />
      <Title text={scene.title} />
    </Room>
  )
}

/** 2-3 example people, each with what they do over their head; the stick goes from one to the next. */
function Example({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { W, ground, wide, u } = useRoom()
  const people = (scene.people || []).slice(0, 3)
  const n = people.length
  const h = (wide ? 470 : 420) * u
  const left = (wide ? 560 : 270) * u
  const span = W - left - (wide ? 80 : 20) * u
  const xs = people.map((_, i) => left + span * ((i + 0.5) / n))
  const cardW = Math.min((wide ? 380 : 300) * u, span / n - 12 * u)
  const cardBottom = ground - h - 24 * u
  const pointer = usePointer(xs.map((x) => ({ x, y: cardBottom - 60 * u })), 0.7)
  return (
    <Room plant={false}>
      {people.map((p, i) => {
        const e = spring({ frame: frame - 6 - i * 5, fps, config: { damping: 13 } })
        const s = pointer.shown(i)
        const on = pointer.current === i
        const good = p.tone !== 'bad'
        return (
          <div key={i}>
            <Figure x={xs[i]} ground={ground} h={h} look={p.look} color={p.color} fallback={['teal', 'orange', 'purple'][i]} mood={s > 0.5 ? p.mood : 'happy'} enter={e} seed={i} flip={i === n - 1 && n > 1} />
            <div style={{ position: 'absolute', left: xs[i] - cardW / 2, width: cardW, top: cardBottom, transform: `translateY(-100%) scale(${0.6 + 0.4 * s})`, transformOrigin: '50% 100%', opacity: s }}>
              <div style={{ position: 'relative', background: 'white', border: `${5 * u}px solid ${INK}`, borderRadius: 26 * u, padding: `${18 * u}px ${16 * u}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u, ...ring(on, u) }}>
                <Icon name={p.icon || 'User'} size={64 * u} color={good ? C.green : C.red} stroke={2.2} />
                {p.value && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(p.value, 46 * u), color: good ? C.green : C.red, lineHeight: 1.3 }}>{clean(p.value)}</div>}
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(p.text, 32 * u), color: INK, lineHeight: 1.45, textAlign: 'center' }}>{clean(p.text)}</div>
                <div style={{ position: 'absolute', right: -18 * u, top: -18 * u, width: 50 * u, height: 50 * u, borderRadius: 50 * u, background: good ? C.green : C.red, border: `${4 * u}px solid ${INK}`, display: 'grid', placeItems: 'center' }}>
                  <Icon name={good ? 'Check' : 'X'} size={30 * u} color="white" stroke={3.5} />
                </div>
              </div>
            </div>
            {/* the name on the floor */}
            <div style={{ position: 'absolute', left: xs[i] - 120 * u, width: 240 * u, top: ground + 6 * u, textAlign: 'center', opacity: e }}>
              <span style={{ display: 'inline-block', padding: `${2 * u}px ${18 * u}px`, borderRadius: 999, background: INK, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: fitSize(p.name, 34 * u), lineHeight: 1.5 }}>{clean(p.name)}</span>
            </div>
          </div>
        )
      })}
      <Teacher at={pointer.at} talking={!!scene.caption} x={(wide ? 250 : 110) * u} h={(wide ? 520 : 400) * u} />
      <Title text={scene.title} />
    </Room>
  )
}

/** The lesson written big on the board. */
function Remember({ scene }) {
  const frame = useCurrentFrame()
  const { board: b, u } = useRoom()
  const p = spring({ frame: frame - 8, fps: 30, config: { damping: 11 } })
  return (
    <Room>
      <Board>
        <div style={{ position: 'absolute', inset: 50 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 * u }}>
          <div style={{ width: 150 * u, height: 150 * u, borderRadius: '50%', background: C.orange, border: `${6 * u}px solid ${INK}`, display: 'grid', placeItems: 'center', transform: `scale(${p})` }}>
            <Icon name={scene.icon || 'Star'} size={80 * u} color="white" stroke={2.4} />
          </div>
          <Pop text={scene.text} size={78 * u} width={b.w - 120 * u} delay={0.3} />
        </div>
      </Board>
      <Teacher at={{ x: b.x + b.w * 0.3, y: b.y + b.h * 0.62 }} talking={!!scene.caption} mood="happy" />
      <Title text={scene.title} />
    </Room>
  )
}

function Cta({ scene }) {
  const frame = useCurrentFrame()
  const { board: b, u } = useRoom()
  const p = spring({ frame: frame - 30, fps: 30, config: { damping: 11 } })
  return (
    <Room>
      <Board>
        <div style={{ position: 'absolute', inset: 50 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 50 * u }}>
          <Pop text={scene.text} size={84 * u} width={b.w - 120 * u} delay={0.1} />
          {scene.button && (
            <div style={{ padding: `${20 * u}px ${56 * u}px`, borderRadius: 999, background: C.red, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: 50 * u, border: `${5 * u}px solid ${INK}`, boxShadow: `${6 * u}px ${7 * u}px 0 ${INK}`, transform: `scale(${p * (1 + Math.sin(frame / 8) * 0.02)}) rotate(-2deg)` }}>{clean(scene.button)}</div>
          )}
        </div>
      </Board>
      <Teacher wave talking={!!scene.caption} mood="excited" />
    </Room>
  )
}

export const LESSON = {
  scenes: { hook: Hook, whiteboard: BoardScene, example: Example, remember: Remember, cta: Cta },
  root: { backgroundColor: C.wall },
  light: true, // the logo chip top-left (ExplainerChrome)
  captionTop: (h) => (h < 1200 ? h - 175 : 1480),
}
