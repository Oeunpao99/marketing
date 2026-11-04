import { useEffect, useRef, useState } from 'react'
import { FiCheckCircle } from 'react-icons/fi'
import { api } from '../api/client'
import { useAuth } from '../auth'
import CodeBoxes from '../components/ui/CodeBoxes'
import { takeResetLink } from '../lib/emailLink'
import { BrandLockup, BrandPanel, Field, inputCls } from './LoginPage'

const WAIT = 60 // seconds before another code can be sent (app/auth/auth.py _RESEND_AFTER)
const STEPS = ['email', 'code', 'password']

/** "Forgot password?" (app/auth/auth.py password-reset), three steps: the email →
 *  the 6-digit code from the inbox (checked on its own) → the new password
 *  typed twice → signed in. The page never says whether an email has an account. */
export default function ForgotPassword({ email: start = '', onBack }) {
  const { signInWith } = useAuth()
  const [link] = useState(() => takeResetLink()) // opened from the email's "Open & use code"
  const [step, setStep] = useState(link ? 'code' : 'email')
  const [email, setEmail] = useState(link?.email || start)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [wait, setWait] = useState(0)
  const boxes = useRef(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const go = (next) => {
    setError('')
    setStep(next)
  }

  const ask = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/password-reset', { email: email.trim() })
      setNote(res.message)
      setCode('')
      go('code')
      setWait(WAIT)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const checkCode = async (value) => {
    if (!value || busy) return
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/password-reset/check', { email: email.trim(), code: value })
      setCode(value)
      go('password')
    } catch (err) {
      setError(err.message)
      boxes.current?.clear()
    } finally {
      setBusy(false)
    }
  }

  // the code came with the link: check it straight away (then the new password)
  useEffect(() => {
    if (link) checkCode(link.code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (e) => {
    e.preventDefault()
    if (password !== again) return setError('The two passwords aren’t the same.')
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/password-reset/confirm', { email: email.trim(), code, password })
      signInWith(res) // signed in with the new password
    } catch (err) {
      setBusy(false)
      if (err.status === 422 && /code/i.test(err.message)) {
        // the code ran out meanwhile — back to step 2 for a new one
        setCode('')
        setStep('code')
      }
      setError(err.message)
    }
  }

  const n = STEPS.indexOf(step) + 1
  const title = { email: 'Forgot your password?', code: 'Enter the code', password: 'Choose a new password' }[step]
  const sub = {
    email: 'Enter the email of your account — we’ll send you a 6-digit code to reset it.',
    code: note || 'Enter the 6-digit code from your email.',
    password: 'Use at least 8 characters — one you don’t use anywhere else.',
  }[step]
  const back = { email: onBack, code: () => go('email'), password: () => (setCode(''), go('code')) }[step]

  return (
    <div className="min-h-screen grid lg:h-dvh lg:overflow-hidden lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <BrandPanel />
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] my-auto">
          <button type="button" onClick={back} className="mb-4 text-[13px] font-medium text-ink-500 hover:text-brand">
            ← {step === 'email' ? 'Back to sign in' : 'Back'}
          </button>
          <BrandLockup />

          {/* step 1 · 2 · 3 */}
          <div className="mb-4 flex items-center justify-center gap-1.5" aria-label={`Step ${n} of 3`}>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${i < n ? 'w-8 bg-brand' : 'w-4 bg-ink-200'}`} />
            ))}
          </div>

          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-400">Step {n} of 3</div>
            <h1 className="mt-1 text-[clamp(20px,3.2vh,24px)] font-bold tracking-tight text-ink-900">{title}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{sub}</p>
          </div>

          {step === 'email' && (
            <form onSubmit={ask} className="mt-6 flex flex-col gap-3">
              <Field label="Email">
                <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
              </Field>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
              <button type="submit" disabled={busy} className="mt-1 w-full btn-primary h-11 text-[13.5px]">
                {busy ? 'Sending…' : 'Send me a code'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault()
                checkCode(code)
              }}
            >
              <CodeBoxes ref={boxes} onChange={setCode} onComplete={checkCode} disabled={busy} initial={link?.code || ''} />
              {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
              <button type="submit" disabled={busy || !code} className="mt-5 w-full btn-primary h-11 text-[13.5px]">
                {busy ? 'Checking…' : 'Continue'}
              </button>
              <p className="mt-4 text-center text-[12.5px] text-ink-500">
                No email? Check spam, or{' '}
                {wait > 0 ? (
                  <span className="text-ink-400">send a new code in {wait}s</span>
                ) : (
                  <button type="button" onClick={ask} className="font-semibold text-brand hover:underline">
                    send a new code
                  </button>
                )}
                .
              </p>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={save} className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-700">
                <FiCheckCircle size={14} className="flex-none" /> Code confirmed for <span className="truncate font-semibold">{email.trim()}</span>
              </div>
              <Field label="New password">
                <input type="password" required autoFocus minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputCls} />
              </Field>
              <Field label="New password again">
                <input type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="The same password" className={inputCls} />
              </Field>
              {again && password !== again && <p className="-mt-1 text-[12px] text-red-600">The two passwords aren’t the same yet.</p>}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
              <button type="submit" disabled={busy || password.length < 8 || password !== again} className="mt-1 w-full btn-primary h-11 text-[13.5px]">
                {busy ? 'Saving…' : 'Save the new password and sign in'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
