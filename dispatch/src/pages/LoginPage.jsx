import { useEffect, useState } from 'react'
import { FaLinkedin } from 'react-icons/fa'
import { FiCalendar, FiTrendingUp } from 'react-icons/fi'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { useAuth } from '../auth'

const PLATFORMS = [
  [SiFacebook, 'Facebook'],
  [SiInstagram, 'Instagram'],
  [SiTiktok, 'TikTok'],
  [SiYoutube, 'YouTube'],
  [FaLinkedin, 'LinkedIn'],
  [SiTelegram, 'Telegram'],
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
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-[#F7F9FC]">
      <BrandPanel />

      {/* ── form panel ── */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          <BrandLockup />

          <div className="text-center">
            <h1 className="text-[24px] font-bold tracking-tight text-ink-900">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="mt-1 text-[13px] text-ink-500">
              {isRegister
                ? 'Your own private workspace — only people you invite can see it.'
                : 'Sign in to continue to your workspace.'}
            </p>
          </div>

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

            <button type="submit" disabled={busy} className="w-full btn-primary h-11 text-[13.5px]">
              {busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-[12.5px] text-ink-500">
            {isRegister ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? 'signin' : 'register')
                setError(null)
              }}
              className="text-brand font-semibold hover:underline"
            >
              {isRegister ? 'Sign in' : 'Create one — it’s free'}
            </button>
          </p>

          <p className="mt-8 text-center text-[11.5px] text-ink-400">
            {isRegister ? 'By creating an account you agree to our ' : ''}
            <a href="/terms" className="hover:text-ink-700 underline-offset-2 hover:underline">
              {isRegister ? 'Terms' : 'Terms of Service'}
            </a>
            {isRegister ? ' and ' : ' · '}
            <a href="/privacy" className="hover:text-ink-700 underline-offset-2 hover:underline">
              Privacy Policy
            </a>
            {isRegister ? '.' : ''}
          </p>
        </div>
      </main>
    </div>
  )
}

// ── left: what ContentFlow is, with a floating product preview ─────────────
function BrandPanel() {
  return (
    <aside className="hidden lg:flex relative overflow-hidden flex-col justify-center px-14 xl:px-20 py-14 bg-[#0A1B38] text-white">
      {/* light + grid */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_10%,rgba(43,132,214,.45),transparent_60%),radial-gradient(50%_45%_at_90%_95%,rgba(92,200,240,.28),transparent_60%)]" />
      <div className="absolute inset-0 opacity-[.06] bg-[linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />

      <div className="relative max-w-[560px]">
        <h2 className="text-[44px] xl:text-[50px] font-bold leading-[1.05] tracking-tight">
          Create, schedule and publish —{' '}
          <span className="bg-gradient-to-r from-[#5CC8F0] to-[#7FA8FF] bg-clip-text text-transparent">on autopilot.</span>
        </h2>
        <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-white/65">
          ContentFlow writes your posts, designs the visuals and publishes them to every channel — all
          grounded in your real products.
        </p>

        <Preview />

        <div className="mt-10 flex items-center gap-4">
          <span className="text-[11.5px] font-medium uppercase tracking-[.14em] text-white/40">Publishes to</span>
          <div className="flex items-center gap-3.5 text-white/55">
            {PLATFORMS.map(([Icon, name]) => (
              <Icon key={name} size={17} title={name} className="hover:text-white transition-colors" />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-7 left-14 xl:left-20 text-[11px] text-white/35">
        © {new Date().getFullYear()} ContentFlow · Proudly a Khmer brand
      </div>
    </aside>
  )
}

function Preview() {
  return (
    <div className="relative mt-10 h-[250px]">
      {/* scheduled post card */}
      <div className="absolute left-0 top-2 -rotate-[4deg]">
      <div className="cf-float w-[270px] rounded-2xl bg-white p-3 text-ink-800 shadow-[0_24px_60px_rgba(0,0,0,.35)]">
        <div className="relative h-[120px] overflow-hidden rounded-xl bg-gradient-to-br from-[#E4EFFA] via-[#CFE3F7] to-[#B7D7F5]">
          <img src="/brand/logo-mark.png" alt="" className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 object-contain opacity-90" />
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="h-2 w-[85%] rounded-full bg-ink-200" />
          <div className="h-2 w-[60%] rounded-full bg-ink-100" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-ink-400">
            <SiFacebook size={12} />
            <SiTiktok size={12} />
            <SiInstagram size={12} />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
            <FiCalendar size={10} /> Scheduled · 7:30 PM
          </span>
        </div>
      </div>
      </div>

      {/* AI advisor bubble */}
      <div
        className="cf-float absolute right-2 top-0 w-[270px] rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,.3)]"
        style={{ animationDelay: '.8s' }}
      >
        <div className="ml-auto w-fit rounded-xl rounded-br-sm bg-white/90 px-3 py-1.5 text-[11.5px] font-medium text-ink-800">
          What should I post next week?
        </div>
        <div className="mt-2.5 flex items-start gap-2">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-white">
            <img src="/brand/logo-mark.png" alt="" className="h-4 w-4 object-contain" />
          </span>
          <p className="text-[11.5px] leading-snug text-white/85">
            Your video posts get the most comments — try a short product demo on TikTok, then reuse it on
            Facebook.
          </p>
        </div>
      </div>

      {/* engagement chip */}
      <div
        className="cf-float absolute bottom-3 right-16 inline-flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-ink-800 shadow-[0_18px_40px_rgba(0,0,0,.3)]"
        style={{ animationDelay: '1.6s' }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
          <FiTrendingUp size={16} />
        </span>
        <span>
          <span className="block text-[10.5px] text-ink-400">Engagement this week</span>
          <span className="block text-[13px] font-bold">Trending up</span>
        </span>
      </div>
    </div>
  )
}

// ── right: animated logo lockup above the form ─────────────────────────────
// The mark pops in and floats, the wordmark types itself in letter by letter,
// and the tagline cycles through what the product does (index.css "cf-*").
const DOES = ['written', 'designed', 'scheduled', 'published']

function BrandLockup() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DOES.length), 2200)
    return () => clearInterval(t)
  }, [])
  const letters = [...'Content']
    .map((ch) => [ch, 'text-ink-900 font-extrabold'])
    .concat([...'Flow'].map((ch) => [ch, 'text-brand font-semibold']))

  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="relative cf-mark-in">
        <span className="cf-halo absolute -inset-6 rounded-full bg-brand/20 blur-2xl" />
        <img
          src="/brand/logo-mark.png"
          alt=""
          className="cf-float relative w-20 h-20 object-contain drop-shadow-[0_10px_18px_rgba(26,111,196,.25)]"
        />
      </div>
      <div className="mt-4 text-[34px] leading-none tracking-tight" aria-label="ContentFlow">
        {letters.map(([ch, cls], k) => (
          <span
            key={k}
            aria-hidden="true"
            className={`cf-letter inline-block ${cls}`}
            style={{ animationDelay: `${0.35 + k * 0.055}s` }}
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="cf-fade-late mt-2.5 text-[13px] text-ink-500">
        Content that’s{' '}
        <span key={i} className="cf-word inline-block min-w-[74px] font-semibold text-brand">
          {DOES[i]}
        </span>{' '}
        by AI
      </p>
    </div>
  )
}

const inputCls =
  'w-full h-11 bg-white border border-ink-200 rounded-xl px-3.5 text-[13px] text-ink-800 placeholder:text-ink-300 ' +
  'focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all duration-150'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block font-semibold text-[11.5px] text-ink-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}
