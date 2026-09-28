import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCopy, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import { PLAT } from '../../data/brands'
import { isKhmer } from '../../lib/format'
import { phnomPenhClock, phnomPenhDate, phnomPenhDay, phnomPenhToISO } from '../../lib/tz'
import AutoTextarea from '../ui/AutoTextarea'
import PlatformIcon from '../ui/PlatformIcon'
import Select from '../ui/Select'
import StatusBadge from './StatusBadge'

const statusWord = (s) => (s === 'posting' ? 'sending' : s === 'queued' ? 'waiting' : s)

const rowFrom = (t) => ({
  key: `t${t.id}`,
  id: t.id,
  channel: t.channel,
  caption: t.caption || '',
  title: t.title || '',
  date: phnomPenhDay(t.scheduled_for) || phnomPenhDate(0),
  time: t.scheduled_for ? phnomPenhClock(t.scheduled_for) : '19:30',
})

const channelName = (c) => `${c?.platform_name || PLAT[c?.platform_slug]?.name || 'Channel'}${c?.handle ? ` · ${c.handle}` : ''}`

/** Edit a scheduled post before it goes out — each channel's caption and
 * time, add or remove channels, or cancel it (PUT /views/posts/{id}/edit).
 * Channels that already went out (or go out within a minute) stay read-only. */
