import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiPlus,
  FiRefreshCw,
  FiTarget,
  FiX,
} from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { fullDayLabel } from '../lib/tz'
import { useStore } from '../store'
import Select from '../components/ui/Select'

// Activity plan (backend app/activity.py): the goals the AI picked for the
// brand's week and the team's day-by-day to-do list — a shared checklist.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const CATEGORY = {
  content: { label: 'Content prep', cls: 'bg-brand-soft text-brand' },
  engagement: { label: 'Engagement', cls: 'bg-sky-50 text-sky-700' },
  growth: { label: 'Growth & sales', cls: 'bg-emerald-50 text-emerald-700' },
  review: { label: 'Review', cls: 'bg-amber-50 text-amber-700' },
}

const shift = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const short = (iso) => {
  const { weekday, rest } = fullDayLabel(iso)
  const [d, m = ''] = rest.split(' ')
  return { weekday, date: `${d} ${m.slice(0, 3)}` }
}

export default function ActivityPage() {
  const { brands, activeBrand, switchBrand, showToast } = useStore()
  const brand = brands.find((b) => b.slug === activeBrand) || brands[0]
  const [week, setWeek] = useState(null) // Monday, YYYY-MM-DD; null = this week
  const [data, setData] = useState(null)
  const poll = useRef(null)

  const load = useCallback(async () => {
    if (!brand) return
    try {
      setData(await api.get(`/activity?brand_id=${brand.id}${week ? `&week=${week}` : ''}`))
    } catch (e) {
      showToast(e.message)
    }
  }, [brand?.id, week]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const job = data?.job
  const running = job?.status === 'running'
  useEffect(() => {
    clearInterval(poll.current)
    if (!running || !brand) return
    poll.current = setInterval(async () => {
      try {
        const next = await api.get(`/activity/job?brand_id=${brand.id}`)
        if (next.status === 'running') return
        clearInterval(poll.current)
        if (next.status === 'failed') showToast(next.error || 'Making the plan failed')
        load()
      } catch {
        /* try again next tick */
      }
    }, 3000)
    return () => clearInterval(poll.current)
  }, [running, brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    try {
      const j = await api.post('/activity/generate', { brand_id: brand.id, week: data?.week_start })
      setData((d) => ({ ...d, job: j }))
    } catch (e) {
      showToast(e.message)
    }
  }

  const plan = data?.plan
  const setPlan = (p) => setData((d) => ({ ...d, plan: p }))

  const toggle = async (task) => {
    // Optimistic: tick at once, put it back if the save fails.
    setPlan({ ...plan, tasks: plan.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) })
    try {
      setPlan(await api.patch(`/activity/${plan.id}/tasks/${task.id}`, { done: !task.done }))
    } catch (e) {
      showToast(e.message)
      load()
    }
  }
  const add = async (day, title) => {
    try {
      setPlan(await api.post(`/activity/${plan.id}/tasks`, { day, title }))
    } catch (e) {
      showToast(e.message)
    }
  }
  const remove = async (task) => {
    try {
      setPlan(await api.del(`/activity/${plan.id}/tasks/${task.id}`))
    } catch (e) {
      showToast(e.message)
    }
  }

  if (!brand) return <div className="w-full px-5 lg:px-8 py-7 text-[13px] text-ink-500">Create a brand first.</div>

  const thisWeek = data && data.week_start <= data.today && data.today <= shift(data.week_start, 6)
  const tasks = plan?.tasks || []
  const done = tasks.filter((t) => t.done).length

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">Activity plan</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            This week's goals and what the team does each day to reach them — the AI plans it from your results and posts.
          </p>
        </div>
        {brands.length > 1 && (
          <Select
            align="right"
            value={brand.slug}
            onChange={switchBrand}
            buttonClassName="font-medium"
            options={brands.map((b) => ({ value: b.slug, label: b.name, color: colorForBrand(b.slug) }))}
          />
        )}
      </div>

      {/* week switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous week"
            disabled={!data}
            onClick={() => setWeek(shift(data.week_start, -7))}
            className="btn-ghost px-2 py-1.5"
          >
            <FiChevronLeft size={16} />
          </button>
          <div className="min-w-[170px] text-center text-[13px] font-semibold text-ink-800">
            {data ? (
              <>
                {short(data.week_start).date} – {short(shift(data.week_start, 6)).date}
                {thisWeek && <span className="ml-1.5 font-medium text-brand">· this week</span>}
              </>
            ) : (
              '…'
            )}
          </div>
          <button
            type="button"
            aria-label="Next week"
            disabled={!data}
            onClick={() => setWeek(shift(data.week_start, 7))}
            className="btn-ghost px-2 py-1.5"
          >
            <FiChevronRight size={16} />
          </button>
        </div>
        {plan && (
          <button type="button" onClick={generate} disabled={running} className="btn-outline px-3 py-1.5">
            <FiRefreshCw size={13} className={running ? 'animate-spin' : ''} /> {running ? 'Planning…' : 'Redo plan'}
          </button>
        )}
      </div>

      {data === null ? (
        <div className={`${card} h-48 skeleton`} />
      ) : running && !plan ? (
        <section className={`${card} p-8 text-center`}>
          <FiRefreshCw size={22} className="mx-auto mb-3 animate-spin text-brand" />
          <div className="text-[14px] font-semibold text-ink-900">Planning {brand.name}'s week…</div>
          <p className="mt-1 text-[12.5px] text-ink-500">Reading your results and this week's posts — about a minute.</p>
        </section>
      ) : !plan ? (
        <section className={`${card} mx-auto max-w-2xl p-7 text-center`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <FiClipboard size={24} />
          </div>
          <h2 className="text-[17px] font-bold text-ink-900">No plan for this week yet</h2>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-500">
            The AI picks this week's goals from your results, then gives the team a short to-do list for each day — preparing
            photos and videos, replying to comments, following up customers, and checking what worked. Brands with
            Auto-generate on get one every Monday morning.
          </p>
          <button type="button" onClick={generate} className="btn-primary mt-5 px-4">
            Plan this week
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {/* goals + progress */}
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">
                  <FiTarget size={12} /> This week's focus
                </div>
                <p className="mt-1.5 text-[14.5px] font-semibold leading-snug text-ink-900">{plan.focus}</p>
              </div>
              <div className="w-full max-w-[220px]">
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="font-semibold text-ink-800">
                    {done} of {tasks.length} done
                  </span>
                  <span className="text-ink-500">{tasks.length ? Math.round((100 * done) / tasks.length) : 0}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${tasks.length ? (100 * done) / tasks.length : 0}%` }}
                  />
                </div>
              </div>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {plan.goals.map((g, n) => {
                const mine = tasks.filter((t) => t.goal === n)
                const ok = mine.filter((t) => t.done).length
                return (
                  <li key={n} className="rounded-xl bg-canvas p-3.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
                        {n + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-snug text-ink-900">{g.title}</div>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{g.why}</p>
                        {g.measure && (
                          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">
                            <span className="font-semibold">How we'll know:</span> {g.measure}
                          </p>
                        )}
                        {mine.length > 0 && (
                          <p className="mt-1.5 text-[11px] font-semibold text-brand">
                            {ok} of {mine.length} tasks done
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* the days */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.days.map((day) => (
              <DayCard
                key={day}
                day={day}
                today={day === data.today}
                past={day < data.today}
                tasks={tasks.filter((t) => t.day === day)}
                onToggle={toggle}
                onAdd={(title) => add(day, title)}
                onRemove={remove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DayCard({ day, today, past, tasks, onToggle, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const { weekday, date } = short(day)
  const done = tasks.filter((t) => t.done).length
  const submit = () => {
    if (title.trim()) onAdd(title.trim())
    setTitle('')
    setAdding(false)
  }
  return (
    <section className={`${card} p-4 ${today ? 'ring-2 ring-brand/60' : ''} ${past && !today ? 'opacity-70' : ''}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <span className="text-[14px] font-bold text-ink-900">{weekday}</span>
          <span className="ml-1.5 text-[12px] text-ink-500">{date}</span>
          {today && <span className="ml-2 rounded-md bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand">Today</span>}
        </div>
        {tasks.length > 0 && (
          <span className="text-[11px] font-medium text-ink-500">
            {done}/{tasks.length}
          </span>
        )}
      </div>
      {tasks.length === 0 && !adding && <p className="mb-2 text-[12px] text-ink-400">Nothing planned.</p>}
      <ul className="space-y-2.5">
        {tasks.map((t) => {
          const cat = CATEGORY[t.category] || CATEGORY.content
          return (
            <li key={t.id} className="group flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={t.done}
                aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                onClick={() => onToggle(t)}
                className={`mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-md border-2 transition-colors ${
                  t.done ? 'border-brand bg-brand text-white' : 'border-ink-300 hover:border-brand'
                }`}
              >
                {t.done && <FiCheck size={12} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[12.5px] font-semibold leading-snug ${t.done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                  {t.title}
                </div>
                {t.detail && !t.done && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{t.detail}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${cat.cls}`}>{cat.label}</span>
                  {t.goal != null && <span className="text-[10.5px] font-medium text-ink-400">Goal {t.goal + 1}</span>}
                  {t.done && t.done_by && <span className="text-[10.5px] text-ink-400">✓ {t.done_by}</span>}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove "${t.title}"`}
                onClick={() => onRemove(t)}
                className="mt-0.5 flex-none rounded p-0.5 text-ink-300 opacity-0 transition-opacity hover:text-ink-700 focus:opacity-100 group-hover:opacity-100"
              >
                <FiX size={13} />
              </button>
            </li>
          )
        })}
      </ul>
      {adding ? (
        <div className="mt-3 flex gap-1.5">
          <input
            autoFocus
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="What needs doing?"
            className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none"
          />
          <button type="button" onClick={submit} className="btn-primary flex-none px-2.5 py-1.5 text-[12px]">
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500 hover:text-brand"
        >
          <FiPlus size={12} /> Add task
        </button>
      )}
    </section>
  )
}
