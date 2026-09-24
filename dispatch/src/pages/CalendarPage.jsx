import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { phnomPenhDate } from '../lib/tz'
import { useStore } from '../store'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()

export default function CalendarPage() {
  const { brands, showToast } = useStore()
  const navigate = useNavigate()
  const today = phnomPenhDate(0) // "YYYY-MM-DD"
  const [todayY, todayM] = today.split('-').map(Number)

  const [year, setYear] = useState(todayY)
  const [month, setMonth] = useState(todayM - 1) // 0-indexed
  const [brandFilter, setBrandFilter] = useState('all')
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(null) // selected draft
  // Phone layout: the day whose ideas are listed under the compact month grid.
  const [picked, setPicked] = useState(today)
  const [busy, setBusy] = useState(false)

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const load = () => {
    const start = ymd(year, month, 1)
    const end = ymd(year, month, daysInMonth(year, month))
    api
      .get(`/views/calendar?start=${start}&end=${end}`)
      .then(setItems)
      .catch(() => setItems([]))
  }

  useEffect(() => {
    load()
    // Keep the picked day inside the month on screen: today if it's this
    // month, otherwise the 1st.
    const prefix = `${year}-${pad(month + 1)}`
    setPicked((p) => (p.startsWith(prefix) ? p : today.startsWith(prefix) ? today : `${prefix}-01`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const shiftMonth = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonth(m)
    setYear(y)
  }

  const byDay = useMemo(() => {
    const map = new Map()
    for (const it of items || []) {
      if (brandFilter !== 'all' && it.brand_slug !== brandFilter) continue
      if (!map.has(it.planned_for)) map.set(it.planned_for, [])
      map.get(it.planned_for).push(it)
    }
    return map
  }, [items, brandFilter])

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay()
    const total = daysInMonth(year, month)
    const out = []
    for (let i = 0; i < firstWeekday; i++) out.push(null)
    for (let d = 1; d <= total; d++) out.push(ymd(year, month, d))
    return out
  }, [year, month])

  const act = async (draft, action) => {
    if (busy) return
    setBusy(true)
    try {
      await api.post(`/views/drafts/${draft.id}/${action}`)
      setItems((xs) => xs.map((x) => (x.id === draft.id ? { ...x, status: action === 'approve' ? 'approved' : 'rejected' } : x)))
      setOpen((o) => (o ? { ...o, status: action === 'approve' ? 'approved' : 'rejected' } : o))
      showToast(action === 'approve' ? 'Approved' : 'Sent back')
    } catch (e) {
      showToast(`Could not update — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const useIdea = (draft) => {
    const brand = brands.find((b) => b.slug === draft.brand_slug)
    navigate('/ai', {
      state: {
        brandSlug: brand?.slug,
        topic: draft.title,
        extra: draft.body,
      },
    })
  }

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6">
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub mt-1">
            What the AI has planned to post, day by day. Click an idea to read it, approve it, or turn it into a post.
          </p>
        </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="w-8 h-8 rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 grid place-items-center"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="min-w-[150px] text-center font-bold text-ink-800 text-[13.5px]">{monthLabel}</div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="w-8 h-8 rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 grid place-items-center"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setYear(todayY); setMonth(todayM - 1) }}
          className="px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-600 text-[11.5px] font-semibold hover:bg-ink-50"
        >
          Today
        </button>
        <span className="mx-1 h-5 w-px bg-ink-200 hidden sm:block" />
        <div className="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 pb-0.5 side-scroll sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
        <button
          type="button"
          onClick={() => setBrandFilter('all')}
          className={`flex-none px-3 py-1.5 rounded-xl border text-[11.5px] font-semibold transition-all duration-150 ${
            brandFilter === 'all' ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 text-ink-600 hover:border-brand-line'
          }`}
        >
          All brands
        </button>
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandFilter(b.slug)}
            className={`flex-none whitespace-nowrap px-3 py-1.5 rounded-xl border text-[11.5px] font-semibold flex items-center gap-1.5 transition-all duration-150 ${
              brandFilter === b.slug ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 text-ink-600 hover:border-brand-line'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: colorForBrand(b.slug) }} />
            {b.name}
          </button>
        ))}
        </div>
      </div>

      {items !== null && (
        <MobileMonth
          cells={cells}
          byDay={byDay}
          today={today}
          picked={picked}
          onPick={setPicked}
          onOpen={setOpen}
        />
      )}

      {items === null ? (
        <div className="hidden sm:block rounded-2xl border border-ink-100 bg-white overflow-hidden shadow-card">
          <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/60">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-400 text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="min-h-[104px] border-b border-r border-ink-100 p-1.5 [&:nth-child(7n)]:border-r-0">
                <div className="h-3 w-8 rounded skeleton mb-2" />
                <div className="h-6 rounded skeleton mb-1.5" />
                <div className="h-6 rounded skeleton" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="hidden sm:block rounded-2xl border border-ink-100 bg-white overflow-hidden shadow-card">
          <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/60">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-400 text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((dateStr, i) => (
              <div
                key={dateStr ?? `pad-${i}`}
                className={`min-h-[104px] border-b border-r border-ink-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  dateStr === today ? 'bg-brand/5' : ''
                }`}
              >
                {dateStr && (
                  <>
                    <div className={`text-[10.5px] font-semibold mb-1 ${dateStr === today ? 'text-brand' : 'text-ink-500'}`}>
                      {Number(dateStr.slice(-2))}
                    </div>
                    <div className="space-y-1">
                      {(byDay.get(dateStr) || []).slice(0, 3).map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => setOpen(it)}
                          className={`w-full text-left px-1.5 py-1 rounded-md text-[10px] leading-tight truncate flex items-center gap-1 ${
                            it.status === 'rejected'
                              ? 'bg-ink-100 text-ink-400 line-through'
                              : 'bg-white border border-ink-100 text-ink-700 hover:border-brand/40'
                          }`}
                          title={it.title}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-none"
                            style={{ background: colorForBrand(it.brand_slug) }}
                          />
                          <span className="truncate">{it.title}</span>
                        </button>
                      ))}
                      {(byDay.get(dateStr) || []).length > 3 && (
                        <div className="text-[10px] text-ink-400 px-1.5">
                          +{(byDay.get(dateStr) || []).length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="mt-3 card px-5 py-8 text-center">
          <div className="text-[12.5px] font-semibold text-ink-700">
            Nothing planned for {monthLabel}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-400">
            Switch on a brand in Auto-generate, or prompt the AI Agent for an idea.
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/ai')}
              className="btn-primary"
            >
              Plan with the AI Agent
            </button>
            <button
              type="button"
              onClick={() => navigate('/auto')}
              className="btn-outline"
            >
              Open Auto-generate
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/25 backdrop-blur-md flex items-center justify-center p-4 animate-fadein"
          onClick={() => setOpen(null)}
        >
          <div
            className="glass-strong rounded-3xl overflow-hidden max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 lg:p-6 flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-[11.5px] text-ink-500 flex-wrap">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: colorForBrand(open.brand_slug) }} />
                <span className="font-semibold text-ink-800">{open.brand_name}</span>
                <span className="text-ink-300">·</span>
                <span>{open.planned_for}</span>
                <span
                  className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    open.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : open.status === 'rejected'
                        ? 'bg-ink-100 text-ink-500'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {open.status}
                </span>
              </div>
              <h2 className="mt-3 font-display text-[20px] leading-tight text-ink-900">{open.title}</h2>
              {open.insight && (
                <p className="mt-2 text-[12px] text-ink-500 italic leading-relaxed">{open.insight}</p>
              )}
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-ink-400">Caption</div>
              <p className="mt-1 text-[12.5px] text-ink-700 leading-relaxed overflow-y-auto flex-1 whitespace-pre-line pr-1">
                {open.body}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => useIdea(open)}
                  className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[12px] font-bold hover:shadow-glow-lg transition-all duration-200"
                >
                  Use this idea →
                </button>
                {open.status === 'waiting' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(open, 'approve')}
                      className="px-4 py-2.5 rounded-xl border-2 border-brand text-brand text-[12px] font-bold hover:bg-brand/5 disabled:opacity-50 transition-all duration-150"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(open, 'reject')}
                      className="px-4 py-2.5 rounded-xl border border-ink-200 text-ink-500 text-[12px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-all duration-150"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="ml-auto px-4 py-2.5 rounded-xl text-ink-500 text-[12px] font-bold hover:bg-ink-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── phone layout ────────────────────────────────────────────────────────────
// A compact month (date + coloured dots per idea) and, under it, a readable
// list of the picked day's ideas — the usual phone-calendar pattern. The
// desktop grid above is hidden below the `sm` breakpoint.
const STATUS = {
  waiting: ['Waiting', 'bg-amber-400'],
  approved: ['Approved', 'bg-emerald-500'],
  scheduled: ['Scheduled', 'bg-brand'],
  rejected: ['Sent back', 'bg-ink-300'],
}
const khmer = (t) => (/[\u1780-\u17FF]/.test(t || '') ? 'font-khmer' : '')

function MobileMonth({ cells, byDay, today, picked, onPick, onOpen }) {
  const list = byDay.get(picked) || []
  const label = new Date(`${picked}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="sm:hidden space-y-4">
      <div className="rounded-2xl border border-ink-100 bg-white p-2 shadow-card">
        <div className="grid grid-cols-7 pb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-center text-[10.5px] font-semibold text-ink-400">
              {w.charAt(0)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`pad-${i}`} />
            const dayItems = byDay.get(dateStr) || []
            const isPicked = dateStr === picked
            const isToday = dateStr === today
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onPick(dateStr)}
                className="flex h-12 flex-col items-center justify-start gap-1 rounded-xl pt-1"
                aria-label={`${dateStr}, ${dayItems.length} idea${dayItems.length === 1 ? '' : 's'}`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full text-[12.5px] font-semibold ${
                    isPicked
                      ? 'bg-brand text-white'
                      : isToday
                        ? 'text-brand ring-1 ring-brand/40'
                        : 'text-ink-700'
                  }`}
                >
                  {Number(dateStr.slice(-2))}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: it.status === 'rejected' ? '#CBD2D9' : colorForBrand(it.brand_slug) }}
                    />
                  ))}
                  {dayItems.length > 3 && <span className="text-[8px] font-bold leading-none text-ink-400">+</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-[14px] font-semibold text-ink-900">{label}</div>
          <div className="text-[11.5px] text-ink-400">
            {list.length} idea{list.length === 1 ? '' : 's'}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-[12.5px] text-ink-400">
            Nothing planned this day
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((it) => {
              const [statusLabel, statusDot] = STATUS[it.status] || [it.status, 'bg-ink-300']
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onOpen(it)}
                  className={`w-full rounded-2xl border border-ink-100 bg-white px-4 py-3 text-left shadow-card active:bg-ink-50 ${
                    it.status === 'rejected' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: colorForBrand(it.brand_slug) }} />
                    <span className="truncate font-semibold text-ink-700">{it.brand_name}</span>
                    <span className="ml-auto inline-flex flex-none items-center gap-1.5 text-ink-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                      {statusLabel}
                    </span>
                  </div>
                  <div className={`mt-1 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-900 ${khmer(it.title)}`}>
                    {it.title}
                  </div>
                  {it.body && (
                    <div className={`mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500 ${khmer(it.body)}`}>
                      {it.body}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
