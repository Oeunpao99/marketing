import { FiCheck, FiMic, FiMicOff } from 'react-icons/fi'

// The live storyboard of a Remotion video while it's made — what the AI is
// doing right now, scene by scene (app/motion.py _progress, polled with the
// job): the story being written, each scene as it's planned, each voice line
// as it's spoken, then the frames being drawn.

const SCENE_LABELS = {
  hook: 'Hook',
  problem: 'Problem',
  chat: 'Chat',
  list: 'List',
  stat: 'Number',
  product: 'Product',
  cta: 'Call to action',
  character: 'Character',
  compare: 'Two people',
  chart: 'Chart',
  split: 'Old vs new',
  myth: 'Myth vs fact',
  verdict: 'Verdict',
  options: 'Answers',
  reveal: 'The answer',
  quote: 'Quote',
}

const STYLE_LABELS = { tech: 'Sell', explainer: 'Teach', versus: 'Compare', poll: 'Poll', quote: 'Quote' }

/** 0-99 from the real steps: the story is the only part without a count, so
 * it creeps up with time; the voice counts lines, the render counts frames. */
export function motionPercent(progress, elapsed) {
  if (!progress) return null
  const scenes = progress.scenes || []
  const voiced = scenes.filter((s) => s.voice === 'done' || s.voice === 'skip').length
  switch (progress.stage) {
    case 'story':
      return Math.min(24, 4 + elapsed * 0.7)
    case 'polish':
      return 27
    case 'pictures':
      return 31
    case 'voice':
      return 32 + (scenes.length ? (23 * voiced) / scenes.length : 0)
    case 'render':
      return Math.min(99, 55 + 44 * (progress.render || 0))
    default:
      return null
  }
}

export function motionStage(progress) {
  if (!progress) return null
  const scenes = progress.scenes || []
  const speaking = scenes.findIndex((s) => s.voice === 'speaking')
  const style = STYLE_LABELS[progress.style]
  switch (progress.stage) {
    case 'story':
      return `Writing the story${style ? ` · ${style}` : ''}…`
    case 'polish':
      return 'Polishing the Khmer…'
    case 'pictures':
      return 'Picking your brand photos…'
    case 'voice':
      return speaking >= 0 ? `Recording the voice · scene ${speaking + 1} of ${scenes.length}` : 'Recording the voice…'
    case 'render':
      return `Animating the scenes · ${Math.round(100 * (progress.render || 0))}%`
    default:
      return null
  }
}

export default function MotionBoard({ progress }) {
  if (!progress) return null
  const scenes = progress.scenes || []
  const writing = progress.stage === 'story' && !scenes.length
  const rendering = progress.stage === 'render'
  const style = STYLE_LABELS[progress.style]
  return (
    <div className="w-full max-w-[340px] rounded-2xl border border-ink-200/70 bg-white p-3.5 animate-fadein">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink-900">Storyboard</span>
        {style && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">{style}</span>}
      </div>

      {writing ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="h-6 w-6 flex-none animate-pulse rounded-lg bg-ink-100" />
              <span className="h-3 flex-1 animate-pulse rounded bg-ink-100" style={{ maxWidth: `${85 - i * 12}%` }} />
            </div>
          ))}
          <p className="pt-1 text-[11px] text-ink-400">The AI is planning the scenes…</p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {scenes.map((s, i) => {
            const speaking = s.voice === 'speaking'
            const done = rendering || s.voice === 'done'
            return (
              <li
                key={i}
                className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors animate-fadein ${speaking ? 'bg-brand-soft/70' : ''}`}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <span
                  className={`grid h-6 w-6 flex-none place-items-center rounded-lg text-[11px] font-bold tabular-nums ${
                    done ? 'bg-brand text-white' : speaking ? 'bg-brand/20 text-brand' : 'bg-ink-100 text-ink-500'
                  }`}
                >
                  {done ? <FiCheck size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{SCENE_LABELS[s.type] || s.type}</span>
                  <span className="block truncate text-[12px] text-ink-800" title={s.text}>
                    {s.text || '—'}
                  </span>
                </span>
                <span className="flex-none pt-3 text-ink-400">
                  {speaking ? (
                    <FiMic size={12} className="animate-pulse text-brand" />
                  ) : s.voice === 'done' ? (
                    <span className="text-[10.5px] tabular-nums">{s.seconds}s</span>
                  ) : s.voice === 'skip' ? (
                    <FiMicOff size={12} />
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
