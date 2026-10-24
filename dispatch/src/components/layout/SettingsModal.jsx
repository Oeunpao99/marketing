import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiAlertTriangle,
  FiCamera,
  FiGrid,
  FiSend,
  FiArchive,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiGift,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiCompass,
  FiCreditCard,
  FiDroplet,
  FiVideo,
  FiImage,
  FiEdit3,
  FiCopy,
  FiLink,
  FiLock,
  FiLogOut,
  FiMap,
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
import { ACCENTS, applyAccent, applyTheme, DEFAULT_ACCENT, normalizeAccent, THEMES } from '../../lib/theme'
import { promptInstall, useInstallState } from '../../lib/pwa'
import { APP_VERSION, applyUpdate, latestVersion } from '../../lib/update'
import { openTour } from '../../lib/tour'
import { TZ } from '../../lib/tz'
import Select from '../ui/Select'
import DateRangePicker from '../ui/DateRangePicker'
import HowItWorks from './HowItWorks'
import { fmtCredits } from '../../lib/money'
import CreditCoin from './CreditCoin'
import { CreditReceipt, fmtAccount, SendingAnimation } from './CreditReceipt'
import { claimCredits } from '../../lib/credits'
import ModelLogo from '../ui/ModelLogo'
import { useNavigate } from 'react-router-dom'

// Settings — every control here is real and saves to the backend
// (app/auth.py): profile, password, workspace name, and the team (add people
// with a temporary password, change roles, deactivate, remove). Workspace and
// Team edits are owner/admin only; editors see them read-only.

