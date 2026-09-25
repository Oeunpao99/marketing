// Extra detail for one post (InsightsPostPage): how its numbers grew over time
// (saved readings — app/views.py record_snapshots), Telegram channel members
// over time, and when it went out vs your usual posting hours,
// and your other recent posts on the same channel.
//
// Chart rules as elsewhere: one y-axis per chart, whole-number ticks, smooth
// lines that never overshoot (monotone), hairline grid, a legend for 2+ series,
// hover tooltips, and every number also written out as text.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiGrid,
} from 'react-icons/fi'
import { axisMax } from '../../pages/InsightsPage'
import { monotonePath, platformHue } from './Overview'

const ACCENT = '#2a78d6'
const TZ = 'Asia/Phnom_Penh'
const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString())
const hourOf = (iso) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso))) % 24

function since(fromIso, toIso) {
  const h = (new Date(toIso) - new Date(fromIso)) / 3600000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} days`
}

// ── A small time-series chart (x = real time, one y-axis) ─────────────────
function TimeChart({ series, marker, height = 220, unitLabel }) {
  const wrap = useRef(null)
  const [hover, setHover] = useState(null)
  const [W, setW] = useState(720)
  // Draw at the real pixel width, so axis text stays 11px on any screen
  // instead of scaling up with a stretched viewBox.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setW(Math.max(280, el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return <div ref={wrap} />
  const PAD = { l: 44, r: 16, t: 12, b: 28 }
  const t0 = Math.min(...all.map((p) => p.t), marker ?? Infinity)
  const t1 = Math.max(...all.map((p) => p.t))
  const span = Math.max(1, t1 - t0)
  const yMax = axisMax(Math.max(...all.map((p) => p.v), 1))
  const x = (t) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / yMax) * (height - PAD.t - PAD.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((g) => g * yMax)
  const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b)
  const label = (t) =>
    span > 3 * 86400000
      ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })
      : new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = times[0]
    for (const t of times) if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t
    setHover(best)
  }

  return (
    <div ref={wrap} className="relative">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={unitLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v) + 0.5} y2={y(v) + 0.5} stroke={v === 0 ? '#c3c2b7' : '#EDEFF2'} />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#898781">
              {fmt(v)}
            </text>
          </g>
        ))}
        {marker != null && (
          <g>
            <line x1={x(marker)} x2={x(marker)} y1={PAD.t} y2={height - PAD.b} stroke="#52514e" strokeWidth="1" strokeDasharray="3 3" />
            <text x={x(marker) + 5} y={PAD.t + 10} fontSize="10.5" fill="#52514e">
              this post
            </text>
          </g>
        )}
        {series.map((s) => {
          const pts = s.points.map((p) => [x(p.t), y(p.v)])
          const d = monotonePath(pts)
          return (
            <g key={s.key}>
              {series.length === 1 && <path d={`${d} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={s.color} opacity="0.08" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {s.points.map((p) => (
                <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={hover === p.t ? 4.5 : 2.5} fill={s.color} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )
        })}
        <text x={PAD.l} y={height - 8} fontSize="11" fill="#898781">
          {label(t0)}
        </text>
        <text x={W - PAD.r} y={height - 8} fontSize="11" fill="#898781" textAnchor="end">
          {label(t1)}
        </text>
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="#c3c2b7" />}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="font-semibold">{label(hover)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.t === hover)
            return p ? (
              <div key={s.key}>
                <span style={{ color: s.color }}>●</span> {s.label}: {fmt(p.v)}
              </div>
            ) : null
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-center gap-4 text-[12px] text-ink-600">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function WaitingNote({ children }) {
  return <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink-500">{children}</p>
}

