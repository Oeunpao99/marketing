// /join/<token> — someone opened an invite link (Settings → Team → Invite
// with a link). They choose their own name, email and password and land in
// the workspace with the role and access the invite carries (app/auth.py).
import { useEffect, useState } from 'react'
import { FiCheck, FiLock, FiUsers } from 'react-icons/fi'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { BrandLockup, BrandPanel, Field, inputCls } from './LoginPage'

const ROLE_TEXT = {
  admin: 'Admin — manages the workspace and team, and everything else',
  editor: 'Editor — creates, schedules and publishes content',
}

const leave = () => window.history.replaceState(null, '', '/')

export default function JoinPage({ token, onDone }) {
  const { user, acceptInvite, signInWith, logout } = useAuth()
  const [info, setInfo] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    api
      .get(`/auth/join/${token}`)
      .then(setInfo)
      .catch((e) => setError(e.message))
  }, [token])

  const mismatch = form.confirm && form.password !== form.confirm
  const ready = form.name.trim() && form.email.includes('@') && form.password.length >= 8 && form.password === form.confirm

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const res = await acceptInvite(token, form.name.trim(), form.email.trim(), form.password)
      // Leave /join/… and sign in in one go — the app opens on the Dashboard.
      leave()
      onDone()
      signInWith(res)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <BrandPanel />
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <BrandLockup />

          {info === null && !error ? (
            <div className="mt-8 space-y-3">
              <div className="h-6 w-2/3 mx-auto rounded skeleton" />
              <div className="h-24 rounded-2xl skeleton" />
            </div>
          ) : !info ? (
            <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ink-100 text-ink-500">
                <FiLock size={18} />
              </div>
              <h1 className="mt-3 text-[17px] font-bold text-ink-900">This link doesn’t work anymore</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{error}</p>
              <button
                type="button"
                onClick={() => {
                  leave()
                  onDone()
                }}
                className="btn-outline mt-5"
              >
                Go to sign in
              </button>
            </div>
          ) : user ? (
            <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 text-center">
              <h1 className="text-[17px] font-bold text-ink-900">You’re signed in as {user.name}</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                To join <b className="text-ink-800">{info.workspace_name}</b> with a new account, sign out first. Each account
                belongs to one workspace.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    leave()
                    onDone()
                  }}
                  className="btn-outline"
                >
                  Stay signed in
                </button>
                <button type="button" onClick={logout} className="btn-primary">
                  Sign out and join
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-[22px] font-bold tracking-tight text-ink-900">Join {info.workspace_name}</h1>
                <p className="mt-1 text-[13px] text-ink-500">
                  {info.invited_by ? `${info.invited_by} invited you` : 'You’ve been invited'} — set up your login to start.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-brand-line bg-brand-soft/50 px-4 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-800">
                  <FiUsers size={14} className="text-brand" /> {ROLE_TEXT[info.role] || info.role}
                </div>
                {info.access && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {info.access.length ? (
                      info.access.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-700">
                          <FiCheck size={10} className="text-brand" /> {f}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11.5px] text-ink-500">View-only: Dashboard and Calendar</span>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <Field label="Your name">
                  <input type="text" required autoFocus value={form.name} onChange={set('name')} placeholder="Dara S." className={inputCls} />
                </Field>
                <Field label="Email — you’ll sign in with this">
                  <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" className={inputCls} />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="At least 8 characters"
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm password">
                  <input
                    type="password"
                    required
                    value={form.confirm}
                    onChange={set('confirm')}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                  {mismatch && <span className="mt-1 block text-[11.5px] text-red-600">Passwords don’t match</span>}
                </Field>

                {error && <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">{error}</div>}

                <button type="submit" disabled={!ready || busy} className="btn-primary w-full justify-center disabled:opacity-50">
                  {busy ? 'Joining…' : `Join ${info.workspace_name}`}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
