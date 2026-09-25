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
  FiGrid,
  FiHash,
  FiImage,
  FiLock,
  FiMessageCircle,
  FiTrendingDown,
  FiTrendingUp,
  FiZap,
} from 'react-icons/fi'
import { api } from '../api/client'
import { useStore } from '../store'
import { colorForBrand } from '../lib/brandColor'
import { isKhmer } from '../lib/format'
import { platformHue } from '../components/insights/Overview'
import { GrowthCard, MembersCard, MoreFromChannel, PostingTimeCard } from '../components/insights/PostDetail'
import ImproveCard from '../components/insights/ImproveCard'
import { PLATFORM_ICONS, SERIES_COLORS, EngagementLineChart, engagementOf, mediaSrc } from './InsightsPage'

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
}
const ACCENT = '#2a78d6'
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

function VsPill({ v }) {
  if (!v) return null
  const tone = v.up === true ? 'bg-emerald-50 text-emerald-800' : v.up === false ? 'bg-red-50 text-red-700' : 'bg-ink-100 text-ink-600'
  const Icon = v.up === true ? FiTrendingUp : v.up === false ? FiTrendingDown : null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>
      {Icon && <Icon size={13} aria-hidden="true" />}
      {v.text}
    </span>
  )
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

// ── Headline: total engagement + where it came from ───────────────────────
function Headline({ m, engagement, usualEngagement, rate, usualRate, platformName, reach }) {
  const parts = ['likes', 'comments', 'shares'].map((k) => ({ key: k, value: m[k] ?? 0 })).filter((p) => m[p.key] != null)
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <section className={`${card} grid overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}>
      <div className="p-6">
        <div className="text-[12.5px] font-medium text-ink-600">Total engagement</div>
        <div className="mt-1 flex flex-wrap items-end gap-3">
          <span className="text-[52px] font-bold leading-none tracking-tight text-ink-900">{fmt(engagement)}</span>
          <span className="pb-1.5">
            <VsPill v={vsUsual(engagement, usualEngagement)} />
          </span>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-500">
          Likes + comments + shares.{' '}
          {usualEngagement != null ? (
            <>
              Your usual {platformName} post gets <span className="font-semibold text-ink-700">{fmt(usualEngagement)}</span>.
            </>
          ) : (
            `Your first ${platformName} post with numbers — the next ones will be compared with it.`
          )}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniStat label={reach.label} value={fmt(reach.value)} hint={reach.hint} />
          <MiniStat
            label="Engagement rate"
            value={rate == null ? '—' : `${rate.toFixed(1)}%`}
            hint={rate == null ? 'needs views' : usualRate != null ? `usual ${usualRate.toFixed(1)}%` : 'of people who saw it'}
          />
        </div>
      </div>

      <div className="border-t border-ink-100 bg-ink-50/40 p-6 lg:border-l lg:border-t-0">
        <div className="text-[12.5px] font-medium text-ink-600">Where the engagement came from</div>
        {total > 0 ? (
          <>
            {/* part-to-whole: one stacked bar, 2px surface gaps between parts */}
            <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Engagement split">
              {parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: SERIES_COLORS[p.key] }} title={`${p.key}: ${p.value}`} />
                ))}
            </div>
            <ul className="mt-4 space-y-2.5">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-2.5 text-[13px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[p.key] }} aria-hidden="true" />
                  <span className="capitalize text-ink-700">{p.key}</span>
                  <span className="ml-auto font-semibold tabular-nums text-ink-900">{fmt(p.value)}</span>
                  <span className="w-11 text-right text-[12px] tabular-nums text-ink-400">{Math.round((p.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
            No likes, comments or shares yet. New posts often pick up over the first 24–48 hours.
          </p>
        )}
      </div>
    </section>
  )
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white px-3.5 py-3">
      <div className="text-[11.5px] text-ink-500">{label}</div>
      <div className="mt-0.5 text-[20px] font-bold leading-tight text-ink-900">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-ink-400">{hint}</div>}
    </div>
  )
}

// ── This post vs your usual: bars with an "usual" marker ──────────────────
function VsUsualChart({ rows, platformName }) {
  if (!rows.length) return <p className="py-6 text-center text-[12.5px] text-ink-400">No comparable numbers yet.</p>
  return (
    <div>
      <ul className="space-y-4">
        {rows.map((r) => {
          const max = Math.max(r.value, r.usual || 0, 1) * 1.1
          const v = vsUsual(r.value, r.usual)
          return (
            <li key={r.label}>
              <div className="mb-1.5 flex items-baseline gap-2 text-[12.5px]">
                <span className="font-medium text-ink-800">{r.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-ink-900">{fmt(r.value)}</span>
                <span className={`w-36 text-right text-[11.5px] ${v?.up === true ? 'text-emerald-700' : v?.up === false ? 'text-red-600' : 'text-ink-400'}`}>
                  {v ? v.text : r.usual == null ? 'no usual yet' : ''}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-ink-100">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: ACCENT }} />
                {r.usual != null && (
                  <span
                    className="absolute -top-1 h-5 w-[3px] rounded-full bg-ink-800 ring-2 ring-white"
                    style={{ left: `calc(${(r.usual / max) * 100}% - 1.5px)` }}
                    title={`Your usual: ${fmt(r.usual)}`}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex items-center gap-4 text-[11.5px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full" style={{ background: ACCENT }} aria-hidden="true" /> This post
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-[3px] rounded-full bg-ink-800" aria-hidden="true" /> Your usual {platformName} post
        </span>
      </div>
    </div>
  )
}

// ── Ranking: every same-platform post as a dot, this one highlighted ──────
function RankStrip({ scores, mine, rank, platformName }) {
  const n = scores.length
  if (n < 2 || rank < 1) {
    return (
      <p className="py-4 text-[12.5px] leading-relaxed text-ink-500">
        {n < 2 ? `Ranking starts once you have 2+ ${platformName} posts with numbers.` : `${platformName} doesn't report per-post numbers, so posts can't be ranked.`}
      </p>
    )
  }
  const max = Math.max(...scores, 1)
  const topPct = Math.max(1, Math.round((rank / n) * 100))
  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="text-[36px] font-bold leading-none tracking-tight text-ink-900">#{rank}</span>
        <span className="pb-1 text-[13px] text-ink-600">
          of {n} {platformName} posts ·{' '}
          <span className="font-semibold text-ink-900">
            {topPct <= 50 ? `top ${topPct}%` : `bottom ${Math.max(1, Math.round(((n - rank + 1) / n) * 100))}%`}
          </span>
        </span>
      </div>
      {/* dot strip: position = engagement; ranks read left (low) → right (high) */}
      <div className="relative mt-6 h-10" role="img" aria-label={`Rank ${rank} of ${n}`}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-[#c3c2b7]" />
        {scores.map((s, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-300 ring-2 ring-white"
            style={{ left: `${(s / max) * 100}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white shadow"
          style={{ left: `${(mine / max) * 100}%`, background: ACCENT }}
        />
        <span
          className="absolute -top-3 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
          style={{ left: `clamp(24px, ${(mine / max) * 100}%, calc(100% - 24px))` }}
        >
          This post
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-400">
        <span>Fewer interactions</span>
        <span>More</span>
      </div>
    </div>
  )
}

