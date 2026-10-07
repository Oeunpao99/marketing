import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowDownRight, FiArrowUpRight, FiCalendar, FiCheck, FiRefreshCw, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi'
import { api } from '../api/client'
import { PILLAR_LABELS, pillarChipClass } from '../lib/angles'
import { goalOfItem, ruleAction } from '../lib/goals'
import { colorForBrand } from '../lib/brandColor'
import { useSmoothProgress } from '../lib/autoRuns'
import { useStore } from '../store'
import { PLAT } from '../data/brands'
import Select from '../components/ui/Select'
import BestTime from '../components/weekly/BestTime'
import ContentGoals from '../components/weekly/ContentGoals'
import PlanBoard, { formatOf } from '../components/weekly/PlanBoard'

// The plan habit (backend app/weekly.py): how the last 7 days went, what the
// AI learned, and the coming posts — next week's, or tomorrow's for a brand
// set to plan daily — trimmed here and approved in one tap.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

const dayLabel = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
// "Tue 6 Oct", or "Tue 6 Oct – Mon 12 Oct" for more than one day.
const dayRange = (a, b) => (a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`)
// What the brand's plan covers, as the page says it (Automation.plan_every).
const spanOf = (planEvery) => (planEvery === 'day' ? 'tomorrow' : 'next week')
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')

export default function WeeklyPage() {
  const { brands, activeBrand, switchBrand, refreshReview, showToast } = useStore()
  const brand = brands.find((b) => b.slug === activeBrand) || brands[0]
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmRewrite, setConfirmRewrite] = useState(null)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [filter, setFilter] = useState('') // content goal the posts are filtered to
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
        if (next.status === 'done' && next.kind === 'plan') {
          // let the planning screen show 100% for a moment before the plan
          setData((d) => (d ? { ...d, job: { ...next, status: 'running', progress: 100 } } : d))
          await new Promise((r) => setTimeout(r, 900))
        }
        if (next.status === 'failed') showToast(next.error || 'Something went wrong')
        else if (next.kind === 'media') showToast(next.step || 'Posts scheduled')
        else showToast('Your plan is ready')
        refreshReview?.()
        load()
      } catch {
        /* transient — try again next tick */
      }
    }, 1500)
    return () => clearInterval(poll.current)
  }, [job?.status, brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rewrite replaces the waiting plan — ask first if the user has changed it.
  const askRewrite = () => {
    const edited = data.plan.items.filter((i) => i.edited).length
    const removed = (data.plan.report?.removed || 0) + data.plan.items.filter((i) => i.state === 'skipped').length
    if (edited || removed) setConfirmRewrite({ edited, removed })
    else planNow()
  }

  // An approved post whose image failed: make one (views.make_draft_media),
  // which schedules it on its day once the image is ready.
  const makeImage = async (draftId) => {
    try {
      await api.post(`/views/drafts/${draftId}/media`, { kind: 'image' })
      setData((d) => ({
        ...d,
        plan: {
          ...d.plan,
          drafts: d.plan.drafts.map((x) => (x.id === draftId ? { ...x, media_pending: true } : x)),
          items: d.plan.items.map((i) => (i.draft?.id === draftId ? { ...i, draft: { ...i.draft, media_pending: true } } : i)),
        },
      }))
      showToast('Making the image — about 30 seconds. It’s scheduled as soon as it’s ready.')
    } catch (e) {
      showToast(`Couldn’t start — ${e.message}`)
    }
  }

  // While an image is being made, refresh until it's done.
  const mediaPending = data?.plan?.drafts?.some((d) => d.media_pending) || data?.plan?.items?.some((i) => i.draft?.media_pending)
  useEffect(() => {
    if (!mediaPending) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [mediaPending, load])

  const planNow = async () => {
    setConfirmRewrite(null)
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

  // An approved plan: cancel its posts from tomorrow on and write a new plan.
  const regenerate = async () => {
    setConfirmRegen(false)
    setBusy('plan')
    try {
      const out = await api.post(`/weekly/${data.plan.id}/regenerate`)
      if (out.kept) showToast(`${out.kept} post${out.kept === 1 ? ' is' : 's are'} already going out — kept`)
      setData((d) => ({ ...d, job: out.job }))
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  // opts: {} = every waiting post · {unflagged_only: true} · {keys: [key]} = one post
  const approve = async (opts = {}) => {
    setBusy('approve')
    try {
      const out = await api.post(`/weekly/${data.plan.id}/approve`, opts)
      const n = out.drafts
      showToast(
        out.not_scheduled?.length
          ? `Approved, but not scheduled: ${out.not_scheduled[0]}`
          : out.making_media
            ? `Approved — making images and scheduling ${n} post${n === 1 ? '' : 's'}`
            : `Approved — ${n} post${n === 1 ? '' : 's'} scheduled`,
      )
      refreshReview?.()
      await load()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  // Image, text only or video — video writes the storyboard (one AI call).
  const setFormat = async (key, format) => {
    setBusy(`format:${key}`)
    try {
      const item = await api.post(`/weekly/${data.plan.id}/items/${key}/format`, { format })
      setItems((items) => items.map((i) => (i.key === key ? item : i)))
      if (format === 'video') showToast('Storyboard written — check it, then approve it to make the video')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const saveMix = async (mix) => {
    setBusy('mix')
    try {
      const out = await api.put(`/weekly/mix?brand_id=${brand.id}`, { mix })
      setData((d) => ({ ...d, mix: out.mix, mix_custom: out.mix_custom }))
      showToast(mix ? 'Mix saved — the next plan follows it' : 'Back to the AI’s own mix')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  // Plan the whole week (Sunday evening) or just tomorrow (every evening).
  const savePlanEvery = async (plan_every) => {
    if (!data.automation_id || plan_every === data.plan_every) return
    const before = data.plan_every
    setData((d) => ({ ...d, plan_every }))
    try {
      await api.patch(`/automations/${data.automation_id}`, { plan_every })
      showToast(plan_every === 'day' ? 'The AI now plans tomorrow, every evening' : 'The AI now plans the week ahead, every Sunday')
      load() // free days follow the new span
    } catch (e) {
      setData((d) => ({ ...d, plan_every: before }))
      showToast(`Could not save — ${e.message}`)
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

  // Skip / bring back one post — the plan closes once every post is decided.
  const decide = async (key, action) => {
    const before = data.plan.items
    setItems((items) => items.map((i) => (i.key === key ? { ...i, state: action === 'skip' ? 'skipped' : undefined } : i)))
    try {
      await api.post(`/weekly/${data.plan.id}/items/${key}/${action}`)
      if (action === 'skip') await load() // the plan may have just closed
    } catch (e) {
      setItems(() => before)
      showToast(e.message)
    }
  }

  const saveCaption = async (key, caption) => {
    setItems((items) => items.map((i) => (i.key === key ? { ...i, caption, edited: true } : i)))
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
  const planning = running && job.kind === 'plan'
  const makingMedia = running && job.kind === 'media'
  const waiting = ready ? plan.items.filter((i) => !i.state) : []
  // Videos are approved one by one, once finished — "approve all" leaves them.
  const cleanCount = waiting.filter((i) => !i.fact_issues?.length && formatOf(i) !== 'video').length
  const counts = {}
  for (const i of ready ? plan.items : []) if (i.state !== 'skipped') counts[goalOfItem(i)] = (counts[goalOfItem(i)] || 0) + 1

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Plan &amp; best time</h1>
          <p className="mt-1 text-[13px] text-ink-600">AI content plan built from how your audience reacts, with the best time per channel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {ready && (
            <>
              <button type="button" disabled={!!busy || running} onClick={askRewrite} className="btn-outline px-4 py-2">
                <FiRefreshCw size={14} /> Regenerate from latest results
              </button>
              <button
                type="button"
                disabled={!!busy || running || cleanCount === 0}
                onClick={() => approve({ unflagged_only: true })}
                className="btn-primary px-4 py-2"
              >
                {busy === 'approve' ? 'Working…' : `Approve & schedule all unflagged (${cleanCount})`}
              </button>
            </>
          )}
          {data?.automation_id && (
            <div className="flex items-center gap-2" title="How far ahead the AI plans">
              <span className="text-[12px] font-medium text-ink-500">Plan</span>
              <div className="grid grid-cols-2 rounded-xl border border-ink-200 bg-white p-0.5">
                {[
                  { v: 'week', l: 'Weekly' },
                  { v: 'day', l: 'Daily' },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    disabled={running}
                    aria-pressed={data.plan_every === o.v}
                    onClick={() => savePlanEvery(o.v)}
                    className={`rounded-[10px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      data.plan_every === o.v ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          )}
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
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700">{error}</p>}

      {running && !planning && <JobBar job={job} />}

      {confirmRewrite && (
        <RewriteDialog {...confirmRewrite} onCancel={() => setConfirmRewrite(null)} onConfirm={planNow} />
      )}
      {confirmRegen && (
        <ConfirmBox
          title="Regenerate this plan?"
          text="The AI writes new posts for every day from tomorrow on. The posts already scheduled for those days are cancelled, and their images stay in your Media Library. Posts that already went out stay as they are. You’ll review the new plan before anything is scheduled."
          confirm="Regenerate"
          onCancel={() => setConfirmRegen(false)}
          onConfirm={regenerate}
        />
      )}

      {data === null && !error ? (
        <div className={`${card} p-6 space-y-3`}>
          <div className="h-4 w-1/3 rounded skeleton" />
          <div className="h-16 rounded skeleton" />
        </div>
      ) : (
        data && (
          <div className="space-y-5">
            <ContentGoals
              mix={data.mix}
              custom={data.mix_custom}
              perMonth={data.per_month}
              counts={counts}
              span={ready ? (plan.starts_on === plan.ends_on ? 'in this plan' : 'next week') : spanOf(data.plan_every)}
              filter={filter}
              onFilter={setFilter}
              onSave={saveMix}
              saving={busy === 'mix'}
            />

            {planning ? (
              <WeeklyPlanning brand={brand.name} job={job} span={spanOf(data.plan_every)} />
            ) : ready ? (
              <>
                <PlanBoard
                  plan={plan}
                  brandName={brand.name}
                  report={report}
                  mix={data.mix}
                  makingMedia={makingMedia}
                  filter={filter}
                  busy={busy || (running ? 'job' : '')}
                  onApprove={approve}
                  onSkip={(key) => decide(key, 'skip')}
                  onUnskip={(key) => decide(key, 'unskip')}
                  onSaveCaption={saveCaption}
                  onMakeImage={makeImage}
                  onFormat={setFormat}
                />
                <div className="flex justify-end">
                  <button type="button" disabled={!!busy || running} onClick={dismiss} className="btn-ghost px-3 py-1.5 text-ink-500">
                    Skip this plan
                  </button>
                </div>
              </>
            ) : (
              <NoPlan
                plan={plan}
                data={data}
                busy={busy === 'plan' || running}
                onPlan={planNow}
                onRegenerate={() => setConfirmRegen(true)}
                onMakeImage={makeImage}
              />
            )}

            <BestTime data={data.best_time} />

            {report && (
              <details className="group" open={!ready}>
                <summary className="cursor-pointer list-none text-[13px] font-semibold text-brand hover:underline">
                  <span className="group-open:hidden">Show last week’s results and what the AI learned ▸</span>
                  <span className="hidden group-open:inline">Hide last week’s results ▾</span>
                </summary>
                <div className="mt-3 space-y-4">
                  <Report report={report} advisor={ready ? plan.report?.advisor : null} />
                </div>
              </details>
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
        {n != null && (
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ink-900 text-[12.5px] font-bold text-ink-50">{n}</span>
        )}
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
function Report({ report, advisor }) {
  return (
    <>
      <StepTitle title="How last week went" sub={`${dayLabel(report.from)} – ${dayLabel(report.to)}, compared with the 7 days before`} />
      <Summary report={report} />
      <Hero report={report} />
      <StepTitle
        title="What the AI learned"
        sub={`Lessons from your own posts (last 90 days${report.learned_from ? `, ${report.learned_from} posts with results` : ''}) — the AI already uses them`}
      />
      <Lessons report={report} advisor={advisor} />
    </>
  )
}

/** The week in plain sentences, worked out from the numbers below it. */
function takeaways(report) {
  const t = report.this_week || {}
  const l = report.last_week || {}
  const daily = report.daily || []
  const eng = t.engagement ?? 0
  const before = l.engagement ?? 0
  const out = []

  if (t.posts > 0 && !t.measured) {
    out.push({ tone: 'flat', text: `Results for this week’s ${t.posts} post${t.posts === 1 ? '' : 's'} aren’t in yet — check back in a day.` })
  } else if (eng === 0 && before === 0) {
    out.push({ tone: 'flat', text: 'No likes, comments or shares in the last two weeks yet. Keep posting — the AI learns as reactions come in.' })
  } else if (eng > before) {
    out.push({ tone: 'up', text: `People reacted more: ${eng} likes, comments and shares this week, up from ${before} the week before.` })
  } else if (eng < before) {
    out.push({ tone: 'down', text: `People reacted less: ${eng} likes, comments and shares this week, down from ${before} the week before.` })
  } else {
    out.push({ tone: 'flat', text: `Same as the week before: ${eng} likes, comments and shares.` })
  }

  if (t.measured > 0) {
    const per = eng / t.measured
    const each = per < 10 ? per.toFixed(1) : Math.round(per)
    out.push(
      per < 1 && t.posts >= 7
        ? { tone: 'down', text: `Each post got only ${each} reactions on average — most posts get almost none. Making each post stronger will help more than posting more.` }
        : { tone: 'flat', text: `Each post got ${each} reactions on average.` },
    )
  }

  const week = daily.slice(Math.floor(daily.length / 2))
  const peak = week.reduce((a, d) => (d.engagement > (a?.engagement ?? 0) ? d : a), null)
  if (peak) {
    out.push({
      tone: 'up',
      text: `Best day: ${dayLabel(peak.date)} — ${peak.engagement} reactions from ${peak.posts} post${peak.posts === 1 ? '' : 's'}.`,
    })
  }
  if (t.top) {
    out.push({
      tone: 'up',
      text: `Best post: “${t.top.title || 'Untitled'}” on ${PLAT[t.top.platform]?.name || t.top.platform} — ${t.top.engagement} reactions.`,
      link: `/insights/${t.top.target_id}`,
    })
  }
  return out
}

const TONE = {
  up: { icon: FiArrowUpRight, cls: 'bg-emerald-50 text-emerald-700' },
  down: { icon: FiArrowDownRight, cls: 'bg-amber-50 text-amber-700' },
  flat: { icon: FiCheck, cls: 'bg-ink-100 text-ink-600' },
}

function Summary({ report }) {
  const t = report.this_week || {}
  return (
    <section className={`${card} p-5`}>
      <div className="text-[11px] font-bold uppercase tracking-[.06em] text-ink-500">In short</div>
      <ul className="mt-3 space-y-2.5">
        {takeaways(report).map((k) => {
          const tone = TONE[k.tone]
          const body = <span className={`text-[13.5px] leading-snug text-ink-800 ${khmer(k.text)}`}>{k.text}</span>
          return (
            <li key={k.text} className="flex items-start gap-2.5">
              <span className={`mt-px grid h-5 w-5 flex-none place-items-center rounded-full ${tone.cls}`}>
                <tone.icon size={12} aria-hidden="true" />
              </span>
              {k.link ? (
                <Link to={k.link} className="hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
      {t.posts > 0 && t.measured < t.posts && (
        <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] text-ink-500">
          Results are in for {t.measured} of your {t.posts} posts so far — the rest are still being collected (open
          Analytics to refresh them now).
        </p>
      )}
    </section>
  )
}

/** Four numbers, each with what it means — and the day-by-day chart. */
function Hero({ report }) {
  const t = report.this_week || {}
  const l = report.last_week || {}
  const per = (p) => (p.measured > 0 ? Math.round(((p.engagement ?? 0) / p.measured) * 10) / 10 : null)
  const tiles = [
    // no results collected yet → "—", not a misleading 0
    { label: 'Reactions', now: t.measured > 0 || !t.posts ? (t.engagement ?? 0) : null, before: l.engagement, hint: 'Likes + comments + shares on your posts' },
    { label: 'Reactions per post', now: per(t), before: per(l), hint: 'The best sign of post quality' },
    { label: 'Views', now: t.views ?? null, before: l.views, hint: 'Times your posts were seen' },
    { label: 'Posts published', now: t.posts ?? 0, before: l.posts, hint: 'Across all your channels' },
  ]
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className={`${card} p-4`}>
            <div className="text-[12px] font-medium text-ink-500">{x.label}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-ink-900">{x.now ?? '—'}</span>
              {x.now != null && <Change now={x.now} before={x.before} />}
            </div>
            <div className="mt-1.5 text-[11.5px] leading-snug text-ink-400">
              {x.now == null && t.posts > 0 ? 'Results not collected yet' : x.hint}
              {x.before != null && <> · week before: {x.before}</>}
            </div>
          </div>
        ))}
      </section>

      {report.daily?.length > 0 && (
        <section className={`${card} p-6`}>
          <DailyEngagement daily={report.daily} />
          <p className="mt-3 text-[11.5px] text-ink-400">
            Each bar is the reactions on posts published that day. Left of the dashed line is the week before; right is
            this week. Hover a bar for details.
          </p>
        </section>
      )}
    </>
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

// learning.py writes each lesson's numbers into its evidence line — "0.8 vs
// 0.7 per post (13 vs 40 posts)" — read them back so the card can draw them.
const EVIDENCE = /^([\d.]+) vs ([\d.]+) (comments )?per post(?: \((\d+) vs (\d+) posts\))?/
function readRule(r) {
  const m = EVIDENCE.exec(r.evidence || '')
  const times = /(\d+(?:\.\d+)?)×/.exec(r.text || '')
  return {
    a: m ? Number(m[1]) : null,
    b: m ? Number(m[2]) : null,
    unit: m?.[3] ? 'comments' : 'reactions',
    na: m?.[4] ? Number(m[4]) : null,
    nb: m?.[5] ? Number(m[5]) : null,
    times: times ? `${times[1]}×` : null,
  }
}

/** How much to trust a lesson — by the smaller side's post count. */
function sureness(na, nb) {
  if (na == null || nb == null) return null
  const n = Math.min(na, nb)
  if (n < 5) return { label: 'Early hint', cls: 'bg-amber-50 text-amber-800', tip: `Only ${n} posts on one side — could change as more results come in.` }
  if (n < 15) return { label: 'Likely', cls: 'bg-brand-soft text-brand', tip: `Based on ${na} vs ${nb} posts.` }
  return { label: 'Strong', cls: 'bg-emerald-50 text-emerald-700', tip: `Based on ${na} vs ${nb} posts.` }
}

const fmt1 = (n) => (Number.isInteger(n) ? n : n.toFixed(1))

function LessonCard({ rule, weak }) {
  const v = readRule(rule)
  const sure = sureness(v.na, v.nb)
  const max = Math.max(v.a ?? 0, v.b ?? 0, 0.1)
  const bars = v.a != null && [
    { label: 'These posts', value: v.a, n: v.na, strong: true },
    { label: 'Your other posts', value: v.b, n: v.nb, strong: false },
  ]
  return (
    <div className={`${card} flex flex-col p-5`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-11 min-w-[44px] flex-none place-items-center rounded-xl px-2 text-[15px] font-bold tabular-nums ${
            weak ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {v.times || (weak ? <FiAlertTriangle size={17} aria-hidden="true" /> : <FiTrendingUp size={17} aria-hidden="true" />)}
        </span>
        <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-ink-900">{rule.text}.</p>
        {sure && (
          <span title={sure.tip} className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${sure.cls}`}>
            {sure.label}
          </span>
        )}
      </div>

      {bars ? (
        <div className="mt-4 space-y-2">
          {bars.map((b) => (
            <div key={b.label} className="text-[11.5px]">
              <div className="flex justify-between gap-2 text-ink-500">
                <span>
                  {b.label}
                  {b.n != null && <span className="text-ink-400"> · {b.n} posts</span>}
                </span>
                <span className="tabular-nums">
                  <b className="font-semibold text-ink-800">{fmt1(b.value)}</b> {v.unit} / post
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-ink-100">
                <div
                  className={`h-full rounded-full ${b.strong === !weak ? 'bg-brand' : 'bg-ink-300'}`}
                  style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] text-ink-500">{rule.evidence}</p>
      )}

      <p className="mt-auto flex items-start gap-1.5 pt-4 text-[12px] text-ink-600">
        <FiCheck size={13} className="mt-0.5 flex-none text-brand" aria-hidden="true" />
        <span>
          <b className="font-semibold text-ink-800">Applied automatically:</b> {ruleAction(rule)}
        </span>
      </p>
    </div>
  )
}

/** Step 2: each lesson the AI measured from this brand's posts, as a card
 *  with its numbers, how sure it is and what the AI now does about it. */
function Lessons({ report, advisor }) {
  const rules = report.rules || []
  const weak = report.weak_rules || []
  const topics = Object.values(report.pillar_stats || {})
    .filter((s) => s.posts > 0)
    .sort((a, b) => b.avg - a.avg)
  const showTopics = topics.length > 1 && topics.some((s) => s.avg > 0)
  const maxAvg = Math.max(0.1, ...topics.map((s) => s.avg))

  return (
    <div className="space-y-4">
      {advisor?.recommendation && (
        <section className="flex flex-col gap-3 rounded-2xl border border-brand/15 bg-brand-soft px-5 py-4 sm:flex-row sm:items-center">
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
        </section>
      )}

      {rules.length + weak.length === 0 ? (
        <section className={`${card} p-5 text-[13px] leading-relaxed text-ink-600`}>
          <b className="text-ink-900">No clear lessons yet.</b> The AI compares your posts against each other (for
          example videos vs images, mornings vs evenings). It only shows a lesson when there are enough posts on both
          sides and one clearly does better. Keep posting and this fills in.
        </section>
      ) : (
        <>
          {rules.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800">
                <FiTrendingUp size={14} className="text-emerald-600" aria-hidden="true" /> Doing well — do more of this
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rules.map((r) => (
                  <LessonCard key={r.id} rule={r} />
                ))}
              </div>
            </div>
          )}
          {weak.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800">
                <FiAlertTriangle size={14} className="text-amber-600" aria-hidden="true" /> Not working — do less of this
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {weak.map((r) => (
                  <LessonCard key={r.id} rule={r} weak />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showTopics && (
        <section className={`${card} p-5`}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
              <FiUsers size={16} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[14px] font-semibold text-ink-900">Which topics your audience reacts to</h3>
              <p className="text-[11.5px] text-ink-500">Average likes + comments + shares per post, last 90 days</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {topics.map((s) => (
              <li key={s.label} className="text-[12px]">
                <div className="flex justify-between gap-2 text-ink-600">
                  <span>
                    {s.label} <span className="text-ink-400">· {s.posts} posts</span>
                  </span>
                  <b className="font-semibold tabular-nums text-ink-800">{s.avg}</b>
                </div>
                <div className="mt-1 h-2 rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(1, (s.avg / maxAvg) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const DRAFT_STATUS = {
  scheduled: { label: 'Scheduled', cls: 'bg-emerald-50 text-emerald-700' },
  approved: { label: 'Not scheduled yet', cls: 'bg-amber-50 text-amber-700' },
  waiting: { label: 'Needs review', cls: 'bg-amber-50 text-amber-700' },
  rejected: { label: 'Removed', cls: 'bg-ink-100 text-ink-500' },
}

function NoPlan({ plan, data, busy, onPlan, onRegenerate, onMakeImage }) {
  const approved = plan?.status === 'approved'
  const daily = data.plan_every === 'day'
  return (
    <>
    <StepTitle title={daily ? 'Tomorrow’s plan' : 'Next week’s plan'} />
    <section className={`${card} p-5`}>
      {approved ? (
        <>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 grid place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <FiCheck size={13} />
            </span>
            <h2 className="text-[14.5px] font-bold text-ink-900">
              Plan approved · {dayRange(plan.starts_on, plan.ends_on)}
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-ink-500">
            These posts are on your Calendar. <b className="font-medium text-ink-700">Scheduled</b> = will post by itself ·{' '}
            <b className="font-medium text-ink-700">Not scheduled yet</b> = no image yet, so it won’t post until you make one ·{' '}
            <b className="font-medium text-ink-700">Needs review</b> = check it before it goes out.
          </p>
          <ul className="mt-3 divide-y divide-ink-100">
            {plan.drafts.map((d) => {
              const s = DRAFT_STATUS[d.status] || { label: d.status, cls: 'bg-ink-100 text-ink-600' }
              return (
                <li key={d.id} className="py-2 flex items-center gap-3 text-[12.5px]">
                  <span className="w-[88px] flex-none text-ink-500">{dayLabel(d.day)}</span>
                  <span className={`min-w-0 flex-1 truncate text-ink-800 ${khmer(d.title)}`}>{d.title}</span>
                  {d.status === 'approved' && d.day >= new Date().toLocaleDateString('en-CA') && (
                    d.media_pending ? (
                      <span className="flex-none inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand">
                        <FiRefreshCw size={12} className="animate-spin" aria-hidden="true" /> Making image…
                      </span>
                    ) : d.has_media ? (
                      <Link to="/calendar" className="flex-none text-[11.5px] font-semibold text-amber-700 hover:underline" title="It has an image but couldn’t be scheduled — open it in Calendar">
                        Couldn’t schedule — open
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onMakeImage(d.id)}
                        className="flex-none rounded-lg bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand hover:text-white"
                        title="No image yet, so it won’t post — make one and it’s scheduled automatically"
                      >
                        Make image
                      </button>
                    )
                  )}
                  <span className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.cls}`}>{s.label}</span>
                </li>
              )
            })}
          </ul>
          {plan.drafts.some((d) => d.status === 'rejected') && data.free_days > 0 && (
            <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-ink-700">
              You removed some posts — their days are free again. Plan them to fill the gaps.
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Link to="/calendar" className="btn-outline">
              Open Calendar
            </Link>
            {plan.drafts.some((d) => d.status !== 'rejected' && d.day > new Date().toLocaleDateString('en-CA')) && (
              <button type="button" disabled={busy} onClick={onRegenerate} className="btn-outline" title="Write new posts for the days from tomorrow on">
                <FiRefreshCw size={13} /> Regenerate plan
              </button>
            )}
            {data.free_days > 0 && (
              <button type="button" disabled={busy} onClick={onPlan} className="btn-primary">
                Plan the next {data.free_days} free day{data.free_days === 1 ? '' : 's'}
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
              ? `A new plan is written ${daily ? 'every evening at 6 PM for the next day' : 'every Sunday at 6 PM'}, and you’ll get a notification. Want one now?`
              : `Turn on this brand in Autopilot to get a plan ${daily ? 'every evening at 6 PM' : 'every Sunday at 6 PM'} — or write one now.`}
          </p>
          <button type="button" disabled={busy || data.free_days === 0} onClick={onPlan} className="btn-primary mt-4">
            {busy ? 'Working…' : daily ? 'Plan tomorrow' : 'Plan the next 7 days'}
          </button>
        </div>
      )}
    </section>
    </>
  )
}

// ── the waiting screen while the plan is written ──────────────────────────
// Live, not a loop: weekly.build_plan reports its stage (10 reading, 20–80
// writing in batches with "(n of m done)", 80 fact-check, 90 summary), so the
// post slots fill as ideas are really written and the checklist follows the
// real stage; useSmoothProgress eases the bar between reports.
const PLAN_STAGES = [
  { at: 2, label: 'Reading last week’s results' },
  { at: 20, label: 'Writing post ideas and captions' },
  { at: 80, label: 'Fact-checking against your products' },
  { at: 90, label: 'Writing your weekly summary' },
]

const weeklyPlanningCss = `
.wp-shimmer { background: linear-gradient(90deg, rgb(var(--ink-100)) 0%, rgb(var(--ink-50)) 50%, rgb(var(--ink-100)) 100%); background-size: 200% 100%; animation: wp-shimmer 1.4s linear infinite; }
@keyframes wp-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.wp-pop { animation: wp-pop .45s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes wp-pop { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }
.wp-write { animation: wp-write 1.1s ease-in-out infinite; }
@keyframes wp-write { 0%, 100% { transform: translate(0, 0) rotate(-10deg); } 50% { transform: translate(10px, -2px) rotate(6deg); } }
.wp-pulse { animation: wp-pulse 1.6s ease-in-out infinite; }
@keyframes wp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgb(var(--brand) / .35); } 50% { box-shadow: 0 0 0 10px rgb(var(--brand) / 0); } }
@media (prefers-reduced-motion: reduce) { .wp-shimmer, .wp-pop, .wp-write, .wp-pulse { animation: none !important; } }
`

function WeeklyPlanning({ brand, job, span = 'next week' }) {
  const progress = useSmoothProgress({
    progress: job?.progress || 0,
    // ease towards the next real checkpoint, never past it
    upto: Math.min(PLAN_STAGES.find((s) => s.at > (job?.progress || 0))?.at ?? 100, (job?.progress || 0) + 15),
  })
  const real = job?.progress || 0
  const counted = /\((\d+) of (\d+) done\)/.exec(job?.step || '')
  const total = counted ? Number(counted[2]) : 7
  const done = real >= 80 ? total : counted ? Number(counted[1]) : 0
  const stage = PLAN_STAGES.reduce((i, s, n) => (real >= s.at ? n : i), 0)
  const finished = real >= 100

  return (
    <section className={`${card} grid gap-8 p-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:p-8`}>
      <style>{weeklyPlanningCss}</style>

      {/* left: what it's doing, the real stages, the progress */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <span className="wp-pulse grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand text-white">
            <FiZap size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold leading-snug text-ink-900">
              {finished ? 'Your plan is ready!' : `The AI is planning ${span} for ${brand}…`}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-500">{finished ? 'Opening it now…' : job?.step || 'Starting…'}</p>
          </div>
        </div>

        <ol className="mt-6 space-y-2.5">
          {PLAN_STAGES.map((s, i) => {
            const state = finished || i < stage ? 'done' : i === stage ? 'now' : 'next'
            return (
              <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className={`grid h-5 w-5 flex-none place-items-center rounded-full ${
                    state === 'done' ? 'bg-brand text-white' : state === 'now' ? 'border-2 border-brand' : 'border-2 border-ink-200'
                  }`}
                >
                  {state === 'done' && <FiCheck size={11} strokeWidth={3} aria-hidden="true" />}
                  {state === 'now' && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />}
                </span>
                <span className={state === 'next' ? 'text-ink-400' : state === 'now' ? 'font-semibold text-ink-900' : 'text-ink-600'}>
                  {s.label}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-auto pt-6">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-semibold text-ink-700">{finished ? 'Done' : 'Progress'}</span>
            <span className="font-bold tabular-nums text-brand">{finished ? 100 : progress}%</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${finished ? 100 : progress}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-400">
            Usually a few minutes. It keeps going in the background — you can leave this page and come back.
          </p>
        </div>
      </div>

      {/* right: the posts being written — filled from the real count */}
      <div className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between text-[12.5px]">
          <span className="font-semibold text-ink-700">Posts written</span>
          <span className="tabular-nums text-ink-500">
            <b className="text-[15px] text-ink-900">{done}</b> of {counted || real >= 80 ? total : '…'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: total }, (_, i) => {
            const isDone = i < done
            const isNow = !isDone && i === done && real >= 20 && real < 80
            return (
              <div
                key={`${i}-${isDone}`}
                className={`relative h-[92px] rounded-xl p-2.5 ${
                  isDone ? 'wp-pop bg-brand-soft' : isNow ? 'wp-shimmer' : 'border border-dashed border-ink-200'
                }`}
              >
                <span className={`text-[10.5px] font-semibold ${isDone ? 'text-brand' : 'text-ink-300'}`}>Post {i + 1}</span>
                {isDone && (
                  <>
                    <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-brand text-white">
                      <FiCheck size={10} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span className="mt-2 block h-1.5 w-3/4 rounded-full bg-brand/40" />
                    <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-brand/25" />
                    <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-brand/25" />
                  </>
                )}
                {isNow && (
                  <span className="wp-write absolute left-4 top-9 text-[20px]" aria-hidden="true">
                    ✏️
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Asked before Rewrite throws away the user's changes to the waiting plan. */
function RewriteDialog({ edited, removed, onCancel, onConfirm }) {
  const changes = [
    edited > 0 && `${edited} edited caption${edited === 1 ? '' : 's'}`,
    removed > 0 && `${removed} removed post${removed === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return (
    <ConfirmBox
      title="Rewrite the whole plan?"
      text={`The AI writes a brand-new plan and replaces this one. Your changes will be lost: ${changes.join(' and ')}.`}
      cancel="Keep my plan"
      confirm="Rewrite"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function ConfirmBox({ title, text, confirm, cancel = 'Cancel', onCancel, onConfirm }) {
  return createPortal(
    <div className="fixed inset-0 z-[110] glass-overlay flex items-center justify-center p-4 animate-fadein" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="glass-panel w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700">
          <FiRefreshCw size={18} aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-[15.5px] font-bold text-ink-900">{title}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">{text}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-outline">
            {cancel}
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary">
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
