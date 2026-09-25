import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  FiArrowLeft,
  FiAward,
  FiCalendar,
  FiEye,
  FiExternalLink,
  FiGrid,
  FiHeart,
  FiImage,
  FiMessageCircle,
  FiShare2,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'
import { isKhmer } from '../lib/format'
import CircularProgress from '../components/ui/CircularProgress'
import {
  PLATFORM_COLORS,
  PLATFORM_ICONS,
  EngagementLineChart,
  engagementOf,
  mediaSrc,
} from './InsightsPage'

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu

const isResolved = (p) => p.status === 'ok' || p.status === 'partial'

function avg(values) {
  const v = values.filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

/** One metric, compared against the same platform's average — or an honest
 * "not reported" when that platform's API simply doesn't return it. */
function MetricCard({ icon: Icon, label, value, average, tint, platformName, channelWide }) {
  const has = value != null
  const diff = has && average != null && average > 0 ? ((value - average) / average) * 100 : null
  const up = diff != null && diff >= 0
  return (
    <div className={`${card} p-4 relative overflow-hidden`}>
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `${tint}14`, color: tint }}>
          <Icon size={17} />
        </span>
        {diff != null && Math.abs(diff) >= 0.5 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
              up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {up ? <FiTrendingUp size={12} /> : <FiTrendingDown size={12} />}
            {up ? '+' : ''}
            {diff.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-[12px] text-ink-600">{label}</div>
      {has ? (
        <>
          <div className="mt-1 text-[26px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">
            {value.toLocaleString()}
          </div>
          <div className="mt-2 text-[11px] text-ink-500">
            {channelWide ? (
              'Whole channel, incl. admins & bot — not this post'
            ) : average != null ? (
              <>
                {platformName} average <span className="font-semibold text-ink-700">{Math.round(average).toLocaleString()}</span>
              </>
            ) : (
              'First post with this number'
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-[26px] font-bold text-ink-300 leading-none">—</div>
          <div className="mt-2 text-[11px] text-ink-400">Not reported by {platformName}</div>
        </>
      )}
    </div>
  )
}

/** This post's bar vs the platform-average bar, per metric it actually has. */
function CompareBars({ rows, color }) {
  if (!rows.length) {
    return <div className="py-8 text-center text-[12px] text-ink-400">No comparable numbers yet.</div>
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const max = Math.max(r.value, r.average || 0, 1)
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-[12px] mb-1.5">
              <span className="font-medium text-ink-800">{r.label}</span>
              <span className="text-ink-500 tabular-nums">
                <span className="font-semibold text-ink-900">{r.value.toLocaleString()}</span>
                {r.average != null && <> vs {Math.round(r.average).toLocaleString()}</>}
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
              </div>
              {r.average != null && (
                <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-ink-300 transition-all duration-700" style={{ width: `${(r.average / max) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-4 pt-1 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> This post
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-ink-300" /> Platform average
        </span>
      </div>
    </div>
  )
}

export default function InsightsPostPage() {
  const { targetId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [items, setItems] = useState(null)
  const [zoom, setZoom] = useState(false)

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

  // Everything this post gets compared against is the same platform — a
  // Telegram post's reach and a TikTok post's reach aren't the same number.
  const peers = useMemo(
    () => (items || []).filter((p) => isResolved(p) && post && p.platform_slug === post.platform_slug),
    [items, post],
  )

  const series = useMemo(
    () =>
      (items || [])
        .filter(isResolved)
        .slice()
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
        .map((p) => ({ id: p.target_id, date: p.published_at, y: engagementOf(p.metrics) })),
    [items],
  )

  if (items === null) {
    return (
      <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
        <div className="h-4 w-32 rounded skeleton mb-6" />
        <div className="grid xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
          <div className={`${card} p-4 space-y-3`}>
            <div className="aspect-[4/5] rounded-xl skeleton" />
            <div className="h-3 w-3/4 rounded skeleton" />
            <div className="h-3 w-1/2 rounded skeleton" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 content-start">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${card} p-4 space-y-3`}>
                <div className="h-9 w-9 rounded-xl skeleton" />
                <div className="h-3 w-20 rounded skeleton" />
                <div className="h-6 w-14 rounded skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-[14px] font-semibold text-ink-700 mb-3">Post not found</div>
          <Link to="/insights" className="btn-primary">
            Back to Analytics
          </Link>
        </div>
      </div>
    )
  }

  const slug = post.platform_slug
  const platformName = PLATFORM_NAMES[slug] || slug
  const Icon = PLATFORM_ICONS[slug] || FiGrid
  const platColor = PLATFORM_COLORS[slug] || '#64748b'
  const brandColor = colorForBrand(post.brand_slug)
  const src = mediaSrc(post.media_url)
  const resolved = isResolved(post)
  const m = post.metrics || {}
  const caption = post.caption || post.title || ''
  const tags = [...new Set(caption.match(HASHTAG_RE) || [])]
  const body = caption.replace(HASHTAG_RE, '').trim()
  const engagement = engagementOf(m)

  const avgOf = (key) => avg(peers.filter((p) => p.target_id !== post.target_id).map((p) => (p.metrics || {})[key]))
  const averages = {
    views: avgOf('views'),
    subscribers: avgOf('subscribers'),
    likes: avgOf('likes'),
    comments: avgOf('comments'),
    shares: avgOf('shares'),
  }

  // Telegram only reports the whole channel's member count — the same number
  // on every post — so it's shown as channel context, never compared against
  // an "average" or used to rank posts.
  const reach =
    m.views != null
      ? { label: 'Views', icon: FiEye, value: m.views, average: averages.views }
      : { label: 'Channel members', icon: FiUsers, value: m.subscribers ?? null, average: null, channelWide: true }

  const metrics = [
    { ...reach, tint: '#1A6FC4' },
    { label: 'Likes', icon: FiHeart, value: m.likes ?? null, average: averages.likes, tint: '#E4405F' },
    { label: 'Comments', icon: FiMessageCircle, value: m.comments ?? null, average: averages.comments, tint: '#F08A5D' },
    { label: 'Shares', icon: FiShare2, value: m.shares ?? null, average: averages.shares, tint: '#86A41E' },
  ]
  const noNumbers = metrics.every((x) => x.value == null)

  // Rank among same-platform posts by engagement, else per-post views. A
  // platform with neither (Telegram) can't be ranked — every post would tie.
  const scoreOf = (p) => {
    const pm = p.metrics || {}
    const e = engagementOf(pm)
    return e > 0 ? e : pm.views ?? 0
  }
  const rankable = peers.some((p) => scoreOf(p) > 0)
  const ranked = rankable ? peers.map(scoreOf).sort((a, b) => b - a) : []
  const myScore = scoreOf(post)
  const rank = rankable ? ranked.indexOf(myScore) + 1 : 0
  const topPct = rank > 0 && ranked.length ? Math.max(1, Math.round((rank / ranked.length) * 100)) : null

  const compareRows = metrics
    .filter((x) => x.value != null && !x.channelWide)
    .map((x) => ({ label: x.label, value: x.value, average: x.average }))

  const rate = m.views ? (engagement / m.views) * 100 : null

  const insights = []
  if (rank > 0 && ranked.length > 1) insights.push({ icon: FiAward, text: `#${rank} of ${ranked.length} ${platformName} posts — top ${topPct}%.` })
  for (const x of metrics) {
    if (x.value == null || x.average == null || !(x.average > 0)) continue
    const r = x.value / x.average
    if (r >= 1.25) insights.push({ icon: FiTrendingUp, text: `${x.label} are ${r.toFixed(1)}× your ${platformName} average.` })
    else if (r <= 0.6) insights.push({ icon: FiTrendingDown, text: `${x.label} trail at ${Math.round(r * 100)}% of your ${platformName} average.` })
  }
  if (m.comments === 0) insights.push({ icon: FiMessageCircle, text: 'No comments yet — ending the caption with a question usually nudges replies.' })
  if (m.likes == null && m.comments == null && m.shares == null) {
    insights.push({ icon: FiZap, text: `${platformName} doesn't report likes, comments or shares through its API — reach is the one number available here.` })
  }
  if (!tags.length) insights.push({ icon: FiZap, text: 'No hashtags on this one — 2–3 relevant tags help it get found.' })

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <Link
        to="/insights"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900"
      >
        <FiArrowLeft size={16} /> Back to Analytics
      </Link>

      <div className="space-y-6">
        {/* Post header: small thumbnail + caption, so the numbers stay in view */}
        <section className={`${card} p-4 flex flex-col sm:flex-row gap-4`}>
          <button
            type="button"
            onClick={() => src && setZoom(true)}
            className="relative flex-none w-full sm:w-28 h-40 sm:h-28 rounded-xl overflow-hidden bg-ink-100 grid place-items-center"
            title={src ? 'View full size' : ''}
          >
            {src && post.media_kind === 'image' ? (
              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : src && post.media_kind === 'video' ? (
              <video src={src} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
            ) : (
              <FiImage size={24} className="text-ink-400" />
            )}
            <span
              className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full grid place-items-center text-white ring-2 ring-white"
              style={{ background: platColor }}
            >
              <Icon size={12} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: brandColor }} />
              <span className="font-semibold text-ink-900">{post.brand_name}</span>
              <span className="text-ink-300">·</span>
              <span className="text-ink-600">{platformName}</span>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1 text-ink-500">
                <FiCalendar size={12} />
                {new Date(post.published_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="inline-flex items-center gap-1.5 ml-1 text-ink-700 font-medium" title={post.note || ''}>
                <span className={`w-2 h-2 rounded-full ${resolved ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                {resolved ? 'Live' : 'Needs attention'}
              </span>
            </div>
            <p className={`mt-2 text-[13px] text-ink-800 leading-relaxed line-clamp-3 whitespace-pre-line ${isKhmer(body) ? 'font-khmer' : ''}`}>
              {body || <span className="text-ink-400 italic">No caption</span>}
            </p>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="text-[11.5px] font-medium text-brand">{t}</span>
                ))}
              </div>
            )}
          </div>

          <div className="flex sm:flex-col gap-2 sm:w-44 flex-none">
            {post.url && (
              <a href={post.url} target="_blank" rel="noreferrer" className="btn-primary flex-1 sm:flex-none">
                View on {platformName} <FiExternalLink size={13} />
              </a>
            )}
            <button type="button" onClick={() => navigate('/insights')} className="btn-outline flex-1 sm:flex-none">
              All posts
            </button>
          </div>
        </section>

        {zoom && src && (
          <div className="fixed inset-0 z-[100] bg-ink-950/80 grid place-items-center p-6 animate-fadein" onClick={() => setZoom(false)}>
            {post.media_kind === 'video' ? (
              <video src={src} className="max-h-[85vh] max-w-full rounded-xl" controls autoPlay onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={src} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
            )}
          </div>
        )}

        {/* Performance */}
        <div className="min-w-0 space-y-6">
          {!resolved && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[12.5px] text-amber-800 leading-relaxed">
              {post.note || 'This post is waiting or failed — no live numbers yet.'}
            </div>
          )}

          {/* Live but no numbers at all (LinkedIn personal posts): one plain
              explanation instead of four "—" cards and empty charts. */}
          {resolved && noNumbers ? (
            <section className={`${card} p-6 flex flex-col items-center text-center`}>
              <span className="w-11 h-11 rounded-xl grid place-items-center text-white" style={{ background: platColor }}>
                <Icon size={20} />
              </span>
              <h2 className="mt-3 text-[15.5px] font-semibold text-ink-900 tracking-tight">This post is live on {platformName}</h2>
              <p className="mt-1.5 max-w-md text-[12.5px] text-ink-600 leading-relaxed">
                {post.note || `${platformName} doesn't share this post's numbers with apps.`}
              </p>
              {post.url && (
                <a href={post.url} target="_blank" rel="noreferrer" className="btn-primary mt-4">
                  See likes &amp; comments on {platformName} <FiExternalLink size={13} />
                </a>
              )}
            </section>
          ) : (
          <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((x) => (
              <MetricCard key={x.label} {...x} platformName={platformName} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <section className={`${card} p-5`}>
              <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">This post vs your average</h2>
              <p className="text-[12px] text-ink-500 mt-0.5 mb-5">Compared with your other {platformName} posts.</p>
              <CompareBars rows={compareRows} color={brandColor} />
            </section>

            <section className={`${card} p-5 flex flex-col items-center text-center`}>
              <h2 className="self-start text-[15.5px] font-semibold text-ink-900 tracking-tight">Ranking</h2>
              <div className="my-5">
                <CircularProgress
                  percent={topPct != null ? 100 - topPct + 1 : 0}
                  size={148}
                  stroke={12}
                  color={brandColor}
                  trackColor="#EDEFF3"
                >
                  <div>
                    <div className="text-[27.5px] font-bold text-ink-900 leading-none">{rank > 0 ? `#${rank}` : '—'}</div>
                    <div className="text-[11px] text-ink-500 mt-1">of {ranked.length || 0}</div>
                  </div>
                </CircularProgress>
              </div>
              <div className="text-[12.5px] text-ink-700">
                {topPct != null && ranked.length > 1 ? (
                  <>
                    Top <span className="font-semibold text-ink-900">{topPct}%</span> of {platformName} posts
                  </>
                ) : !rankable ? (
                  `${platformName} doesn't report per-post numbers, so posts can't be ranked`
                ) : (
                  'Needs more posts to rank against'
                )}
              </div>
              {rate != null && (
                <div className="mt-4 w-full rounded-xl bg-ink-50 px-3 py-2.5 flex items-center justify-between text-[12px]">
                  <span className="text-ink-600">Engagement rate</span>
                  <span className="font-bold text-ink-900">{rate.toFixed(1)}%</span>
                </div>
              )}
            </section>
          </div>

          <section className={`${card} p-5`}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">Where it sits over time</h2>
              <span className="text-[11.5px] text-ink-500">every post's engagement · this one highlighted</span>
            </div>
            <EngagementLineChart series={series} activeTargetId={post.target_id} brandColor={brandColor} height={300} />
          </section>

          <section className={`${card} p-5`}>
            <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight mb-4">Insights</h2>
            {resolved && insights.length ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {insights.map((x, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                    <span className="w-8 h-8 rounded-lg grid place-items-center flex-none bg-brand-soft text-brand">
                      <x.icon size={15} />
                    </span>
                    <p className="text-[12.5px] text-ink-700 leading-relaxed">{x.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-500">Insights appear once this post has live numbers.</p>
            )}
          </section>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
