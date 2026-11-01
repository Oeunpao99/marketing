import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../store'
import './command-health.css'

const states = [
  ['posted', 'Published', '#159976'], ['scheduled', 'Scheduled', '#6385db'],
  ['posting', 'Publishing', '#a47ada'], ['failed', 'Failed', '#dc6262'],
  ['needs_approval', 'Needs approval', '#d6a13d'], ['no_media', 'Needs media', '#8993a5'],
]
const colors = { Facebook: '#4384e8', Instagram: '#b66ac2', TikTok: '#42a8a4', LinkedIn: '#5386b5', Telegram: '#55a7ce', YouTube: '#db7575' }
const number = (n) => n == null ? 'Not available' : n.toLocaleString()
const keyOf = (r) => `${r.kind}-${r.id}`

export default function CommandHealth({ rows }) {
  const { queue } = useStore()
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')
  const [metric, setMetric] = useState('views')
  const [selected, setSelected] = useState(null)
  const channels = [...new Set(rows.flatMap((r) => r.channels))].sort()
  const channelRows = rows.filter((r) => channel === 'all' || r.channels.includes(channel))
  const filtered = channelRows.filter((r) => status === 'all' || r.status === status)
  const segments = states.map(([id, label, color]) => ({ id, label, color, count: channelRows.filter((r) => r.status === id).length }))
  const total = channelRows.length
  const published = segments[0].count
  let offset = 0
  const gradient = segments.filter((s) => s.count).map((s) => {
    const from = offset
    offset += s.count / total * 100
    return `${s.color} ${from}% ${offset}%`
  }).join(', ')
  const ranked = filtered.filter((r) => r.kind === 'post').sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1))
  const max = Math.max(1, ...ranked.map((r) => r[metric] || 0))
  const chosen = ranked.find((r) => keyOf(r) === selected)
  const chosenIndex = chosen ? queue.findIndex((q) => q.postId === chosen.id) : -1
  return (
    <section className="command-health" aria-label="Today's social media health">
      <header className="health-heading">
        <div><h2>Social media pulse</h2><p>Today’s posts · latest collected results · refreshes every minute</p></div>
        <label>Channel <select value={channel} onChange={(e) => { setChannel(e.target.value); setSelected(null) }}><option value="all">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}</select></label>
      </header>
      <div className="health-grid">
        <article className="health-card">
          <h3>Publishing health</h3><p className="health-subtitle">Select a status to filter the post chart</p>
          <div className="health-donut-wrap">
            <div className="health-donut" role="img" aria-label={total ? segments.map((s) => `${s.label}: ${s.count}`).join(', ') : 'No posts today'} style={{ background: total ? `conic-gradient(${gradient})` : 'rgb(var(--ink-100))' }}><div><strong>{total ? `${Math.round(published / total * 100)}%` : '—'}</strong><span>published</span><small>{published} of {total} posts</small></div></div>
          </div>
          <div className="health-legend">{segments.map((s) => <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(status === s.id ? 'all' : s.id)}><i style={{ background: s.color }} /><span>{s.label}</span><b>{s.count}</b></button>)}</div>
          {status !== 'all' && <button className="health-reset" onClick={() => setStatus('all')}>Clear status filter</button>}
        </article>
        <article className="health-card">
          <h3>Channel activity</h3><p className="health-subtitle">Posts per platform today · select to explore</p>
          <div className="health-channel-list">{channels.length ? channels.map((c) => {
            const count = rows.filter((r) => r.channels.includes(c)).length
            const highest = Math.max(1, ...channels.map((name) => rows.filter((r) => r.channels.includes(name)).length))
            return <button type="button" key={c} aria-pressed={channel === c} onClick={() => setChannel(channel === c ? 'all' : c)}><span>{c}</span><b>{count}</b><div className="health-track"><i style={{ width: `${count / highest * 100}%`, background: colors[c] || 'rgb(var(--brand))' }} /></div></button>
          }) : <p className="health-empty">Channel activity appears when posts are planned.</p>}</div>
          <p className="health-footnote">A post shared to several platforms counts once on each platform.</p>
        </article>
        <article className="health-card health-performance">
          <div className="health-chart-heading"><div><h3>Post performance</h3><p className="health-subtitle">Compare today’s posts using collected results</p></div><label className="health-metric-label"><span className="sr-only">Performance metric</span><select value={metric} onChange={(e) => setMetric(e.target.value)}><option value="views">Views</option><option value="engagement">Engagement</option></select></label></div>
          <div className="health-post-list">{ranked.length ? ranked.map((r, index) => <button type="button" key={keyOf(r)} className="health-post" aria-pressed={selected === keyOf(r)} onClick={() => setSelected(selected === keyOf(r) ? null : keyOf(r))}>
            <span className="health-post-title"><small>{String(index + 1).padStart(2, '0')}</small><span>{r.title || 'Untitled post'}</span><b>{number(r[metric])}</b></span>
            <span className="health-track"><i style={{ width: `${(r[metric] || 0) / max * 100}%` }} /></span><span className="health-post-meta">{r.channels.join(' · ')}{r.brand ? ` · ${r.brand}` : ''}</span>
          </button>) : <p className="health-empty">No posts match these filters. Drafts appear in publishing health; performance appears after publishing.</p>}</div>
          {chosen && <div className="health-detail"><strong>{chosen.title || 'Untitled post'}</strong><span>{number(chosen.views)} views · {number(chosen.engagement)} engagement · {states.find(([id]) => id === chosen.status)?.[1] || chosen.status}</span><Link to={`/post/${chosen.id}`}>Open post →</Link></div>}
          <p className="health-footnote">Post totals combine all channels, even with a channel filter. Engagement = likes, comments, and shares. Missing metrics are unavailable, not zero.</p>
        </article>
      </div>
    </section>
  )
}
