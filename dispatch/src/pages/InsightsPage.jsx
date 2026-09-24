import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaLinkedin } from 'react-icons/fa'
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from 'react-icons/si'
import { FiActivity, FiBarChart2, FiChevronDown, FiDownload, FiEye, FiFileText, FiGrid, FiHeart, FiImage, FiMessageCircle, FiPlay, FiRefreshCw, FiShare2, FiTrendingUp } from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'

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

const SERIES_COLORS = { likes: '#1B75BB', comments: '#F08A5D', shares: '#86A41E' }

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

function Sparkline({ values, color = '#1B75BB', width = 76, height = 26 }) {
  if (!values || values.length < 2) return <div style={{ width, height }} />
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (width - 2) + 1,
    y: height - 2 - ((v - min) / span) * (height - 4),
  }))
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ current, previous }) {
  if (previous == null || !(previous > 0) || current == null) {
    return <span className="text-[11.5px] text-ink-400">no prior period</span>
  }
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  return (
    <span className="text-[11.5px] text-ink-500">
      <span className={`font-semibold ${up ? 'text-brand' : 'text-red-600'}`}>
        {up ? '↗' : '↘'} {up ? '+' : ''}
        {pct.toFixed(1)}%
      </span>{' '}
      vs last period
    </span>
  )
}

function StatCard({ icon: Icon, label, value, spark, current, previous }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-4 py-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Icon size={17} className="text-ink-600 mb-2.5" aria-hidden="true" />
          <div className="text-[12px] text-ink-600 leading-snug">{label}</div>
        </div>
        <Sparkline values={spark} />
      </div>
      <div className="mt-2 text-[24px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{value}</div>
      <div className="mt-2.5">
        <Delta current={current} previous={previous} />
      </div>
    </div>
  )
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

function niceCeil(n) {
  if (!(n > 0)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(n)))
  const norm = n / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * mag
}

