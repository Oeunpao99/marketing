import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiAlertTriangle,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiCreditCard,
  FiDroplet,
  FiVideo,
  FiImage,
  FiEdit3,
  FiLock,
  FiLogOut,
  FiMonitor,
  FiRefreshCw,
  FiSmartphone,
  FiTrash2,
  FiUser,
  FiUserPlus,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import { api } from '../../api/client'
import { useAuth } from '../../auth'
import { NOTIFY_KINDS, notifyPrefs } from '../../lib/notifications'
import { disablePush, enablePush, pushStatus, sendTestPush } from '../../lib/push'
import { ACCENTS, applyAccent, DEFAULT_ACCENT, normalizeAccent } from '../../lib/theme'
import { promptInstall, useInstallState } from '../../lib/pwa'
import { APP_VERSION, applyUpdate, latestVersion } from '../../lib/update'
import { TZ } from '../../lib/tz'
import { fmtUSD } from '../../lib/money'

// Settings — every control here is real and saves to the backend
// (app/auth.py): profile, password, workspace name, and the team (add people
// with a temporary password, change roles, deactivate, remove). Workspace and
// Team edits are owner/admin only; editors see them read-only.

const TABS = [
  { id: 'profile', label: 'Profile', icon: FiUser },
  { id: 'appearance', label: 'Appearance', icon: FiDroplet },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'security', label: 'Security', icon: FiLock },
  { id: 'workspace', label: 'Workspace', icon: FiBriefcase },
  { id: 'team', label: 'Team', icon: FiUsers },
  { id: 'billing', label: 'Billing', icon: FiCreditCard },
]

const TIMEZONES = ['UTC+7', 'UTC+8', 'UTC+9', 'UTC+0', 'UTC-5', 'UTC-8']
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', editor: 'Editor' }
const ROLE_HINT = {
  owner: 'Full control, including the workspace itself',
  admin: 'Manages the workspace and team, and everything else',
  editor: 'Creates, schedules and publishes content',
}

const input =
  'w-full h-10 rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-ink-50 disabled:text-ink-500'

export default function SettingsModal({ open, onClose, showToast, initialTab = null }) {
  const [tab, setTab] = useState('profile')

  useEffect(() => {
    if (open && initialTab) setTab(initialTab)
  }, [open, initialTab])

  const activeTabRef = useRef(null)
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [tab, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* A plain dim and a solid panel, no backdrop blur: blurring a page
          that keeps animating (AI Agent renders, videos) re-blurs the whole
          screen every frame and made this feel stuck. */}
      <div className="fixed inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative animate-fadein flex h-[90dvh] w-full sm:w-[70vw] overflow-hidden rounded-3xl border border-ink-200/70 bg-white shadow-[0_24px_60px_-16px_rgba(16,24,40,0.35)]">
        {/* tabs */}
        <nav className="hidden sm:flex w-[200px] flex-none flex-col gap-0.5 border-r border-ink-100 bg-ink-50/70 p-3">
          <div className="px-2.5 pb-3 pt-1 text-[15px] font-bold text-ink-900">Settings</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                tab === t.id ? 'bg-brand-soft font-semibold text-brand' : 'font-medium text-ink-600 hover:bg-ink-100/70 hover:text-ink-900'
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 sm:px-6 py-3.5 sm:py-4">
            <h2 className="text-[15px] font-semibold text-ink-900">
              <span className="sm:hidden">Settings</span>
              <span className="hidden sm:inline">{TABS.find((t) => t.id === tab)?.label}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="h-8 w-8 rounded-lg grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            >
              <FiX size={16} />
            </button>
          </header>

          {/* mobile: the sections as a sideways-scrolling tab row */}
          <div className="sm:hidden border-b border-ink-100">
            <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 side-scroll" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  ref={tab === t.id ? activeTabRef : null}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    tab === t.id ? 'bg-brand text-white shadow-sm' : 'bg-white/70 text-ink-600 ring-1 ring-ink-200'
                  }`}
                >
                  <t.icon size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
            {tab === 'profile' && <ProfileTab showToast={showToast} />}
            {tab === 'appearance' && <AppearanceTab showToast={showToast} />}
            {tab === 'notifications' && <NotificationsTab showToast={showToast} />}
            {tab === 'security' && <SecurityTab showToast={showToast} onClose={onClose} />}
            {tab === 'workspace' && <WorkspaceTab showToast={showToast} />}
            {tab === 'team' && <TeamTab showToast={showToast} />}
            {tab === 'billing' && <BillingTab />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Profile ───────────────────────────────────────────────────────────────
function ProfileTab({ showToast }) {
  const { user, updateMe } = useAuth()
  const initial = { name: user?.name || '', email: user?.email || '', timezone: user?.timezone || 'UTC+7' }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = Object.keys(initial).some((k) => form[k].trim() !== initial[k])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) return showToast('Name can’t be empty')
    setSaving(true)
    try {
      await updateMe({ name: form.name.trim(), email: form.email.trim(), timezone: form.timezone })
      showToast('Profile saved')
    } catch (e) {
      showToast(`Couldn’t save — ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="h-14 w-14 rounded-full grid place-items-center bg-brand text-white text-[17px] font-bold">
          {(form.name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase()}
        </span>
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{user?.name}</div>
          <div className="text-[12px] text-ink-500">
            {ROLE_LABEL[user?.role] || user?.role} · {user?.workspace_name}
          </div>
        </div>
      </div>

      <Row label="Full name">
        <input value={form.name} onChange={set('name')} className={input} />
      </Row>
      <Row label="Email" hint="You sign in with this.">
        <input type="email" value={form.email} onChange={set('email')} className={input} />
      </Row>
      <Row label="Timezone" hint="Used for times shown to you.">
        <select value={form.timezone} onChange={set('timezone')} className={input}>
          {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => (
            <option key={tz}>{tz}</option>
          ))}
        </select>
      </Row>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(initial)} />
    </div>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────
