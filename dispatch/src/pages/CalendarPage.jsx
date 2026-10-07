import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiAlertCircle, FiCheck, FiImage, FiPlay, FiType, FiVideo } from 'react-icons/fi'
import { api } from '../api/client'
import GeneratingCanvas from '../components/ui/GeneratingCanvas'
import PlatformIcon from '../components/ui/PlatformIcon'
import SocialPreview from '../components/preview/SocialPreview'
import { PILLAR_LABELS, angleText } from '../lib/angles'
import { colorForBrand } from '../lib/brandColor'
import { phnomPenhClock, phnomPenhDate } from '../lib/tz'
import { useStore } from '../store'
import Select from '../components/ui/Select'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()

// Each post is coloured by where it stands: green = posted, blue =
// scheduled, yellow = waiting for a yes, red = failed, grey = sent back.
const TONE = {
  posted: { chip: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', label: 'Posted' },
  scheduled: { chip: 'bg-brand-soft border-brand/20', dot: 'bg-brand', label: 'Scheduled' },
  waiting: { chip: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400', label: 'Needs approval' },
  failed: { chip: 'bg-red-50 border-red-200', dot: 'bg-red-500', label: 'Failed' },
  rejected: { chip: 'bg-ink-50 border-ink-100 opacity-60', dot: 'bg-ink-300', label: 'Sent back' },
}
// An approved idea isn't out yet, and a partly-posted post still has a channel to go.
const toneOf = (it) =>
  TONE[it.status === 'approved' ? 'waiting' : it.status === 'partial' ? 'scheduled' : it.status] || TONE.scheduled
// "19:30": when a post goes out (or went out), or the time a plan gave an idea.
const timeOf = (it) => {
  const t = it.targets?.[0]
  if (t) return phnomPenhClock(t.published_at || t.scheduled_for)
  return it.planned_time || ''
}
const platformsOf = (it) => [...new Set((it.targets || []).map((t) => t.platform_name).filter(Boolean))]

export default function CalendarPage() {
  const { brands, showToast, activeBrand } = useStore()
  const navigate = useNavigate()
  const today = phnomPenhDate(0) // "YYYY-MM-DD"
  const [todayY, todayM] = today.split('-').map(Number)

  const [year, setYear] = useState(todayY)
  const [month, setMonth] = useState(todayM - 1) // 0-indexed
  // Starts on the brand picked in the sidebar, and follows it when it changes.
  const [brandFilter, setBrandFilter] = useState(activeBrand || 'all')
  useEffect(() => {
    setBrandFilter(activeBrand || 'all')
  }, [activeBrand])
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(null) // selected draft
  // Phone layout: the day whose ideas are listed under the compact month grid.
  const [picked, setPicked] = useState(today)
  const [busy, setBusy] = useState(false)
  // Desktop grid: days opened past their first 3 items via "+N more".
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleDay = (d) =>
    setExpanded((s) => {
      const next = new Set(s)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })

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

  // How many posts / ideas each brand has in the month on screen (for the dropdown).
  const brandCounts = useMemo(() => {
    if (!items) return {}
    const prefix = `${year}-${pad(month + 1)}`
    const out = { all: 0 }
    for (const it of items) {
      if (!String(it.planned_for || '').startsWith(prefix)) continue
      out.all += 1
      out[it.brand_slug] = (out[it.brand_slug] || 0) + 1
    }
    return out
  }, [items, year, month])

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
        <Select
          value={brands.some((b) => b.slug === brandFilter) ? brandFilter : 'all'}
          onChange={setBrandFilter}
          aria-label="Brand"
          buttonClassName="min-w-[190px] font-medium"
          options={[
            { value: 'all', label: 'All brands', hint: brandCounts.all != null ? `${brandCounts.all} this month` : undefined },
            ...brands.map((b) => ({
              value: b.slug,
              label: b.name,
              color: colorForBrand(b.slug),
              hint: `${brandCounts[b.slug] || 0} this month`,
            })),
          ]}
        />
        <Legend />
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
            {cells.map((dateStr, i) => {
              const isToday = dateStr === today
              const past = dateStr && dateStr < today
              return (
              <div
                key={dateStr ?? `pad-${i}`}
                className={`min-h-[118px] border-b border-r border-ink-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  isToday ? 'bg-brand/5 ring-1 ring-inset ring-brand/30' : past ? 'bg-ink-50/50' : !dateStr ? 'bg-ink-50/30' : ''
                }`}
              >
                {dateStr && (
                  <>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] font-bold tabular-nums ${
                          isToday ? 'bg-brand text-white' : past ? 'text-ink-300' : 'text-ink-700'
                        }`}
                      >
                        {Number(dateStr.slice(-2))}
                      </span>
                      {isToday && <span className="text-[10px] font-bold uppercase tracking-wide text-brand">Today</span>}
                    </div>
                    <div className="space-y-1">
                      {(byDay.get(dateStr) || []).slice(0, expanded.has(dateStr) ? undefined : 3).map((it) => (
                        <PostChip key={it.key} it={it} onOpen={() => setOpen(it)} />
                      ))}
                      {(byDay.get(dateStr) || []).length > 3 && (
                        <button
                          type="button"
                          onClick={() => toggleDay(dateStr)}
                          className="px-1.5 text-[10px] font-semibold text-ink-400 hover:text-brand"
                        >
                          {expanded.has(dateStr) ? 'Show less' : `+${(byDay.get(dateStr) || []).length - 3} more`}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              )
            })}
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
              onClick={() => navigate('/ai?tab=images')}
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


// ── one post in the month grid ─────────────────────────────────────────────
// Tinted by status (TONE), with the picture (or ▶ video / Aa text), the time
// and where it goes.

function Thumb({ it, size = 'h-8 w-8' }) {
  const m = it.media
  const base = `relative ${size} flex-none overflow-hidden rounded-md`
  if (m?.kind === 'image')
    return (
      <span className={`${base} bg-ink-100`}>
        <img src={`${mediaBase}${m.url}`} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    )
  if (m)
    return (
      <span className={`${base} bg-night-900`}>
        <video src={`${mediaBase}${m.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-night-950/60 text-white">
            <FiPlay size={8} aria-hidden="true" />
          </span>
        </span>
      </span>
    )
  if (it.media_pending)
    return <span className={`${base} animate-pulse bg-brand-soft`} title="Making the media…" />
  // A posted text-only post; an idea without media yet shows nothing.
  if (it.type === 'post')
    return (
      <span className={`${base} grid place-items-center bg-ink-100 text-ink-500`} title="Text post">
        <FiType size={12} aria-hidden="true" />
      </span>
    )
  return null
}

function PostChip({ it, onOpen }) {
  const time = timeOf(it)
  const platforms = platformsOf(it)
  const tone = toneOf(it)
  const rejected = it.status === 'rejected'
  const failed = it.status === 'failed'
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${it.title} — ${tone.label}`}
      className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-card ${tone.chip}`}
    >
      <Thumb it={it} />
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[9.5px] leading-none text-ink-500">
          {it.status === 'posted' ? (
            <FiCheck size={10} className="flex-none text-emerald-600" aria-label="Posted" />
          ) : failed ? (
            <FiAlertCircle size={10} className="flex-none text-red-600" aria-label="Failed" />
          ) : null}
          {time && <span className="font-semibold tabular-nums text-ink-700">{time}</span>}
          <span className="ml-auto flex flex-none items-center gap-0.5 [&_svg]:h-2.5 [&_svg]:w-2.5">
            {platforms.slice(0, 3).map((p) => (
              <PlatformIcon key={p} name={p} className="text-ink-400" />
            ))}
          </span>
        </span>
        <span className={`mt-0.5 block truncate text-[10.5px] font-medium leading-tight text-ink-800 ${rejected ? 'line-through' : ''} ${khmer(it.title)}`}>
          {it.title}
        </span>
      </span>
    </button>
  )
}

function Legend() {
  return (
    <div className="ml-auto hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500 lg:flex">
      {['posted', 'scheduled', 'waiting'].map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-4 rounded border ${TONE[k].chip}`} aria-hidden="true" />
          {TONE[k].label}
        </span>
      ))}
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
                    <span key={it.key} className={`h-1.5 w-1.5 rounded-full ${toneOf(it).dot}`} />
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
                  className={`flex w-full gap-3 rounded-2xl border px-3 py-3 text-left shadow-card ${toneOf(it).chip}`}
                >
                  <Thumb it={it} size="h-14 w-14" />
                  <span className="block min-w-0 flex-1">
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
                  </span>
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
  const [feed, setFeed] = useState(false) // the post as it shows in the feed (SocialPreview)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !feed && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, feed])

  const isPost = item.type === 'post'
  const m = item.media
  const making = !m && item.media_pending
  const day = item.planned_for
    ? new Date(`${item.planned_for}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/50 p-4 animate-fadein" onClick={onClose}>
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
          <div className="flex max-h-[40vh] flex-none items-center justify-center bg-night-950 sm:max-h-none sm:w-[380px]">
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

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Caption</span>
              {item.body && (
                <button type="button" onClick={() => setFeed(true)} className="text-[12px] font-semibold text-brand hover:underline">
                  See it in the feed →
                </button>
              )}
            </div>
            {feed && (
              <SocialPreview
                brand={{ id: item.brand_id, name: item.brand_name, slug: item.brand_slug }}
                caption={item.body}
                media={m}
                note={making ? 'Making the media…' : isPost ? null : 'No picture yet'}
                platforms={platformsOf(item)}
                onClose={() => setFeed(false)}
              />
            )}
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
                {PILLAR_LABELS[item.pillar] && (
                  <p className="mt-1 text-[11.5px] font-semibold text-ink-600">Topic: {PILLAR_LABELS[item.pillar]}</p>
                )}
                {angleText(item.angle) && (
                  <p className="mt-1 text-[11.5px] font-semibold text-ink-600">Angle: {angleText(item.angle)}</p>
                )}
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
