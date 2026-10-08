import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiActivity,
  FiAlertTriangle,
  FiDollarSign,
  FiGrid,
  FiLogOut,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiUserCheck,
  FiUserPlus,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import Select from '../../components/ui/Select'
import { hideSplash } from '../../lib/splash'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../../components/ui/PlatformIcon'

// The platform admin portal (/admin-mkt — backend app/admin.py): who signed
// up, who uses ContentFlow and how much AI they spend, with the controls to
// suspend an account, switch a user off, change a plan or add AI credit.
// Its own login (ADMIN_USERNAME / ADMIN_PASSWORD in the backend .env) — not a
// customer account; its token lives in this tab only (sessionStorage) and goes
// in X-Admin-Token, never the customer Authorization header.

const TOKEN_KEY = 'cf_admin_token'
const tokenGet = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
const tokenSet = (t) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private window — the session just won't survive a reload */
  }
}

async function adminApi(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenGet()
  if (token) headers['X-Admin-Token'] = token
  let res
  try {
    res = await fetch(`/api/admin-mkt${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Can’t reach the server — check your connection.')
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') {
      tokenSet(null)
      window.dispatchEvent(new Event('admin:signed-out'))
    }
    const err = new Error(
      typeof data?.detail === 'string' ? data.detail : res.status === 404 ? 'The admin portal is switched off on this server.' : `Request failed (${res.status})`,
    )
    err.status = res.status
    throw err
  }
  return data
}

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const input =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'

const money = (n) => `$${Number(n || 0).toFixed(2)}`
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
function ago(iso) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return day(iso)
}

export default function AdminApp() {
  const [signedIn, setSignedIn] = useState(() => !!tokenGet())
  useEffect(() => {
    document.title = 'Admin · ContentFlow'
    const out = () => setSignedIn(false)
    window.addEventListener('admin:signed-out', out)
    return () => window.removeEventListener('admin:signed-out', out)
  }, [])
  // the launch splash (index.html) goes once we know what to show
  useEffect(() => hideSplash(), [])
  return signedIn ? (
    <AdminPortal
      onSignOut={() => {
        tokenSet(null)
        setSignedIn(false)
      }}
    />
  ) : (
    <AdminLogin onIn={() => setSignedIn(true)} />
  )
}

// ── sign in ───────────────────────────────────────────────────────────────
function AdminLogin({ onIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const out = await adminApi('POST', '/login', { username, password })
      tokenSet(out.token)
      onIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <form onSubmit={submit} className={`${card} w-full max-w-[380px] p-7`}>
        <div className="flex items-center gap-3">
          <img src="/brand/logo-mark.png" alt="" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-[16px] font-bold tracking-tight text-ink-900">ContentFlow</div>
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-brand">Admin portal</div>
          </div>
        </div>
        <h1 className="mt-6 text-[18px] font-bold text-ink-900">Sign in</h1>
        <p className="mt-1 text-[12.5px] text-ink-500">For the ContentFlow team — not a customer account.</p>
        <label className="mt-5 block text-[12px] font-semibold text-ink-700">
          Username
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={`${input} mt-1.5`} />
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-ink-700">
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1.5`} />
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !username || !password} className="btn-primary mt-5 w-full justify-center py-2.5">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

// ── the portal ────────────────────────────────────────────────────────────
// The sidebar's pages — add new admin pages here.
const TABS = [
  { id: 'overview', label: 'Overview', icon: FiGrid },
  { id: 'accounts', label: 'Accounts', icon: FiUsers },
]

function AdminPortal({ onSignOut }) {
  const [tab, setTab] = useState('overview')
  const [openId, setOpenId] = useState(null)
  const [stamp, setStamp] = useState(0) // bump to reload lists after a change

  const brandMark = (
    <div className="flex items-center gap-2.5">
      <img src="/brand/logo-mark.png" alt="" className="h-8 w-8 object-contain" />
      <div className="leading-tight">
        <div className="text-[14px] font-bold tracking-tight text-ink-900">ContentFlow</div>
        <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-brand">Admin portal</div>
      </div>
    </div>
  )
  const navItem = (t, compact = false) => (
    <button
      key={t.id}
      type="button"
      onClick={() => setTab(t.id)}
      aria-current={tab === t.id ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-xl text-[13.5px] font-semibold transition-colors ${compact ? 'px-3 py-1.5' : 'w-full px-3 py-2.5'} ${
        tab === t.id ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
      }`}
    >
      <t.icon size={16} aria-hidden="true" />
      {t.label}
    </button>
  )

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-ink-200/70 bg-white px-4 py-5 lg:flex">
        {brandMark}
        <nav className="mt-8 space-y-1">
          <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-400">Manage</div>
          {TABS.map((t) => navItem(t))}
        </nav>
        <div className="mt-auto border-t border-ink-100 pt-4">
          <div className="px-3 text-[11.5px] leading-snug text-ink-400">Signed in as the ContentFlow team · this tab only</div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-ink-600 hover:bg-red-50 hover:text-red-700"
          >
            <FiLogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      {/* top bar (phone / tablet) */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200/70 bg-white px-4 py-2.5 lg:hidden">
        {brandMark}
        <nav className="ml-auto flex gap-1">{TABS.map((t) => navItem(t, true))}</nav>
        <button type="button" onClick={onSignOut} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-50">
          <FiLogOut size={16} />
        </button>
      </header>

      <main className="min-w-0 flex-1 px-5 py-7 lg:px-10">
        {tab === 'overview' ? (
          <Overview key={stamp} onOpen={setOpenId} onAll={() => setTab('accounts')} />
        ) : (
          <Accounts key={stamp} onOpen={setOpenId} />
        )}
      </main>

      {openId != null && <AccountDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => setStamp((n) => n + 1)} />}
    </div>
  )
}

function useLoad(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setData(await adminApi('GET', path))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [path])
  useEffect(() => {
    load()
  }, [load])
  return { data, error, load, setData }
}

// ── overview ──────────────────────────────────────────────────────────────
function Overview({ onOpen, onAll }) {
  const { data, error } = useLoad('/overview')
  if (error) return <Problem text={error} />
  if (!data) return <Skeleton />

  const tiles = [
    { icon: FiUsers, label: 'Accounts', value: data.accounts, hint: data.suspended ? `${data.suspended} suspended` : 'all active' },
    { icon: FiUserCheck, label: 'Users', value: data.users, hint: 'people with a login' },
    { icon: FiUserPlus, label: 'New this week', value: data.new_7d, hint: 'accounts signed up' },
    { icon: FiActivity, label: 'Active this week', value: data.active_users_7d, hint: `users · ${data.active_accounts_7d} accounts` },
    { icon: FiDollarSign, label: 'AI used this month', value: money(data.ai_month), hint: 'all accounts' },
    { icon: FiSend, label: 'Posts published', value: data.posts_30d, hint: 'last 30 days' },
  ]
  const max = Math.max(1, ...data.signups.map((d) => d.count))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink-900">Overview</h1>
        <p className="mt-1 text-[13px] text-ink-500">Who signed up and who uses ContentFlow</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className={`${card} p-4`}>
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink-500">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
                <t.icon size={14} aria-hidden="true" />
              </span>
              {t.label}
            </div>
            <div className="mt-2.5 text-[26px] font-bold leading-none tracking-tight tabular-nums text-ink-900">{t.value}</div>
            <div className="mt-1.5 text-[11.5px] text-ink-400">{t.hint}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className={`${card} p-5`}>
          <h2 className="text-[14px] font-semibold text-ink-900">Sign-ups, last 14 days</h2>
          <p className="text-[11.5px] text-ink-500">New accounts per day</p>
          <div className="mt-5 flex h-44 items-end gap-1.5">
            {data.signups.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day(d.date)}: ${d.count} sign-up${d.count === 1 ? '' : 's'}`}>
                {d.count > 0 && <span className="text-[10.5px] font-semibold tabular-nums text-ink-700">{d.count}</span>}
                <div
                  className={`w-full max-w-[28px] rounded-t-[4px] ${d.count ? 'bg-brand' : 'bg-ink-100'}`}
                  style={{ height: d.count ? `${Math.max(6, (d.count / max) * 85)}%` : 3 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {data.signups.map((d, i) => (
              <span key={d.date} className={`flex-1 text-center text-[10px] ${i === data.signups.length - 1 ? 'font-bold text-ink-800' : 'text-ink-400'}`}>
                {new Date(`${d.date}T00:00`).getDate()}
              </span>
            ))}
          </div>
        </section>

        <section className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink-900">Latest sign-ups</h2>
            <button type="button" onClick={onAll} className="text-[12px] font-semibold text-brand hover:underline">
              All accounts →
            </button>
          </div>
          <ul className="mt-3 divide-y divide-ink-100">
            {data.recent.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onOpen(w.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-ink-50/60">
                  <Avatar name={w.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink-900">{w.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-500">{w.owner?.email || 'no owner'}</span>
                  </span>
                  <span className="flex-none text-right text-[11px] text-ink-400">
                    {ago(w.created_at)}
                    {w.suspended && <StatusBadge suspended className="ml-1.5" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ── accounts ──────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'all', label: 'All accounts' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

function Accounts({ onOpen }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  // search as you type, without a request per key
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250)
    return () => clearTimeout(t)
  }, [q])
  const { data, error } = useLoad(`/workspaces?q=${encodeURIComponent(query)}&status=${status}`)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-900">Accounts</h1>
          <p className="mt-1 text-[13px] text-ink-500">Every workspace that signed up — click one for details and controls</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className={`${input} w-64 py-2 pl-9`} aria-label="Search accounts" />
          </label>
          <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} align="right" buttonClassName="min-w-[150px]" />
        </div>
      </div>

      {error ? (
        <Problem text={error} />
      ) : !data ? (
        <Skeleton />
      ) : (
        <section className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3">Account</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3 text-right">Users</th>
                  <th className="px-3 py-3 text-right">Brands</th>
                  <th className="px-3 py-3 text-right">Channels</th>
                  <th className="px-3 py-3 text-right">Posts 30d</th>
                  <th className="px-3 py-3 text-right">AI this month</th>
                  <th className="px-3 py-3">Last active</th>
                  <th className="px-3 py-3">Signed up</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-ink-400">
                      No accounts match.
                    </td>
                  </tr>
                )}
                {data.map((w) => (
                  <tr key={w.id} onClick={() => onOpen(w.id)} className="cursor-pointer border-t border-ink-100 text-[13px] transition-colors hover:bg-ink-50/70">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={w.name} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink-900">{w.name}</div>
                          <div className="truncate text-[11.5px] text-ink-500">{w.owner?.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <PlanBadge plan={w.plan} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{w.members}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{w.brands}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{w.channels}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{w.posts_30d}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-900">{money(w.ai_month)}</td>
                    <td className="px-3 py-3 text-ink-600">{ago(w.last_active)}</td>
                    <td className="px-3 py-3 text-ink-600">{day(w.created_at)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge suspended={w.suspended} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 px-5 py-2.5 text-[11.5px] text-ink-400">
            {data.length} account{data.length === 1 ? '' : 's'}
          </div>
        </section>
      )}
    </div>
  )
}

// ── one account: details + controls (right slide-over) ────────────────────
const PLAN_OPTIONS = [
  { value: 'pro', label: 'Pro · $50 AI credit / month' },
  { value: 'free', label: 'Free · no AI credit' },
]

function AccountDrawer({ id, onClose, onChanged }) {
  const { data: w, error, load } = useLoad(`/workspaces/${id}`)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [reason, setReason] = useState('')
  const [confirmSuspend, setConfirmSuspend] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const act = async (key, method, path, body, done) => {
    setBusy(key)
    setNote('')
    try {
      await adminApi(method, path, body)
      await load()
      onChanged()
      setNote(done)
    } catch (e) {
      setNote(`⚠ ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const bal = w?.balance
  // this month: AI used vs what it had (plan credit + any extra credit added)
  const used = w?.ai_month || 0
  const total = bal ? Math.max(bal.balance + used, 0.01) : 1

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button type="button" aria-label="Close" className="absolute inset-0 glass-overlay animate-fadein cursor-default" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col glass-drawer animate-drawer-in">
        <header className="flex items-start gap-3 border-b border-ink-100 px-6 py-5">
          {w && <Avatar name={w.name} big />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-ink-900">{w?.name || 'Loading…'}</h2>
              {w && <StatusBadge suspended={w.suspended} />}
            </div>
            {w && (
              <p className="mt-0.5 text-[12px] text-ink-500">
                {w.owner ? `${w.owner.name} · ${w.owner.email}` : 'No owner'} · signed up {day(w.created_at)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Close">
            <FiX size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && <Problem text={error} />}
          {!w && !error && <Skeleton />}
          {w && (
            <>
              {note && (
                <p className={`rounded-lg px-3 py-2 text-[12.5px] ${note.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{note}</p>
              )}
              {w.suspended && (
                <div className="flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-800">
                  <FiAlertTriangle size={15} className="mt-0.5 flex-none" aria-hidden="true" />
                  <span>
                    <b>Suspended</b> {ago(w.suspended_at)} — nobody can sign in and no AI is used.
                    {w.suspended_reason && <span className="mt-0.5 block text-red-700">Reason: {w.suspended_reason}</span>}
                  </span>
                </div>
              )}

              {/* usage */}
              <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ['AI this month', money(w.ai_month)],
                  ['Credit left', money(bal?.available)],
                  ['Posts 30d', w.posts_30d],
                  ['Last active', ago(w.last_active)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-ink-50 px-3 py-2.5">
                    <div className="text-[11px] text-ink-500">{label}</div>
                    <div className="mt-0.5 text-[15px] font-bold tabular-nums text-ink-900">{value}</div>
                  </div>
                ))}
              </section>

              {/* plan + credit */}
              <Section title="Plan & AI credit">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Select
                      value={w.plan}
                      onChange={(plan) => act('plan', 'POST', `/workspaces/${id}/plan`, { plan }, 'Plan changed')}
                      options={PLAN_OPTIONS}
                      buttonClassName="w-full"
                    />
                  </div>
                </div>
                {bal && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[11.5px] text-ink-500">
                      <span>
                        {money(used)} used of {money(total)} this month
                      </span>
                      <span>resets {day(bal.resets_at)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const n = Number(amount)
                    if (n > 0)
                      act('credit', 'POST', `/workspaces/${id}/credit`, { amount_usd: n, note: creditNote }, `Added ${money(n)} of AI credit for this month`).then(() => {
                        setAmount('')
                        setCreditNote('')
                      })
                  }}
                >
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder="$ amount"
                    className={`${input} w-28 py-2`}
                    aria-label="Credit amount in US dollars"
                  />
                  <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} maxLength={200} placeholder="Note (optional)" className={`${input} min-w-0 flex-1 py-2`} />
                  <button type="submit" disabled={!(Number(amount) > 0) || busy === 'credit'} className="btn-primary py-2">
                    <FiPlus size={14} /> Add credit
                  </button>
                </form>
                <p className="mt-1.5 text-[11px] text-ink-400">Extra credit counts for this month, like the plan’s own credit.</p>
              </Section>

              {/* members */}
              <Section title={`Users (${w.member_list.length})`}>
                <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {w.member_list.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Avatar name={m.name} small />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink-900">
                          {m.name} <span className="ml-1 text-[11px] font-medium capitalize text-ink-400">{m.role}</span>
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-500">
                          {m.email} · seen {ago(m.last_seen)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy === `user-${m.id}`}
                        onClick={() =>
                          act(`user-${m.id}`, 'POST', `/users/${m.id}/active`, { is_active: !m.is_active }, m.is_active ? `${m.name} switched off and signed out` : `${m.name} can sign in again`)
                        }
                        className={`flex-none rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                          m.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-700' : 'bg-red-50 text-red-700 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                        title={m.is_active ? 'Switch this user off (signs them out)' : 'Let this user sign in again'}
                      >
                        {m.is_active ? 'Active' : 'Off'}
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* brands */}
              <Section title={`Brands (${w.brand_list.length})`}>
                {w.brand_list.length === 0 ? (
                  <p className="text-[12.5px] text-ink-400">No brand yet — they signed up but haven’t set up.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {w.brand_list.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5">
                        <span className="truncate text-[13px] font-semibold text-ink-900">{b.name}</span>
                        <span className="flex flex-none items-center gap-1">
                          {b.channels.length === 0 && <span className="text-[11.5px] text-ink-400">no channels</span>}
                          {b.channels.map((c, n) => (
                            <span
                              key={n}
                              title={`${c.platform}${c.handle ? ` · ${c.handle}` : ''} · ${c.status}`}
                              className={`grid h-6 w-6 place-items-center rounded-full bg-white ring-1 ring-ink-100 ${c.status === 'live' ? PLAT_BRAND_CLASS[c.platform] || 'text-ink-500' : 'text-ink-300'}`}
                            >
                              <PlatformIcon name={c.platform} />
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* activity */}
              <Section title="Recent sign-ins">
                {w.logins.length === 0 ? (
                  <p className="text-[12.5px] text-ink-400">None recorded.</p>
                ) : (
                  <ul className="space-y-1 text-[12px]">
                    {w.logins.map((l, n) => (
                      <li key={n} className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 flex-none rounded-full ${l.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="min-w-0 flex-1 truncate text-ink-700">
                          {l.email} <span className="text-ink-400">· {l.status.replace('_', ' ')}</span>
                        </span>
                        <span className="flex-none tabular-nums text-ink-400">{l.ip || '—'}</span>
                        <span className="w-20 flex-none text-right text-ink-400">{ago(l.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="AI credit activity">
                {w.credit.length === 0 ? (
                  <p className="text-[12.5px] text-ink-400">No AI used yet.</p>
                ) : (
                  <ul className="space-y-1 text-[12px]">
                    {w.credit.map((c, n) => (
                      <li key={n} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-ink-700">{c.note || c.kind}</span>
                        <span className={`flex-none font-semibold tabular-nums ${c.amount > 0 ? 'text-emerald-700' : 'text-ink-800'}`}>
                          {c.amount > 0 ? '+' : '−'}
                          {money(Math.abs(c.amount))}
                        </span>
                        <span className="w-20 flex-none text-right text-ink-400">{ago(c.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* suspend */}
              <Section title="Account access">
                {w.suspended ? (
                  <button
                    type="button"
                    disabled={busy === 'suspend'}
                    onClick={() => act('suspend', 'POST', `/workspaces/${id}/suspend`, { suspended: false }, 'Account restored — they can sign in again')}
                    className="btn-primary"
                  >
                    <FiRefreshCw size={14} /> Restore account
                  </button>
                ) : confirmSuspend ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                    <p className="text-[12.5px] font-semibold text-red-800">Suspend {w.name}?</p>
                    <p className="mt-0.5 text-[12px] text-red-700">Everyone in it is signed out, can’t sign in, and no AI is used. Posts already scheduled still go out.</p>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (only you see it)" className={`${input} mt-2.5 py-2`} />
                    <div className="mt-2.5 flex justify-end gap-2">
                      <button type="button" onClick={() => setConfirmSuspend(false)} className="btn-outline py-1.5">
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy === 'suspend'}
                        onClick={() =>
                          act('suspend', 'POST', `/workspaces/${id}/suspend`, { suspended: true, reason }, 'Account suspended — everyone was signed out').then(() => setConfirmSuspend(false))
                        }
                        className="btn bg-red-600 py-1.5 text-white hover:bg-red-700"
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSuspend(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50"
                  >
                    <FiAlertTriangle size={14} /> Suspend this account
                  </button>
                )}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

// ── small pieces ─────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">{title}</h3>
      {children}
    </section>
  )
}

function Avatar({ name, small = false, big = false }) {
  const size = big ? 'h-11 w-11 text-[15px]' : small ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-[13px]'
  return (
    <span className={`grid flex-none place-items-center rounded-full bg-brand font-bold text-white ${size}`}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

function StatusBadge({ suspended, className = '' }) {
  return suspended ? (
    <span className={`inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ${className}`}>Suspended</span>
  ) : (
    <span className={`inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ${className}`}>Active</span>
  )
}

function PlanBadge({ plan }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${plan === 'pro' ? 'bg-blue-100 text-blue-800' : 'bg-ink-100 text-ink-600'}`}>
      {plan}
    </span>
  )
}

function Problem({ text }) {
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{text}</p>
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 rounded-2xl skeleton" />
      <div className="h-64 rounded-2xl skeleton" />
    </div>
  )
}
