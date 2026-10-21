/**
 * "Dialogue · Two voices" — two people really talking: each has their own
 * voice (app/motion.py dialogue_voices — a man and a woman, or two different
 * voices of the same kind), their mouth moves while they speak, and what they
 * say pops up in a speech bubble over them (a thought cloud for an inner
 * voice). The same two villagers and Cambodian places as Parable · Two paths
 * (parable.jsx) — the camera leans towards whoever is speaking.
 *
 * Scenes: hook · line (one person speaks) · tally · moral · cta — every one
 * has a `speaker` (1 or 2). 9:16 and 16:9.
 */
import { AbsoluteFill, spring, useCurrentFrame } from 'remotion'
import { LINE, PARABLE, Person, Place, Say, colorOf, people, useStage, useTalking, parableCues } from './parable'

const BUBBLE_AT = 6 // the bubble pops (sfx.jsx dialogueCues)

export function dialogueCues(scene) {
  if (scene.type === 'line') return [[BUBBLE_AT, 'blop']]
  return parableCues(scene)
}

/** What they say, in a bubble over them — a cloud when it's a thought. */
function Bubble({ text, x, headTop, think, brand }) {
  const frame = useCurrentFrame()
  const { W, u, wide, fps } = useStage()
  const s = spring({ frame: frame - BUBBLE_AT, fps, config: { damping: 11, mass: 0.6 } })
  if (!text) return null
  const w = Math.min(W - 80 * u, (wide ? 860 : 900) * u)
  // over the speaker, kept inside the frame; tall frames start under the logo chip
  const cx = Math.max(40 * u + w / 2, Math.min(W - 40 * u - w / 2, wide ? x * 0.7 + (W / 2) * 0.3 : x))
  const bottom = headTop - (think ? 90 : 60) * u
  const size = (wide ? 56 : 66) * u
  return (
    <>
      <div style={{ position: 'absolute', left: cx - w / 2, width: w, top: 0, height: bottom, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'relative',
            maxWidth: w,
            padding: `${22 * u}px ${40 * u}px ${26 * u}px`,
            background: 'white',
            border: `${5 * u}px solid ${LINE}`,
            borderRadius: think ? 120 * u : 40 * u,
            boxShadow: `${7 * u}px ${8 * u}px 0 ${LINE}`,
            transform: `scale(${s})`,
            transformOrigin: `${50 + ((x - cx) / w) * 100}% 100%`,
          }}
        >
          <Say text={text} size={size} width={w - 90 * u} color={LINE} accent={brand?.color || '#E0533D'} delay={(BUBBLE_AT + 4) / 30} step={1} />
        </div>
      </div>
      {/* the tail down to the speaker — or a thought's little clouds */}
      {think ? (
        [0, 1].map((i) => (
          <div key={i} style={{ position: 'absolute', left: x + (cx > x ? 1 : -1) * (40 - i * 20) * u - (18 - i * 6) * u, top: bottom + (14 + i * 34) * u, width: (36 - i * 12) * u, height: (36 - i * 12) * u, borderRadius: '50%', background: 'white', border: `${4 * u}px solid ${LINE}`, transform: `scale(${s})` }} />
        ))
      ) : (
        <svg width={W} height={headTop} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: Math.min(1, s * 1.5) }}>
          <path
            d={`M ${x - 34 * u + (cx - x) * 0.25} ${bottom - 8 * u} L ${x + (cx > x ? 10 : -10) * u} ${bottom + 46 * u * s} L ${x + 30 * u + (cx - x) * 0.25} ${bottom - 8 * u}`}
            fill="white"
            stroke={LINE}
            strokeWidth={5 * u}
            strokeLinejoin="round"
          />
          {/* covers the tail's top edge, so it joins the bubble */}
          <rect x={x - 30 * u + (cx - x) * 0.25} y={bottom - 16 * u} width={56 * u} height={10 * u} fill="white" />
        </svg>
      )}
    </>
  )
}

/** One person speaks to the other: the camera leans their way, their bubble pops up. */
function Line({ scene, brand, cast, voiceAt }) {
  const frame = useCurrentFrame()
  const { W, wide, ground, charH, fps } = useStage()
  const duo = people(cast)
  const sp = scene.speaker === 2 ? 1 : 0
  const talking = useTalking(scene, voiceAt)
  const xs = wide ? [W * 0.33, W * 0.67] : [W * 0.27, W * 0.73]
  const h = charH * (wide ? 0.92 : 0.86)
  const k = spring({ frame, fps, config: { damping: 22 } })
  // the camera leans in towards the speaker — zoomed enough that the frame's edge never shows
  const zoom = 1 + 0.08 * k
  const shift = (sp ? -1 : 1) * W * 0.015 * k
  const headTop = ground - h * 1.14 * zoom
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translateX(${shift}px) scale(${zoom})`, transformOrigin: `${xs[sp]}px ${ground}px` }}>
        <Place place={scene.place} time={scene.time} />
        {duo.map((p, i) => {
          const me = i === sp
          return (
            <Person
              key={i}
              x={xs[i]}
              p={p}
              act={me ? { pose: scene.pose, mood: scene.mood } : { pose: scene.listenPose || 'stand', mood: scene.listen || 'happy' }}
              item={me ? scene.item || 'none' : 'none'}
              brand={brand}
              seed={i}
              delay={0}
              name={p.name}
              color={colorOf(p)}
              h={h}
              talking={me && talking}
            />
          )
        })}
      </AbsoluteFill>
      <Bubble text={scene.text} x={xs[sp] + shift} headTop={headTop} think={scene.think} brand={brand} />
    </AbsoluteFill>
  )
}

export const DIALOGUE = {
  ...PARABLE,
  scenes: { ...PARABLE.scenes, line: Line },
}
