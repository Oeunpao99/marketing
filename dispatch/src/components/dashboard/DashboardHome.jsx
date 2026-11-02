import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiActivity, FiAlertTriangle, FiArrowRight, FiArrowUp, FiArrowDown, FiBarChart2, FiCheck, FiChevronRight, FiEye, FiTarget, FiUsers, FiZap } from 'react-icons/fi'
import { api } from '../../api/client'
import { fmtNum } from '../insights/Overview'
import './dashboard-overview.css'
import { mediaSrc } from '../insights/BoostCard'
import PlatformCharts, { useGrow } from './PlatformCharts'
import { PLATFORM } from './platformMeta'

/** The Dashboard's results-first top: what needs you, how this week went, the post to boost,
 *  and whether every connected account is healthy. Each part loads on its own (a failure in one
 *  hides only that part); nothing here is invented — an empty part says so. */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const TONE = {
  // see-through tints, so they read on the light and the dark theme alike
  critical: { row: 'border-red-500/35 bg-red-500/10 hover:bg-red-500/15', num: 'text-red-500' },
  warning: { row: 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15', num: 'text-amber-600' },
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
// ── 1 · this week: four big numbers — each with an icon, a count-up and its own 7-day line ──────
/** "111.7k" / "3.7%" / "15k" / "0" counted up from zero (the text keeps its own unit and decimals). */
function countUp(text, t) {
  const m = typeof text === 'string' && text.match(/^(\D*)(\d[\d,]*\.?\d*)(.*)$/)
  if (!m) return text ?? '—'
  const decimals = (m[2].split('.')[1] || '').length
  const v = parseFloat(m[2].replace(/,/g, '')) * t
  return `${m[1]}${v.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`
}

/** The last days as a soft line that rises from the bottom; nothing is drawn without 2+ real points. */
function Tile({ Icon, label, value, color, badge, note, badgeTone = 'neutral' }) {
  const [ref, t] = useGrow(800)
  return <Link ref={ref} to="/insights" className="overview-kpi" style={{'--kpi-color':color}}>
    <div className="overview-kpi-title"><span><Icon size={20} aria-hidden="true" /></span><h3>{label}</h3></div>
    <div className="overview-kpi-value"><strong>{countUp(value,t)}</strong><span className={`overview-kpi-change ${badgeTone}`}>
      {badgeTone === 'up' ? <FiArrowUp size={12}/> : badgeTone === 'down' ? <FiArrowDown size={12}/> : null}{badge || '?'}
    </span></div>
    <p>{note}</p>
  </Link>
}

function Week({ sales, failed }) {
  const growth = sales?.followers?.growth
  const reachChange = sales?.reach?.sub?.match(/([+-]?[0-9.]+)% vs prior/)
  const tiles = sales && [
    { Icon: FiEye, label: 'Reach', value: sales.reach?.value, color: '#1877f2', badge: reachChange ? `${reachChange[1]}%` : null, badgeTone: reachChange ? Number(reachChange[1]) >= 0 ? 'up' : 'down' : 'neutral', note: reachChange ? 'vs. previous 7 days' : 'Recorded reach - last 7 days' },
    { Icon: FiBarChart2, label: 'Engagement rate', value: sales.engagementRate?.value, color: '#11b67a', note: sales.engagementRate?.sub || 'Last 7 days' },
    { Icon: FiUsers, label: 'Followers', value: sales.followers?.value, color: '#a44cf2', badge: growth == null ? null : `${growth > 0 ? '+' : ''}${growth.toLocaleString()}`, badgeTone: growth > 0 ? 'up' : growth < 0 ? 'down' : 'neutral', note: 'Change across saved audience readings' },
    { Icon: FiTarget, label: 'Leads', value: sales.leads?.value, color: '#f58725', note: 'Captured in the last 7 days' },
  ]
  return (
    <section className="overview-week mb-6">
      {failed ? (
        <p className={`${card} px-5 py-4 text-[12.5px] text-ink-500`}>This week's numbers couldn't load — open Insights to try again.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles ? tiles.map((t) => <Tile key={t.label} {...t} />) : [0, 1, 2, 3].map((i) => <div key={i} className="h-[142px] animate-pulse rounded-2xl bg-ink-100" />)}
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
    <section className={`${card} overview-detail-card flex min-w-0 flex-col p-5`}>
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
    <section className={`${card} overview-detail-card flex min-w-0 flex-col p-5`}>
      <Heading
        title="Your accounts"
        note={health ? (health.attention ? <b className="text-amber-600">{health.attention} need{health.attention === 1 ? 's' : ''} attention</b> : `${health.connected} connected · all readable`) : ''}
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
                    <span className={`block truncate text-[11.5px] ${bad ? 'text-amber-600' : 'text-ink-500'}`}>
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
  const [sales, salesFailed] = useLoad('/views/insights/sales?period=7d')
  const [boosts, boostsFailed] = useLoad('/views/insights/boosts')
  const [health, healthFailed] = useLoad('/views/dashboard/health')
  return (
    <div className="dashboard-overview mb-2">
      <Week sales={sales} failed={salesFailed} />
      <div className="overview-details mb-7 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <TopPost boosts={boosts} failed={boostsFailed} />
        <Accounts health={health} failed={healthFailed} />
      </div>
      <PlatformCharts />
    </div>
  )
}
