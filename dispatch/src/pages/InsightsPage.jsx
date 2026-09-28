import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildFunnel, buildInsights } from '../lib/insightsEngine'
import Pager from '../components/ui/Pager'
import Select from '../components/ui/Select'
import {
  ActionCards,
  cardCls,
  Chips,
  Funnel,
  InsightCards,
  PlatformBars,
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
import {
  FiArrowDown,
  FiArrowUp,
  FiDownload,
  FiEye,
  FiFileText,
  FiGrid,
  FiHeart,
  FiImage,
  FiMessageCircle,
  FiPlay,
  FiRefreshCw,
  FiShare2,
  FiX,
} from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'
import {
  ChannelScoreboard,
  PulseCard,
  RANK_BY,
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

/** A missing permission (the app may read stats only once Meta grants it) —
 * posting still works, so this isn't a "disconnected" account. */
function isPermissionProblem(note) {
  return /permission|requires the|pages_read_engagement|read_insights|\(#10\)|\(#200\)/i.test(note || '')
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
  if (/^https?:\/\//i.test(url)) return url
  const base = window.location.port === '5173' ? 'http://localhost:8000' : ''
  return `${base}${url}`
}

/** Where a post was made: through ContentFlow, or straight on the platform
 * (imported from the connected Page — app/importer.py). */
export function OriginBadge({ origin, platform }) {
  const native = origin === 'native'
  const name = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', telegram: 'Telegram', linkedin: 'LinkedIn', youtube: 'YouTube' }[platform] || 'the platform'
  return (
    <span
      title={native ? `Posted directly on ${name} — imported from the connected account` : 'Posted with ContentFlow'}
      className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${
        native ? 'bg-ink-100 text-ink-600' : 'bg-brand-soft text-brand'
      }`}
    >
      {native ? `On ${name}` : 'ContentFlow'}
    </span>
  )
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
              style={{ fill: 'rgb(var(--surface))' }}
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
              <circle key={k} cx={xf(hover)} cy={yf(series[k][hover])} r="4" style={{ fill: 'rgb(var(--surface))' }} stroke={SERIES_COLORS[k]} strokeWidth="2" />
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
  const { brands, channels, showToast } = useStore()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [rangeId, setRangeId] = useState('30')
  const [loading, setLoading] = useState(false)
  // Channels table: totals, or averages per post so busy and quiet channels compare fairly.
  const [perPost, setPerPost] = useState(false)
  const [rankBy, setRankBy] = useState('engagement')

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
      if (originFilter !== 'all' && (it.origin || 'contentflow') !== originFilter) return false
      return true
    })
  }, [items, cutoff, typeFilter, tagFilter, originFilter])

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
      if (originFilter !== 'all' && (it.origin || 'contentflow') !== originFilter) return false
      return true
    })
  }, [items, range.days, cutoff, typeFilter, tagFilter, originFilter])

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

  // "Your posts": 10 per page, sortable by any column (newest first by
  // default), optionally narrowed to one channel / platform from the channel
  // scoreboard's "N posts →" buttons. Any filter/range change starts over at page 1.
  const [page, setPage] = useState(0)
  const [postSort, setPostSort] = useState({ id: 'date', dir: -1 })
  const [postScope, setPostScope] = useState(null) // { key?, platform?, label }
  const tableRef = useRef(null)
  const postRows = useMemo(() => {
    const scoped = !postScope
      ? filtered
      : filtered.filter((it) =>
          postScope.key != null
            ? (it.channel_id ?? `${it.brand_slug}:${it.platform_slug}`) === postScope.key
            : it.platform_slug === postScope.platform,
        )
    const val = (it) => {
      if (postSort.id === 'date') return it.published_at ? new Date(it.published_at).getTime() : 0
      const m = isResolved(it) ? it.metrics || {} : {}
      if (postSort.id === 'engagement') return engagementOf(m)
      if (postSort.id === 'rate') return m.views ? engagementOf(m) / m.views : -1
      return m[postSort.id] ?? -1
    }
    return [...scoped].sort((a, b) => (val(a) - val(b)) * postSort.dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, postScope, postSort])
  const pageCount = Math.max(1, Math.ceil(postRows.length / PER_PAGE))
  // Keyed on the filter inputs, not `filtered` — that array is rebuilt every
  // render (the date cutoff is "now"), which would snap back to page 1 constantly.
  useEffect(() => setPage(0), [items, rangeId, brandFilter, typeFilter, tagFilter, originFilter, postScope, postSort])
  useEffect(() => setPostScope(null), [brandFilter])
  const pageRows = postRows.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  // Longest engagement bar in "Your posts" = the best post in view.
  const postMax = useMemo(
    () => Math.max(0, ...postRows.map((it) => (isResolved(it) ? engagementOf(it.metrics) : 0))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postRows],
  )
  const sortPostsBy = (id) => setPostSort((s) => ({ id, dir: s.id === id ? -s.dir : -1 }))
  const showPostsOf = (r) => {
    setPostScope(
      r.brand
        ? { key: r.key, label: `${r.brand}${r.handle ? ` ${r.handle}` : ''} · ${PLATFORM_LABELS[r.platform] || r.platform}` }
        : { platform: r.platform, label: PLATFORM_LABELS[r.platform] || r.platform },
    )
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
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
      const cur = map.get(it.platform_slug) || { count: 0, note: it.note, accounts: new Set() }
      // Which Page / account under which brand — each brand keeps its own
      // saved login, so each one listed here needs reconnecting.
      cur.accounts.add([it.channel_handle, it.brand_name].filter(Boolean).join(' · '))
      map.set(it.platform_slug, { ...cur, count: cur.count + 1 })
    }
    return [...map.entries()].map(([slug, { count, note, accounts }]) => ({
      slug,
      count,
      note,
      accounts: [...accounts].filter(Boolean),
      permission: isPermissionProblem(note),
    }))
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

  // The platform with the biggest slice of engagement — for the pulse card's read-out.
  const topPlatform = useMemo(() => {
    const segs = platformSplit.engagement
    const total = segs.reduce((n, x) => n + x.value, 0)
    const top = [...segs].sort((a, b) => b.value - a.value)[0]
    return top && total > 0 ? { label: top.label, share: top.value / total } : null
  }, [platformSplit])

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
          posts: 0, engagement: 0, likes: 0, comments: 0, shares: 0, views: null, reported: false, rateV: 0, rateE: 0,
          prevPosts: previous ? 0 : null, prevEngagement: previous ? 0 : null, prevViews: previous ? 0 : null,
          trend: days.map(() => 0),
        })
      }
      return map.get(k)
    }
    // Every connected channel gets a row, even with no posts this period —
    // otherwise a channel nobody posts to never shows up.
    for (const c of channels) {
      if (c.s === 'off' || (brandFilter !== 'all' && c.b !== brandFilter)) continue
      const brand = brands.find((b) => b.slug === c.b)
      rowFor({
        channel_id: c.id,
        brand_name: brand?.name || c.b,
        brand_slug: c.b,
        platform_slug: c.p,
        channel_handle: c.h,
      })
    }
    for (const it of filtered) {
      const r = rowFor(it)
      r.posts += 1
      if (!isResolved(it)) continue
      const m = it.metrics || {}
      const e = engagementOf(m)
      if (['likes', 'comments', 'shares'].some((k) => m[k] != null)) r.reported = true
      r.engagement += e
      r.likes += m.likes || 0
      r.comments += m.comments || 0
      r.shares += m.shares || 0
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
  }, [filtered, previous, days, channels, brands, brandFilter])

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
        <Dropdown
          value={brandFilter}
          onChange={setBrandFilter}
          label="Brand"
          options={[
            { value: 'all', label: 'All brands' },
            ...brands.map((b) => ({ value: b.slug, label: b.name, color: colorForBrand(b.slug) })),
          ]}
        />
        <Dropdown
          value={typeFilter}
          onChange={setTypeFilter}
          label="Post type"
          options={[
            { value: 'all', label: 'All post types' },
            { value: 'image', label: 'Images' },
            { value: 'video', label: 'Videos' },
          ]}
        />
        <Dropdown
          value={originFilter}
          onChange={setOriginFilter}
          label="Posted from"
          options={[
            { value: 'all', label: 'Posted from anywhere' },
            { value: 'contentflow', label: 'Posted with ContentFlow' },
            { value: 'native', label: 'Posted directly on the Page' },
          ]}
        />
        <Dropdown
          value={tagFilter}
          onChange={setTagFilter}
          label="Hashtag"
          options={[{ value: 'all', label: 'All hashtags' }, ...allTags.map((t) => ({ value: t }))]}
        />
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
                {p.permission
                  ? `${PLATFORM_LABELS[p.slug] || p.slug} isn't sharing post stats yet`
                  : `${PLATFORM_LABELS[p.slug] || p.slug} is disconnected`}
              </div>
              <div className="text-[12px] text-ink-600">
                {p.permission
                  ? `${p.count} post${p.count === 1 ? '' : 's'} can't report numbers: the app needs a permission to read stats. Posting still works.`
                  : `${p.count} post${p.count === 1 ? '' : 's'} can't report numbers until you reconnect the account.`}
              </div>
              {p.accounts.length > 0 && (
                <div className="mt-0.5 text-[12px] text-ink-700">
                  Affected: <span className="font-semibold">{p.accounts.join(', ')}</span> — reconnect{' '}
                  {p.accounts.length === 1 ? 'it' : 'each one'} and allow every permission.
                </div>
              )}
              {p.note && (
                <div className="mt-1 line-clamp-2 text-[11px] text-ink-400" title={p.note}>
                  {PLATFORM_LABELS[p.slug] || p.slug} says: {p.note}
                </div>
              )}
            </div>
            <button type="button" onClick={() => navigate('/channels')} className="btn-outline">
              Reconnect
            </button>
          </div>
        )
      })}


      {tab === 'overview' && (
        <>
          {/* Engagement as the hero, what it's made of, then the supporting numbers */}
          <div className="mb-6">
            {items === null ? (
              <div className="h-[196px] rounded-2xl skeleton" />
            ) : (
              <PulseCard
                cur={cur}
                prev={prev}
                period={range.label[0].toUpperCase() + range.label.slice(1)}
                viewsReported={reports(filtered, 'views')}
                topPlatform={topPlatform}
              />
            )}
          </div>

          {/* Every channel ranked on one metric */}
          <section className={`${cardCls} mb-6 overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-3 pt-4">
              <div className="mr-auto">
                <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Channel scoreboard</h2>
                <p className="text-[12px] text-ink-500">Which Pages and accounts are pulling their weight</p>
              </div>
              <Chips label="Rank by" options={RANK_BY} value={rankBy} onChange={setRankBy} />
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-ink-700">
                <button
                  type="button"
                  role="switch"
                  aria-checked={perPost}
                  onClick={() => setPerPost((v) => !v)}
                  className={`relative h-5 w-9 flex-none rounded-full transition-colors duration-150 ${perPost ? 'bg-brand' : 'bg-ink-200'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150 ${perPost ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </button>
                Average per post
              </label>
            </div>
            {items === null ? (
              <div className="mx-5 mb-5 h-40 rounded-xl skeleton" />
            ) : (
              <ChannelScoreboard
                rows={channelRows}
                rankBy={rankBy}
                perPost={perPost}
                icons={PLATFORM_ICONS}
                labels={PLATFORM_LABELS}
                onPosts={showPostsOf}
                onFilter={(r) => r.brandSlug && setBrandFilter(r.brandSlug)}
                onPlan={() => navigate('/new')}
              />
            )}
          </section>

          {/* Every published post, sortable */}
          <section ref={tableRef} className={`${cardCls} scroll-mt-4 overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-4">
              <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">
                Your posts <span className="font-normal text-ink-400">({postRows.length})</span>
              </h2>
              {postScope && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-[11.5px] font-semibold text-brand">
                  {postScope.label}
                  <button
                    type="button"
                    onClick={() => setPostScope(null)}
                    className="grid h-4 w-4 place-items-center rounded-full hover:bg-brand/15"
                    aria-label="Show all posts"
                  >
                    <FiX size={11} />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={exportCsv}
                disabled={!filtered.length}
                title="Export CSV"
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-all duration-150 hover:bg-ink-50 hover:text-ink-700 disabled:opacity-30"
              >
                <FiDownload size={16} />
              </button>
            </div>

            {items === null ? (
              <div className="divide-y divide-ink-100 border-t border-ink-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="h-10 w-10 rounded-lg skeleton" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-2/3 rounded skeleton" />
                      <div className="h-3 w-1/3 rounded skeleton" />
                    </div>
                    <div className="h-4 w-16 rounded skeleton" />
                  </div>
                ))}
              </div>
            ) : postRows.length === 0 ? (
              <div className="border-t border-ink-100 py-16 text-center">
                <div className="text-[14px] font-semibold text-ink-700">Nothing here yet</div>
                <div className="mt-1 text-[12px] text-ink-400">Once a post goes out in this range, it shows up here.</div>
              </div>
            ) : (
              <>
                {/* phones: one card per post, numbers in a single row */}
                <div className="divide-y divide-ink-100 border-t border-ink-100 sm:hidden">
                  {pageRows.map((it) => (
                    <MobilePostRow key={it.target_id} it={it} onOpen={() => navigate(`/insights/${it.target_id}`)} />
                  ))}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[860px] border-collapse text-left">
                    <thead className="border-y border-ink-100">
                      <tr className="text-[11.5px] text-ink-500">
                        {POST_COLS.map((c) => {
                          const active = postSort.id === c.id
                          return (
                            <th
                              key={c.id}
                              className={`py-2 font-medium ${c.id === 'date' ? 'pl-5 pr-3' : 'px-3 text-right last:pr-5'}`}
                              aria-sort={active ? (postSort.dir < 0 ? 'descending' : 'ascending') : 'none'}
                            >
                              <button
                                type="button"
                                onClick={() => sortPostsBy(c.id)}
                                title={c.info ? `${c.label} — ${c.info}` : `Sort by ${c.label.toLowerCase()}`}
                                className={`inline-flex items-center gap-1 py-0.5 font-semibold ${
                                  active ? 'text-brand' : 'hover:text-ink-800'
                                }`}
                              >
                                {c.label}
                                {active &&
                                  (postSort.dir < 0 ? <FiArrowDown size={11} aria-hidden="true" /> : <FiArrowUp size={11} aria-hidden="true" />)}
                              </button>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {pageRows.map((it) => (
                        <PostRow key={it.target_id} it={it} max={postMax} onOpen={() => navigate(`/insights/${it.target_id}`)} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={page} pages={pageCount} total={postRows.length} perPage={PER_PAGE} onPage={goToPage} />
              </>
            )}
          </section>
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

// "Your posts" columns — the header buttons sort by these ids.
const POST_COLS = [
  { id: 'date', label: 'Post' },
  { id: 'engagement', label: 'Engagement', info: 'reactions + comments + shares' },
  { id: 'rate', label: 'Eng. rate', info: 'engagement ÷ views' },
  { id: 'views', label: 'Views' },
  { id: 'likes', label: 'Reactions' },
  { id: 'comments', label: 'Comments' },
  { id: 'shares', label: 'Shares' },
]

/** One post in the desktop "Your posts" table: thumbnail + caption +
 *  where / when, then its numbers. Zeros are dimmed; a post whose numbers
 *  couldn't be read gets an amber dot on its thumbnail and the reason. */
function PostRow({ it, max, onOpen }) {
  const Icon = PLATFORM_ICONS[it.platform_slug] || FiGrid
  const platColor = PLATFORM_COLORS[it.platform_slug] || '#64748b'
  const caption = it.caption || it.title || ''
  const tags = hashtagsOf(caption)
  const captionText = caption.replace(HASHTAG_RE, '').trim()
  const resolved = it.status === 'ok' || it.status === 'partial'
  const m = resolved ? it.metrics || {} : {}
  const reported = ['likes', 'comments', 'shares'].some((k) => m[k] != null)
  const src = mediaSrc(it.media_url)
  const engagement = reported ? engagementOf(m) : null
  const rate = m.views ? (engagementOf(m) / m.views) * 100 : null
  const num = (v, fmt = (x) => x.toLocaleString()) =>
    v == null ? <span className="text-ink-300">—</span> : <span className={v ? 'text-ink-800' : 'text-ink-300'}>{fmt(v)}</span>
  const KindIcon = it.media_kind === 'video' ? FiPlay : it.media_kind === 'image' ? FiImage : FiFileText

  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors duration-100 hover:bg-ink-50/60">
      <td className="max-w-[480px] py-2.5 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-none">
            <div className="relative isolate h-11 w-11 overflow-hidden rounded-lg bg-ink-100">
              {src && (it.media_kind === 'image' || it.media_thumb) ? (
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : src ? (
                <>
                  <video
                    src={`${src}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    disablePictureInPicture
                    className="pointer-events-none h-full w-full object-cover"
                  />
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
            {!resolved && (
              <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" title={it.note || 'Needs attention'} />
            )}
          </div>
          <div className="min-w-0">
            <div className={`line-clamp-1 text-[13px] text-ink-900 ${isKhmerText(captionText) ? 'font-khmer' : ''}`}>
              {captionText || <span className="text-ink-400">No caption</span>}
              {tags.length > 0 && <span className="text-brand"> {tags.join(' ')}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-500">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: colorForBrand(it.brand_slug) }} />
              <span className="truncate">{it.brand_name}</span>
              <span className="text-ink-300">·</span>
              <span className="whitespace-nowrap">{fmtDate(it.published_at)}</span>
              <span className="text-ink-300">·</span>
              <KindIcon size={11} className="flex-none" aria-label={it.media_kind || 'text'} />
              <OriginBadge origin={it.origin} platform={it.platform_slug} />
            </div>
            {!resolved && it.note && !isConnectionProblem(it) && (
              <div className="mt-0.5 truncate text-[11px] text-amber-700">{it.note}</div>
            )}
          </div>
        </div>
      </td>
      <td className="w-[130px] px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums">
        {num(engagement)}
        {engagement > 0 && max > 0 && (
          <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
            <div className="ml-auto h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (engagement / max) * 100)}%` }} />
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums">{num(rate, (x) => `${x.toFixed(1)}%`)}</td>
      <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums" title={it.platform_slug === 'telegram' ? "Telegram's bot API doesn't report views per post" : undefined}>
        {num(m.views)}
      </td>
      <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums">{num(m.likes)}</td>
      <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums">{num(m.comments)}</td>
      <td className="py-2.5 pl-3 pr-5 text-right text-[12.5px] tabular-nums">{num(m.shares)}</td>
    </tr>
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
          {src && (it.media_kind === 'image' || it.media_thumb) ? (
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
          <OriginBadge origin={it.origin} platform={it.platform_slug} />
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

function Dropdown({ value, onChange, label, options }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      aria-label={label}
      buttonClassName="text-[12px] font-semibold"
    />
  )
}
