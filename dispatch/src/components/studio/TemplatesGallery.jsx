import { useLayoutEffect, useRef, useState } from 'react'
import { FiArrowRight, FiChevronRight, FiFilm, FiSearch, FiX } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { GOALS, STAGES } from '../../lib/goals'
import { GOAL_TEMPLATES, MOTION_TEMPLATES, previewSrc, templateById } from '../../lib/motionTemplates'

// Content studio → Templates: every Remotion video template as a preview card
// with the content goals that use it — filtered by goal; hovering a card plays
// its preview clip (public/templates/<id>.mp4, motion/tools/make_clips.py).
// "Use this template" opens the chat on Remotion with that story picked
// (AIPromptPage reads location.state.motionStory).

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

const FILTERS = [['all', 'All'], ...Object.entries(GOALS).map(([k, g]) => [k, g.label])]

/** All + each goal, with the pill that slides to the pick (the Media Library's tabs). */
function GoalTabs({ value, onPick, counts }) {
  const refs = useRef({})
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const el = refs.current[value]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value])
  return (
    <div className="relative flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Filter by goal">
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full rounded-full bg-brand shadow-[0_4px_12px_-4px_rgb(var(--brand)/0.5)] transition-all duration-300 ease-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {FILTERS.map(([k, label]) => (
        <button
          key={k}
          ref={(el) => (refs.current[k] = el)}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onPick(k)}
          className={`relative flex-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-300 ${
            value === k ? 'text-white' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
          }`}
        >
          {label}
          <span className={`ml-1.5 text-[11px] tabular-nums ${value === k ? 'text-white/75' : 'text-ink-400'}`}>{counts[k]}</span>
        </button>
      ))}
    </div>
  )
}

/** One template: its still, and on hover its clip playing (muted, looped). */
function TemplateCard({ t, onUse }) {
  const video = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [wide, setWide] = useState(false) // the preview is landscape (read from the picture itself)
  const [broken, setBroken] = useState(false)
  const start = () => {
    const v = video.current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => {}) // no clip yet / blocked — the still stays
  }
  const stop = () => {
    video.current?.pause()
    setPlaying(false)
  }
  return (
    <button
      type="button"
      onClick={onUse}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      title={t.note || undefined}
      aria-label={`Use the ${t.name} template`}
      className="group relative block aspect-[9/16] w-full overflow-hidden rounded-2xl bg-night-950 text-left transition-shadow hover:shadow-card-hover"
    >
      {/* a wide preview (Slides) is shown whole, centred over a soft enlarged copy of itself — never cropped */}
      {wide && <img src={previewSrc(t.id)} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />}
      {/* no preview (yet): a film mark, not a broken picture */}
      {broken && (
        <span className="absolute inset-0 grid place-items-center text-white/40">
          <FiFilm size={40} />
        </span>
      )}
      <img
        src={previewSrc(t.id)}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        onLoad={(e) => setWide(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
        style={broken ? { display: 'none' } : undefined}
        className={`absolute inset-0 h-full w-full ${wide ? 'object-contain object-[50%_35%]' : 'object-cover object-top'}`}
      />
      <video
        ref={video}
        src={previewSrc(t.id, 'mp4')}
        muted
        loop
        playsInline
        preload="none"
        onPlaying={() => setPlaying(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${wide ? 'object-contain object-[50%_35%]' : 'object-cover object-top'} ${playing ? 'opacity-100' : 'opacity-0'}`}
      />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-16">
        {/* the goals sit with the name — at the top they covered the preview's own brand pill */}
        <span className="mb-1.5 flex flex-wrap gap-1">
          {t.goals.map((g) => (
            <span key={g} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${STAGES[GOALS[g].stage].chip}`}>
              {GOALS[g].label}
            </span>
          ))}
        </span>
        <span className="block text-[14px] font-semibold text-white">{t.name}</span>
        <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
          <span className="overflow-hidden">
            <span className="mt-0.5 block text-[11.5px] leading-snug text-white/80">{t.look}</span>
            <span className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[11.5px] font-semibold text-night-950">
              Use this template <FiArrowRight size={13} />
            </span>
          </span>
        </span>
      </span>
    </button>
  )
}

