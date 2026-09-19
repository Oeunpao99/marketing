import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from 'react-icons/si'
import { FiChevronDown, FiDownload, FiEye, FiGrid, FiHeart, FiMessageCircle, FiShare2 } from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'

export const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }

export const PLATFORM_ICONS = {
  facebook: SiFacebook,
  instagram: SiInstagram,
  telegram: SiTelegram,
  tiktok: SiTiktok,
  youtube: SiYoutube,
}

export const PLATFORM_COLORS = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  telegram: '#26A5E4',
  tiktok: '#000000',
  youtube: '#FF0000',
}

const DATE_RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '28', label: 'Last 28 days', days: 28 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
]

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu

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

function StatTile({ label, value, sub, icon, tone }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl grid place-items-center flex-none ${tone} text-white`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-ink-400">{label}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[24px] leading-none text-ink-900 tabular-nums">{value}</span>
            {sub && <span className="text-[11.5px] text-ink-400 font-medium truncate">{sub}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusChip({ resolved, note }) {
  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700"
      title={note || ''}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Needs attention
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
      <div ref={wrapRef} className="py-16 text-center text-[12px] text-ink-400">
        No engagement data to chart yet.
      </div>
    )
  }

  const H = height
  const PAD = { top: 28, right: 26, bottom: 40, left: 56 }
  const innerW = Math.max(10, w - PAD.left - PAD.right)
  const innerH = H - PAD.top - PAD.bottom

  const maxY = niceCeil(Math.max(...series.map((s) => s.y), 1))

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

        {series.map((s, i) =>
          i % labelStep === 0 || i === series.length - 1 ? (
            <text
              key={s.id}
              x={xf(i)}
              y={H - 12}
              fontSize="10.5"
              fill="#9AA2AD"
              textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
            >
              {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          ) : null,
        )}
      </svg>
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
  const [rangeId, setRangeId] = useState('28')
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

  const stats = useMemo(() => {
    let engagement = 0
    let views = 0
    let attention = 0
    for (const it of filtered) {
      const resolved = it.status === 'ok' || it.status === 'partial'
      if (resolved) {
        engagement += engagementOf(it.metrics)
        views += viewsOf(it.metrics) || 0
      } else {
        attention += 1
      }
    }
    return { engagement, views, attention }
  }, [filtered])

  const exportCsv = () => {
    if (!filtered.length) return
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `insights-${range.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] lg:text-[42px] leading-tight tracking-tight text-ink-900">
            Insights
          </h1>
          <p className="mt-1.5 text-ink-500 max-w-[60ch] text-[15px]">
            How your published posts are doing, pulled live from each platform.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-white border border-ink-200 text-ink-700 text-[13.5px] font-semibold hover:border-brand disabled:opacity-50 transition-all duration-200 flex-none"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile
          label="Published"
          value={filtered.length}
          sub="posts"
          icon={<FiGrid size={17} />}
          tone="gradient-brand"
        />
        <StatTile
          label="Engagement"
          value={stats.engagement.toLocaleString()}
          sub="likes + comments + shares"
          icon={<FiHeart size={17} />}
          tone="bg-violet-500"
        />
        <StatTile
          label="Views"
          value={stats.views.toLocaleString()}
          sub="across platforms"
          icon={<FiEye size={17} />}
          tone="bg-blue-500"
        />
        <StatTile
          label="Needs attention"
          value={stats.attention}
          sub="waiting / errors"
          icon={<FiMessageCircle size={17} />}
          tone="bg-amber-500"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Dropdown value={brandFilter} onChange={setBrandFilter} label={brandFilter === 'all' ? 'All profiles' : brands.find((b) => b.slug === brandFilter)?.name}>
          <option value="all">All profiles</option>
          {brands.map((b) => (
            <option key={b.id} value={b.slug}>{b.name}</option>
          ))}
        </Dropdown>
        <Dropdown value={typeFilter} onChange={setTypeFilter} label={typeFilter === 'all' ? 'Post types' : typeFilter === 'image' ? 'Images' : 'Videos'}>
          <option value="all">Post types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </Dropdown>
        <Dropdown value={tagFilter} onChange={setTagFilter} label={tagFilter === 'all' ? 'Tags' : tagFilter}>
          <option value="all">Tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Dropdown>
        <div className="ml-auto">
          <Dropdown value={rangeId} onChange={setRangeId} label={range.label}>
            {DATE_RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-ink-100 rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-ink-100 flex items-center justify-between">
          <span className="font-bold text-ink-900 text-[14.5px]">
            Published posts <span className="text-ink-400 font-medium">({filtered.length})</span>
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
          <div className="py-20 text-center text-ink-400 text-[13px]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-[15px] font-semibold text-ink-700">Nothing here yet</div>
            <div className="text-[13px] text-ink-400 mt-1">
              Once a post goes out in this range, it shows up here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-ink-50/60 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-2.5 font-bold">Post</th>
                  <th className="px-3 py-2.5 font-bold">Type</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold text-right"><span className="inline-flex items-center gap-1"><FiEye className="inline" size={13} />Views</span></th>
                  <th className="px-3 py-2.5 font-bold text-right"><span className="inline-flex items-center gap-1"><FiHeart className="inline" size={13} />Likes</span></th>
                  <th className="px-3 py-2.5 font-bold text-right"><span className="inline-flex items-center gap-1"><FiMessageCircle className="inline" size={13} />Comments</span></th>
                  <th className="px-5 py-2.5 font-bold text-right"><span className="inline-flex items-center gap-1"><FiShare2 className="inline" size={13} />Shares</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const Icon = PLATFORM_ICONS[it.platform_slug] || FiGrid
                  const brandColor = BRAND_COLORS[it.brand_slug] || '#94a3b8'
                  const platColor = PLATFORM_COLORS[it.platform_slug] || '#64748b'
                  const caption = it.caption || it.title
                  const tags = hashtagsOf(caption)
                  const captionText = caption.replace(HASHTAG_RE, '').trim()
                  const resolved = it.status === 'ok' || it.status === 'partial'
                  const m = it.metrics || {}
                  const src = mediaSrc(it.media_url)
                  const views = viewsOf(m)
                  return (
                    <tr
                      key={it.target_id}
                      onClick={() => navigate(`/insights/${it.target_id}`)}
                      className="border-t border-ink-100 hover:bg-ink-50/50 cursor-pointer transition-colors duration-100"
                      style={{ boxShadow: `inset 3px 0 0 ${brandColor}` }}
                    >
                      <td className="px-5 py-3 max-w-[440px]">
                        <div className="flex items-start gap-3">
                          <div className="relative flex-none">
                            <div className="w-11 h-11 rounded-lg bg-ink-100 overflow-hidden">
                              {src && it.media_kind === 'image' ? (
                                <img src={src} alt="" className="w-full h-full object-cover" />
                              ) : src ? (
                                <video src={src} className="w-full h-full object-cover" muted />
                              ) : null}
                            </div>
                            <span
                              className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full grid place-items-center text-white ring-2 ring-white"
                              style={{ background: platColor, width: 18, height: 18 }}
                            >
                              <Icon size={10} />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold text-ink-800">{fmtDate(it.published_at)}</div>
                            <div className="text-[12.5px] text-ink-600 line-clamp-2 leading-snug mt-0.5">
                              {captionText || '—'}
                              {tags.length > 0 && (
                                <>
                                  {' '}
                                  {tags.map((t) => (
                                    <span key={t} className="text-brand font-medium">{t} </span>
                                  ))}
                                </>
                              )}
                            </div>
                            {!resolved && it.note && (
                              <div className="text-[11px] text-ink-400 mt-0.5 italic truncate">{it.note}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide border ${
                            it.media_kind === 'video'
                              ? 'border-violet-200 bg-violet-50 text-violet-600'
                              : it.media_kind === 'image'
                                ? 'border-blue-200 bg-blue-50 text-blue-600'
                                : 'border-ink-200 bg-ink-50 text-ink-500'
                          }`}
                        >
                          {it.media_kind || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3"><StatusChip resolved={resolved} note={it.note} /></td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-700">
                        {views != null ? views.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-700">
                        {m.likes != null ? m.likes.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-700">
                        {m.comments != null ? m.comments.toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-[13px] font-mono text-right text-ink-700">
                        {m.shares != null ? m.shares.toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Dropdown({ value, onChange, label, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-ink-200 bg-white text-[13px] font-semibold text-ink-700 hover:border-ink-300 focus:outline-none focus:border-brand cursor-pointer"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
        <FiChevronDown size={14} />
      </span>
    </div>
  )
}
