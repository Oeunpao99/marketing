import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiCalendar } from 'react-icons/fi'
import { colorForBrand } from '../../lib/brandColor'
import { phnomPenhDay, dayLabel } from '../../lib/tz'
import PlatformIcon from '../ui/PlatformIcon'
import StatusBadge from './StatusBadge'

const isKhmer = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s)

export default function DayView({ queue, match = () => true }) {
  const navigate = useNavigate()
  const prevStatus = useRef({})
  const [justPosted, setJustPosted] = useState({})

  useEffect(() => {
    const nextJust = {}
    for (const q of queue) {
      const key = q.postId ?? q.targetId
      const was = prevStatus.current[key]
      if (was && was !== 'posted' && q.st === 'posted') nextJust[key] = true
      prevStatus.current[key] = q.st
    }
    if (Object.keys(nextJust).length) {
      setJustPosted((j) => ({ ...j, ...nextJust }))
      const t = setTimeout(
        () =>
          setJustPosted((j) => {
            const copy = { ...j }
            for (const k of Object.keys(nextJust)) delete copy[k]
            return copy
          }),
        700,
      )
      return () => clearTimeout(t)
    }
  }, [queue])

  const visible = queue.map((q, i) => ({ q, i })).filter(({ q }) => match(q))

  if (!visible.length) {
    return (
      <div className="px-7 py-14 text-center">
        <div className="mx-auto mb-3 w-12 h-12 rounded-2xl grid place-items-center bg-brand-soft text-brand">
          <FiCalendar size={20} />
        </div>
        <div className="text-[12.5px] font-semibold text-ink-700">Nothing on this day</div>
        <div className="mt-1 text-[11.5px] text-ink-400">Pick another date above, or head to New Post.</div>
      </div>
    )
  }

  const groups = []
  for (const entry of visible) {
    const day = phnomPenhDay(entry.q.scheduledFor) || 'unscheduled'
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  }

  const item = ({ q, i, lastInGroup }) => {
    const color = colorForBrand(q.b)
    const name = q.brandName || q.b
    const key = q.postId ?? q.targetId ?? i
    const sending = q.st === 'sending'
    const failed = q.st === 'failed'
    const posted = q.st === 'posted'
    const queued = q.st === 'queued'
    return (
      <div key={key} className="relative">
        {!lastInGroup && <span className="absolute left-[22px] bottom-0 top-11 w-px bg-ink-100" />}
        <div className="relative flex gap-4">
          <div className="relative z-10 flex flex-col items-center pt-[26px]">
            <span
              className={`grid h-[19px] w-[19px] place-items-center rounded-full border-2 ${
                posted
                  ? 'border-emerald-400 bg-emerald-400'
                  : failed
                    ? 'border-red-400 bg-red-50'
                    : sending
                      ? 'border-brand bg-brand-soft animate-pulse-glow'
                      : queued
                        ? 'border-amber-300 bg-white'
                        : 'border-ink-300 bg-white'
              }`}
            >
              {(posted || sending) && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none">
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {queued && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
            </span>
          </div>

          <div className="min-w-0 flex-1 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="font-mono text-[11.5px] font-bold text-ink-500 tabular-nums">{q.t}</span>
              <StatusBadge status={q.st} />
            </div>
            <button
              type="button"
              onClick={() => navigate(`/post/${i}`)}
              className={`w-full text-left rounded-2xl border px-4 py-3 transition-all duration-150 cursor-pointer hover:-translate-y-0.5 hover:shadow-card ${
                sending
                  ? 'border-brand-line bg-brand-softer'
                  : failed
                    ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                    : posted
                      ? 'border-ink-100 bg-white hover:border-emerald-200'
                      : 'border-ink-100 bg-white hover:border-brand-line'
              } ${justPosted[key] ? 'animate-post-pop' : ''}`}
            >
              <div className="flex gap-3">
                <span
                  className={`grid w-8 h-12 flex-none place-items-center rounded-lg text-[10px] font-black uppercase tracking-wide border ${
                    sending ? 'border-brand-line bg-brand-soft text-brand' : 'border-transparent'
                  }`}
                  style={!sending ? { background: `${color}1A`, color } : undefined}
                >
                  {name.slice(0, 4)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-display text-ink-900 tracking-tight">{name}</span>
                    {q.c.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold text-ink-500 bg-ink-50 border border-ink-200"
                      >
                        <PlatformIcon name={ch} className="text-ink-400" />
                        {ch}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-[12.5px] font-semibold text-ink-800 leading-snug">{q.ttl}</div>
                  <div className={`text-[11.5px] text-ink-500 truncate max-w-[52ch] ${isKhmer(q.cap) ? 'font-khmer' : ''}`}>
                    {q.cap}
                  </div>
                  {sending && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-brand-line">
                        <span className="absolute top-0 h-full rounded-full bg-brand animate-indeterminate" />
                      </div>
                      <span className="text-[10px] font-semibold text-brand whitespace-nowrap">
                        sending to {q.c.length === 1 ? q.c[0] : `${q.c.length} channels`}…
                      </span>
                    </div>
                  )}
                  {failed && q.error && (
                    <div className="mt-1 text-[11px] text-red-600 truncate max-w-[52ch]">{q.error}</div>
                  )}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 lg:px-7 pb-4">
      {groups.map((group, gi) => (
        <div key={group.day} className={gi > 0 ? 'mt-6' : ''}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded-md bg-brand-soft border border-brand-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              {group.day === 'unscheduled' ? 'Unscheduled' : dayLabel(group.day)}
            </span>
            <span className="h-px flex-1 bg-ink-100" />
            <span className="text-[10px] font-semibold text-ink-400">{group.entries.length}</span>
          </div>
          {group.entries.map((entry, ei) =>
            item({ ...entry, lastInGroup: ei === group.entries.length - 1 }),
          )}
        </div>
      ))}
    </div>
  )
}