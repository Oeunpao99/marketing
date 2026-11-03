import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { BrandLockup, BrandPanel } from './LoginPage'

const LEN = 6
const WAIT = 60 // seconds before a new code can be sent (app/auth.py _RESEND_AFTER)

/** A new account confirms its email: the 6-digit code we emailed (app/auth.py
 *  verify-email). Six boxes — typing or pasting fills them and sends the code by
 *  itself; "Send a new code" once a minute. Then the app opens (and the
 *  welcome email goes out). */
export default function VerifyEmailPage() {
  const { user, verifyEmail, resendCode, logout } = useAuth()
  const [digits, setDigits] = useState(Array(LEN).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [wait, setWait] = useState(WAIT)
  const boxes = useRef([])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  useEffect(() => boxes.current[0]?.focus(), [])

  const submit = async (code) => {
    if (code.length !== LEN || busy) return
    setBusy(true)
    setError('')
    try {
      await verifyEmail(code) // the user is confirmed: App opens the portal
    } catch (err) {
      setError(err.message)
      setDigits(Array(LEN).fill(''))
      boxes.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  const fill = (from, text) => {
    const clean = text.replace(/\D/g, '')
    if (!clean) return
    const next = [...digits]
    for (let i = 0; i < clean.length && from + i < LEN; i++) next[from + i] = clean[i]
    setDigits(next)
    const at = Math.min(LEN - 1, from + clean.length)
    boxes.current[at]?.focus()
    if (next.every(Boolean)) submit(next.join(''))
  }

  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      boxes.current[i - 1]?.focus()
      e.preventDefault()
    }
  }

  const resend = async () => {
    setError('')
    setNote('')
    try {
      await resendCode()
      setNote(`A new code is on its way to ${user.email}.`)
      setWait(WAIT)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen grid lg:h-dvh lg:overflow-hidden lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <BrandPanel />
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] my-auto">
          <BrandLockup />
          <div className="text-center">
            <h1 className="text-[clamp(20px,3.2vh,24px)] font-bold tracking-tight text-ink-900">Check your email</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
              We sent a 6-digit code to <span className="font-semibold text-ink-800">{user.email}</span>. Enter it to finish making your account.
            </p>
          </div>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              submit(digits.join(''))
            }}
          >
            <div className="flex justify-center gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (boxes.current[i] = el)}
                  value={d}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Digit ${i + 1}`}
                  maxLength={LEN}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '')
                    if (!v) {
                      const next = [...digits]
                      next[i] = ''
                      setDigits(next)
                      return
                    }
                    // a phone's code autofill puts the whole code in one box; typing over a digit keeps the new one
                    fill(i, v.length > 2 ? v : v.slice(-1))
                  }}
                  onPaste={(e) => {
                    e.preventDefault()
                    fill(i, e.clipboardData.getData('text'))
                  }}
                  onKeyDown={(e) => onKey(i, e)}
                  className="h-12 w-11 rounded-xl border border-ink-200 bg-white text-center text-[20px] font-bold text-ink-900 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                />
              ))}
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
            {note && !error && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-700">{note}</div>}

            <button type="submit" disabled={busy || digits.some((x) => !x)} className="mt-5 w-full btn-primary h-11 text-[13.5px]">
              {busy ? 'Checking…' : 'Confirm email'}
            </button>
          </form>

          <p className="mt-5 text-center text-[12.5px] text-ink-500">
            Didn’t get it? Check your spam folder, or{' '}
            {wait > 0 ? (
              <span className="text-ink-400">send a new code in {wait}s</span>
            ) : (
              <button type="button" onClick={resend} className="font-semibold text-brand hover:underline">
                send a new code
              </button>
            )}
            .
          </p>
          <p className="mt-2 text-center text-[12.5px] text-ink-500">
            Wrong email?{' '}
            <button type="button" onClick={logout} className="font-semibold text-brand hover:underline">
              Sign out and start again
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
