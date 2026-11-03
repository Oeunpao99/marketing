import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiEye, FiHeart, FiMessageCircle, FiShare2, FiArrowRight, FiBarChart2 } from 'react-icons/fi'
const metrics = [['likes', 'Likes', FiHeart, '#6385db'], ['comments', 'Comments', FiMessageCircle, '#a47ada'], ['shares', 'Shares', FiShare2, '#28a58a']]
const fmt = (v) => v == null ? '—' : v.toLocaleString()
export default function PostPerformance({ totals, rows, onlyTelegram, analyticsId }) {
  const [metric, setMetric] = useState('views')
  const [focus, setFocus] = useState(null)
  const [chart, setChart] = useState('donut')
  const engagement = metrics.reduce((sum, [key]) => sum + (totals[key] || 0), 0)
  const hasData = Object.values(totals).some((v) => v != null)
  const hasEngagement = metrics.some(([key]) => totals[key] != null)
  const complete = metrics.every(([key]) => totals[key] != null)
  const share = (key) => totals[key] == null || !engagement ? null : totals[key] / engagement * 100
  const shareLabel = (key) => share(key) == null ? '—' : `${share(key).toFixed(1)}%`
  const metricValue = (r) => metric === 'engagement' ? (metrics.some(([key]) => r.metrics?.[key] != null) ? metrics.reduce((sum,[key]) => sum + (r.metrics?.[key] || 0),0) : null) : r.metrics?.[metric]
  let end = 0
  const stops = metrics.filter(([key]) => totals[key] > 0).map(([key, , , color]) => {
    const start = end
    end += totals[key] / engagement * 100
    return `${color} ${start}% ${end}%`
  })
  const max = Math.max(1, ...rows.map((r) => metricValue(r) || 0))
  return <section className="post-performance">
    <header><div><h2>Performance overview</h2><p>Latest saved results across this post’s channels</p></div>{analyticsId != null && <Link to={`/insights/${analyticsId}`}>View analytics <FiArrowRight size={13} /></Link>}</header>
    <div className="post-stat-grid">{[['views','Views',FiEye], ...metrics].map(([key,label,Icon]) => <div key={key}><span><Icon size={14} />{label}</span><strong>{fmt(totals[key])}</strong><small>{totals[key] == null ? 'Not available yet' : 'Latest collected total'}</small></div>)}</div>
    <div className="post-engagement-total"><span>Recorded engagement</span><strong>{hasEngagement ? fmt(engagement) : '?'}</strong><small>{hasEngagement ? (complete ? 'Likes + comments + shares' : 'Partial total ? some metrics unavailable') : 'Waiting for platform metrics'}</small></div>
    <div className="post-chart-grid">
      <article>
        <div className="post-chart-heading"><h3>Engagement breakdown</h3><div className="post-chart-toggle" role="group" aria-label="Engagement chart type">{['donut','bars'].map((type) => <button key={type} type="button" aria-pressed={chart === type} onClick={() => setChart(type)}>{type === 'donut' ? 'Donut' : 'Bars'}</button>)}</div></div>
        {chart === 'donut' ? <div className="post-engagement"><div className="post-donut" role="img" aria-label={metrics.map(([key,label]) => `${label}: ${fmt(totals[key])}, ${shareLabel(key)}`).join(', ')} style={{background: stops.length ? `conic-gradient(${stops.join(',')})` : 'rgb(var(--ink-100))'}}><div><strong>{focus ? fmt(totals[focus]) : hasEngagement ? fmt(engagement) : '?'}</strong><small>{focus ? metrics.find(([key]) => key === focus)[1] : 'interactions'}</small></div></div><div className="post-chart-legend">{metrics.map(([key,label,,color]) => <button key={key} type="button" aria-pressed={focus === key} onClick={() => setFocus(focus === key ? null : key)}><i style={{background:color}}/>{label}<span className="post-legend-values"><b>{fmt(totals[key])}</b><small>{shareLabel(key)}</small></span></button>)}</div></div> : <div className="post-engagement-bars">{metrics.map(([key,label,,color]) => <div key={key}><div><span>{label}</span><strong>{fmt(totals[key])} <small>{shareLabel(key)}</small></strong></div><div className="post-engagement-track" role="img" aria-label={`${label}: ${fmt(totals[key])}, ${shareLabel(key)} of recorded engagement`}><i style={{width:`${share(key) || 0}%`,background:color}} /></div></div>)}</div>}
        <p className="post-chart-note">{hasEngagement ? engagement === 0 ? 'Recorded engagement is zero. Percentages need at least one interaction.' : complete ? 'Exact counts and share of recorded engagement. Select a legend item to inspect it.' : 'Percentages use available interactions only; unavailable metrics are excluded.' : 'No engagement metrics saved yet. The neutral chart shows no recorded data.'}</p>
      </article>
      <article><div className="post-chart-heading"><h3>Channel comparison</h3><select aria-label="Compare channel metric" value={metric} onChange={(e) => setMetric(e.target.value)}><option value="views">Views</option><option value="engagement">Engagement</option>{metrics.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="post-channel-bars">{rows.map((r) => <div key={r.id}><span>{r.channel_name || r.platform_slug || r.channel || 'Channel'}<b>{fmt(metricValue(r))}</b></span><div><i style={{width:`${(metricValue(r) || 0) / max * 100}%`}} /></div></div>)}</div><p className="post-chart-note">A dash means the platform has not supplied this metric.</p></article>
    </div>
    {!hasData && <div className="post-metrics-empty"><span><FiBarChart2 size={22}/></span><div><h3>{onlyTelegram ? 'Metrics available in Telegram' : 'Your results will appear here'}</h3><p>{onlyTelegram ? 'Open the Telegram channel to see per-post views.' : 'No metrics have been saved for this post yet. Open analytics to request the latest results.'}</p></div></div>}
  </section>
}
