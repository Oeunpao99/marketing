import { useEffect, useMemo, useState } from 'react'
import { FiArrowDown, FiArrowUp } from 'react-icons/fi'
import { api } from '../../api/client'
import { useGrow } from '../dashboard/PlatformCharts'
import { PLATFORM } from '../dashboard/platformMeta'
import { fmtNum, hideBroken } from '../insights/Overview'

/** Deep analytics for ONE social platform (the platform switcher on the Insights page): a
 *  Performance Summary row (each number with ▲▼ % against the equal-length period before), an Audience
 *  Growth chart (followers, views and engagement drawn on one shared axis, each scaled to its own
 *  highest day, with the real numbers in the hover tip), what the engagement is made of, and the
 *  top posts. Sub-tabs: Overview / Accounts / Posts. Follower history comes from the saved channel
 *  readings (GET /views/insights/followers), so it only goes back to when we first read the account. */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const SUBTABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'posts', label: 'Posts' },
]
const SERIES = [
  { id: 'followers', label: 'Followers', color: 'var(--series-1)' },
  { id: 'views', label: 'Views', color: 'var(--series-2)' },
  { id: 'engagement', label: 'Engagement', color: 'var(--series-3)' },
]
const W = 600
const H = 220
const PAD = 14

const resolved = (it) => it.status === 'ok' || it.status === 'partial'

