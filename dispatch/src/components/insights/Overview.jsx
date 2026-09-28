// Analytics overview (InsightsPage): the posting-activity panel (previous /
// this / next week + what's up next) and the performance panel (headline
// figures with a trend line and per-platform donuts, then one row per channel).
//
// Chart rules (dataviz skill): one categorical colour per platform in a fixed
// order — validated colour-blind safe on white — so a platform keeps its colour
// whatever the filters; 2px surface gaps between donut segments and columns;
// 4px rounded column tops on a single baseline; hairline axes; text in ink
// tokens, never the series colour; every value also readable in the channels
// table (three of the colours sit below 3:1 contrast on white, so the legend +
// table are the required relief, not decoration).
import { useMemo, useState } from 'react'
import {
  FiArrowDownRight,
  FiArrowUpRight,
  FiChevronDown,
  FiCornerUpRight,
  FiGrid,
  FiHeart,
  FiImage,
  FiMessageCircle,
} from 'react-icons/fi'

// Fixed platform → categorical slot (never re-ranked by the data on screen).
const PLATFORM_ORDER = ['facebook', 'instagram', 'tiktok', 'linkedin', 'telegram', 'youtube']
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
export const platformHue = (slug) => SLOTS[PLATFORM_ORDER.indexOf(slug)] ?? '#898781'
const SURFACE = '#ffffff'
const ACCENT = SLOTS[0]

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const fmtNum = (n) => (n == null ? '—' : Math.abs(n) >= 1000 ? compact.format(n) : Math.round(n).toLocaleString())

/** Signed change vs the previous period — green up / red down, with an arrow
 *  so direction never rides on colour alone. */
export function DeltaText({ current, previous, className = '', format = fmtNum }) {
  if (previous == null || current == null) return <span className={`text-ink-400 ${className}`}>—</span>
  const d = current - previous
  if (d === 0) return <span className={`text-ink-400 ${className}`}>±0</span>
  const up = d > 0
  const Arrow = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${up ? 'text-[#006300]' : 'text-red-600'} ${className}`}>
      <Arrow size={12} aria-hidden="true" />
      {up ? '+' : '−'}
      {format(Math.abs(d))}
    </span>
  )
}

function Tip({ x, y, children }) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-night-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  )
}

// ── Posting activity ──────────────────────────────────────────────────────
const WEEK_LABELS = ['Previous week', 'This week', 'Next week']
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Three small column charts on one shared scale: posts per day, published
 *  (solid) for past days and scheduled (lighter step, same hue) for today on. */
export function WeekColumns({ days, today }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...days.map((d) => d.posted + d.scheduled))
  const H = 92 // plot height in px — fixed, so bars and labels never grow with the page width

  return (
    <div className="grid grid-cols-3 gap-4 sm:gap-8">
      {[0, 1, 2].map((w) => {
        const week = days.slice(w * 7, w * 7 + 7)
        const total = week.reduce((s, d) => s + d.posted + d.scheduled, 0)
        return (
          <figure key={w} className="relative min-w-0" aria-label={`${WEEK_LABELS[w]}: ${total} posts`}>
            <div className="flex items-end gap-[2px] border-b border-[#c3c2b7]" style={{ height: H }}>
              {week.map((d) => {
                const posted = (d.posted / max) * (H - 4)
                const sched = (d.scheduled / max) * (H - 4)
                return (
                  <div
                    key={d.date}
                    className="flex h-full flex-1 cursor-default flex-col items-center justify-end"
                    onMouseEnter={(e) => setHover({ w, d, x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2 })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* scheduled sits on top of published, 2px surface gap between */}
                    {d.scheduled > 0 && (
                      <div className="w-full max-w-[14px] rounded-t-[4px] bg-[#9ec5f4]" style={{ height: Math.max(2, sched) }} />
                    )}
                    {d.scheduled > 0 && d.posted > 0 && <div className="h-[2px] w-full max-w-[14px] bg-white" />}
                    {d.posted > 0 && (
                      <div
                        className={`w-full max-w-[14px] ${d.scheduled > 0 ? '' : 'rounded-t-[4px]'}`}
                        style={{ height: Math.max(2, posted), background: ACCENT }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-1 flex gap-[2px]">
              {week.map((d, i) => (
                <span
                  key={d.date}
                  className={`flex-1 text-center text-[10.5px] leading-4 ${d.date === today ? 'font-bold text-ink-900' : 'text-[#898781]'}`}
                >
                  {DOW[i]}
                </span>
              ))}
            </div>
            {hover?.w === w && (
              <Tip x={hover.x} y={0}>
                <div className="font-semibold">
                  {new Date(`${hover.d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div>{hover.d.posted} published · {hover.d.scheduled} scheduled</div>
              </Tip>
            )}
            <figcaption className={`mt-1.5 text-center text-[12px] ${w === 1 ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>
              {WEEK_LABELS[w]} <span className="font-normal text-ink-400">· {total}</span>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

export function UpNext({ items, icons, mediaSrc }) {
  if (!items?.length) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-[12px] text-ink-400">
        Nothing scheduled yet.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((u) => {
        const Icon = icons[u.platform_slug] || FiGrid
        const src = mediaSrc(u.media_url)
        const when = new Date(u.at)
        return (
          <li key={u.target_id} className="flex items-stretch overflow-hidden rounded-xl border border-ink-200/70 bg-white">
            <div className="min-w-0 flex-1 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[12px] text-ink-700">
                <Icon size={12} className="text-ink-500" aria-hidden="true" />
                <span className="font-semibold tabular-nums">
                  {when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })}
                </span>
                <span className="text-ink-400">
                  {when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Phnom_Penh' })}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-800">{u.title}</div>
            </div>
            <div className="w-16 flex-none bg-ink-100 grid place-items-center">
              {src && (u.media_kind === 'image' || u.media_thumb) ? (
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : src && u.media_kind === 'video' ? (
                <video src={src} className="h-full w-full object-cover" muted />
              ) : (
                <FiImage size={16} className="text-ink-300" />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Performance figures ───────────────────────────────────────────────────
/** Smooth path through [x, y] points that never overshoots them (monotone
 *  cubic, Fritsch–Carlson) — same curve as InsightsPage's line charts. */
export function monotonePath(pts) {
  const n = pts.length
  if (n < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const dx = [], s = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    s.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1))
  }
  const m = [s[0]]
  for (let i = 1; i < n - 1; i++) {
    m.push(s[i - 1] * s[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / s[i - 1] + (dx[i] + 2 * dx[i - 1]) / s[i]))
  }
  m.push(s[n - 2])
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${pts[i][0] + h},${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

/** 12-ish point trend in the accent; the area wash keeps it light. */
export function TrendLine({ values, width = 150, height = 44, color = ACCENT }) {
  if (!values || values.length < 2 || values.every((v) => v === 0)) {
    return <div style={{ width, height }} className="grid place-items-center text-[11px] text-ink-300">no trend yet</div>
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 5 - ((v - min) / span) * (height - 10)])
  const line = monotonePath(pts)
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${line} L${lx},${height} L${pts[0][0]},${height} Z`} fill={color} opacity="0.1" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
    </svg>
  )
}

