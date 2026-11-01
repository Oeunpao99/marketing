import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiCheck, FiChevronRight, FiZap } from 'react-icons/fi'
import { api } from '../../api/client'
import { fmtNum } from '../insights/Overview'
import { mediaSrc } from '../insights/BoostCard'
import PlatformCharts from './PlatformCharts'
import { PLATFORM } from './platformMeta'

/** The Dashboard's results-first top: what needs you, how this week went, the post to boost,
 *  and whether every connected account is healthy. Each part loads on its own (a failure in one
 *  hides only that part); nothing here is invented — an empty part says so. */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const TONE = {
  critical: { row: 'border-red-200/70 bg-red-50/50 hover:bg-red-50', num: 'text-red-600' },
  warning: { row: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50', num: 'text-amber-700' },
  normal: { row: 'border-ink-200/70 bg-white hover:bg-ink-50', num: 'text-brand' },
}

function useLoad(path) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    api
      .get(path)
      .then((d) => on && setData(d))
      .catch(() => on && setFailed(true))
    return () => {
      on = false
    }
  }, [path])
  return [data, failed]
}

function Heading({ title, note, to, toLabel }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[13.5px] font-semibold text-ink-800">{title}</h2>
      <span className="flex items-center gap-3 text-[11.5px] text-ink-500">
        {note}
        {to && (
          <Link to={to} className="font-semibold text-brand hover:underline">
            {toLabel} →
          </Link>
        )}
      </span>
    </div>
  )
}

