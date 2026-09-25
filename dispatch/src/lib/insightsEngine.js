// Insights & Actions: plain-language findings computed from the workspace's own
// published posts — never invented. Each finding carries its evidence (the two
// averages and how many posts each is based on) and only appears when both
// sides have enough posts to mean something (MIN_POSTS). Times use the Phnom
// Penh clock, like the rest of the app.

const TZ = 'Asia/Phnom_Penh'
export const MIN_POSTS = 2

const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: TZ })

export const hourOf = (iso) => Number(hourFmt.format(new Date(iso))) % 24
export const weekdayOf = (iso) => dayFmt.format(new Date(iso))

const WINDOWS = [
  { id: 'morning', label: 'in the morning (6–11 AM)', short: 'Morning', test: (h) => h >= 6 && h < 11 },
  { id: 'midday', label: 'around lunch (11 AM–2 PM)', short: 'Lunch', test: (h) => h >= 11 && h < 14 },
  { id: 'afternoon', label: 'in the afternoon (2–6 PM)', short: 'Afternoon', test: (h) => h >= 14 && h < 18 },
  { id: 'evening', label: 'in the evening (6–10 PM)', short: 'Evening', test: (h) => h >= 18 && h < 22 },
  { id: 'night', label: 'late at night (10 PM–6 AM)', short: 'Night', test: (h) => h >= 22 || h < 6 },
]
const KIND_LABEL = { video: 'Video', image: 'Image', text: 'Text-only' }

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const ratioText = (r) => `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`
const hasEngagement = (m) => ['likes', 'comments', 'shares'].some((k) => (m || {})[k] != null)

/** Best group vs everyone else, when both sides have enough posts. */
function bestVsRest(groups, score) {
  const entries = Object.entries(groups).filter(([, ps]) => ps.length >= MIN_POSTS)
  if (!entries.length) return null
  let best = null
  for (const [key, ps] of entries) {
    const avg = mean(ps.map(score))
    if (!best || avg > best.avg) best = { key, posts: ps, avg }
  }
  const rest = Object.entries(groups)
    .filter(([k]) => k !== best.key)
    .flatMap(([, ps]) => ps)
  if (rest.length < MIN_POSTS) return null
  const restAvg = mean(rest.map(score))
  return { ...best, rest, restAvg, ratio: restAvg > 0 ? best.avg / restAvg : best.avg > 0 ? Infinity : 1 }
}

/**
 * @param posts  published posts (Analytics rows), already range/brand filtered
 * @param opts   { engagementOf, platformLabels }
 * @returns list of { id, kind, title, detail, evidence:[{label,value,count}], action:{label,to}, strength }
 */
