import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowDownRight, FiArrowUpRight, FiCalendar, FiCheck, FiRefreshCw, FiTrendingUp, FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import { PLAT } from '../data/brands'
import AutoTextarea from '../components/ui/AutoTextarea'

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
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Weekly plan</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            How last week went, and next week’s posts written from what works — approve in one tap.
          </p>
        </div>
        {brands.length > 1 && (
          <select
            value={brand.slug}
            onChange={(e) => switchBrand(e.target.value)}
            className="bg-white border border-ink-200 rounded-xl px-3 py-2 text-[12.5px] font-medium focus:outline-none focus:border-brand"
          >
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
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
          <div className="space-y-5">
            {report && <Report report={report} brand={brand} />}

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

function Stat({ label, now, before }) {
  const change = now != null && before > 0 ? Math.round(((now - before) / before) * 100) : null
  return (
    <div className="rounded-xl bg-ink-50/70 px-4 py-3">
      <div className="text-[11px] font-semibold text-ink-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] font-bold text-ink-900 tabular-nums">{now ?? '—'}</span>
        {change !== null && change !== 0 && (
          <span
            className={`inline-flex items-center text-[11.5px] font-semibold ${
              change > 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {change > 0 ? <FiArrowUpRight size={13} /> : <FiArrowDownRight size={13} />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="text-[11px] text-ink-400">week before: {before ?? '—'}</div>
    </div>
  )
}

function Report({ report, brand }) {
  const t = report.this_week || {}
  const l = report.last_week || {}
  const rules = report.rules || []
  const color = colorForBrand(brand.slug)
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center gap-2">
        <span className="w-[3px] h-[18px] rounded-full" style={{ background: color }} />
        <h2 className="text-[14.5px] font-bold text-ink-900">Last 7 days</h2>
        <span className="text-[11.5px] text-ink-400">
          {dayLabel(report.from)} – {dayLabel(report.to)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Posts published" now={t.posts} before={l.posts} />
        <Stat label="Engagement" now={t.engagement} before={l.engagement} />
        {(t.views != null || l.views != null) && <Stat label="Views" now={t.views} before={l.views} />}
      </div>
      {t.posts > 0 && t.measured < t.posts && (
        <p className="mt-2 text-[11px] text-ink-400">
          Numbers from {t.measured} of {t.posts} posts — the rest haven’t been measured yet (open Analytics to refresh).
        </p>
      )}

      {t.top && (
        <Link
          to={`/insights/${t.top.target_id}`}
          className="mt-4 flex items-center gap-3 rounded-xl border border-ink-100 px-4 py-3 hover:bg-ink-50"
        >
          <span className="text-[11px] font-semibold text-ink-500 flex-none">Best post</span>
          <span className={`min-w-0 flex-1 truncate text-[12.5px] text-ink-800 ${khmer(t.top.title)}`}>
            {t.top.title || 'Untitled'}
          </span>
          <span className="flex-none text-[11.5px] text-ink-500">
            {PLAT[t.top.platform]?.name || t.top.platform} · <b className="text-ink-800">{t.top.engagement}</b> engagement
          </span>
        </Link>
      )}

      <div className="mt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">What’s working</h3>
        {rules.length ? (
          <ul className="mt-2 space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[12px]">
                <FiTrendingUp size={13} className="mt-0.5 flex-none text-emerald-700" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink-900">{r.text}</span>
                  <span className="block text-[11px] text-ink-500">{r.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] text-ink-500">
            Not enough results to find patterns yet
            {report.learned_from ? ` (${report.learned_from} post${report.learned_from === 1 ? '' : 's'} with numbers)` : ''}.
            The plan gets sharper as posts collect likes and comments.
          </p>
        )}
      </div>
    </section>
  )
}

function PlanCard({ plan, autoMedia, busy, running, onApprove, onDismiss, onReplan, onRemove, onSaveCaption }) {
  const byDay = {}
  for (const item of plan.items) (byDay[item.day] ||= []).push(item)
  const n = plan.items.length
  const flagged = plan.items.filter((i) => i.fact_issues?.length).length

  return (
    <section className={`${card} overflow-hidden`}>
      <header className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[14.5px] font-bold text-ink-900">Next week’s plan</h2>
          <div className="text-[11.5px] text-ink-500">
            {dayLabel(plan.starts_on)} – {dayLabel(plan.ends_on)} · {n} post{n === 1 ? '' : 's'}
            {flagged > 0 && <span className="text-amber-700"> · {flagged} to check</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!!busy || running} onClick={onReplan} className="btn-ghost px-3 py-1.5" title="Write a fresh plan">
            <FiRefreshCw size={13} /> Rewrite
          </button>
          <button type="button" disabled={!!busy || running} onClick={onDismiss} className="btn-ghost px-3 py-1.5">
            Skip this week
          </button>
          <button type="button" disabled={!!busy || running || n === 0} onClick={onApprove} className="btn-primary px-4 py-1.5">
            <FiCheck size={14} />
            {busy === 'approve' ? 'Approving…' : autoMedia ? `Approve & schedule ${n}` : `Approve ${n}`}
          </button>
        </div>
      </header>
      <p className="px-5 pt-3 text-[11.5px] text-ink-500">
        {autoMedia
          ? 'Approving makes an image for each post and schedules it on its day, on your connected channels.'
          : 'Approving puts each idea on your Calendar on its day. Turn on “Generate media” in Auto-generate to have images made and posts scheduled automatically.'}{' '}
        Remove anything you don’t want first.
      </p>

      <div className="p-5 space-y-5">
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
        {n === 0 && <p className="text-[12.5px] text-ink-500">You removed every idea — rewrite the plan or skip this week.</p>}
      </div>
    </section>
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
            {typeof item.fit_score === 'number' && (
              <span
                className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-bold text-ink-600"
                title="AI's own self-check: how grounded this idea is in real product facts"
              >
                {item.fit_score}% fit
              </span>
            )}
          </div>
          {item.insight && <p className="mt-1 text-[11.5px] text-ink-500 italic leading-relaxed">{item.insight}</p>}
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
  )
}
