import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import Select from '../ui/Select'
import { api } from '../../api/client'
import { chatText, parseChat } from '../../lib/leads'

// Add or edit a lead — what a chatbot sends later, entered by hand for now.
// Leave the score empty and the server works it out from what is filled in.

const FIELD = 'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  )
}

export default function LeadDialog({ lead, brands, defaultBrandId, saving, onSave, onClose }) {
  const [f, setF] = useState({
    brand_id: lead?.brand_id || defaultBrandId || brands[0]?.id,
    name: lead?.name || '',
    industry: lead?.industry || '',
    source: lead?.source || '',
    contact_name: lead?.contact_name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    need: lead?.need || '',
    volume: lead?.volume || '',
    timeline: lead?.timeline || '',
    summary: lead?.summary || '',
    chat: chatText(lead?.messages),
    score: lead ? String(lead.score) : '',
    post_id: lead?.post_id || 0, // 0 = not from a post
  })
  const [posts, setPosts] = useState([])
  // The brand's recent published posts, for "which post brought them in?".
  useEffect(() => {
    let alive = true
    api
      .get(`/leads/post-options?brand_id=${f.brand_id}`)
      .then((rows) => alive && setPosts(rows))
      .catch(() => alive && setPosts([]))
    return () => {
      alive = false
    }
  }, [f.brand_id])
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    const body = {
      name: f.name,
      industry: f.industry,
      source: f.source,
      contact_name: f.contact_name,
      phone: f.phone,
      email: f.email,
      need: f.need,
      volume: f.volume,
      timeline: f.timeline,
      summary: f.summary,
      post_id: f.post_id || null,
      ...(f.score.trim() !== '' ? { score: Math.max(0, Math.min(100, Number(f.score) || 0)) } : {}),
    }
    if (!lead) Object.assign(body, { brand_id: Number(f.brand_id), messages: parseChat(f.chat) })
    onSave(body)
  }

  return createPortal(
    // A drawer from the right on a plain dim backdrop (no blur), so the list
    // behind stays readable.
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={submit}
        className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 pb-4 pt-6">
          <div>
            <h2 className="text-[16px] font-bold text-ink-900">{lead ? 'Edit lead' : 'Add a lead'}</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Who they are, what they need, and how to reach them.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </header>

        <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {!lead && brands.length > 1 && (
            <div className="sm:col-span-2">
              <Field label="Brand">
                <Select
                  value={f.brand_id}
                  onChange={(v) => setF((x) => ({ ...x, brand_id: v, post_id: 0 }))}
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Field>
            </div>
          )}
          <Field label="Company or person *">
            <input autoFocus required className={FIELD} value={f.name} onChange={set('name')} placeholder="Sokha Mart · 3 branches" />
          </Field>
          <Field label="Industry" hint="Decides which rep gets it — e.g. Retail, Banking, Education">
            <input className={FIELD} value={f.industry} onChange={set('industry')} placeholder="Retail" />
          </Field>
          <Field label="Where it came from">
            <input className={FIELD} value={f.source} onChange={set('source')} placeholder="Telegram bot, Messenger, TikTok comment…" />
          </Field>
          <Field label="Contact name">
            <input className={FIELD} value={f.contact_name} onChange={set('contact_name')} placeholder="Owner" />
          </Field>
          <Field label="Phone">
            <input className={FIELD} value={f.phone} onChange={set('phone')} placeholder="012 345 678" inputMode="tel" />
          </Field>
          <Field label="Email">
            <input className={FIELD} value={f.email} onChange={set('email')} placeholder="name@company.com" type="email" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="What they need">
              <AutoTextarea minRows={2} className={FIELD} value={f.need} onChange={set('need')} placeholder="A bot that checks stock in 3 branches and answers price questions" />
            </Field>
          </div>
          <Field label="Volume">
            <input className={FIELD} value={f.volume} onChange={set('volume')} placeholder="~150 chats / day" />
          </Field>
          <Field label="Timeline">
            <input className={FIELD} value={f.timeline} onChange={set('timeline')} placeholder="Before November" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="One-line summary" hint="Shown in the list. Left empty, it is taken from what they need.">
              <input className={FIELD} value={f.summary} onChange={set('summary')} />
            </Field>
          </div>
          {!lead && (
            <div className="sm:col-span-2">
              <Field label="Chat (optional)" hint="One message per line. Start with Customer: or Bot:, no prefix counts as the customer.">
                <AutoTextarea minRows={3} maxRows={8} className={FIELD} value={f.chat} onChange={set('chat')} placeholder={'Customer: How much for 3 branches?\nBot: Yes — it reads stock per branch. How many chats a day?'} />
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Post that brought them in" hint="Lets Insights show which content sold">
              <Select
                value={f.post_id}
                onChange={(v) => setF((x) => ({ ...x, post_id: v }))}
                options={[
                  { value: 0, label: 'Not from a post / unknown' },
                  ...(lead?.post_id && !posts.some((p) => p.id === lead.post_id)
                    ? [{ value: lead.post_id, label: lead.post_title }]
                    : []),
                  ...posts.map((p) => ({ value: p.id, label: p.title, hint: p.at ? new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined })),
                ]}
              />
            </Field>
          </div>
          <Field label="Score (0–100)" hint="Leave empty to work it out from what is filled in">
            <input className={FIELD} value={f.score} onChange={set('score')} inputMode="numeric" placeholder="auto" />
          </Field>
        </div>

        <footer className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={saving || !f.name.trim()} className="btn-primary">
            {saving ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
