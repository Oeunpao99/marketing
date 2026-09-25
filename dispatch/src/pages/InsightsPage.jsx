import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildFunnel, buildInsights } from '../lib/insightsEngine'
import Pager from '../components/ui/Pager'
import {
  ActionCards,
  bucket,
  cardCls,
  Chips,
  Funnel,
  InsightCards,
  PlatformBars,
  StatTile,
  TabBar,
  TopContentGrid,
  WeekCompare,
} from '../components/insights/Tabs'
import { FaLinkedin } from 'react-icons/fa'
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from 'react-icons/si'
import { FiChevronDown, FiDownload, FiEye, FiFileText, FiGrid, FiHeart, FiImage, FiMessageCircle, FiPlay, FiRefreshCw, FiShare2 } from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'
import {
  ChannelsTable,
  DeltaText,
  Donut,
  Figure,
  fmtNum,
  PlatformLegend,
  TrendLine,
  UpNext,
  WeekColumns,
} from '../components/insights/Overview'

// Fixed platform order for the donuts/legend (matches Overview.jsx's colour slots).
const PLATFORM_SLUG_ORDER = ['facebook', 'instagram', 'tiktok', 'linkedin', 'telegram', 'youtube']
const PER_PAGE = 10 // "All published posts" rows per page
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'content', label: 'Content' },
  { id: 'insights', label: 'Insights & Actions' },
]
const PERF_METRICS = [
  { id: 'engagement', label: 'Engagement' },
  { id: 'views', label: 'Views' },
  { id: 'posts', label: 'Posts' },
]

export const PLATFORM_ICONS = {
  facebook: SiFacebook,
  instagram: SiInstagram,
  linkedin: FaLinkedin,
  telegram: SiTelegram,
  tiktok: SiTiktok,
  youtube: SiYoutube,
}

export const PLATFORM_COLORS = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  telegram: '#26A5E4',
  tiktok: '#000000',
  youtube: '#FF0000',
}

const DATE_RANGES = [
  { id: '7', short: '7d', label: 'the last 7 days', days: 7 },
  { id: '30', short: '30d', label: 'the last 30 days', days: 30 },
  { id: '90', short: '90d', label: 'the last 90 days', days: 90 },
  { id: 'all', short: 'All', label: 'all time', days: null },
]

// views/posts are only ever drawn alone (Performance tab metric chips), so they reuse the accent.
export const SERIES_COLORS = { likes: '#1B75BB', comments: '#F08A5D', shares: '#86A41E', views: '#2a78d6', posts: '#2a78d6' }

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const fmtCompact = (n) => (n == null ? '—' : n >= 1000 ? compact.format(n) : n.toLocaleString())

function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Every calendar day in [start, end], as dayKey strings — so a day with no
 * posts still shows up as a zero instead of the line skipping over it. */
