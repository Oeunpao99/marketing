// One post's performance, written for a marketing team: the headline number
// and how it compares with "your usual", where the engagement came from, where
// the post ranks among the same platform's posts, and what to try next. When a
// platform gives no numbers, one plain explanation replaces the charts.
//
// Chart rules (dataviz skill): this post is the accent (slot-1 blue), "your
// usual" is a neutral marker, likes/comments/shares keep the colours they have
// on the Analytics page (SERIES_COLORS, validated); every figure also appears
// as text, so nothing depends on colour alone.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiAward,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiExternalLink,
  FiEye,
  FiGrid,
  FiHash,
  FiImage,
  FiLock,
  FiPercent,
  FiRepeat,
  FiTrash2,
  FiMessageCircle,
  FiTrendingDown,
  FiTrendingUp,
  FiZap,
} from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'
import { isKhmer } from '../lib/format'
import { platformHue, platformIconClass } from '../components/insights/Overview'
import { GrowthCard, MembersCard, MoreFromChannel, PostingTimeCard, PostsTrendCard } from '../components/insights/PostDetail'
import ImproveCard from '../components/insights/ImproveCard'
import RepostDialog from '../components/insights/RepostDialog'
import DeletePostDialog from '../components/insights/DeletePostDialog'
import { OriginBadge, PLATFORM_ICONS, SERIES_COLORS, engagementOf, mediaSrc } from './InsightsPage'
import { DonutWithTable } from '../components/today/DashboardCharts'

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
}
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu
const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

const isResolved = (p) => p.status === 'ok' || p.status === 'partial'
const hasEngagement = (m) => ['likes', 'comments', 'shares'].some((k) => (m || {})[k] != null)
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString())

