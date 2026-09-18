import { useEffect, useMemo, useState } from 'react'
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

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }

const PLATFORM_ICONS = {
  facebook: SiFacebook,
  instagram: SiInstagram,
  telegram: SiTelegram,
  tiktok: SiTiktok,
  youtube: SiYoutube,
}

const PLATFORM_COLORS = {
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

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function mediaSrc(url) {
  if (!url) return null
  const base = window.location.port === '5173' ? 'http://localhost:8000' : ''
  return `${base}${url}`
}

/** engagement = the sum of whatever counts we actually have for that platform. */
function engagementOf(metrics) {
  const { likes = 0, comments = 0, shares = 0 } = metrics || {}
  return likes + comments + shares
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

export default function InsightsPage() {
  const { brands, showToast } = useStore()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [rangeId, setRangeId] = useState('28')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(null)

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
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-ink-50/60 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-2.5 font-bold">Post</th>
                  <th className="px-3 py-2.5 font-bold">Type</th>
                  <th className="px-3 py-2.5 font-bold text-right">Engagement</th>
                  <th className="px-3 py-2.5 font-bold text-right"><FiEye className="inline" size={13} /></th>
                  <th className="px-3 py-2.5 font-bold text-right"><FiHeart className="inline" size={13} /></th>
                  <th className="px-3 py-2.5 font-bold text-right"><FiMessageCircle className="inline" size={13} /></th>
                  <th className="px-5 py-2.5 font-bold text-right"><FiShare2 className="inline" size={13} /></th>
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
                  return (
                    <tr
                      key={it.target_id}
                      onClick={() => setOpen(it)}
                      className="border-t border-ink-100 hover:bg-ink-50/50 cursor-pointer transition-colors duration-100"
                      style={{ boxShadow: `inset 3px 0 0 ${brandColor}` }}
                    >
                      <td className="px-5 py-3 max-w-[420px]">
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
                              {captionText}
                              {tags.length > 0 && (
                                <>
                                  {' '}
                                  {tags.map((t) => (
                                    <span key={t} className="text-brand font-medium">{t} </span>
                                  ))}
                                </>
                              )}
                            </div>
                            {!resolved && (
                              <div className="text-[11px] text-ink-400 mt-0.5 italic">{it.note}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-ink-400 italic capitalize">{it.media_kind || '—'}</td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-800">
                        {resolved ? engagementOf(m).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-600">
                        {m.views != null ? m.views.toLocaleString() : m.subscribers != null ? m.subscribers.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-600">
                        {m.likes != null ? m.likes.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-mono text-right text-ink-600">
                        {m.comments != null ? m.comments.toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-[13px] font-mono text-right text-ink-600">
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

      {/* Detail panel */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadein"
          onClick={() => setOpen(null)}
        >
          <div className="bg-white rounded-3xl overflow-hidden max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 lg:p-6 flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-[12.5px] text-ink-500 flex-wrap">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: BRAND_COLORS[open.brand_slug] || '#94a3b8' }} />
                <span className="font-semibold text-ink-800">{open.brand_name}</span>
                <span className="text-ink-300">·</span>
                <span className="capitalize">{open.platform_slug}</span>
                <span className="ml-auto text-ink-400">{fmtDate(open.published_at)}</span>
              </div>
              <p className="mt-3 text-[13.5px] text-ink-700 leading-relaxed whitespace-pre-line overflow-y-auto flex-1 pr-1">
                {open.caption || open.title}
              </p>
              {open.note && <div className="mt-3 text-[12px] text-ink-400 italic">{open.note}</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {open.url && (
                  <a
                    href={open.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[13px] font-bold hover:shadow-glow-lg transition-all duration-200"
                  >
                    View on platform →
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="ml-auto px-4 py-2.5 rounded-xl text-ink-500 text-[13px] font-bold hover:bg-ink-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