export default function InsightsPostPage() {
  const { targetId } = useParams()
  const { showToast } = useStore()
  const [items, setItems] = useState(null)
  const [zoom, setZoom] = useState(false)
  const [history, setHistory] = useState(null)
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

  const compareRows = [
    { label: 'Views', value: m.views, usual: usualOf('views') },
    { label: 'Likes', value: m.likes, usual: usualOf('likes') },
    { label: 'Comments', value: m.comments, usual: usualOf('comments') },
    { label: 'Shares', value: m.shares, usual: usualOf('shares') },
  ].filter((r) => r.value != null)

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
      <Link to="/insights" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900">
        <FiArrowLeft size={16} /> Back to Analytics
      </Link>

      <div className="space-y-6">
        {/* The post */}
        <section className={`${card} flex flex-col gap-4 p-4 sm:flex-row`}>
          <button
            type="button"
            onClick={() => src && setZoom(true)}
            className="relative grid h-44 w-full flex-none place-items-center overflow-hidden rounded-xl bg-ink-100 sm:h-32 sm:w-32"
            title={src ? 'View full size' : ''}
          >
            {src && post.media_kind === 'image' ? (
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : src && post.media_kind === 'video' ? (
              <video src={src} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            ) : (
              <FiImage size={24} className="text-ink-400" />
            )}
            <span className="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full text-white ring-2 ring-white" style={{ background: platformHue(slug) }}>
              <Icon size={12} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: brandColor }} />
              <span className="font-semibold text-ink-900">{post.brand_name}</span>
              <span className="text-ink-300">·</span>
              <span className="text-ink-600">{platformName}</span>
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
              <a href={post.url} target="_blank" rel="noreferrer" className="btn-primary w-full">
                View on {platformName} <FiExternalLink size={13} />
              </a>
            </div>
          )}
        </section>

        {zoom && src && (
          <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-950/80 p-6 animate-fadein" onClick={() => setZoom(false)}>
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
              <Headline
                m={m}
                engagement={engagement}
                usualEngagement={usualEngagement}
                rate={rate}
                usualRate={usualRate}
                platformName={platformName}
                reach={reach}
              />
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

            {/* Over time: this post's own numbers, or (Telegram) the channel's members */}
            {showEngagement || m.views != null ? (
              <GrowthCard history={history} publishedAt={post.published_at} seriesColors={SERIES_COLORS} platformName={platformName} />
            ) : m.subscribers != null ? (
              <MembersCard history={history} publishedAt={post.published_at} />
            ) : null}

            {(compareRows.length > 0 || showRank) && (
              <div className={`grid gap-6 ${compareRows.length > 0 && showRank ? 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : ''}`}>
                {compareRows.length > 0 && (
                  <section className={`${card} p-5`}>
                    <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Compared with your usual</h2>
                    <p className="mb-5 mt-0.5 text-[12px] text-ink-500">This post against your average {platformName} post.</p>
                    <VsUsualChart rows={compareRows} platformName={platformName} />
                  </section>
                )}
                {/* Only when there's a real ranking — no "needs more posts" placeholder */}
                {showRank && (
                  <section className={`${card} p-5`}>
                    <h2 className="mb-4 text-[15.5px] font-semibold tracking-tight text-ink-900">Ranking</h2>
                    <RankStrip scores={scores} mine={myScore} rank={rank} platformName={platformName} />
                  </section>
                )}
              </div>
            )}

            {series.length >= 2 && (
              <section className={`${card} p-5`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">Your {platformName} posts over time</h2>
                  <span className="text-[11.5px] text-ink-500">engagement per post · this one highlighted</span>
                </div>
                <EngagementLineChart series={series} activeTargetId={post.target_id} brandColor={ACCENT} height={280} />
              </section>
            )}

            <PostingTimeCard post={post} peers={samePlatform} platformName={platformName} />

            <MoreFromChannel post={post} items={items} icons={PLATFORM_ICONS} engagementOf={engagementOf} onOpen={openPost} />

            <section className={`${card} p-5`}>
              <h2 className="mb-4 text-[15.5px] font-semibold tracking-tight text-ink-900">What to do next</h2>
              <ol className="grid gap-3 sm:grid-cols-2">
                {tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                      <t.icon size={15} aria-hidden="true" />
                    </span>
                    <p className="text-[12.5px] leading-relaxed text-ink-700">{t.text}</p>
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
