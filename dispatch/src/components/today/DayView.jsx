import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiCalendar, FiClock, FiEye, FiHeart, FiMessageCircle, FiPlay, FiShare2, FiZap } from 'react-icons/fi'
import { colorForBrand } from '../../lib/brandColor'
import { useStore } from '../../store'
import { phnomPenhDate, phnomPenhDay, dayLabel } from '../../lib/tz'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../ui/PlatformIcon'
import StatusBadge from './StatusBadge'

const isKhmer = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s)
const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const mediaSrc = (url) => (!url ? null : /^https?:\/\//i.test(url) ? url : `${mediaBase}${url}`)
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** A post's title, or \u2014 when it's only an uploaded file's name
 *  ("90b433aa-\u2026.jpg") \u2014 the first line of its caption. */
function displayTitle(q) {
  const t = (q.ttl || '').trim()
  if (t && !/\.(jpe?g|png|webp|gif|mp4|mov|webm|m4v)$/i.test(t) && t !== 'Untitled video') return t
  const first = (q.cap || '').split('\n').find((l) => l.trim())
  return first ? first.trim() : t || 'Untitled post'
}

/** The post's image or video (first frame, with a play mark), or the brand
 *  initial for a text-only post. */
function Thumb({ media, name, color }) {
  const src = mediaSrc(media?.url)
  const box = 'relative h-[72px] w-[72px] sm:h-20 sm:w-20 flex-none overflow-hidden rounded-xl bg-ink-100'
  if (!src) {
    return (
      <span className={`${box} grid place-items-center text-[20px] font-bold uppercase`} style={{ background: `${color}1A`, color }} title={name}>
        {name.trim().charAt(0) || '?'}
      </span>
    )
  }
  return (
    <span className={box}>
      {media.kind === 'image' ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          <video src={`${src}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-night-900/60 text-white">
              <FiPlay size={12} className="ml-0.5" />
            </span>
          </span>
        </>
      )}
    </span>
  )
}

const WHEN_VERB = { posted: 'Posted', queued: 'Scheduled for', sending: 'Sending now \u00B7', failed: 'Failed \u00B7' }

/** "Posted Fri 18 Sep \u00B7 18:05" \u2014 the day and time in words, so it reads
 *  without looking up at the day header. */
function When({ q }) {
  const day = phnomPenhDay(q.scheduledFor)
  const Icon = q.st === 'queued' ? FiCalendar : FiClock
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-600">
      <Icon size={12} className="text-ink-400" aria-hidden="true" />
      <span>
        {WHEN_VERB[q.st] || 'Scheduled for'}{' '}
        <b className="font-semibold text-ink-800">
          {day ? dayLabel(day) : 'no date'}
          {q.t && q.t !== '--:--' ? ` \u00B7 ${q.t}` : ''}
        </b>
      </span>
    </span>
  )
}

const engagementOf = (s) => (s ? (s.likes || 0) + (s.comments || 0) + (s.shares || 0) : 0)

/** Views \u00B7 likes \u00B7 comments \u00B7 shares from the latest saved reading, summed
 *  over the post's channels, and their engagement total. */
function Stats({ stats, channels }) {
  if (!stats) {
    const onlyTelegram = channels.length > 0 && channels.every((c) => /telegram/i.test(c))
    return (
      <span className="text-[11px] text-ink-400 sm:ml-auto">
        {onlyTelegram ? 'Telegram doesn\u2019t share per-post stats' : 'Stats appear after the next refresh'}
      </span>
    )
  }
  const items = [
    ['views', FiEye, 'views'],
    ['likes', FiHeart, 'likes'],
    ['comments', FiMessageCircle, 'comments'],
    ['shares', FiShare2, 'shares'],
  ].filter(([k]) => typeof stats[k] === 'number')
  const engagement = engagementOf(stats)
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-600 sm:ml-auto">
      {items.map(([k, Icon, label]) => (
        <span key={k} className="inline-flex items-center gap-1" title={`${stats[k].toLocaleString()} ${label}`}>
          <Icon size={12} className="text-ink-400" aria-hidden="true" />
          <b className="font-semibold tabular-nums text-ink-800">{compact.format(stats[k])}</b>
          <span className="hidden md:inline text-ink-400">{label}</span>
        </span>
      ))}
      <span
        className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand"
        title="Engagement = likes + comments + shares"
      >
        <FiZap size={11} aria-hidden="true" />
        <span className="tabular-nums">{compact.format(engagement)}</span> engagement
      </span>
    </span>
  )
}

export default function DayView({ queue, match = () => true }) {
  const navigate = useNavigate()
  // The post page looks posts up by their place in the store's queue — this
  // list is sorted differently (by date and time), so link by that place,
  // not by the row's position here.
  const { queue: storeQueue } = useStore()
  const openPost = (q) => navigate(`/post/${storeQueue.indexOf(q)}`)
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

  const today = phnomPenhDate()
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
    const title = displayTitle(q)
    const caption = q.cap && q.cap.trim() !== title ? q.cap : ''
    return (
      <div key={key} className="relative">
        {!lastInGroup && <span className="absolute left-[9px] bottom-0 top-9 w-px bg-ink-100" />}
        <div className="relative flex gap-3 sm:gap-4">
          <div className="relative z-10 flex flex-col items-center pt-[22px]">
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

          <div className="min-w-0 flex-1 py-1.5">
            <button
              type="button"
              onClick={() => openPost(q)}
              className={`w-full text-left rounded-2xl border p-2.5 sm:p-3 transition-all duration-150 cursor-pointer hover:-translate-y-0.5 hover:shadow-card ${
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
                <Thumb media={q.media} name={name} color={color} />
                <div className="min-w-0 flex-1">
                  {/* who + where */}
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <span className="text-[12px] font-display text-ink-900 tracking-tight">{name}</span>
                    {q.c.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-ink-700 bg-ink-50 border border-ink-200"
                      >
                        <PlatformIcon name={ch} className={PLAT_BRAND_CLASS[ch] || 'text-ink-400'} />
                        {ch}
                      </span>
                    ))}
                    <span className="ml-auto">
                      <StatusBadge status={q.st} compact />
                    </span>
                  </div>
                  {/* what */}
                  <div
                    className={`mt-1 text-[13px] font-semibold text-ink-900 leading-snug break-words [overflow-wrap:anywhere] line-clamp-1 ${isKhmer(title) ? 'font-khmer' : ''}`}
                    title={title}
                  >
                    {title}
                  </div>
                  {caption && (
                    <div className={`mt-0.5 text-[11.5px] leading-relaxed text-ink-500 line-clamp-2 break-words ${isKhmer(caption) ? 'font-khmer' : ''}`}>
                      {caption}
                    </div>
                  )}
                  {/* when + how it did */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ink-100 pt-2">
                    <When q={q} />
                    {posted && <Stats stats={q.stats} channels={q.c} />}
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
              {group.day === 'unscheduled' ? 'Unscheduled' : group.day === today ? `Today · ${dayLabel(group.day)}` : dayLabel(group.day)}
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