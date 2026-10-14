import { useState } from 'react'
import { FiArrowDown, FiArrowUp, FiFilm, FiMic, FiPlay, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import { SCENE_LABELS, STYLE_LABELS } from './MotionBoard'

// The storyboard of a Remotion video made from the person's own story
// (POST /ai/motion/plan) — reviewed and edited here before anything is voiced
// or rendered: each scene's on-screen words and its spoken line, the order,
// scenes removed. "Make the video" sends it back as it is (POST /ai/motion
// with ``script``; the server cleans it like the AI's own).

// The words on screen each scene type shows (its other parts — chart
// numbers, list items, chat messages — are kept as the AI wrote them).
const FIELDS = {
  hook: [['text', 'On screen']],
  problem: [
    ['title', 'On screen'],
    ['text', 'Under it'],
  ],
  chat: [['title', 'Chat title']],
  list: [['title', 'Title']],
  stat: [['label', 'Label']],
  product: [['title', 'Title']],
  cta: [
    ['text', 'On screen'],
    ['button', 'Button'],
  ],
  character: [['title', 'On screen']],
  compare: [['title', 'Title']],
  chart: [['title', 'Title']],
  split: [['title', 'Title']],
  myth: [
    ['myth', 'Myth'],
    ['fact', 'Fact'],
  ],
  verdict: [['text', 'On screen']],
  options: [['question', 'Question']],
  reveal: [['text', 'On screen']],
  quote: [
    ['text', 'Quote'],
    ['author', 'By'],
  ],
  customer: [
    ['name', 'Name'],
    ['business', 'Who'],
    ['text', 'Situation'],
  ],
  beforeafter: [
    ['before', 'Before'],
    ['after', 'After'],
  ],
  result: [['label', 'Label']],
  review: [
    ['text', 'Their words'],
    ['name', 'By'],
  ],
  news: [
    ['headline', 'Headline'],
    ['text', 'Why it matters'],
  ],
  notify: [['title', 'On screen']],
  step: [
    ['title', 'Step'],
    ['text', 'What happens'],
    ['result', 'Result'],
  ],
  offer: [
    ['plan', 'Plan'],
    ['badge', 'Badge'],
  ],
  screen: [
    ['title', 'On screen'],
    ['result', 'Result'],
  ],
  dashboard: [['title', 'Title']],
  chapter: [
    ['title', 'Chapter'],
    ['text', 'Under it'],
  ],
  checklist: [['title', 'Title']],
  recap: [['title', 'Title']],
  flow: [['title', 'Title']],
  apps: [['title', 'Title']],
  roll: [
    ['lead', 'Lead'],
    ['text', 'Under it'],
  ],
  table: [['title', 'View']],
  board: [['title', 'Title']],
  launch: [
    ['name', 'Product'],
    ['text', 'Promise'],
    ['badge', 'Badge'],
  ],
  button: [
    ['title', 'Card'],
    ['button', 'Button'],
    ['result', 'Result'],
  ],
  form: [
    ['title', 'Title'],
    ['toggle', 'Toggle'],
  ],
  stack: [],
}

// What else is in the scene, in one line.
function extras(s) {
  if (s.items?.length) return s.items.map((i) => i.text).join(' · ')
  if (s.messages?.length) return s.messages.map((m) => m.text).join(' / ')
  if (s.options?.length) return s.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('  ')
  if (s.series?.length) return s.series.map((x) => `${x.name}: ${x.values.join(' → ')}`).join(' · ')
  if (s.left && s.right) return `${s.left.name || s.left.label} vs ${s.right.name || s.right.label}`
  if (s.type === 'stat' || s.type === 'result') return `${s.prefix || ''}${s.value}${s.suffix || ''}`
  if (s.chips?.length) return s.chips.join(' · ')
  if (s.type === 'screen') return `Screenshot ${s.shot}${s.target ? ` → ${s.target}` : ''}`
  if (s.checks?.length) return s.checks.join(' ✓ ')
  if (s.points?.length) return s.points.map((p) => p.title).join(' · ')
  if (s.metrics?.length) return s.metrics.map((m) => `${m.label} ${m.prefix || ''}${m.value}${m.suffix || ''}`).join(' · ')
  if (s.nodes?.length) return s.nodes.map((n) => n.label).join(' → ')
  if (s.notes?.length) return s.notes.map((n) => `${n.app}: ${n.text}`).join(' / ')
  if (s.type === 'apps' || s.apps?.length) return (s.apps || []).map((a) => a.name).join(' · ')
  if (s.words?.length) return s.words.join(' / ')
  if (s.type === 'table') return `${(s.columns || []).join(' | ')} · ${(s.rows || []).length} rows`
  if (s.type === 'form') return (s.fields || []).map((f) => `${f.label}: ${f.value}`).join(' · ')
  if (s.type === 'stack') return `Screenshots ${(s.shots || []).join(', ')}${s.words?.length ? ` — ${s.words.join(' / ')}` : ''}`
  if (s.type === 'board') return (s.columns || []).map((c) => c.name).join(' → ')
  if (s.features?.length) return [s.price && `${s.price}${s.period || ''}`, ...s.features].filter(Boolean).join(' · ')
  return ''
}

// Seconds a scene runs — mirrors app/motion.py estimate_seconds.
const KHMER = /[ក-៿]/g
const spokenSeconds = (say = '') => (say.match(KHMER) || []).length / 11 + (say.match(/[A-Za-z0-9]+/g) || []).length / 2.6
const MIN_SECONDS = { chart: 5.2, compare: 4.2, character: 3.8, cta: 3.8, product: 3.6, myth: 5, quote: 5.6, options: 9.8, split: 8, beforeafter: 5.4, result: 4.2, review: 6, customer: 4.4, news: 5, notify: 7, step: 4.8, offer: 5.6, screen: 5, dashboard: 5.2, flow: 6.4, chapter: 3.2, checklist: 5.8, recap: 6, apps: 5, table: 5.1, board: 4.6, roll: 4.8, launch: 4.2, button: 4.6, form: 5.2, stack: 4.9 }

export function estimateSeconds(scenes) {
  const total = scenes.reduce((n, s) => n + Math.max(MIN_SECONDS[s.type] || 3.4, spokenSeconds(s.say) + 1.3), 0)
  return Math.max(0, Math.round(total - 0.47 * (scenes.length - 1)))
}

const fmtLength = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s` : `${sec} s`)

export default function StoryboardEditor({ plan, onChange, onMake, onRewrite, voice = true, onHear }) {
  const [hearing, setHearing] = useState(null) // the line being played
  const hear = async (i, text) => {
    if (!onHear || !text?.trim() || hearing != null) return
    setHearing(i)
    try {
      await onHear(text.trim())
    } finally {
      setHearing(null)
    }
  }
  const scenes = plan?.scenes || []
  const set = (i, patch) => onChange({ ...plan, scenes: scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const move = (i, d) => {
    const next = [...scenes]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange({ ...plan, scenes: next })
  }
  const remove = (i) => onChange({ ...plan, scenes: scenes.filter((_, j) => j !== i) })
  const seconds = estimateSeconds(scenes)
  const style = STYLE_LABELS[plan?.style]

  return (
    <div className="w-full max-w-[720px] rounded-2xl border border-ink-200/70 bg-white animate-fadein">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200/70 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink-900">Storyboard — check it, then make the video</div>
          <div className="mt-0.5 text-[11.5px] text-ink-500">
            {scenes.length} scenes · ≈ {fmtLength(seconds)}
            {voice ? ' with the voice' : ''} · nothing is recorded or rendered until you press Make
          </div>
        </div>
        {style && (
          <span title={plan?.why ? `AI picked ${style}: ${plan.why}` : undefined} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand">
            {plan?.why ? 'AI picked · ' : ''}
            {style}
          </span>
        )}
      </div>

      <ol className="divide-y divide-ink-200/60">
        {scenes.map((s, i) => {
          const more = extras(s)
          return (
            <li key={i} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-lg bg-ink-100 text-[11px] font-bold tabular-nums text-ink-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{SCENE_LABELS[s.type] || s.type}</span>
                  <span className="flex items-center gap-0.5 text-ink-400">
                    <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30">
                      <FiArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={i === scenes.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                    >
                      <FiArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      title="Remove this scene"
                      disabled={scenes.length <= 2}
                      onClick={() => remove(i)}
                      className="rounded-md p-1 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </span>
                </div>
                {(FIELDS[s.type] || []).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <span className="w-16 flex-none text-[11px] text-ink-400">{label}</span>
                    <input
                      value={s[key] || ''}
                      onChange={(e) => set(i, { [key]: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:border-brand"
                    />
                  </label>
                ))}
                {more && <div className="pl-[4.5rem] text-[11.5px] text-ink-500 line-clamp-2">{more}</div>}
                {voice && (
                  <label className="flex items-start gap-2">
                    <span className="mt-1.5 flex w-16 flex-none items-center gap-1 text-[11px] text-ink-400">
                      <FiMic size={11} /> Voice
                    </span>
                    <AutoTextarea
                      value={s.say || ''}
                      minRows={1}
                      maxRows={5}
                      onChange={(e) => set(i, { say: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink-800 outline-none focus:border-brand"
                    />
                    {onHear && (
                      <button
                        type="button"
                        onClick={() => hear(i, s.say)}
                        disabled={hearing != null || !s.say?.trim()}
                        title="Hear this line, as the video will say it"
                        aria-label={`Hear line ${i + 1}`}
                        className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg text-brand hover:bg-brand-soft disabled:opacity-40"
                      >
                        {hearing === i ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                        ) : (
                          <FiPlay size={14} />
                        )}
                      </button>
                    )}
                  </label>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200/70 px-4 py-3">
        <span className="text-[11px] text-ink-400">Words in [brackets] are highlighted on screen.</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRewrite}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            <FiRefreshCw size={13} /> Write it again
          </button>
          <button
            type="button"
            onClick={onMake}
            disabled={scenes.length < 2}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            <FiFilm size={14} /> Make the video
          </button>
        </div>
      </div>
    </div>
  )
}
