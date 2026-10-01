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
import { FiAlertTriangle, FiArrowRight, FiBarChart2, FiCalendar, FiCheckCircle, FiClock, FiTrendingDown, FiTrendingUp, FiPieChart } from 'react-icons/fi'
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
    // Best time to post: average engagement per post by weekday × time of day
    // (Phnom Penh). Same rules as the AI's (app/learning.py): the last
    // LOOKBACK_DAYS only, newer posts counting more (HALF_LIFE_DAYS), and a
    // post only once it's SETTLE_HOURS old — before that it's still
    // collecting likes and would make its slot look weak.
    const cells = Array.from({ length: 7 }, () => DAY_SLOTS.map(() => ({ sum: 0, w: 0, n: 0 })))
    let allSum = 0
    let allW = 0
    let allN = 0
    const nowMs = Date.now()
    for (const d of all) {
      const m = d.metrics
      if (d.status !== 'posted' || !m || !d.at || !ENG_KEYS.some((k) => typeof m[k] === 'number')) continue
      const ageDays = (nowMs - new Date(d.at).getTime()) / 86400000
      if (!(ageDays >= SETTLE_HOURS / 24 && ageDays <= LOOKBACK_DAYS)) continue
      const e = ENG_KEYS.reduce((s, k) => s + (typeof m[k] === 'number' ? m[k] : 0), 0)
      const w = 0.5 ** (ageDays / HALF_LIFE_DAYS)
      const { wd, hour } = phnomPenhWhen(d.at)
      const cell = cells[wd][slotOf(hour)]
      cell.sum += w * e
      cell.w += w
      cell.n += 1
      allSum += w * e
      allW += w
      allN += 1
    }
    const heat = cells.map((row) => row.map((c) => ({ n: c.n, avg: c.n ? c.sum / c.w : null })))
    let bestSlot = null
    heat.forEach((row, wd) =>
      row.forEach((c, si) => {
        if (c.n >= 2 && c.avg > 0 && (!bestSlot || c.avg > bestSlot.avg)) bestSlot = { wd, si, ...c }
      }),
    )
    const overallAvg = allW ? allSum / allW : 0
    if (bestSlot && allN >= 6) {
      const slot = DAY_SLOTS[bestSlot.si]
      const ratio = overallAvg ? bestSlot.avg / overallAvg : null
      insights.push({
        tone: 'good',
        icon: FiClock,
        text: `Best time to post: ${WEEKDAYS_LONG[bestSlot.wd]} ${slot.label.toLowerCase()} (${slot.range}) — ${bestSlot.avg.toFixed(1)} engagement per post (${bestSlot.n} posts)${
          ratio && ratio >= 1.2 ? `, ${ratio.toFixed(1)}× your average` : ''
        }.`,
        hint: 'The AI plans your strongest posts for your best days and times.',
      })
    }

    const busiest = days.filter((d) => !d.future).sort((a, b) => b.total - a.total)[0]
    if (busiest?.total > 1) {
      insights.push({ tone: 'info', icon: FiBarChart2, text: `Busiest day in the last 2 weeks: ${shortDay(busiest.date)}, with ${busiest.total} posts.` })
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
      heat,
      heatPosts: allN,
      bestSlot,
    }
  }, [queue, channels])
}

