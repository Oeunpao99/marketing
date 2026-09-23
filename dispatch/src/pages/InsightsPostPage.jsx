import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiEye, FiGrid, FiHeart, FiMessageCircle, FiShare2 } from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import {
  BRAND_COLORS,
  PLATFORM_COLORS,
  PLATFORM_ICONS,
  EngagementLineChart,
  avgOf,
  buildInsights,
  engagementOf,
  fmtDate,
  mediaSrc,
  viewsOf,
} from './InsightsPage'

function StatusChip({ resolved, note }) {
  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700"
      title={note || ''}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Needs attention
    </span>
  )
}

function MetricTile({ label, value, avg, icon, tone }) {
  const has = value != null
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-card">
      <div className={`w-9 h-9 rounded-xl grid place-items-center mb-3 ${tone} text-white`}>
        {icon}
      </div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</div>
      <div className="mt-0.5 font-display text-[28px] leading-none text-ink-900 tabular-nums">
        {has ? value.toLocaleString() : '—'}
      </div>
      {has && avg != null ? (
        <div className="mt-1.5 text-[11.5px] text-ink-400">
          avg <span className="font-mono">{Math.round(avg).toLocaleString()}</span>
        </div>
      ) : (
        <div className="mt-1.5 text-[11.5px] text-ink-300">no data</div>
      )}
    </div>
  )
}

export default function InsightsPostPage() {
  const { targetId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [items, setItems] = useState(null)

  useEffect(() => {
    api
      .get('/views/insights?limit=100')
      .then(setItems)
      .catch((e) => showToast(`Could not load insights — ${e.message}`))
  }, [showToast])

  const post = useMemo(
    () => (items || []).find((it) => String(it.target_id) === String(targetId)),
    [items, targetId],
  )

  const series = useMemo(
    () =>
      (items || [])
        .filter((p) => p.status === 'ok' || p.status === 'partial')
        .slice()
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
        .map((p) => ({ id: p.target_id, date: p.published_at, y: engagementOf(p.metrics) })),
    [items],
  )

  const avg = useMemo(
    () => ({
      views: avgOf(items || [], (p) => viewsOf(p.metrics)),
      likes: avgOf(items || [], (p) => (p.metrics || {}).likes),
      comments: avgOf(items || [], (p) => (p.metrics || {}).comments),
      shares: avgOf(items || [], (p) => (p.metrics || {}).shares),
    }),
    [items],
  )

  const insights = useMemo(
    () => (post ? buildInsights(post, series, avg) : []),
    [post, series, avg],
  )

  if (items === null) {
    return <div className="p-5 lg:p-8 w-full text-ink-400 text-[13px] animate-fadein">Loading…</div>
  }

  if (!post) {
    return (
      <div className="p-5 lg:p-8 w-full animate-fadein">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-[15px] font-semibold text-ink-700 mb-2">Post not found</div>
          <Link
            to="/insights"
            className="inline-block px-4 py-2 rounded-xl gradient-brand text-white text-[13px] font-semibold"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  const brandColor = BRAND_COLORS[post.brand_slug] || '#94a3b8'
  const Icon = PLATFORM_ICONS[post.platform_slug] || FiGrid
  const platColor = PLATFORM_COLORS[post.platform_slug] || '#64748b'
  const src = mediaSrc(post.media_url)
  const resolved = post.status === 'ok' || post.status === 'partial'
  const m = post.metrics || {}
  const caption = post.caption || post.title
  const isKhmer = /[ក-៿᧠-᧿]/.test(caption || '')

  const tiles = [
    { label: 'Views', value: viewsOf(m), avg: avg.views, icon: <FiEye size={16} />, tone: 'bg-blue-500' },
    { label: 'Likes', value: m.likes ?? null, avg: avg.likes, icon: <FiHeart size={16} />, tone: 'bg-rose-500' },
    { label: 'Comments', value: m.comments ?? null, avg: avg.comments, icon: <FiMessageCircle size={16} />, tone: 'bg-amber-500' },
    { label: 'Shares', value: m.shares ?? null, avg: avg.shares, icon: <FiShare2 size={16} />, tone: 'bg-violet-500' },
  ]

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <Link
        to="/insights"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 transition-all duration-150 hover:text-ink-900"
      >
        ← Back to Insights
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-7">
        <div className="relative flex-none">
          <div className="w-20 h-20 rounded-2xl bg-ink-100 overflow-hidden ring-1 ring-ink-100">
            {src && post.media_kind === 'image' ? (
              <img src={src} alt="" className="w-full h-full object-cover" />
            ) : src ? (
              <video src={src} className="w-full h-full object-cover" muted />
            ) : null}
          </div>
          <span
            className="absolute -bottom-1 -right-1 rounded-full grid place-items-center text-white ring-2 ring-white"
            style={{ background: platColor, width: 24, height: 24 }}
          >
            <Icon size={13} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: brandColor }} />
            <span className="font-bold text-ink-800">{post.brand_name}</span>
            <span className="text-ink-300">·</span>
            <span className="capitalize text-ink-500">{post.platform_slug}</span>
            <span className="text-ink-300">·</span>
            <span className="text-ink-500">{fmtDate(post.published_at)}</span>
            <StatusChip resolved={resolved} note={post.note} />
          </div>
          <h1
            className={`mt-1.5 text-[14.5px] lg:text-[15px] font-medium leading-relaxed text-ink-800 max-w-[70ch] whitespace-pre-line ${isKhmer ? 'font-khmer' : ''}`}
          >
            {caption || 'Untitled'}
          </h1>
        </div>
        <div className="flex gap-2">
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[13px] font-bold hover:shadow-glow-lg transition-all duration-200"
            >
              View on platform →
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-[13px] font-bold hover:bg-ink-50"
          >
            Back
          </button>
        </div>
      </div>

      {resolved ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {tiles.map((t) => (
            <MetricTile key={t.label} {...t} />
          ))}
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] text-amber-800 leading-relaxed">
          {post.note || 'This post is waiting or failed — no live numbers yet.'}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400">
              Engagement over time
            </span>
            <span className="text-[11.5px] text-ink-400">all posts · this post highlighted</span>
          </div>
          <EngagementLineChart series={series} activeTargetId={post.target_id} brandColor={brandColor} />
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400">Insights</span>
          <ul className="mt-3 space-y-3">
            {resolved ? (
              insights.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-ink-700 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-none" style={{ background: brandColor }} />
                  {line}
                </li>
              ))
            ) : (
              <li className="text-[13.5px] text-ink-500 leading-relaxed italic">
                Insights appear once this post has live numbers.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}