/** Part-to-whole by platform (≤ 6 segments, 2px surface gaps). Hover shows
 *  the platform, its value and share. */
export function Donut({ segments, size = 84, label }) {
  const [hover, setHover] = useState(null)
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = size / 2 - 7
  const c = size / 2
  const stroke = 13
  if (!(total > 0)) {
    return (
      <svg width={size} height={size} aria-label={`${label}: no data`}>
        <circle cx={c} cy={c} r={r} fill="none" style={{ stroke: 'rgb(var(--ink-100))' }} strokeWidth={stroke} />
      </svg>
    )
  }
  const circ = 2 * Math.PI * r
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0
  let acc = 0
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} by platform`} className="-rotate-90">
        {segments.map((s) => {
          if (!(s.value > 0)) return null
          const len = (s.value / total) * circ
          const dash = Math.max(0.5, len - gap)
          const off = -acc
          acc += len
          return (
            <circle
              key={s.slug}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={platformHue(s.slug)}
              strokeWidth={hover === s.slug ? stroke + 3 : stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={off}
              onMouseEnter={() => setHover(s.slug)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default transition-[stroke-width] duration-150"
            />
          )
        })}
      </svg>
      {hover && (
        <Tip x="50%" y={0}>
          <span className="font-semibold">{segments.find((s) => s.slug === hover)?.label}</span>{' '}
          {fmtNum(segments.find((s) => s.slug === hover)?.value)} ·{' '}
          {Math.round(((segments.find((s) => s.slug === hover)?.value || 0) / total) * 100)}%
        </Tip>
      )}
    </div>
  )
}

export function Figure({ label, value, delta, children }) {
  return (
    <div className="flex min-w-0 items-center gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-600">{label}</div>
        <div className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight text-ink-900">{value}</div>
        <div className="mt-0.5 text-[12px]">{delta}</div>
      </div>
      <div className="ml-auto flex-none">{children}</div>
    </div>
  )
}

export function PlatformLegend({ slugs, labels }) {
  if (slugs.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-3 text-[11.5px] text-ink-600">
      {slugs.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: platformHue(s) }} aria-hidden="true" />
          {labels[s] || s}
        </span>
      ))}
    </div>
  )
}

// ── Pulse card (the headline numbers) ─────────────────────────────────────
/** A label with a dotted underline that explains itself on hover / focus. */
export function Defined({ children, text }) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <span className="cursor-help border-b border-dotted border-ink-300">{children}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-56 rounded-lg bg-night-900 px-2.5 py-1.5 text-[11.5px] font-normal leading-snug text-white shadow-lg group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  )
}

// What engagement is made of — fixed colours, same as the Performance chart.
const MIX = [
  { id: 'likes', label: 'Reactions', color: '#1B75BB' },
  { id: 'comments', label: 'Comments', color: '#F08A5D' },
  { id: 'shares', label: 'Shares', color: '#86A41E' },
]
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)

/** Engagement as the hero (with what it's made of and a one-line read-out),
 *  then the supporting numbers. `cur` / `prev` come from totalsOf(). */
export function PulseCard({ cur, prev, period, viewsReported, topPlatform }) {
  const total = cur.engagement || 0
  const parts = MIX.map((m) => ({ ...m, value: cur[m.id] || 0 }))
  const lead = [...parts].sort((a, b) => b.value - a.value)[0]
  const perPost = cur.posts ? total / cur.posts : null
  const prevPerPost = prev?.posts ? prev.engagement / prev.posts : null
  const readout = !total
    ? 'No reactions, comments or shares yet in this period.'
    : [
        `Mostly ${lead.label.toLowerCase()} — ${Math.round((lead.value / total) * 100)}% of it.`,
        topPlatform && topPlatform.share < 1 ? `${topPlatform.label} brought ${Math.round(topPlatform.share * 100)}%.` : '',
        cur.comments === 0 ? 'Nobody is talking back yet — ask a question in the caption.' : '',
      ]
        .filter(Boolean)
        .join(' ')

  const side = [
    { id: 'posts', label: 'Posts', value: cur.posts, previous: prev?.posts, info: 'Posts that went out in this period on your connected channels.' },
    { id: 'per', label: 'Per post', value: perPost, previous: prevPerPost, format: fmtAvg, info: 'Average engagement each post earned.' },
    { id: 'views', label: 'Views', value: viewsReported ? cur.views : null, previous: prev?.views, info: 'Views or impressions — only from platforms that report them.' },
    { id: 'rate', label: 'Eng. rate', value: cur.rate, previous: prev?.rate, format: pct, info: 'Engagement ÷ views, on posts from platforms that report views.' },
  ]

  return (
    <div className="grid overflow-hidden rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[13px] font-semibold text-ink-700">
            <Defined text="Reactions + comments + shares, added up across every post.">Engagement</Defined>
          </span>
          <span className="text-[11.5px] text-ink-400">{period}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className="text-[38px] font-bold leading-none tracking-tight text-ink-900 tabular-nums">{fmtNum(total)}</span>
          <span className="text-[13px]">
            <DeltaText current={total} previous={prev?.engagement} />
          </span>
        </div>
        <p className="mt-2 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-600">{readout}</p>

        {/* what the engagement is made of */}
        <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
          {total > 0 &&
            parts
              .filter((p) => p.value > 0)
              .map((p) => <span key={p.id} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.id} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: p.color }} aria-hidden="true" />
                {p.label}
              </div>
              <div className={`text-[15px] font-semibold tabular-nums ${p.value ? 'text-ink-900' : 'text-ink-300'}`}>{fmtNum(p.value)}</div>
              <div className="text-[11px]">
                <DeltaText current={p.value} previous={prev?.[p.id]} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-ink-100 bg-ink-50/40 lg:border-l lg:border-t-0">
        {side.map((s, i) => {
          const fmt = s.format || fmtNum
          return (
            <div
              key={s.id}
              className={`min-w-0 p-4 sm:p-5 ${i % 2 ? 'border-l border-ink-100' : ''} ${i > 1 ? 'border-t border-ink-100' : ''}`}
            >
              <div className="text-[12px] text-ink-600">
                <Defined text={s.info}>{s.label}</Defined>
              </div>
              <div className={`mt-1 text-[22px] font-bold leading-tight tabular-nums ${s.value ? 'text-ink-900' : 'text-ink-300'}`}>
                {fmt(s.value)}
              </div>
              <div className="mt-0.5 text-[11.5px]">
                <DeltaText current={s.value} previous={s.previous} format={fmt} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Channel scoreboard ────────────────────────────────────────────────────
// Every channel ranked on one metric, with a bar sized against the leader so
// the gap between channels is visible at a glance. Channels sit under their
// platform once there's more than one. `perPost` turns counts into averages so
// a busy Page and a quiet one compare fairly. Connected channels with nothing
// posted stay on the board (faded) with a nudge to plan something.
export const fmtAvg = (n) => (n == null ? '—' : Math.abs(n) < 10 ? (Math.round(n * 10) / 10).toLocaleString() : fmtNum(n))
const perPostOf = (v, posts) => (v == null || !posts ? null : v / posts)

export const RANK_BY = [
  { id: 'engagement', label: 'Engagement', avg: true, prev: 'prevEngagement' },
  { id: 'posts', label: 'Posts', prev: 'prevPosts' },
  { id: 'views', label: 'Views', avg: true, prev: 'prevViews' },
  { id: 'rate', label: 'Eng. rate' },
]

const sumRows = (rows) => {
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0)
  const anyViews = rows.some((r) => r.views != null)
  const hasPrev = rows.some((r) => r.prevPosts != null)
  const rateV = sum('rateV')
  return {
    posts: sum('posts'),
    engagement: sum('engagement'),
    likes: sum('likes'),
    comments: sum('comments'),
    shares: sum('shares'),
    views: anyViews ? sum('views') : null,
    reported: rows.some((r) => r.reported),
    prevPosts: hasPrev ? sum('prevPosts') : null,
    prevEngagement: hasPrev ? sum('prevEngagement') : null,
    prevViews: hasPrev && anyViews ? sum('prevViews') : null,
    rate: rateV > 0 ? (sum('rateE') / rateV) * 100 : null,
  }
}

/** The ranked number for a row, honouring the per-post switch. */
function metricOf(metric, r, perPost) {
  if (metric.id === 'rate') return r.rate
  if (metric.id === 'views' && r.views == null) return null
  if (metric.id === 'engagement' && !r.reported) return null
  return perPost && metric.avg ? perPostOf(r[metric.id], r.posts) : r[metric.id]
}

// Each platform's own brand colour, for marking which platform a channel is
// on (the chart palette above is for telling series apart, not for logos).
// TikTok's black follows the theme's darkest ink so it stays visible in dark mode.
const BRAND_HUES = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  telegram: '#26A5E4',
  tiktok: 'rgb(var(--ink-900))',
  youtube: '#FF0000',
}
const brandHue = (slug) => BRAND_HUES[slug] || 'rgb(var(--ink-500))'

export function ChannelScoreboard({ rows, icons, labels, rankBy = 'engagement', perPost = false, onPosts, onPlan }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const metric = RANK_BY.find((m) => m.id === rankBy) || RANK_BY[0]
  const fmt = metric.id === 'rate' ? pct : perPost && metric.avg ? fmtAvg : fmtNum

  const { groups, max, rank } = useMemo(() => {
    const val = (r) => (r.posts ? metricOf(metric, r, perPost) ?? -1 : -2)
    const ranked = [...rows].filter((r) => r.posts).sort((a, b) => val(b) - val(a))
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.platform)) map.set(r.platform, [])
      map.get(r.platform).push(r)
    }
    return {
      max: Math.max(0, ...rows.map((r) => (r.posts ? metricOf(metric, r, perPost) || 0 : 0))),
      rank: new Map(ranked.map((r, i) => [r.key, i + 1])),
      groups: [...map.entries()]
        .map(([platform, list]) => {
          const total = { ...sumRows(list), platform }
          return { platform, total, rows: [...list].sort((a, b) => val(b) - val(a)) }
        })
        .sort((a, b) => val(b.total) - val(a.total)),
    }
  }, [rows, metric, perPost])

  if (!rows.length) {
    return <div className="px-5 py-10 text-center text-[12.5px] text-ink-400">No connected channels yet.</div>
  }
  const grouped = rows.length > 1
  const toggle = (p) =>
    setCollapsed((s) => {
      const next = new Set(s)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })

  return (
    <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
      {groups.map((g) => {
        const Icon = icons[g.platform] || FiGrid
        const hue = brandHue(g.platform)
        const open = !grouped || !collapsed.has(g.platform)
        const gv = metricOf(metric, g.total, perPost)
        return (
          <div key={g.platform} className="overflow-hidden rounded-xl border border-ink-100">
            {grouped && (
              <button
                type="button"
                onClick={() => toggle(g.platform)}
                aria-expanded={open}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-ink-50/60"
              >
                <span
                  className="grid h-7 w-7 flex-none place-items-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${hue} 12%, transparent)`, color: hue }}
                  aria-hidden="true"
                >
                  <Icon size={14} />
                </span>
                <span className="text-[13px] font-semibold text-ink-900">{labels[g.platform] || g.platform}</span>
                <span className="text-[11.5px] text-ink-400">
                  {g.rows.length} {g.rows.length === 1 ? 'account' : 'accounts'} · {g.total.posts} {g.total.posts === 1 ? 'post' : 'posts'}
                </span>
                <span className="ml-auto text-[12px] tabular-nums text-ink-600">
                  {fmt(gv)} <span className="text-ink-400">{metric.label.toLowerCase()}</span>
                </span>
                <FiChevronDown
                  size={15}
                  className={`flex-none text-ink-400 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
                  aria-hidden="true"
                />
              </button>
            )}
            {open && (
              <ul className={`divide-y divide-ink-100 ${grouped ? 'border-t border-ink-100' : ''}`}>
                {g.rows.map((r) => {
                  const v = metricOf(metric, r, perPost)
                  const prev = metric.prev ? (perPost && metric.avg ? perPostOf(r[metric.prev], r.prevPosts) : r[metric.prev]) : undefined
                  return (
                    <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 sm:flex-nowrap">
                      <span className="w-6 flex-none text-center text-[12px] font-bold tabular-nums text-ink-400">
                        {rank.get(r.key) ? `#${rank.get(r.key)}` : ''}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:max-w-[240px]">
                        <span className="relative grid h-8 w-8 flex-none place-items-center rounded-full bg-ink-100 text-[11.5px] font-bold text-ink-600">
                          {(r.brand || '?').slice(0, 1).toUpperCase()}
                          <span
                            className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-white"
                            style={{ background: hue, color: r.platform === 'tiktok' ? 'rgb(var(--surface))' : '#fff' }}
                            title={labels[r.platform] || r.platform}
                          >
                            <Icon size={9} aria-hidden="true" />
                          </span>
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-ink-900">{r.brand}</div>
                          <div className="truncate text-[11.5px] text-ink-500">{r.handle || labels[r.platform] || r.platform}</div>
                        </div>
                      </div>

                      {r.posts ? (
                        <>
                          {/* bar against the leader */}
                          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[14px] font-semibold tabular-nums text-ink-900">{fmt(v)}</span>
                              <span className="text-[11.5px]">
                                {metric.prev && v != null ? <DeltaText current={v} previous={prev} format={fmt} /> : null}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{ width: `${max > 0 && v ? Math.max(3, (v / max) * 100) : 0}%`, background: hue }}
                              />
                            </div>
                          </div>
                          <div className="hidden flex-none items-center gap-3 text-[11.5px] tabular-nums text-ink-500 md:flex">
                            {[
                              [FiHeart, 'likes', 'Reactions'],
                              [FiMessageCircle, 'comments', 'Comments'],
                              [FiCornerUpRight, 'shares', 'Shares'],
                            ].map(([I, k, label]) => {
                              const n = r.reported ? (perPost ? perPostOf(r[k], r.posts) : r[k]) : null
                              return (
                                <span key={k} className={`inline-flex items-center gap-1 ${n ? '' : 'text-ink-300'}`} title={label}>
                                  <I size={12} aria-hidden="true" />
                                  {perPost ? fmtAvg(n) : fmtNum(n)}
                                </span>
                              )
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => onPosts?.(r)}
                            className="flex-none rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 hover:border-brand-line hover:text-brand"
                            title="See these posts below"
                          >
                            {r.posts} {r.posts === 1 ? 'post' : 'posts'} →
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-between gap-3 text-[12px] text-ink-400">
                          <span>Nothing posted in this period</span>
                          {onPlan && (
                            <button type="button" onClick={() => onPlan(r)} className="font-semibold text-brand hover:underline">
                              Plan a post
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
