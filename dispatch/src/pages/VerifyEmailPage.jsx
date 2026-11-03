import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import CodeBoxes from '../components/ui/CodeBoxes'
import { takeVerifyCode } from '../lib/emailLink'
import { BrandLockup, BrandPanel } from './LoginPage'

const WAIT = 60 // seconds before a new code can be sent (app/auth.py _RESEND_AFTER)

/** A new account confirms its email: the 6-digit code we emailed (app/auth.py
 *  verify-email). Six boxes — typing or pasting fills them and sends the code by
 *  itself; "Send a new code" once a minute. Then the app opens (and the
 *  welcome email goes out). */
export default function VerifyEmailPage() {
  const { user, verifyEmail, resendCode, logout } = useAuth()
  const [linked] = useState(() => takeVerifyCode()) // opened from the email's "Open & use code"
  const [code, setCode] = useState(linked || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [wait, setWait] = useState(WAIT)
  const boxes = useRef(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const submit = async (value) => {
    if (!value || busy) return
    setBusy(true)
    setError('')
    try {
      await verifyEmail(value) // the user is confirmed: App opens the portal
    } catch (err) {
      setError(err.message)
      boxes.current?.clear()
    } finally {
      setBusy(false)
    }
  }

  // the code came with the link: confirm it straight away
  useEffect(() => {
    if (linked) submit(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              submit(code)
            }}
          >
            <CodeBoxes ref={boxes} onChange={setCode} onComplete={submit} disabled={busy} initial={linked || ''} />

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
            {note && !error && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-700">{note}</div>}

            <button type="submit" disabled={busy || !code} className="mt-5 w-full btn-primary h-11 text-[13.5px]">
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
