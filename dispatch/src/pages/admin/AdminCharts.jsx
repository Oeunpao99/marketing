import { useLayoutEffect, useRef, useState } from 'react'

// The AI usage page's charts (admin portal, AdminAI.jsx): each AI in its own brand colour
// (--ai-* in index.css — GPT-5 OpenAI green, Gemini blue, Claude coral, GPT-5 mini magenta,
// checked for colour-blind separation in light and dark), every line and slice also named,
// so colour is never the only key. Hand-drawn SVG, one y axis, a hover on every mark.
//   SpendLine   — what each model charged (or its calls) per day, with a crosshair
//   ModelDonut  — each model's share of what was charged
//   AccountBars — the accounts that used the most, top 8 + the rest

export const aiColor = (key = '') =>
  key === 'gpt-5-mini'
    ? 'var(--ai-gpt-5-mini)'
    : key.startsWith('gpt')
      ? 'var(--ai-gpt-5)'
      : key.startsWith('claude')
        ? 'var(--ai-claude)'
        : key.startsWith('gemini')
          ? 'var(--ai-gemini)'
          : 'rgb(var(--ink-400))'

const money = (n) => `$${Number(n || 0).toFixed(Number(n || 0) < 10 ? 2 : 0)}`
const exact = (n) => (!Number(n) ? '$0' : `$${Number(n).toFixed(Number(n) < 1 ? 4 : 2)}`)
const shortDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** A round step above ``max`` for the y axis, and its 4 ticks. */
function niceTicks(max) {
  if (!(max > 0)) return [0, 1, 2, 3, 4].map((i) => i * 0.25)
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw)
  return [0, 1, 2, 3, 4].map((i) => +(i * step).toFixed(6))
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-600">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: aiColor(it.key) }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function Tip({ x, y, width, children }) {
  // inside the chart, flipped to the left of the pointer near the right edge
  const left = x > width - 200 ? x - 196 : x + 14
  return (
    <div className="pointer-events-none absolute z-10 w-[182px] rounded-xl border border-ink-200 bg-white px-3 py-2 text-[11.5px] shadow-card" style={{ left: Math.max(0, left), top: Math.max(0, y) }}>
      {children}
    </div>
  )
}

