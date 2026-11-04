import { useState } from 'react'
import { useAuth } from '../auth'
import { BrandLockup, BrandPanel, Field, inputCls } from './LoginPage'

/** Once, for an account owner with no phone number yet (signed up with Google,
 *  or before sign-up asked for it): our team calls to help them get started.
 *  Saved with PATCH /auth/me; the team's Telegram hears (app/notify/team_alerts.py). */
export default function AddPhonePage() {
  const { user, updateMe, logout } = useAuth()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await updateMe({ phone: phone.trim() }) // the user now has a phone: App opens the portal
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const first = (user.name || '').trim().split(/\s+/)[0]

  return (
    <div className="min-h-screen grid lg:h-dvh lg:overflow-hidden lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <BrandPanel />
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] my-auto">
          <BrandLockup />
          <div className="text-center">
            <h1 className="text-[clamp(20px,3.2vh,24px)] font-bold tracking-tight text-ink-900">{first ? `One last thing, ${first}` : 'One last thing'}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
              What’s your phone number? Our team will give you a call to help you get started — and you can reach us any time.
            </p>
          </div>
          <form onSubmit={save} className="mt-6 flex flex-col gap-3">
            <Field label="Phone number">
              <input
                type="tel"
                required
                autoFocus
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="012 345 678"
                className={inputCls}
              />
            </Field>
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
            <button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 8} className="mt-1 w-full btn-primary h-11 text-[13.5px]">
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </form>
          <p className="mt-5 text-center text-[12.5px] text-ink-500">
            Not you?{' '}
            <button type="button" onClick={logout} className="font-semibold text-brand hover:underline">
              Sign out
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