export function buildInsights(posts, { engagementOf, platformLabels = {} }) {
  const scored = posts.filter((p) => (p.status === 'ok' || p.status === 'partial') && hasEngagement(p.metrics))
  const eng = (p) => engagementOf(p.metrics)
  const out = []

  // 1. Format — which kind of post gets the most engagement
  const byKind = {}
  for (const p of scored) (byKind[p.media_kind || 'text'] ||= []).push(p)
  const fmt = bestVsRest(byKind, eng)
  if (fmt && fmt.ratio >= 1.2 && Number.isFinite(fmt.ratio)) {
    const name = KIND_LABEL[fmt.key] || fmt.key
    out.push({
      id: 'format',
      kind: 'format',
      title: `${name} posts get ${ratioText(fmt.ratio)} more engagement than your other posts`,
      detail: `Average ${fmt.avg.toFixed(1)} vs ${fmt.restAvg.toFixed(1)} interactions per post.`,
      evidence: [
        { label: name, value: fmt.avg, count: fmt.posts.length },
        { label: 'Other posts', value: fmt.restAvg, count: fmt.rest.length },
      ],
      action: fmt.key === 'video'
        ? { title: 'Make more video', label: 'Create a video', to: '/ai' }
        : { title: `Make more ${name.toLowerCase()} posts`, label: 'Create a post', to: '/new' },
      strength: fmt.ratio,
    })
  }

  // 2. Timing — which time of day gets the most engagement
  const byWindow = {}
  for (const p of scored) {
    if (!p.published_at) continue
    const w = WINDOWS.find((x) => x.test(hourOf(p.published_at)))
    ;(byWindow[w.id] ||= []).push(p)
  }
  const time = bestVsRest(byWindow, eng)
  if (time && time.ratio >= 1.2 && Number.isFinite(time.ratio)) {
    const w = WINDOWS.find((x) => x.id === time.key)
    out.push({
      id: 'timing',
      kind: 'timing',
      title: `Posts ${w.label} get ${ratioText(time.ratio)} more engagement`,
      detail: `Average ${time.avg.toFixed(1)} vs ${time.restAvg.toFixed(1)} at other times (Phnom Penh time).`,
      evidence: [
        { label: w.short, value: time.avg, count: time.posts.length },
        { label: 'Other times', value: time.restAvg, count: time.rest.length },
      ],
      action: { title: `Post ${w.label.replace(/^(in the|around|late at)\s/, '')}`, label: 'Schedule a post', to: '/new' },
      strength: time.ratio,
    })
  }

  // 3. Platform — where most engagement comes from
  const byPlatform = {}
  for (const p of scored) byPlatform[p.platform_slug] = (byPlatform[p.platform_slug] || 0) + eng(p)
  const total = Object.values(byPlatform).reduce((a, b) => a + b, 0)
  const platforms = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])
  if (platforms.length >= 2 && total > 0) {
    const [slug, value] = platforms[0]
    const share = value / total
    if (share >= 0.5) {
      const name = platformLabels[slug] || slug
      out.push({
        id: 'platform',
        kind: 'platform',
        title: `${name} brings ${Math.round(share * 100)}% of your engagement`,
        detail: `${Math.round(value).toLocaleString()} of ${Math.round(total).toLocaleString()} interactions across ${platforms.length} platforms.`,
        evidence: platforms.slice(0, 3).map(([s, v]) => ({ label: platformLabels[s] || s, value: v, share: v / total })),
        action: { title: `Focus on ${name}`, label: `Post on ${name}`, to: '/new' },
        strength: 1 + share,
      })
    }
  }

  // 4. Questions — do captions that ask something get more comments?
  const withComments = scored.filter((p) => (p.metrics || {}).comments != null)
  const asks = withComments.filter((p) => /\?/.test(p.caption || p.title || ''))
  const tells = withComments.filter((p) => !/\?/.test(p.caption || p.title || ''))
  if (asks.length >= MIN_POSTS && tells.length >= MIN_POSTS) {
    const a = mean(asks.map((p) => p.metrics.comments))
    const b = mean(tells.map((p) => p.metrics.comments))
    if (a > 0 && (b === 0 || a / b >= 1.3)) {
      out.push({
        id: 'questions',
        kind: 'questions',
        title: b === 0 ? 'Only posts that ask a question get comments' : `Posts that ask a question get ${ratioText(a / b)} more comments`,
        detail: `Average ${a.toFixed(1)} vs ${b.toFixed(1)} comments per post.`,
        evidence: [
          { label: 'Asks a question', value: a, count: asks.length },
          { label: 'No question', value: b, count: tells.length },
        ],
        action: { title: 'End with a question', label: 'Write a post', to: '/new' },
        strength: b === 0 ? 3 : a / b,
      })
    }
  }

  // 5. Hashtags — with vs without
  const tagged = scored.filter((p) => /#[\p{L}\p{N}_]+/u.test(p.caption || ''))
  const plain = scored.filter((p) => !/#[\p{L}\p{N}_]+/u.test(p.caption || ''))
  if (tagged.length >= MIN_POSTS && plain.length >= MIN_POSTS) {
    const a = mean(tagged.map(eng))
    const b = mean(plain.map(eng))
    const better = a >= b ? 'with' : 'without'
    const r = better === 'with' ? (b > 0 ? a / b : 0) : a > 0 ? b / a : 0
    if (r >= 1.3) {
      out.push({
        id: 'hashtags',
        kind: 'hashtags',
        title: `Posts ${better} hashtags get ${ratioText(r)} more engagement`,
        detail: `Average ${a.toFixed(1)} with vs ${b.toFixed(1)} without.`,
        evidence: [
          { label: 'With hashtags', value: a, count: tagged.length },
          { label: 'Without', value: b, count: plain.length },
        ],
        action: better === 'with'
          ? { title: 'Keep using hashtags', label: 'Write a post', to: '/new' }
          : { title: 'Try fewer hashtags', label: 'Write a post', to: '/new' },
        strength: r,
      })
    }
  }

  // 6. Rhythm — long gaps between posts
  const times = posts
    .map((p) => (p.published_at ? new Date(p.published_at).getTime() : null))
    .filter(Boolean)
    .sort((a, b) => a - b)
  let gap = 0
  for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1])
  const gapDays = Math.round(gap / 86400000)
  if (times.length >= 3 && gapDays >= 7) {
    out.push({
      id: 'rhythm',
      kind: 'rhythm',
      title: `Your longest break without posting was ${gapDays} days`,
      detail: 'Steady posting keeps you in people’s feeds — Auto-generate can fill the gaps with ideas every day.',
      evidence: [],
      action: { title: 'Keep a steady rhythm', label: 'Set up Auto-generate', to: '/auto' },
      strength: 1.1,
    })
  }

  return out.sort((a, b) => b.strength - a.strength)
}

/** Posts → Views → Engagement → Clicks for the funnel. Views and clicks only
 *  come from platforms that report them, so each step says how many posts
 *  it covers. */
export function buildFunnel(posts, { engagementOf }) {
  const live = posts.filter((p) => p.status === 'ok' || p.status === 'partial')
  const sum = (key) => live.reduce((s, p) => s + ((p.metrics || {})[key] || 0), 0)
  const count = (key) => live.filter((p) => (p.metrics || {})[key] != null).length
  const engaged = live.filter((p) => hasEngagement(p.metrics))
  return [
    { id: 'posts', label: 'Published', value: posts.length, covers: posts.length },
    { id: 'views', label: 'Views', value: sum('views'), covers: count('views') },
    { id: 'engagement', label: 'Engagement', value: engaged.reduce((s, p) => s + engagementOf(p.metrics), 0), covers: engaged.length },
    { id: 'clicks', label: 'Link clicks', value: sum('clicks'), covers: count('clicks') },
  ]
}
