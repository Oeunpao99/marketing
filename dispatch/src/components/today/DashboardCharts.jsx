// Dashboard charts (TodayPage): posts per day stacked by platform, the
// platform share and delivery-status donuts, and the plain-language insights.
//
// Everything counts DELIVERIES — one post sent to two Pages is two — because
// that's what each platform actually received. Built from the queue the store
// already polls (GET /views/today), so the charts stay live with the queue.
//
// Chart rules (dataviz skill), same as the Analytics overview: platforms keep
// their fixed brand colour (platformHue — see Overview.jsx for the trade-off);
// status colours are the reserved status steps, always with a label; 2px
// surface gaps between stacked segments and donut arcs; 4px rounded bar tops on
// one baseline; hairline grid; text in ink tokens; every value also readable in
// a legend with numbers.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiCalendar, FiCheckCircle, FiTrendingDown, FiTrendingUp, FiPieChart } from 'react-icons/fi'
import { PLAT } from '../../data/brands'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../ui/PlatformIcon'
import { platformHue } from '../insights/Overview'
import { phnomPenhDate, phnomPenhDay } from '../../lib/tz'

const PAST_DAYS = 14
const NEXT_DAYS = 7
const PLATFORM_ORDER = ['facebook', 'instagram', 'tiktok', 'linkedin', 'telegram', 'youtube']
// Reserved status steps (never a platform colour); scheduled is neutral.
const STATUS = {
  posted: { label: 'Published', color: '#0ca30c' },
  failed: { label: 'Failed', color: '#d03b3b' },
  sending: { label: 'Sending', color: '#fab219' },
  queued: { label: 'Scheduled', color: 'rgb(var(--ink-300))' },
}
const SURFACE = 'rgb(var(--surface))'