function avg(values) {
  const v = values.filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** "2.3× your usual" / "40% below your usual" / "about your usual". */
function vsUsual(value, usual) {
  if (value == null || usual == null || !(usual > 0)) return null
  if (value === 0) return { up: false, text: `None yet · usual ${fmt(usual)}` }
  const r = value / usual
  if (r >= 1.15) return { up: true, text: `${r.toFixed(r >= 10 ? 0 : 1)}× your usual` }
  if (r <= 0.85) return { up: false, text: `${Math.round((1 - r) * 100)}% below your usual` }
  return { up: null, text: 'About your usual' }
}


// ── "No numbers yet" — why, in plain words, and what to do ────────────────
function explain(post, platformName) {
  const note = post.note || ''
  if (isResolved(post)) {
    // Live, but the platform gives apps no numbers (e.g. LinkedIn personal posts).
    return {
      icon: FiCheckCircle,
      tone: 'green',
      title: `Live on ${platformName}`,
      body: note || `${platformName} doesn't share this post's numbers with apps.`,
      action: `Open the post on ${platformName} to see its likes, comments and views.`,
    }
  }
  if (post.status === 'waiting') {
    return {
      icon: FiClock,
      tone: 'amber',
      title: `Waiting for someone to post it in ${platformName}`,
      body: note,
      action: `Open the ${platformName} app, find the video in your inbox/drafts and tap Post. Numbers show here soon after.`,
    }
  }
  if (post.status === 'processing') {
    return { icon: FiClock, tone: 'blue', title: `${platformName} is still processing this post`, body: note, action: 'Check back in a few minutes.' }
  }
  if (/private|only me/i.test(note)) {
    return {
      icon: FiLock,
      tone: 'blue',
      title: 'Posted privately — no public numbers',
      body: note,
      action: `Make the video public in ${platformName}, or wait until ContentFlow's ${platformName} app is approved to post publicly.`,
    }
  }
  if (/token|access|auth|reconnect|expired|permission/i.test(note)) {
    return {
      icon: FiAlertTriangle,
      tone: 'amber',
      title: `ContentFlow can't read ${platformName} right now`,
      body: note,
      action: `Reconnect the ${platformName} channel, then refresh this page.`,
      link: { to: '/channels', label: 'Go to Channels' },
    }
  }
  return {
    icon: FiAlertTriangle,
    tone: 'amber',
    title: 'No numbers for this post yet',
    body: note || 'This post is waiting or failed.',
    action: 'If it keeps showing, open the post on the platform to check it went out.',
  }
}

function Explainer({ info, post, platformName }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
  return (
    <section className={`${card} p-6 sm:p-7`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className={`grid h-12 w-12 flex-none place-items-center rounded-2xl ring-1 ${tones[info.tone]}`}>
          <info.icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink-900">{info.title}</h2>
          {info.body && <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{info.body}</p>}
          <div className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-[13px] leading-relaxed text-ink-800">
            <span className="font-semibold">What to do: </span>
            {info.action}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {info.link && (
              <Link to={info.link.to} className="btn-primary">
                {info.link.label}
              </Link>
            )}
            {post.url && (
              <a href={post.url} target="_blank" rel="noreferrer" className="btn-outline">
                Open on {platformName} <FiExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Headline numbers: one compact strip ───────────────────────────────────
function VsText({ v, fallback }) {
  if (!v) return <span className="text-ink-400">{fallback}</span>
  const Icon = v.up === true ? FiTrendingUp : v.up === false ? FiTrendingDown : null
  const tone = v.up === true ? 'text-emerald-700' : v.up === false ? 'text-red-600' : 'text-ink-500'
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {v.text}
    </span>
  )
}

/** Engagement · reach · rate · rank — each with how it compares. */
function KpiStrip({ cells }) {
  return (
    <section className={`${card} grid grid-cols-2 gap-px overflow-hidden bg-ink-100 lg:grid-cols-4`}>
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-5 py-4">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
            <c.icon size={13} className="text-ink-400" aria-hidden="true" />
            {c.label}
          </div>
          <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight tabular-nums text-ink-900">{c.value}</div>
          <div className="mt-0.5 truncate text-[11.5px]">{c.sub}</div>
        </div>
      ))}
    </section>
  )
}

const fmt1 = (n) => (n == null ? '—' : n >= 10 || Number.isInteger(n) ? fmt(n) : n.toFixed(1))

/** Two stacked bars on one scale — this post and your usual post — each
 *  split into likes / comments / shares, so both the total and the mix
 *  compare at a glance. */
function MixVsUsual({ m, usual, platformName }) {
  const keys = ['likes', 'comments', 'shares'].filter((k) => m[k] != null)
  const hasUsual = keys.some((k) => usual[k] != null)
  const rows = [
    { key: 'post', label: 'This post', vals: keys.map((k) => m[k] || 0), faded: false },
    ...(hasUsual ? [{ key: 'usual', label: `Your usual ${platformName} post`, vals: keys.map((k) => usual[k] || 0), faded: true }] : []),
  ]
  const totals = rows.map((r) => r.vals.reduce((a, b) => a + b, 0))
  const max = Math.max(...totals, 1)
  return (
    <div>
      <div className="space-y-4">
        {rows.map((r, ri) => (
          <div key={r.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className={r.faded ? 'text-ink-500' : 'font-medium text-ink-800'}>{r.label}</span>
              <span className="font-semibold tabular-nums text-ink-900">
                {fmt1(totals[ri])} <span className="font-normal text-ink-400">engagement</span>
              </span>
            </div>
            <div className="h-6 rounded-md bg-ink-50">
              <div className="flex h-full gap-[2px]" style={{ width: `${(totals[ri] / max) * 100}%` }}>
                {keys.map((k, i) =>
                  r.vals[i] > 0 ? (
                    <div
                      key={k}
                      className="h-full first:rounded-l-md last:rounded-r-md"
                      style={{ width: `${(r.vals[i] / totals[ri]) * 100}%`, background: SERIES_COLORS[k], opacity: r.faded ? 0.55 : 1 }}
                      title={`${k}: ${fmt1(r.vals[i])}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* the same numbers as text: legend + each part vs usual */}
      <ul className="mt-5 grid gap-2 sm:grid-cols-3">
        {keys.map((k) => (
          <li key={k} className="rounded-xl bg-ink-50/70 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11.5px] capitalize text-ink-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[k] }} aria-hidden="true" />
              {k}
            </div>
            <div className="mt-0.5 text-[16px] font-bold tabular-nums text-ink-900">{fmt(m[k])}</div>
            <div className="truncate text-[11px]">
              <VsText v={vsUsual(m[k], usual[k])} fallback={usual[k] == null ? 'no usual yet' : `usual ${fmt1(usual[k])}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function InsightsPostPage() {
  const { targetId } = useParams()
  const { showToast } = useStore()
  const [items, setItems] = useState(null)
  const [zoom, setZoom] = useState(false)
  const [history, setHistory] = useState(null)
  const [reposting, setReposting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get('/views/insights?limit=100')
      .then(setItems)
      .catch((e) => showToast(`Could not load insights — ${e.message}`))
  }, [showToast])

  // Opening another post from "More from this channel" reuses this page.
  const openPost = (p) => navigate(`/insights/${p.target_id}`)

  // Saved readings over time (app/views.py record_snapshots) for the growth charts.
  useEffect(() => {
    window.scrollTo(0, 0)
    setHistory(null)
    api
      .get(`/views/insights/${targetId}/history`)
      .then(setHistory)
      .catch(() => setHistory({ post: [], channel: [] }))
  }, [targetId])

  const post = useMemo(() => (items || []).find((it) => String(it.target_id) === String(targetId)), [items, targetId])

  // Every post on this platform (any status) — for "when it went out".
  const samePlatform = useMemo(
    () => (items || []).filter((p) => post && p.platform_slug === post.platform_slug && p.published_at),
    [items, post],
  )

  // Everything this post is compared with is the same platform — a Telegram
  // post's reach and a TikTok post's reach aren't the same number.
  const peers = useMemo(
    () => (items || []).filter((p) => isResolved(p) && post && p.platform_slug === post.platform_slug),
    [items, post],
  )

  // Same platform, and only posts that report engagement — mixing in a
  // LinkedIn or Telegram post (no numbers) would plot fake zeros.
  const series = useMemo(
    () =>
      peers
        .filter((p) => hasEngagement(p.metrics))
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
        .map((p) => ({ id: p.target_id, date: p.published_at, y: engagementOf(p.metrics) })),
    [peers],
  )

  if (items === null) {
    return (
      <div className="w-full px-5 lg:px-8 py-7 animate-fadein space-y-6">
        <div className="h-4 w-32 rounded skeleton" />
        <div className={`${card} h-32 skeleton`} />
        <div className={`${card} h-56 skeleton`} />
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
  const brandColor = colorForBrand(post.brand_slug)
  const src = mediaSrc(post.media_url)
  const resolved = isResolved(post)
  const m = post.metrics || {}
  const caption = post.caption || post.title || ''
  const tags = [...new Set(caption.match(HASHTAG_RE) || [])]
  const body = caption.replace(HASHTAG_RE, '').trim()
  const engagement = engagementOf(m)
  const showEngagement = resolved && hasEngagement(m)

  const others = peers.filter((p) => p.target_id !== post.target_id)
  const usualOf = (key) => avg(others.map((p) => (p.metrics || {})[key]))
  const usualEngagement = avg(others.filter((p) => hasEngagement(p.metrics)).map((p) => engagementOf(p.metrics)))
  const rate = m.views ? (engagement / m.views) * 100 : null
  const usualRate = avg(others.filter((p) => (p.metrics || {}).views > 0).map((p) => (engagementOf(p.metrics) / p.metrics.views) * 100))

  // Telegram reports only the whole channel's member count — context, not a
  // per-post number, so it is never compared or ranked.
  const reach =
    m.views != null
      ? { label: 'Views', value: m.views, hint: usualOf('views') != null ? `usual ${fmt(usualOf('views'))}` : 'people who saw it' }
      : m.subscribers != null
        ? { label: 'Channel members', value: m.subscribers, hint: 'Whole channel, not this post' }
        : { label: 'Views', value: null, hint: `not reported by ${platformName}` }


  // Rank by engagement, else views. Platforms with neither can't be ranked.
  const scoreOf = (p) => {
    const pm = p.metrics || {}
    const e = engagementOf(pm)
    return e > 0 ? e : pm.views ?? 0
  }
  const rankable = peers.some((p) => scoreOf(p) > 0)
  const scores = rankable ? peers.map(scoreOf) : []
  const myScore = scoreOf(post)
  const rank = rankable ? [...scores].sort((a, b) => b - a).indexOf(myScore) + 1 : 0
  const showRank = rankable && scores.length >= 2 && rank > 0

  // Plain-language next steps.
  const tips = []
  const topPct = rank > 0 && scores.length > 1 ? Math.max(1, Math.round((rank / scores.length) * 100)) : null
  if (topPct != null && topPct <= 25) tips.push({ icon: FiAward, text: `One of your best ${platformName} posts (top ${topPct}%). Reuse its format, hook or topic in your next few posts.` })
  if (topPct != null && topPct >= 75 && scores.length >= 4) tips.push({ icon: FiTrendingDown, text: `Below most of your ${platformName} posts. Try a stronger first line, a clearer image, or posting at a different time.` })
  if (m.comments === 0) tips.push({ icon: FiMessageCircle, text: 'No comments yet — ending the caption with a question usually gets people replying.' })
  if (m.shares === 0 && (m.likes || 0) > 0) tips.push({ icon: FiZap, text: 'People liked it but nobody shared it. A useful tip, a list or a surprising fact is more shareable.' })
  if (!tags.length) tips.push({ icon: FiHash, text: 'No hashtags — 2–3 relevant tags help new people find it.' })
  if (tags.length > 6) tips.push({ icon: FiHash, text: `${tags.length} hashtags is a lot — 3–5 focused tags usually perform better.` })
  if (!tips.length) tips.push({ icon: FiCheckCircle, text: 'Nothing stands out to fix — keep posting consistently and compare again after a few more posts.' })

  // Clearly below this brand's usual on the platform — the Improve card moves
  // to the top and says so.
  const usualVs = showEngagement ? vsUsual(engagement, usualEngagement) : null
  const weakText =
    usualVs?.up === false
      ? usualVs.text
      : topPct != null && topPct >= 75 && scores.length >= 4
        ? `Below most of your ${platformName} posts`
        : ''
  const improve = caption.trim() !== '' && (
    <ImproveCard key={post.target_id} post={post} platformName={platformName} weakText={weakText} showToast={showToast} />
  )

  const info = !resolved || (!showEngagement && m.views == null && m.subscribers == null) ? explain(post, platformName) : null

  return (
    <div className="w-full px-5 lg:px-8 pt-7 pb-28 animate-fadein">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link to="/insights" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900">
          <FiArrowLeft size={16} /> Back to Analytics
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDeleting(true)} className="btn-ghost px-3 py-1.5 text-red-600 hover:bg-red-50" title="Delete this post from the platform and ContentFlow">
            <FiTrash2 size={14} /> Delete
          </button>
          <button type="button" onClick={() => setReposting(true)} className="btn-outline" title="Post this again — now or later, here or on another channel">
            <FiRepeat size={14} /> Repost
          </button>
        </div>
      </div>
      {reposting && <RepostDialog post={post} onClose={() => setReposting(false)} />}
      {deleting && <DeletePostDialog post={post} onClose={() => setDeleting(false)} onDeleted={() => navigate('/insights')} />}

      <div className="space-y-4">
        {/* The post */}
        <section className={`${card} flex flex-col gap-4 p-4 sm:flex-row`}>
          <button
            type="button"
            onClick={() => src && setZoom(true)}
            className="relative grid h-44 w-full flex-none place-items-center overflow-hidden rounded-xl bg-ink-100 sm:h-28 sm:w-28"
            title={src ? 'View full size' : ''}
          >
            {src && (post.media_kind === 'image' || post.media_thumb) ? (
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : src && post.media_kind === 'video' ? (
              <video src={src} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            ) : (
              <FiImage size={24} className="text-ink-400" />
            )}
            <span className={`absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full ring-2 ring-white ${platformIconClass(slug)}`} style={{ background: platformHue(slug) }}>
              <Icon size={12} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: brandColor }} />
              <span className="font-semibold text-ink-900">{post.brand_name}</span>
              <span className="text-ink-300">·</span>
              <span className="text-ink-600">
                {platformName}
                {post.channel_handle ? ` · ${post.channel_handle}` : ''}
              </span>
              <OriginBadge origin={post.origin} platform={slug} />
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1 text-ink-500">
                <FiCalendar size={12} />
                {new Date(post.published_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })}
              </span>
              <span
                className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  resolved ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {resolved ? <FiCheckCircle size={11} /> : <FiClock size={11} />}
                {resolved ? 'Live' : 'Needs attention'}
              </span>
            </div>
            <p className={`mt-2 line-clamp-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-800 ${isKhmer(body) ? 'font-khmer' : ''}`}>
              {body || <span className="italic text-ink-400">No caption</span>}
            </p>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-medium text-brand">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {post.url && (
            <div className="flex-none sm:w-44">
              <a href={post.url} target="_blank" rel="noreferrer" className="btn-outline w-full">
                View on {platformName} <FiExternalLink size={13} />
              </a>
            </div>
          )}
        </section>

        {zoom && src && (
          <div className="fixed inset-0 z-[100] grid place-items-center bg-night-950/80 p-6 animate-fadein" onClick={() => setZoom(false)}>
            {post.media_kind === 'video' ? (
              <video src={src} className="max-h-[85vh] max-w-full rounded-xl" controls autoPlay onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={src} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
            )}
          </div>
        )}

        {weakText && improve}

        {info ? (
          <>
            <Explainer info={info} post={post} platformName={platformName} />
            <PostingTimeCard post={post} peers={samePlatform} platformName={platformName} />
            <MoreFromChannel post={post} items={items} icons={PLATFORM_ICONS} engagementOf={engagementOf} onOpen={openPost} />
            {!weakText && improve}
          </>
        ) : (
          <>
            {showEngagement ? (
              <>
                <KpiStrip
                  cells={[
                    {
                      icon: FiZap,
                      label: 'Engagement',
                      value: fmt(engagement),
                      sub: <VsText v={vsUsual(engagement, usualEngagement)} fallback="likes + comments + shares" />,
                    },
                    { icon: FiEye, label: reach.label, value: fmt(reach.value), sub: <VsText v={vsUsual(m.views, usualOf('views'))} fallback={reach.hint} /> },
                    {
                      icon: FiPercent,
                      label: 'Engagement rate',
                      value: rate == null ? '—' : `${rate.toFixed(1)}%`,
                      sub: (
                        <span className="text-ink-500">
                          {rate == null ? 'needs views' : usualRate != null ? `usual ${usualRate.toFixed(1)}%` : 'of people who saw it'}
                        </span>
                      ),
                    },
                    {
                      icon: FiAward,
                      label: 'Rank',
                      value: showRank ? `#${rank}` : '—',
                      sub: showRank ? (
                        <span className="text-ink-500">
                          of {scores.length} {platformName} posts ·{' '}
                          <b className="font-semibold text-ink-800">{topPct <= 50 ? `top ${topPct}%` : `bottom ${Math.max(1, 100 - topPct + 1)}%`}</b>
                        </span>
                      ) : (
                        <span className="text-ink-400">needs 2+ posts with numbers</span>
                      ),
                    },
                  ]}
                />

                <div className="grid gap-4 lg:grid-cols-3">
                  <section className={`${card} p-5`}>
                    <h2 className="text-[14.5px] font-semibold tracking-tight text-ink-900">Engagement mix</h2>
                    <p className="mb-4 mt-0.5 text-[12px] text-ink-500">What people did with this post</p>
                    <DonutWithTable
                      size={112}
                      centerLabel="engagement"
                      emptyText="No likes, comments or shares yet — new posts often pick up over the first 24–48 hours."
                      segments={['likes', 'comments', 'shares']
                        .filter((k) => m[k] != null)
                        .map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), value: m[k] || 0, color: SERIES_COLORS[k] }))}
                    />
                  </section>
                  <section className={`${card} p-5 lg:col-span-2`}>
                    <h2 className="text-[14.5px] font-semibold tracking-tight text-ink-900">This post vs your usual</h2>
                    <p className="mb-4 mt-0.5 text-[12px] text-ink-500">
                      Against the average of your other {platformName} posts
                    </p>
                    <MixVsUsual m={m} usual={{ likes: usualOf('likes'), comments: usualOf('comments'), shares: usualOf('shares') }} platformName={platformName} />
                  </section>
                </div>
              </>
            ) : (
              <section className={`${card} p-6`}>
                <div className="text-[12.5px] font-medium text-ink-600">{reach.label}</div>
                <div className="mt-1 text-[44px] font-bold leading-none tracking-tight text-ink-900">{fmt(reach.value)}</div>
                <p className="mt-2 text-[12.5px] text-ink-500">
                  {reach.hint}. {platformName} doesn't share likes, comments or shares with apps
                  {post.url ? ' — open the post to see them.' : '.'}
                </p>
              </section>
            )}

            {/* Over time: this post's own growth, and where it sits among your posts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {showEngagement || m.views != null ? (
                <GrowthCard history={history} publishedAt={post.published_at} seriesColors={SERIES_COLORS} platformName={platformName} />
              ) : m.subscribers != null ? (
                <MembersCard history={history} publishedAt={post.published_at} />
              ) : null}
              {series.length >= 2 && <PostsTrendCard series={series} activeId={post.target_id} usual={usualEngagement} platformName={platformName} />}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <PostingTimeCard post={post} peers={samePlatform} platformName={platformName} />
              <MoreFromChannel post={post} items={items} icons={PLATFORM_ICONS} engagementOf={engagementOf} onOpen={openPost} />
            </div>

            <section className={`${card} p-5`}>
              <h2 className="mb-3 text-[14.5px] font-semibold tracking-tight text-ink-900">What to do next</h2>
              <ol className="grid gap-2.5 sm:grid-cols-2">
                {tips.map((t, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-ink-50/70 px-3.5 py-2.5">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                      <t.icon size={15} aria-hidden="true" />
                    </span>
                    <p className="text-[12.5px] leading-snug text-ink-700">{t.text}</p>
                  </li>
                ))}
              </ol>
            </section>

            {!weakText && improve}
          </>
        )}
      </div>
    </div>
  )
}
