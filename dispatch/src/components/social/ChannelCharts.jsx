import { useMemo, useState } from 'react'
import { FiFileText, FiTrendingUp, FiUsers } from 'react-icons/fi'
import { Chart, useGrow } from '../dashboard/PlatformCharts'
import { GrowthChart } from './SocialPlatformView'

/** The post page's channel graphs, drawn from the channel's saved member counts and the posts it sent
 *  (the same look as the platform view in Insights). ``useChannelData`` turns the chart history +
 *  this channel's posts into one value per Cambodia calendar day; ``ChannelStatPanel`` (members now /
 *  gained / posts sent), ``MembersPostingCard`` (both on one chart) and ``ChannelBars`` (posts and
 *  new members per day) draw it, so the page can place each where it wants. */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const LINES = [
  { id: 'members', label: 'Members', color: 'var(--series-1)' },
  { id: 'posts', label: 'Posts', color: 'var(--series-2)' },
]
const SHOWN = { members: true, posts: true }
const dayOf = (v) => new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
const shift = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const label = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString()

/** ``history`` = the page's chart history (channel readings), ``posts`` = this channel's posts,
 *  ``period`` '7' | '30' | 'all'. null until there is a day to draw. */
export function useChannelData(history, posts, period) {
  return useMemo(() => {
    const readings = (history?.channel || []).filter((r) => (r.subscribers ?? r.followers) != null)
    const stamps = [...readings.map((r) => dayOf(r.at)), ...posts.map((p) => dayOf(p.published_at))].sort()
    if (!stamps.length) return null
    const today = dayOf(Date.now())
    const span = period === 'all' ? Math.min(90, Math.max(7, Math.round((Date.parse(today) - Date.parse(stamps[0])) / 86400000) + 1)) : Number(period)
    const days = Array.from({ length: span }, (_, i) => shift(today, i - span + 1))
    const lastOf = new Map()
    for (const r of readings) lastOf.set(dayOf(r.at), r.subscribers ?? r.followers) // the day's last reading wins
    const sent = new Map()
    for (const p of posts) sent.set(dayOf(p.published_at), (sent.get(dayOf(p.published_at)) || 0) + 1)
    // carry a reading forward over days without one; the one before the window starts the first day
    let carry = null
    for (const r of readings) if (dayOf(r.at) < days[0]) carry = r.subscribers ?? r.followers
    const members = days.map((d) => {
      if (lastOf.has(d)) carry = lastOf.get(d)
      return carry
    })
    const daily = days.map((d, i) => ({
      day: d,
      posts: sent.get(d) || 0,
      gained: members[i] != null && members[i - 1] != null ? members[i] - members[i - 1] : 0,
    }))
    const known = members.filter((v) => v != null)
    return {
      days,
      members,
      daily,
      now: known.length ? known[known.length - 1] : null,
      gained: known.length >= 2 ? known[known.length - 1] - known[0] : null,
      totalPosts: daily.reduce((a, d) => a + d.posts, 0),
    }
  }, [history, posts, period])
}

/** Members now · members gained · posts sent — three rows beside the members chart. */
export function ChannelStatPanel({ data }) {
  if (!data) return null
  const rows = [
    { Icon: FiUsers, name: 'Members', value: data.now == null ? '—' : data.now.toLocaleString(), note: 'now', tint: 'text-[color:var(--series-1)]' },
    { Icon: FiTrendingUp, name: 'Members gained', value: data.gained == null ? '—' : sign(data.gained), note: 'this period', tint: 'text-[#006300]', good: (data.gained || 0) > 0 },
    { Icon: FiFileText, name: 'Posts', value: data.totalPosts.toLocaleString(), note: `post${data.totalPosts === 1 ? '' : 's'} sent`, tint: 'text-[color:var(--series-2)]' },
  ]
  return (
    <section className={`${card} flex flex-col gap-2.5 p-4`}>
      {rows.map(({ Icon, name, value, note, tint, good }) => (
        <div key={name} className="flex flex-1 items-center gap-3 rounded-xl bg-ink-50/70 px-3.5 py-3">
          <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl bg-white ring-1 ring-ink-100 ${tint}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-medium text-ink-700">{name}</span>
          <span className="text-right">
            <span className={`block text-[22px] font-bold leading-none tabular-nums ${good ? 'text-[#006300]' : 'text-ink-900'}`}>{value}</span>
            <span className="mt-1 block text-[11px] text-ink-400">{note}</span>
          </span>
        </div>
      ))}
    </section>
  )
}

/** Members and posts on one chart, each against its own highest day; hover for the real numbers. */
export function MembersPostingCard({ data }) {
  const [weekly, setWeekly] = useState(false)
  const points = useMemo(() => {
    if (!data) return []
    const step = weekly ? 7 : 1
    const out = []
    for (let i = 0; i < data.days.length; i += step) {
      const hi = Math.min(data.days.length, i + step)
      let m = null
      for (let j = hi - 1; j >= i; j--) if (data.members[j] != null) { m = data.members[j]; break }
      out.push({
        label: weekly && hi - i > 1 ? `${label(data.days[i])} – ${label(data.days[hi - 1])}` : label(data.days[i]),
        members: m,
        posts: data.daily.slice(i, hi).reduce((a, d) => a + d.posts, 0),
      })
    }
    return out
  }, [data, weekly])
  if (!data || data.days.length < 2) return null
  return (
    <section className={`${card} min-w-0 p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink-900">Members and posting</h3>
          <p className="text-[11.5px] text-ink-500">Each line is drawn against its own highest day · hover for the real numbers</p>
        </div>
        <div className="inline-flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Chart step">
          {[
            ['Daily', false],
            ['Weekly', true],
          ].map(([name, w]) => (
            <button key={name} type="button" aria-pressed={weekly === w} onClick={() => setWeekly(w)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${weekly === w ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <GrowthChart key={`${data.days.length}-${weekly}`} points={points} shown={SHOWN} series={LINES} />
      <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-ink-500">
        {LINES.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Posts per day and new members per day, as bars that grow up from zero. */
export function ChannelBars({ data, platformName }) {
  const [ref, t] = useGrow(1000)
  if (!data || data.days.length < 2) return null
  const hasGain = data.daily.some((d) => d.gained > 0)
  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={`${card} p-5 text-[color:var(--series-2)]`}>
        <h3 className="mb-3 text-[15px] font-bold text-ink-900">Posts per day</h3>
        <Chart kind="bar" daily={data.daily} k="posts" label={`${platformName} posts per day`} t={t} />
      </section>
      <section className={`${card} p-5 text-[color:var(--series-1)]`}>
        <h3 className="mb-3 text-[15px] font-bold text-ink-900">New members per day</h3>
        {hasGain ? (
          <Chart kind="bar" daily={data.daily.map((d) => ({ ...d, gained: Math.max(0, d.gained) }))} k="gained" label="New members per day" t={t} />
        ) : (
          <p className="py-10 text-center text-[12.5px] text-ink-500">No new members in this period yet.</p>
        )}
      </section>
    </div>
  )
}
