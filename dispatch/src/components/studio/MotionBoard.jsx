import { useState } from 'react'
import { FiCheck, FiChevronDown, FiMic, FiMicOff, FiMonitor } from 'react-icons/fi'

// The live storyboard of a Remotion video while it's made — what the AI is
// doing right now, scene by scene (app/motion.py _progress, polled with the
// job): the story being written, each scene as it's planned, each voice line
// as it's spoken, then the frames being drawn.

export const SCENE_LABELS = {
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
  customer: 'Customer',
  beforeafter: 'Before → after',
  result: 'Result',
  review: 'Review',
  news: 'News',
  notify: 'Notifications',
  step: 'Step',
  offer: 'Offer',
  screen: 'Screenshot',
  dashboard: 'Dashboard',
  flow: 'Flow',
  chapter: 'Chapter',
  checklist: 'Checklist',
  recap: 'Recap',
}

export const STYLE_LABELS = { tech: 'Sell', explainer: 'Teach', versus: 'Compare', poll: 'Poll', quote: 'Quote', testimonial: 'Testimonial', trend: 'AI News', pov: 'POV', demo: 'Product demo', offer: 'Offer', custom: 'Designed for you', training: 'Training' }

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

/** A small moving sound wave beside the mic while a line is recorded. */
function VoiceWave() {
  return (
    <span className="cf-wave inline-flex h-3.5 items-center gap-[2px]" role="img" aria-label="Recording now">
      {[0, 0.2, 0.4, 0.1, 0.3].map((delay, i) => (
        <span key={i} className="h-full w-[2.5px] rounded-full bg-brand" style={{ animationDelay: `${delay}s` }} />
      ))}
    </span>
  )
}

// ── "Making your video": one card for a Remotion video being made ──────────
const STEPS = [
  { key: 'story', label: 'Story' },
  { key: 'voice', label: 'Voice' },
  { key: 'render', label: 'Animate' },
  { key: 'done', label: 'Done' },
]
const stepOf = (stage) => (stage === 'voice' ? 1 : stage === 'render' ? 2 : 0)
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const BACKGROUNDS = { grid: 'grid', glow: 'soft glow', dots: 'dots', clean: 'clean' }

/** The look the AI picked for a "Designed for you" video: its three colours
 * as swatches, light / dark and the background (app/motion.py clean_look). */
function LookChip({ look }) {
  const label = [look.kicker, look.mode === 'light' ? 'Light' : 'Dark', BACKGROUNDS[look.background]].filter(Boolean).join(' · ')
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600" title="The look the AI picked for this video">
      <span className="flex -space-x-1" aria-hidden="true">
        {[look.bg, look.a, look.b].map((c, i) => (
          <span key={i} className="h-3 w-3 rounded-full ring-1 ring-ink-200" style={{ background: c }} />
        ))}
      </span>
      {label}
    </span>
  )
}

/** What a step shows when it's clicked: Story = every scene's words on
 * screen and its voice line; Voice = the lines being recorded. */
const STEP_HINT = {
  story: 'The story the AI wrote — what each scene shows and says',
  voice: 'The voice lines, as they are recorded',
  render: 'The scenes are being drawn — the story and voice are final',
}

/** Progress, the four steps and the storyboard rows, top to bottom, in one
 * full-width card (replaces the smoke canvas + side storyboard for Remotion).
 * A step that has started can be clicked to see its work; a row opens alone. */
