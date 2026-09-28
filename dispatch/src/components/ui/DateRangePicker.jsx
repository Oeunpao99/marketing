import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { phnomPenhDate } from '../../lib/tz'

// A date filter in the app's menu style: quick presets plus a month calendar
// that marks the days that have something on them. Dates are "YYYY-MM-DD"
// strings (Phnom Penh calendar days). value = { from, to } or null (all dates).
//   counts: { "YYYY-MM-DD": n } — drawn as a dot, and summed for the label.

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const toDate = (s) => new Date(`${s}T00:00:00Z`)
const toStr = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}
const short = (s) => toDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function presets() {
  const today = phnomPenhDate(0)
  const t = toDate(today)
  const monthStart = toStr(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)))
  const monthEnd = toStr(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)))
  return [
    { id: 'all', label: 'All dates', value: null },
    { id: 'today', label: 'Today', value: { from: today, to: today } },
    { id: 'tomorrow', label: 'Tomorrow', value: { from: addDays(today, 1), to: addDays(today, 1) } },
    { id: 'upcoming', label: 'Upcoming', value: { from: today, to: '9999-12-31' } },
    { id: 'last7', label: 'Last 7 days', value: { from: addDays(today, -6), to: today } },
    { id: 'month', label: 'This month', value: { from: monthStart, to: monthEnd } },
  ]
}

const same = (a, b) => (!a && !b) || (a && b && a.from === b.from && a.to === b.to)

export function inRange(day, value) {
  return !value || (!!day && day >= value.from && day <= value.to)
}

export default function DateRangePicker({ value, onChange, counts = {}, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null) // first click of a range
  const [month, setMonth] = useState(() => (value?.from && value.from !== '9999-12-31' ? value.from : phnomPenhDate(0)).slice(0, 7))
  const [up, setUp] = useState(false)
  const root = useRef(null)
  const panel = useRef(null)
  const list = presets()
  const preset = list.find((p) => same(p.value, value))

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => root.current && !root.current.contains(e.target) && setOpen(false)
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Open upward when there's no room below.
  useLayoutEffect(() => {
    if (!open || !panel.current || !root.current) return
    const r = root.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < panel.current.offsetHeight + 12 && r.top > window.innerHeight - r.bottom)
  }, [open])

  const total = useMemo(
    () => Object.entries(counts).reduce((n, [d, c]) => (inRange(d, value) ? n + c : n), 0),
    [counts, value],
  )

  const label = preset
    ? preset.label
    : value.from === value.to
      ? short(value.from)
      : `${short(value.from)} – ${short(value.to)}`

  // The visible month grid, Monday first.
  const cells = useMemo(() => {
    const first = toDate(`${month}-01`)
    const lead = (first.getUTCDay() + 6) % 7
    const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    return [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  }, [month])

  const shiftMonth = (n) => {
    const d = toDate(`${month}-01`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(toStr(d).slice(0, 7))
  }

  const pickDay = (d) => {
    if (!anchor) {
      setAnchor(d)
      onChange({ from: d, to: d })
      return
    }
    const [from, to] = d < anchor ? [d, anchor] : [anchor, d]
    setAnchor(null)
    onChange({ from, to })
    setOpen(false)
  }

  const today = phnomPenhDate(0)
  const monthName = toDate(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setAnchor(null)
          setOpen((v) => !v)
        }}
        className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-[12px] font-semibold transition-colors ${
          open || value ? 'border-brand text-ink-900' : 'border-ink-200 text-ink-700 hover:border-ink-300'
        }`}
      >
        <FiCalendar size={13} className="text-brand" />
        {label}
        <span className="font-medium text-ink-400">· {total} post{total === 1 ? '' : 's'}</span>
        <FiChevronDown size={13} className={`text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          className={`absolute z-50 flex w-[min(460px,calc(100vw-40px))] flex-col gap-3 glass-panel rounded-2xl p-3 animate-fadein sm:flex-row ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`}
        >
          {/* presets */}
          <div className="flex flex-wrap gap-1 sm:w-[130px] sm:flex-col sm:flex-nowrap">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.value)
                  setAnchor(null)
                  setOpen(false)
                }}
                className={`rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  preset?.id === p.id ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* month */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-50">
                <FiChevronLeft size={15} />
              </button>
              <div className="text-[12.5px] font-bold text-ink-900">{monthName}</div>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-50">
                <FiChevronRight size={15} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DOW.map((d) => (
                <div key={d} className="py-1 text-[10px] font-semibold text-ink-400">
                  {d}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const n = counts[d] || 0
                const selected = value && value.to !== '9999-12-31' && d >= value.from && d <= value.to
                const edge = value && (d === value.from || d === value.to)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pickDay(d)}
                    title={n ? `${n} post${n === 1 ? '' : 's'}` : 'Nothing on this day'}
                    className={`relative grid h-8 place-items-center rounded-lg text-[12px] tabular-nums transition-colors ${
                      edge && selected
                        ? 'bg-brand font-bold text-white'
                        : selected
                          ? 'bg-brand-soft text-brand'
                          : n
                            ? 'font-semibold text-ink-900 hover:bg-ink-50'
                            : 'text-ink-400 hover:bg-ink-50'
                    } ${d === today && !(edge && selected) ? 'ring-1 ring-brand/40' : ''}`}
                  >
                    {Number(d.slice(8))}
                    {n > 0 && (
                      <span className={`absolute bottom-1 h-1 w-1 rounded-full ${edge && selected ? 'bg-white' : 'bg-brand'}`} />
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[10.5px] text-ink-400">
              {anchor ? 'Now click the last day of the range.' : 'Click a day — or two days for a range. Dots mark days with posts.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
