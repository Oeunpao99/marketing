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
import { FiArrowDownRight, FiArrowUpRight, FiExternalLink, FiGrid, FiImage } from 'react-icons/fi'

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
export function DeltaText({ current, previous, className = '' }) {
  if (previous == null || current == null) return <span className={`text-ink-400 ${className}`}>—</span>
  const d = current - previous
  if (d === 0) return <span className={`text-ink-400 ${className}`}>±0</span>
  const up = d > 0
  const Arrow = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${up ? 'text-[#006300]' : 'text-red-600'} ${className}`}>
      <Arrow size={12} aria-hidden="true" />
      {up ? '+' : '−'}
      {fmtNum(Math.abs(d))}
    </span>
  )
}

function Tip({ x, y, children }) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg"
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
              {src && u.media_kind === 'image' ? (
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
        <circle cx={c} cy={c} r={r} fill="none" stroke="#e1e0d9" strokeWidth={stroke} />
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

// ── Channels table (also the table view for every chart above) ────────────
const SORTS = [
  { id: 'engagement', label: 'Engagement' },
  { id: 'posts', label: 'Posts' },
  { id: 'views', label: 'Views' },
]

export function ChannelsTable({ rows, icons, labels, onFilter }) {
  const [sort, setSort] = useState('engagement')
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1)), [rows, sort])
  if (!rows.length) {
    return <div className="px-5 py-8 text-center text-[12.5px] text-ink-400">No published posts in this period.</div>
  }
  const th = 'px-3 py-2.5 text-[11.5px] font-medium text-ink-500' // alignment set per column
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead className="bg-ink-50/70">
          <tr>
            <th className={`${th} pl-5 text-left`}>Channel</th>
            <th className={`${th} text-left`}>Engagement trend</th>
            {SORTS.map((s) => (
              <th key={s.id} className={`${th} text-right`} aria-sort={sort === s.id ? 'descending' : 'none'}>
                <button
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={`rounded-md px-1.5 py-0.5 ${sort === s.id ? 'bg-ink-100 font-semibold text-ink-800' : 'hover:text-ink-800'}`}
                >
                  {s.label}
                </button>
              </th>
            ))}
            <th className={`${th} text-right`}>Eng. rate</th>
            <th className={`${th} pr-5`} aria-label="Open" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {sorted.map((r) => {
            const Icon = icons[r.platform] || FiGrid
            return (
              <tr key={r.key} className="hover:bg-ink-50/50">
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-center gap-3">
                    <span className="relative grid h-9 w-9 flex-none place-items-center rounded-full bg-ink-100 text-[12px] font-bold text-ink-600">
                      {(r.brand || '?').slice(0, 1).toUpperCase()}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full text-white ring-2 ring-white"
                        style={{ background: platformHue(r.platform) }}
                      >
                        <Icon size={9} aria-hidden="true" />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-900">{r.brand}</div>
                      <div className="truncate text-[11.5px] text-ink-500">
                        {labels[r.platform] || r.platform}
                        {r.handle ? ` · ${r.handle}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <TrendLine values={r.trend} width={110} height={30} color={platformHue(r.platform)} />
                </td>
                <NumCell value={r.engagement} prev={r.prevEngagement} reported={r.reported} />
                <NumCell value={r.posts} prev={r.prevPosts} reported />
                <NumCell value={r.views} prev={r.prevViews} reported={r.views != null} />
                <td className="px-3 py-3 text-right tabular-nums text-ink-700">{r.rate == null ? '—' : `${r.rate.toFixed(1)}%`}</td>
                <td className="py-3 pl-3 pr-5 text-right">
                  <button
                    type="button"
                    onClick={() => onFilter(r)}
                    className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                    title={`Show only ${r.brand} posts`}
                  >
                    <FiExternalLink size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NumCell({ value, prev, reported }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums">
      {reported ? (
        <>
          <div className="font-semibold text-ink-900">{fmtNum(value)}</div>
          <div className="text-[11.5px]">
            <DeltaText current={value} previous={prev} />
          </div>
        </>
      ) : (
        <span className="text-[11.5px] text-ink-400" title="This platform doesn't report this number to apps">
          not reported
        </span>
      )}
    </td>
  )
}
