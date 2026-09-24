import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { PLAT } from '../../data/brands'
import { phnomPenhDate } from '../../lib/tz'

const PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: 'Public — everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends — mutual follows only',
  FOLLOWER_OF_CREATOR: 'Followers only',
  SELF_ONLY: 'Private — only me',
}

/** TikTok Direct Post's required privacy/interaction/disclosure picker —
 * only rendered for a channel whose token actually carries video.publish
 * (app/views.py's `tiktok_direct_post` flag). Fetches the account's allowed
 * options once, then reports the chosen settings up via onChange. */
function TikTokDirectPostOptions({ channelId, value, onChange }) {
  const [info, setInfo] = useState(null) // creator_info response
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get(`/views/channels/${channelId}/tiktok/creator-info`)
      .then((data) => {
        setInfo(data)
        if (!value) {
          onChange({
            privacy_level: (data.privacy_level_options || ['SELF_ONLY'])[0],
            disable_duet: !!data.duet_disabled,
            disable_comment: !!data.comment_disabled,
            disable_stitch: !!data.stitch_disabled,
            brand_content_toggle: false,
            brand_organic_toggle: false,
          })
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  const set = (patch) => onChange({ ...value, ...patch })

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[11.5px] text-red-700">
        Could not load this account's posting options — {error}
      </div>
    )
  }
  if (!info || !value) {
    return <div className="text-[11.5px] text-ink-400">Loading TikTok posting options…</div>
  }

  const privacyOptions = info.privacy_level_options?.length ? info.privacy_level_options : ['SELF_ONLY']

  return (
    <div className="bg-ink-50/60 border border-ink-200 rounded-xl p-3.5 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-500">
        TikTok — publishes for real (Direct Post)
      </div>

      <Field label="Who can see it">
        <div className="flex flex-wrap gap-1.5">
          {privacyOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set({ privacy_level: opt })}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                value.privacy_level === opt
                  ? 'border-brand bg-brand/5 text-ink-900'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {PRIVACY_LABELS[opt] || opt}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Interactions">
        <div className="flex flex-wrap gap-3">
          <Checkbox
            checked={!value.disable_comment}
            onChange={(v) => set({ disable_comment: !v })}
            label="Allow comments"
          />
          <Checkbox
            checked={!value.disable_duet}
            onChange={(v) => set({ disable_duet: !v })}
            label="Allow Duet"
          />
          <Checkbox
            checked={!value.disable_stitch}
            onChange={(v) => set({ disable_stitch: !v })}
            label="Allow Stitch"
          />
        </div>
      </Field>

      <Field label="Content disclosure" hint="Only turn these on if they're actually true for this post.">
        <div className="flex flex-wrap gap-3">
          <Checkbox
            checked={value.brand_organic_toggle}
            onChange={(v) => set({ brand_organic_toggle: v })}
            label="Promotes my own business"
          />
          <Checkbox
            checked={value.brand_content_toggle}
            onChange={(v) => set({ brand_content_toggle: v })}
            label="Paid partnership"
          />
        </div>
      </Field>
    </div>
  )
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-ink-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const BRAND_NAMES = { assist: 'AI Smart Assistance', chum: 'Chumnouykar', hub: 'AI Hub' }
const brandNameOf = (id) => BRAND_NAMES[id] || id

const TIME_SLOTS = [
  { label: 'Morning', time: '08:00', sub: '8 AM' },
  { label: 'Midday', time: '12:00', sub: '12 PM' },
  { label: 'Afternoon', time: '15:00', sub: '3 PM' },
  { label: 'Evening', time: '19:00', sub: '7 PM' },
  { label: 'Prime', time: '20:30', sub: '8:30 PM' },
  { label: 'Night', time: '21:30', sub: '9:30 PM' },
]

function getDateLabel(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((target - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === 2) return 'In 2 days'
  if (diff > 2 && diff <= 7) return `In ${diff} days`
  return dateStr
}

function formatTime12h(time24) {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function SchedulePicker({ date, time, onUpdate }) {
  const [showCustomTime, setShowCustomTime] = useState(false)
  const today = phnomPenhDate(0)
  const tomorrow = phnomPenhDate(1)

  const quickDates = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: tomorrow },
  ]

  const isQuickSlot = TIME_SLOTS.some((s) => s.time === time)

  return (
    <div className="bg-brand/[0.03] border border-brand/10 rounded-2xl p-3.5 space-y-3">
      {/* Date row */}
      <div>
        <span className="block font-semibold text-[11px] text-ink-700 mb-1.5">When to post</span>
        <div className="flex items-center gap-2 flex-wrap">
          {quickDates.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => onUpdate('date', d.value)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all duration-150 border ${
                date === d.value
                  ? 'gradient-brand text-white border-brand'
                  : 'bg-white text-ink-600 border-ink-200 hover:border-brand/30 hover:text-ink-800'
              }`}
            >
              {d.label}
            </button>
          ))}
          <div className="relative">
            <input
              type="date"
              value={date}
              min={today}
              className="bg-white border border-ink-200 rounded-xl px-3 py-1.5 text-[12px] text-ink-700 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              onChange={(e) => onUpdate('date', e.target.value)}
            />
          </div>
          <span className="text-[11px] text-ink-400 ml-1">{getDateLabel(date)}</span>
        </div>
      </div>

      {/* Time slots */}
      <div>
        <span className="block font-semibold text-[11px] text-ink-700 mb-1.5">Post at</span>
        <div className="flex gap-1.5 flex-wrap">
          {TIME_SLOTS.map((s) => (
            <button
              key={s.time}
              type="button"
              onClick={() => {
                onUpdate('time', s.time)
                setShowCustomTime(false)
              }}
              className={`group relative px-3 py-2 rounded-xl text-center transition-all duration-150 border min-w-[64px] ${
                time === s.time && !showCustomTime
                  ? 'gradient-brand text-white border-brand shadow-glow'
                  : 'bg-white text-ink-600 border-ink-200 hover:border-brand/30 hover:text-ink-800'
              }`}
            >
              <div className="text-[12px] font-semibold leading-tight">{s.sub}</div>
              <div className={`text-[10px] mt-0.5 ${time === s.time && !showCustomTime ? 'text-ink-700' : 'text-ink-400'}`}>
                {s.label}
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustomTime((v) => !v)}
            className={`px-3 py-2 rounded-xl text-center transition-all duration-150 border min-w-[64px] ${
              showCustomTime
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-ink-500 border-ink-200 border-dashed hover:border-ink-300 hover:text-ink-700'
            }`}
          >
            <div className="text-[12px] font-medium leading-tight">+</div>
            <div className="text-[10px] mt-0.5">Custom</div>
          </button>
        </div>
      </div>

      {/* Custom time input (expandable) */}
      {showCustomTime && (
        <div className="flex items-center gap-3 animate-fadein">
          <input
            type="time"
            value={time}
            className="bg-white border border-ink-200 rounded-xl px-3 py-2 text-[13px] font-mono text-ink-800 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            onChange={(e) => onUpdate('time', e.target.value)}
          />
          <span className="text-[12px] text-ink-500">{formatTime12h(time)}</span>
        </div>
      )}

      {/* Preview line */}
      <div className="flex items-center gap-2 pt-1 border-t border-brand/10">
        <span className="w-1.5 h-1.5 rounded-full bg-brand flex-none" />
        <span className="text-[11.5px] text-ink-500">
          {getDateLabel(date)} at <span className="font-semibold text-ink-700">{formatTime12h(time)}</span>
          <span className="text-ink-400"> · Phnom Penh (UTC+7)</span>
        </span>
      </div>
    </div>
  )
}

export default function CaptionComps({ comps, selectedChannels, onUpdate }) {
  const ids = selectedChannels.map((c) => c.id)

  const copyAll = () => {
    if (!ids.length) return
    const first = comps[ids[0]]?.cap
    if (!first?.trim()) {
      onUpdate({ copyToast: 'Write the first caption before copying it' })
      return
    }
    const next = { ...comps }
    ids.forEach((i) => {
      next[i] = { ...next[i], cap: first }
    })
    onUpdate({ comps: next, copyToast: 'Copied — now edit each one so they\'re not identical' })
  }

  const stagger = () => {
    if (ids.length < 2) {
      onUpdate({ copyToast: 'Pick at least two channels first' })
      return
    }
    const base = comps[ids[0]].time.split(':').map(Number)
    let m = base[0] * 60 + base[1]
    const next = { ...comps }
    ids.forEach((i, idx) => {
      const v = m + idx * 20
      const t = `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
      next[i] = { ...next[i], time: t }
    })
    onUpdate({ comps: next, copyToast: 'Times spread 20 minutes apart' })
  }

  if (!ids.length) return null

  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[10px] font-bold tracking-[.08em] uppercase text-ink-400">Caption and time</h2>
      <div className="flex gap-2 flex-wrap mb-3">
        <button
          type="button"
          onClick={copyAll}
          className="px-3 py-1.5 rounded-xl btn-ghost text-ink-600"
        >
          Copy first caption to all
        </button>
        <button
          type="button"
          onClick={stagger}
          className="px-3 py-1.5 rounded-xl btn-ghost text-ink-600"
        >
          Stagger 20 min apart
        </button>
      </div>

      <div className="space-y-3">
        {ids.map((id) => {
          const c = selectedChannels.find((x) => x.id === id)
          if (!c) return null
          const P = PLAT[c.p]
          const color = '#1A6FC4'
          const d = comps[id]
          return (
            <div key={id} className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150">
              <header className="px-4 py-3 border-b border-ink-100 flex items-center gap-3 flex-wrap" style={{ background: `${color}05` }}>
                <span className="w-[3px] h-[22px] rounded-full flex-none" style={{ background: color }} />
                <span className="text-[12.5px] font-bold text-ink-800">{P.name}</span>
                <span className="text-[11.5px] text-ink-500">{c.h}</span>
                <span className="ml-auto text-[11px] text-ink-400">{P.as}</span>
              </header>
              <div className="p-4 space-y-3">
                {P.title && (
                  <Field label="Title" hint="Shown above the video. Under 100 characters.">
                    <input
                      type="text"
                      maxLength={100}
                      value={d.ttl}
                      placeholder="Three free AI tools for students"
                      className="input"
                      onChange={(e) => onUpdate({ updateField: { id, field: 'ttl', value: e.target.value } })}
                    />
                  </Field>
                )}
                <Field
                  label="Caption"
                  hint="Write something different for each channel. Identical posts across pages get flagged as spam."
                >
                  <textarea
                    value={d.cap}
                    placeholder="Write the caption…"
                    className="input min-h-[84px] rounded-lg leading-relaxed resize-y"
                    onChange={(e) => onUpdate({ updateField: { id, field: 'cap', value: e.target.value } })}
                  />
                  <div className={`text-right mt-1 font-mono text-[10.5px] ${d.cap.length > P.limit ? 'text-red-600 font-semibold' : 'text-ink-400'}`}>
                    {d.cap.length.toLocaleString()} / {P.limit.toLocaleString()}
                  </div>
                </Field>
                <SchedulePicker date={d.date} time={d.time} onUpdate={(field, value) => onUpdate({ updateField: { id, field, value } })} />
                {c.p === 'tiktok' && c.tiktokDirectPost && (
                  <TikTokDirectPostOptions
                    channelId={id}
                    value={d.tiktokOptions}
                    onChange={(value) => onUpdate({ updateField: { id, field: 'tiktokOptions', value } })}
                  />
                )}
                {c.s === 'soon' && (
                  <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-3 py-2 text-[11.5px]">
                    This channel's token expires in 2 days. Reconnect it or this post will fail.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-0">
      <span className="block font-semibold text-[11.5px] text-ink-800 mb-1">{label}</span>
      {hint && <span className="block text-[11px] text-ink-400 mb-1.5 leading-snug">{hint}</span>}
      {children}
    </div>
  )
}
