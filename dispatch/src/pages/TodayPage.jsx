import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import DayView from '../components/today/DayView'
import TableView from '../components/today/TableView'
import CircularProgress from '../components/ui/CircularProgress'
import Pager from '../components/ui/Pager'
import { phnomPenhDay, phnomPenhDate, fullDayLabel } from '../lib/tz'
import DateRangePicker, { inRange } from '../components/ui/DateRangePicker'
import { FiCheck, FiCheckCircle, FiClock, FiEdit3, FiEye, FiInbox, FiLayers, FiRefreshCw, FiSend, FiShare2, FiZap } from 'react-icons/fi'
import { DeltaText } from '../components/insights/Overview'
import { DailyStackedBars, DonutWithTable, Insights, useDashboardStats } from '../components/today/DashboardCharts'

const PER_PAGE = 10 // queue posts per page

function ChartCard({ title, sub, className = '', children }) {
  return (
    <section className={`min-w-0 bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 ${className}`}>
      <h2 className="text-[14.5px] font-semibold text-ink-900 tracking-tight">{title}</h2>
      {sub && <p className="mt-0.5 mb-4 text-[11.5px] text-ink-400">{sub}</p>}
      {children}
    </section>
  )
}

function KpiCard({ icon: Icon, label, value, note, loading, children }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-4 py-4 min-w-0 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <Icon size={17} className="text-ink-600 mb-2.5" aria-hidden="true" />
        <div className="text-[12px] text-ink-600">{label}</div>
        <div className="mt-1.5 text-[24px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">
          {loading ? <span className="inline-block w-8 h-6 rounded-md skeleton align-middle" /> : value}
        </div>
        {note && <div className="mt-2 text-[11.5px] text-ink-500">{note}</div>}
      </div>
      {children}
    </div>
  )
}

