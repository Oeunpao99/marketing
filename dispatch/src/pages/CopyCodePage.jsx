import { useEffect, useState } from 'react'
import { FiCheck, FiCopy } from 'react-icons/fi'

// /copy-code#123456 — where the "Copy code" button in our code emails goes
// (backend app/mailer.py). An email can't run code, so the button opens this
// page, which copies the code as it opens; where the browser wants a tap
// first, tapping the code copies it. The code rides after "#", so it never
// reaches the server (or its logs); it's taken off the address bar at once.

const readCode = () => {
  try {
    const c = decodeURIComponent(window.location.hash.slice(1)).replace(/\D/g, '').slice(0, 6)
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    return c.length === 6 ? c : ''
  } catch {
    return ''
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // older browsers / no permission without a tap: the classic way
    try {
      const t = document.createElement('textarea')
      t.value = text
      t.setAttribute('readonly', '')
      t.style.position = 'fixed'
      t.style.opacity = '0'
      document.body.appendChild(t)
      t.select()
      const ok = document.execCommand('copy')
      t.remove()
      return ok
    } catch {
      return false
    }
  }
}

export default function CopyCodePage() {
  const [code] = useState(readCode)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    document.title = 'Your code · Smart Marketing'
    if (code) copy(code).then(setCopied)
  }, [code])

  const tap = async () => setCopied(await copy(code))

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px] rounded-3xl bg-white p-7 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-ink-200/60">
        <img src="/brand/logo-mark.png" alt="" className="mx-auto h-11 w-11 object-contain" />
        <div className="mt-2 text-[14px] font-bold text-ink-900">Smart Marketing</div>

        {code ? (
          <>
            <h1 className="mt-5 text-[19px] font-bold tracking-tight text-ink-900">{copied ? 'Code copied' : 'Your code'}</h1>
            <p className="mt-1 text-[13px] text-ink-500">
              {copied ? 'Go back and paste it where Smart Marketing asks for it.' : 'Tap the code to copy it.'}
            </p>
            <button type="button" onClick={tap} className="mx-auto mt-5 flex justify-center gap-2 rounded-2xl bg-canvas p-4" aria-label={`Copy the code ${code.split('').join(' ')}`}>
              {code.split('').map((d, i) => (
                <span
                  key={i}
                  className="grid h-[52px] w-[42px] place-items-center rounded-lg bg-white font-mono text-[26px] font-bold text-ink-900 ring-1 ring-ink-200"
                >
                  {d}
                </span>
              ))}
            </button>
            <button
              type="button"
              onClick={tap}
              className={`mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13.5px] font-bold transition-colors ${
                copied ? 'bg-emerald-50 text-emerald-700' : 'bg-brand text-white hover:opacity-90'
              }`}
            >
              {copied ? <FiCheck size={15} /> : <FiCopy size={15} />} {copied ? 'Copied' : 'Copy code'}
            </button>
            <p className="mt-5 text-[12px] text-ink-400">The code works for 15 minutes. Never share it with anyone.</p>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[19px] font-bold tracking-tight text-ink-900">No code here</h1>
            <p className="mt-1 text-[13px] text-ink-500">Open the button in your email again, or type the code from the email.</p>
          </>
        )}
        <a href="/" className="mt-5 inline-block text-[12.5px] font-semibold text-brand hover:underline">
          Open Smart Marketing
        </a>
      </div>
    </div>
  )
}