/** ▲ +12 % / ▼ −4 % against the period before; nothing when there is no period to compare. */
function Delta({ cur, prev, points = false, className = '' }) {
  if (prev == null || cur == null) return null
  const d = cur - prev
  if (d === 0) return <span className={`text-[11.5px] font-medium text-ink-400 ${className}`}>±0</span>
  let text
  if (points) text = `${Math.abs(d).toFixed(1)} pt`
  else if (prev === 0) text = 'new'
  else text = `${Math.round(Math.abs(d / prev) * 100)}%`
  const up = d > 0
  const Arrow = up ? FiArrowUp : FiArrowDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11.5px] font-semibold ${up ? 'text-[#006300]' : 'text-red-600'} ${className}`}>
      <Arrow size={11} aria-hidden="true" />
      {text}
    </span>
  )
}

/** The headline numbers of a set of posts (counted the way the page's own totals are). */
function sumsOf(rows, u) {
  const s = { posts: rows.length, views: 0, viewsReported: false, engagement: 0, likes: 0, comments: 0, shares: 0, rate: null, refused: 0 }
  let vRate = 0
  let eRate = 0
  for (const it of rows) {
    if (!resolved(it)) continue
    const m = it.metrics || {}
    if (u.reactionsRefused(m)) s.refused += 1
    const reported = !u.reactionsRefused(m) && ['likes', 'comments', 'shares'].some((k) => m[k] != null)
    s.likes += m.likes || 0
    s.comments += m.comments || 0
    s.shares += m.shares || 0
    if (m.views != null) {
      s.views += m.views
      s.viewsReported = true
      if (reported) {
        vRate += m.views
        eRate += u.engagementOf(m)
      }
    }
  }
  s.engagement = s.likes + s.comments + s.shares
  s.rate = vRate > 0 ? (eRate / vRate) * 100 : null
  return s
}

/** Followers at the end of a stretch of the daily series, and how many were gained over it
 *  (the last reading before the stretch is the starting point, else its first reading). */
function followerStats(series, from, to) {
  if (!series) return { end: null, gained: null }
  let end = null
  let start = null
  for (let i = to - 1; i >= from; i--) if (series[i] != null) { end = series[i]; break }
  for (let i = from - 1; i >= 0 && start == null; i--) if (series[i] != null) start = series[i]
  for (let i = from; i < to && start == null; i++) if (series[i] != null) start = series[i]
  return { end, gained: end != null && start != null ? end - start : null }
}

const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function Kpi({ color, label, value, delta }) {
  return (
    <div className={`${card} min-w-0 p-4`}>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: color }} aria-hidden="true" />
        <span className="truncate text-[11.5px] font-medium text-ink-500">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[24px] font-bold leading-none tabular-nums text-ink-900">{value}</span>
        {delta}
      </div>
    </div>
  )
}

/** The three lines on one chart. ``points`` = [{label, followers, views, engagement}] — a null
 *  value leaves a gap (no follower reading yet). Each line is scaled to its own highest point. */
export function GrowthChart({ points, shown, series = SERIES }) {
  const [ref, t] = useGrow(1100)
  const [hover, setHover] = useState(null)
  const n = points.length
  const maxOf = Object.fromEntries(series.map((s) => [s.id, Math.max(1, ...points.map((p) => p[s.id] || 0))]))
  const x = (i) => PAD + (n === 1 ? (W - 2 * PAD) / 2 : (i / (n - 1)) * (W - 2 * PAD))
  const y = (id, v) => H - PAD - ((v || 0) / maxOf[id]) * (H - 2 * PAD) * t
  // a followers line begins where the first reading is, and stops being drawn across gaps
  const pathOf = (id) => {
    let d = ''
    let pen = false
    points.forEach((p, i) => {
      if (p[id] == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(id, p[id]).toFixed(1)}`
      pen = true
    })
    return d
  }
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = (e.clientX - r.left) / r.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(((p * W - PAD) / (W - 2 * PAD)) * (n - 1)))))
  }
  const at = hover != null ? (x(hover) / W) * 100 : 0
  return (
    <div ref={ref} className="relative" onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[230px] w-full" role="img" aria-label="Followers, views and engagement over time">
        {[0, 1, 2, 3].map((g) => {
          const gy = PAD + (g / 3) * (H - 2 * PAD)
          return <line key={g} x1="0" x2={W} y1={gy} y2={gy} stroke="rgb(var(--ink-100))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        })}
        {series.filter((s) => shown[s.id]).map((s) => (
          <path key={s.id} d={pathOf(s.id)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {hover != null &&
          series.filter((s) => shown[s.id] && points[hover][s.id] != null).map((s) => (
            <circle key={s.id} cx={x(hover)} cy={y(s.id, points[hover][s.id])} r="3.5" fill={s.color} vectorEffect="non-scaling-stroke" />
          ))}
      </svg>
      {hover != null && (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-ink-200" style={{ left: `${at}%` }} aria-hidden="true" />
          <div className="pointer-events-none absolute top-1 z-10 w-[156px] rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11.5px] shadow-card" style={{ left: `${at}%`, transform: `translateX(${at > 60 ? '-108%' : '8%'})` }}>
            <div className="mb-1 font-semibold text-ink-900">{points[hover].label}</div>
            {series.filter((s) => shown[s.id]).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-ink-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}
                </span>
                <b className="tabular-nums text-ink-900">{points[hover][s.id] == null ? '—' : points[hover][s.id].toLocaleString()}</b>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-400">
        <span>{points[0]?.label}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
    </div>
  )
}

function Overview({ sums, prevSums, days, daily, fol, folStats, prevFol, rows, hasPrev, onOpenPost, u, meta }) {
  const [weekly, setWeekly] = useState(false)
  const [shown, setShown] = useState({ followers: true, views: true, engagement: true })
  const hasFollowers = !!fol && fol.some((v) => v != null)

  // one point per day (or per 7 days), on the page's own days
  const points = useMemo(() => {
    const step = weekly ? 7 : 1
    const out = []
    for (let i = 0; i < days.length; i += step) {
      const hi = Math.min(days.length, i + step)
      const sum = (arr) => arr.slice(i, hi).reduce((a, b) => a + b, 0)
      let followers = null
      for (let j = hi - 1; j >= i; j--) if (fol?.[j] != null) { followers = fol[j]; break }
      out.push({
        label: weekly && hi - i > 1 ? `${dayLabel(days[i])} – ${dayLabel(days[hi - 1])}` : dayLabel(days[i]),
        followers,
        views: sum(daily.views),
        engagement: sum(daily.engagement),
      })
    }
    return out
  }, [days, daily, fol, weekly])

  const mix = [
    { id: 'likes', label: 'Reactions', value: sums.likes },
    { id: 'comments', label: 'Comments', value: sums.comments },
    { id: 'shares', label: 'Shares', value: sums.shares },
  ]
  const top = useMemo(
    () =>
      rows
        .filter(resolved)
        .map((it) => ({ it, e: u.engagementOf(it.metrics) }))
        .sort((a, b) => b.e - a.e)
        .slice(0, 5),
    [rows, u],
  )
  const totals = [
    { s: SERIES[0], value: folStats.end, delta: <Delta cur={folStats.gained} prev={hasPrev && prevFol ? prevFol.gained : null} />, note: folStats.gained != null ? `${folStats.gained >= 0 ? '+' : '−'}${fmtNum(Math.abs(folStats.gained))} this period` : null },
    { s: SERIES[1], value: sums.viewsReported ? sums.views : null, delta: <Delta cur={sums.views} prev={prevSums?.views} />, note: null },
    { s: SERIES[2], value: sums.engagement, delta: <Delta cur={sums.engagement} prev={prevSums?.engagement} />, note: null },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section className={`${card} min-w-0 p-5 xl:col-span-2`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-ink-900">Audience growth</h3>
            <p className="text-[11.5px] text-ink-500">Each line is drawn against its own highest day · hover for the real numbers</p>
          </div>
          <div className="inline-flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Chart step">
            {[
              ['Daily', false],
              ['Weekly', true],
            ].map(([name, w]) => (
              <button key={name} type="button" aria-pressed={weekly === w} onClick={() => setWeekly(w)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${weekly === w ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
        {points.length < 2 ? (
          <p className="py-10 text-center text-[12.5px] text-ink-500">Not enough days to draw yet.</p>
        ) : (
          <GrowthChart key={`${days.length}-${weekly}-${meta.name}`} points={points} shown={shown} />
        )}
        {!hasFollowers && <p className="mt-2 text-[11.5px] text-ink-400">Follower history starts the day we first read this account's followers — it fills in day by day from here.</p>}
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
          {totals.map(({ s, value, delta, note }) => (
            <div key={s.id} className="min-w-0">
              <button type="button" aria-pressed={shown[s.id]} onClick={() => setShown((p) => ({ ...p, [s.id]: !p[s.id] }))} className={`flex items-center gap-1.5 text-left ${shown[s.id] ? '' : 'opacity-45'}`}>
                <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                <dt className="truncate text-[11.5px] font-medium text-ink-500">{s.label}</dt>
              </button>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[20px] font-bold leading-none tabular-nums text-ink-900">{value == null ? '—' : fmtNum(value)}</span>
                {delta}
              </dd>
              {note && <dd className="mt-0.5 text-[10.5px] text-ink-400">{note}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <section className={`${card} p-5`}>
          <h3 className="text-[15px] font-bold text-ink-900">What people do</h3>
          <p className="mb-3 text-[11.5px] text-ink-500">Share of {fmtNum(sums.engagement)} engagements</p>
          {sums.refused > 0 && sums.engagement === 0 ? (
            <p className="text-[12.5px] text-ink-500">{meta.name} isn't sharing reactions and comments for these posts, so there's no split to show.</p>
          ) : sums.engagement === 0 ? (
            <p className="text-[12.5px] text-ink-500">No reactions, comments or shares yet in this period.</p>
          ) : (
            <ul className="space-y-3">
              {mix.map((m, i) => {
                const pct = Math.round((m.value / sums.engagement) * 100)
                return (
                  <li key={m.id}>
                    <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                      <span className="font-medium text-ink-700">{m.label}</span>
                      <span className="tabular-nums text-ink-500">
                        <b className="text-ink-900">{fmtNum(m.value)}</b> · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(--series-${i + 1})` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={`${card} p-5`}>
          <h3 className="mb-3 text-[15px] font-bold text-ink-900">Top posts</h3>
          {top.length === 0 ? (
            <p className="text-[12.5px] text-ink-500">No post with numbers yet in this period.</p>
          ) : (
            <ol className="space-y-1">
              {top.map(({ it, e }, i) => {
                const src = it.media_kind === 'image' || it.media_thumb ? u.mediaSrc(it.media_url) : null
                return (
                  <li key={it.target_id}>
                    <button type="button" onClick={() => onOpenPost(it)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-50">
                      <span className="w-4 flex-none text-center text-[12px] font-bold tabular-nums text-ink-400">{i + 1}</span>
                      <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-lg bg-ink-100">
                        {src ? <img src={src} alt="" onError={hideBroken} className="h-full w-full object-cover" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink-800">{(it.caption || it.title || 'Post').slice(0, 90)}</span>
                        <span className="block text-[11px] text-ink-400">{u.fmtDate(it.published_at)}</span>
                      </span>
                      <span className="flex-none text-right">
                        <span className="block text-[13px] font-bold tabular-nums text-ink-900">{fmtNum(e)}</span>
                        <span className="block text-[10px] uppercase tracking-wider text-ink-400">engaged</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function Accounts({ platform, channels, brands, rows, health, u }) {
  const mine = channels.filter((c) => c.p === platform && c.s !== 'off')
  const list = mine.map((c) => {
    const own = rows.filter((it) => it.channel_id === c.id)
    const s = sumsOf(own, u)
    const h = health?.channels?.find((x) => x.id === c.id)
    return { c, s, followers: h?.followers ?? null, attention: h?.status === 'attention', note: h?.note, brand: brands.find((b) => b.slug === c.b)?.name || c.b }
  })
  if (!list.length) return <p className={`${card} px-5 py-8 text-center text-[12.5px] text-ink-500`}>No connected account here yet.</p>
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[560px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-400">
            <th className="px-5 py-3 font-medium">Account</th>
            <th className="px-3 py-3 text-right font-medium">Followers</th>
            <th className="px-3 py-3 text-right font-medium">Posts</th>
            <th className="px-3 py-3 text-right font-medium">Views</th>
            <th className="px-3 py-3 text-right font-medium">Engagement</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {list.map(({ c, s, followers, attention, note, brand }) => (
            <tr key={c.id}>
              <td className="px-5 py-3">
                <span className="block font-semibold text-ink-900">{c.h || brand}</span>
                <span className="block text-[11px] text-ink-400">{brand}</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-800">{fmtNum(followers)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-800">{s.posts}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-800">{s.viewsReported ? fmtNum(s.views) : '—'}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-800">{fmtNum(s.engagement)}</td>
              <td className="px-5 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${attention ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600'}`} title={note || undefined}>
                  {attention ? 'Needs attention' : 'Connected'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Posts({ rows, onOpenPost, u }) {
  const [limit, setLimit] = useState(20)
  const sorted = useMemo(() => [...rows].sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0)), [rows])
  if (!sorted.length) return <p className={`${card} px-5 py-8 text-center text-[12.5px] text-ink-500`}>No posts in this period.</p>
  return (
    <div className={card}>
      <ul className="divide-y divide-ink-100">
        {sorted.slice(0, limit).map((it) => {
          const m = resolved(it) ? it.metrics || {} : null
          return (
            <li key={it.target_id}>
              <button type="button" onClick={() => onOpenPost(it)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-800">{(it.caption || it.title || 'Post').slice(0, 120)}</span>
                  <span className="block text-[11px] text-ink-400">
                    {u.fmtDate(it.published_at)} · {it.channel_handle || it.brand_name}
                  </span>
                </span>
                <span className="flex-none text-right text-[12px] tabular-nums text-ink-500">
                  <b className="text-ink-900">{m ? fmtNum(u.viewsOf(m)) : '—'}</b> views
                </span>
                <span className="w-20 flex-none text-right text-[12px] tabular-nums text-ink-500">
                  <b className="text-ink-900">{m && !u.reactionsRefused(m) ? fmtNum(u.engagementOf(m)) : '—'}</b> engaged
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {sorted.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 20)} className="w-full border-t border-ink-100 py-3 text-[12.5px] font-semibold text-brand hover:bg-ink-50">
          Show more ({sorted.length - limit} left)
        </button>
      )}
    </div>
  )
}

export default function SocialPlatformView({ platform, items, previous, days, rangeDays, brandId, channels, brands, onOpenPost, util: u }) {
  const meta = PLATFORM[platform] || { name: platform }
  const [sub, setSub] = useState('overview')
  const [fol, setFol] = useState(null) // { days: [...], series: [... or null] } for this platform
  const [health, setHealth] = useState(null)

  const rows = useMemo(() => items.filter((it) => it.platform_slug === platform), [items, platform])
  const prevRows = useMemo(() => (previous ? previous.filter((it) => it.platform_slug === platform) : null), [previous, platform])
  const sums = useMemo(() => sumsOf(rows, u), [rows, u])
  const prevSums = useMemo(() => (prevRows ? sumsOf(prevRows, u) : null), [prevRows, u])
  const daily = useMemo(() => u.dailyOf(rows, days), [rows, days, u])

  // follower history: this period and (for the ▲▼) the one before it
  const span = Math.max(7, Math.min(days.length || 30, 90))
  const fetchDays = previous ? Math.min(180, span * 2) : span
  useEffect(() => {
    let on = true
    setFol(null)
    api
      .get(`/views/insights/followers?days=${fetchDays}${brandId ? `&brand_id=${brandId}` : ''}`)
      .then((d) => on && setFol(d))
      .catch(() => on && setFol({ days: [], platforms: {} }))
    return () => {
      on = false
    }
  }, [fetchDays, brandId])
  useEffect(() => {
    let on = true
    api
      .get('/views/dashboard/health')
      .then((d) => on && setHealth(d))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])

  const series = fol?.platforms?.[platform] || null
  const total = series ? series.length : 0
  // the page's own days, looked up by date in the server's series (both are calendar days)
  const folOnDays = useMemo(() => {
    if (!series || !fol?.days?.length) return null
    const by = new Map(fol.days.map((d, i) => [d, series[i]]))
    return days.map((d) => (by.has(d) ? by.get(d) : null))
  }, [series, fol, days])
  const curStats = followerStats(series, Math.max(0, total - span), total)
  const prevStats = previous && series && total >= span * 2 ? followerStats(series, total - span * 2, total - span) : null

  const Icon = meta.Icon
  const hasPrev = !!prevSums
  const delta = (k) => (hasPrev ? <Delta cur={sums[k]} prev={prevSums[k]} /> : null)
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl bg-ink-50 ring-1 ring-ink-100 ${meta.cls || ''}`}>{Icon ? <Icon size={20} /> : null}</span>
        <div>
          <h2 className="text-[17px] font-bold leading-tight text-ink-900">{meta.name}</h2>
          <p className="text-[12px] text-ink-500">Performance summary{rangeDays ? ` · last ${rangeDays} days` : ' · all time'}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi color="var(--series-3)" label="Engagement" value={fmtNum(sums.engagement)} delta={delta('engagement')} />
        <Kpi color="var(--series-2)" label="Views" value={sums.viewsReported ? fmtNum(sums.views) : '—'} delta={delta('views')} />
        <Kpi color="var(--series-1)" label="Followers" value={fmtNum(curStats.end)} delta={null} />
        <Kpi color="var(--series-1)" label="New followers" value={curStats.gained == null ? '—' : `${curStats.gained > 0 ? '+' : ''}${fmtNum(curStats.gained)}`} delta={prevStats ? <Delta cur={curStats.gained} prev={prevStats.gained} /> : null} />
        <Kpi color="var(--series-4)" label="Posts" value={fmtNum(sums.posts)} delta={delta('posts')} />
        <Kpi color="var(--series-5)" label="Engagement rate" value={sums.rate == null ? '—' : `${sums.rate.toFixed(1)}%`} delta={hasPrev && prevSums.rate != null && sums.rate != null ? <Delta cur={sums.rate} prev={prevSums.rate} points /> : null} />
      </div>

      <div className="mb-5 inline-flex rounded-xl bg-ink-100 p-0.5" role="tablist" aria-label={`${meta.name} sections`}>
        {SUBTABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={sub === t.id} onClick={() => setSub(t.id)} className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${sub === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'overview' && (
        <Overview sums={sums} prevSums={prevSums} days={days} daily={daily} fol={folOnDays} folStats={curStats} prevFol={prevStats} rows={rows} hasPrev={hasPrev} onOpenPost={onOpenPost} u={u} meta={meta} />
      )}
      {sub === 'accounts' && <Accounts platform={platform} channels={channels} brands={brands} rows={rows} health={health} u={u} />}
      {sub === 'posts' && <Posts rows={rows} onOpenPost={onOpenPost} u={u} />}
    </div>
  )
}
