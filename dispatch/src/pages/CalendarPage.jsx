import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiImage, FiVideo } from 'react-icons/fi'
import { api } from '../api/client'
import GeneratingCanvas from '../components/ui/GeneratingCanvas'
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
      .then((rows) => {
        setItems(rows)
        setOpen((o) =>
          o
            ? rows.find((r) => r.key === o.key) ||
              rows.find((r) => r.type === 'post' && r.brand_id === o.brand_id && r.title === o.title) ||
              o
            : o,
        )
      })
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

  const pending = (items || []).some((it) => it.media_pending)
  useEffect(() => {
    if (!pending) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, year, month])

  const makeMedia = async (item, kind) => {
    if (busy) return
    setBusy(true)
    try {
      await api.post(`/views/drafts/${item.id}/media`, { kind })
      const mark = (x) => (x.key === item.key ? { ...x, media_pending: kind } : x)
      setItems((xs) => xs.map(mark))
      setOpen((o) => (o ? mark(o) : o))
      showToast(kind === 'video' ? 'Making the video — about 1–3 minutes' : 'Making the image — about 30 seconds')
    } catch (e) {
      showToast(`Couldn’t start — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

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
      const res = await api.post(`/views/drafts/${draft.id}/${action}`)
      if (res?.post_id) {
        // It had media, so approving scheduled it as a real post — show that.
        setOpen(null)
        load()
        showToast('Approved and scheduled')
      } else {
        const status = action === 'approve' ? 'approved' : 'rejected'
        setItems((xs) => xs.map((x) => (x.key === draft.key ? { ...x, status } : x)))
        setOpen((o) => (o ? { ...o, status } : o))
        showToast(action === 'approve' ? 'Approved' : 'Sent back')
      }
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
            Your posts and the AI's ideas, day by day. Click one to preview it — media, caption and where it goes out.
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
                          key={it.key}
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
                          {it.media &&
                            (it.media.kind === 'image' ? (
                              <FiImage size={10} className="ml-auto flex-none text-ink-400" />
                            ) : (
                              <FiVideo size={10} className="ml-auto flex-none text-ink-400" />
                            ))}
                          {it.status === 'failed' && <span className="flex-none text-[9px] font-bold text-red-600">!</span>}
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
        <PreviewModal
          item={open}
          busy={busy}
          onClose={() => setOpen(null)}
          onApprove={(it) => act(it, 'approve')}
          onReject={(it) => act(it, 'reject')}
          onUseIdea={useIdea}
          onMakeMedia={makeMedia}
          onResults={(targetId) => navigate(`/insights/${targetId}`)}
        />
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
  posted: ['Posted', 'bg-emerald-500'],
  partial: ['Partly posted', 'bg-amber-400'],
  failed: ['Failed', 'bg-red-500'],
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
                aria-label={`${dateStr}, ${dayItems.length} planned`}
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
                      key={it.key}
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
            {list.length} planned
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
                  key={it.key}
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


// ── preview ─────────────────────────────────────────────────────────────────
// Clicking a calendar item: a post shows as it goes out (its media, the
// caption, each channel's time and status); an idea shows its caption, any
// media it already has, and what to do next.
const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''

const PILL = {
  waiting: ['Waiting', 'bg-amber-100 text-amber-700'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-700'],
  scheduled: ['Scheduled', 'bg-brand-soft text-brand'],
  posted: ['Posted', 'bg-emerald-100 text-emerald-700'],
  partial: ['Partly posted', 'bg-amber-100 text-amber-700'],
  failed: ['Failed', 'bg-red-100 text-red-700'],
  queued: ['Scheduled', 'bg-brand-soft text-brand'],
  rejected: ['Sent back', 'bg-ink-100 text-ink-500'],
}
const SOURCE = { 'ai-auto': 'Auto-generate', 'ai-weekly': 'Weekly plan', compose: 'Compose' }

const whenLabel = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

function Pill({ status }) {
  const [label, tone] = PILL[status] || [status, 'bg-ink-100 text-ink-600']
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{label}</span>
}

function PreviewModal({ item, busy, onClose, onApprove, onReject, onUseIdea, onMakeMedia, onResults }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPost = item.type === 'post'
  const m = item.media
  const making = !m && item.media_pending
  const day = item.planned_for
    ? new Date(`${item.planned_for}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 animate-fadein" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-16px_rgba(16,24,40,0.35)] sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* the media, as it will post (or being made right now) */}
        {making && (
          <div className="flex-none p-3 sm:w-[380px]">
            <div className="mx-auto aspect-[9/16] max-h-[36vh] sm:max-h-none">
              <GeneratingCanvas
                icon={item.media_pending === 'video' ? '▶' : '✦'}
                stage={item.media_pending === 'video' ? 'Making the video…' : 'Making the image…'}
              />
            </div>
          </div>
        )}
        {m && (
          <div className="flex max-h-[40vh] flex-none items-center justify-center bg-ink-950 sm:max-h-none sm:w-[380px]">
            {m.kind === 'image' ? (
              <img src={`${mediaBase}${m.url}`} alt="" className="max-h-[40vh] w-full object-contain sm:max-h-[88vh]" />
            ) : (
              <video
                src={`${mediaBase}${m.url}`}
                controls
                playsInline
                preload="metadata"
                className="max-h-[40vh] w-full bg-black object-contain sm:max-h-[88vh]"
              />
            )}
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: colorForBrand(item.brand_slug) }} />
              <span className="font-semibold text-ink-800">{item.brand_name}</span>
              <span className="text-ink-300">·</span>
              <span>{day}</span>
              {SOURCE[item.source] && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>{SOURCE[item.source]}</span>
                </>
              )}
              <span className="ml-auto">
                <Pill status={item.status} />
              </span>
            </div>

            <h2 className={`mt-3 font-display text-[19px] leading-snug text-ink-900 ${khmer(item.title)}`}>{item.title}</h2>
            {!isPost && !m && !making && (
              <div className="mt-1 text-[11.5px] text-ink-400">Idea — no image or video yet</div>
            )}

            <div className="mt-4 text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Caption</div>
            <p className={`mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-700 ${khmer(item.body)}`}>
              {item.body || '—'}
            </p>

            {item.targets?.length > 0 && (
              <>
                <div className="mt-5 text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Where &amp; when</div>
                <div className="mt-1.5 divide-y divide-ink-100 rounded-xl border border-ink-200">
                  {item.targets.map((t) => (
                    <div key={t.id} className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2 text-[12.5px]">
                        <span className="font-semibold text-ink-800">{t.platform_name}</span>
                        {t.handle && <span className="truncate text-ink-400">{t.handle}</span>}
                        <span className="ml-auto flex-none">
                          <Pill status={t.status} />
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-500">
                        {t.published_at ? `Posted ${whenLabel(t.published_at)}` : `Goes out ${whenLabel(t.scheduled_for)}`}
                        {t.status === 'posted' && (
                          <button type="button" onClick={() => onResults(t.id)} className="ml-auto font-semibold text-brand hover:underline">
                            View results →
                          </button>
                        )}
                      </div>
                      {t.status === 'failed' && t.error && <div className="mt-1 text-[11px] text-red-600">{t.error}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {item.insight && (
              <details className="mt-4 group">
                <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-ink-500 hover:text-ink-800">
                  Why this idea <span className="text-ink-300 group-open:hidden">▸</span>
                  <span className="hidden text-ink-300 group-open:inline">▾</span>
                </summary>
                <p className="mt-1 text-[12px] italic leading-relaxed text-ink-500">{item.insight}</p>
              </details>
            )}
          </div>

          {/* actions for where it is now */}
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-3.5 sm:px-6">
            {!isPost && item.status === 'waiting' && (
              <>
                <button type="button" disabled={busy} onClick={() => onApprove(item)} className="btn-primary disabled:opacity-50">
                  {m ? 'Approve & schedule' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(item)}
                  className="rounded-xl border border-ink-200 px-4 py-2 text-[12px] font-semibold text-ink-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  Send back
                </button>
              </>
            )}
            {!isPost && item.status === 'approved' && m && (
              <button type="button" disabled={busy} onClick={() => onApprove(item)} className="btn-primary disabled:opacity-50">
                Schedule it
              </button>
            )}
            {!isPost && !m && !making && item.status !== 'rejected' && (
              <>
                <button type="button" disabled={busy} onClick={() => onMakeMedia(item, 'image')} className="btn-primary disabled:opacity-50">
                  <FiImage size={13} /> Generate image
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMakeMedia(item, 'video')}
                  className="btn-outline disabled:opacity-50"
                  title="An 8-second video — about $1.20 of AI credit"
                >
                  <FiVideo size={13} /> Generate video
                </button>
                <button type="button" onClick={() => onUseIdea(item)} className="text-[12px] font-semibold text-ink-500 hover:text-brand">
                  or open in AI Agent
                </button>
              </>
            )}
            {making && (
              <span className="text-[12px] text-ink-500">
                {item.status === 'approved' ? 'It will be scheduled on its day once the media is ready.' : 'Approve it once the media is ready.'}
              </span>
            )}
            <button type="button" onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-[12px] font-semibold text-ink-500 hover:bg-ink-100">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