/** Each model's line per day: what it charged, or how many calls (one measure at a time). */
export function SpendLine({ daily, keys, label }) {
  const [ref, width] = useWidth()
  const [measure, setMeasure] = useState('charged')
  const [hover, setHover] = useState(null) // a day's index
  const H = 240
  const pad = { l: 46, r: 104, t: 12, b: 26 }
  const iw = Math.max(1, width - pad.l - pad.r)
  const ih = H - pad.t - pad.b
  const val = (d, k) => d.models[k]?.[measure] || 0
  const ticks = niceTicks(Math.max(0, ...daily.flatMap((d) => keys.map((k) => val(d, k)))))
  const top = ticks[ticks.length - 1] || 1
  const x = (i) => pad.l + (daily.length < 2 ? iw / 2 : (i / (daily.length - 1)) * iw)
  const y = (v) => pad.t + ih - (v / top) * ih
  const fmt = (v) => (measure === 'calls' ? Math.round(v).toLocaleString() : money(v))
  // the names at the lines' ends, nudged apart so two close lines don't overlap
  const ends = keys
    .map((k) => ({ k, y: y(val(daily[daily.length - 1] || { models: {} }, k)) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14)
  // lines that all end low: the names stack upwards from the baseline, never under it
  const over = ends.length ? ends[ends.length - 1].y - (pad.t + ih) : 0
  if (over > 0) ends.forEach((e) => (e.y -= over))
  const every = Math.max(1, Math.ceil(daily.length / Math.max(2, Math.floor(iw / 70))))

  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left - pad.l
    setHover(Math.max(0, Math.min(daily.length - 1, Math.round((px / iw) * (daily.length - 1)))))
  }
  const day = hover != null ? daily[hover] : null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Legend items={keys.map((k) => ({ key: k, label: label(k) }))} />
        <div className="ml-auto flex rounded-lg bg-ink-100 p-0.5" role="group" aria-label="Show">
          {[
            ['charged', 'Charged $'],
            ['calls', 'Calls'],
          ].map(([id, l]) => (
            <button key={id} type="button" aria-pressed={measure === id} onClick={() => setMeasure(id)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${measure === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${measure === 'calls' ? 'Calls' : 'Charged'} per day by model`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="rgb(var(--ink-100))" strokeWidth="1" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink-400))">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {daily.map((d, i) =>
              i % every === 0 ? (
                <text key={d.day} x={x(i)} y={H - 6} textAnchor={i === daily.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="10.5" fill="rgb(var(--ink-400))">
                  {shortDay(d.day)}
                </text>
              ) : null,
            )}
            {keys.map((k) => (
              <path
                key={k}
                d={daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val(d, k)).toFixed(1)}`).join('')}
                fill="none"
                stroke={aiColor(k)}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {ends.map((e) => (
              <text key={e.k} x={pad.l + iw + 8} y={e.y + 4} fontSize="11" fontWeight="600" fill="rgb(var(--ink-700))">
                {label(e.k)}
              </text>
            ))}
            {day && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgb(var(--ink-300))" strokeWidth="1" />
                {keys.map((k) => (
                  <circle key={k} cx={x(hover)} cy={y(val(day, k))} r="4.5" fill={aiColor(k)} stroke="rgb(var(--surface))" strokeWidth="2" />
                ))}
              </g>
            )}
          </svg>
        )}
        {day && (
          <Tip x={x(hover)} y={pad.t} width={width}>
            <div className="mb-1 font-semibold text-ink-900">{shortDay(day.day)}</div>
            {keys.map((k) => (
              <div key={k} className="flex items-center gap-1.5 text-ink-600">
                <span className="h-2 w-2 rounded-full" style={{ background: aiColor(k) }} />
                <span className="min-w-0 flex-1 truncate">{label(k)}</span>
                <span className="font-semibold tabular-nums text-ink-900">{measure === 'calls' ? (day.models[k]?.calls || 0).toLocaleString() : exact(day.models[k]?.charged)}</span>
              </div>
            ))}
          </Tip>
        )}
      </div>
    </div>
  )
}