export function MotionMaking({ progress, pct, stage, elapsed, onStop }) {
  const scenes = progress?.scenes || []
  const step = stepOf(progress?.stage)
  const rendering = progress?.stage === 'render'
  const style = STYLE_LABELS[progress?.style]
  const [view, setView] = useState(null) // 'story' | 'voice' | 'render' | null
  const [opened, setOpened] = useState(() => new Set())
  const toggleRow = (i) =>
    setOpened((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  return (
    <section className="w-full max-w-[760px] rounded-2xl border border-ink-200/70 bg-white animate-fadein">
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-ink-900">Making your video</span>
              {style && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">{style}</span>}
              {scenes.length > 0 && <span className="text-[11.5px] text-ink-400">{scenes.length} scenes</span>}
              {progress?.look && <LookChip look={progress.look} />}
            </div>
            {progress?.why && <div className="mt-0.5 text-[11.5px] text-ink-400">AI picked {style}: {progress.why}</div>}
            {progress?.voice_note && (
              <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11.5px] font-medium text-amber-800">⚠ {progress.voice_note}</div>
            )}
            <div className="mt-0.5 truncate text-[12px] text-ink-500">{stage}</div>
          </div>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <span className="h-2.5 w-2.5 rounded-[3px] bg-current" aria-hidden="true" /> Stop
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand/15">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <span className="flex-none text-[11px] tabular-nums text-ink-500">
            <b className="font-semibold text-ink-700">{Math.round(pct)}%</b> · {clock(elapsed)}
          </span>
        </div>
        {/* the four steps */}
        <ol className="mt-3 flex items-center gap-1.5 text-[11.5px]">
          {STEPS.map((s, i) => {
            const done = i < step
            const now = i === step
            const canOpen = (done || now) && s.key !== 'done' && scenes.length > 0
            const picked = view === s.key
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                {i > 0 && <span className={`h-px w-5 sm:w-8 ${done || now ? 'bg-brand/50' : 'bg-ink-200'}`} aria-hidden="true" />}
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => setView(picked ? null : s.key)}
                  aria-pressed={picked}
                  title={canOpen ? (picked ? 'Back to the scene list' : STEP_HINT[s.key]) : undefined}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-shadow disabled:cursor-default ${
                    done ? 'bg-brand text-white' : now ? 'bg-brand-soft text-brand' : 'text-ink-400'
                  } ${picked ? 'ring-2 ring-brand/40 ring-offset-1' : canOpen ? 'hover:ring-2 hover:ring-brand/25' : ''}`}
                >
                  {done ? <FiCheck size={11} strokeWidth={3} /> : now ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> : null}
                  {s.label}
                </button>
              </li>
            )
          })}
        </ol>
        {view && <p className="mt-2 text-[11.5px] text-ink-500">{STEP_HINT[view]} · click the step again to close</p>}
      </header>

      <div className="border-t border-ink-100">
        {scenes.length === 0 ? (
          <div className="space-y-2.5 px-4 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="h-5 w-5 flex-none animate-pulse rounded-md bg-ink-100" />
                <span className="h-3 w-20 flex-none animate-pulse rounded bg-ink-100" />
                <span className="h-3 flex-1 animate-pulse rounded bg-ink-100" style={{ maxWidth: `${70 - i * 12}%` }} />
              </div>
            ))}
            <p className="text-[11.5px] text-ink-400">The AI is planning the scenes…</p>
          </div>
        ) : (
          <ol className="divide-y divide-ink-100">
            {scenes.map((s, i) => {
              const speaking = s.voice === 'speaking'
              const done = rendering || s.voice === 'done'
              // what's opened under the row: the step's view, or this row alone
              const showScreen = (view === 'story' || (opened.has(i) && view !== 'voice')) && (s.screen || s.text)
              const showSay = (view === 'story' || view === 'voice' || opened.has(i)) && s.say
              return (
                <li key={i} className={`transition-colors ${speaking ? 'bg-brand-soft/60' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleRow(i)}
                  aria-expanded={!!(showScreen || showSay)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-ink-50/70"
                >
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-md text-[10.5px] font-bold tabular-nums ${
                      done ? 'bg-brand text-white' : speaking ? 'bg-brand/20 text-brand' : 'bg-ink-100 text-ink-500'
                    }`}
                  >
                    {done ? <FiCheck size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="w-[92px] flex-none truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                    {SCENE_LABELS[s.type] || s.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-800" title={s.text}>
                    {s.text || '—'}
                  </span>
                  <span className="flex flex-none items-center gap-1 text-[10.5px] text-ink-400">
                    {speaking ? (
                      <>
                        <FiMic size={12} className="text-brand" /> <VoiceWave />
                      </>
                    ) : s.voice === 'done' ? (
                      <span className="tabular-nums">{s.seconds}s</span>
                    ) : s.voice === 'skip' ? (
                      <FiMicOff size={12} />
                    ) : null}
                    {(s.screen || s.say) && (
                      <FiChevronDown size={13} className={`ml-0.5 transition-transform ${showScreen || showSay ? 'rotate-180' : ''}`} aria-hidden="true" />
                    )}
                  </span>
                </button>
                {(showScreen || showSay) && (
                  <div className="space-y-1.5 pb-2.5 pl-[52px] pr-4 sm:pl-[148px]">
                    {showScreen && (
                      <p className="flex gap-2 text-[12px] leading-relaxed text-ink-700">
                        <FiMonitor size={13} className="mt-[3px] flex-none text-ink-400" aria-label="On screen" />
                        <span>{s.screen || s.text}</span>
                      </p>
                    )}
                    {showSay && (
                      <p className="flex gap-2 text-[12px] leading-relaxed text-ink-500">
                        <FiMic size={13} className={`mt-[3px] flex-none ${speaking ? 'text-brand' : 'text-ink-400'}`} aria-label="Says" />
                        <span className="italic">“{s.say}”</span>
                      </p>
                    )}
                  </div>
                )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
