import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import DayView from '../components/today/DayView'
import TableView from '../components/today/TableView'
import CircularProgress from '../components/ui/CircularProgress'
import { phnomPenhDay, phnomPenhDate, dayLabel, fullDayLabel } from '../lib/tz'
import { FiCheck, FiCheckCircle, FiClock, FiEdit3, FiRefreshCw, FiSend, FiZap } from 'react-icons/fi'

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
  const [day, setDay] = useState('all')
  const [view, setView] = useState('timeline')
  const liveCount = channels.filter((c) => c.s !== 'off').length
  const postedCount = queue.filter((q) => q.st === 'posted').length
  const sendingCount = queue.filter((q) => q.st === 'sending').length
  const waitingCount = queue.filter((q) => q.st === 'queued' || q.st === 'sending').length
  const doneRatio = queue.length ? Math.round((postedCount / queue.length) * 100) : 0
  const { weekday: todayWeekday, rest: todayRest } = fullDayLabel(phnomPenhDate())
  const active = brands.find((b) => b.slug === activeBrand)
  const reviewCount = (review || []).length

  const days = useMemo(() => {
    const set = new Set()
    for (const q of queue) {
      const d = phnomPenhDay(q.scheduledFor)
      if (d) set.add(d)
    }
    return Array.from(set).sort()
  }, [queue])

  const visibleDays = day === 'all' ? days : days.filter((d) => d === day)
  const match = (q) => day === 'all' || phnomPenhDay(q.scheduledFor) === day
  const empty = queueReady && queue.length === 0

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

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={FiCheckCircle} label="Posted" value={postedCount} note="went out successfully" loading={!queueReady} />
        <KpiCard
          icon={FiSend}
          label="Posting now"
          value={sendingCount}
          note={sendingCount > 0 ? 'sending to channels' : 'nothing in flight'}
          loading={!queueReady}
        />
        <KpiCard icon={FiClock} label="Waiting" value={waitingCount} note="scheduled, not yet sent" loading={!queueReady} />
        <KpiCard icon={FiCheck} label="Day complete" value={`${doneRatio}%`} note={`${postedCount} of ${queue.length} posts`} loading={!queueReady}>
          <CircularProgress percent={doneRatio} size={64} stroke={7} trackColor="#EDEFF3" />
        </KpiCard>
      </div>

      {/* Queue */}
      <div className="bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <header className="px-5 lg:px-7 pt-5 pb-3 flex items-center justify-between gap-3.5">
          <div>
            <h2 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">Queue</h2>
            <p className="text-[11px] text-ink-400 mt-0.5">In dispatch order · refreshes every 6s</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[11px] font-semibold text-ink-500">
            <FiRefreshCw size={11} className="text-brand" />
            live
          </span>
        </header>

        <div className="px-5 lg:px-7 pb-2 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDay('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                day === 'all'
                  ? 'border-brand-line bg-brand-soft text-brand'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-brand-line'
              }`}
            >
              All ({queue.length})
            </button>
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(day === d ? 'all' : d)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                  day === d
                    ? 'border-brand-line bg-brand-soft text-brand'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-brand-line'
                }`}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>

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
        ) : visibleDays.length === 0 ? (
          <div className="px-7 py-14 text-center text-[12px] text-ink-400">
            Nothing scheduled for this day. Pick another date above.
          </div>
        ) : view === 'table' ? (
          <TableView queue={queue} match={match} />
        ) : (
          <DayView queue={queue} match={match} />
        )}
      </div>
    </div>
  )
}