export default function PostEditor({ postId, onDone, onCancelled, showToast }) {
  const [data, setData] = useState(null)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    api
      .get(`/views/posts/${postId}/edit`)
      .then((d) => {
        setData(d)
        setRows(d.targets.filter((t) => t.editable).map(rowFrom))
      })
      .catch((e) => setError(e.message))
  }, [postId])

  if (!data) {
    return (
      <div className="space-y-3">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>
        ) : (
          <>
            <div className="h-24 rounded-2xl skeleton" />
            <div className="h-24 rounded-2xl skeleton" />
          </>
        )}
      </div>
    )
  }

  const locked = data.targets.filter((t) => !t.editable)
  const used = new Set([...rows.map((r) => r.channel?.id), ...locked.map((t) => t.channel_id)])
  const isVideo = data.media?.kind === 'video'
  const blockedWhy = (c) =>
    c.platform_slug === 'tiktok' && !isVideo
      ? 'only takes videos'
      : c.platform_slug === 'instagram' && !data.media
        ? 'needs an image or video'
        : ''
  const addable = data.channels.filter((c) => !used.has(c.id) && !blockedWhy(c))

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key))
  const add = (channelId) => {
    const c = data.channels.find((x) => x.id === channelId)
    if (!c) return
    const first = rows[0]
    setRows((rs) => [
      ...rs,
      {
        key: `n${channelId}-${Date.now()}`,
        id: null,
        channel: c,
        caption: first?.caption || '',
        title: first?.title || data.title || '',
        date: first?.date || phnomPenhDate(1),
        time: first?.time || '19:30',
      },
    ])
  }
  const copyFirst = () => setRows((rs) => rs.map((r) => ({ ...r, caption: rs[0]?.caption || r.caption })))

  const over = (r) => r.caption.length > (r.channel?.char_limit || Infinity)
  const invalid = rows.some((r) => !r.caption.trim() || over(r) || !r.date || !r.time)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await api.put(`/views/posts/${postId}/edit`, {
        targets: rows.map((r) => ({
          id: r.id,
          channel_id: r.channel.id,
          caption: r.caption,
          title: r.title,
          scheduled_for: phnomPenhToISO(r.date, r.time),
        })),
      })
      if (res.cancelled) {
        showToast('Every channel removed — the post was cancelled')
        onCancelled()
      } else {
        showToast('Changes saved — it goes out with your edits')
        onDone()
      }
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const cancelPost = async () => {
    setSaving(true)
    try {
      await api.del(`/views/posts/${postId}/scheduled`)
      showToast('Scheduled post cancelled')
      onCancelled()
    } catch (e) {
      setError(e.message)
      setSaving(false)
      setConfirmCancel(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold text-ink-900">Edit scheduled post</h2>
        {rows.length > 1 && (
          <button type="button" onClick={copyFirst} className="btn-outline text-[11.5px]">
            <FiCopy size={12} /> Copy first caption to all
          </button>
        )}
      </div>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-[12px] text-ink-500">
          No channels left — add one below, or save to cancel the post.
        </div>
      )}

      {rows.map((r) => (
        <div key={r.key} className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <header className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
            <PlatformIcon name={PLAT[r.channel?.platform_slug]?.name} className="text-ink-500" />
            <span className="flex-1 truncate text-[12.5px] font-semibold text-ink-900">{channelName(r.channel)}</span>
            {!r.id && <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">New</span>}
            <button
              type="button"
              onClick={() => remove(r.key)}
              title="Don't post to this channel"
              aria-label="Remove channel"
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
            >
              <FiX size={15} />
            </button>
          </header>
          <div className="space-y-3 p-4">
            <div>
              <AutoTextarea
                value={r.caption}
                onChange={(e) => update(r.key, { caption: e.target.value })}
                minRows={4}
                maxRows={14}
                placeholder="Write the caption…"
                className={`w-full rounded-xl border bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand/15 ${
                  over(r) ? 'border-red-300 focus:border-red-400' : 'border-ink-200 focus:border-brand'
                } ${isKhmer(r.caption) ? 'font-khmer' : ''}`}
              />
              <div className={`mt-1 text-right font-mono text-[10.5px] ${over(r) ? 'text-red-600' : 'text-ink-400'}`}>
                {r.caption.length.toLocaleString()} / {(r.channel?.char_limit || 0).toLocaleString()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink-600">Date</span>
                <input
                  type="date"
                  value={r.date}
                  min={phnomPenhDate(0)}
                  onChange={(e) => update(r.key, { date: e.target.value })}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink-600">Time (Phnom Penh)</span>
                <input type="time" value={r.time} onChange={(e) => update(r.key, { time: e.target.value })} className="input" />
              </label>
            </div>
          </div>
        </div>
      ))}

      {addable.length > 0 && (
        <div className="flex items-center gap-2">
          <FiPlus size={14} className="flex-none text-brand" />
          <Select
            size="sm"
            className="min-w-[220px]"
            value=""
            placeholder="Add another channel…"
            onChange={add}
            options={addable.map((c) => ({ value: c.id, label: channelName(c) }))}
          />
        </div>
      )}

      {locked.length > 0 && (
        <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink-600">Can’t be changed</div>
          <ul className="space-y-1.5">
            {locked.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12px] text-ink-700">
                <PlatformIcon name={PLAT[t.channel?.platform_slug]?.name} className="text-ink-400" />
                <span className="flex-1 truncate">{channelName(t.channel)}</span>
                {t.status === 'queued' ? (
                  <span className="text-[11px] text-ink-500">going out within a minute</span>
                ) : (
                  <StatusBadge status={statusWord(t.status)} compact />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving || invalid} className="btn-primary">
          <FiSave size={13} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onDone} disabled={saving} className="btn-outline">
          Discard
        </button>
        {data.targets.some((t) => t.editable) && (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-50"
          >
            <FiTrash2 size={13} /> Cancel post
          </button>
        )}
      </div>

      {confirmCancel &&
        createPortal(
          <div className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-4 animate-fadein" onClick={() => setConfirmCancel(false)}>
            <div className="w-full max-w-sm rounded-3xl glass-panel p-5" onClick={(e) => e.stopPropagation()}>
              <div className="text-[14px] font-bold text-ink-800">Cancel this scheduled post?</div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
                It won’t go out to {data.targets.filter((t) => t.editable).length} channel
                {data.targets.filter((t) => t.editable).length === 1 ? '' : 's'}.
                {locked.length > 0 && ' Channels that already went out are kept.'} The image or video stays in your Library.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmCancel(false)} className="btn-ghost px-3.5 py-1.5">
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={cancelPost}
                  disabled={saving}
                  className="rounded-xl bg-red-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Cancel post
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
