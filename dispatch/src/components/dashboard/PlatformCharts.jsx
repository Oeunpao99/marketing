import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { fmtNum } from '../insights/Overview'
import { PLATFORM } from './platformMeta'

/** The Dashboard's charts: one card per social platform, each with a LINE chart and a BAR chart of
 *  the last 7 / 14 / 30 days. They grow up from zero (and the totals count up) when the card
 *  scrolls into view — 0 → 100 % in about a second, once; reduced-motion users get the finished chart.
 *  Data is the server's saved readings (GET /views/dashboard/platforms): a post counts on the day it
 *  was published. A platform that reports no views / reactions (Telegram) charts posts per day. */

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const W = 300 // the charts' own coordinate space (they stretch to their box)
const BASE = 96
const TOP = 8

/** 0 → 1 once, when the element first scrolls into view (an ease-out, ``ms`` long). */
export function useGrow(ms = 1000) {
  const ref = useRef(null)
  const [t, setT] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setT(1)
      return undefined
    }
    let raf = 0
    let io
    const run = () => {
      let start = null
      const step = (now) => {
        if (start === null) start = now
        const p = Math.min(1, (now - start) / ms)
        setT(1 - (1 - p) ** 3)
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect()
          run()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [ms])
  return [ref, t]
}

const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A line (with its area) or bars, drawn from the series ``daily[key]``; ``t`` is the growth, 0 → 1. */
export function Chart({ kind, daily, k, label, t }) {
  const [hover, setHover] = useState(null)
  const n = daily.length
  const vals = daily.map((d) => d[k] || 0)
  const max = Math.max(1, ...vals)
  const h = BASE - TOP
  const slot = W / n
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v) => BASE - (v / max) * h * t
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = (e.clientX - r.left) / r.width
    setHover(Math.max(0, Math.min(n - 1, kind === 'bar' ? Math.floor(p * n) : Math.round(p * (n - 1)))))
  }
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const at = hover != null ? (kind === 'bar' ? ((hover + 0.5) / n) * 100 : (x(hover) / W) * 100) : 0
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-ink-700">{label}</span>
        <span className="text-[10.5px] tabular-nums text-ink-400">max {fmtNum(max)}</span>
      </div>
      <div className="relative" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="block h-[112px] w-full" role="img" aria-label={`${label}, last ${n} days`}>
          {[BASE, (BASE + TOP) / 2, TOP].map((gy) => (
            <line key={gy} x1="0" x2={W} y1={gy} y2={gy} stroke="rgb(var(--ink-100))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {kind === 'line' ? (
            <>
              <path d={`${line}L${x(n - 1)},${BASE}L${x(0)},${BASE}Z`} fill="currentColor" opacity={0.13 * t} />
              <path d={line} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          ) : (
            vals.map((v, i) => {
              const bh = v > 0 ? Math.max(2, (v / max) * h * t) : 0
              return <rect key={daily[i].day} x={i * slot + slot * 0.19} y={BASE - bh} width={slot * 0.62} height={bh} rx="1.5" fill="currentColor" opacity={hover === i ? 1 : 0.82} />
            })
          )}
          {hover != null && kind === 'line' && <circle cx={x(hover)} cy={y(vals[hover])} r="3" fill="currentColor" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-ink-200" style={{ left: `${at}%` }} aria-hidden="true" />
            <div className="pointer-events-none absolute top-0 z-10 w-[132px] rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] shadow-card" style={{ left: `${at}%`, transform: `translateX(${at > 62 ? '-108%' : '8%'})` }}>
              <div className="font-semibold text-ink-900">{dayLabel(daily[hover].day)}</div>
              <div className="text-ink-600">
                {label.replace(' per day', '')}: <b className="tabular-nums text-ink-900">{(vals[hover] || 0).toLocaleString()}</b>
              </div>
              {k !== 'posts' && <div className="text-ink-400">{daily[hover].posts} post{daily[hover].posts === 1 ? '' : 's'}</div>}
            </div>
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-400">
        <span>{dayLabel(daily[0].day)}</span>
        <span>{dayLabel(daily[n - 1].day)}</span>
      </div>
    </div>
  )
}

function PlatformCard({ p }) {
  const [ref, t] = useGrow(1000)
  const meta = PLATFORM[p.platform] || { cls: 'text-ink-500', name: p.platform }
  const Icon = meta.Icon
  const lineK = p.totals.views > 0 ? 'views' : 'posts'
  const barK = p.totals.engagement > 0 ? 'engagement' : 'posts'
  const count = (v) => fmtNum(Math.round(v * t))
  return (
    <section ref={ref} className={`${card} min-w-0 p-5`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl bg-ink-50 ring-1 ring-ink-100 ${meta.cls}`}>{Icon ? <Icon size={20} /> : null}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight text-ink-900">{meta.name}</h3>
          <p className="text-[11.5px] text-ink-500">
            {p.accounts} account{p.accounts === 1 ? '' : 's'}
          </p>
        </div>
        <dl className="flex flex-none gap-5 text-right">
          {[
            ['Posts', p.totals.posts],
            ['Views', p.totals.views],
            ['Engaged', p.totals.engagement],
          ].map(([name, v]) => (
            <div key={name}>
              <dd className="text-[20px] font-bold leading-none tabular-nums text-ink-900">{count(v)}</dd>
              <dt className="mt-1 text-[10px] font-medium uppercase tracking-wider text-ink-400">{name}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${meta.cls}`}>
        <Chart kind="line" daily={p.daily} k={lineK} label={lineK === 'views' ? 'Views per day' : 'Posts per day'} t={t} />
        <Chart kind="bar" daily={p.daily} k={barK} label={barK === 'engagement' ? 'Engagement per day' : 'Posts per day'} t={t} />
      </div>
      {p.totals.views === 0 && p.totals.engagement === 0 && p.totals.posts > 0 && <p className="mt-3 text-[11.5px] text-ink-400">{meta.name} doesn't share per-post views or reactions with us, so these show how often you posted.</p>}
    </section>
  )
}

export default function PlatformCharts() {
  const [days, setDays] = useState(14)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    setData(null)
    setFailed(false)
    api
      .get(`/views/dashboard/platforms?days=${days}`)
      .then((d) => on && setData(d))
      .catch(() => on && setFailed(true))
    return () => {
      on = false
    }
  }, [days])
  return (
    <section className="mb-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink-800">Performance by platform</h2>
          <p className="text-[11.5px] text-ink-500">By the day each post went out · views and engagement it has earned so far</p>
        </div>
        <div className="inline-flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Period">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${days === d ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className={`${card} px-5 py-4 text-[12.5px] text-ink-500`}>The charts couldn't load — reload the page to try again.</p>
      ) : !data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[250px] animate-pulse rounded-2xl bg-ink-100" />
          ))}
        </div>
      ) : data.platforms.length === 0 ? (
        <p className={`${card} px-5 py-6 text-center text-[12.5px] text-ink-500`}>No post went out in the last {days} days. The charts appear once you post.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.platforms.map((p) => (
            <PlatformCard key={`${p.platform}-${days}`} p={p} />
          ))}
        </div>
      )}
    </section>
  )
}