/** Each model's share of what was charged — a ring, the total in its middle, a named legend beside it. */
export function ModelDonut({ models, label }) {
  const [hover, setHover] = useState(null)
  const total = models.reduce((a, m) => a + m.charged, 0)
  const R = 78
  const T = 22
  const C = 100
  let at = -Math.PI / 2
  const arcs = models
    .filter((m) => m.charged > 0)
    .map((m) => {
      const share = total ? m.charged / total : 0
      const a0 = at
      const a1 = at + share * Math.PI * 2
      at = a1
      return { ...m, share, a0, a1 }
    })
  const pt = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)]
  const path = ({ a0, a1 }) => {
    // a whole ring when one model has everything
    const end = a1 - a0 >= Math.PI * 2 - 1e-6 ? a1 - 1e-4 : a1
    const [x0, y0] = pt(a0, R)
    const [x1, y1] = pt(end, R)
    const [x2, y2] = pt(end, R - T)
    const [x3, y3] = pt(a0, R - T)
    const big = end - a0 > Math.PI ? 1 : 0
    return `M${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${R - T},${R - T} 0 ${big} 0 ${x3},${y3} Z`
  }
  const shown = hover ? arcs.find((a) => a.model === hover) : null

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Share of what was charged, by model" className="flex-none" onMouseLeave={() => setHover(null)}>
        {!arcs.length && <circle cx={C} cy={C} r={R - T / 2} fill="none" stroke="rgb(var(--ink-100))" strokeWidth={T} />}
        {arcs.map((a) => (
          <path
            key={a.model}
            d={path(a)}
            fill={aiColor(a.model)}
            stroke="rgb(var(--surface))"
            strokeWidth="2"
            opacity={hover && hover !== a.model ? 0.45 : 1}
            onMouseEnter={() => setHover(a.model)}
            style={{ cursor: 'default', transition: 'opacity 120ms' }}
          />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="rgb(var(--ink-900))">
          {shown ? `${Math.round(shown.share * 100)}%` : money(total)}
        </text>
        <text x={C} y={C + 16} textAnchor="middle" fontSize="11" fill="rgb(var(--ink-500))">
          {shown ? label(shown.model) : 'charged'}
        </text>
      </svg>
      <ul className="min-w-[180px] flex-1 space-y-2">
        {arcs.map((a) => (
          <li key={a.model} onMouseEnter={() => setHover(a.model)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] ${hover === a.model ? 'bg-ink-50' : ''}`}>
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: aiColor(a.model) }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{label(a.model)}</span>
            <span className="tabular-nums text-ink-500">{Math.round(a.share * 100)}%</span>
            <span className="w-16 text-right font-semibold tabular-nums text-ink-900">{exact(a.charged)}</span>
          </li>
        ))}
        {!arcs.length && <li className="text-[12.5px] text-ink-400">No AI writing in this period.</li>}
      </ul>
    </div>
  )
}

/** The accounts that used the most AI (what their credit was charged), top 8 and the rest. */
export function AccountBars({ tenants, onOpen }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const top = tenants.slice(0, 8)
  const rest = tenants.slice(8)
  const rows = rest.length
    ? [...top, { id: null, name: `${rest.length} more account${rest.length === 1 ? '' : 's'}`, calls: rest.reduce((a, t) => a + t.calls, 0), cost: rest.reduce((a, t) => a + t.cost, 0), charged: rest.reduce((a, t) => a + t.charged, 0) }]
    : top
  const max = Math.max(0.0001, ...rows.map((r) => r.charged))
  const nameW = Math.min(180, Math.max(110, width * 0.3))
  const barW = Math.max(40, width - nameW - 78)
  const ROW = 30
  const fit = Math.max(8, Math.floor((nameW - 16) / 7)) // characters that fit before the bar

  if (!rows.length) return <p className="text-[12.5px] text-ink-400">No AI writing in this period.</p>
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={rows.length * ROW} role="img" aria-label="AI charged per account" onMouseLeave={() => setHover(null)}>
          {rows.map((r, i) => {
            const w = Math.max(4, (r.charged / max) * barW)
            const yy = i * ROW
            return (
              <g key={r.id ?? 'rest'} onMouseEnter={() => setHover(i)} onClick={() => r.id && onOpen?.(r.id)} style={{ cursor: r.id ? 'pointer' : 'default' }}>
                {/* the whole row is the hit target, bigger than the bar */}
                <rect x="0" y={yy} width={width} height={ROW} fill={hover === i ? 'rgb(var(--ink-50))' : 'transparent'} rx="6" />
                <text x="8" y={yy + ROW / 2 + 4} fontSize="12" fontWeight="600" fill="rgb(var(--ink-800))">
                  {r.name.length > fit ? `${r.name.slice(0, fit - 1)}…` : r.name}
                </text>
                <rect x={nameW} y={yy + 8} width={w} height={ROW - 16} rx="4" fill={r.id ? 'rgb(var(--brand))' : 'rgb(var(--ink-300))'} />
                <text x={nameW + w + 8} y={yy + ROW / 2 + 4} fontSize="11.5" fontWeight="600" fill="rgb(var(--ink-700))">
                  {money(r.charged)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover != null && rows[hover] && (
        <Tip x={nameW + Math.max(4, (rows[hover].charged / max) * barW)} y={hover * ROW + ROW} width={width}>
          <div className="mb-1 truncate font-semibold text-ink-900">{rows[hover].name}</div>
          <div className="flex justify-between text-ink-600">
            <span>Charged</span>
            <span className="font-semibold tabular-nums text-ink-900">{exact(rows[hover].charged)}</span>
          </div>
          <div className="flex justify-between text-ink-600">
            <span>Cost to us</span>
            <span className="tabular-nums">{exact(rows[hover].cost)}</span>
          </div>
          <div className="flex justify-between text-ink-600">
            <span>Margin</span>
            <span className="tabular-nums">{exact(rows[hover].charged - rows[hover].cost)}</span>
          </div>
          <div className="flex justify-between text-ink-600">
            <span>Calls</span>
            <span className="tabular-nums">{rows[hover].calls.toLocaleString()}</span>
          </div>
          {rows[hover].id && <div className="mt-1 text-[11px] text-brand">Click to open the account</div>}
        </Tip>
      )}
    </div>
  )
}