export default function TemplatesGallery() {
  const navigate = useNavigate()
  const use = (t) => navigate('/ai?tab=images', { state: { motionStory: t.story } })
  const [goal, setGoal] = useState('all')
  const top = useRef(null)
  // from the goal list at the bottom: filter the gallery and bring it into view
  const showGoal = (gk) => {
    setGoal(gk)
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // search: the name, its look, its steps and its goals — any word typed
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const found = (t) => {
    if (!words.length) return true
    const hay = [t.name, t.look, t.note, ...(t.steps || []), ...t.goals.map((g) => GOALS[g]?.label || g)].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  }
  const pool = MOTION_TEMPLATES.filter(found)
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === 'all' ? pool.length : pool.filter((t) => t.goals.includes(k)).length]))
  const shown = goal === 'all' ? pool : pool.filter((t) => t.goals.includes(goal))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">Video templates · {MOTION_TEMPLATES.length}</h2>
          <p className="mt-0.5 max-w-[80ch] text-[12.5px] text-ink-500">
            Animated videos from your brand, with voice, subtitles and music. Hover to preview, click to start.
          </p>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 focus-within:border-brand sm:w-[300px]">
          <FiSearch size={15} className="flex-none text-ink-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates — launch, quiz, review…"
            aria-label="Search templates"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-ink-400 hover:text-ink-700">
              <FiX size={14} />
            </button>
          )}
        </label>
      </div>

      <div ref={top} className="scroll-mt-40">
        <GoalTabs value={goal} onPick={setGoal} counts={counts} />
      </div>

      {/* Picture-only cards, like the Media Library: the name sits on the
          preview; on hover the clip plays and "Use this template" shows — a
          tap anywhere (phone) uses the template. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((t) => (
          <TemplateCard key={t.id} t={t} onUse={() => use(t)} />
        ))}
      </div>
      {!shown.length && (
        <p className="rounded-2xl border border-dashed border-ink-200 px-5 py-8 text-center text-[13px] text-ink-500">
          No template matches “{query}”{goal !== 'all' ? ' in this goal' : ''}.{' '}
          <button type="button" onClick={() => { setQuery(''); setGoal('all') }} className="font-semibold text-brand hover:underline">
            Show all
          </button>
        </p>
      )}

      <section className={`${card} p-5`}>
        <h2 className="text-[15px] font-semibold text-ink-900">Which templates each goal uses</h2>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-500">
          Each post in the weekly plan has a goal. Its video uses one of that goal’s templates, taking turns so the week
          doesn’t repeat one look. Tap a goal to see its templates.
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {Object.entries(STAGES).map(([key, stage]) => (
            <div key={key}>
              <div className={`border-b-2 pb-1.5 text-[11px] font-bold uppercase tracking-[.08em] ${stage.line} ${stage.text}`}>{stage.label}</div>
              <ul className="mt-2 divide-y divide-ink-100">
                {Object.entries(GOALS)
                  .filter(([, g]) => g.stage === key)
                  .map(([gk, g]) => (
                    <li key={gk}>
                      {/* the goal on its own line, its templates as chips under it */}
                      <button type="button" onClick={() => showGoal(gk)} className="group block w-full py-3 text-left">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink-900">{g.label}</span>
                          <span className="text-[11.5px] text-ink-400">{(GOAL_TEMPLATES[gk] || []).length} templates</span>
                          <FiChevronRight size={14} className="ml-auto flex-none text-ink-300 group-hover:text-brand" aria-hidden="true" />
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {(GOAL_TEMPLATES[gk] || [])
                            .map((id) => templateById(id)?.name)
                            .filter(Boolean)
                            .map((name) => (
                              <span key={name} className="whitespace-nowrap rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-medium text-ink-700">
                                {name}
                              </span>
                            ))}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
