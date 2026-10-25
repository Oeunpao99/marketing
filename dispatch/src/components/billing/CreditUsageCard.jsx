import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Select from '../ui/Select'
import CreditCoin from '../layout/CreditCoin'

// The Command center's AI-credits card (GET /billing/usage — app/billing.py credit_usage),
// laid out like Google AI Studio's billing cost card: a period and a type to pick, the
// credits added, used and left, and the credits used each day as bars. Hover a bar for
// that day's writing / images / videos.

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: '7d', label: '7 days' },
  { value: '28d', label: '28 days' },
  { value: '90d', label: '90 days' },
]
const TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'writing', label: 'Writing' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
]
const num = (n) => Math.round(n || 0).toLocaleString('en-US')
const day = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', opts)

/** A round top for the axis: 1, 2, 2.5, 5 × a power of ten, at or above ``v``. */
function niceMax(v) {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)
}

export default function CreditUsageCard({ className = '' }) {
  const [period, setPeriod] = useState('month')
  const [type, setType] = useState('all')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [hover, setHover] = useState(null) // the day's index under the pointer

  useEffect(() => {
    let live = true
    setError('')
    api
      .get(`/billing/usage?period=${period}&type=${type}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message || 'Couldn’t load the credits.'))
    return () => {
      live = false
    }
  }, [period, type])

  const days = data?.days || []
  const top = niceMax(Math.max(0, ...days.map((d) => d.used)))
  const tip = hover != null ? days[hover] : null
  // a date under the bars about once a week
  const every = days.length > 35 ? 14 : 7

  return (
    <section className={`rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink-900">
            <CreditCoin size={18} /> AI credits
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {data ? `${day(data.start)} – ${day(data.end, { month: 'short', day: 'numeric', year: 'numeric' })}` : ' '} · all brands
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onChange={setPeriod} options={PERIODS} align="right" buttonClassName="min-w-[130px] font-medium" aria-label="Period" />
          <Select value={type} onChange={setType} options={TYPES} align="right" buttonClassName="min-w-[130px] font-medium" aria-label="Type" />
        </div>
      </div>

      {error && <p className="mt-4 text-[12.5px] text-red-600">{error}</p>}

      {/* the numbers */}
      <div className="mt-5 flex flex-wrap gap-x-12 gap-y-3">
        {[
          ['Credits added', data?.credits_in],
          [type === 'all' ? 'Used' : `Used on ${TYPES.find((t) => t.value === type).label.toLowerCase()}`, data?.used],
          ['Left now', data?.left],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-[13px] text-ink-500">{label}</div>
            <div className="mt-1 text-[22px] font-medium tabular-nums text-ink-900">{data ? num(value) : '—'}</div>
          </div>
        ))}
      </div>

      {/* credits used per day */}
      <div className="relative mt-6">
        <div className="flex h-[180px] gap-3">
          <div className="relative min-w-0 flex-1">
            {/* the grid: top, middle, zero */}
            {[1, 0.5, 0].map((f) => (
              <div key={f} className={`absolute inset-x-0 border-t ${f === 0 ? 'border-ink-300' : 'border-ink-100'}`} style={{ bottom: `${f * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
              {days.map((d, i) => (
                <div
                  key={d.date}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end"
                  onMouseEnter={() => setHover(i)}
                  aria-label={`${day(d.date)}: ${num(d.used)} credits`}
                >
                  <div
                    className={`w-full rounded-t-[3px] transition-colors ${hover === i ? 'bg-brand-dark' : 'bg-brand'}`}
                    style={{ height: d.used > 0 ? `max(2px, ${(d.used / top) * 100}%)` : 0 }}
                  />
                </div>
              ))}
            </div>
            {/* the day under the pointer: beside its bar (right of it, or left in the right half) */}
            {tip && (
              <div
                className={`pointer-events-none absolute top-0 z-10 w-max rounded-xl border border-ink-200 bg-white px-3 py-2 text-[12px] shadow-pop ${
                  hover > days.length / 2 ? '-translate-x-full' : ''
                }`}
                style={{ left: `calc(${((hover + (hover > days.length / 2 ? 0 : 1)) / days.length) * 100}% ${hover > days.length / 2 ? '- 8px' : '+ 8px'})` }}
              >
                <div className="font-semibold text-ink-900">{day(tip.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="mt-0.5 tabular-nums text-ink-700">{tip.future ? 'Still to come' : `${num(tip.used)} credits used`}</div>
                {!tip.future && tip.used > 0 && type === 'all' && (
                  <div className="mt-1 space-y-0.5 tabular-nums text-ink-500">
                    {[['Writing', tip.writing], ['Images', tip.images], ['Videos', tip.videos]]
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <div key={k}>
                          {k} · {num(v)}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* the scale, on the right like the reference */}
          <div className="relative w-10 flex-none text-[11px] tabular-nums text-ink-400">
            {[1, 0.5, 0].map((f) => (
              <span key={f} className="absolute left-0 translate-y-1/2" style={{ bottom: `${f * 100}%` }}>
                {num(top * f)}
              </span>
            ))}
          </div>
        </div>
        {/* dates under the bars */}
        <div className="relative mr-[52px] mt-2 h-4 text-[11px] text-ink-400">
          {days.map((d, i) =>
            i % every === 0 ? (
              <span key={d.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / days.length) * 100}%` }}>
                {day(d.date)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Credits used
        </span>
        <span>
          Phnom Penh days · this month&apos;s credits reset on the 1st ·{' '}
          <Link to="/upgrade" className="font-medium text-brand hover:underline">
            Get more credits
          </Link>
        </span>
      </div>
    </section>
  )
}
