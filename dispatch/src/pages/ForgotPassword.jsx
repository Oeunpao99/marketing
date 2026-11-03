import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { BrandLockup, BrandPanel, Field, inputCls } from './LoginPage'

const WAIT = 60 // seconds before another code can be sent (app/auth.py _RESEND_AFTER)

/** "Forgot password?" (app/auth.py password-reset): the email → a 6-digit code
 *  in the inbox → the code + a new password typed twice → signed in. The page
 *  never says whether an email has an account. */
export default function ForgotPassword({ email: start = '', onBack }) {
  const { signInWith } = useAuth()
  const [step, setStep] = useState('email') // email | code
  const [email, setEmail] = useState(start)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const ask = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/password-reset', { email: email.trim() })
      setNote(res.message)
      setStep('code')
      setWait(WAIT)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e) => {
    e.preventDefault()
    if (password !== again) return setError('The two passwords aren’t the same.')
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/password-reset/confirm', { email: email.trim(), code, password })
      signInWith(res) // signed in with the new password
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:h-dvh lg:overflow-hidden lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <BrandPanel />
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] my-auto">
          <button type="button" onClick={onBack} className="mb-4 text-[13px] font-medium text-ink-500 hover:text-brand">
            ← Back to sign in
          </button>
          <BrandLockup />
          <div className="text-center">
            <h1 className="text-[clamp(20px,3.2vh,24px)] font-bold tracking-tight text-ink-900">
              {step === 'email' ? 'Forgot your password?' : 'Choose a new password'}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
              {step === 'email'
                ? 'Enter the email of your account — we’ll send you a 6-digit code to reset it.'
                : note || 'Enter the code from your email and your new password.'}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={ask} className="mt-6 flex flex-col gap-3">
              <Field label="Email">
                <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
              </Field>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
              <button type="submit" disabled={busy} className="mt-1 w-full btn-primary h-11 text-[13.5px]">
                {busy ? 'Sending…' : 'Send me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={confirm} className="mt-6 flex flex-col gap-3">
              <Field label="Code from the email">
                <input
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className={`${inputCls} text-center text-[18px] font-bold tracking-[0.4em]`}
                />
              </Field>
              <Field label="New password">
                <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputCls} />
              </Field>
              <Field label="New password again">
                <input type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="The same password" className={inputCls} />
              </Field>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
              <button type="submit" disabled={busy || code.length !== 6} className="mt-1 w-full btn-primary h-11 text-[13.5px]">
                {busy ? 'Saving…' : 'Save the new password and sign in'}
              </button>
              <p className="text-center text-[12.5px] text-ink-500">
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
        </div>
      </main>
    </div>
  )
}
