import { useEffect, useState } from 'react'
import { FiKey } from 'react-icons/fi'
import { api } from '../../api/client'

// Content studio → Voice: the workspace's own Gemini API key (optional). The
// Khmer voice is read with ours first; when ours is used up, with this one;
// then by Azure (Sreymom / Piseth). Lines read with it aren't charged to the
// workspace's credit — Google bills the key (backend app/gemini_keys.py).
export default function GeminiKeyCard({ showToast }) {
  const [state, setState] = useState(null) // { configured, hint }
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/ai/voice/gemini-key').then(setState).catch(() => setState({ configured: false, hint: '' }))
  }, [])

  const save = async () => {
    if (key.trim().length < 20 || busy) return
    setBusy(true)
    try {
      setState(await api.put('/ai/voice/gemini-key', { key: key.trim() }))
      setKey('')
      showToast?.('Your Gemini key is saved — it reads Khmer when ours is busy')
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      setState(await api.del('/ai/voice/gemini-key'))
      showToast?.('Your Gemini key is removed')
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
          <FiKey size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink-900">Your own Gemini key <span className="font-normal text-ink-400">· optional</span></div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
            The Khmer voice uses our Gemini first. When ours is busy or used up for the day, your key reads instead — then Sreymom / Piseth. Lines read
            with your key aren't taken from your credit; Google bills your key.{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
              Get a key
            </a>
          </p>

          {state === null ? (
            <div className="mt-3 h-9 rounded-lg skeleton" />
          ) : state.configured ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-[12px] text-ink-700">••••••••{state.hint}</span>
              <span className="text-[11.5px] font-semibold text-emerald-600">Saved · checked with Google</span>
              <button type="button" onClick={remove} disabled={busy} className="ml-auto text-[12px] font-semibold text-ink-500 hover:text-red-600 disabled:opacity-50">
                Remove
              </button>
            </div>
          ) : null}

          {state !== null && (
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder={state.configured ? 'Paste a new key to replace it' : 'Paste your Gemini API key'}
                className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={busy || key.trim().length < 20}
                className="flex-none rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? 'Checking…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