const TABS = [
  { id: 'guide', label: 'How it works', icon: FiMap },
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
      <div className="fixed inset-0 bg-night-950/50" onClick={onClose} />
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
            {tab === 'guide' && <HowItWorks onClose={onClose} />}
            {tab === 'profile' && <ProfileTab showToast={showToast} onClose={onClose} />}
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
function ProfileTab({ showToast, onClose }) {
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
        <Select
          size="lg"
          value={form.timezone}
          onChange={(timezone) => setForm((f) => ({ ...f, timezone }))}
          options={[...new Set([form.timezone, ...TIMEZONES])].map((tz) => ({ value: tz }))}
        />
      </Row>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(initial)} />

      <section className="space-y-2.5 border-t border-ink-100 pt-6">
        <SectionTitle
          title="Help"
          sub="New here, or want the five-minute version of what each part does?"
        />
        <button
          type="button"
          // The tour is its own overlay — get this modal out of the way first.
          onClick={() => {
            onClose()
            openTour()
          }}
          className="btn-outline"
        >
          <FiCompass size={15} />
          Take the tour again
        </button>
      </section>
    </div>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────
// A tiny picture of the app in each theme (System = half light, half dark).
function ThemePreview({ kind }) {
  const pane = (dark) => (
    <div className={`flex h-full flex-1 gap-1 p-1.5 ${dark ? 'bg-[#0E1115]' : 'bg-[#F4F6F9]'}`}>
      <div className={`w-3 rounded-sm ${dark ? 'bg-[#181C23]' : 'bg-white'}`} />
      <div className="flex flex-1 flex-col gap-1">
        <div className={`h-2 w-2/3 rounded-sm ${dark ? 'bg-[#2D333D]' : 'bg-[#D8DBDF]'}`} />
        <div className={`flex-1 rounded-sm ${dark ? 'bg-[#181C23]' : 'bg-white'}`}>
          <div className="m-1 h-1.5 w-1/2 rounded-sm bg-brand" />
        </div>
      </div>
    </div>
  )
  return (
    <div className="flex h-16 overflow-hidden rounded-lg ring-1 ring-ink-200">
      {kind === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(kind === 'dark')
      )}
    </div>
  )
}

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

  const theme = prefs.theme || 'light'
  const pickTheme = (id) => {
    applyTheme(id) // instant; saving re-applies it on every device you sign in on
    save({ theme: id }, `${THEMES.find((t) => t.id === id)?.label} theme`)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle title="Theme" sub="Light, dark, or follow your device's setting." />
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const on = t.id === theme
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTheme(t.id)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  on ? 'border-brand ring-4 ring-brand/10' : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <ThemePreview kind={t.id} />
                <span className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-800">
                  {on && <FiCheck size={13} className="text-brand" />}
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

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
        <div className="text-[13px] font-semibold text-ink-900">Marketing ឆ្លាតវៃ app</div>
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
            <li>3. Tap <b>Add</b> — Marketing ឆ្លាតវៃ appears with your other apps.</li>
          </ol>
        )}
        {state === 'unsupported' && (
          <div className="text-[12px] text-ink-500">
            Open Marketing ឆ្លាតវៃ in Chrome, Edge or Safari on your phone, then use <b>Install app</b> / <b>Add to Home Screen</b>{' '}
            from the browser menu.
          </div>
        )}
      </div>
      {state === 'available' && (
        <button
          type="button"
          onClick={async () => {
            const r = await promptInstall()
            if (r === 'accepted') showToast('Installed — find Marketing ឆ្លាតវៃ on your home screen')
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
  const setKind = (id, v) =>
    updatePrefs({ notify: { ...notify, [id]: v } }).catch((e) => showToast(`Couldn’t save — ${e.message}`))
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
    'On iPhone, add Marketing ឆ្លាតវៃ to your Home Screen first (Share → Add to Home Screen), open it from there, then turn this on.',
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
        sub="Alerts on your phone’s lock screen or your computer — even when Marketing ឆ្លាតវៃ is closed."
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

      <AiModelSection canManage={canManage} showToast={showToast} />

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

// ── AI model ──────────────────────────────────────────────────────────────
// Which AI writes for this workspace (backend app/ai_models.py): the models the
// platform lets it use, each with what 1M tokens costs its credit; the default
// (owner / admin); and the last 30 days of AI writing by model and person.
function AiModelSection({ canManage, showToast }) {
  const [data, setData] = useState(null)
  const [usage, setUsage] = useState(null)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    api.get('/ai-models').then(setData).catch(() => setData(null))
    api.get('/ai-models/usage?days=30').then(setUsage).catch(() => setUsage(null))
  }, [])

  if (!data || !data.models?.length) return null
  const current = data.default || ''
  const pick = async (key) => {
    if (!canManage || key === current) return
    setSaving(key || 'default')
    try {
      const r = await api.put('/ai-models/default', { model: key })
      setData({ ...data, default: r.default })
      showToast('Default AI model saved')
    } catch (e) {
      showToast(`Couldn’t save — ${e.message}`)
    } finally {
      setSaving('')
    }
  }
  const platform = data.models.find((m) => m.key === data.platform_default)
  const options = [{ key: '', label: 'Platform default', blurb: platform ? `Currently ${platform.label}` : 'Chosen by Marketing ឆ្លាតវៃ', tier: '' }, ...data.models]
  const rows = (usage?.rows || []).slice().sort((a, b) => b.charged - a.charged)
  const label = (k) => data.models.find((m) => m.key === k)?.label || k || 'Other'

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink-900">AI model</h3>
      <p className="mt-0.5 text-[12px] text-ink-500">
        The AI that writes your captions, ideas and video stories.{' '}
        {canManage ? 'Everyone can still pick another in the composer’s settings.' : 'Only an owner or admin can change the default.'}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((m) => {
          const on = m.key === current
          return (
            <button
              key={m.key || 'default'}
              type="button"
              disabled={!canManage || saving !== ''}
              onClick={() => pick(m.key)}
              className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                on ? 'border-brand bg-brand-soft' : 'border-ink-200 hover:border-ink-300'
              } ${!canManage ? 'cursor-default' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                  {m.key && <ModelLogo model={m.key} vendor={m.vendor} />}
                  {m.label}
                </span>
                <span className="text-[11px] font-bold text-ink-400">{saving === (m.key || 'default') ? 'Saving…' : on ? 'Default' : m.tier}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-500">{m.blurb}</div>
              {m.key && (
                <div className="mt-1 text-[11px] tabular-nums text-ink-400">
                  ≈ {fmtCredits((2000 * m.price_in + 700 * m.price_out) / 1_000_000)} per caption
                </div>
              )}
            </button>
          )
        })}
      </div>
      {rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200">
          <div className="bg-ink-50 px-3.5 py-2 text-[11.5px] font-semibold text-ink-600">Last 30 days · AI writing by model</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-ink-400">
                <th className="px-3.5 py-1.5 font-medium">Who</th>
                <th className="px-2 py-1.5 font-medium">Model</th>
                <th className="px-2 py-1.5 text-right font-medium">Calls</th>
                <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
                <th className="px-3.5 py-1.5 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r, i) => (
                <tr key={i} className="text-ink-700">
                  <td className="px-3.5 py-1.5">{r.user}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <ModelLogo model={r.model} size={13} />
                      {label(r.model)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.calls}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.tokens.toLocaleString()}</td>
                  <td className="px-3.5 py-1.5 text-right tabular-nums">{fmtCredits(r.charged, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  if (e.kind === 'transfer_in' || e.kind === 'transfer_out') return e.note || ''
  if (e.kind !== 'image' && e.kind !== 'video') return ''
  const text = (e.note || '')
    .replace(/^(Video|Image|Story scene):\s*/i, '')
    .replace(/^SUBJECT\b[:\s]*/i, '')
    .replace(/[#*>_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Auto-generated media briefs open with boilerplate ("An 8-second, vertical
  // 9:16…", "Create a photorealistic…"); their "Post topic:" line says more.
  const topic = text.match(/Post topic:\s*([^.]+)/i)?.[1]?.trim()
  if (topic) return topic.length <= 60 ? topic : `${topic.slice(0, 60).replace(/\s+\S*$/, '')}…`
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
  // credits in — a claim or credit added
  added: { icon: FiGift, tone: 'bg-emerald-50 text-emerald-600' },
  transfer_in: { icon: FiUserPlus, tone: 'bg-emerald-50 text-emerald-600' },
  transfer_out: { icon: FiSend, tone: 'bg-red-50 text-red-600' },
}


/** A Receive QR's text → the account number in it ("…?transfer=1400307275" or the bare digits). */
function accountFromQr(text) {
  const t = String(text || '')
  const m = t.match(/[?&]transfer=(\d{10})(?!\d)/) || t.replace(/[\s-]/g, '').match(/^(\d{10})$/)
  return m ? m[1] : ''
}

/**
 * Billing → Transfer → Scan: the phone's back camera reads a Receive QR
 * (jsQR on video frames — works in iPhone Safari and Android Chrome; needs
 * https and the camera permission). Calls onFound(accountNo) once.
 */
function QrScanner({ onFound, onClose }) {
  const video = useRef(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stream = null
    let timer = null
    let done = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    Promise.all([
      navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        : Promise.reject(new Error('no camera')),
      import('jsqr'),
    ])
      .then(([s, mod]) => {
        stream = s
        if (done) return s.getTracks().forEach((t) => t.stop())
        const jsQR = mod.default
        const v = video.current
        v.srcObject = s
        v.play().catch(() => {})
        const tick = () => {
          if (done) return
          if (v.readyState >= 2 && v.videoWidth) {
            // a centred square, scaled down — fast enough on any phone
            const side = Math.min(v.videoWidth, v.videoHeight)
            const size = Math.min(side, 640)
            canvas.width = canvas.height = size
            ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size)
            const code = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' })
            const no = code && accountFromQr(code.data)
            if (no) {
              done = true
              navigator.vibrate?.(60)
              onFound(no)
              return
            }
            if (code) setErr('That QR isn’t a Smart Marketing account.')
          }
          timer = setTimeout(tick, 200)
        }
        tick()
      })
      .catch(() => setErr('Can’t open the camera — allow camera access, or type the account ID.'))
    return () => {
      done = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onFound])
  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-night-900">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {/* the aiming frame */}
        <div
          className="pointer-events-none absolute inset-[14%] rounded-2xl"
          style={{ border: '3px solid rgba(255, 255, 255, 0.95)', boxShadow: '0 0 0 999px rgba(0, 0, 0, 0.35)' }}
        />
      </div>
      <p className={`text-center text-[12px] ${err ? 'text-red-600' : 'text-ink-500'}`}>{err || 'Point the camera at your friend’s Receive QR.'}</p>
      <button type="button" onClick={onClose} className="btn-outline h-10 w-full rounded-xl">
        Type the account ID instead
      </button>
    </div>
  )
}

/**
 * Billing → Receive: this account's QR code, like a bank's "receive money" QR.
 * It holds a link (…/?transfer=<account ID>) — any phone camera opens it, and
 * the app starts a transfer to this account with the number filled in.
 */
/**
 * A small pop-up for Billing's money moments (Transfer, Receive, PIN), like a
 * bank app: a phone-width card in the middle of the screen (phones too).
 * Plain dim backdrop, solid panel, above Settings.
 */
function Sheet({ id, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/55" onClick={onClose} />
      <section
        id={id}
        role="dialog"
        aria-modal="true"
        className="cf-pop-in relative max-h-[90vh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl"
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}

function ReceivePanel({ accountNo, onClose }) {
  const { user } = useAuth()
  const [svg, setSvg] = useState('')
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/?transfer=${accountNo}`
  useEffect(() => {
    let live = true
    import('qrcode')
      .then((QR) => QR.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } }))
      .then((s) => live && setSvg(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [link])
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Send me credits', text: `My Smart Marketing account ID: ${fmtAccount(accountNo)}`, url: link }).catch(() => {})
    else {
      navigator.clipboard?.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
          <FiGrid size={15} className="text-brand" /> Receive credits
        </h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Close">
          <FiX size={15} />
        </button>
      </div>
      <div className="mt-4 flex flex-col items-center text-center">
        {/* the code stays black on white in dark mode too, so every camera reads it */}
        <div className="rounded-2xl p-3 shadow-sm ring-1 ring-ink-200" style={{ background: 'rgb(255, 255, 255)' }}>
          {svg ? (
            <div className="h-52 w-52 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="h-52 w-52 rounded-xl skeleton" />
          )}
        </div>
        <div className="mt-3 text-[13.5px] font-semibold text-ink-900">{user?.workspace_name || user?.name}</div>
        <div className="text-[18px] font-bold tabular-nums tracking-wide text-ink-900">{fmtAccount(accountNo)}</div>
        <p className="mt-1 max-w-xs text-[12px] text-ink-500">Scan with a phone camera to send credits to this account.</p>
        <button type="button" onClick={share} className="btn-outline mt-3 h-10 rounded-xl px-5">
          {copied ? <FiCheck size={14} /> : navigator.share ? <FiSend size={14} /> : <FiLink size={14} />}
          {copied ? 'Link copied' : navigator.share ? 'Share' : 'Copy link'}
        </button>
      </div>
    </Sheet>
  )
}

/**
 * Billing → Transfer credits, like a bank transfer: the other account's ID →
 * whose it is (name, owner, plan) → how many credits (+ a note) → review →
 * receipt. Calls GET /billing/account/{id} and POST /billing/transfer.
 */
/**
 * A 6-digit PIN entry: six boxes (dots as you type) over one hidden number
 * input, so the phone shows its number pad and paste works.
 */
/** A "Credits sent" line → what to send again: { to, credits, note } (note: "To X · 630 772 4735 — thanks"). */
function sentAgain(e) {
  const m = /^To .* · (\d{3} \d{3} \d{4})(?: — ([\s\S]*))?$/.exec(e.note || '')
  if (!m) return null
  return { to: m[1].replace(/ /g, ''), credits: Math.round(Math.abs(e.credits || 0)), note: m[2] || '' }
}

function PinField({ value, onChange, autoFocus = false, onDone }) {
  const ref = useRef(null)
  return (
    <div className="relative mx-auto w-fit" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        autoFocus={autoFocus}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(v)
          if (v.length === 6) onDone?.(v)
        }}
        className="absolute inset-0 h-full w-full opacity-0"
        aria-label="6-digit PIN"
      />
      <div className="pointer-events-none flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`grid h-12 w-10 place-items-center rounded-xl border-2 text-[20px] ${
              i === value.length ? 'border-brand' : value.length > i ? 'border-ink-300' : 'border-ink-200'
            } bg-white`}
          >
            {value.length > i ? <span className="h-2.5 w-2.5 rounded-full bg-ink-900" /> : null}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Set or change the transfer PIN: new PIN twice, confirmed with the account
 * password (accounts without one — Google sign-in — confirm with the old PIN).
 */
function PinSetup({ info, onDone, onCancel }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [password, setPassword] = useState('')
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const mismatch = again.length === 6 && pin !== again
  const save = () => {
    setBusy(true)
    setErr('')
    api
      .post('/billing/pin', { pin, password, current_pin: current })
      .then(onDone)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-brand-soft p-3 text-[12.5px] text-ink-700">
        <FiLock size={16} className="mt-0.5 flex-none text-brand" />
        <span>
          {info?.set ? 'Choose a new 6-digit PIN.' : 'To keep your credits safe, set a 6-digit PIN.'} You’ll enter it every time you send credits.
        </span>
      </div>
      <div className="space-y-1.5 text-center">
        <div className="text-[12px] font-semibold text-ink-700">New PIN</div>
        <PinField value={pin} onChange={setPin} autoFocus />
      </div>
      <div className="space-y-1.5 text-center">
        <div className="text-[12px] font-semibold text-ink-700">Type it again</div>
        <PinField value={again} onChange={setAgain} />
        {mismatch && <p className="text-[12px] text-red-600">The two PINs don’t match.</p>}
      </div>
      {info?.needs_password ? (
        <label className="block text-[12px] font-semibold text-ink-700">
          Your account password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1.5" autoComplete="current-password" />
        </label>
      ) : info?.set ? (
        <div className="space-y-1.5 text-center">
          <div className="text-[12px] font-semibold text-ink-700">Current PIN</div>
          <PinField value={current} onChange={setCurrent} />
        </div>
      ) : null}
      {err && <p className="text-[12px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-outline h-10 flex-1 rounded-xl">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy || pin.length !== 6 || pin !== again || (info?.needs_password ? !password : info?.set && current.length !== 6)}
          className="btn-primary h-10 flex-1 rounded-xl disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save PIN'}
        </button>
      </div>
    </div>
  )
}

function TransferPanel({ available, initialNumber = '', initialCredits = 0, initialNote = '', onClose, onSent }) {
  const [step, setStep] = useState('to') // setpin | to | amount | review | pin | sending | done
  const [number, setNumber] = useState(initialNumber)
  const [who, setWho] = useState(null)
  const [amount, setAmount] = useState(initialCredits ? String(initialCredits) : '')
  const [note, setNote] = useState(initialNote)
  const [pinInfo, setPinInfo] = useState(null) // { set, needs_password }
  const [pin, setPin] = useState('')
  const [afterPin, setAfterPin] = useState('to') // where setting the PIN returns to
  // no PIN yet → set it up first
  useEffect(() => {
    api
      .get('/billing/pin')
      .then((p) => {
        setPinInfo(p)
        if (!p.set) setStep('setpin')
      })
      .catch(() => {})
  }, [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [scanning, setScanning] = useState(false)
  const found = useCallback((no) => {
    setNumber(no)
    setScanning(false)
  }, [])
  const digits = number.replace(/\D/g, '')
  const credits = parseInt(amount.replace(/\D/g, '') || '0', 10)
  const have = Math.floor(available)

  // the 10th digit typed → look the account up
  useEffect(() => {
    setWho(null)
    setErr('')
    if (digits.length !== 10) return
    let live = true
    setBusy(true)
    api
      .get(`/billing/account/${digits}`)
      .then((w) => live && setWho(w))
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [digits])

  // "Sending…" plays for at least a moment (a transfer that flashes by feels
  // unreal), then the receipt pops up over everything
  const send = (code = pin) => {
    setBusy(true)
    setErr('')
    setStep('sending')
    const minWait = new Promise((r) => setTimeout(r, 1400))
    Promise.all([api.post('/billing/transfer', { to: digits, credits, note, pin: code }), minWait])
      .then(([r]) => {
        setReceipt(r)
        setStep('done')
        onSent()
      })
      .catch((e) => {
        setErr(e.message)
        setPin('')
        // wrong / locked PIN → ask again; no PIN → set one; anything else → review
        if (e.status === 428) {
          setAfterPin('review')
          setStep('setpin')
        } else setStep(e.status === 403 || e.status === 423 ? 'pin' : 'review')
      })
      .finally(() => setBusy(false))
  }

  const amountErr = credits > have ? `You have ${have.toLocaleString('en-US')} credits.` : credits > 0 && credits < 10 ? 'Send at least 10 credits.' : ''
  const Recipient = () =>
    who ? (
      <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-canvas p-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand text-[13px] font-bold text-white">{who.initials}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink-900">{who.name}</div>
          <div className="truncate text-[11.5px] text-ink-500">
            {who.owner ? `${who.owner} · ` : ''}
            {who.plan_label} plan · {fmtAccount(who.account_no)}
          </div>
        </div>
        <FiCheck className="flex-none text-emerald-600" size={16} />
      </div>
    ) : null

  return (
    <Sheet id="cf-transfer" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
          {step === 'setpin' ? <FiLock size={15} className="text-brand" /> : <FiSend size={15} className="text-brand" />}
          {step === 'setpin' ? (pinInfo?.set ? 'Change transfer PIN' : 'Set up transfer PIN') : 'Transfer credits'}
        </h3>
        <div className="flex items-center gap-1">
          {pinInfo?.set && (step === 'to' || step === 'amount') && (
            <button
              type="button"
              onClick={() => {
                setAfterPin(step)
                setStep('setpin')
              }}
              className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            >
              Change PIN
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Close">
            <FiX size={15} />
          </button>
        </div>
      </div>

      {step === 'setpin' && (
        <PinSetup
          info={pinInfo}
          onDone={() => {
            setPinInfo((p) => ({ ...p, set: true }))
            setErr('')
            setStep(afterPin)
          }}
          onCancel={pinInfo?.set ? () => setStep(afterPin) : onClose}
        />
      )}

      {step === 'pin' && (
        <div className="mt-4 space-y-4 text-center">
          <div>
            <div className="text-[14px] font-bold text-ink-900">Enter your transfer PIN</div>
            <div className="text-[12px] text-ink-500">
              to send {credits.toLocaleString('en-US')} credits to {who?.name}
            </div>
          </div>
          <PinField value={pin} onChange={setPin} autoFocus onDone={(v) => send(v)} />
          {err && <p className="text-[12px] text-red-600">{err}</p>}
          <button type="button" onClick={() => setStep('review')} className="btn-outline h-10 w-full rounded-xl">
            Back
          </button>
        </div>
      )}

      {step === 'to' && scanning && (
        <div className="mt-4">
          <QrScanner onFound={found} onClose={() => setScanning(false)} />
        </div>
      )}

      {step === 'to' && !scanning && (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand-soft py-3 text-[13px] font-semibold text-brand hover:border-brand"
          >
            <FiCamera size={15} /> Scan QR code
          </button>
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <span className="h-px flex-1 bg-ink-200" /> or type it <span className="h-px flex-1 bg-ink-200" />
          </div>
          <label className="block text-[12px] font-semibold text-ink-700">
            Account ID
            <input
              autoFocus
              inputMode="numeric"
              value={fmtAccount(digits) || digits}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="000 000 0000"
              className="input mt-1.5 text-[16px] font-semibold tabular-nums tracking-wider"
            />
          </label>
          {busy && <div className="h-16 rounded-2xl skeleton" />}
          <Recipient />
          {err && <p className="text-[12px] text-red-600">{err}</p>}
          <button type="button" disabled={!who} onClick={() => setStep('amount')} className="btn-primary h-10 w-full rounded-xl disabled:opacity-40">
            Next
          </button>
        </div>
      )}

      {step === 'amount' && (
        <div className="mt-4 space-y-3">
          <Recipient />
          <label className="block text-[12px] font-semibold text-ink-700">
            Amount
            <div className="relative mt-1.5">
              <input
                autoFocus
                inputMode="numeric"
                value={credits ? credits.toLocaleString('en-US') : ''}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="input pr-20 text-[22px] font-bold tabular-nums"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-400">credits</span>
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[100, 500, 1000].filter((n) => n <= have).map((n) => (
              <button key={n} type="button" onClick={() => setAmount(String(n))} className="rounded-full border border-ink-200 px-3 py-1 text-[12px] font-semibold text-ink-700 hover:border-brand hover:text-brand">
                {n.toLocaleString('en-US')}
              </button>
            ))}
            <span className="ml-auto text-[11.5px] text-ink-500">Available {have.toLocaleString('en-US')}</span>
          </div>
          {amountErr && <p className="text-[12px] text-red-600">{amountErr}</p>}
          <label className="block text-[12px] font-semibold text-ink-700">
            Note <span className="font-normal text-ink-400">(optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="What it's for" className="input mt-1.5" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep('to')} className="btn-outline h-10 flex-1 rounded-xl">
              Back
            </button>
            <button type="button" disabled={credits < 10 || !!amountErr} onClick={() => setStep('review')} className="btn-primary h-10 flex-1 rounded-xl disabled:opacity-40">
              Review
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-canvas p-4 text-center">
            <div className="text-[12px] text-ink-500">You're sending</div>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="text-[30px] font-bold tabular-nums text-red-600">−{credits.toLocaleString('en-US')}</span>
              <span className="text-[17px] font-semibold text-ink-600">credits</span>
            </div>
          </div>
          <Recipient />
          <dl className="space-y-1.5 text-[12.5px]">
            {[
              ['Balance after', `${(have - credits).toLocaleString('en-US')} credits`],
              note && ['Note', note],
            ]
              .filter(Boolean)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="truncate font-semibold text-ink-900">{v}</dd>
                </div>
              ))}
          </dl>
          <p className="text-[11.5px] text-ink-500">Transfers can’t be undone. Credits received are used like your own and end with the month.</p>
          {err && <p className="text-[12px] text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep('amount')} className="btn-outline h-10 flex-1 rounded-xl">
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setErr('')
                setPin('')
                setStep('pin')
              }}
              className="btn-primary h-10 flex-1 rounded-xl disabled:opacity-50"
            >
              <FiLock size={13} /> Send {credits.toLocaleString('en-US')} credits
            </button>
          </div>
        </div>
      )}

      {step === 'sending' && <SendingAnimation credits={credits} />}

      {step === 'done' && receipt && (
        <CreditReceipt
          kind="sent"
          credits={receipt.sent}
          name={receipt.to?.name}
          owner={receipt.to?.owner}
          account={receipt.to?.account_no}
          note={receipt.note}
          at={receipt.at}
          refNo={receipt.ref}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

// White on the accent-coloured balance card — fixed, not the theme's "white"
// (bg-white turns dark in dark mode).
const ON_CARD = (alpha) => ({ background: `rgba(255, 255, 255, ${alpha})` })

/** The activity rows as days: [{ day: 'Today', date: '21 Oct', rows }], newest first. */
function groupByDay(rows) {
  const out = []
  for (const e of rows) {
    const day = dayLabel(e.created_at)
    if (!out.length || out[out.length - 1].day !== day) {
      const d = new Date(e.created_at)
      out.push({ day, date: day === 'Today' || day === 'Yesterday' ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '', rows: [] })
    }
    out[out.length - 1].rows.push(e)
  }
  return out
}

function BillingTab() {
  const { user } = useAuth()
  // a scanned Receive QR (/?transfer=…, see Sidebar) opens Transfer filled in
  const [scannedTo] = useState(() => {
    try {
      const to = sessionStorage.getItem('cf_transfer_to') || ''
      sessionStorage.removeItem('cf_transfer_to')
      return to
    } catch {
      return ''
    }
  })
  const [transferOpen, setTransferOpen] = useState(!!scannedTo)
  const [receiveOpen, setReceiveOpen] = useState(false)
  // "Send again" from a Credits sent line: { to, credits, note } fills Transfer in
  const [repeat, setRepeat] = useState(null)
  const repeatTransfer = (r) => {
    setRepeat({ ...r, key: Date.now() })
    setReceiveOpen(false)
    setTransferOpen(true)
  }
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate() // Upgrade / Renew → the /upgrade page (KHQR)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = () =>
    api
      .get('/billing')
      .then((d) => {
        setData(d)
        setRange(null) // a fresh load is page 1, unfiltered
        setFlow('')
        setError('')
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  // Recent activity, a page at a time (GET /billing/activity), filtered by days
  // (range: { from, to } "YYYY-MM-DD" or null) and credits in / out (flow).
  const [pageBusy, setPageBusy] = useState(false)
  const [range, setRange] = useState(null)
  const [flow, setFlow] = useState('')
  const goPage = (page, r = range, f = flow) => {
    setPageBusy(true)
    const q = new URLSearchParams({ page: String(page) })
    if (r) {
      q.set('start', r.from)
      if (r.to < '9999') q.set('end', r.to)
    }
    if (f) q.set('flow', f)
    api
      .get(`/billing/activity?${q}`)
      .then((p) => setData((d) => ({ ...d, ...p })))
      .catch(() => {})
      .finally(() => setPageBusy(false))
  }
  const pickRange = (r) => {
    setRange(r)
    goPage(1, r, flow)
  }
  const pickFlow = (f) => {
    setFlow(f)
    goPage(1, range, f)
  }
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const clearOld = () => {
    if (!window.confirm(`Hide credit activity older than ${Math.round((data.recent_keep_days || 90) / 30)} months? Your balance doesn’t change.`)) return
    setPageBusy(true)
    api
      .post('/billing/activity/clear-old')
      .then((p) => {
        setRange(null)
        setFlow('')
        setData((d) => ({ ...d, ...p }))
      })
      .catch((e) => setError(e.message))
      .finally(() => setPageBusy(false))
  }

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
  const reset = new Date(data.resets_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const byKind = Object.fromEntries(data.breakdown.map((b) => [b.kind, b]))
  const totalSpent = data.breakdown.reduce((sum, b) => sum + Math.max(0, b.amount), 0)

  return (
    <div className="space-y-7">
      {/* this month's credits wait to be claimed */}
      {data.claim_available && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-4">
          <CreditCoin size={34} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink-900">Your monthly credits are ready</div>
            <div className="text-[12.5px] text-ink-600">{(data.claim_credits ?? data.monthly_credits ?? 0).toLocaleString('en-US')} credits for this month — claim them to use AI.</div>
          </div>
          <button
            type="button"
            onClick={() => claimCredits().then(load).catch((e) => setError(e.message))}
            className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-dark"
          >
            Claim {(data.claim_credits ?? data.monthly_credits ?? 0).toLocaleString('en-US')} credits
          </button>
        </section>
      )}

      {/* the plan: until when it's paid, and Upgrade / Renew (the /upgrade page — KHQR) */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink-900">{data.plan_label} plan</div>
          <div className="text-[12px] text-ink-500">
            {data.plan_paid_until
              ? `Paid until ${new Date(data.plan_paid_until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} — then back to Free unless you renew`
              : `${(data.monthly_credits ?? 0).toLocaleString('en-US')} AI credits a month`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            // the plans have their own page (/upgrade): Settings closes, the page opens
            window.dispatchEvent(new Event('dispatch:close-settings'))
            navigate('/upgrade')
          }}
          className="btn-primary h-9 px-4 text-[12.5px]"
        >
          {data.plan_paid_until ? 'Renew or change' : 'Upgrade'}
        </button>
      </section>

      {/* the balance, like a bank card: one big number, the rest small */}
      <section className="relative overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-sm">
        <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full" style={ON_CARD(0.1)} />
        <span className="pointer-events-none absolute -bottom-16 right-16 h-36 w-36 rounded-full" style={ON_CARD(0.1)} />
        <div className="relative flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium text-white/80">Available credits</span>
          <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={ON_CARD(0.2)}>{data.plan_label} plan</span>
        </div>
        <div className="relative mt-1 flex items-center gap-2">
          <span className="grid place-items-center rounded-full p-0.5" style={ON_CARD(1)}>
            <CreditCoin size={26} sparkle sparkleClass="text-white" />
          </span>
          <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight">{fmtCredits(left, false)}</span>
          {tone !== 'brand' && (
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold text-red-600" style={ON_CARD(1)}>{left <= 0 ? 'Empty' : 'Low'}</span>
          )}
        </div>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full" style={ON_CARD(0.25)}>
          <div className="h-full rounded-full" style={{ ...ON_CARD(1), width: `${Math.max(0, 100 - usedPct)}%` }} />
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/75">
          <div>
            Monthly
            <div className="text-[14px] font-bold tabular-nums text-white">{fmtCredits(credit, false)}</div>
          </div>
          <div>
            Used
            <div className="text-[14px] font-bold tabular-nums text-white">{fmtCredits(data.spent, false)}</div>
          </div>
          <div className="text-right">
            Next claim
            <div className="text-[14px] font-bold text-white">{reset}</div>
          </div>
        </div>
        {/* the account's number (to receive credits) and Transfer */}
        <div className="relative mt-4 flex flex-wrap items-center gap-x-2 gap-y-3 border-t pt-3" style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}>
          <div className="flex-none whitespace-nowrap text-[11px] text-white/75">
            Account ID
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(data.account_no || '')
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="flex items-center gap-1.5 text-[14px] font-bold tabular-nums tracking-wide text-white"
              title="Copy"
            >
              {fmtAccount(data.account_no)}
              {copied ? <FiCheck size={12} /> : <FiCopy size={12} className="opacity-70" />}
            </button>
          </div>
          <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => {
              setReceiveOpen((v) => !v)
              setTransferOpen(false)
            }}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold text-white ring-1 ring-inset ring-white/40 hover:opacity-90"
            style={ON_CARD(0.18)}
            title="Your QR code — scan it to send credits here"
            aria-label="Receive credits — show your QR code"
          >
            <FiGrid size={13} /> Receive
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setTransferOpen(true)
                setReceiveOpen(false)
              }}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold text-white ring-1 ring-inset ring-white/40 hover:opacity-90"
              style={ON_CARD(0.18)}
            >
              <FiSend size={13} /> Transfer
            </button>
          )}
          </div>
        </div>
      </section>
      {data.pending > 0 && (
        <p className="-mt-5 text-[12px] text-ink-500">{fmtCredits(data.pending)} are held for renders in progress.</p>
      )}
      {transferOpen && (
        <TransferPanel
          key={repeat?.key || 'new'}
          available={data.available_credits ?? 0}
          initialNumber={repeat?.to || scannedTo}
          initialCredits={repeat?.credits || 0}
          initialNote={repeat?.note || ''}
          onClose={() => {
            setTransferOpen(false)
            setRepeat(null)
          }}
          onSent={load}
        />
      )}
      {receiveOpen && <ReceivePanel accountNo={data.account_no} onClose={() => setReceiveOpen(false)} />}

      {/* by type — three small cards */}
      <section>
        <h3 className="text-[15px] font-bold text-ink-900">Used this month</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {KIND_ORDER.map(({ kind, label }) => {
            const b = byKind[kind]
            const used = b ? Math.max(0, b.amount) : 0
            const share = totalSpent > 0 ? Math.round((used / totalSpent) * 100) : 0
            const { icon: Icon, tone: iconTone } = ACTIVITY_ICON[kind]
            return (
              <div key={kind} className="rounded-2xl border border-ink-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${iconTone}`}>
                    <Icon size={14} />
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-ink-400">{share}%</span>
                </div>
                <div className="mt-2 text-[18px] font-bold leading-tight tabular-nums text-ink-900">{fmtCredits(used, false)}</div>
                <div className="text-[11.5px] text-ink-500">{label}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* recent spends */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-[15px] font-bold text-ink-900">
            Recent activity
            <button type="button" onClick={load} className="rounded p-1 text-ink-400 hover:text-ink-900" title="Refresh" aria-label="Refresh">
              <FiRefreshCw size={13} />
            </button>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-ink-100 p-0.5 text-[12px] font-semibold">
              {[
                ['', 'All'],
                ['in', 'In'],
                ['out', 'Out'],
              ].map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => pickFlow(f)}
                  className={`rounded-lg px-3 py-1.5 ${flow === f ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-200 dark:ring-1 dark:ring-inset dark:ring-ink-300' : 'text-ink-500 hover:text-ink-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <DateRangePicker value={range} onChange={pickRange} align="right" unit={null} />
          </div>
        </div>

        {/* a long list → suggest hiding what's past 3 months */}
        {data.recent_older > 0 && canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-canvas px-4 py-3">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white text-ink-500">
              <FiArchive size={14} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] text-ink-600">
              <span className="font-semibold text-ink-900">{data.recent_older.toLocaleString('en-US')} records are older than 3 months.</span>{' '}
              Clear them to keep this list short — your balance stays the same.
            </div>
            <button
              type="button"
              onClick={clearOld}
              disabled={pageBusy}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
            >
              Clear older history
            </button>
          </div>
        )}

        {data.recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-[12.5px] text-ink-500">
            {range || flow ? 'Nothing in these dates.' : 'No AI used yet this month.'}
          </p>
        ) : (
          // like a bank statement: a card per day (its net on the right), money in
          // green "+", money out red "−", the amount big with "credits" under it
          <div className="mt-3 space-y-4">
            {groupByDay(data.recent).map(({ day, date, rows }) => {
              const net = rows.reduce((sum, e) => sum - e.amount, 0) // e.amount: + spent, − added
              return (
                <div key={day} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
                  <div className="flex items-center justify-between bg-canvas px-4 py-2.5">
                    <span className="text-[12px] font-semibold text-ink-700">
                      {day}
                      {date && <span className="font-normal text-ink-400"> · {date}</span>}
                    </span>
                    <span className={`text-[12px] font-semibold tabular-nums ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {net >= 0 ? '+' : '−'}
                      {fmtCredits(Math.abs(net))}
                    </span>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {rows.map((e) => {
                      const added = e.amount < 0
                      const meta = [
                        new Date(e.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                        shortModel(e.model),
                        e.kind === 'video' ? '' : usageDetail(e),
                        e.user,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      const snippet = activitySnippet(e)
                      const { icon: Icon, tone } = e.kind?.startsWith('transfer')
                        ? ACTIVITY_ICON[e.kind]
                        : added
                          ? ACTIVITY_ICON.added
                          : ACTIVITY_ICON[e.kind] || ACTIVITY_ICON.text
                      // credits sent → tap the line to send the same again
                      const again = canManage && e.kind === 'transfer_out' ? sentAgain(e) : null
                      return (
                        <div
                          key={e.id}
                          className={`flex items-center gap-3 px-4 py-3 ${again ? 'cursor-pointer transition-colors hover:bg-canvas' : ''}`}
                          {...(again && {
                            role: 'button',
                            tabIndex: 0,
                            title: 'Send again',
                            onClick: () => repeatTransfer(again),
                            onKeyDown: (ev) => ev.key === 'Enter' && repeatTransfer(again),
                          })}
                        >
                          <span className={`relative grid h-10 w-10 flex-none place-items-center rounded-full ${tone}`}>
                            <Icon size={16} />
                            {/* the direction, like a bank app: in ↙ green, out ↗ red */}
                            <span className={`absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-white ${added ? 'bg-emerald-500' : 'bg-red-500'} text-white`}>
                              {added ? <FiArrowDownLeft size={10} strokeWidth={3} /> : <FiArrowUpRight size={10} strokeWidth={3} />}
                            </span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-semibold text-ink-900">{activityTitle(e)}</div>
                            {snippet && <div className="truncate text-[12px] text-ink-500">{snippet}</div>}
                            <div className="truncate text-[11px] text-ink-400">{meta}</div>
                          </div>
                          <div className="flex-none text-right">
                            <div className={`text-[15px] font-bold tabular-nums ${added ? 'text-emerald-600' : 'text-red-600'}`}>
                              {added ? '+' : '−'}
                              {fmtCredits(Math.abs(e.amount), false)}
                            </div>
                            {again ? (
                              <div className="flex items-center justify-end gap-1 text-[10.5px] font-semibold text-brand">
                                <FiRefreshCw size={10} /> Send again
                              </div>
                            ) : (
                              <div className="text-[10.5px] text-ink-400">credits</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {data.recent_pages > 1 && (
          <div className={`mt-3 flex items-center justify-between gap-3 ${pageBusy ? 'opacity-60' : ''}`}>
            <span className="text-[11.5px] text-ink-400">
              Showing {(data.recent_page - 1) * data.recent_per_page + 1}–
              {Math.min(data.recent_page * data.recent_per_page, data.recent_total)} of {data.recent_total}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goPage(data.recent_page - 1)}
                disabled={pageBusy || data.recent_page <= 1}
                className="h-8 rounded-lg border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                ‹ Previous
              </button>
              <span className="px-1.5 text-[12px] tabular-nums text-ink-500">
                Page {data.recent_page} of {data.recent_pages}
              </span>
              <button
                type="button"
                onClick={() => goPage(data.recent_page + 1)}
                disabled={pageBusy || data.recent_page >= data.recent_pages}
                className="h-8 rounded-lg border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}

// ── Team ──────────────────────────────────────────────────────────────────
function TeamTab({ showToast }) {
  const { user } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [members, setMembers] = useState(null)
  const [adding, setAdding] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [invites, setInvites] = useState([])
  const [features, setFeatures] = useState([])
  const [accessFor, setAccessFor] = useState(null) // member id whose access is open

  useEffect(() => {
    api.get('/auth/members').then(setMembers).catch(() => setMembers([]))
    api.get('/auth/features').then(setFeatures).catch(() => setFeatures([]))
  }, [])
  useEffect(() => {
    if (canManage) api.get('/auth/invites').then(setInvites).catch(() => setInvites([]))
  }, [canManage])

  const revoke = async (inv) => {
    try {
      await api.del(`/auth/invites/${inv.id}`)
      setInvites((xs) => xs.filter((x) => x.id !== inv.id))
      showToast('Link turned off')
    } catch (e) {
      showToast(e.message)
    }
  }

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
        {canManage && !adding && !inviting && (
          <div className="flex flex-none gap-2">
            <button type="button" onClick={() => setAdding(true)} className="btn-outline">
              <FiUserPlus size={14} /> Add member
            </button>
            <button type="button" onClick={() => setInviting(true)} className="btn-primary">
              <FiLink size={14} /> Invite with a link
            </button>
          </div>
        )}
      </div>

      {inviting && (
        <InvitePanel
          features={features}
          onClose={() => setInviting(false)}
          onCreated={(inv) => setInvites((xs) => [inv, ...xs])}
          showToast={showToast}
        />
      )}

      {canManage && invites.length > 0 && (
        <div className="rounded-2xl border border-ink-200">
          <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-semibold text-ink-700">Open invite links</div>
          <div className="divide-y divide-ink-100">
            {invites.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12px]">
                <FiLink size={13} className="flex-none text-ink-400" />
                <span className="font-semibold text-ink-800">{inv.label || `${ROLE_LABEL[inv.role]} invite`}</span>
                <span className="text-ink-500">
                  {ROLE_LABEL[inv.role]} · {accessSummary(inv.role, inv.access, features)} ·{' '}
                  {inv.max_uses == null ? `${inv.uses} joined` : `${inv.uses}/${inv.max_uses} used`} · until{' '}
                  {new Date(inv.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <button type="button" onClick={() => revoke(inv)} className="ml-auto font-semibold text-ink-500 hover:text-red-600">
                  Turn off
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <Select
                      size="sm"
                      align="right"
                      value={m.role}
                      onChange={(role) => update(m, { role })}
                      title={ROLE_HINT[m.role]}
                      buttonClassName="text-[12px] font-medium"
                      options={['admin', 'editor'].map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HINT[r] }))}
                    />
                  )}
                  {m.role === 'editor' &&
                    (locked ? (
                      <span className="text-[11.5px] text-ink-400">· {accessSummary(m.role, m.access, features)}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAccessFor(accessFor === m.id ? null : m.id)}
                        className={`h-8 rounded-lg px-2.5 text-[12px] font-medium ${
                          accessFor === m.id ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-100'
                        }`}
                        title="Choose which features they can use"
                      >
                        Access: {accessSummary(m.role, m.access, features)}
                      </button>
                    ))}
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
                  {accessFor === m.id && m.role === 'editor' && !locked && (
                    <div className="basis-full">
                      <AccessEditor
                        features={features}
                        value={m.access}
                        saveLabel="Save access"
                        onCancel={() => setAccessFor(null)}
                        onSave={async (access) => {
                          await update(m, access == null ? { all_access: true } : { access })
                          setAccessFor(null)
                        }}
                      />
                    </div>
                  )}
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

/** "Everything" or "Only 3 of 9" — how much of the app an editor can use. */
function accessSummary(role, access, features) {
  if (role !== 'editor' || access == null) return 'Everything'
  if (!access.length) return 'View only'
  if (access.length <= 2 && features.length) {
    return access.map((k) => features.find((f) => f.key === k)?.label || k).join(', ')
  }
  return `${access.length} of ${features.length || access.length} features`
}

/** Pick what an editor can use: everything, or only the ticked features.
 *  Dashboard and Calendar are always visible. */
function AccessEditor({ features, value, onSave, onCancel, saveLabel = 'Save', onChange }) {
  const [mode, setMode] = useState(value == null ? 'all' : 'some')
  const [picked, setPicked] = useState(() => new Set(value || features.map((f) => f.key)))
  const [saving, setSaving] = useState(false)
  // Features can arrive after this opens — start "Only what I pick" from all ticked.
  useEffect(() => {
    if (value == null && features.length) setPicked((s) => (s.size ? s : new Set(features.map((f) => f.key))))
  }, [features, value])
  const result = mode === 'all' ? null : features.map((f) => f.key).filter((k) => picked.has(k))
  useEffect(() => {
    onChange?.(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, picked])
  const toggle = (k) =>
    setPicked((s) => {
      const next = new Set(s)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  return (
    <div className="mt-1 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
      <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
        {[
          ['all', 'Everything'],
          ['some', 'Only what I pick'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-md px-3 py-1 text-[12px] font-semibold ${mode === id ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:text-ink-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'some' && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {features.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-ink-100 hover:ring-brand-line">
              <input type="checkbox" className="mt-0.5 accent-brand" checked={picked.has(f.key)} onChange={() => toggle(f.key)} />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-ink-800">{f.label}</span>
                <span className="block text-[11px] leading-snug text-ink-500">{f.desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-400">Dashboard and Calendar are always visible. Admins always have everything.</p>
      {onSave && (
        <div className="mt-2.5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(result)
              } finally {
                setSaving(false)
              }
            }}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      )}
    </div>
  )
}

/** Make an invite link: role, what they can use, how long it works and for
 *  how many people. The link itself is only shown here, once. */
function InvitePanel({ features, onClose, onCreated, showToast }) {
  const [role, setRole] = useState('editor')
  const [access, setAccess] = useState(null)
  const [days, setDays] = useState(7)
  const [multi, setMulti] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)

  const create = async () => {
    setBusy(true)
    try {
      const inv = await api.post('/auth/invites', {
        role,
        access: role === 'editor' ? access : null,
        expires_days: days,
        max_uses: multi ? null : 1,
        label: label.trim(),
      })
      const url = `${window.location.origin}/join/${inv.token}`
      setLink(url)
      onCreated(inv)
      try {
        await navigator.clipboard.writeText(url)
        showToast('Invite link copied')
      } catch {
        /* the copy button is right there */
      }
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const seg = (on) => `rounded-md px-3 py-1 text-[12px] font-semibold ${on ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:text-ink-900'}`

  if (link) {
    return (
      <div className="space-y-3 rounded-2xl border border-brand/25 bg-brand-soft/30 p-4 animate-fadein">
        <div className="text-[13px] font-semibold text-ink-900">Your invite link is ready</div>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${input} font-mono text-[12px]`} />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => showToast('Copied'), () => {})}
            className="btn-primary flex-none"
          >
            <FiCopy size={14} /> Copy
          </button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          Send it by Telegram, Messenger or email. {multi ? 'Anyone with it can join' : 'One person can use it'} until{' '}
          {new Date(Date.now() + days * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. They set their
          own name, email and password. For safety this is the only time the link is shown — you can turn it off below any time.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand/25 bg-brand-soft/30 p-4 animate-fadein">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-ink-800">They join as</div>
          <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
            <button type="button" onClick={() => setRole('editor')} className={seg(role === 'editor')}>
              Editor
            </button>
            <button type="button" onClick={() => setRole('admin')} className={seg(role === 'admin')}>
              Admin
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">{ROLE_HINT[role]}</p>
        </div>
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-ink-800">Link works for</div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
              {[1, 7, 30].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)} className={seg(days === d)}>
                  {d === 1 ? '1 day' : `${d} days`}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
              <button type="button" onClick={() => setMulti(false)} className={seg(!multi)}>
                1 person
              </button>
              <button type="button" onClick={() => setMulti(true)} className={seg(multi)}>
                Many people
              </button>
            </div>
          </div>
        </div>
      </div>

      {role === 'editor' && (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-ink-800">What they can use</div>
          <AccessEditor features={features} value={null} onChange={setAccess} />
        </div>
      )}

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Note for yourself (optional) — e.g. Dara, content writer"
        className={input}
        maxLength={120}
      />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={create} disabled={busy} className="btn-primary disabled:opacity-50">
          <FiLink size={14} /> {busy ? 'Creating…' : 'Create link'}
        </button>
      </div>
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
          `Marketing ឆ្លាតវៃ login\n${window.location.origin}\nEmail: ${m.email}\nTemporary password: ${form.password}`,
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input autoFocus placeholder="Full name" value={form.name} onChange={set('name')} className={input} />
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className={input} />
        <Select
          size="lg"
          value={form.role}
          onChange={(role) => setForm((f) => ({ ...f, role }))}
          options={[
            { value: 'editor', label: 'Editor — creates & publishes' },
            { value: 'admin', label: 'Admin — also manages the team' },
          ]}
        />
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
    <label className="grid grid-cols-1 gap-1.5 sm:grid-cols-[170px_1fr] sm:items-center sm:gap-4">
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
