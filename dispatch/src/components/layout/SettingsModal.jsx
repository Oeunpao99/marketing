import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../auth'

const THEMES = [
  { id: 'green', name: 'Forest', swatch: '#166432', desc: 'Signature green' },
  { id: 'blue', name: 'Ocean', swatch: '#3B82F6', desc: 'Cool & focused' },
  { id: 'violet', name: 'Royal', swatch: '#8B5CF6', desc: 'Bold & premium' },
]

const ACCENTS = [
  { id: 'lime', name: 'Lime', swatch: '#86C63B' },
  { id: 'amber', name: 'Amber', swatch: '#F59E0B' },
  { id: 'coral', name: 'Coral', swatch: '#FF6B5A' },
]

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative w-[38px] h-[22px] rounded-full transition-colors duration-200 flex-none ${on ? 'bg-brand' : 'bg-ink-300'}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-[16px]' : ''}`}
      />
    </button>
  )
}

export default function SettingsModal({ open, onClose, showToast }) {
  const { user, logout, renameWorkspace } = useAuth()
  const [wsName, setWsName] = useState(user?.workspace_name || '')
  const [wsSaving, setWsSaving] = useState(false)
  const canManage = user?.role === 'owner' || user?.role === 'admin'

  const saveWorkspace = async () => {
    const next = wsName.trim()
    if (!next || next === user?.workspace_name) return
    setWsSaving(true)
    try {
      await renameWorkspace(next)
      showToast('Workspace renamed')
    } catch (e) {
      showToast(`Could not rename — ${e.message}`)
    } finally {
      setWsSaving(false)
    }
  }
  const [name, setName] = useState(user?.name || 'Sokha R.')
  const [email, setEmail] = useState(user?.email || '')
  const [theme, setTheme] = useState('blue')
  const [accent, setAccent] = useState('lime')
  const [prefs, setPrefs] = useState({
    dailyDigest: true,
    approveNotif: true,
    autoPost: false,
  })

  if (!open) return null

  const setPref = (k) => (v) => {
    setPrefs((p) => ({ ...p, [k]: v }))
    showToast(v ? 'Enabled' : 'Disabled')
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadein">
      <div className="fixed inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white border border-ink-200 shadow-pop rounded-2xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 gradient-brand text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex-none grid place-items-center bg-white/15 font-display text-xl font-bold border border-white/20">
              {user?.initials || 'SR'}
            </div>
            <div>
              <h2 className="font-display text-2xl leading-none">Account settings</h2>
              <p className="text-[11.5px] text-white/80 mt-1">Manage your profile, theme and preferences</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/20 transition-all duration-150"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Account */}
          <section>
            <SectionTitle>Account</SectionTitle>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink-700 mb-1 block">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[12.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-700 mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[12.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </div>
          </section>

          {/* Workspace */}
          <section>
            <SectionTitle>Workspace</SectionTitle>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-ink-700 mb-1 block">Company / workspace name</label>
                <input
                  type="text"
                  value={wsName}
                  disabled={!canManage}
                  onChange={(e) => setWsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveWorkspace()}
                  className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[12.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                />
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={saveWorkspace}
                  disabled={wsSaving || !wsName.trim() || wsName.trim() === user?.workspace_name}
                  className="btn-primary px-3.5 py-2 disabled:opacity-50"
                >
                  {wsSaving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              Everything in the portal — brands, channels, posts, media — belongs to this workspace
              and is invisible to other accounts.
            </p>
          </section>

          {/* Theme */}
          <section>
            <SectionTitle>Theme</SectionTitle>
            <div className="grid grid-cols-3 gap-2.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id)
                    showToast(`${t.name} theme selected`)
                  }}
                  className={`rounded-2xl border p-3 text-left transition-all duration-150 ${
                    theme === t.id
                      ? 'border-brand ring-2 ring-brand/20 bg-brand/5'
                      : 'border-ink-200 hover:border-ink-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg mb-2" style={{ background: t.swatch }} />
                  <div className="text-[12px] font-semibold text-ink-800">{t.name}</div>
                  <div className="text-[10.5px] text-ink-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Accent */}
          <section>
            <SectionTitle>Accent color</SectionTitle>
            <div className="flex gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAccent(a.id)
                    showToast(`${a.name} accent applied`)
                  }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 ${
                    accent === a.id ? 'ring-2 ring-offset-2 ring-ink-800' : 'hover:scale-110'
                  }`}
                  style={{ background: a.swatch }}
                  title={a.name}
                >
                  {accent === a.id && <span className="text-white text-sm font-bold">✓</span>}
                </button>
              ))}
              <span className="self-center text-[11.5px] text-ink-400 ml-1">
                {ACCENTS.find((a) => a.id === accent)?.name}
              </span>
            </div>
          </section>

          {/* Preferences */}
          <section>
            <SectionTitle>Preferences</SectionTitle>
            <div className="divide-y divide-ink-100 border border-ink-200 rounded-2xl">
              <PrefRow label="Daily digest" desc="Receive a morning summary of scheduled posts" toggled={prefs.dailyDigest} onToggle={setPref('dailyDigest')} />
              <PrefRow label="Approval notifications" desc="Get notified when new posts await your review" toggled={prefs.approveNotif} onToggle={setPref('approveNotif')} />
              <PrefRow label="Auto-post without review" desc="Skip manual approval and publish automatically" toggled={prefs.autoPost} onToggle={setPref('autoPost')} />
            </div>
          </section>

          {/* Session */}
          <section>
            <SectionTitle>Session</SectionTitle>
            <div className="flex items-center gap-3 border border-ink-200 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-ink-800">
                  Signed in as {user?.name || 'you'}
                </div>
                <div className="text-[11px] text-ink-400 truncate">
                  {user?.email}{user?.role ? ` · ${user.role}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  logout()
                  showToast('Signed out')
                }}
                className="flex-none px-3.5 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold hover:bg-red-100 transition-all duration-150"
              >
                Log out
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-ink-50 border border-ink-200 text-ink-600 text-[12px] font-medium hover:bg-ink-100 transition-all duration-150"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              showToast('Settings saved')
              onClose()
            }}
            className="px-4 py-1.5 rounded-xl gradient-brand text-white text-[12px] font-semibold hover:shadow-glow transition-all duration-200"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-[10px] font-bold tracking-[.09em] uppercase text-ink-400 mb-2.5">{children}</h3>
  )
}

function PrefRow({ label, desc, toggled, onToggle }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-ink-800">{label}</div>
        <div className="text-[11px] text-ink-400">{desc}</div>
      </div>
      <Toggle on={toggled} onChange={onToggle} />
    </div>
  )
}