// ── 2 · needs you ───────────────────────────────────────────────────────────
function NeedsYou({ needs, boosts, health }) {
  const items = [...(needs || [])]
  const picks = (boosts?.items || []).filter((i) => i.kind === 'boost')
  if (picks.length) {
    items.push({ key: 'boost', tone: 'normal', count: picks.length, title: `Post${picks.length > 1 ? 's' : ''} worth boosting`, detail: 'Leads came from them — review and approve', to: '/insights' })
  }
  if (health?.attention) {
    items.push({ key: 'health', tone: 'warning', count: health.attention, title: `Account${health.attention > 1 ? 's' : ''} we can't read`, detail: 'Reconnect them to get their numbers back', to: '/channels' })
  }
  const order = { critical: 0, warning: 1, normal: 2 }
  items.sort((a, b) => (order[a.tone] ?? 2) - (order[b.tone] ?? 2))
  const shown = items.slice(0, 6)
  return (
    <section className="mb-7">
      <Heading title="Needs you" note={items.length ? `${items.length} thing${items.length === 1 ? '' : 's'}` : 'Everything else runs on its own'} to="/command" toLabel="Open Command center" />
      {items.length === 0 ? (
        <div className={`${card} flex items-center gap-3 px-5 py-4`}>
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <FiCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Nothing needs you right now</p>
            <p className="text-[12px] text-ink-500">The AI is posting and learning on its own.</p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((n) => {
            const tone = TONE[n.tone] || TONE.normal
            const body = (
              <>
                <span className={`w-9 flex-none text-center text-[22px] font-bold tabular-nums ${tone.num}`}>{n.count ?? '!'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-snug text-ink-900">{n.title}</span>
                  <span className="block truncate text-[12px] text-ink-500">{n.detail}</span>
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
    </section>
  )
}

// ── 1 · this week: four big numbers, each with only its title ───────────────
function Week({ sales, failed }) {
  const tiles = sales && [
    ['Reach', sales.reach?.value],
    ['Engagement rate', sales.engagementRate?.value],
    ['Followers', sales.followers?.value],
    ['Leads', sales.leads?.value],
  ]
  return (
    <section className="mb-6">
      {failed ? (
        <p className={`${card} px-5 py-4 text-[12.5px] text-ink-500`}>This week's numbers couldn't load — open Insights to try again.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles
            ? tiles.map(([label, value]) => (
                <Link key={label} to="/insights" className={`${card} block min-w-0 px-5 py-4 transition-shadow hover:shadow-card-hover`}>
                  <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums text-ink-900">{value ?? '—'}</div>
                  <div className="mt-2 text-[13px] font-medium text-ink-500">{label}</div>
                </Link>
              ))
            : [0, 1, 2, 3].map((i) => <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-ink-100" />)}
        </div>
      )}
    </section>
  )
}

// ── 3 · the post to boost ───────────────────────────────────────────────────
function TopPost({ boosts, failed }) {
  const top = boosts?.items?.[0]
  const [broken, setBroken] = useState(false)
  const src = !broken && top ? mediaSrc(top.media_url) : null
  const still = src && (top.media_kind === 'image' || top.media_thumb)
  const engaged = top ? Object.values(top.mix || {}).reduce((a, b) => a + b, 0) : 0
  return (
    <section className={`${card} flex min-w-0 flex-col p-5`}>
      <Heading title="Top post this week" note="vs your usual post" />
      {failed ? (
        <p className="py-6 text-center text-[12.5px] text-ink-500">Boost picks are on the Growth plan and up — see Plans & usage.</p>
      ) : !boosts ? (
        <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
      ) : !top ? (
        <p className="py-6 text-center text-[12.5px] leading-relaxed text-ink-500">No post beat your usual yet. When one does, it shows here with a boost suggestion.</p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row">
          <div className="relative h-40 w-full flex-none overflow-hidden rounded-xl bg-canvas sm:w-48">
            {still ? <img src={src} alt="" onError={() => setBroken(true)} className="h-full w-full object-contain" /> : <p className="line-clamp-6 h-full px-3 py-3 text-[12px] leading-relaxed text-ink-600">{top.caption || top.title}</p>}
            <span className="absolute bottom-2 left-2 rounded-lg bg-white px-2 py-1 text-[12px] font-extrabold text-ink-900 shadow-card">{top.ratio}×</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900">{top.title}</h3>
            <p className="mt-0.5 text-[11.5px] capitalize text-ink-400">
              {top.channel} · {new Date(top.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-canvas py-2 text-center">
              {[
                ['Reached', fmtNum(top.reach)],
                ['Engaged', fmtNum(engaged)],
                ['Leads', top.leads],
              ].map(([k, v]) => (
                <div key={k}>
                  <dd className={`text-[16px] font-bold tabular-nums ${k === 'Leads' && !top.leads ? 'text-ink-400' : 'text-ink-900'}`}>{v}</dd>
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-ink-400">{k}</dt>
                </div>
              ))}
            </dl>
            <Link to="/insights" className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 py-2 pt-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark" style={{ marginTop: 14 }}>
              <FiZap size={14} aria-hidden="true" />
              {top.kind === 'boost' ? `Review boost · suggested $${top.budget}` : 'Review & boost'}
              <FiArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

// ── 4 · accounts ────────────────────────────────────────────────────────────
function Accounts({ health, failed }) {
  const [all, setAll] = useState(false)
  const rows = health?.channels || []
  const shown = all ? rows : rows.slice(0, 7)
  return (
    <section className={`${card} flex min-w-0 flex-col p-5`}>
      <Heading
        title="Your accounts"
        note={health ? (health.attention ? <b className="text-amber-700">{health.attention} need{health.attention === 1 ? 's' : ''} attention</b> : `${health.connected} connected · all readable`) : ''}
        to="/channels"
        toLabel="Manage"
      />
      {failed ? (
        <p className="py-6 text-center text-[12.5px] text-ink-500">Accounts couldn't load.</p>
      ) : !health ? (
        <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-ink-500">
          No account is connected yet.{' '}
          <Link to="/channels/add" className="font-semibold text-brand hover:underline">
            Connect one
          </Link>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-ink-100">
            {shown.map((c) => {
              const p = PLATFORM[c.platform]
              const bad = c.status === 'attention'
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg bg-ink-50 ring-1 ring-ink-100 ${p?.cls || 'text-ink-500'}`}>{p ? <p.Icon size={16} /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink-900">{c.handle || p?.name || c.platform}</span>
                    <span className={`block truncate text-[11.5px] ${bad ? 'text-amber-700' : 'text-ink-500'}`}>
                      {bad ? (
                        <span className="inline-flex items-center gap-1">
                          <FiAlertTriangle size={11} aria-hidden="true" /> {c.note}
                        </span>
                      ) : (
                        [c.brand_name, p?.name].filter(Boolean).join(' · ')
                      )}
                    </span>
                  </span>
                  {c.followers != null && (
                    <span className="flex-none text-right">
                      <span className="block text-[13px] font-bold tabular-nums text-ink-900">{fmtNum(c.followers)}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-ink-400">followers</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {rows.length > 7 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 self-start text-[12px] font-semibold text-brand hover:underline">
              {all ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function DashboardHome() {
  const [command] = useLoad('/command')
  const [sales, salesFailed] = useLoad('/views/insights/sales?period=7d')
  const [boosts, boostsFailed] = useLoad('/views/insights/boosts')
  const [health, healthFailed] = useLoad('/views/dashboard/health')
  return (
    <div className="mb-2">
      <Week sales={sales} failed={salesFailed} />
      <NeedsYou needs={command?.needs} boosts={boosts} health={health} />
      <div className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <TopPost boosts={boosts} failed={boostsFailed} />
        <Accounts health={health} failed={healthFailed} />
      </div>
      <PlatformCharts />
    </div>
  )
}
