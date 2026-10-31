import { ModelDonut, SpendLine } from '../../pages/admin/AdminCharts'
import { fmtNum } from './Overview'

/** The boosts' own numbers, drawn like the admin AI usage page: four tiles, each
 *  boosted post's spend (or reach) per day, where the money went, and which post
 *  reached the most people. Each post is a series in a fixed colour (--series-1…5,
 *  index.css); past five, the rest fold into "Other boosts". */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const SLOTS = 5
const MEASURES = [
  { id: 'spend', label: 'Spent $', money: true },
  { id: 'reach', label: 'Reached' },
]
const usd = (n) => `$${Number(n || 0).toFixed(2)}`

/** Every day from the first boost day to the last (gaps filled with 0), each key's numbers on it. */
function byDay(series) {
  const days = series.flatMap((s) => s.daily.map((d) => d.day)).sort()
  if (!days.length) return []
  const out = []
  for (let d = new Date(`${days[0]}T00:00:00Z`); d <= new Date(`${days[days.length - 1]}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    const models = {}
    for (const s of series) {
      const hits = s.daily.filter((x) => x.day === day)
      models[s.key] = { spend: hits.reduce((a, x) => a + x.spend, 0), reach: hits.reduce((a, x) => a + x.reach, 0) }
    }
    out.push({ day, models })
  }
  return out
}

export default function BoostInsights({ boosts }) {
  if (!boosts.length) return null
  const spent = boosts.reduce((a, b) => a + b.spend_usd, 0)
  const reach = boosts.reduce((a, b) => a + b.reach, 0)
  const engaged = boosts.reduce((a, b) => a + b.engaged, 0)
  const live = boosts.filter((b) => b.status === 'running' || b.status === 'in_review').length

  // the five that spent the most are their own series; the rest are "Other boosts"
  const ranked = [...boosts].sort((a, b) => b.spend_usd - a.spend_usd)
  const named = ranked.slice(0, SLOTS)
  const rest = ranked.slice(SLOTS)
  const series = named.map((b) => ({ key: String(b.id), name: b.title, daily: b.daily || [], spend: b.spend_usd }))
  if (rest.length) {
    series.push({ key: 'other', name: `Other boosts (${rest.length})`, daily: rest.flatMap((b) => b.daily || []), spend: rest.reduce((a, b) => a + b.spend_usd, 0) })
  }
  const slot = Object.fromEntries(series.map((s, i) => [s.key, i]))
  const color = (k) => (k === 'other' ? 'rgb(var(--ink-400))' : `var(--series-${(slot[k] ?? 0) + 1})`)
  const short = (t) => (t.length > 26 ? `${t.slice(0, 25)}…` : t)
  const label = (k) => short(series.find((s) => s.key === k)?.name || '')
  const daily = byDay(series)
  const top = [...boosts].sort((a, b) => b.reach - a.reach).slice(0, 6)
  const maxReach = Math.max(1, ...top.map((b) => b.reach))

  const tiles = [
    { label: 'Spent', value: usd(spent), sub: `${live} running now` },
    { label: 'People reached', value: fmtNum(reach), sub: `from ${boosts.length} boost${boosts.length === 1 ? '' : 's'}` },
    { label: 'Engaged', value: fmtNum(engaged), sub: 'reactions, comments, shares, clicks' },
    { label: 'Cost per engagement', value: engaged ? usd(spent / engaged) : '—', sub: reach ? `${usd((spent / reach) * 1000)} per 1,000 people` : 'once it starts' },
  ]

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`${card} px-5 py-4`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{t.label}</div>
            <div className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-ink-900">{t.value}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-400">{t.sub}</div>
          </div>
        ))}
      </div>

      <section className={`${card} px-5 py-4`}>
        <h3 className="mb-3 text-[13.5px] font-semibold text-ink-900">Per day, by boosted post</h3>
        {daily.length ? (
          <SpendLine daily={daily} keys={series.map((s) => s.key)} label={label} color={color} measures={MEASURES} what="by boosted post" />
        ) : (
          <p className="py-6 text-center text-[12.5px] text-ink-400">The daily numbers appear once Facebook approves the ad and it starts spending.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${card} px-5 py-4`}>
          <h3 className="mb-3 text-[13.5px] font-semibold text-ink-900">Where the money went</h3>
          <ModelDonut
            models={series.map((s) => ({ model: s.key, charged: s.spend }))}
            label={label}
            color={color}
            unit="spent"
            what="by boosted post"
            empty="Nothing spent yet."
          />
        </section>
        <section className={`${card} px-5 py-4`}>
          <h3 className="mb-3 text-[13.5px] font-semibold text-ink-900">Most people reached</h3>
          <ul className="space-y-2.5">
            {top.map((b) => (
              <li key={b.id} className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] items-center gap-3 text-[12px]" title={`${b.title}: ${b.reach.toLocaleString()} people · ${usd(b.spend_usd)} spent`}>
                <span className="truncate font-semibold text-ink-800">{b.title}</span>
                <span className="flex items-center gap-2">
                  <span className="h-3.5 rounded-[4px] bg-brand" style={{ width: `${Math.max(2, (b.reach / maxReach) * 100)}%` }} />
                  <span className="flex-none font-semibold tabular-nums text-ink-700">{fmtNum(b.reach)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
