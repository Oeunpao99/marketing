import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useStore } from '../../store'
import Select from '../ui/Select'

// Setup → "Chat link in every post": the brand's chatbot (Telegram bot and/or
// Messenger page). When a post is published, ContentFlow adds a line like
// "👉 Chat with us: t.me/<bot>?start=P123" with that post's own code, so a lead
// from it is linked to the post (backend publishers.chat_link_line).

const FIELD =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'
const DEFAULT_LABEL = '👉 Chat with us:'
const handle = (v) => (v || '').trim().replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/|m\.me\/|facebook\.com\/)/i, '').replace(/^@/, '').replace(/\/+$/, '')

export default function ChatLinkCard({ brandSlug }) {
  const { brands, showToast } = useStore()
  const [brandId, setBrandId] = useState(null)
  const [f, setF] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const b = brands.find((x) => x.slug === brandSlug) || brands[0]
    if (b) setBrandId(b.id)
  }, [brandSlug, brands])

  useEffect(() => {
    if (!brandId) return
    setF(null)
    api
      .get(`/brands/${brandId}`)
      .then((b) => {
        const v = { chat_telegram: b.chat_telegram || '', chat_messenger: b.chat_messenger || '', chat_label: b.chat_label || '' }
        setF(v)
        setSaved(v)
      })
      .catch(() => setF({ chat_telegram: '', chat_messenger: '', chat_label: '' }))
  }, [brandId])

  if (!brands.length || !f) return null
  const tg = handle(f.chat_telegram)
  const fb = handle(f.chat_messenger)
  const label = f.chat_label.trim() || DEFAULT_LABEL
  const dirty = saved && ['chat_telegram', 'chat_messenger', 'chat_label'].some((k) => f[k] !== saved[k])

  const save = async () => {
    setBusy(true)
    try {
      const body = { chat_telegram: tg, chat_messenger: fb, chat_label: f.chat_label.trim() }
      await api.patch(`/brands/${brandId}`, body)
      setF(body)
      setSaved(body)
      showToast('Chat link saved — new posts will include it')
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">Chat link in every post</h2>
          <p className="mt-0.5 max-w-[72ch] text-[12px] leading-relaxed text-ink-500">
            When a post is published, ContentFlow adds a link to your chatbot at the end — with that post’s own code. Anyone who
            taps it and chats becomes a lead that shows which post brought them. Added on Telegram, Facebook and LinkedIn
            (Instagram and TikTok captions can’t open links).
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            saved && (saved.chat_telegram || saved.chat_messenger) ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600'
          }`}
        >
          {saved && (saved.chat_telegram || saved.chat_messenger) ? 'On' : 'Off'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {brands.length > 1 ? (
          <div>
            <span className="label">Brand</span>
            <Select value={brandId} onChange={setBrandId} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
        ) : null}
        <label className="block">
          <span className="label">Telegram bot</span>
          <input className={FIELD} value={f.chat_telegram} onChange={(e) => setF({ ...f, chat_telegram: e.target.value })} placeholder="@YourBot" />
        </label>
        <label className="block">
          <span className="label">Messenger page</span>
          <input className={FIELD} value={f.chat_messenger} onChange={(e) => setF({ ...f, chat_messenger: e.target.value })} placeholder="yourpage (from m.me/yourpage)" />
        </label>
        <label className="block">
          <span className="label">Words before the link</span>
          <input className={FIELD} value={f.chat_label} onChange={(e) => setF({ ...f, chat_label: e.target.value })} placeholder={DEFAULT_LABEL} maxLength={80} />
        </label>
      </div>

      {(tg || fb) && (
        <div className="mt-3 rounded-xl bg-ink-50 px-4 py-3 text-[12px] text-ink-600">
          <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-ink-400">Example — a post with code P123</div>
          {tg && (
            <div className="mt-1">
              Telegram, LinkedIn: <span className="text-ink-900">{label} https://t.me/{tg}?start=P123</span>
            </div>
          )}
          {(fb || tg) && (
            <div className="mt-0.5">
              Facebook:{' '}
              <span className="text-ink-900">
                {label} {fb ? `https://m.me/${fb}?ref=P123` : `https://t.me/${tg}?start=P123`}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
        <button type="button" onClick={save} disabled={busy || !dirty} className="btn-primary">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <span className="text-[11.5px] text-ink-400">Applies to posts published from now on. Leave both empty to turn it off.</span>
      </div>
    </section>
  )
}
