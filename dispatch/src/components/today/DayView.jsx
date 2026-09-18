import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BRANDS } from '../../data/brands'
import PlatformIcon from '../ui/PlatformIcon'

const BRAND_NOTES = {
  assist: { color: '#3B82F6', softBg: '#EFF6FF', softText: '#2563EB' },
  chum: { color: '#F59E0B', softBg: '#FFFBEB', softText: '#D97706' },
  hub: { color: '#8B5CF6', softBg: '#F5F3FF', softText: '#7C3AED' },
}
const isKhmer = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s)

function StatusBadge({ status }) {
  if (status === 'posted') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Posted
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Failed
      </span>
    )
  }
  if (status === 'sending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-violet-300 border-t-violet-600" />
        Posting
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-500">
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 3.8V6l1.6 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Queued
    </span>
  )
}

export default function DayView({ queue }) {
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

  const lastIndex = queue.length - 1

  if (!queue.length) {
    return (
      <div className="px-7 py-16 text-center text-[13px] text-ink-400">
        Nothing scheduled. Create a post and it shows up here.
      </div>
    )
  }

  return (
    <ol className="px-5 lg:px-7 pb-4">
      {queue.map((q, i) => {
        const brand = BRANDS.find((b) => b.id === q.b)
        const note = BRAND_NOTES[q.b] || BRAND_NOTES.chum
        const name = brand?.name || q.brandName || q.b
        const key = q.postId ?? q.targetId ?? i
        const sending = q.st === 'sending'
        const failed = q.st === 'failed'
        const posted = q.st === 'posted'
        return (
          <li key={key} className="relative flex gap-4">
            {i !== lastIndex && (
              <span className="absolute left-[22px] top-11 bottom-0 w-px bg-ink-100" />
            )}
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
          </li>
        )
      })}
    </ol>
  )
}