import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiExternalLink, FiKey, FiLock, FiPlay, FiX } from 'react-icons/fi'
import { api } from '../../api/client'

// Content studio → Voice: the workspace's own Gemini API key (optional). The
// Khmer voice is read with ours first; when ours is used up, with this one;
// then by Azure (Sreymom / Piseth). Lines read with it aren't charged to the
// workspace's credit — Google bills the key (backend app/gemini_keys.py).
// A slim row here; the form opens in a right drawer, like every form.
export default function GeminiKeyCard({ showToast }) {
  const [state, setState] = useState(null) // { configured, hint }
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.get('/ai/voice/gemini-key').then(setState).catch(() => setState({ configured: false, hint: '' }))
  }, [])

  return (
    <>
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200/70 bg-white px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
          <FiKey size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink-900">
            Your own Gemini key <span className="font-normal text-ink-400">· optional</span>
          </div>
          <div className="mt-0.5 text-[12px] text-ink-500">
            {state === null ? (
              'Checking…'
            ) : state.configured ? (
              <span className="inline-flex items-center gap-1.5">
                <FiCheck size={12} className="text-emerald-600" /> Saved · <span className="font-mono">••••{state.hint}</span> — reads Khmer when ours is busy
              </span>
            ) : (
              'Keep the Gemini Khmer voice when ours is busy for the day'
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-none rounded-lg border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:border-brand hover:text-brand"
        >
          {state?.configured ? 'Manage' : 'Set up'}
        </button>
      </section>
      {open && <KeyDrawer state={state} setState={setState} onClose={() => setOpen(false)} showToast={showToast} />}
    </>
  )
}

function KeyDrawer({ state, setState, onClose, showToast }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [test, setTest] = useState(null) // null | 'reading' | 'ok' | error text

  // one short Khmer line read with THEIR key only — they hear it works now
  const runTest = async () => {
    setTest('reading')
    try {
      const blob = await api.blob('/ai/voice/gemini-key/test', {})
      const audio = new Audio(URL.createObjectURL(blob))
      audio.play().catch(() => {})
      setTest('ok')
    } catch (err) {
      setTest(err.message || 'Your key couldn’t read the test line just now.')
    }
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (e) => {
    e?.preventDefault()
    if (key.trim().length < 20 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.put('/ai/voice/gemini-key', { key: key.trim() })
      setState(res)
      setKey('')
      showToast?.(res.checked === false ? 'Your Gemini key is saved — Google couldn’t be asked from here to confirm it' : 'Your Gemini key is saved')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      setState(await api.del('/ai/voice/gemini-key'))
      showToast?.('Your Gemini key is removed')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ORDER = [
    ['Our Gemini voice', 'reads every Khmer line first'],
    ['Your Gemini key', 'when ours is busy or used up for the day'],
    ['Sreymom / Piseth', 'if neither Gemini key can read it'],
  ]
  const STEPS = [
    <>
      Open{' '}
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
        Google AI Studio <FiExternalLink size={11} />
      </a>{' '}
      and sign in
    </>,
    <>
      Click <b>Create API key</b>, then the copy button beside it
    </>,
    <>
      Paste it below — it starts with <span className="font-mono">AQ.</span> or <span className="font-mono">AIza</span>
    </>,
  ]

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button type="button" aria-label="Close" className="absolute inset-0 glass-overlay animate-fadein cursor-default" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="gemini-key-title" className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col glass-drawer animate-drawer-in">
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 pb-4 pt-6">
          <div>
            <h2 id="gemini-key-title" className="text-[17.5px] font-bold tracking-tight text-ink-900">
              Your own Gemini key
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">Keep the natural Gemini Khmer voice even when ours is busy for the day.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Close">
            <FiX size={18} />
          </button>
        </header>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* who reads the Khmer voice, in order */}
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-400">Who reads the Khmer voice</div>
              <ol className="space-y-2">
                {ORDER.map(([who, when], i) => (
                  <li key={who} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${i === 1 ? 'border-brand/40 bg-brand-soft' : 'border-ink-200/70'}`}>
                    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold ${i === 1 ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600'}`}>{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold text-ink-900">{who}</span>
                      <span className="block text-[11.5px] text-ink-500">{when}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* the key */}
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-400">{state?.configured ? 'Your key' : 'Add your key'}</div>
              {state?.configured && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-ink-200/70 px-3 py-2.5">
                  <FiCheck size={14} className="flex-none text-emerald-600" />
                  <span className="font-mono text-[12.5px] text-ink-800">••••••••{state.hint}</span>
                  <span className="text-[11.5px] text-ink-500">· checked with Google</span>
                  <button type="button" onClick={remove} disabled={busy} className="ml-auto text-[12px] font-semibold text-ink-500 hover:text-red-600 disabled:opacity-50">
                    Remove
                  </button>
                </div>
              )}
              {state?.configured && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={runTest}
                    disabled={test === 'reading'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 px-3 py-1.5 text-[12.5px] font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
                  >
                    <FiPlay size={13} /> {test === 'reading' ? 'Reading with your key…' : 'Test my key'}
                  </button>
                  {test === 'ok' && <p className="mt-2 text-[12px] leading-snug text-emerald-700">✓ Your key works — that was Kore, read with your own key.</p>}
                  {test && test !== 'ok' && test !== 'reading' && <p className="mt-2 text-[12px] leading-snug text-red-600">{test}</p>}
                  <p className="mt-1.5 text-[11px] text-ink-400">Reads one short Khmer line with your key only — uses one of its requests.</p>
                </div>
              )}
              <ol className="mb-3 space-y-1.5">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-700">
                    <span className="flex-none font-semibold text-ink-400">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  setError('')
                }}
                placeholder={state?.configured ? 'Paste a new key to replace it' : 'Paste your key — AQ.… or AIza…'}
                aria-label="Your Gemini API key"
                className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 font-mono text-[13px] text-ink-900 placeholder:font-sans placeholder:text-ink-400 focus:border-brand focus:outline-none"
              />
              {error && <p className="mt-2 text-[12px] leading-snug text-red-600">{error}</p>}
            </div>

            {/* billing and safety */}
            <div className="space-y-2 rounded-xl bg-ink-50 px-3.5 py-3 text-[12px] leading-relaxed text-ink-600">
              <p>
                <b className="text-ink-800">Your credit:</b> lines read with your key aren't taken from your credit — Google bills your key. Its free tier reads about 100
                lines a day; turn on billing in AI Studio for more.
              </p>
              <p className="flex gap-1.5">
                <FiLock size={12} className="mt-[3px] flex-none text-ink-400" />
                <span>Kept encrypted, never shown again — only its last 4 characters. Workspace owners and admins can change it.</span>
              </p>
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-ink-100 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-ink-600 hover:bg-ink-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || key.trim().length < 20}
              className="rounded-xl bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Checking with Google…' : state?.configured ? 'Replace key' : 'Save key'}
            </button>
          </footer>
        </form>
      </aside>
    </div>,
    document.body,
  )
}
