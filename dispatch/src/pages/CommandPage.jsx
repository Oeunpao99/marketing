import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowDownRight, FiArrowUpRight, FiCheck, FiChevronRight, FiPlus, FiRefreshCw } from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import Select from '../components/ui/Select'

// Command center (backend app/command.py): what the AI is doing, and the few
// things that need a person. One read, refreshed every minute; rows link to
// the page that acts on them, and today's ideas can be approved right here.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')
const fmt = (n) => (n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-US'))
const pct = (now, before) => (now != null && before > 0 ? Math.round(((now - before) / before) * 100) : null)

export default function CommandPage() {
  const { brands, showToast, refreshReview } = useStore()
  const [brandId, setBrandId] = useState(0) // 0 = all brands
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState({}) // draft id → 'approve' | 'media'

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/command${brandId ? `?brand_id=${brandId}` : ''}`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [brandId])

  useEffect(() => {
    setData(null)
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  const act = async (row, kind) => {
    setActing((a) => ({ ...a, [row.id]: kind }))
    try {
      if (kind === 'approve') {
        const out = await api.post(`/views/drafts/${row.id}/approve`)
        showToast(out.status === 'scheduled' ? 'Approved and scheduled' : 'Approved — it still needs an image to post')
      } else {
        await api.post(`/views/drafts/${row.id}/media`, { kind: 'image' })
        showToast('Making the image — it’s scheduled as soon as it’s ready')
      }
      refreshReview?.()
      await load()
    } catch (e) {
      showToast(e.message)
    } finally {
      setActing((a) => ({ ...a, [row.id]: null }))
    }
  }

  const now = data ? new Date(data.now) : null
  const showBrand = !brandId && brands.length > 1

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">Command center</h1>
          <p className="mt-1 text-[13px] text-ink-600">What the AI is doing, and the few things that need you</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {brands.length > 1 && (
            <Select
              align="right"
              value={brandId}
              onChange={setBrandId}
              buttonClassName="font-medium"
              options={[
                { value: 0, label: 'All brands', hint: brands.map((b) => b.name).join(' · ') },
                ...brands.map((b) => ({ value: b.id, label: b.name, color: colorForBrand(b.slug) })),
              ]}
            />
          )}
          {now && (
            <span className="hidden font-mono text-[12px] tabular-nums text-ink-500 sm:inline">
              {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Phnom_Penh' })}
              {' · '}
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })}
            </span>
          )}
          <Link to="/new" className="btn-primary px-4 py-2">
            <FiPlus size={15} /> New post
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700">{error}</p>}

      {!data ? (
        <Skeleton />
      ) : (
        <div className="space-y-5">
          <Kpis k={data.kpis} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <NeedsYou needs={data.needs} autopilot={data.autopilot} showBrand={showBrand} />
            <Today rows={data.today} showBrand={showBrand} acting={acting} onAct={act} />
          </div>

          <AgentLog log={data.log} />
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${card} h-[104px] skeleton`} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[5fr_7fr]">
        <div className={`${card} h-72 skeleton`} />
        <div className={`${card} h-72 skeleton`} />
      </div>
    </div>
  )
}

// ── the numbers ───────────────────────────────────────────────────────────
function Change({ now, before }) {
  const c = pct(now, before)
  if (c == null || c === 0) return <span className="text-ink-400">same as last week</span>
  const Icon = c > 0 ? FiArrowUpRight : FiArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${c > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
      <Icon size={12} aria-hidden="true" />
      {Math.abs(c)}% vs last week
    </span>
  )
}

function Kpis({ k }) {
  const tiles = [
    { label: 'Reach · 7 days', value: fmt(k.reach.now), note: k.reach.now != null ? <Change now={k.reach.now} before={k.reach.before} /> : 'Views appear as results come in' },
    {
      label: 'Reactions · 7 days',
      value: fmt(k.reactions.now),
      note: k.reactions.now != null ? <Change now={k.reactions.now} before={k.reactions.before} /> : 'Results not collected yet',
    },
    { label: 'Posts published · 7 days', value: fmt(k.posts.now), note: <Change now={k.posts.now} before={k.posts.before} /> },
    k.audience
      ? {
          label: 'Audience',
          value: fmt(k.audience.now),
          note: k.audience.has_before ? (
            <span className={k.audience.now >= k.audience.before ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>
              {k.audience.now - k.audience.before >= 0 ? '+' : ''}
              {fmt(k.audience.now - k.audience.before)} this week
            </span>
          ) : (
            'Members and followers'
          ),
        }
      : {
          label: 'Channels live',
          value: `${k.channels.live}`,
          note: `of ${k.channels.total} connected`,
        },
    {
      label: 'AI credit left',
      value: `$${Math.max(0, k.credit.available).toFixed(2)}`,
      note: k.credit.monthly ? `of $${k.credit.monthly.toFixed(0)} this month` : 'This month',
      warn: k.credit.monthly && k.credit.available <= k.credit.monthly * 0.15,
    },
  ]
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className={`${card} min-w-0 px-4 py-4`}>
          <div className="text-[12px] text-ink-500">{t.label}</div>
          <div className={`mt-1 text-[26px] font-bold leading-tight tracking-tight tabular-nums ${t.warn ? 'text-red-600' : 'text-ink-900'}`}>{t.value}</div>
          <div className="mt-1 truncate text-[11.5px] text-ink-500">{t.note}</div>
        </div>
      ))}
    </section>
  )
}