function QueueSkeleton() {
  return (
    <div className="px-5 lg:px-7 pb-6 space-y-4">
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex gap-4">
          <div className="w-[19px] h-[19px] rounded-full skeleton mt-7 flex-none" />
          <div className="flex-1 space-y-2 py-2">
            <div className="w-16 h-3 rounded-md skeleton" />
            <div className="h-[74px] rounded-2xl skeleton" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TodayPage() {
  const { queue, channels, review, queueReady, activeBrand, brands } = useStore()
  const [range, setRange] = useState(null) // { from, to } Phnom Penh days, null = all dates
  const [view, setView] = useState('timeline')
  const liveCount = channels.filter((c) => c.s !== 'off').length
  const sendingCount = queue.filter((q) => q.st === 'sending').length
  const stats = useDashboardStats(queue, channels)
  const { weekday: todayWeekday, rest: todayRest } = fullDayLabel(phnomPenhDate())
  const active = brands.find((b) => b.slug === activeBrand)
  const reviewCount = (review || []).length

  // Posts per day — the date picker marks these days on its calendar.
  const dayCounts = useMemo(() => {
    const out = {}
    for (const q of queue) {
      const d = phnomPenhDay(q.scheduledFor)
      if (d) out[d] = (out[d] || 0) + 1
    }
    return out
  }, [queue])

  const inDay = (q) => inRange(phnomPenhDay(q.scheduledFor), range)
  const empty = queueReady && queue.length === 0

  // 10 posts per page, in dispatch order. The views still get the whole queue
  // and a `match` filter — it just also checks the post is on this page.
  const [page, setPage] = useState(0)
  const listRef = useRef(null)
  // Today's posts first, then everything else newest → oldest (by date AND
  // time — the store's order is time-of-day only, which would mix days).
  const ordered = useMemo(() => {
    const today = phnomPenhDate()
    const when = (q) => (q.scheduledFor ? new Date(q.scheduledFor).getTime() : -Infinity)
    return [...queue].sort(
      (a, b) =>
        (phnomPenhDay(b.scheduledFor) === today) - (phnomPenhDay(a.scheduledFor) === today) ||
        when(b) - when(a) ||
        String(b.t).localeCompare(String(a.t)),
    )
  }, [queue])
  const inDayList = ordered.filter(inDay)
  // Totals for the dates picked above (latest saved numbers, all channels).
  const totals = useMemo(() => {
    const t = { posts: inDayList.length, published: 0, views: 0, engagement: 0, shares: 0, hasViews: false }
    for (const q of inDayList) {
      if (q.st === 'posted') t.published += 1
      const s = q.stats
      if (!s) continue
      if (typeof s.views === 'number') (t.views += s.views), (t.hasViews = true)
      t.engagement += (s.likes || 0) + (s.comments || 0) + (s.shares || 0)
      t.shares += s.shares || 0
    }
    return t
  }, [inDayList])
  const pageCount = Math.max(1, Math.ceil(inDayList.length / PER_PAGE))
  const current = Math.min(page, pageCount - 1) // the live refresh can shrink the list
  const onPage = new Set(inDayList.slice(current * PER_PAGE, (current + 1) * PER_PAGE))
  const match = (q) => onPage.has(q)
  useEffect(() => setPage(0), [range])
  const goToPage = (p) => {
    setPage(Math.min(Math.max(0, p), pageCount - 1))
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">
            {todayWeekday}, {todayRest}
          </h1>
          <p className="mt-1 text-[13px] text-ink-600">
            {active?.name ? `${active.name} · ` : ''}
            {liveCount} of {channels.length || 0} channels live
            {reviewCount > 0 && (
              <>
                {' · '}
                <Link to="/review" className="text-brand font-medium hover:underline">
                  {reviewCount} waiting for you
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/ai" className="btn-outline">
            <FiZap size={14} /> Generate with AI
          </Link>
          <Link to="/new" className="btn-primary">
            <FiEdit3 size={14} /> Create a post
          </Link>
        </div>
      </div>

      {/* KPI cards — counted per delivery (a post to 2 Pages = 2) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={FiCheckCircle}
          label="Published · 30 days"
          value={stats.published30}
          note={
            <>
              <DeltaText current={stats.published30} previous={stats.publishedPrev30} className="text-[11.5px]" /> vs the 30 days before
            </>
          }
          loading={!queueReady}
        />
        <KpiCard
          icon={FiClock}
          label="Scheduled · next 7 days"
          value={stats.upcoming}
          note={stats.emptyAhead ? `${stats.emptyAhead} day${stats.emptyAhead === 1 ? '' : 's'} with nothing planned` : 'every day covered'}
          loading={!queueReady}
        />
        <KpiCard
          icon={FiCheck}
          label="Success rate · 30 days"
          value={stats.successRate == null ? '—' : `${stats.successRate}%`}
          note={stats.failed30 ? `${stats.failed30} failed` : 'nothing failed'}
          loading={!queueReady}
        >
          {stats.successRate != null && (
            <CircularProgress percent={stats.successRate} size={56} stroke={6} trackColor="rgb(var(--ink-100))" />
          )}
        </KpiCard>
        <KpiCard
          icon={FiInbox}
          label="Ideas to review"
          value={reviewCount}
          note={
            reviewCount ? (
              <Link to="/review" className="font-medium text-brand hover:underline">
                Review now →
              </Link>
            ) : (
              'all caught up'
            )
          }
          loading={!queueReady}
        />
      </div>

      {/* Charts + insights */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Posts per day" sub="Last 14 days and the next 7 · by platform">
          {queueReady ? <DailyStackedBars days={stats.days} platforms={stats.platforms} /> : <div className="h-[190px] rounded-xl skeleton" />}
        </ChartCard>
        <ChartCard title="Where your posts go" sub="Published in the last 30 days, by platform">
          {queueReady ? (
            <DonutWithTable segments={stats.shareSegments} centerLabel="posts" emptyText="Nothing published in the last 30 days." />
          ) : (
            <div className="h-[132px] rounded-xl skeleton" />
          )}
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="What stands out" sub="Worked out from your posts — most urgent first">
          {queueReady ? <Insights items={stats.insights} /> : <div className="h-[110px] rounded-xl skeleton" />}
        </ChartCard>
        <ChartCard title="Delivery status" sub="Last 30 days and the next 7">
          {queueReady ? (
            <DonutWithTable segments={stats.statusSegments} centerLabel="deliveries" emptyText="No deliveries in this period." />
          ) : (
            <div className="h-[132px] rounded-xl skeleton" />
          )}
        </ChartCard>
      </div>

      {/* Queue */}
      <div ref={listRef} className="scroll-mt-4 bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <header className="px-5 lg:px-7 pt-5 pb-3 flex items-center justify-between gap-3.5">
          <div>
            <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">Queue</h2>
            <p className="text-[11px] text-ink-400 mt-0.5">Today first, then newest to oldest · refreshes every 6s</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[11px] font-semibold text-ink-500">
            {sendingCount > 0 ? <FiSend size={11} className="text-brand" /> : <FiRefreshCw size={11} className="text-brand" />}
            {sendingCount > 0 ? `${sendingCount} sending now` : 'live'}
          </span>
        </header>

        <div className="px-5 lg:px-7 pb-2 flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} counts={dayCounts} />

          <div className="ml-auto inline-flex items-center gap-0.5 rounded-xl border border-ink-200 bg-ink-50 p-0.5">
            <button
              type="button"
              onClick={() => setView('timeline')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                view === 'timeline' ? 'bg-white text-brand shadow-sm ring-1 ring-brand/15' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                view === 'table' ? 'bg-white text-brand shadow-sm ring-1 ring-brand/15' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              Table
            </button>
          </div>
        </div>

        {queueReady && inDayList.length > 0 && (
          <div className="mx-5 lg:mx-7 mt-2 mb-3 grid grid-cols-2 sm:grid-cols-5 gap-px overflow-hidden rounded-xl border border-ink-100 bg-ink-100">
            {[
              [FiLayers, 'Posts', totals.posts],
              [FiCheckCircle, 'Published', totals.published],
              [FiEye, 'Views', totals.hasViews ? totals.views : '—'],
              [FiZap, 'Engagement', totals.engagement],
              [FiShare2, 'Shares', totals.shares],
            ].map(([Icon, label, value]) => (
              <div key={label} className="bg-white px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <Icon size={12} className="text-ink-400" aria-hidden="true" />
                  {label}
                </div>
                <div className="mt-0.5 text-[17px] font-bold tabular-nums text-ink-900">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
              </div>
            ))}
          </div>
        )}

        {!queueReady ? (
          <QueueSkeleton />
        ) : empty ? (
          <div className="px-7 py-14 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl grid place-items-center bg-brand-soft text-brand">
              <FiCheck size={24} />
            </div>
            <div className="text-[13.5px] font-semibold text-ink-800">Your queue is clear</div>
            <div className="mt-1.5 text-[12px] text-ink-400 max-w-[42ch] mx-auto">
              Nothing scheduled yet. Compose a post or let the AI Agent draft one for you.
            </div>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Link to="/new" className="btn-primary">
                <FiEdit3 size={14} /> Create a post
              </Link>
              <Link to="/ai" className="btn-outline">
                <FiZap size={14} /> Try the AI Agent
              </Link>
            </div>
          </div>
        ) : inDayList.length === 0 ? (
          <div className="px-7 py-14 text-center text-[12px] text-ink-400">
            Nothing on these dates.{' '}
            <button type="button" onClick={() => setRange(null)} className="font-semibold text-brand hover:underline">
              Show all dates
            </button>
          </div>
        ) : (
          <>
            {view === 'table' ? <TableView queue={ordered} match={match} /> : <DayView queue={ordered} match={match} />}
            <Pager page={current} pages={pageCount} total={inDayList.length} perPage={PER_PAGE} onPage={goToPage} />
          </>
        )}
      </div>
    </div>
  )
}