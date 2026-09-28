import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FiRepeat, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import { PLAT } from '../../data/brands'
import { phnomPenhDate, phnomPenhToISO } from '../../lib/tz'
import { useStore } from '../../store'
import AutoTextarea from '../ui/AutoTextarea'
import PlatformIcon from '../ui/PlatformIcon'

const WHEN = [
  { id: 'now', label: 'Now' },
  { id: 'best', label: 'Best time', hint: "Each channel's best-performing hour" },
  { id: 'pick', label: 'Pick a time' },
]

/** Post a published post again — same image/video, caption editable — to
 * the same Page or any other connected channel of the brand
 * (POST /views/post-targets/{id}/repost). */
export default function RepostDialog({ post, onClose }) {
  const { channels, showToast, refreshQueue } = useStore()
  const live = channels.filter((c) => c.b === post.brand_slug && c.s === 'live')
  const hasMedia = !!post.media_url
  const isVideo = post.media_kind === 'video' && !post.media_thumb

  // A channel can't take this post: TikTok needs a video, Instagram needs media.
  const blockedWhy = (c) =>
    c.p === 'tiktok' && !isVideo
      ? 'TikTok only takes videos'
      : c.p === 'instagram' && !hasMedia
        ? 'Instagram needs an image or video'
        : ''

  const [caption, setCaption] = useState(post.caption || post.title || '')
  const [picked, setPicked] = useState(() => live.filter((c) => c.id === post.channel_id && !blockedWhy(c)).map((c) => c.id))
  const [when, setWhen] = useState('best')
  const [date, setDate] = useState(phnomPenhDate(1))
  const [time, setTime] = useState('19:30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id, on) => setPicked((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
  const ready = picked.length > 0 && caption.trim() && (when !== 'pick' || (date && time))

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post(`/views/post-targets/${post.target_id}/repost`, {
        caption: caption.trim(),
        title: post.title || '',
        channel_ids: picked,
        when: when === 'pick' ? phnomPenhToISO(date, time) : when,
      })
      refreshQueue?.()
      if (when === 'now') {
        const ok = (res.published || []).length
        const failed = res.failed || []
        showToast(
          failed.length
            ? `Posted to ${ok} of ${picked.length} — ${failed[0].error || 'one channel failed'}`
            : `Reposted to ${ok} channel${ok === 1 ? '' : 's'}`,
        )
      } else {
        const first = res.targets?.[0]?.scheduled_for
        const at = first
          ? new Date(first).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })
          : ''
        showToast(`Repost scheduled${at ? ` for ${at}` : ''} — it's in your Calendar`)
      }
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-4 animate-fadein" onClick={() => !busy && onClose()}>
      <div
        className="w-full max-w-[520px] max-h-[90dvh] overflow-y-auto rounded-3xl glass-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <FiRepeat size={15} className="text-brand" />
          <div className="text-[14px] font-bold text-ink-900 flex-1">Repost</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <FiX size={18} />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">
          Posts it again with the same {isVideo ? 'video' : hasMedia ? 'image' : 'text'}. Changing the first line a little
          helps it reach people who scrolled past last time.
        </p>

        <div className="mt-4">
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">Caption</div>
          <AutoTextarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            minRows={4}
            maxRows={14}
            maxLength={5000}
            className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[12.5px] text-ink-800 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">Where</div>
          {live.length === 0 ? (
            <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-[12px] text-ink-500">This brand has no connected channels.</div>
          ) : (
            <div className="rounded-xl border border-ink-200 divide-y divide-ink-100">
              {live.map((c) => {
                const why = blockedWhy(c)
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-3 py-2 ${why ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-ink-50'}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-brand"
                      disabled={!!why}
                      checked={picked.includes(c.id)}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                    />
                    <PlatformIcon name={PLAT[c.p]?.name} className="text-ink-500" />
                    <span className="text-[12.5px] text-ink-800">{PLAT[c.p]?.name || c.p}</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-400">{c.h}</span>
                    {why ? (
                      <span className="text-[10.5px] text-ink-400">{why}</span>
                    ) : c.id === post.channel_id ? (
                      <span className="text-[10.5px] text-ink-400">original</span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">When</div>
          <div className="grid grid-cols-3 rounded-xl border border-ink-200 p-0.5">
            {WHEN.map((w) => (
              <button
                key={w.id}
                type="button"
                title={w.hint}
                onClick={() => setWhen(w.id)}
                className={`h-8 rounded-lg text-[12px] font-semibold transition-colors ${
                  when === w.id ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {when === 'pick' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="date" value={date} min={phnomPenhDate(0)} onChange={(e) => setDate(e.target.value)} className="input" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
            </div>
          )}
          {when === 'best' && (
            <p className="mt-1.5 text-[11px] text-ink-400">Goes out at each channel's best-performing hour (Phnom Penh time).</p>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-3.5 py-1.5">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!ready || busy} className="btn-primary">
            {busy ? (when === 'now' ? 'Posting…' : 'Scheduling…') : when === 'now' ? 'Repost now' : 'Schedule repost'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