// ── How this post's numbers grew ──────────────────────────────────────────
export function GrowthCard({ history, publishedAt, seriesColors, platformName }) {
  const [metric, setMetric] = useState('engagement')
  const snaps = history?.post || []
  const hasViews = snaps.some((s) => s.views != null)
  const pub = publishedAt ? new Date(publishedAt).getTime() : null
  // Every count is 0 the moment a post goes out, so the line starts there.
  const withStart = (key) => {
    const pts = snaps.filter((s) => s[key] != null).map((s) => ({ t: new Date(s.at).getTime(), v: s[key] }))
    return pub != null && pts.length && pts[0].t > pub ? [{ t: pub, v: 0 }, ...pts] : pts
  }
  const series =
    metric === 'views'
      ? [{ key: 'views', label: 'Views', color: ACCENT, points: withStart('views') }]
      : ['likes', 'comments', 'shares']
          .map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), color: seriesColors[k], points: withStart(k) }))
          .filter((s) => s.points.length)
  const last = snaps[snaps.length - 1]

  return (
    <section className={`${card} p-5`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">How this post grew</h2>
        {hasViews && (
          <div className="flex gap-1.5">
            {['engagement', 'views'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className={`h-7 rounded-lg px-2.5 text-[12px] font-medium capitalize ${metric === m ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mb-4 text-[12px] text-ink-500">
        {last
          ? `${snaps.length} reading${snaps.length === 1 ? '' : 's'} since it went out · latest ${since(publishedAt || last.at, last.at)} after posting`
          : 'Readings of this post’s numbers, saved every few hours.'}
      </p>
      {series.some((s) => s.points.length >= 2) ? (
        <TimeChart series={series} unitLabel={`${platformName} post ${metric} over time`} />
      ) : (
        <WaitingNote>
          ContentFlow saves this post’s numbers every few hours. The growth chart appears after the first readings — check back later
          today.
        </WaitingNote>
      )}
    </section>
  )
}

// ── Telegram: channel members over time ───────────────────────────────────
export function MembersCard({ history, publishedAt }) {
  const snaps = history?.channel || []
  const pts = snaps.filter((s) => s.subscribers != null).map((s) => ({ t: new Date(s.at).getTime(), v: s.subscribers }))
  const pub = publishedAt ? new Date(publishedAt).getTime() : null
  const before = [...pts].reverse().find((p) => pub != null && p.t <= pub)
  const after = pts[pts.length - 1]
  const firstAfter = pts.find((p) => pub != null && p.t >= pub)
  const base = before || firstAfter
  const change = base && after && after.t > base.t ? after.v - base.v : null
  return (
    <section className={`${card} p-5`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Channel members over time</h2>
        {change != null && (
          <span className={`text-[12.5px] font-semibold ${change > 0 ? 'text-[#006300]' : change < 0 ? 'text-red-600' : 'text-ink-500'}`}>
            {change > 0 ? '+' : ''}
            {change} member{Math.abs(change) === 1 ? '' : 's'} {before ? 'since this post' : 'since the first reading after it'}
          </span>
        )}
      </div>
      <p className="mb-4 text-[12px] text-ink-500">
        Telegram shares only the member count with apps — watching it around a post shows whether the post brought people in.
      </p>
      {pts.length >= 2 ? (
        <TimeChart series={[{ key: 'members', label: 'Members', color: ACCENT, points: pts }]} marker={pub} unitLabel="Telegram channel members over time" />
      ) : (
        <WaitingNote>ContentFlow saves the member count every few hours. The chart appears after a couple of readings.</WaitingNote>
      )}
    </section>
  )
}

// ── When it went out ──────────────────────────────────────────────────────
export function PostingTimeCard({ post, peers, platformName }) {
  const counts = useMemo(() => {
    const c = Array(24).fill(0)
    for (const p of peers) if (p.published_at) c[hourOf(p.published_at)] += 1
    return c
  }, [peers])
  const mine = post.published_at ? hourOf(post.published_at) : null
  const max = Math.max(...counts, 1)
  const top = Math.max(...counts)
  const busiest = counts.filter((n) => n === top).length === 1 && top > 1 ? counts.indexOf(top) : null
  const when = post.published_at
    ? new Date(post.published_at).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ })
    : '—'
  return (
    <section className={`${card} p-5`}>
      <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">When it went out</h2>
      <p className="mt-0.5 text-[12px] text-ink-500">
        {when} (Phnom Penh) · your {peers.length} {platformName} post{peers.length === 1 ? '' : 's'} by hour
      </p>
      <div className="mt-5 flex h-24 items-end gap-[2px]" role="img" aria-label="Posts per hour of day">
        {counts.map((n, h) => (
          <div key={h} className="group relative flex h-full flex-1 items-end" title={`${String(h).padStart(2, '0')}:00 — ${n} post${n === 1 ? '' : 's'}`}>
            <div
              className="w-full rounded-t-[3px]"
              style={{ height: n ? `${Math.max(6, (n / max) * 100)}%` : '2px', background: h === mine ? ACCENT : n ? '#c9d6e8' : '#EDEFF2' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-400">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT }} aria-hidden="true" /> This post
        </span>
        {busiest != null && (
          <span>
            You post most often around <b className="font-semibold text-ink-900">{String(busiest).padStart(2, '0')}:00</b>
          </span>
        )}
      </div>
    </section>
  )
}

// ── More from this channel ────────────────────────────────────────────────
export function MoreFromChannel({ post, items, icons, engagementOf, onOpen }) {
  const others = items
    .filter((p) => p.target_id !== post.target_id && (post.channel_id ? p.channel_id === post.channel_id : p.platform_slug === post.platform_slug))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, 5)
  if (!others.length) return null
  const Icon = icons[post.platform_slug] || FiGrid
  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-3 text-[15.5px] font-semibold tracking-tight text-ink-900">More from this channel</h2>
      <ul className="divide-y divide-ink-100">
        {others.map((p) => {
          const m = p.metrics || {}
          const has = ['likes', 'comments', 'shares'].some((k) => m[k] != null)
          const text = (p.caption || p.title || '').replace(/#[\p{L}\p{N}_]+/gu, '').trim() || 'Untitled'
          return (
            <li key={p.target_id}>
              <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-ink-50/60">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg text-white" style={{ background: platformHue(p.platform_slug) }}>
                  <Icon size={13} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink-900">{text}</span>
                  <span className="text-[11.5px] text-ink-500">
                    {new Date(p.published_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })}
                  </span>
                </span>
                <span className="flex-none text-right text-[12px] tabular-nums text-ink-700">
                  {has ? (
                    <>
                      <b className="font-semibold text-ink-900">{fmt(engagementOf(m))}</b> eng.
                    </>
                  ) : m.views != null ? (
                    <>
                      <b className="font-semibold text-ink-900">{fmt(m.views)}</b> views
                    </>
                  ) : (
                    <span className="text-ink-400">no numbers</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
