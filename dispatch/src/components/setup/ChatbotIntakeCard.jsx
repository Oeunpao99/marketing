import { useCallback, useEffect, useState } from 'react'
import { FiCopy } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'

// Setup → "Chatbots → leads": the secret key a chatbot uses to send leads in
// (POST /api/intake/leads, app/leads.py), whether one has arrived lately, and
// what the chatbot team needs. The key is shown once, when it is made.

const apiBase = window.location.port === '5173' ? 'http://localhost:8000' : window.location.origin

function ago(iso) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} days ago`
}

export default function ChatbotIntakeCard({ canManage }) {
  const { showToast } = useStore()
  const [info, setInfo] = useState(null)
  const [newKey, setNewKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)

  const load = useCallback(() => api.get('/leads/intake-key').then(setInfo).catch(() => setInfo(null)), [])
  useEffect(() => {
    load()
  }, [load])

  const copy = (text, what) => {
    try {
      navigator.clipboard.writeText(text)
      showToast(`${what} copied`)
    } catch {
      showToast('Could not copy — select it and copy by hand')
    }
  }

  const makeKey = async () => {
    setBusy(true)
    try {
      const r = await api.post('/leads/intake-key')
      setNewKey(r.key)
      await load()
    } catch (e) {
      showToast(`Could not make a key — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await api.del('/leads/intake-key')
      setNewKey('')
      setConfirmOff(false)
      await load()
      showToast('Chatbot intake turned off')
    } catch (e) {
      showToast(`Could not turn it off — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!info) return null
  const url = `${apiBase}${info.path}`
  const live = info.configured && info.last_lead_at

  return (
    <section className="mb-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">Chatbots → leads</h2>
          <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
            Your chatbot sends each qualified conversation here. It becomes a lead — scored, routed to a rep, and linked to the
            post that started it when the chat came from a post’s link.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            live ? 'bg-emerald-50 text-emerald-700' : info.configured ? 'bg-amber-50 text-amber-800' : 'bg-ink-100 text-ink-600'
          }`}
        >
          {live ? 'Connected' : info.configured ? 'Waiting for the first lead' : 'Not connected'}
        </span>
      </div>

      {info.configured && (
        <p className="mt-3 text-[12px] text-ink-600">
          Key ending <b className="font-mono">…{info.hint}</b> · last lead {ago(info.last_lead_at)} · {info.leads_30d} chatbot lead
          {info.leads_30d === 1 ? '' : 's'} in 30 days
        </p>
      )}

      {newKey && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-[12px] font-semibold text-amber-900">Copy this key now — it won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-[12px] text-ink-900 ring-1 ring-amber-200">{newKey}</code>
            <button type="button" onClick={() => copy(newKey, 'Key')} className="btn-outline px-3">
              <FiCopy size={13} /> Copy
            </button>
          </div>
        </div>
      )}

      <dl className="mt-4 grid gap-x-4 gap-y-2.5 text-[12px] sm:grid-cols-[150px_minmax(0,1fr)]">
        <dt className="text-ink-500">Send leads to</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <code className="truncate font-mono text-ink-800">POST {url}</code>
          <button type="button" onClick={() => copy(url, 'Address')} className="text-ink-400 hover:text-brand" aria-label="Copy address">
            <FiCopy size={13} />
          </button>
        </dd>
        <dt className="text-ink-500">Header</dt>
        <dd className="font-mono text-ink-800">X-ContentFlow-Key: {info.configured ? `…${info.hint}` : '(make a key)'}</dd>
        {info.brands.length > 1 && (
          <>
            <dt className="text-ink-500">brand_id</dt>
            <dd className="text-ink-800">{info.brands.map((b) => `${b.name} = ${b.id}`).join(' · ')}</dd>
          </>
        )}
        <dt className="text-ink-500">Post codes</dt>
        <dd className="text-ink-600">
          Each post has a code like <b className="font-mono">P123</b> (shown on the post). Put it in the link — <span className="font-mono">t.me/YourBot?start=P123</span>,{' '}
          <span className="font-mono">m.me/YourPage?ref=P123</span> — and the bot sends it back as <span className="font-mono">ref</span>.
        </dd>
      </dl>

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
          <button type="button" onClick={makeKey} disabled={busy} className={info.configured ? 'btn-outline' : 'btn-primary'}>
            {info.configured ? 'Make a new key' : 'Make a key'}
          </button>
          {info.configured &&
            (confirmOff ? (
              <>
                <span className="text-[12px] text-ink-600">The bot will stop sending leads. Sure?</span>
                <button type="button" onClick={turnOff} disabled={busy} className="btn-danger px-3">
                  Turn off
                </button>
                <button type="button" onClick={() => setConfirmOff(false)} className="btn-ghost px-3">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmOff(true)} className="btn-ghost px-3 text-ink-600">
                Turn off
              </button>
            ))}
          {info.configured && <span className="text-[11px] text-ink-400">A new key replaces the old one at once — update the bot right after.</span>}
        </div>
      ) : (
        <p className="mt-4 border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">Only an owner or admin can make or change the key.</p>
      )}
    </section>
  )
}