// ── Best time to post ─────────────────────────────────────────────────────
const ENG_KEYS = ['likes', 'comments', 'shares']
// Mirrors app/learning.py LOOKBACK_DAYS / HALF_LIFE_DAYS / SETTLE.
const LOOKBACK_DAYS = 90
const HALF_LIFE_DAYS = 30
const SETTLE_HOURS = 48
const DAY_SLOTS = [
  { label: 'Morning', range: '6–11', from: 6, to: 11 },
  { label: 'Midday', range: '11–14', from: 11, to: 14 },
  { label: 'Afternoon', range: '14–18', from: 14, to: 18 },
  { label: 'Evening', range: '18–22', from: 18, to: 22 },
  { label: 'Night', range: '22–6', from: 22, to: 30 },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const slotOf = (hour) => DAY_SLOTS.findIndex((s) => (hour >= s.from && hour < s.to) || (hour + 24 >= s.from && hour + 24 < s.to))
const whenFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', hour12: false, timeZone: 'Asia/Phnom_Penh' })
function phnomPenhWhen(iso) {
  const parts = Object.fromEntries(whenFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return { wd: Math.max(0, WEEKDAYS.indexOf(parts.weekday)), hour: Number(parts.hour) % 24 }
}
// One hue, light → dark (sequential): more engagement = deeper blue.
const HEAT_HUE = '42, 120, 214'

/** Weekday × time-of-day grid of average engagement per post, deeper = more,
 *  the best slot outlined. Every cell prints its number; hover for the count. */
export function BestTimeHeatmap({ heat, best, posts }) {
  const max = Math.max(0, ...heat.flat().map((c) => c.avg || 0))
  if (posts < 6 || !(max > 0)) {
    return (
      <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink-500">
        The map fills in once about 6 posts have likes, comments or shares — it shows which days and times get you the most engagement.
      </p>
    )
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate [border-spacing:3px] text-center">
          <thead>
            <tr>
              <th className="w-24" />
              {WEEKDAYS.map((d) => (
                <th key={d} className="pb-1 text-[11px] font-semibold text-ink-500">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_SLOTS.map((slot, si) => (
              <tr key={slot.label}>
                <th className="pr-2 text-left align-middle">
                  <div className="text-[11.5px] font-semibold text-ink-700">{slot.label}</div>
                  <div className="text-[10.5px] font-normal text-ink-400">{slot.range}</div>
                </th>
                {WEEKDAYS.map((d, wd) => {
                  const c = heat[wd][si]
                  const t = c.avg ? 0.15 + 0.85 * (c.avg / max) : 0
                  const isBest = best && best.wd === wd && best.si === si
                  // One post is a hint, not a pattern — shown faded and never the best slot.
                  const thin = c.n === 1
                  return (
                    <td
                      key={d}
                      title={
                        c.n
                          ? `${WEEKDAYS_LONG[wd]} ${slot.label.toLowerCase()}: ${c.avg.toFixed(1)} engagement per post (${c.n} post${c.n === 1 ? '' : 's'})${
                              thin ? ' — only 1 post, not enough to trust yet' : ''
                            }`
                          : `${WEEKDAYS_LONG[wd]} ${slot.label.toLowerCase()}: no posts with numbers`
                      }
                      className={`h-11 rounded-md text-[11.5px] font-semibold leading-tight tabular-nums ${c.n ? '' : 'bg-ink-50 text-ink-300'} ${
                        isBest ? 'ring-2 ring-ink-900' : ''
                      } ${thin ? 'opacity-50' : ''}`}
                      style={c.n ? { background: `rgba(${HEAT_HUE}, ${t})`, color: t > 0.55 ? '#fff' : 'rgb(var(--ink-800))' } : undefined}
                    >
                      {c.n ? (
                        <>
                          {c.avg >= 10 ? Math.round(c.avg) : c.avg.toFixed(1)}
                          <span className="block text-[9.5px] font-normal opacity-75">
                            {c.n} post{c.n === 1 ? '' : 's'}
                          </span>
                        </>
                      ) : (
                        '·'
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-2">
          Less
          <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, rgba(${HEAT_HUE},0.15), rgba(${HEAT_HUE},1))` }} />
          More engagement per post
        </span>
        <span>
          {best && (
            <>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle ring-2 ring-ink-900" /> best slot ·{' '}
            </>
          )}
          from {posts} posts in the last 90 days (newer count more; posts under 2 days old wait for their numbers) · faded = only 1 post · Phnom
          Penh time
        </span>
      </div>
    </div>
  )
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
export function DonutWithTable({ segments, centerLabel, emptyText, size = 132 }) {
  const [hover, setHover] = useState(null)
  const total = segments.reduce((s, x) => s + x.value, 0)
  const stroke = size >= 120 ? 16 : 13
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

// Each tone: an icon on a soft tint of its colour, plus a word for screen
// readers — the colour is never the only signal.
const TONES = {
  critical: { icon: FiAlertTriangle, badge: 'bg-red-50 text-red-600', label: 'Needs attention' },
  warning: { icon: FiCalendar, badge: 'bg-amber-50 text-amber-700', label: 'Heads up' },
  good: { icon: FiTrendingUp, badge: 'bg-emerald-50 text-emerald-700', label: 'Going well' },
  down: { icon: FiTrendingDown, badge: 'bg-red-50 text-red-600', label: 'Down' },
  info: { icon: FiPieChart, badge: 'bg-brand-soft text-brand', label: 'Pattern' },
}

// Numbers (12 · 39% · 1,240) in bold, so the facts stand out when skimming.
function withNumbers(text) {
  return text.split(/(\d[\d,.]*%?)/g).map((part, i) =>
    /^\d/.test(part) ? (
      <b key={i} className="font-semibold tabular-nums text-ink-900">
        {part}
      </b>
    ) : (
      part
    ),
  )
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
    <ul className="-my-1 divide-y divide-ink-100">
      {items.map((i, n) => {
        const t = TONES[i.tone] || TONES.info
        const Icon = i.icon || t.icon
        return (
          <li key={n} className="flex items-center gap-3 py-2.5">
            <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg ${t.badge}`} title={t.label}>
              <Icon size={15} aria-label={t.label} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] leading-snug text-ink-700">{withNumbers(i.text)}</div>
              {i.hint && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-400">{i.hint}</div>}
            </div>
            {i.link && (
              <Link
                to={i.link.to}
                className="inline-flex flex-none items-center gap-1 rounded-lg border border-brand/25 bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                {i.link.label} <FiArrowRight size={12} />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
