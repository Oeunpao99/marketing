import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BRANDS } from '../../data/brands'
import { phnomPenhDay, dayLabel } from '../../lib/tz'
import PlatformIcon from '../ui/PlatformIcon'
import StatusBadge from './StatusBadge'

const BRAND_NOTES = {
  assist: { color: '#3B82F6', softBg: '#EFF6FF', softText: '#2563EB' },
  chum: { color: '#F59E0B', softBg: '#FFFBEB', softText: '#D97706' },
  hub: { color: '#8B5CF6', softBg: '#F5F3FF', softText: '#7C3AED' },
}
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
      <div className="px-7 py-16 text-center text-[13px] text-ink-400">
        Nothing on this day. Pick another date above.
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
    const brand = BRANDS.find((b) => b.id === q.b)
    const note = BRAND_NOTES[q.b] || BRAND_NOTES.chum
    const name = brand?.name || q.brandName || q.b
    const key = q.postId ?? q.targetId ?? i
    const sending = q.st === 'sending'
    const failed = q.st === 'failed'
    const posted = q.st === 'posted'
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
                      ? 'border-violet-400 bg-violet-50 animate-pulse-glow'
                      : 'border-ink-300 bg-white'
              }`}
            >
              {posted && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none">
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>

          <div className="min-w-0 flex-1 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="font-mono text-[12.5px] font-bold text-ink-500 tabular-nums">{q.t}</span>
              <StatusBadge status={q.st} />
            </div>
            <button
              type="button"
              onClick={() => navigate(`/post/${i}`)}
              className={`w-full text-left rounded-2xl border px-4 py-3 transition-all duration-150 cursor-pointer hover:-translate-y-0.5 hover:shadow-card ${
                sending
                  ? 'border-violet-200 bg-violet-50/50'
                  : failed
                    ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                    : posted
                      ? 'border-ink-100 bg-white hover:border-emerald-200'
                      : 'border-ink-100 bg-white hover:border-ink-200'
              } ${justPosted[key] ? 'animate-post-pop' : ''}`}
            >
              <div className="flex gap-3">
                <span
                  className={`grid w-8 h-12 flex-none place-items-center rounded-lg text-[10px] font-black uppercase tracking-wide ${
                    sending ? 'bg-violet-100 text-violet-600' : note.softBg
                  }`}
                  style={!sending ? { color: note.softText } : undefined}
                >
                  {name.slice(0, 4)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-display text-ink-900 tracking-tight">{name}</span>
                    {q.c.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-semibold text-ink-500 bg-ink-50 border border-ink-200"
                      >
                        <PlatformIcon name={ch} className="text-ink-400" />
                        {ch}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-[13.5px] font-semibold text-ink-800 leading-snug">{q.ttl}</div>
                  <div className={`text-[12.5px] text-ink-500 truncate max-w-[52ch] ${isKhmer(q.cap) ? 'font-khmer' : ''}`}>
                    {q.cap}
                  </div>
                  {sending && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-violet-100">
                        <span className="absolute top-0 h-full rounded-full bg-violet-500 animate-indeterminate" />
                      </div>
                      <span className="text-[10.5px] font-semibold text-violet-500 whitespace-nowrap">
                        sending to {q.c.length === 1 ? q.c[0] : `${q.c.length} channels`}…
                      </span>
                    </div>
                  )}
                  {failed && q.error && (
                    <div className="mt-1 text-[12px] text-red-600 truncate max-w-[52ch]">{q.error}</div>
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
            <span className="rounded-md bg-ink-950 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
              {group.day === 'unscheduled' ? 'Unscheduled' : dayLabel(group.day)}
            </span>
            <span className="h-px flex-1 bg-ink-100" />
            <span className="text-[11px] font-semibold text-ink-400">{group.entries.length}</span>
          </div>
          {group.entries.map((entry, ei) =>
            item({ ...entry, lastInGroup: ei === group.entries.length - 1 }),
          )}
        </div>
      ))}
    </div>
  )
}