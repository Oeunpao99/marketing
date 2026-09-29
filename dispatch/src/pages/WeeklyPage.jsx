import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowDownRight, FiArrowUpRight, FiAward, FiCalendar, FiCheck, FiRefreshCw, FiTrendingUp, FiUsers, FiX, FiZap } from 'react-icons/fi'
import { api } from '../api/client'
import { GOAL_LABELS, PILLAR_LABELS, SELLING_PILLARS, angleText, pillarChipClass } from '../lib/angles'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import { PLAT } from '../data/brands'
import AutoTextarea from '../components/ui/AutoTextarea'
import Select from '../components/ui/Select'

// The weekly habit (backend app/weekly.py): how the last 7 days went, what the
// AI learned, and next week's posts — trimmed here and approved in one tap.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

const dayLabel = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')

export default function WeeklyPage() {
  const { brands, activeBrand, switchBrand, refreshReview, showToast } = useStore()
  const brand = brands.find((b) => b.slug === activeBrand) || brands[0]
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const poll = useRef(null)

  const load = useCallback(async () => {
    if (!brand) return
    try {
      setData(await api.get(`/weekly?brand_id=${brand.id}`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  // Poll a running job (writing the plan / making images) until it ends.
  const job = data?.job
  useEffect(() => {
    clearInterval(poll.current)
    if (job?.status !== 'running' || !brand) return
    poll.current = setInterval(async () => {
      try {
        const next = await api.get(`/weekly/job?brand_id=${brand.id}`)
        if (next.status === 'running') {
          setData((d) => (d ? { ...d, job: next } : d))
          return
        }
        clearInterval(poll.current)
        if (next.status === 'failed') showToast(next.error || 'Something went wrong')
        else if (next.kind === 'media') showToast(next.step || 'Posts scheduled')
        else showToast("Next week's plan is ready")
        refreshReview?.()
        load()
      } catch {
        /* transient — try again next tick */
      }
    }, 1500)
    return () => clearInterval(poll.current)
  }, [job?.status, brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const planNow = async () => {
    setBusy('plan')
    try {
      const j = await api.post(`/weekly/plan?brand_id=${brand.id}`)
      setData((d) => ({ ...d, job: j }))
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const approve = async () => {
    setBusy('approve')
    try {
      const out = await api.post(`/weekly/${data.plan.id}/approve`)
      showToast(
        out.making_media
          ? `Approved — making images and scheduling ${out.drafts} posts in the background`
          : `Approved — ${out.drafts} ideas added to your Calendar`,
      )
      refreshReview?.()
      await load()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const dismiss = async () => {
    setBusy('dismiss')
    try {
      await api.post(`/weekly/${data.plan.id}/dismiss`)
      await load()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const setItems = (fn) => setData((d) => ({ ...d, plan: { ...d.plan, items: fn(d.plan.items) } }))

  const removeItem = async (key) => {
    const before = data.plan.items
    setItems((items) => items.filter((i) => i.key !== key))
    try {
      await api.del(`/weekly/${data.plan.id}/items/${key}`)
    } catch (e) {
      setItems(() => before)
      showToast(`Could not remove — ${e.message}`)
    }
  }

  const saveCaption = async (key, caption) => {
    setItems((items) => items.map((i) => (i.key === key ? { ...i, caption } : i)))
    try {
      await api.patch(`/weekly/${data.plan.id}/items/${key}`, { caption })
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      load()
    }
  }

  if (!brand) {
    return (
      <div className="w-full px-5 lg:px-8 py-7">
        <p className="text-[13px] text-ink-500">Create a brand first.</p>
      </div>
    )
  }

  const plan = data?.plan
  const ready = plan?.status === 'ready'
  const report = ready ? plan.report : data?.report
  const running = job?.status === 'running'

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">AI Content Advisor</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            What worked last week, what to change, and next week’s plan — generate it all in one tap.
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

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700">{error}</p>}

      {running && <JobBar job={job} />}

      {data === null && !error ? (
        <div className={`${card} p-6 space-y-3`}>
          <div className="h-4 w-1/3 rounded skeleton" />
          <div className="h-16 rounded skeleton" />
        </div>
      ) : (
        data && (
          <div className="space-y-4">
            {report && <Report report={report} brand={brand} advisor={ready ? plan.report?.advisor : null} />}

            {ready ? (
              <PlanCard
                plan={plan}
                autoMedia={data.auto_media}
                busy={busy}
                running={running}
                onApprove={approve}
                onDismiss={dismiss}
                onReplan={planNow}
                onRemove={removeItem}
                onSaveCaption={saveCaption}
              />
            ) : (
              <NoPlan
                plan={plan}
                data={data}
                busy={busy === 'plan' || running}
                onPlan={planNow}
              />
            )}
          </div>
        )
      )}
    </div>
  )
}

function JobBar({ job }) {
  return (
    <div className={`${card} mb-5 px-5 py-4`}>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="text-brand font-medium truncate">{job.step || 'Working…'}</span>
        <span className="tabular-nums font-semibold text-ink-700">{job.progress || 0}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-brand-soft overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${job.progress || 0}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">Runs in the background — you can leave this page.</p>
    </div>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────
const ACCENT = '#2a78d6'
const pctChange = (now, before) => (now != null && before > 0 ? Math.round(((now - before) / before) * 100) : null)

/** ↑ 24% / ↓ 12% vs the week before — arrow + colour, never colour alone. */
function Change({ now, before, big = false }) {
  const c = pctChange(now, before)
  if (c == null || c === 0) return null
  const up = c > 0
  const Icon = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-semibold tabular-nums ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      } ${big ? 'px-2.5 py-1 text-[13px]' : 'px-1.5 py-px text-[11px]'}`}
    >
      <Icon size={big ? 14 : 11} aria-hidden="true" />
      {Math.abs(c)}%
    </span>
  )
}

/** The page reads as three numbered steps: what happened → what the AI
 *  recommends → your plan. */
function StepTitle({ n, title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ink-900 text-[12.5px] font-bold text-ink-50">{n}</span>
        <div>
          <h2 className="text-[16px] font-bold leading-tight tracking-tight text-ink-900">{title}</h2>
          {sub && <p className="text-[12px] text-ink-500">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Step 1 + 2 ────────────────────────────────────────────────────────────
function Report({ report, brand, advisor }) {
  return (
    <>
      <StepTitle n={1} title="What happened" sub={`${dayLabel(report.from)} – ${dayLabel(report.to)}, compared with the week before`} />
      <Hero report={report} brand={brand} />
      <StepTitle n={2} title="What the AI recommends" sub="Worked out from your own posts — click “Why?” to see the numbers" />
      <Advice report={report} advisor={advisor} />
    </>
  )
}

/** One card: the headline number, two supporting numbers, the best post —
 *  and the day-by-day chart beside them. */
function Hero({ report, brand }) {
  const t = report.this_week || {}
  const l = report.last_week || {}
  return (
    <section className={`${card} grid gap-6 p-6 lg:grid-cols-[300px_minmax(0,1fr)]`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-500">
          <span className="h-2 w-2 rounded-full" style={{ background: colorForBrand(brand.slug) }} />
          Engagement this week
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[48px] font-bold leading-none tracking-tight tabular-nums text-ink-900">{t.engagement ?? 0}</span>
          <Change now={t.engagement} before={l.engagement} big />
        </div>
        <p className="mt-2 text-[12.5px] text-ink-500">
          likes + comments + shares · week before: <b className="font-semibold text-ink-700">{l.engagement ?? 0}</b>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11.5px] text-ink-500">Posts</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[20px] font-bold tabular-nums text-ink-900">{t.posts ?? 0}</span>
              <Change now={t.posts} before={l.posts} />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-ink-500">Views</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[20px] font-bold tabular-nums text-ink-900">{t.views ?? '—'}</span>
              <Change now={t.views} before={l.views} />
            </div>
          </div>
        </div>

        {t.top && (
          <Link to={`/insights/${t.top.target_id}`} className="mt-5 flex items-center gap-2.5 rounded-xl bg-amber-50/70 px-3 py-2.5 hover:bg-amber-50">
            <FiAward size={15} className="flex-none text-amber-700" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-[.05em] text-amber-800">Best post</span>
              <span className={`block truncate text-[12.5px] font-medium text-ink-900 ${khmer(t.top.title)}`}>{t.top.title || 'Untitled'}</span>
            </span>
            <span className="flex-none text-right text-[11px] text-ink-500">
              <b className="block text-[14px] text-ink-900">{t.top.engagement}</b>
              {PLAT[t.top.platform]?.name || t.top.platform}
            </span>
          </Link>
        )}
        {t.posts > 0 && t.measured < t.posts && (
          <p className="mt-3 text-[11px] text-ink-400">
            Numbers from {t.measured} of {t.posts} posts so far — open Analytics to refresh the rest.
          </p>
        )}
      </div>

      {report.daily?.length > 0 ? (
        <DailyEngagement daily={report.daily} />
      ) : (
        <div className="grid place-items-center rounded-xl bg-ink-50 text-[12px] text-ink-400">The day-by-day chart appears after the next plan.</div>
      )}
    </section>
  )
}

/** Engagement per day for two weeks: the week before in a lighter step of
 *  the same hue, this week solid — hover a day for its posts and engagement. */
function DailyEngagement({ daily }) {
  const [hover, setHover] = useState(null)
  const H = 190
  const max = Math.max(1, ...daily.map((d) => d.engagement))
  const half = Math.floor(daily.length / 2)
  const peak = daily.reduce((a, d) => (d.engagement > a.engagement ? d : a), daily[0])
  const total = (from, to) => daily.slice(from, to).reduce((s, d) => s + d.engagement, 0)
  return (
    <figure className="flex min-w-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-[13px] font-semibold text-ink-800">Engagement per day</figcaption>
        <div className="flex items-center gap-4 text-[11.5px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT, opacity: 0.3 }} /> Week before <b className="text-ink-700">{total(0, half)}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT }} /> This week <b className="text-ink-700">{total(half)}</b>
          </span>
        </div>
      </div>
      <div className="relative mt-auto">
        {[0.5, 1].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-ink-100" style={{ top: H - g * (H - 20) }} />
        ))}
        <div className="absolute inset-x-0 border-t border-ink-300" style={{ top: H }} />
        {/* where "this week" starts */}
        <div className="absolute bottom-0 border-l border-dashed border-ink-300" style={{ left: `${(half / daily.length) * 100}%`, top: 0, height: H }} />
        <div className="relative flex items-end gap-1.5 sm:gap-2" style={{ height: H }}>
          {daily.map((d, i) => (
            <div
              key={d.date}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={(e) => setHover({ d, x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2 })}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="w-full max-w-[30px] rounded-t-[5px] transition-opacity"
                style={{
                  height: d.engagement ? Math.max(4, (d.engagement / max) * (H - 20)) : 2,
                  background: d.engagement ? ACCENT : 'rgb(var(--ink-200))',
                  opacity: hover && hover.d !== d ? 0.5 : i < half && d.engagement ? 0.3 : 1,
                }}
              />
              {d === peak && d.engagement > 0 && (
                <span className="absolute text-[11px] font-bold tabular-nums text-ink-800" style={{ bottom: (d.engagement / max) * (H - 20) + 4 }}>
                  {d.engagement}
                </span>
              )}
            </div>
          ))}
        </div>
        {hover && (
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-lg bg-night-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg"
            style={{ left: hover.x }}
          >
            <div className="font-semibold">{dayLabel(hover.d.date)}</div>
            <div>
              {hover.d.engagement} engagement · {hover.d.posts} post{hover.d.posts === 1 ? '' : 's'}
            </div>
          </div>
        )}
        <div className="mt-2 flex gap-1.5 sm:gap-2">
          {daily.map((d, i) => (
            <span key={d.date} className={`flex-1 text-center text-[10.5px] leading-4 ${i === daily.length - 1 ? 'font-bold text-ink-900' : 'text-ink-400'}`}>
              {new Date(`${d.date}T00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}
              <span className="block">{Number(d.date.slice(8))}</span>
            </span>
          ))}
        </div>
      </div>
    </figure>
  )
}

/** What worked / what to improve / your audience in one card — one sentence
 *  each, the numbers behind a "Why?" — and next week's recommendation. */
function Advice({ report, advisor }) {
  const t = report.this_week || {}
  const rules = report.rules || []
  const weak = report.weak_rules || []
  const topics = Object.values(report.pillar_stats || {}).sort((a, b) => b.avg - a.avg)
  const maxAvg = Math.max(0.1, ...topics.map((s) => s.avg))
  const cols = [
    {
      key: 'worked',
      icon: FiTrendingUp,
      tone: 'bg-emerald-50 text-emerald-700',
      title: 'What worked',
      text:
        advisor?.worked ||
        (rules[0]
          ? `${rules[0].text}.`
          : t.top
            ? `Your best post was “${t.top.title}” with ${t.top.engagement} engagement.`
            : 'Not enough results yet — patterns show up after a week or two of posting.'),
      why: rules,
    },
    {
      key: 'improve',
      icon: FiAlertTriangle,
      tone: 'bg-amber-50 text-amber-700',
      title: 'What to improve',
      text: advisor?.improve || (weak[0] ? `${weak[0].text}.` : 'Nothing is clearly lagging yet — keep the mix varied.'),
      why: weak,
    },
    {
      key: 'audience',
      icon: FiUsers,
      tone: 'bg-brand-soft text-brand',
      title: 'Your audience likes',
      text:
        advisor?.audience ||
        (topics[0] ? `${topics[0].label} posts — ${topics[0].avg} engagement each.` : 'We’ll learn this as your posts collect likes and comments.'),
      why: [],
    },
  ]
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="grid divide-y divide-ink-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        {cols.map((c) => (
          <div key={c.key} className="p-5">
            <div className="flex items-center gap-2.5">
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${c.tone}`}>
                <c.icon size={16} aria-hidden="true" />
              </span>
              <h3 className="text-[14px] font-semibold text-ink-900">{c.title}</h3>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">{c.text}</p>
            {c.key === 'audience' && topics.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {topics.slice(0, 3).map((s) => (
                  <li key={s.label} className="text-[11.5px]">
                    <div className="flex justify-between gap-2 text-ink-600">
                      <span>{s.label}</span>
                      <b className="font-semibold tabular-nums text-ink-800">{s.avg}</b>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(s.avg / maxAvg) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {c.why.length > 0 && (
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-[12px] font-semibold text-brand hover:underline">
                  Why? <span className="group-open:hidden">▸</span>
                  <span className="hidden group-open:inline">▾</span>
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {c.why.slice(0, 4).map((r) => (
                    <li key={r.id} className="text-[11.5px] leading-snug text-ink-500">
                      <span className="text-ink-700">{r.text}</span> — {r.evidence}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      {advisor?.recommendation && (
        <div className="flex flex-col gap-3 border-t border-brand/15 bg-brand-soft px-5 py-4 sm:flex-row sm:items-center">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand text-white">
            <FiZap size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[.06em] text-brand">Next week, focus on</div>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink-900">{advisor.recommendation}</p>
          </div>
          {advisor.focus?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {advisor.focus.map((f) => (
                <span key={f} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${pillarChipClass(f)}`}>
                  {PILLAR_LABELS[f]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Step 3: the plan ──────────────────────────────────────────────────────
// [[pillar, count], …] in PILLAR_LABELS order, and how many of them sell.
function pillarMix(items) {
  const counts = {}
  for (const i of items) if (PILLAR_LABELS[i.pillar]) counts[i.pillar] = (counts[i.pillar] || 0) + 1
  return {
    pillars: Object.keys(PILLAR_LABELS)
      .filter((p) => counts[p])
      .map((p) => [p, counts[p]]),
    selling: items.filter((i) => SELLING_PILLARS.includes(i.pillar)).length,
  }
}

function PlanCard({ plan, autoMedia, busy, running, onApprove, onDismiss, onReplan, onRemove, onSaveCaption }) {
  const byDay = {}
  for (const item of plan.items) (byDay[item.day] ||= []).push(item)
  const n = plan.items.length
  const flagged = plan.items.filter((i) => i.fact_issues?.length).length
  const mix = pillarMix(plan.items)
  const value = n - mix.selling

  return (
    <>
      <StepTitle n={3} title="Your plan for next week" sub={`${dayLabel(plan.starts_on)} – ${dayLabel(plan.ends_on)} · ${n} post${n === 1 ? '' : 's'}`}>
        <div className="flex items-center gap-1">
          <button type="button" disabled={!!busy || running} onClick={onReplan} className="btn-ghost px-3 py-1.5" title="Write a fresh plan">
            <FiRefreshCw size={13} /> Rewrite
          </button>
          <button type="button" disabled={!!busy || running} onClick={onDismiss} className="btn-ghost px-3 py-1.5">
            Skip this week
          </button>
        </div>
      </StepTitle>

      <section className={`${card} overflow-hidden`}>
        {/* the mix, as one bar: value vs selling */}
        {n > 0 && (
          <div className="border-b border-ink-100 px-5 py-4">
            {mix.pillars.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-semibold text-ink-800">
                    {value} give value <span className="font-normal text-ink-400">·</span> {mix.selling} sell
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {mix.pillars.map(([p, count]) => (
                      <span key={p} className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${pillarChipClass(p)}`}>
                        {PILLAR_LABELS[p]}
                        {count > 1 ? ` ×${count}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2.5 flex h-2 gap-[2px] overflow-hidden rounded-full">
                  <div className="bg-brand" style={{ width: `${(value / n) * 100}%` }} />
                  {mix.selling > 0 && <div className="bg-amber-400" style={{ width: `${(mix.selling / n) * 100}%` }} />}
                </div>
              </>
            ) : (
              <p className="text-[12px] text-ink-500">
                This plan was written before topics existed — press <b>Rewrite</b> for a plan with a topic and goal on every post.
              </p>
            )}
          </div>
        )}

        {/* the week board: one column per day */}
        {n > 0 ? (
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
            {Object.entries(byDay).map(([day, items]) => (
              <div key={day} className="flex min-w-0 flex-col gap-2">
                <div className="flex items-baseline gap-1.5 border-b border-ink-100 pb-1.5">
                  <span className="text-[13px] font-bold text-ink-900">
                    {new Date(`${day}T00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <span className="text-[11.5px] text-ink-400">
                    {new Date(`${day}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {items.map((i) => (
                  <div
                    key={i.key}
                    className="rounded-xl bg-ink-50/70 p-2.5"
                    title={i.insight || i.title}
                  >
                    <div className={`line-clamp-3 text-[12px] font-medium leading-snug text-ink-900 ${khmer(i.title)}`}>{i.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px]">
                      {PILLAR_LABELS[i.pillar] && <span className="font-semibold text-ink-600">{PILLAR_LABELS[i.pillar]}</span>}
                      {i.meme && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-px font-semibold text-amber-800" title="Goes out as a meme poster">
                          😄 Meme
                        </span>
                      )}
                      {GOAL_LABELS[i.goal] && <span className="text-ink-400">· {GOAL_LABELS[i.goal]}</span>}
                      {i.fact_issues?.length > 0 && <span className="font-semibold text-amber-700">· check</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-[12.5px] text-ink-500">You removed every idea — rewrite the plan or skip this week.</p>
        )}

        {/* the one action */}
        <div className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-ink-500">
            {autoMedia
              ? 'Makes an image for every post and schedules each one on its day, at your best time.'
              : 'Puts every idea on your Calendar on its day. Turn on “Generate media” in Auto-generate to have images made and posts scheduled too.'}
            {flagged > 0 && <span className="ml-1 font-semibold text-amber-700">{flagged} caption{flagged === 1 ? '' : 's'} to check first.</span>}
          </p>
          <button type="button" disabled={!!busy || running || n === 0} onClick={onApprove} className="btn-primary flex-none px-5 py-2 text-[13px]">
            {autoMedia ? <FiZap size={15} /> : <FiCheck size={15} />}
            {busy === 'approve' ? 'Working…' : autoMedia ? `Generate all content (${n})` : `Approve plan (${n})`}
          </button>
        </div>

        <details className="group border-t border-ink-100 px-5 py-3" open={flagged > 0}>
          <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-brand hover:underline">
            <span className="group-open:hidden">Review and edit the captions ▸</span>
            <span className="hidden group-open:inline">Hide the captions ▾</span>
          </summary>
          <div className="mt-3 space-y-5 pb-2">
            {Object.entries(byDay).map(([day, items]) => (
              <div key={day}>
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink-700">
                  <FiCalendar size={13} className="text-ink-400" /> {dayLabel(day)}
                </div>
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <PlanItem key={item.key} item={item} onRemove={() => onRemove(item.key)} onSave={(c) => onSaveCaption(item.key, c)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </section>
    </>
  )
}

function PlanItem({ item, onRemove, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.caption)
  useEffect(() => setText(item.caption), [item.caption])

  return (
    <div className="rounded-xl border border-ink-100 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-[13px] text-ink-900 ${khmer(item.title)}`}>{item.title}</span>
            {PILLAR_LABELS[item.pillar] && (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${pillarChipClass(item.pillar)}`}
                title="What this post is about — most posts give value, only some sell"
              >
                {PILLAR_LABELS[item.pillar]}
              </span>
            )}
            {typeof item.fit_score === 'number' && (
              <span
                className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-bold text-ink-600"
                title="AI's own self-check: how specific and well-grounded this idea is for your brand"
              >
                {item.fit_score}% fit
              </span>
            )}
            {angleText(item.angle, item.goal) && (
              <span
                className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-semibold text-ink-600"
                title="The marketing angle and goal the AI wrote this caption for"
              >
                {angleText(item.angle, item.goal)}
              </span>
            )}
          </div>
          {item.insight && <p className="mt-1 text-[11.5px] text-ink-500 italic leading-relaxed">{item.insight}</p>}
          {item.meme && (
            <div className="mt-2 rounded-lg border border-ink-100 bg-white px-3 py-2">
              <div className="text-[10.5px] font-bold uppercase tracking-[.05em] text-amber-700">😄 Meme poster</div>
              <p className={`mt-0.5 whitespace-pre-line text-[13px] font-bold leading-snug text-ink-900 ${khmer(item.meme.top)}`}>{item.meme.top}</p>
              <p className="mt-1 text-[11.5px] text-ink-500">Photo: {item.meme.scene}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove from the plan"
          className="w-7 h-7 flex-none grid place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
        >
          <FiX size={14} />
        </button>
      </div>

      {editing ? (
        <AutoTextarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false)
            if (text.trim() && text !== item.caption) onSave(text)
          }}
          className={`mt-2 w-full bg-white border border-brand rounded-xl px-3 py-2 text-[12.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/15 ${khmer(text)}`}
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          title="Click to edit"
          className={`mt-2 cursor-text rounded-lg px-1 -mx-1 text-[12.5px] text-ink-800 whitespace-pre-line leading-relaxed hover:bg-ink-50 ${khmer(item.caption)}`}
        >
          {item.caption}
        </p>
      )}

      {Array.isArray(item.fact_issues) && item.fact_issues.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-amber-800">Check before approving — not found in your product info:</div>
          <ul className="mt-1 space-y-0.5">
            {item.fact_issues.map((issue, i) => (
              <li key={i} className="text-[11.5px] text-amber-900 leading-snug">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const DRAFT_STATUS = {
  scheduled: { label: 'Scheduled', cls: 'bg-emerald-50 text-emerald-700' },
  approved: { label: 'On calendar', cls: 'bg-brand-soft text-brand' },
  waiting: { label: 'Needs review', cls: 'bg-amber-50 text-amber-700' },
  rejected: { label: 'Removed', cls: 'bg-ink-100 text-ink-500' },
}

function NoPlan({ plan, data, busy, onPlan }) {
  const approved = plan?.status === 'approved'
  return (
    <>
    <StepTitle n={3} title="Your plan for next week" />
    <section className={`${card} p-5`}>
      {approved ? (
        <>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 grid place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <FiCheck size={13} />
            </span>
            <h2 className="text-[14.5px] font-bold text-ink-900">
              Plan approved · {dayLabel(plan.starts_on)} – {dayLabel(plan.ends_on)}
            </h2>
          </div>
          <ul className="mt-3 divide-y divide-ink-100">
            {plan.drafts.map((d) => {
              const s = DRAFT_STATUS[d.status] || { label: d.status, cls: 'bg-ink-100 text-ink-600' }
              return (
                <li key={d.id} className="py-2 flex items-center gap-3 text-[12.5px]">
                  <span className="w-[88px] flex-none text-ink-500">{dayLabel(d.day)}</span>
                  <span className={`min-w-0 flex-1 truncate text-ink-800 ${khmer(d.title)}`}>{d.title}</span>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.cls}`}>{s.label}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Link to="/calendar" className="btn-outline">
              Open Calendar
            </Link>
            {data.free_days > 0 && (
              <button type="button" disabled={busy} onClick={onPlan} className="btn-primary">
                Plan the next {data.free_days} day{data.free_days === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl grid place-items-center bg-brand-soft text-brand">
            <FiCalendar size={20} />
          </div>
          <h2 className="text-[14.5px] font-bold text-ink-900">No plan waiting</h2>
          <p className="mt-1.5 text-[12px] text-ink-500 max-w-[52ch] mx-auto leading-relaxed">
            {data.auto_enabled
              ? 'A new plan is written every Sunday at 6 PM, and you’ll get a notification. Want one now?'
              : 'Turn on this brand in Auto-generate to get a plan every Sunday at 6 PM — or write one now.'}
          </p>
          <button type="button" disabled={busy || data.free_days === 0} onClick={onPlan} className="btn-primary mt-4">
            {busy ? 'Working…' : 'Plan the next 7 days'}
          </button>
        </div>
      )}
    </section>
    </>
  )
}
