import { useId, useRef, useState } from 'react'
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi'
import { fmtNum, monotonePath } from '../insights/Overview'
import { PLATFORM } from './platformMeta'
import { DonutWithTable } from '../today/DashboardCharts'
const COLORS = { facebook: '#1877f2', telegram: '#19b9e6', tiktok: '#475569', youtube: '#fa3d49', instagram: '#ed4f97', linkedin: '#0878ce' }
const dateLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {day:'numeric',month:'short',timeZone:'UTC'})
const exact = (v) => v.toLocaleString()
export default function PerformanceTrends({ platforms, days, onDays }) {
  const id = useId().replace(/:/g,'')
  const ref = useRef(null)
  const [metric, setMetric] = useState('views')
  const [hidden, setHidden] = useState([])
  const [hover, setHover] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const daily = platforms[0]?.daily || []
  const active = platforms.filter((p) => !hidden.includes(p.platform))
  const max = Math.max(1, ...active.flatMap((p) => p.daily.map((d) => d[metric] || 0)))
  const ceiling = max <= 5 ? 5 : Math.ceil(max / (10 ** Math.floor(Math.log10(max)))) * (10 ** Math.floor(Math.log10(max)))
  const w = 680, h = 250, left = 48, right = 14, top = 20, bottom = 33
  const x = (i) => left + i / Math.max(1,daily.length - 1) * (w-left-right)
  const y = (v) => h-bottom - v / ceiling * (h-top-bottom)
  const selected = hover == null ? null : Math.min(hover,daily.length-1)
  const slices = platforms.map((p) => ({key:p.platform,label:PLATFORM[p.platform]?.name || p.platform,value:p.totals[metric],color:COLORS[p.platform] || '#77869b'}))
  const maxPosts = Math.max(1,...platforms.map((p) => p.totals.posts))
  const move = (e) => {
    const bounds = e.currentTarget.getBoundingClientRect()
    const vx = (e.clientX-bounds.left) / bounds.width * w
    setHover(Math.max(0,Math.min(daily.length-1,Math.round((vx-left)/(w-left-right)*(daily.length-1)))))
  }
  return <section className={`performance-trends ${expanded ? 'performance-trends-expanded' : ''}`} ref={ref}>
    <header><div><h2>Performance trends</h2><p>Compare recorded results across your social platforms.</p></div><div className="performance-controls"><label><span className="sr-only">Metric</span><select value={metric} onChange={(e) => setMetric(e.target.value)}><option value="views">Views</option><option value="engagement">Engagement</option><option value="posts">Posts</option></select></label><div role="group" aria-label="Trends period">{[7,14,30].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => onDays(d)}>{d}d</button>)}</div><button type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Restore chart size' : 'Expand charts'} aria-pressed={expanded}>{expanded ? <FiMinimize2/> : <FiMaximize2/>}</button></div></header>
    <div className="performance-trends-grid">
      <article className="performance-lines"><h3>{metric[0].toUpperCase()+metric.slice(1)} over time</h3>
        <div className="performance-line-wrap" onPointerMove={move} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${metric} by publication date across platforms; use the date slider for exact values`}>
            <defs>{platforms.map((p) => <linearGradient key={p.platform} id={`${id}-${p.platform}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={COLORS[p.platform]} stopOpacity=".24"/><stop offset="1" stopColor={COLORS[p.platform]} stopOpacity=".01"/></linearGradient>)}</defs>
            {[0,.25,.5,.75,1].map((v) => <g key={v}><line x1={left} x2={w-right} y1={y(v*ceiling)} y2={y(v*ceiling)} stroke="rgb(var(--ink-100))"/><text x={left-8} y={y(v*ceiling)+4} textAnchor="end">{fmtNum(v*ceiling)}</text></g>)}
            {active.map((p) => {const line=monotonePath(p.daily.map((d,i) => [x(i),y(d[metric] || 0)]));return <g key={p.platform}><path d={`${line}L${x(daily.length-1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${id}-${p.platform})`}/><path d={line} fill="none" stroke={COLORS[p.platform] || '#77869b'} strokeWidth="2.3"/>{selected != null && <circle cx={x(selected)} cy={y(p.daily[selected]?.[metric] || 0)} r="4" fill={COLORS[p.platform]} stroke="rgb(var(--surface))" strokeWidth="2"/>}</g>})}
            {[...new Set([0,Math.floor((daily.length-1)*.25),Math.floor((daily.length-1)*.5),Math.floor((daily.length-1)*.75),daily.length-1])].map((i) => daily[i] && <text key={i} x={x(i)} y={h-10} textAnchor={i===0?'start':i===daily.length-1?'end':'middle'}>{dateLabel(daily[i].day)}</text>)}
            {selected != null && <line x1={x(selected)} x2={x(selected)} y1={top} y2={y(0)} stroke="rgb(var(--ink-300))" strokeDasharray="3 3"/>}
          </svg>
          {selected != null && daily[selected] && <div className="performance-tooltip" style={{left:`${Math.min(68,Math.max(3,x(selected)/w*100))}%`}}><strong>{dateLabel(daily[selected].day)}</strong>{active.map((p) => <span key={p.platform}><i style={{background:COLORS[p.platform]}}/>{PLATFORM[p.platform]?.name || p.platform}<b>{exact(p.daily[selected]?.[metric] || 0)}</b></span>)}</div>}
        </div>
        <label className="performance-date-slider"><span>Inspect date</span><input type="range" min="0" max={Math.max(0,daily.length-1)} value={selected ?? 0} onChange={(e) => setHover(Number(e.target.value))} aria-label="Inspect chart date" aria-valuetext={daily[selected ?? 0] ? dateLabel(daily[selected ?? 0].day) : ''}/></label>
        <div className="performance-platform-legend" role="group" aria-label="Visible platform lines">{platforms.map((p) => <button type="button" key={p.platform} aria-pressed={!hidden.includes(p.platform)} onClick={() => setHidden(hidden.includes(p.platform)?hidden.filter((v) => v !== p.platform):[...hidden,p.platform])}><i style={{background:COLORS[p.platform]}}/>{PLATFORM[p.platform]?.name || p.platform}</button>)}</div>
      </article>
      <article><h3>{metric[0].toUpperCase()+metric.slice(1)} by platform</h3><DonutWithTable size={155} segments={slices} centerLabel={`total ${metric}`} emptyText={`No ${metric} recorded in this period.`}/></article>
      <article><h3>Posts by platform</h3><div className="performance-post-bars" role="img" aria-label={platforms.map((p) => `${PLATFORM[p.platform]?.name || p.platform}: ${p.totals.posts} posts`).join(', ')}>{platforms.map((p) => <div key={p.platform}><strong>{exact(p.totals.posts)}</strong><div><i style={{height:`${p.totals.posts/maxPosts*100}%`,background:COLORS[p.platform] || '#77869b'}}/></div><span>{(PLATFORM[p.platform]?.name || p.platform).slice(0,2)}</span></div>)}</div><p className="performance-note">Published deliveries in this period</p></article>
    </div>
    <p className="performance-note">Views and engagement are latest recorded totals grouped by each post’s publication day, rather than activity received on that day. Zero means no value recorded.</p>
  </section>
}