function AppearanceTab({ showToast }) {
  const { user, updatePrefs } = useAuth()
  const prefs = user?.preferences || {}
  const saved = (prefs.accent || DEFAULT_ACCENT).toUpperCase()
  // The colour input fires continuously while dragging — preview instantly,
  // save once the person settles on a colour.
  const saveTimer = useRef(null)
  const [draft, setDraft] = useState(null)

  const current = draft || saved
  const isPreset = ACCENTS.some((a) => a.hex === current)

  const save = (patch, msg) =>
    updatePrefs(patch)
      .then(() => msg && showToast(msg))
      .catch((e) => showToast(`Couldn’t save — ${e.message}`))

  const pickCustom = (hex) => {
    const safe = normalizeAccent(hex)
    applyAccent(safe)
    setDraft(safe)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save({ accent: safe }, safe !== hex.toUpperCase() ? 'Darkened a little so white text stays readable' : 'Custom colour applied')
      setDraft(null)
    }, 450)
  }
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle title="Accent colour" sub="Buttons, links, highlights and the sidebar — across the whole app." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACCENTS.map((a) => {
            const on = a.hex === current
            return (
              <button
                key={a.hex}
                type="button"
                onClick={() => save({ accent: a.hex }, `${a.name} applied`)}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                  on ? 'border-brand ring-4 ring-brand/10' : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <span className="h-8 w-8 flex-none rounded-lg grid place-items-center text-white" style={{ background: a.hex }}>
                  {on && <FiCheck size={15} />}
                </span>
                <span className="text-[12.5px] font-semibold text-ink-800">{a.name}</span>
              </button>
            )
          })}
          <label
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition ${
              !isPreset ? 'border-brand ring-4 ring-brand/10' : 'border-ink-200 hover:border-ink-300'
            }`}
          >
            <span
              className="relative h-8 w-8 flex-none overflow-hidden rounded-lg"
              style={{
                background: isPreset
                  ? 'conic-gradient(#E11D48,#EA580C,#EAB308,#15803D,#0F766E,#1A6FC4,#6D28D9,#E11D48)'
                  : current,
              }}
            >
              <input
                type="color"
                value={current.toLowerCase()}
                onChange={(e) => pickCustom(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Custom colour"
              />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-ink-800">Custom</span>
              <span className="block font-mono text-[10.5px] text-ink-400">{isPreset ? 'Pick any' : current}</span>
            </span>
          </label>
        </div>

        {/* live preview */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-brand-softer/60 p-4">
          <span className="btn-primary pointer-events-none">Primary button</span>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand">Selected</span>
          <span className="text-[12.5px] font-semibold text-brand">A link</span>
          <span className="h-2 w-24 overflow-hidden rounded-full bg-brand/15">
            <span className="block h-full w-2/3 rounded-full bg-brand" />
          </span>
        </div>
        {current !== DEFAULT_ACCENT && (
          <button
            type="button"
            onClick={() => save({ accent: DEFAULT_ACCENT }, 'Back to Ocean')}
            className="text-[12px] font-medium text-ink-500 hover:text-brand"
          >
            Reset to default
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-ink-200 px-4">
        <ToggleRow
          title="Reduce motion"
          desc="Turn off animations like the floating logo, smoke and slide-ins."
          on={!!prefs.reduce_motion}
          onChange={(v) => save({ reduce_motion: v }, v ? 'Animations off' : 'Animations on')}
        />
      </section>

      <InstallApp showToast={showToast} />

      <p className="text-[11.5px] text-ink-400">Saved to your account — it follows you to any device.</p>
    </div>
  )
}

function InstallApp({ showToast }) {
  const state = useInstallState()
  const [checking, setChecking] = useState(false)
  const checkUpdates = async () => {
    setChecking(true)
    const v = await latestVersion()
    setChecking(false)
    if (v && v !== APP_VERSION) {
      showToast('Updating to the newest version…')
      applyUpdate()
    } else {
      showToast(v ? 'You’re on the newest version ✓' : 'Couldn’t check right now — try again')
    }
  }
  return (
    <>
    <section className="flex items-start gap-4 rounded-2xl border border-ink-200 p-4">
      <img src="/brand/icon-192.png" alt="" className="h-12 w-12 flex-none rounded-xl ring-1 ring-ink-200" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink-900">ContentFlow app</div>
        {state === 'installed' && (
          <div className="text-[12px] text-emerald-700">Installed — you’re using the app right now.</div>
        )}
        {state === 'available' && (
          <div className="text-[12px] text-ink-500">Add it to your home screen or desktop — opens full-screen, like a native app.</div>
        )}
        {state === 'ios' && (
          <ol className="mt-1 space-y-0.5 text-[12px] text-ink-600">
            <li>1. Tap the <b>Share</b> button in Safari (the square with the arrow).</li>
            <li>2. Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>3. Tap <b>Add</b> — ContentFlow appears with your other apps.</li>
          </ol>
        )}
        {state === 'unsupported' && (
          <div className="text-[12px] text-ink-500">
            Open ContentFlow in Chrome, Edge or Safari on your phone, then use <b>Install app</b> / <b>Add to Home Screen</b>{' '}
            from the browser menu.
          </div>
        )}
      </div>
      {state === 'available' && (
        <button
          type="button"
          onClick={async () => {
            const r = await promptInstall()
            if (r === 'accepted') showToast('Installed — find ContentFlow on your home screen')
          }}
          className="btn-primary flex-none"
        >
          Install app
        </button>
      )}
    </section>
    <section className="flex items-center gap-3 rounded-2xl border border-ink-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink-800">Version</div>
        <div className="font-mono text-[11.5px] text-ink-500">{APP_VERSION}</div>
      </div>
      <button type="button" onClick={checkUpdates} disabled={checking} className="btn-outline flex-none">
        {checking ? 'Checking…' : 'Check for updates'}
      </button>
    </section>
    </>
  )
}

// ── Notifications ─────────────────────────────────────────────────────────
function NotificationsTab({ showToast }) {
  const { user, updatePrefs } = useAuth()
  const notify = notifyPrefs(user)
  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title="Tell me when…" sub="Used for the bell and for push notifications below." />
        <div className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          {NOTIFY_KINDS.map((k) => (
            <ToggleRow
              key={k.id}
              title={k.label}
              desc={k.pushOnly ? `${k.desc} (push notification only)` : k.desc}
              on={notify[k.id]}
              onChange={(v) => setKind(k.id, v)}
            />
          ))}
        </div>
      </section>

      <PushSection showToast={showToast} />

      <p className="text-[11.5px] text-ink-400">Email and Telegram summaries aren’t available yet.</p>
    </div>
  )
}

// Phone lock-screen / desktop notifications via Web Push (app/push.py).
const PUSH_HELP = {
  'ios-install':
    'On iPhone, add ContentFlow to your Home Screen first (Share → Add to Home Screen), open it from there, then turn this on.',
  insecure: 'Needs a secure (https://) address — it works on your live site, not on a local Wi-Fi preview.',
  unsupported: 'This browser can’t receive push notifications. Try Chrome, Edge, or the installed app.',
  denied: 'Notifications are blocked for this site — allow them in your browser or phone settings, then come back.',
  'server-off': 'Push isn’t set up on the server yet (VAPID keys missing in the backend .env).',
}

function PushSection({ showToast }) {
  const { user, updatePrefs } = useAuth()
  const [status, setStatus] = useState('checking')
  const [busy, setBusy] = useState(false)
  const wanted = !!user?.preferences?.push_alerts
  const on = status === 'on' && wanted

  useEffect(() => {
    pushStatus().then(setStatus)
  }, [])

  const toggle = async (v) => {
    setBusy(true)
    try {
      if (v) {
        await enablePush()
        await updatePrefs({ push_alerts: true })
        setStatus('on')
        await sendTestPush().catch(() => {})
        showToast('Push notifications on — a test one is on its way')
      } else {
        await disablePush()
        setStatus('ready')
        showToast('Push notifications off on this device')
      }
    } catch (e) {
      showToast(e.message)
      setStatus(await pushStatus())
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const r = await sendTestPush()
      showToast(`Test sent to ${r.sent} device${r.sent === 1 ? '' : 's'}`)
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = PUSH_HELP[status]
  return (
    <section>
      <SectionTitle
        title="Push notifications"
        sub="Alerts on your phone’s lock screen or your computer — even when ContentFlow is closed."
      />
      <div className="mt-3 rounded-2xl border border-ink-200 px-4">
        <ToggleRow
          title="On this device"
          desc={
            status === 'checking'
              ? 'Checking this device…'
              : blocked
                ? blocked
                : on
                  ? 'You’ll get the alerts you switched on above.'
                  : 'Turn on to get the alerts you switched on above.'
          }
          on={on}
          disabled={busy || status === 'checking' || !!blocked}
          onChange={toggle}
        />
        {on && (
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 py-3">
            <span className="text-[11.5px] text-ink-500">Each phone or computer turns this on separately.</span>
            <button type="button" onClick={test} disabled={busy} className="btn-outline flex-none">
              Send test
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Security ──────────────────────────────────────────────────────────────
function SecurityTab({ showToast, onClose }) {
  const { user, logout } = useAuth()

  const signOut = async () => {
    // End this session on the server too, so the token stops working even if copied.
    await api.post('/auth/logout').catch(() => {})
    onClose()
    logout()
    showToast('Signed out')
  }

  return (
    <div className="space-y-8">
      <ActiveSessions showToast={showToast} />

      <LoginHistory />

      <section className="flex items-center gap-3 border-t border-ink-100 pt-5">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink-800">Signed in as {user?.name}</div>
          <div className="truncate text-[12px] text-ink-500">{user?.email}</div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-100"
        >
          <FiLogOut size={14} /> Sign out
        </button>
      </section>
    </div>
  )
}

// Signed-in devices (app/sessions.py): this one first, then the rest by last
// activity; any other device can be signed out from here.
const sessionTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function ActiveSessions({ showToast }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState('')

  const load = () =>
    api
      .get('/auth/security/sessions')
      .then(setRows)
      .catch(() => setRows([]))
  useEffect(() => {
    load()
  }, [])

  const signOutOne = async (s) => {
    setBusy(s.id)
    try {
      await api.del(`/auth/security/sessions/${s.id}`)
      setRows((list) => list.filter((x) => x.id !== s.id))
      showToast(`Signed out ${s.device}`)
    } catch (e) {
      showToast(`Couldn’t sign out — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const signOutOthers = async () => {
    setBusy('others')
    try {
      const r = await api.post('/auth/security/sessions/sign-out-others')
      setRows((list) => list.filter((x) => x.current))
      showToast(r.signed_out ? `Signed out ${r.signed_out} other device${r.signed_out === 1 ? '' : 's'}` : 'No other devices')
    } catch (e) {
      showToast(`Couldn’t sign out — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const others = (rows || []).filter((r) => !r.current).length
  const mobile = (device) => /android|iphone|ipad/i.test(device)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle title="Active sessions" sub="Devices signed in to your account right now." />
        {others > 0 && (
          <button
            type="button"
            onClick={signOutOthers}
            disabled={!!busy}
            className="text-[12px] font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            {busy === 'others' ? 'Signing out…' : 'Sign out all other devices'}
          </button>
        )}
      </div>

      {rows === null ? (
        <div className="mt-3 space-y-2">
          <div className="h-10 rounded-lg skeleton" />
          <div className="h-10 rounded-lg skeleton" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-500">No active sessions.</p>
      ) : (
        <div className="mt-3">
          <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem] gap-4 border-b border-ink-100 pb-2 text-[11.5px] font-medium text-ink-400">
            <span>Device</span>
            <span>Location</span>
            <span>Created</span>
            <span>Updated</span>
            <span />
          </div>
          <div className="divide-y divide-ink-100">
            {rows.map((r) => {
              const Icon = mobile(r.device) ? FiSmartphone : FiMonitor
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem] items-center gap-x-4 gap-y-0.5 py-3 text-[12.5px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon size={14} className="flex-none text-ink-400" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-800">{r.device}</div>
                      {r.current && <div className="text-[11px] font-semibold text-brand">Current</div>}
                    </div>
                  </div>
                  <span className="hidden md:block truncate text-ink-600" title={r.ip}>{r.location}</span>
                  <span className="hidden md:block text-ink-600">{sessionTime(r.created_at)}</span>
                  <span className="hidden md:block text-ink-600">{sessionTime(r.last_seen_at)}</span>
                  <div className="row-span-2 md:row-span-1 text-right">
                    {!r.current && (
                      <button
                        type="button"
                        onClick={() => signOutOne(r)}
                        disabled={!!busy}
                        className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-ink-600 ring-1 ring-ink-200 hover:bg-red-50 hover:text-red-700 hover:ring-red-200 disabled:opacity-50"
                      >
                        {busy === r.id ? '…' : 'Sign out'}
                      </button>
                    )}
                  </div>
                  {/* phones: the details under the device name */}
                  <div className="md:hidden col-start-1 truncate pl-[22px] text-[11px] text-ink-400">
                    {r.location} · active {sessionTime(r.last_seen_at)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

// Sign-in history (GET /auth/security/logins): every attempt with the email
// typed, IP, device and result — never the password. Owners/admins see the
// whole workspace, everyone else their own sign-ins.
const LOGIN_STATUS = {
  success: { label: 'Signed in', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  signup: { label: 'Account created', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  wrong_password: { label: 'Wrong password', tone: 'bg-red-50 text-red-700 ring-red-200' },
  unknown_email: { label: 'Unknown email', tone: 'bg-red-50 text-red-700 ring-red-200' },
  disabled: { label: 'Account disabled', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  blocked: { label: 'Blocked · too many tries', tone: 'bg-red-100 text-red-800 ring-red-300' },
}

const loginTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

function LoginHistory() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [onlyFailed, setOnlyFailed] = useState(false)

  const load = () => {
    setError('')
    api.get('/auth/security/logins').then(setData, (e) => setError(e.message))
  }
  useEffect(load, [])

  const events = (data?.events || []).filter(
    (e) => !onlyFailed || !['success', 'signup'].includes(e.status),
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionTitle
          title="Sign-in activity"
          sub={
            data?.scope === 'workspace'
              ? 'Every attempt to sign in to this workspace, newest first. Passwords are never recorded.'
              : 'Your recent sign-ins, newest first. Passwords are never recorded.'
          }
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyFailed((v) => !v)}
            className={`h-8 rounded-lg border px-2.5 text-[11.5px] font-medium ${
              onlyFailed ? 'border-red-200 bg-red-50 text-red-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'
            }`}
          >
            Failed only
          </button>
          <button type="button" onClick={load} className="h-8 w-8 grid place-items-center rounded-lg border border-ink-200 text-ink-600 hover:border-ink-300" title="Refresh">
            <FiRefreshCw size={13} />
          </button>
        </div>
      </div>

      {data && data.failed_24h > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
          <FiAlertTriangle size={15} className="mt-0.5 flex-none" />
          <span>
            <b>{data.failed_24h}</b> failed sign-in attempt{data.failed_24h === 1 ? '' : 's'} in the last 24 hours. If you don’t
            recognise them, change your password — after 10 wrong tries in 15 minutes an account is locked for 15 minutes.
          </span>
        </div>
      )}

      {error ? (
        <div className="text-[12px] text-red-600">{error}</div>
      ) : !data ? (
        <div className="text-[12px] text-ink-400">Loading…</div>
      ) : !events.length ? (
        <div className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-[12px] text-ink-400">
          {onlyFailed ? 'No failed attempts.' : 'No sign-ins recorded yet.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200">
          <ul className="max-h-[360px] divide-y divide-ink-100 overflow-y-auto">
            {events.map((e) => {
              const st = LOGIN_STATUS[e.status] || { label: e.status, tone: 'bg-ink-50 text-ink-600 ring-ink-200' }
              const Phone = /iPhone|iPad|Android/.test(e.device) ? FiSmartphone : FiMonitor
              return (
                <li key={e.id} className="flex items-start gap-3 px-3.5 py-3" title={e.user_agent}>
                  <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-ink-100 text-ink-600">
                    <Phone size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${st.tone}`}>{st.label}</span>
                      <span className="truncate text-[12.5px] font-medium text-ink-800">{e.member || e.email}</span>
                      {e.member && <span className="truncate text-[11.5px] text-ink-400">{e.email}</span>}
                      {e.this_device && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">This device</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-500">
                      <span>{e.device}</span>
                      <span className="font-mono">{e.ip || 'IP unknown'}</span>
                      <span>{loginTime(e.at)}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Workspace ─────────────────────────────────────────────────────────────
function WorkspaceTab({ showToast }) {
  const { user, renameWorkspace } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [info, setInfo] = useState(null)
  const [plan, setPlan] = useState('')
  const [name, setName] = useState(user?.workspace_name || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/auth/workspace').then(setInfo).catch(() => setInfo(null))
    api.get('/billing/summary').then((b) => setPlan(b.plan_label)).catch(() => {})
  }, [])

  const dirty = name.trim() && name.trim() !== user?.workspace_name
  const save = async () => {
    setSaving(true)
    try {
      await renameWorkspace(name.trim())
      showToast('Workspace renamed')
    } catch (e) {
      showToast(`Couldn’t rename — ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const shown = (dirty ? name : user?.workspace_name) || 'Workspace'
  const initials = shown
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  const created = info ? new Date(info.created_at) : null

  return (
    <div className="space-y-7">
      {/* identity */}
      <section className="flex items-center gap-4">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-[18px] font-bold text-white shadow-[0_8px_20px_rgb(var(--brand)/0.25)]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[17px] font-bold text-ink-900">{user?.workspace_name}</h3>
            {plan && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand">{plan}</span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {created ? `Created ${created.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ' '}
            {user?.role ? ` · You’re ${ROLE_LABEL[user.role] ? `an ${ROLE_LABEL[user.role].toLowerCase()}` : user.role}` : ''}
          </p>
        </div>
      </section>

      {/* name */}
      <section>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-900">Workspace name</span>
          <span className="mt-0.5 block text-[12px] text-ink-500">
            {canManage ? 'Your company or agency — shown in the sidebar.' : 'Only an owner or admin can rename it.'}
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && dirty && !saving && save()}
              className={`${input} flex-1`}
            />
            {canManage && dirty && (
              <>
                <button type="button" onClick={() => setName(user?.workspace_name || '')} className="btn-ghost">
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </label>
      </section>

      {/* at a glance */}
      <section>
        <h3 className="text-[13px] font-semibold text-ink-900">At a glance</h3>
        <div className="mt-2 grid grid-cols-3 divide-x divide-ink-100 rounded-2xl border border-ink-200">
          {[
            { icon: FiBriefcase, label: 'Brands', value: info?.brands },
            { icon: FiUsers, label: 'Members', value: info?.members },
            {
              icon: FiCalendar,
              label: 'Created',
              value: created ? created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null,
              sub: created ? created.getFullYear() : null,
            },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                <stat.icon size={12} /> {stat.label}
              </div>
              <div className="mt-1 truncate text-[20px] font-bold tabular-nums text-ink-900">
                {stat.value ?? '—'}
                {stat.sub != null && <span className="ml-1.5 text-[12px] font-medium text-ink-400">{stat.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* privacy */}
      <section className="flex items-start gap-3 rounded-2xl bg-ink-50 px-4 py-3.5">
        <FiLock size={15} className="mt-0.5 flex-none text-ink-500" />
        <p className="text-[12.5px] leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-800">Private to this workspace.</span> Brands, channels, posts, media and AI
          chats belong to this workspace and are invisible to every other account.
        </p>
      </section>
    </div>
  )
}

// ── Billing ───────────────────────────────────────────────────────────────
// The workspace's monthly AI credit (app/billing.py): what's left, where it
// went, and every recent spend. Costs are estimates of the providers' prices.
const KIND_ORDER = [
  { kind: 'video', label: 'Videos' },
  { kind: 'image', label: 'Images' },
  { kind: 'text', label: 'AI writing' },
]

function usageDetail(e) {
  if (e.kind === 'video' && e.seconds) return `${e.seconds}s clip`
  if (e.tokens) return `${e.tokens.toLocaleString()} tokens`
  return ''
}

// What an "AI writing" request was for — recognised from the start of the
// instruction it ran with (app/billing.py stores that as the note).
const WRITING_PURPOSE = [
  [/content strategist/i, 'Wrote post ideas'],
  [/fact-check/i, 'Fact-checked captions'],
  [/copy editor/i, 'Polished captions'],
  [/prompt for an image|prompt engineer/i, 'Wrote an image / video prompt'],
  [/marketing advisor/i, 'Answered a question'],
  [/social media editor/i, 'Suggested post improvements'],
  [/storyboard|creative director/i, 'Wrote a storyboard'],
]

function activityTitle(e) {
  const note = e.note || ''
  if (e.kind === 'text') return WRITING_PURPOSE.find(([re]) => re.test(note))?.[1] || 'AI writing'
  if (e.kind === 'image') return 'Image'
  if (e.kind === 'video') return `${/^Story scene/i.test(note) ? 'Storyboard scene' : 'Video'}${e.seconds ? ` · ${e.seconds}s` : ''}`
  return e.label || 'Credit added'
}

// A short hint of what an image / video showed: the prompt's first phrase
// (up to its first comma, colon or full stop), at most ~60 characters.
function activitySnippet(e) {
  if (e.kind !== 'image' && e.kind !== 'video') return ''
  const text = (e.note || '')
    .replace(/^(Video|Image|Story scene):\s*/i, '')
    .replace(/^SUBJECT\b[:\s]*/i, '')
    .replace(/[#*>_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const phrase = text.split(/[,:.;(—]/)[0].trim() || text
  if (phrase.length <= 60) return phrase.length < text.length ? `${phrase}…` : phrase
  return `${phrase.slice(0, 60).replace(/\s+\S*$/, '')}…`
}

const shortModel = (m) => (m || '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-generate(-preview)?$/, '')

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const ACTIVITY_ICON = {
  text: { icon: FiEdit3, tone: 'bg-sky-50 text-sky-600' },
  image: { icon: FiImage, tone: 'bg-violet-50 text-violet-600' },
  video: { icon: FiVideo, tone: 'bg-brand-soft text-brand' },
  grant: { icon: FiCreditCard, tone: 'bg-emerald-50 text-emerald-600' },
}

// A label, a thin bar and a figure on the right — one row of usage.
// tone: 'brand' (normal) | 'warn' (running low) | 'danger' (used up)
function UsageBar({ label, pct, right, tone = 'brand' }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-4 py-2">
      <span className="truncate text-[13px] text-ink-800">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-500 ${
            tone === 'danger' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="min-w-[3.5rem] text-right text-[12.5px] tabular-nums text-ink-600">{right}</span>
    </div>
  )
}

function BillingTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loadedAt, setLoadedAt] = useState(null)

  const load = () =>
    api
      .get('/billing')
      .then((d) => {
        setData(d)
        setError('')
        setLoadedAt(new Date())
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  if (!data) {
    return error ? (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700">Couldn’t load billing — {error}</div>
    ) : (
      <div className="space-y-3">
        <div className="h-16 rounded-xl skeleton" />
        <div className="h-32 rounded-xl skeleton" />
      </div>
    )
  }

  const credit = data.monthly_credit || 0
  const left = Math.max(0, data.available)
  const usedPct = credit > 0 ? Math.round(((credit - left) / credit) * 100) : 0
  const tone = left <= 0 ? 'danger' : usedPct >= 80 ? 'warn' : 'brand'
  const toneText = { danger: 'text-red-600', warn: 'text-amber-600', brand: 'text-brand' }[tone]
  const reset = new Date(data.resets_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const byKind = Object.fromEntries(data.breakdown.map((b) => [b.kind, b]))
  const totalSpent = data.breakdown.reduce((sum, b) => sum + Math.max(0, b.amount), 0)

  return (
    <div className="space-y-7">
      {/* this month */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-bold text-ink-900">Monthly AI credit</h3>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand">
            {data.plan_label} plan
          </span>
        </div>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-ink-600">
          <span className={`text-[22px] font-bold tabular-nums tracking-tight ${toneText}`}>
            {fmtUSD(left)}
          </span>
          <span>left of {fmtUSD(credit)}</span>
          <span className="text-ink-300">·</span>
          <span className="text-[15px] font-bold tabular-nums text-ink-900">{fmtUSD(data.spent)}</span>
          <span>used this month</span>
        </p>
        <p className="mt-0.5 text-[12px] text-ink-500">
          Refills on {reset}. AI pauses at $0 — posting and scheduling keep working.
          {data.pending > 0 ? ` ${fmtUSD(data.pending)} is held for renders in progress.` : ''}
        </p>
        <div className="mt-2">
          <UsageBar label="Credit used" pct={usedPct} right={`${usedPct}%`} tone={tone} />
        </div>
      </section>

      {/* by type */}
      <section>
        <h3 className="text-[15px] font-bold text-ink-900">This month’s usage by type</h3>
        <div className="mt-2">
          {KIND_ORDER.map(({ kind, label }) => {
            const b = byKind[kind]
            const share = totalSpent > 0 && b ? Math.round((b.amount / totalSpent) * 100) : 0
            return <UsageBar key={kind} label={label} pct={share} right={`${share}%`} />
          })}
        </div>
      </section>

      {/* recent spends */}
      <section>
        <h3 className="text-[15px] font-bold text-ink-900">Recent activity</h3>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ink-500">No AI used yet this month.</p>
        ) : (
          <div className="mt-1">
            {data.recent.map((e, i) => {
              const day = dayLabel(e.created_at)
              const newDay = i === 0 || dayLabel(data.recent[i - 1].created_at) !== day
              const meta = [
                new Date(e.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                shortModel(e.model),
                e.kind === 'video' ? '' : usageDetail(e),
                e.user,
              ]
                .filter(Boolean)
                .join(' · ')
              const snippet = activitySnippet(e)
              const { icon: Icon, tone } = ACTIVITY_ICON[e.kind] || ACTIVITY_ICON.text
              return (
                <div key={e.id}>
                  {newDay && (
                    <div className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{day}</div>
                  )}
                  <div className="flex items-start gap-3 border-b border-ink-100 py-2.5 last:border-0">
                    <span className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg ${tone}`}>
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-ink-800">{activityTitle(e)}</span>
                        <span
                          className={`flex-none text-[13px] font-semibold tabular-nums ${e.amount < 0 ? 'text-emerald-600' : 'text-ink-800'}`}
                        >
                          {e.amount < 0 ? `+${fmtUSD(-e.amount)}` : `−${fmtUSD(e.amount)}`}
                        </span>
                      </div>
                      {snippet && <div className="mt-0.5 truncate text-[12px] text-ink-500">{snippet}</div>}
                      <div className="mt-0.5 truncate text-[11px] text-ink-400">{meta}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="space-y-2 text-[12px] text-ink-500">
        <div className="flex items-center gap-2">
          Last updated: {loadedAt ? loadedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
          <button type="button" onClick={load} className="rounded p-1 text-ink-500 hover:text-ink-900" title="Refresh" aria-label="Refresh">
            <FiRefreshCw size={13} />
          </button>
        </div>
        <p>
          Costs are estimates from each AI provider’s prices (tokens for writing and images, seconds for video), so they can
          differ slightly from the final bill. Unused credit doesn’t roll over.
        </p>
      </div>
    </div>
  )
}

// ── Team ──────────────────────────────────────────────────────────────────
function TeamTab({ showToast }) {
  const { user } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [members, setMembers] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.get('/auth/members').then(setMembers).catch(() => setMembers([]))
  }, [])

  const update = async (m, patch) => {
    try {
      const next = await api.patch(`/auth/members/${m.id}`, patch)
      setMembers((list) => list.map((x) => (x.id === m.id ? next : x)))
      showToast('Member updated')
    } catch (e) {
      showToast(e.message)
    }
  }

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name} from the workspace? They won’t be able to sign in.`)) return
    try {
      await api.del(`/auth/members/${m.id}`)
      setMembers((list) => list.filter((x) => x.id !== m.id))
      showToast(`${m.name} removed`)
    } catch (e) {
      showToast(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title="People in this workspace"
          sub={canManage ? 'Add teammates and choose what they can do.' : 'Only an owner or admin can manage the team.'}
        />
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary flex-none">
            <FiUserPlus size={14} /> Add member
          </button>
        )}
      </div>

      {adding && (
        <AddMember
          onCancel={() => setAdding(false)}
          onAdded={(m) => {
            setMembers((list) => [...(list || []), m])
            setAdding(false)
            showToast(`${m.name} added — login details copied, share them with ${m.name.split(' ')[0]}`)
          }}
          showToast={showToast}
        />
      )}

      <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200">
        {members === null
          ? [0, 1].map((n) => (
              <div key={n} className="p-4">
                <div className="h-8 rounded-lg skeleton" />
              </div>
            ))
          : members.map((m) => {
              const isMe = m.id === user?.id
              const locked = !canManage || isMe || m.role === 'owner'
              return (
                <div key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${m.is_active ? '' : 'opacity-60'}`}>
                  <span className="h-9 w-9 flex-none rounded-full grid place-items-center bg-brand-soft text-brand text-[12px] font-bold">
                    {m.initials}
                  </span>
                  <div className="min-w-0 flex-1 basis-[150px]">
                    <div className="truncate text-[13px] font-semibold text-ink-900">
                      {m.name}
                      {isMe && <span className="ml-1.5 text-[11px] font-medium text-ink-400">(you)</span>}
                      {!m.is_active && <span className="ml-1.5 text-[11px] font-medium text-amber-600">Deactivated</span>}
                    </div>
                    <div className="truncate text-[12px] text-ink-500">{m.email || 'No email'}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                  {locked ? (
                    <span className="text-[12px] font-medium text-ink-500" title={ROLE_HINT[m.role]}>
                      {ROLE_LABEL[m.role] || m.role}
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => update(m, { role: e.target.value })}
                      title={ROLE_HINT[m.role]}
                      className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-[12px] font-medium text-ink-700 focus:outline-none focus:border-brand"
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                    </select>
                  )}
                  {!locked && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => update(m, { is_active: !m.is_active })}
                        className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-ink-600 hover:bg-ink-100"
                      >
                        {m.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        title="Remove"
                        aria-label={`Remove ${m.name}`}
                        className="h-8 w-8 rounded-lg grid place-items-center text-ink-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  )}
                  </div>
                </div>
              )
            })}
      </div>

      <ul className="space-y-1 text-[11.5px] text-ink-500">
        {Object.entries(ROLE_HINT).map(([role, hint]) => (
          <li key={role}>
            <b className="text-ink-700">{ROLE_LABEL[role]}</b> — {hint}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddMember({ onCancel, onAdded, showToast }) {
  const suggest = () =>
    `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.floor(10 + Math.random() * 89)}`
  const [form, setForm] = useState(() => ({ name: '', email: '', role: 'editor', password: suggest() }))
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const ready = form.name.trim() && form.email.includes('@') && form.password.length >= 8

  const save = async () => {
    setSaving(true)
    try {
      const m = await api.post('/auth/members', { ...form, name: form.name.trim(), email: form.email.trim() })
      try {
        await navigator.clipboard.writeText(
          `ContentFlow login\n${window.location.origin}\nEmail: ${m.email}\nTemporary password: ${form.password}`,
        )
      } catch {
        /* clipboard is a nicety */
      }
      onAdded(m)
    } catch (e) {
      showToast(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-soft/30 p-4 space-y-3 animate-fadein">
      <div className="grid gap-3 sm:grid-cols-2">
        <input autoFocus placeholder="Full name" value={form.name} onChange={set('name')} className={input} />
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className={input} />
        <select value={form.role} onChange={set('role')} className={input}>
          <option value="editor">Editor — creates & publishes</option>
          <option value="admin">Admin — also manages the team</option>
        </select>
        <input value={form.password} onChange={set('password')} className={`${input} font-mono`} aria-label="Temporary password" />
      </div>
      <p className="text-[11.5px] text-ink-500">
        They sign in with this email and temporary password — both are copied for you when you add them — then change
        the password under Settings → Security.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!ready || saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Adding…' : 'Add member'}
        </button>
      </div>
    </div>
  )
}

// ── small pieces ──────────────────────────────────────────────────────────
function ToggleRow({ title, desc, on, onChange, disabled = false }) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink-800">{title}</div>
        {desc && <div className="text-[11.5px] text-ink-500">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink-300'}`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
            on ? 'translate-x-[16px]' : ''
          }`}
        />
      </button>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <label className="grid gap-1.5 sm:grid-cols-[170px_1fr] sm:items-center sm:gap-4">
      <span className="text-[12.5px] font-medium text-ink-700">{label}</span>
      <span>
        {children}
        {hint && <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>}
      </span>
    </label>
  )
}

function SectionTitle({ title, sub }) {
  return (
    <div>
      <div className="text-[13.5px] font-semibold text-ink-900">{title}</div>
      {sub && <div className="text-[12px] text-ink-500">{sub}</div>}
    </div>
  )
}

function SaveBar({ dirty, saving, onSave, onReset }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-ink-100 pt-4">
      {dirty && (
        <button type="button" onClick={onReset} className="btn-ghost">
          Cancel
        </button>
      )}
      <button type="button" onClick={onSave} disabled={!dirty || saving} className="btn-primary disabled:opacity-50">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}
