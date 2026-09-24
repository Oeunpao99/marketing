import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiBell,
  FiBriefcase,
  FiCheck,
  FiDroplet,
  FiLock,
  FiLogOut,
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

export default function SettingsModal({ open, onClose, showToast }) {
  const [tab, setTab] = useState('profile')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadein">
      <div className="fixed inset-0 glass-overlay" onClick={onClose} />
      <div className="relative flex h-[min(620px,90vh)] w-full max-w-[820px] overflow-hidden rounded-3xl glass-panel">
        {/* tabs */}
        <nav className="hidden sm:flex w-[200px] flex-none flex-col gap-0.5 border-r border-white/60 bg-white/40 p-3">
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
                  ref={(el) => tab === t.id && el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })}
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
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const mismatch = form.confirm && form.next !== form.confirm
  const ready = form.current && form.next.length >= 8 && form.next === form.confirm

  const save = async () => {
    if (!ready) return
    setSaving(true)
    try {
      await api.post('/auth/password', { current_password: form.current, new_password: form.next })
      setForm({ current: '', next: '', confirm: '' })
      showToast('Password changed')
    } catch (e) {
      showToast(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle title="Change password" sub="At least 8 characters." />
        <Row label="Current password">
          <input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} className={input} />
        </Row>
        <Row label="New password">
          <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} className={input} />
        </Row>
        <Row label="Confirm new password" hint={mismatch ? <span className="text-red-600">Passwords don’t match</span> : null}>
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} className={input} />
        </Row>
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={!ready || saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-200 p-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink-800">Signed in as {user?.name}</div>
          <div className="truncate text-[12px] text-ink-500">{user?.email}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose()
            logout()
            showToast('Signed out')
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-100"
        >
          <FiLogOut size={14} /> Sign out
        </button>
      </section>
    </div>
  )
}

// ── Workspace ─────────────────────────────────────────────────────────────
function WorkspaceTab({ showToast }) {
  const { user, renameWorkspace } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [info, setInfo] = useState(null)
  const [name, setName] = useState(user?.workspace_name || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/auth/workspace').then(setInfo).catch(() => setInfo(null))
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

  return (
    <div className="space-y-6">
      <Row
        label="Workspace name"
        hint={canManage ? 'Your company or agency — shown in the sidebar.' : 'Only an owner or admin can rename it.'}
      >
        <input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} className={input} />
      </Row>
      {canManage && <SaveBar dirty={!!dirty} saving={saving} onSave={save} onReset={() => setName(user?.workspace_name || '')} />}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Brands" value={info?.brands} />
        <Stat label="Members" value={info?.members} />
        <Stat
          label="Created"
          value={info ? new Date(info.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null}
          sub={info ? new Date(info.created_at).getFullYear() : null}
        />
      </div>

      <p className="rounded-xl bg-brand-soft/50 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
        Everything in ContentFlow — brands, channels, posts, media and AI chats — belongs to this workspace and is
        invisible to every other account.
      </p>
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

function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-200 bg-white/60 px-3 py-3 sm:px-4">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-0.5 truncate text-[16px] sm:text-[17px] font-bold text-ink-900">
        {value ?? '—'}
        {sub != null && <span className="ml-1 text-[11px] font-medium text-ink-400">{sub}</span>}
      </div>
    </div>
  )
}