export const platformName = (slug) => PLAT[slug]?.name || (slug ? slug[0].toUpperCase() + slug.slice(1) : 'Other')
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const shortDay = (iso) =>
  new Date(`${iso}T12:00:00+07:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Every number the Dashboard shows, from the store's queue (posts with their
 *  per-channel deliveries) and channels. */
export function useDashboardStats(queue, channels) {
  return useMemo(() => {
    const today = phnomPenhDate(0)
    const dayOf = (n) => phnomPenhDate(n)
    const from30 = dayOf(-29)
    const from60 = dayOf(-59)
    const to7 = dayOf(NEXT_DAYS)

    const all = []
    for (const post of queue) {
      for (const d of post.deliveries || []) {
        const status = d.status === 'posting' ? 'sending' : d.status
        all.push({ ...d, status, day: phnomPenhDay(d.at) })
      }
    }

    // Posts per day, by platform: 14 days back through 7 ahead.
    const days = []
    for (let n = -(PAST_DAYS - 1); n <= NEXT_DAYS; n++) days.push({ date: dayOf(n), future: n > 0, today: n === 0, byPlatform: {}, total: 0 })
    const dayIndex = Object.fromEntries(days.map((d, i) => [d.date, i]))
    for (const d of all) {
      const i = dayIndex[d.day]
      if (i == null || d.status === 'failed') continue // a failed delivery never reached anyone
      const slot = days[i]
      slot.byPlatform[d.platform] = (slot.byPlatform[d.platform] || 0) + 1
      slot.total += 1
    }

    const inWindow = (d, a, b) => d.day && d.day >= a && d.day <= b
    const published30 = all.filter((d) => d.status === 'posted' && inWindow(d, from30, today))
    const publishedPrev30 = all.filter((d) => d.status === 'posted' && inWindow(d, from60, dayOf(-30)))
    const failed30 = all.filter((d) => d.status === 'failed' && inWindow(d, from30, today))
    const upcoming = all.filter((d) => (d.status === 'queued' || d.status === 'sending') && inWindow(d, today, to7))
    const last7 = all.filter((d) => d.status === 'posted' && inWindow(d, dayOf(-6), today)).length
    const prev7 = all.filter((d) => d.status === 'posted' && inWindow(d, dayOf(-13), dayOf(-7))).length

    // Platform share of what was published in the last 30 days.
    const share = {}
    for (const d of published30) share[d.platform] = (share[d.platform] || 0) + 1
    const platforms = [...new Set([...PLATFORM_ORDER.filter((p) => share[p] || days.some((d) => d.byPlatform[p])), ...Object.keys(share)])]
    const shareSegments = platforms
      .map((p) => ({ key: p, label: platformName(p), value: share[p] || 0, color: platformHue(p), icon: platformName(p) }))
      .filter((s) => s.value > 0)

    // Delivery status across the last 30 days and the next 7.
    const statusCounts = { posted: published30.length, failed: failed30.length, sending: 0, queued: 0 }
    for (const d of upcoming) statusCounts[d.status] += 1
    const statusSegments = Object.entries(STATUS).map(([key, s]) => ({ key, label: s.label, value: statusCounts[key], color: s.color }))

    const attempted = published30.length + failed30.length
    const successRate = attempted ? pct(published30.length, attempted) : null
    const nextDays = days.filter((d) => d.future || d.today)
    const emptyAhead = days.filter((d) => d.future && d.total === 0).length

    // ── insights: each one a measured fact with its numbers ────────────────
    const insights = []
    if (failed30.length) {
      const byPlat = {}
      for (const d of failed30) byPlat[d.platform] = (byPlat[d.platform] || 0) + 1
      const worst = Object.entries(byPlat).sort((a, b) => b[1] - a[1])[0]
      insights.push({
        tone: 'critical',
        text: `${failed30.length} deliver${failed30.length === 1 ? 'y' : 'ies'} failed in the last 30 days${
          worst ? ` — ${worst[1]} on ${platformName(worst[0])}` : ''
        }.`,
        hint: 'Check the channel connection, then retry from the queue.',
      })
    }
    if (emptyAhead >= 3) {
      insights.push({
        tone: 'warning',
        text: `${emptyAhead} of the next ${NEXT_DAYS} days have nothing scheduled.`,
        hint: 'Regular posting keeps your reach up — let the AI plan the week.',
        link: { to: '/weekly', label: 'Plan the week' },
      })
    }
    if (last7 || prev7) {
      const change = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : null
      insights.push({
        tone: change == null || change >= 0 ? 'good' : 'down',
        text:
          change == null
            ? `${last7} posts published in the last 7 days (none the week before).`
            : `${last7} posts published in the last 7 days — ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% from ${prev7} the week before.`,
      })
    }
    if (shareSegments.length) {
      const top = [...shareSegments].sort((a, b) => b.value - a.value)[0]
      const liveIdle = [...new Set(channels.filter((c) => c.s === 'live').map((c) => c.p))].filter((p) => !share[p])
      insights.push({
        tone: 'info',
        text: `${top.label} carries ${pct(top.value, published30.length)}% of your posts (${top.value} of ${published30.length} in 30 days)${
          liveIdle.length ? ` — nothing went to ${liveIdle.map(platformName).join(', ')}, though ${liveIdle.length === 1 ? "it's" : "they're"} connected` : ''
        }.`,
      })
    }
    const busiest = days.filter((d) => !d.future).sort((a, b) => b.total - a.total)[0]
    if (busiest?.total > 1) {
      insights.push({ tone: 'info', text: `Busiest day in the last 2 weeks: ${shortDay(busiest.date)}, with ${busiest.total} posts.` })
    }
    if (!failed30.length && attempted) {
      insights.push({ tone: 'good', text: `Every delivery in the last 30 days went out (${attempted} of ${attempted}).` })
    }

    return {
      today,
      days,
      platforms: platforms.filter((p) => days.some((d) => d.byPlatform[p])),
      shareSegments,
      statusSegments,
      published30: published30.length,
      publishedPrev30: publishedPrev30.length,
      failed30: failed30.length,
      successRate,
      upcoming: upcoming.length,
      upcomingDays: nextDays.length,
      emptyAhead,
      insights,
    }
  }, [queue, channels])
}

function Tip({ x, children }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-lg bg-night-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg"
      style={{ left: x }}
    >
      {children}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-600">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} aria-hidden="true" />
          {i.icon && <PlatformIcon name={i.icon} className={PLAT_BRAND_CLASS[i.icon]} />}
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Posts per day for 3 weeks (14 back, 7 ahead), each bar stacked by
 *  platform. Days ahead are scheduled posts, drawn in a lighter step and set
 *  apart by the "Today" marker. Hover a day for its breakdown. */
export function DailyStackedBars({ days, platforms }) {
  const [hover, setHover] = useState(null)
  const H = 150
  const max = Math.max(1, ...days.map((d) => d.total))
  // A round top for the grid: 1, 2, 4, 5, 10, 20…
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => max / s <= 4) || Math.ceil(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const peak = days.reduce((a, d) => (d.total > a.total ? d : a), days[0])

  return (
    <div>
      <div className="relative flex gap-2">
        {/* y axis */}
        <div className="relative w-6 flex-none text-right text-[10.5px] tabular-nums text-ink-400" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* hairline grid */}
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 ${t === 0 ? 'border-t border-ink-300' : 'border-t border-dashed border-ink-100'}`}
              style={{ top: H - (t / top) * H }}
            />
          ))}
          <div className="relative flex items-end gap-[3px] sm:gap-1.5" style={{ height: H }}>
            {days.map((d) => {
              const segs = platforms.filter((p) => d.byPlatform[p])
              return (
                <div
                  key={d.date}
                  className={`relative flex h-full flex-1 cursor-default flex-col-reverse items-center ${d.today ? 'rounded-t-md bg-brand-soft/60' : ''}`}
                  onMouseEnter={(e) => setHover({ d, x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2 })}
                  onMouseLeave={() => setHover(null)}
                >
                  {segs.map((p, i) => (
                    <div
                      key={p}
                      className={`w-full max-w-[22px] ${i === segs.length - 1 ? 'rounded-t-[4px]' : ''}`}
                      style={{
                        height: (d.byPlatform[p] / top) * H,
                        background: platformHue(p),
                        opacity: d.future ? 0.45 : 1,
                        // 2px surface gap between stacked segments
                        borderTop: i < segs.length - 1 ? `2px solid ${SURFACE}` : undefined,
                      }}
                    />
                  ))}
                  {d === peak && d.total > 0 && (
                    <span className="absolute text-[10.5px] font-semibold tabular-nums text-ink-700" style={{ bottom: (d.total / top) * H + 3 }}>
                      {d.total}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {hover && (
            <Tip x={hover.x}>
              <div className="font-semibold">
                {shortDay(hover.d.date)}
                {hover.d.today ? ' · today' : hover.d.future ? ' · scheduled' : ''}
              </div>
              {hover.d.total === 0 ? (
                <div className="text-white/70">No posts</div>
              ) : (
                platforms
                  .filter((p) => hover.d.byPlatform[p])
                  .map((p) => (
                    <div key={p} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full ring-1 ring-white/50" style={{ background: platformHue(p) }} />
                      <PlatformIcon name={platformName(p)} className="text-white/80" />
                      {platformName(p)} <b className="ml-auto pl-3 tabular-nums">{hover.d.byPlatform[p]}</b>
                    </div>
                  ))
              )}
              {hover.d.total > 0 && <div className="mt-0.5 border-t border-white/20 pt-0.5">Total <b className="float-right tabular-nums">{hover.d.total}</b></div>}
            </Tip>
          )}
          {/* x labels: every other day, plus today */}
          <div className="mt-1.5 flex gap-[3px] sm:gap-1.5">
            {days.map((d, i) => (
              <span
                key={d.date}
                className={`flex-1 truncate text-center text-[10px] leading-4 ${d.today ? 'font-bold text-ink-900' : 'text-ink-400'}`}
              >
                {d.today ? 'Today' : i % 2 === 0 ? String(Number(d.date.slice(8))) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {platforms.length > 1 ? (
          <Legend items={platforms.map((p) => ({ key: p, label: platformName(p), color: platformHue(p), icon: platformName(p) }))} />
        ) : (
          <span />
        )}
        <span className="text-[11px] text-ink-400">Lighter bars after today = scheduled</span>
      </div>
    </div>
  )
}

/** A donut with its total in the middle and a legend table beside it (value
 *  and share per segment — the chart's readable twin). */
export function DonutWithTable({ segments, centerLabel, emptyText }) {
  const [hover, setHover] = useState(null)
  const total = segments.reduce((s, x) => s + x.value, 0)
  const size = 132
  const stroke = 16
  const r = size / 2 - stroke / 2 - 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const live = segments.filter((s) => s.value > 0)
  const gap = live.length > 1 ? 2 : 0
  let acc = 0
  const focus = hover ? segments.find((s) => s.key === hover) : null

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${total}`} className="-rotate-90">
          <circle cx={c} cy={c} r={r} fill="none" style={{ stroke: 'rgb(var(--ink-100))' }} strokeWidth={stroke} />
          {total > 0 &&
            live.map((s) => {
              const len = (s.value / total) * circ
              const dash = Math.max(0.5, len - gap)
              const off = -acc
              acc += len
              return (
                <circle
                  key={s.key}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  style={{ stroke: s.color }}
                  strokeWidth={hover === s.key ? stroke + 4 : stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={off}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-default transition-[stroke-width] duration-150"
                />
              )
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[22px] font-bold leading-none tabular-nums text-ink-900">{focus ? focus.value : total}</div>
            <div className="mt-1 max-w-[80px] text-[10.5px] leading-tight text-ink-500">
              {focus ? `${focus.label} · ${pct(focus.value, total)}%` : centerLabel}
            </div>
          </div>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-[12px] text-ink-400">{emptyText}</p>
      ) : (
        <table className="w-full min-w-0 text-[12px]">
          <tbody>
            {segments.map((s) => (
              <tr
                key={s.key}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                className={`${hover === s.key ? 'bg-ink-50' : ''} ${s.value ? '' : 'opacity-50'}`}
              >
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1.5 text-ink-700">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} aria-hidden="true" />
                    {s.icon && <PlatformIcon name={s.icon} className={PLAT_BRAND_CLASS[s.icon]} />}
                    {s.label}
                  </span>
                </td>
                <td className="py-1 text-right font-semibold tabular-nums text-ink-900">{s.value}</td>
                <td className="w-12 py-1 text-right tabular-nums text-ink-400">{pct(s.value, total)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const TONES = {
  critical: { icon: FiAlertTriangle, cls: 'text-red-600', label: 'Needs attention' },
  warning: { icon: FiCalendar, cls: 'text-amber-600', label: 'Heads up' },
  good: { icon: FiTrendingUp, cls: 'text-emerald-700', label: 'Going well' },
  down: { icon: FiTrendingDown, cls: 'text-red-600', label: 'Down' },
  info: { icon: FiPieChart, cls: 'text-ink-500', label: 'Pattern' },
}

/** "What stands out" — the numbers above turned into sentences, most
 *  urgent first, each with a next step where there is one. */
export function Insights({ items }) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-ink-500">
        <FiCheckCircle className="text-ink-400" /> Not enough posts yet to spot patterns — they show up after a week or two of posting.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {items.map((i, n) => {
        const t = TONES[i.tone] || TONES.info
        const Icon = t.icon
        return (
          <li key={n} className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex-none ${t.cls}`} title={t.label}>
              <Icon size={15} aria-label={t.label} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
              <span className="font-medium text-ink-900">{i.text}</span>
              {i.hint && <span className="block text-[11.5px] text-ink-500">{i.hint}</span>}
            </div>
            {i.link && (
              <Link to={i.link.to} className="inline-flex flex-none items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                {i.link.label} <FiArrowRight size={12} />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
