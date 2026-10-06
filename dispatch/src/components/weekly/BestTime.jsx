import { useEffect, useState } from 'react'

// "Best time to post": for each channel, how the audience reacted in each
// weekday × time window (backend weekly.best_time — the same posts, weights
// and windows the AI learns from; 100 = the channel's best slot).

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SHORT = { morning: '06–11', midday: '11–14', afternoon: '14–18', evening: '18–22', night: '22–06' }
const NAME = { morning: 'morning', midday: 'around lunch', afternoon: 'afternoon', evening: 'evening', night: 'late at night' }

export default function BestTime({ data }) {
  const slugs = Object.keys(data?.platforms || {})
  const [slug, setSlug] = useState(slugs[0] || '')
  useEffect(() => {
    if (!slugs.includes(slug)) setSlug(slugs[0] || '')
  }, [slugs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const p = data?.platforms?.[slug]
  const windows = data?.windows || []
  const top = new Set((p?.top || []).map(([d, w]) => `${d}-${w}`))
  const best = (p?.top || []).slice(0, 3).map(([d, w]) => `${FULL[d]} ${NAME[w]}`)

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">Best time to post</h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            {data?.with_leads
              ? `Score = how much your audience reacts at that time × how often leads arrive then (${data.leads} leads, last ${data.lead_days} days)`
              : 'Score = how much your audience reacted to posts at that time (last 90 days, newer posts count more) · leads join the score once 5 have come in'}
          </p>
        </div>
        {slugs.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {slugs.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === slug}
                onClick={() => setSlug(s)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
                  s === slug ? 'border-brand bg-brand text-white' : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                }`}
              >
                {data.platforms[s].name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!p ? (
        <p className="py-8 text-center text-[12.5px] text-ink-500">
          Not enough results yet. Once your posts have likes and comments, the best times show up here.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center">
              <thead>
                <tr>
                  <th className="w-12" />
                  {windows.map((w) => (
                    <th key={w.key} className="pb-1 font-mono text-[11px] font-medium text-ink-500">
                      {SHORT[w.key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d, wd) => (
                  <tr key={d}>
                    <th className="pr-1 text-left text-[12px] font-semibold text-ink-700">{d}</th>
                    {windows.map((w) => {
                      const cell = p.grid[String(wd)]?.[w.key]
                      if (!cell)
                        return (
                          <td key={w.key} className="h-9 rounded-lg bg-ink-50 text-[11px] text-ink-300">
                            –
                          </td>
                        )
                      const strong = cell.score >= 60
                      return (
                        <td
                          key={w.key}
                          title={`${FULL[wd]} ${NAME[w.key]} · ${cell.posts} post${cell.posts === 1 ? '' : 's'}${cell.posts < 2 ? ' (early guess)' : ''}`}
                          className={`h-9 rounded-lg text-[12px] font-semibold tabular-nums ${strong ? 'text-white' : 'text-ink-800'} ${
                            top.has(`${wd}-${w.key}`) ? 'ring-2 ring-amber-500' : ''
                          }`}
                          style={{ background: `rgb(var(--brand) / ${0.1 + (cell.score / 100) * 0.9})`, opacity: cell.posts < 2 ? 0.6 : 1 }}
                        >
                          {cell.score}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <p className="text-ink-700">
              <b className="font-semibold text-ink-900">Best for {p.name}:</b> {best.length ? best.join(' · ') : 'not clear yet'}
              {p.posts < 20 && <span className="text-ink-400"> · early picture, from {p.posts} posts</span>}
            </p>
            <span className="flex items-center gap-2 text-[11px] text-ink-400">
              Low
              {[0.1, 0.35, 0.6, 0.85, 1].map((a) => (
                <span key={a} className="h-3 w-5 rounded" style={{ background: `rgb(var(--brand) / ${a})` }} />
              ))}
              High · outlined = top 3
            </span>
          </div>
        </>
      )}
    </section>
  )
}