function smoothPath(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  const t = 0.18
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) * t
    const c1y = p1.y + (p2.y - p0.y) * t
    const c2x = p2.x - (p3.x - p1.x) * t
    const c2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
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
  const maxY = niceCeil(Math.max(...series.map((s) => s.y), 4))

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
              <line x1={PAD.left} x2={w - PAD.right} y1={gy} y2={gy} stroke="#EAEDF0" strokeWidth="1" strokeDasharray={g === 0 ? '' : '3 4'} />
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
export function PlatformBarChart({ rows }) {
  if (!rows.length) {
    return (
      <div className="py-16 text-center text-[11px] text-ink-400">
        No published posts to chart yet.
      </div>
    )
  }
  const max = niceCeil(Math.max(...rows.map((r) => r.value), 1))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const NAMES = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', telegram: 'Telegram', tiktok: 'TikTok', youtube: 'YouTube' }
  return (
    <div className="pt-2">
      <div className="relative">
        {/* vertical gridlines behind the bars */}
        <div className="absolute inset-y-0 left-[96px] right-2 pointer-events-none">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute inset-y-0 border-l border-dashed border-ink-200"
              style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative space-y-4 py-2">
          {rows.map((r) => {
            const color = PLATFORM_COLORS[r.slug] || '#94A3B8'
            const pct = Math.max(1.5, (r.value / max) * 100)
            return (
              <div key={r.slug} className="flex items-center gap-3" title={`${r.value.toLocaleString()} engagement`}>
                <div className="w-[84px] flex-none text-right text-[12.5px] text-ink-700 truncate">
                  {NAMES[r.slug] || r.slug}
                </div>
                <div className="flex-1 mr-2">
                  <div
                    className="h-[22px] rounded-[4px] transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex ml-[96px] mr-2 mt-2">
        {ticks.map((t, i) => (
          <span
            key={i}
            className="flex-1 text-[11px] text-ink-500 tabular-nums first:text-left last:text-right last:flex-none text-center"
            style={i === 0 ? { flex: '0 0 auto', transform: 'translateX(-4px)' } : undefined}
          >
            {fmtCompact(Math.round(t))}
          </span>
        ))}
      </div>
    </div>
  )
}

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
        No engagement recorded in this period yet.
      </div>
    )
  }

  const PAD = { top: 12, right: 12, bottom: 34, left: 48 }
  const innerW = w - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const maxY = niceCeil(Math.max(...keys.flatMap((k) => series[k]), 1))
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
              <line x1={PAD.left} x2={w - PAD.right} y1={gy} y2={gy} stroke="#E5E8EC" strokeDasharray={g === 0 ? '' : '4 4'} />
              <text x={PAD.left - 10} y={gy + 4} textAnchor="end" fontSize="12" fill="#6B7683">
                {fmtCompact(Math.round(maxY * g))}
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
              <path d={line} fill="none" stroke={SERIES_COLORS[k]} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
          <span key={k} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: SERIES_COLORS[k] }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES_COLORS[k] }} />
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
  const maxY = niceCeil(Math.max(...rows.map((r) => r.avg), 1))
  const grid = [0, 0.25, 0.5, 0.75, 1]
  const LABEL = { image: 'Image', video: 'Video', text: 'Text only' }
  return (
    <div className="flex" style={{ height }}>
      <div className="flex flex-col justify-between pr-3 pb-7 text-[11px] text-ink-500 tabular-nums text-right w-10">
        {[...grid].reverse().map((g) => (
          <span key={g}>{fmtCompact(Math.round(maxY * g))}</span>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-x-0 top-[7px] bottom-[34px] flex flex-col justify-between pointer-events-none">
          {grid.map((g) => (
            <span key={g} className={`border-t ${g === 0 ? 'border-ink-200' : 'border-dashed border-ink-200'}`} />
          ))}
        </div>
        <div className="absolute inset-x-0 top-[7px] bottom-[34px] flex items-end justify-around px-4">
          {rows.map((r) => (
            <div key={r.kind} className="flex flex-col items-center justify-end h-full" title={`${r.count} posts`}>
              <span className="text-[11px] font-semibold text-ink-700 mb-1 tabular-nums">{fmtCompact(Math.round(r.avg))}</span>
              <div
                className="w-10 rounded-t-md bg-brand transition-all duration-500"
                style={{ height: `${Math.max(2, (r.avg / maxY) * 100)}%` }}
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

function TopPosts({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <div className="h-[220px] grid place-items-center text-[12px] text-ink-400">
        Nothing published in this period yet.
      </div>
    )
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {rows.map((it) => {
        const src = mediaSrc(it.media_url)
        const Icon = PLATFORM_ICONS[it.platform_slug] || FiGrid
        const color = PLATFORM_COLORS[it.platform_slug] || '#64748b'
        const m = it.metrics || {}
        const caption = (it.caption || it.title || '').replace(HASHTAG_RE, '').trim()
        return (
          <button
            key={it.target_id}
            type="button"
            onClick={() => onOpen(it)}
            className="flex-none w-[210px] text-left rounded-xl border border-ink-200/70 bg-white hover:shadow-card-hover transition-shadow duration-150 overflow-hidden"
          >
            <div className="relative h-[120px] bg-ink-100 grid place-items-center">
              {src && it.media_kind === 'image' ? (
                <img src={src} alt="" className="w-full h-full object-cover" />
              ) : src && it.media_kind === 'video' ? (
                <video src={src} className="w-full h-full object-cover" muted />
              ) : (
                <FiImage size={22} className="text-ink-300" />
              )}
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-ink-700 shadow-sm">
                <Icon size={11} style={{ color }} />
                <span className="capitalize">{it.platform_slug}</span>
              </span>
            </div>
            <div className="p-3">
              <div className="text-[12px] text-ink-800 leading-snug line-clamp-2 min-h-[34px]">{caption || '—'}</div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <FiHeart size={13} /> {fmtCompact(engagementOf(m))}
                </span>
                <span>{new Date(it.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function avgOf(rows, pick) {
  const vals = rows.map(pick).filter((v) => v != null && v !== 0)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function buildInsights(post, series, avg) {
  const m = post.metrics || {}
  const engagement = engagementOf(m)
  const out = []
  const ranked = series.filter((s) => s.y > 0).map((s) => s.y).sort((a, b) => b - a)
  const rank = ranked.indexOf(engagement) + 1
  if (rank > 0 && ranked.length > 1) {
    const pct = Math.round((1 - rank / ranked.length) * 100)
    out.push(`Ranks #${rank} of ${ranked.length} posts in this view — top ${pct}%.`)
  }
  if (avg && m.likes != null && avg.likes != null) {
    const ratio = m.likes / avg.likes
    out.push(ratio >= 1.25 ? `Likes run ${ratio.toFixed(1)}× your average — this one clearly lands.` : ratio <= 0.5 ? `Likes trail at ${Math.round(ratio * 100)}% of your average — try a stronger hook.` : 'Likes are close to your typical post.')
  }
  if (avg && m.views != null && avg.views != null) {
    const d = m.views - avg.views
    out.push(d >= 0 ? `Views beat your average by ${d.toLocaleString()}.` : `Views sit ${Math.abs(d).toLocaleString()} below your average.`)
  }
  if ((m.comments ?? 0) > 0) out.push(`Comments are ${m.comments} — some conversation happening.`)
  else out.push('No comments yet — a question in the caption usually nudges replies.')
  if (!out.length) out.push('Not enough published data yet; check back once more posts go live.')
  return out
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

  const load = () => {
    setLoading(true)
    const brand = brands.find((b) => b.slug === brandFilter)
    const qs = brand ? `?brand_id=${brand.id}&limit=100` : '?limit=100'
    api
      .get(`/views/insights${qs}`)
      .then(setItems)
      .catch((e) => showToast(`Could not load insights — ${e.message}`))
      .finally(() => setLoading(false))
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
  const daily = useMemo(() => {
    const idx = new Map(days.map((d, i) => [d, i]))
    const z = () => days.map(() => 0)
    const out = { views: z(), engagement: z(), likes: z(), comments: z(), shares: z(), posts: z(), rateV: z(), rateE: z() }
    for (const it of filtered) {
      if (!it.published_at) continue
      const i = idx.get(dayKey(it.published_at))
      if (i == null) continue
      out.posts[i] += 1
      if (!isResolved(it)) continue
      const m = it.metrics || {}
      out.likes[i] += m.likes || 0
      out.comments[i] += m.comments || 0
      out.shares[i] += m.shares || 0
      out.engagement[i] += engagementOf(m)
      if (m.views != null) {
        out.views[i] += m.views
        out.rateV[i] += m.views
        out.rateE[i] += engagementOf(m)
      }
    }
    out.rate = out.rateV.map((v, i) => (v > 0 ? (out.rateE[i] / v) * 100 : 0))
    return out
  }, [filtered, days])

  // Sparklines read better as a running total than a spiky day-by-day line.
  const cumulative = (arr) => {
    let s = 0
    return arr.map((v) => (s += v))
  }

  const platformTotals = useMemo(() => {
    const map = new Map()
    for (const it of filtered) {
      if (!isResolved(it) || !it.platform_slug) continue
      map.set(it.platform_slug, (map.get(it.platform_slug) || 0) + engagementOf(it.metrics))
    }
    return [...map.entries()].map(([slug, value]) => ({ slug, value })).sort((a, b) => b.value - a.value)
  }, [filtered])

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
        .slice()
        .sort((a, b) => engagementOf(b.metrics) - engagementOf(a.metrics))
        .slice(0, 8),
    [filtered],
  )

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

  const cards = [
    { icon: FiEye, label: 'Total Views', value: fmtCompact(cur.views), spark: cumulative(daily.views), c: cur.views, p: prev?.views },
    { icon: FiBarChart2, label: 'Total Engagement', value: fmtCompact(cur.engagement), spark: cumulative(daily.engagement), c: cur.engagement, p: prev?.engagement },
    { icon: FiHeart, label: 'Likes', value: fmtCompact(cur.likes), spark: cumulative(daily.likes), c: cur.likes, p: prev?.likes },
    { icon: FiActivity, label: 'Engagement Rate', value: cur.rate == null ? '—' : `${cur.rate.toFixed(1)}%`, spark: daily.rate, c: cur.rate, p: prev?.rate },
    { icon: FiMessageCircle, label: 'Comments', value: fmtCompact(cur.comments), spark: cumulative(daily.comments), c: cur.comments, p: prev?.comments },
    { icon: FiFileText, label: 'Posts Published', value: fmtCompact(cur.posts), spark: cumulative(daily.posts), c: cur.posts, p: prev?.posts },
  ]

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {items === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-ink-200/60 p-4 space-y-3">
                <div className="h-4 w-4 rounded skeleton" />
                <div className="h-3 w-24 rounded skeleton" />
                <div className="h-6 w-16 rounded skeleton" />
                <div className="h-3 w-28 rounded skeleton" />
              </div>
            ))
          : cards.map((k) => (
              <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} spark={k.spark} current={k.c} previous={k.p} />
            ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Engagement Over Time">
          <MultiLineChart
            days={days}
            series={{ comments: daily.comments, likes: daily.likes, shares: daily.shares }}
          />
        </ChartCard>
        <ChartCard title="Engagement by Platform">
          <PlatformBarChart rows={platformTotals} />
        </ChartCard>
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Content Type Performance" right={<span className="text-[11.5px] text-ink-500">avg. engagement per post</span>}>
          <ContentTypeChart rows={contentTypes} />
        </ChartCard>
        <ChartCard
          title={
            <span className="inline-flex items-center gap-2">
              <FiTrendingUp size={17} className="text-ink-700" /> Top Performing Posts
            </span>
          }
        >
          <TopPosts rows={topPosts} onOpen={(it) => navigate(`/insights/${it.target_id}`)} />
        </ChartCard>
      </div>

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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
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
            {filtered.map((it) => (
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
                {filtered.map((it) => {
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
          </>
        )}
      </div>
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