// ── needs you ─────────────────────────────────────────────────────────────
const TONE = {
  critical: { row: 'border-red-200 bg-red-50/60 hover:bg-red-50', num: 'text-red-600' },
  warning: { row: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50', num: 'text-amber-700' },
  normal: { row: 'border-ink-200/70 hover:bg-ink-50', num: 'text-brand' },
}

function NeedsYou({ needs, autopilot, showBrand }) {
  return (
    <section className={`${card} flex flex-col p-5`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-900">Needs you</h2>
        <span className="text-[11.5px] text-ink-400">Everything else runs on its own</span>
      </div>

      {needs.length === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <FiCheck size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[13.5px] font-semibold text-ink-900">Nothing needs you right now</p>
            <p className="mt-0.5 text-[12px] text-ink-500">The AI is posting and learning on its own.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {needs.map((n) => {
            const tone = TONE[n.tone] || TONE.normal
            const body = (
              <>
                <span className={`w-8 flex-none text-center text-[20px] font-bold tabular-nums ${tone.num}`}>
                  {n.count ?? (n.tone === 'normal' ? '•' : '!')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink-900">{n.title}</span>
                  <span className={`block truncate text-[12px] text-ink-500 ${khmer(n.detail)}`}>{n.detail}</span>
                  {showBrand && n.brands?.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {n.brands.map((b) => (
                        <span key={b} className="rounded-md bg-ink-100 px-1.5 py-px text-[10.5px] font-medium text-ink-600">
                          {b}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {n.to && <FiChevronRight size={16} className="flex-none text-ink-400" aria-hidden="true" />}
              </>
            )
            const cls = `flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${tone.row}`
            return (
              <li key={n.key}>
                {n.to ? (
                  <Link to={n.to} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <div className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-600">
          <b className="font-semibold text-ink-800">Autopilot</b>{' '}
          {autopilot.enabled === 0 ? (
            <>
              is off.{' '}
              <Link to="/auto" className="font-semibold text-brand hover:underline">
                Turn on Auto-generate
              </Link>{' '}
              to post daily.
            </>
          ) : (
            <>
              on for {autopilot.enabled} of {autopilot.brands} brand{autopilot.brands === 1 ? '' : 's'} ·{' '}
              {autopilot.approval ? 'daily posts wait for your OK' : 'daily posts go out by themselves'} · weekly plans always wait for you
              {autopilot.auto_media ? ' · images made automatically' : ''}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ── today across channels ─────────────────────────────────────────────────
const STATUS = {
  posted: { label: 'Posted', cls: 'bg-emerald-50 text-emerald-700' },
  scheduled: { label: 'Scheduled', cls: 'bg-brand-soft text-brand' },
  posting: { label: 'Posting…', cls: 'bg-brand-soft text-brand' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
  needs_approval: { label: 'Needs approval', cls: 'bg-amber-50 text-amber-800' },
  no_media: { label: 'No image yet', cls: 'bg-amber-50 text-amber-800' },
}

function Today({ rows, showBrand, acting, onAct }) {
  return (
    <section className={`${card} p-5`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-900">Today across channels</h2>
        <Link to="/calendar" className="text-[12px] font-semibold text-brand hover:underline">
          Open calendar
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-ink-500">Nothing planned for today yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => {
            const s = STATUS[r.status] || STATUS.scheduled
            const busy = acting[r.id]
            const meta = [
              r.channels.join(' · ') || (r.kind === 'draft' ? 'Idea for today' : ''),
              r.views != null && `${fmt(r.views)} views`,
              r.engagement != null && `${fmt(r.engagement)} reactions`,
              showBrand && r.brand,
            ].filter(Boolean)
            return (
              <li key={`${r.kind}-${r.id}`} className="flex items-center gap-4 py-3">
                <span className="w-11 flex-none font-mono text-[12.5px] tabular-nums text-ink-500">{r.time || '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13.5px] font-semibold text-ink-900 ${khmer(r.title)}`}>{r.title || 'Untitled'}</span>
                  <span className="block truncate text-[11.5px] text-ink-500">{meta.join(' · ')}</span>
                </span>
                {r.kind === 'draft' && r.status === 'needs_approval' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => onAct(r, 'approve')}
                    className="flex-none rounded-lg bg-brand px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    title={r.flagged ? 'This caption has a claim to check — open Content to read it first' : 'Approve this post'}
                  >
                    {busy === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                )}
                {r.kind === 'draft' && r.status === 'no_media' && !r.has_media && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => onAct(r, 'media')}
                    className="flex-none rounded-lg bg-brand-soft px-3 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand hover:text-white disabled:opacity-60"
                  >
                    {busy === 'media' ? (
                      <span className="inline-flex items-center gap-1">
                        <FiRefreshCw size={11} className="animate-spin" /> Starting…
                      </span>
                    ) : (
                      'Make image'
                    )}
                  </button>
                )}
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                  {s.label}
                  {r.flagged ? ' · check' : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── what the AI did today ─────────────────────────────────────────────────
function AgentLog({ log }) {
  return (
    <section className={`${card} p-5`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-900">What the AI did today</h2>
        <span className="text-[11.5px] text-ink-400">From today’s records</span>
      </div>
      {log.length === 0 ? (
        <p className="py-4 text-[12.5px] text-ink-500">Nothing yet today — the daily run writes and posts at its set time.</p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {log.map((e, i) => (
            <li key={i} className="rounded-xl border border-ink-200/70 px-3.5 py-3">
              <div className="font-mono text-[11.5px] tabular-nums text-ink-500">
                {e.at} · {e.kind}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-800">{e.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