function daysBetween(start, end) {
  const out = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const last = new Date(end)
  last.setHours(0, 0, 0, 0)
  while (d <= last && out.length < 400) {
    out.push(dayKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu

const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', telegram: 'Telegram', tiktok: 'TikTok', youtube: 'YouTube' }

const isKhmerText = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s || '')

/** An expired/invalid token or a disconnected account — a per-platform
 * problem, not a per-post one, so it gets one banner instead of N row notes. */
function isConnectionProblem(it) {
  return /token|access|auth|reconnect|expired|permission/i.test(it.note || '')
}

function hashtagsOf(text) {
  return [...new Set((text || '').match(HASHTAG_RE) || [])]
}

export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function mediaSrc(url) {
  if (!url) return null
  const base = window.location.port === '5173' ? 'http://localhost:8000' : ''
  return `${base}${url}`
}

/** engagement = the sum of whatever counts we actually have for that platform. */
export function engagementOf(metrics) {
  const { likes = 0, comments = 0, shares = 0 } = metrics || {}
  return likes + comments + shares
}

export function viewsOf(metrics) {
  const m = metrics || {}
  return m.views != null ? m.views : m.subscribers != null ? m.subscribers : null
}

/** Per-day buckets (posts, likes, comments, shares, engagement, views,
 *  clicks, engagement rate) for a set of posts over `days` — shared by the
 *  page-wide charts and the Performance tab's per-platform chart. */
function dailyOf(rows, days) {
  const idx = new Map(days.map((d, i) => [d, i]))
  const z = () => days.map(() => 0)
  const out = { views: z(), engagement: z(), likes: z(), comments: z(), shares: z(), clicks: z(), posts: z(), rateV: z(), rateE: z() }
  for (const it of rows) {
    if (!it.published_at) continue
    const i = idx.get(dayKey(it.published_at))
    if (i == null) continue
    out.posts[i] += 1
    if (it.status !== 'ok' && it.status !== 'partial') continue
    const m = it.metrics || {}
    out.likes[i] += m.likes || 0
    out.comments[i] += m.comments || 0
    out.shares[i] += m.shares || 0
    out.clicks[i] += m.clicks || 0
    out.engagement[i] += engagementOf(m)
    if (m.views != null) {
      out.views[i] += m.views
      out.rateV[i] += m.views
      out.rateE[i] += engagementOf(m)
    }
  }
  out.rate = out.rateV.map((v, i) => (v > 0 ? (out.rateE[i] / v) * 100 : 0))
  return out
}

function toCsv(rows) {
  const header = ['Date', 'Brand', 'Platform', 'Type', 'Caption', 'Views', 'Likes', 'Comments', 'Shares', 'Status']
  const lines = [header.join(',')]
  for (const r of rows) {
    const m = r.metrics || {}
    const cells = [
      r.published_at || '',
      r.brand_name || '',
      r.platform_slug || '',
      r.media_kind || '',
      (r.caption || r.title || '').replace(/"/g, '""'),
      m.views ?? '',
      m.likes ?? '',
      m.comments ?? '',
      m.shares ?? '',
      r.status,
    ]
    lines.push(cells.map((c) => `"${c}"`).join(','))
  }
  return lines.join('\n')
}

function ChartCard({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  )
}

function StatusChip({ resolved, note }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-ink-700"
      title={resolved ? '' : note || ''}
    >
      <span className={`h-2 w-2 rounded-full flex-none ${resolved ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      {resolved ? 'Live' : 'Needs attention'}
    </span>
  )
}

/** Top of a 4-gridline axis (0, ¼, ½, ¾, top): picks a clean step first —
 *  1, 2, 5, 10, 20, 50… — so every tick is a whole, round number (0/1/2/3/4,
 *  0/5/10/15/20) — never 0/1.3/2.5/3.8/5. */
export function axisMax(n) {
  const raw = Math.max(1, n / 4)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  return step * 4
}

/** Smooth line through the points using monotone cubic interpolation
 *  (Fritsch–Carlson): curved, but it never overshoots the data — a spike from
 *  0 to 1 and back can't dip below zero or bulge above the peak, which the
 *  old Catmull-Rom-style curve did. */
function smoothPath(pts) {
  const n = pts.length
  if (!n) return ''
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  const dx = [], slope = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x)
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1))
  }
  // tangent at each point: 0 at local extremes/flats, harmonic mean elsewhere
  const m = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1], b = slope[i]
    m.push(a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b))
  }
  m.push(slope[n - 2])
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${pts[i].x + h} ${pts[i].y + m[i] * h} ${pts[i + 1].x - h} ${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

/** Axis tick label: whole numbers stay whole; fractional steps get one decimal
 *  so a 0–1 axis reads 0 / 0.25 / 0.5 … instead of 0, 0, 1, 1, 1. */
function tickLabel(v) {
  return Number.isInteger(v) ? fmtCompact(v) : v.toFixed(v < 1 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '')
}

export function EngagementLineChart({ series, activeTargetId, brandColor, height = 340 }) {
  const wrapRef = useRef(null)
  const gradId = useId().replace(/[:]/g, '')
  const [w, setW] = useState(760)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setW(Math.max(320, el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!series || series.length === 0) {
    return (
      <div ref={wrapRef} className="py-16 text-center text-[11px] text-ink-400">
        No engagement data to chart yet.
      </div>
    )
  }

  const H = height
  const PAD = { top: 28, right: 26, bottom: 40, left: 56 }
  const innerW = Math.max(10, w - PAD.left - PAD.right)
  const innerH = H - PAD.top - PAD.bottom

  // Floor of 4 so small counts get distinct whole-number ticks (0,1,2,3,4)
  // instead of rounding to "0, 0, 1, 1, 1".
  const maxY = axisMax(Math.max(...series.map((s) => s.y), 1))

  const xf = (i) => PAD.left + (series.length > 1 ? (i / (series.length - 1)) * innerW : innerW / 2)
  const yf = (v) => PAD.top + innerH - (v / maxY) * innerH

  const pts = series.map((s, i) => ({ x: xf(i), y: yf(s.y), s, i }))
  const linePath = smoothPath(pts)
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${PAD.top + innerH} L ${pts[0].x} ${PAD.top + innerH} Z`

  const grid = [0, 0.25, 0.5, 0.75, 1]
  const labelStep = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 110))))

  const activeIdx = series.findIndex((s) => s.id === activeTargetId)
  const focusIdx = hover != null ? hover : activeIdx
  const focus = focusIdx >= 0 ? pts[focusIdx] : null

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (w / rect.width)
    let best = 0
    let bestD = Infinity
    for (const p of pts) {
      const dd = Math.abs(p.x - px)
      if (dd < bestD) {
        bestD = dd
        best = p.i
      }
    }
    setHover(best)
  }

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Engagement over time"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brandColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={brandColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map((g) => {
          const gy = PAD.top + innerH - g * innerH
          return (
            <g key={g}>
              <line x1={PAD.left} x2={w - PAD.right} y1={gy + 0.5} y2={gy + 0.5} stroke={g === 0 ? '#c3c2b7' : '#EDEFF2'} strokeWidth="1" />
              <text x={PAD.left - 10} y={gy + 3.5} textAnchor="end" fontSize="10.5" fill="#9AA2AD">
                {Math.round(maxY * g).toLocaleString()}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill={`url(#fill-${gradId})`} />
        <path d={linePath} fill="none" stroke={brandColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {pts.map((p) => {
          const active = p.i === activeIdx
          return (
            <circle
              key={p.s.id}
              cx={p.x}
              cy={p.y}
              r={active ? 4.5 : 2.5}
              fill="#fff"
              stroke={active ? brandColor : '#B6BCC5'}
              strokeWidth={active ? 2.5 : 1.5}
            />
          )
        })}

        {focus && (
          <g pointerEvents="none">
            <line x1={focus.x} x2={focus.x} y1={PAD.top} y2={PAD.top + innerH} stroke={brandColor} strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
            <circle cx={focus.x} cy={focus.y} r="8" fill={brandColor} opacity="0.18" />
            <circle cx={focus.x} cy={focus.y} r="4.5" fill={brandColor} />
            {(() => {
              const tipW = 116
              const tx = Math.min(Math.max(focus.x - tipW / 2, PAD.left), w - PAD.right - tipW)
              const ty = Math.max(focus.y - 52, 4)
              return (
                <g>
                  <rect x={tx} y={ty} width={tipW} height={40} rx="10" fill="#111827" opacity="0.95" />
                  <text x={tx + 12} y={ty + 16} fontSize="11" fontWeight="700" fill="#fff">
                    {focus.s.y.toLocaleString()} engagement
                  </text>
                  <text x={tx + 12} y={ty + 31} fontSize="10" fill="#9CA3AF">
                    {new Date(focus.s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </text>
                </g>
              )
            })()}
          </g>
        )}

        {series.map((s, i) => {
          const text = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          const prevText =
            i > 0 ? new Date(series[i - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
          // Several posts on one day would otherwise print the same date repeatedly.
          return (i % labelStep === 0 || i === series.length - 1) && text !== prevText ? (
            <text
              key={s.id}
              x={xf(i)}
              y={H - 12}
              fontSize="10.5"
              fill="#9AA2AD"
              textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
            >
              {text}
            </text>
          ) : null
        })}
      </svg>
    </div>
  )
}

/** Horizontal bars, one per platform actually posted to in this view —
 * total engagement (likes+comments+shares), not a fabricated "reach" number
 * the platform APIs this app pulls from don't expose. */
/** Likes / comments / shares as separate smooth lines, one point per day —
 * the three engagement numbers every platform integration here actually
 * returns (no "saves" — none of the APIs expose it). */
function MultiLineChart({ days, series, height = 330 }) {
  const wrapRef = useRef(null)
  const [w, setW] = useState(720)
  const [hover, setHover] = useState(null)
  const idBase = useId().replace(/[:]/g, '')

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setW(Math.max(320, el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const keys = Object.keys(series)
  const total = keys.reduce((a, k) => a + series[k].reduce((x, y) => x + y, 0), 0)
  if (!days.length || total === 0) {
    return (
      <div ref={wrapRef} className="h-[280px] grid place-items-center text-[12px] text-ink-400">
        Nothing recorded in this period yet.
      </div>
    )
  }

  const PAD = { top: 12, right: 12, bottom: 34, left: 48 }
  const innerW = w - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  // Floor of 4 so small counts get whole-number ticks (0,1,2,3,4).
  const maxY = axisMax(Math.max(...keys.flatMap((k) => series[k]), 1))
  const xf = (i) => PAD.left + (days.length > 1 ? (i / (days.length - 1)) * innerW : innerW / 2)
  const yf = (v) => PAD.top + innerH - (v / maxY) * innerH
  const grid = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 90))))

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (w / rect.width)
    const i = Math.round(((px - PAD.left) / innerW) * (days.length - 1))
    setHover(Math.min(days.length - 1, Math.max(0, i)))
  }

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Engagement over time by likes, comments and shares"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {keys.map((k) => (
            <linearGradient key={k} id={`${idBase}-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[k]} stopOpacity="0.12" />
              <stop offset="100%" stopColor={SERIES_COLORS[k]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {grid.map((g) => {
          const gy = PAD.top + innerH - g * innerH
          return (
            <g key={g}>
              <line x1={PAD.left} x2={w - PAD.right} y1={gy + 0.5} y2={gy + 0.5} stroke={g === 0 ? '#c3c2b7' : '#EDEFF2'} strokeWidth="1" />
              <text x={PAD.left - 10} y={gy + 4} textAnchor="end" fontSize="12" fill="#898781">
                {tickLabel(maxY * g)}
              </text>
            </g>
          )
        })}
        {keys.map((k) => {
          const pts = series[k].map((v, i) => ({ x: xf(i), y: yf(v) }))
          const line = smoothPath(pts)
          const area = `${line} L ${pts[pts.length - 1].x} ${PAD.top + innerH} L ${pts[0].x} ${PAD.top + innerH} Z`
          return (
            <g key={k}>
              <path d={area} fill={`url(#${idBase}-${k})`} />
              <path d={line} fill="none" stroke={SERIES_COLORS[k]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <text
              key={d}
              x={xf(i)}
              y={height - 10}
              fontSize="12"
              fill="#6B7683"
              textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            >
              {new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          ) : null,
        )}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={xf(hover)} x2={xf(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#94A3B8" strokeDasharray="3 4" />
            {keys.map((k) => (
              <circle key={k} cx={xf(hover)} cy={yf(series[k][hover])} r="4" fill="#fff" stroke={SERIES_COLORS[k]} strokeWidth="2" />
            ))}
            {(() => {
              const tipW = 132
              const tipH = 22 + keys.length * 17
              const tx = Math.min(Math.max(xf(hover) + 12, PAD.left), w - PAD.right - tipW)
              return (
                <g>
                  <rect x={tx} y={PAD.top} width={tipW} height={tipH} rx="8" fill="#111827" opacity="0.94" />
                  <text x={tx + 10} y={PAD.top + 16} fontSize="11" fontWeight="700" fill="#fff">
                    {new Date(`${days[hover]}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                  {keys.map((k, j) => (
                    <text key={k} x={tx + 10} y={PAD.top + 34 + j * 17} fontSize="11" fill="#D1D5DB">
                      <tspan fill={SERIES_COLORS[k]}>●</tspan> {k}: {series[k][hover].toLocaleString()}
                    </text>
                  ))}
                </g>
              )
            })()}
          </g>
        )}
      </svg>
      <div className="flex items-center justify-center gap-4 mt-1">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[12px] capitalize text-ink-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES_COLORS[k] }} aria-hidden="true" />
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Average engagement per post, split by what was attached (image / video /
 * text-only) — which kind of post actually lands for this audience. */
function ContentTypeChart({ rows, height = 260 }) {
  if (!rows.length) {
    return (
      <div className="h-[220px] grid place-items-center text-[12px] text-ink-400">
        No published posts in this period yet.
      </div>
    )
  }
  // Floor of 4 so small averages still get readable, distinct ticks.
  const maxY = axisMax(Math.max(...rows.map((r) => r.avg), 1))
  const grid = [0, 0.25, 0.5, 0.75, 1]
  const LABEL = { image: 'Image', video: 'Video', text: 'Text only' }
  return (
    <div className="flex" style={{ height }}>
      <div className="flex flex-col justify-between pr-3 pb-7 text-[11px] text-ink-500 tabular-nums text-right w-10">
        {[...grid].reverse().map((g) => (
          <span key={g}>{tickLabel(maxY * g)}</span>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-x-0 top-[7px] bottom-[34px] flex flex-col justify-between pointer-events-none">
          {grid.map((g) => (
            <span key={g} className={`border-t ${g === 0 ? 'border-[#c3c2b7]' : 'border-[#EDEFF2]'}`} />
          ))}
        </div>
        <div className="absolute inset-x-0 top-[7px] bottom-[34px] flex items-end justify-around px-4">
          {rows.map((r) => (
            <div key={r.kind} className="flex flex-col items-center justify-end h-full" title={`${r.count} posts · ${r.avg.toFixed(1)} avg. engagement`}>
              <span className="text-[11px] font-semibold text-ink-700 mb-1 tabular-nums">{tickLabel(Math.round(r.avg * 10) / 10)}</span>
              <div
                className="w-6 rounded-t-[4px] transition-all duration-500"
                style={{ height: `${Math.max(2, (r.avg / maxY) * 100)}%`, background: '#2a78d6' }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[28px] flex items-center justify-around px-4">
          {rows.map((r) => (
            <span key={r.kind} className="text-[11.5px] text-ink-600 w-20 text-center">
              {LABEL[r.kind] || r.kind} <span className="text-ink-400">· {r.count}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function InsightsPage() {
  const { brands, showToast } = useStore()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [rangeId, setRangeId] = useState('30')
  const [loading, setLoading] = useState(false)

  const [publishing, setPublishing] = useState(null)

  const load = () => {
    setLoading(true)
    const brand = brands.find((b) => b.slug === brandFilter)
    const qs = brand ? `?brand_id=${brand.id}&limit=100` : '?limit=100'
    api
      .get(`/views/insights${qs}`)
      .then(setItems)
      .catch((e) => showToast(`Could not load insights — ${e.message}`))
      .finally(() => setLoading(false))
    api
      .get(`/views/publishing${brand ? `?brand_id=${brand.id}` : ''}`)
      .then(setPublishing)
      .catch(() => setPublishing({ days: [], upcoming: [], today: '' }))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, brands.length])

  const range = DATE_RANGES.find((r) => r.id === rangeId) || DATE_RANGES[1]
  const cutoff = range.days ? Date.now() - range.days * 86400000 : null

  const allTags = useMemo(() => {
    const set = new Set()
    for (const it of items || []) for (const tag of hashtagsOf(it.caption || it.title)) set.add(tag)
    return [...set].sort()
  }, [items])

  const filtered = useMemo(() => {
    return (items || []).filter((it) => {
      if (cutoff && it.published_at && new Date(it.published_at).getTime() < cutoff) return false
      if (typeFilter !== 'all' && it.media_kind !== typeFilter) return false
      if (tagFilter !== 'all' && !hashtagsOf(it.caption || it.title).includes(tagFilter)) return false
      return true
    })
  }, [items, cutoff, typeFilter, tagFilter])

  const isResolved = (it) => it.status === 'ok' || it.status === 'partial'

  // Same type/tag filters applied to the equal-length window right before
  // this one — what every "vs last period" delta compares against.
  const previous = useMemo(() => {
    if (!range.days) return null
    const start = cutoff - range.days * 86400000
    return (items || []).filter((it) => {
      const t = it.published_at ? new Date(it.published_at).getTime() : null
      if (t == null || t < start || t >= cutoff) return false
      if (typeFilter !== 'all' && it.media_kind !== typeFilter) return false
      if (tagFilter !== 'all' && !hashtagsOf(it.caption || it.title).includes(tagFilter)) return false
      return true
    })
  }, [items, range.days, cutoff, typeFilter, tagFilter])

  const totalsOf = (rows) => {
    let views = 0
    let viewsForRate = 0
    let engagementForRate = 0
    let likes = 0
    let comments = 0
    let shares = 0
    for (const it of rows) {
      if (!isResolved(it)) continue
      const m = it.metrics || {}
      const e = engagementOf(m)
      likes += m.likes || 0
      comments += m.comments || 0
      shares += m.shares || 0
      if (m.views != null) {
        views += m.views
        viewsForRate += m.views
        engagementForRate += e
      }
    }
    return {
      views,
      engagement: likes + comments + shares,
      rate: viewsForRate > 0 ? (engagementForRate / viewsForRate) * 100 : null,
      likes,
      comments,
      shares,
      posts: rows.length,
    }
  }

  const cur = useMemo(() => totalsOf(filtered), [filtered])
  const prev = useMemo(() => (previous ? totalsOf(previous) : null), [previous])

  const days = useMemo(() => {
    if (range.days) return daysBetween(cutoff, Date.now())
    const dates = filtered.filter((it) => it.published_at).map((it) => new Date(it.published_at).getTime())
    if (!dates.length) return []
    return daysBetween(Math.min(...dates), Math.max(...dates, Date.now()))
  }, [filtered, range.days, cutoff])

  // Per-day buckets for every chart + sparkline on the page.
  const daily = useMemo(() => dailyOf(filtered, days), [filtered, days])

  // Sparklines read better as a running total than a spiky day-by-day line.
  const cumulative = (arr) => {
    let s = 0
    return arr.map((v) => (s += v))
  }

  const contentTypes = useMemo(() => {
    const map = new Map()
    for (const it of filtered) {
      if (!isResolved(it)) continue
      const kind = it.media_kind || 'text'
      const r = map.get(kind) || { kind, total: 0, count: 0 }
      r.total += engagementOf(it.metrics)
      r.count += 1
      map.set(kind, r)
    }
    return [...map.values()].map((r) => ({ ...r, avg: r.total / r.count }))
  }, [filtered])

  const topPosts = useMemo(
    () =>
      filtered
        .filter(isResolved)
        // Only posts the platform actually reports numbers for — a LinkedIn
        // personal post (or Telegram) would otherwise rank as "top" with 0.
        .filter((p) => ['views', 'likes', 'comments', 'shares'].some((k) => (p.metrics || {})[k] != null))
        .slice()
        .sort((a, b) => engagementOf(b.metrics) - engagementOf(a.metrics))
        .slice(0, 8),
    [filtered],
  )

  // "All published posts": 10 per page; any filter/range change starts over at 1.
  const [page, setPage] = useState(0)
  const tableRef = useRef(null)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  // Keyed on the filter inputs, not `filtered` — that array is rebuilt every
  // render (the date cutoff is "now"), which would snap back to page 1 constantly.
  useEffect(() => setPage(0), [items, rangeId, brandFilter, typeFilter, tagFilter])
  const pageRows = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const goToPage = (p) => {
    setPage(Math.min(Math.max(0, p), pageCount - 1))
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const exportCsv = () => {
    if (!filtered.length) return
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${range.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const connectionProblems = useMemo(() => {
    const map = new Map()
    for (const it of filtered) {
      if (isResolved(it) || !isConnectionProblem(it)) continue
      map.set(it.platform_slug, (map.get(it.platform_slug) || 0) + 1)
    }
    return [...map.entries()].map(([slug, count]) => ({ slug, count }))
  }, [filtered])

  // Per-platform share of engagement / views for the two donuts — fixed
  // platform order so a platform keeps its place and colour under any filter.
  const platformSplit = useMemo(() => {
    const out = {}
    for (const it of filtered) {
      if (!isResolved(it) || !it.platform_slug) continue
      const m = it.metrics || {}
      const r = (out[it.platform_slug] ||= { engagement: 0, views: 0 })
      r.engagement += engagementOf(m)
      r.views += m.views || 0
    }
    const seg = (key) =>
      PLATFORM_SLUG_ORDER.filter((s) => out[s]).map((s) => ({ slug: s, label: PLATFORM_LABELS[s] || s, value: out[s][key] }))
    return { engagement: seg('engagement'), views: seg('views'), slugs: PLATFORM_SLUG_ORDER.filter((s) => out[s]) }
  }, [filtered])

  // One row per channel (brand × platform account) with this period vs the
  // previous one, and a daily engagement trend line.
  const channelRows = useMemo(() => {
    const keyOf = (it) => it.channel_id ?? `${it.brand_slug}:${it.platform_slug}`
    const idx = new Map(days.map((d, i) => [d, i]))
    const map = new Map()
    const rowFor = (it) => {
      const k = keyOf(it)
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          brand: it.brand_name,
          brandSlug: it.brand_slug,
          platform: it.platform_slug,
          handle: it.channel_handle && it.channel_handle !== it.brand_name ? it.channel_handle : '',
          posts: 0, engagement: 0, views: null, reported: false, rateV: 0, rateE: 0,
          prevPosts: previous ? 0 : null, prevEngagement: previous ? 0 : null, prevViews: previous ? 0 : null,
          trend: days.map(() => 0),
        })
      }
      return map.get(k)
    }
    for (const it of filtered) {
      const r = rowFor(it)
      r.posts += 1
      if (!isResolved(it)) continue
      const m = it.metrics || {}
      const e = engagementOf(m)
      if (['likes', 'comments', 'shares'].some((k) => m[k] != null)) r.reported = true
      r.engagement += e
      if (m.views != null) {
        r.views = (r.views || 0) + m.views
        r.rateV += m.views
        r.rateE += e
      }
      const i = it.published_at ? idx.get(dayKey(it.published_at)) : null
      if (i != null) r.trend[i] += e
    }
    for (const it of previous || []) {
      const r = map.get(keyOf(it))
      if (!r) continue
      r.prevPosts += 1
      if (!isResolved(it)) continue
      r.prevEngagement += engagementOf(it.metrics)
      r.prevViews += (it.metrics || {}).views || 0
    }
    return [...map.values()].map((r) => ({
      ...r,
      rate: r.rateV > 0 ? (r.rateE / r.rateV) * 100 : null,
      trend: cumulative(r.trend),
      prevViews: r.views == null ? null : r.prevViews,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, previous, days])

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
  const setTab = (id) => setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })

  const sumOf = (rows, key) =>
    rows.reduce((s, it) => s + (isResolved(it) ? (it.metrics || {})[key] || 0 : 0), 0)
  const reports = (rows, key) => rows.some((it) => (it.metrics || {})[key] != null)

  // Performance tab: one metric at a time (never two scales on one axis),
  // optionally for a single platform.
  const [perfMetric, setPerfMetric] = useState('engagement')
  const [perfPlatform, setPerfPlatform] = useState('all')
  const perfDaily = useMemo(
    () => dailyOf(perfPlatform === 'all' ? filtered : filtered.filter((it) => it.platform_slug === perfPlatform), days),
    [filtered, days, perfPlatform],
  )

  // Past three weeks a day-by-day line is mostly zeros between posts, so
  // the Performance chart sums each week instead (one point per week).
  const perfChart = useMemo(() => {
    const pick =
      perfMetric === 'engagement'
        ? { likes: perfDaily.likes, comments: perfDaily.comments, shares: perfDaily.shares }
        : { [perfMetric]: perfDaily[perfMetric] }
    if (days.length <= 21) return { days, series: pick, unit: 'day' }
    const starts = []
    for (let i = 0; i < days.length; i += 7) starts.push(i)
    const sum = (arr) => starts.map((i) => arr.slice(i, i + 7).reduce((a, b) => a + b, 0))
    return {
      days: starts.map((i) => days[i]),
      series: Object.fromEntries(Object.entries(pick).map(([k, arr]) => [k, sum(arr)])),
      unit: 'week',
    }
  }, [perfDaily, perfMetric, days])

  const platformRows = useMemo(() => {
    const map = new Map()
    for (const it of filtered) {
      const r = map.get(it.platform_slug) || { slug: it.platform_slug, label: PLATFORM_LABELS[it.platform_slug] || it.platform_slug, posts: 0, engagement: 0, views: null, clicks: null, reported: false, rv: 0, re: 0 }
      r.posts += 1
      map.set(it.platform_slug, r)
      if (!isResolved(it)) continue
      const m = it.metrics || {}
      const e = engagementOf(m)
      if (['likes', 'comments', 'shares'].some((k) => m[k] != null)) r.reported = true
      r.engagement += e
      if (m.views != null) {
        r.views = (r.views || 0) + m.views
        r.rv += m.views
        r.re += e
      }
      if (m.clicks != null) r.clicks = (r.clicks || 0) + m.clicks
    }
    return [...map.values()]
      .map((r) => ({ ...r, rate: r.rv > 0 ? (r.re / r.rv) * 100 : null }))
      .sort((a, b) => b.engagement - a.engagement || b.posts - a.posts)
  }, [filtered])

  // Insights & Actions — computed from these posts only (src/lib/insightsEngine.js).
  const insightList = useMemo(() => buildInsights(filtered, { engagementOf, platformLabels: PLATFORM_LABELS }), [filtered])
  const funnel = useMemo(() => buildFunnel(filtered, { engagementOf }), [filtered])
  const actions = useMemo(() => {
    const fromInsights = insightList.map((i) => ({ id: i.id, title: i.action.title, why: i.title + '.', label: i.action.label, to: i.action.to }))
    const fallback = [
      { id: 'create', title: 'Keep the calendar full', why: 'Plan the next few days of posts so no day goes quiet.', label: 'Create a post', to: '/new' },
      { id: 'auto', title: 'Let AI suggest ideas daily', why: 'Auto-generate writes fresh post ideas for you to approve every morning.', label: 'Set up Auto-generate', to: '/auto' },
      { id: 'channels', title: 'Reach more people', why: 'Connect another platform so each post travels further.', label: 'Add a channel', to: '/channels/add' },
    ]
    const seen = new Set()
    return [...fromInsights, ...fallback].filter((a) => !seen.has(a.to + a.label) && seen.add(a.to + a.label)).slice(0, 3)
  }, [insightList])

  // Last 7 days vs the 7 before — independent of the range buttons.
  const week = useMemo(() => {
    const now = Date.now()
    const inWin = (it, from, to) => {
      const t = it.published_at ? new Date(it.published_at).getTime() : null
      return t != null && t >= now - from * 86400000 && t < now - to * 86400000
    }
    const a = (items || []).filter((it) => inWin(it, 7, 0))
    const b = (items || []).filter((it) => inWin(it, 14, 7))
    const eng = (rows) => rows.reduce((s, it) => s + (isResolved(it) ? engagementOf(it.metrics) : 0), 0)
    return [
      { label: 'Posts published', value: a.length, previous: b.length },
      { label: 'Views', value: reports(a, 'views') ? sumOf(a, 'views') : null, previous: sumOf(b, 'views') },
      { label: 'Engagement', value: eng(a), previous: eng(b) },
      { label: 'Comments', value: sumOf(a, 'comments'), previous: sumOf(b, 'comments') },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const clicksNow = reports(filtered, 'clicks') ? sumOf(filtered, 'clicks') : null

  return (
    <div className="w-full px-5 lg:px-8 pt-7 pb-28 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-600">
            Cross-platform performance overview for {range.label}.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-ink-200 bg-white p-0.5" role="tablist" aria-label="Date range">
          {DATE_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={rangeId === r.id}
              onClick={() => setRangeId(r.id)}
              className={`px-3.5 py-1.5 rounded-[10px] text-[13px] font-medium transition-colors duration-150 ${
                rangeId === r.id ? 'bg-brand-soft text-brand' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {r.short}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Dropdown value={brandFilter} onChange={setBrandFilter} label="Brand">
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.slug}>{b.name}</option>
          ))}
        </Dropdown>
        <Dropdown value={typeFilter} onChange={setTypeFilter} label="Post type">
          <option value="all">All post types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </Dropdown>
        <Dropdown value={tagFilter} onChange={setTagFilter} label="Hashtag">
          <option value="all">All hashtags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Dropdown>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="btn-outline">
            <FiDownload size={15} /> Export
          </button>
          <button type="button" onClick={load} disabled={loading} className="btn-outline">
            <FiRefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* One banner per platform whose connection is broken, instead of the
          same error repeated on every row. */}
      {connectionProblems.map((p) => {
        const PIcon = PLATFORM_ICONS[p.slug] || FiGrid
        return (
          <div
            key={p.slug}
            className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3"
          >
            <span
              className="w-8 h-8 rounded-lg grid place-items-center text-white flex-none"
              style={{ background: PLATFORM_COLORS[p.slug] || '#64748b' }}
            >
              <PIcon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink-900">
                {PLATFORM_LABELS[p.slug] || p.slug} is disconnected
              </div>
              <div className="text-[12px] text-ink-600">
                {p.count} post{p.count === 1 ? '' : 's'} can't report numbers until you reconnect the account.
              </div>
            </div>
            <button type="button" onClick={() => navigate('/channels')} className="btn-outline">
              Reconnect
            </button>
          </div>
        )
      })}


      {tab === 'overview' && (
        <>
          {/* Posting activity: previous / this / next week + what goes out next */}
          <section className="mb-6 grid overflow-hidden rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Posting activity</h2>
                <span className="inline-flex items-center gap-3 text-[11.5px] text-ink-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#2a78d6]" aria-hidden="true" /> Published
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#9ec5f4]" aria-hidden="true" /> Scheduled
                  </span>
                </span>
              </div>
              {publishing ? (
                <WeekColumns days={publishing.days} today={publishing.today} />
              ) : (
                <div className="h-[130px] rounded-xl skeleton" />
              )}
            </div>
            <div className="border-t border-ink-100 bg-ink-50/40 p-4 lg:border-l lg:border-t-0">
              <h3 className="mb-3 text-[12.5px] font-semibold text-ink-700">Up next</h3>
              {publishing ? (
                <UpNext items={publishing.upcoming} icons={PLATFORM_ICONS} mediaSrc={mediaSrc} />
              ) : (
                <div className="h-[130px] rounded-xl skeleton" />
              )}
            </div>
          </section>

          {/* Performance: three headline figures, then one row per channel */}
          <section className="mb-6 overflow-hidden rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
              <h3 className="text-[14.5px] font-semibold text-ink-900">Channels</h3>
              <span className="text-[12px] text-ink-500">{range.label[0].toUpperCase() + range.label.slice(1)} · vs the period before</span>
            </div>
            {items === null ? (
              <div className="grid gap-px md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="m-5 h-16 rounded-xl skeleton" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid divide-y divide-ink-100 md:grid-cols-3 md:divide-x md:divide-y-0">
                  <Figure label="Posts published" value={fmtNum(cur.posts)} delta={<DeltaText current={cur.posts} previous={prev?.posts} />}>
                    <TrendLine values={cumulative(daily.posts)} width={120} />
                  </Figure>
                  <Figure label="Engagement" value={fmtNum(cur.engagement)} delta={<DeltaText current={cur.engagement} previous={prev?.engagement} />}>
                    <Donut segments={platformSplit.engagement} label="Engagement" />
                  </Figure>
                  <Figure label="Views" value={fmtNum(cur.views)} delta={<DeltaText current={cur.views} previous={prev?.views} />}>
                    <Donut segments={platformSplit.views} label="Views" />
                  </Figure>
                </div>
                <PlatformLegend slugs={platformSplit.slugs} labels={PLATFORM_LABELS} />
              </>
            )}
          </section>


          {/* Secondary numbers: rate, clicks, comments, shares — each with its trend */}
          {items !== null && (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Engagement rate" value={cur.rate == null ? '—' : `${cur.rate.toFixed(1)}%`} current={cur.rate} previous={prev?.rate} bars={bucket(daily.rate)} hint="engagement ÷ views" />
              <StatTile label="Link clicks" value={clicksNow == null ? '—' : fmtNum(clicksNow)} current={clicksNow} previous={previous && clicksNow != null ? sumOf(previous, 'clicks') : null} bars={bucket(daily.clicks)} hint={clicksNow == null ? 'not reported yet' : 'where the platform reports them'} />
              <StatTile label="Comments" value={fmtNum(cur.comments)} current={cur.comments} previous={prev?.comments} bars={bucket(daily.comments)} />
              <StatTile label="Shares" value={fmtNum(cur.shares)} current={cur.shares} previous={prev?.shares} bars={bucket(daily.shares)} />
            </div>
          )}
        </>
      )}

      {tab === 'performance' && (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className={`${cardCls} min-w-0 p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Content performance</h2>
                <Chips label="Metric" options={PERF_METRICS} value={perfMetric} onChange={setPerfMetric} />
              </div>
              <div className="mb-3">
                <Chips
                  label="Platform"
                  options={[{ id: 'all', label: 'All platforms' }, ...platformSplit.slugs.map((s) => ({ id: s, label: PLATFORM_LABELS[s] || s }))]}
                  value={perfPlatform}
                  onChange={setPerfPlatform}
                />
              </div>
              <MultiLineChart key={perfMetric + perfChart.unit} days={perfChart.days} series={perfChart.series} />
              <p className="mt-1 text-center text-[11px] text-ink-400">
                {perfChart.unit === 'week' ? 'Each point is one week (dated by its first day)' : 'Each point is one day'}
              </p>
            </section>
            <section className={`${cardCls} min-w-0 p-5`}>
              <h2 className="mb-4 text-[15.5px] font-semibold tracking-tight text-ink-900">Platform performance</h2>
              <PlatformBars rows={platformRows} icons={PLATFORM_ICONS} />
            </section>
          </div>

          <section className={`${cardCls} mb-6 overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
              <h2 className="text-[14.5px] font-semibold text-ink-900">Channels</h2>
              <span className="text-[12px] text-ink-500">vs the period before</span>
            </div>
              <div>
                <ChannelsTable
                  rows={channelRows}
                  icons={PLATFORM_ICONS}
                  labels={PLATFORM_LABELS}
                  onFilter={(r) => r.brandSlug && setBrandFilter(r.brandSlug)}
                />
              </div>
          </section>

          <div className="mb-6">
            <ChartCard title="Content type performance" right={<span className="text-[11.5px] text-ink-500">avg. engagement per post</span>}>
              <ContentTypeChart rows={contentTypes} />
            </ChartCard>
          </div>
        </>
      )}

      {tab === 'content' && (
        <>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight text-ink-900">Top performing content</h2>
          <div className="mb-8">
            <TopContentGrid rows={topPosts.slice(0, 4)} icons={PLATFORM_ICONS} mediaSrc={mediaSrc} engagementOf={engagementOf} onOpen={(it) => navigate(`/insights/${it.target_id}`)} />
          </div>
          {/* Table */}
          <div ref={tableRef} className="scroll-mt-4 bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-ink-100 flex items-center justify-between">
              <span className="font-semibold text-ink-900 text-[15px]">
                All published posts <span className="text-ink-400 font-normal">({filtered.length})</span>
              </span>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!filtered.length}
                title="Export CSV"
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 disabled:opacity-30 transition-all duration-150"
              >
                <FiDownload size={16} />
              </button>
            </div>

            {items === null ? (
              <div className="divide-y divide-ink-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg skeleton" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-2/3 rounded skeleton" />
                      <div className="h-3 w-1/3 rounded skeleton" />
                    </div>
                    <div className="w-16 h-4 rounded skeleton" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-[14px] font-semibold text-ink-700">Nothing here yet</div>
                <div className="text-[12px] text-ink-400 mt-1">Once a post goes out in this range, it shows up here.</div>
              </div>
            ) : (
              <>
              {/* phones: one card per post, numbers in a single row */}
              <div className="sm:hidden divide-y divide-ink-100">
                {pageRows.map((it) => (
                  <MobilePostRow key={it.target_id} it={it} onOpen={() => navigate(`/insights/${it.target_id}`)} />
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[820px]">
                  <thead>
                    <tr className="border-b border-ink-100 text-[11px] font-semibold text-ink-500">
                      <th className="px-5 py-2.5 font-semibold">Post</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Views</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Likes</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Comments</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((it) => {
                      const Icon = PLATFORM_ICONS[it.platform_slug] || FiGrid
                      const brandColor = colorForBrand(it.brand_slug)
                      const platColor = PLATFORM_COLORS[it.platform_slug] || '#64748b'
                      const caption = it.caption || it.title || ''
                      const tags = hashtagsOf(caption)
                      const captionText = caption.replace(HASHTAG_RE, '').trim()
                      const resolved = it.status === 'ok' || it.status === 'partial'
                      const m = it.metrics || {}
                      const src = mediaSrc(it.media_url)
                      const grouped = !resolved && isConnectionProblem(it)
                      const num = (v) =>
                        v != null ? (
                          <span className="text-ink-800 tabular-nums">{v.toLocaleString()}</span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )
                      return (
                        <tr
                          key={it.target_id}
                          onClick={() => navigate(`/insights/${it.target_id}`)}
                          className="border-t border-ink-100 hover:bg-ink-50/60 cursor-pointer transition-colors duration-100"
                        >
                          <td className="px-5 py-3 max-w-[460px]">
                            <div className="flex items-center gap-3">
                              <div className="relative flex-none">
                                <div className="relative isolate w-11 h-11 rounded-lg bg-ink-100 overflow-hidden">
                                  {src && it.media_kind === 'image' ? (
                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                  ) : src ? (
                                    <>
                                      <video
                                        src={`${src}#t=0.1`}
                                        preload="metadata"
                                        muted
                                        playsInline
                                        disablePictureInPicture
                                        className="w-full h-full object-cover pointer-events-none"
                                      />
                                      <span className="absolute inset-0 grid place-items-center">
                                        <span className="w-5 h-5 rounded-full bg-black/55 grid place-items-center text-white">
                                          <FiPlay size={9} className="ml-px" />
                                        </span>
                                      </span>
                                    </>
                                  ) : (
                                    <span className="w-full h-full grid place-items-center text-ink-300">
                                      <FiFileText size={16} />
                                    </span>
                                  )}
                                </div>
                                <span
                                  className="absolute -bottom-1 -right-1 rounded-full grid place-items-center text-white ring-2 ring-white"
                                  style={{ background: platColor, width: 18, height: 18 }}
                                >
                                  <Icon size={10} />
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className={`text-[13px] text-ink-900 line-clamp-1 ${isKhmerText(captionText) ? 'font-khmer' : ''}`}>
                                  {captionText || <span className="text-ink-400">No caption</span>}
                                  {tags.length > 0 && <span className="text-brand"> {tags.join(' ')}</span>}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-500">
                                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: brandColor }} />
                                  <span className="truncate">{it.brand_name}</span>
                                  <span className="text-ink-300">·</span>
                                  <span className="whitespace-nowrap">{fmtDate(it.published_at)}</span>
                                </div>
                                {!resolved && it.note && !grouped && (
                                  <div className="text-[11px] text-amber-700 mt-0.5 truncate">{it.note}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-600 capitalize">
                              {it.media_kind === 'video' ? <FiPlay size={12} /> : it.media_kind === 'image' ? <FiImage size={12} /> : <FiFileText size={12} />}
                              {it.media_kind || 'text'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <StatusChip resolved={resolved} note={it.note} />
                          </td>
                          <td className="px-3 py-3 text-[12.5px] text-right">
                            {m.views != null ? (
                              num(m.views)
                            ) : (
                              <span
                                className="text-ink-300"
                                title={
                                  it.platform_slug === 'telegram'
                                    ? "Telegram's bot API doesn't report views per post"
                                    : undefined
                                }
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-[12.5px] text-right">{num(m.likes)}</td>
                          <td className="px-3 py-3 text-[12.5px] text-right">{num(m.comments)}</td>
                          <td className="px-5 py-3 text-[12.5px] text-right">{num(m.shares)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} pages={pageCount} total={filtered.length} perPage={PER_PAGE} onPage={goToPage} />
              </>
            )}
          </div>
        </>
      )}

      {tab === 'insights' && (
        <>
          <section className={`${cardCls} mb-6 p-5`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Insights</h2>
              <span className="text-[11.5px] text-ink-500">worked out from your {filtered.length} posts in {range.label}</span>
            </div>
            {insightList.length ? (
              <InsightCards items={insightList} />
            ) : (
              <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink-500">
                Not enough posts with numbers yet to spot reliable patterns. Insights appear once you have a few posts with likes,
                comments or views — try a longer date range, or check back after a few more posts.
              </p>
            )}
          </section>

          <section className={`${cardCls} mb-6 p-5`}>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Content funnel</h2>
              <span className="text-[11.5px] text-ink-500">views &amp; clicks only from platforms that report them</span>
            </div>
            <Funnel steps={funnel} />
          </section>

          <h2 className="mb-3 text-[17px] font-bold tracking-tight text-ink-900">What to do next</h2>
          <div className="mb-6">
            <ActionCards items={actions} />
          </div>

          <section className={`${cardCls} p-5`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">This week</h2>
              <span className="text-[11.5px] text-ink-500">last 7 days vs the 7 before</span>
            </div>
            <WeekCompare rows={week} />
          </section>
        </>
      )}
    </div>
  )
}

function MobilePostRow({ it, onOpen }) {
  const Icon = PLATFORM_ICONS[it.platform_slug] || FiGrid
  const platColor = PLATFORM_COLORS[it.platform_slug] || '#64748b'
  const caption = it.caption || it.title || ''
  const tags = hashtagsOf(caption)
  const captionText = caption.replace(HASHTAG_RE, '').trim()
  const resolved = it.status === 'ok' || it.status === 'partial'
  const m = it.metrics || {}
  const src = mediaSrc(it.media_url)
  const stats = [
    [FiEye, m.views, 'views'],
    [FiHeart, m.likes, 'likes'],
    [FiMessageCircle, m.comments, 'comments'],
    [FiShare2, m.shares, 'shares'],
  ].filter(([, v]) => v != null)

  return (
    <button type="button" onClick={onOpen} className="flex w-full gap-3 px-4 py-3.5 text-left active:bg-ink-50">
      <div className="relative flex-none">
        <div className="relative isolate h-12 w-12 overflow-hidden rounded-xl bg-ink-100">
          {src && it.media_kind === 'image' ? (
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : src ? (
            <>
              <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white">
                  <FiPlay size={9} className="ml-px" />
                </span>
              </span>
            </>
          ) : (
            <span className="grid h-full w-full place-items-center text-ink-300">
              <FiFileText size={16} />
            </span>
          )}
        </div>
        <span
          className="absolute -bottom-1 -right-1 grid place-items-center rounded-full text-white ring-2 ring-white"
          style={{ background: platColor, width: 18, height: 18 }}
        >
          <Icon size={10} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className={`line-clamp-2 text-[13px] leading-snug text-ink-900 ${isKhmerText(captionText) ? 'font-khmer' : ''}`}>
          {captionText || <span className="text-ink-400">No caption</span>}
          {tags.length > 0 && <span className="text-brand"> {tags.join(' ')}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-500">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: colorForBrand(it.brand_slug) }} />
          <span className="truncate">{it.brand_name}</span>
          <span className="text-ink-300">·</span>
          <span className="whitespace-nowrap">{fmtDate(it.published_at)}</span>
        </div>
        {stats.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-700">
            {stats.map(([StatIcon, v, label]) => (
              <span key={label} className="inline-flex items-center gap-1 tabular-nums" title={label}>
                <StatIcon size={12} className="text-ink-400" />
                {v.toLocaleString()}
              </span>
            ))}
          </div>
        ) : (
          <div className={`mt-1 truncate text-[11.5px] ${resolved ? 'text-ink-400' : 'text-amber-700'}`}>
            {it.note || (resolved ? 'No numbers from this platform yet' : 'Needs attention')}
          </div>
        )}
      </div>
    </button>
  )
}

function Dropdown({ value, onChange, label, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-ink-200 bg-white text-[12px] font-semibold text-ink-700 hover:border-ink-300 focus:outline-none focus:border-brand cursor-pointer"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
        <FiChevronDown size={14} />
      </span>
    </div>
  )
}
