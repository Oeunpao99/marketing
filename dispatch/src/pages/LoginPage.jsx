import { useState } from 'react'
import { useAuth } from '../auth'

const PERKS = [
  ['◆', 'One video, every channel', 'Facebook, TikTok, YouTube and Telegram from a single compose screen.'],
  ['◈', 'Written overnight', 'The portal drafts scripts and captions and leaves them for your review.'],
  ['⇄', 'Publishes for real', 'Telegram posts go out on schedule — no copy-paste, no reminders.'],
]

export default function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('signin') // signin | register
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isRegister = mode === 'register'

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isRegister) await register(form.name.trim(), form.email.trim(), form.password, form.company.trim())
      else await login(form.email.trim(), form.password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-ink-50">
      {/* ── brand panel ── */}
      <aside className="hidden lg:flex flex-col justify-between gradient-sidebar text-ink-300 p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-72 h-72 rounded-full bg-brand/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center gradient-brand text-white font-display text-2xl leading-none shadow-glow">
            T
          </div>
          <div>
            <div className="text-white text-[14px] font-bold tracking-tight">Ti P'sa</div>
            <div className="text-[10.5px] text-ink-400">AI Marketing Hub</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-[37px] leading-[1.1] text-white mb-3">
            Your content desk,<br /><em className="italic text-brand-light">on schedule</em>.
          </h2>
          <p className="text-[13px] text-ink-400 leading-relaxed mb-8">
            Plan, review and publish short-form video for every brand and channel from one place.
          </p>
          <ul className="space-y-4">
            {PERKS.map(([icon, title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 w-7 h-7 flex-none grid place-items-center rounded-lg bg-white/10 text-brand-light text-[12px]">
                  {icon}
                </span>
                <div>
                  <div className="text-[12.5px] font-semibold text-ink-100">{title}</div>
                  <div className="text-[11.5px] text-ink-400 leading-snug">{body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[10.5px] text-ink-500">Phnom Penh · UTC+7</div>
      </aside>

      {/* ── form panel ── */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl grid place-items-center gradient-brand text-white font-display text-xl shadow-glow">
              T
            </div>
            <div className="font-bold text-ink-900">Ti P'sa</div>
          </div>

          <h1 className="font-display text-[29.5px] leading-tight text-ink-900">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            {isRegister
              ? 'Your own private workspace — only people you invite can see it.'
              : 'Sign in to the content portal.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <Field label="Name">
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Sokha R."
                  className={inputCls}
                />
              </Field>
            )}
            {isRegister && (
              <Field label="Company or workspace name">
                <input
                  type="text"
                  value={form.company}
                  onChange={set('company')}
                  placeholder="e.g. Sokha Coffee Co."
                  className={inputCls}
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                autoFocus={!isRegister}
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@company.com"
                className={inputCls}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={isRegister ? 8 : undefined}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={set('password')}
                placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
                className={inputCls}
              />
            </Field>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full btn-primary"
            >
              {busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-[12px] text-ink-500">
            {isRegister ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? 'signin' : 'register')
                setError(null)
              }}
              className="text-brand font-semibold hover:underline"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}

const inputCls =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13px] text-ink-800 placeholder:text-ink-300 ' +
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all duration-150'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block font-semibold text-[11.5px] text-ink-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}
