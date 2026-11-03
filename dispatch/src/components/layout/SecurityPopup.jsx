import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiShield, FiUserPlus, FiX } from 'react-icons/fi'
import { useAuth } from '../../auth'
import { confirmDevice, signOutDevice, useJoinedAlerts, useSecurityAlerts } from '../../lib/securityAlerts'

// A centred pop-up, once per browser, for what someone should see right away:
// a new device signed in to their account ("Was this you?"), or a new person
// joined their workspace (owners / admins). It stays in the bell either way;
// × only stops this browser popping it up again.

const KEY = (uid) => `cf-sec-popup:${uid}`
const readShown = (uid) => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(uid)) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const saveShown = (uid, ids) => {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(ids.slice(-100)))
  } catch {
    /* private window: it may pop up again next time */
  }
}

export default function SecurityPopup() {
  const { user } = useAuth()
  const devices = useSecurityAlerts()
  const joined = useJoinedAlerts()
  const [shown, setShown] = useState(() => readShown(user?.id))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const notify = user?.preferences?.notify?.security !== false
  const device = devices.find((d) => !shown.includes(`device-${d.id}`))
  const member = !device && notify ? joined.find((m) => !shown.includes(`joined-${m.id}`)) : null
  const id = device ? `device-${device.id}` : member ? `joined-${member.id}` : null
  if (!user || !id) return null

  const done = () => {
    const next = [...shown, id]
    setShown(next)
    saveShown(user.id, next)
    setBusy('')
    setError('')
  }
  const act = async (kind) => {
    setBusy(kind)
    setError('')
    try {
      await (kind === 'yes' ? confirmDevice(device.id) : signOutDevice(device.id))
      done()
    } catch (e) {
      setError(e.message || 'Couldn’t do that just now — try again.')
      setBusy('')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-night-950/40 p-4 animate-fadein">
      <div role="alertdialog" aria-modal="true" aria-labelledby="sec-popup-title" className="relative w-full max-w-[400px] rounded-3xl bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        <button type="button" onClick={done} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700">
          <FiX size={16} />
        </button>
        {device ? (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
              <FiShield size={22} />
            </span>
            <h2 id="sec-popup-title" className="mt-4 text-[18px] font-bold tracking-tight text-ink-900">
              New device signed in to your account
            </h2>
            <div className="mt-3 space-y-1 rounded-xl bg-canvas px-3.5 py-3 text-[13px] text-ink-700">
              <div>
                <span className="text-ink-400">Device</span> · <b className="text-ink-900">{device.device}</b>
              </div>
              <div>
                <span className="text-ink-400">Place</span> · {device.location}
                {device.ip ? <span className="text-ink-400"> ({device.ip})</span> : null}
              </div>
              <div>
                <span className="text-ink-400">When</span> · {new Date(device.created_at).toLocaleString()}
              </div>
            </div>
            <p className="mt-3 text-[13.5px] font-semibold text-ink-900">Was this you?</p>
            <p className="mt-0.5 text-[12.5px] text-ink-500">If not, sign it out now — then change your password in Settings → Security.</p>
            {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => act('yes')}
                disabled={!!busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white py-2.5 text-[13px] font-semibold text-ink-800 hover:border-ink-300 disabled:opacity-60"
              >
                <FiCheck size={14} /> {busy === 'yes' ? 'Saving…' : 'Yes, it was me'}
              </button>
              <button
                type="button"
                onClick={() => act('no')}
                disabled={!!busy}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === 'no' ? 'Signing out…' : 'No, sign it out'}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
              <FiUserPlus size={22} />
            </span>
            <h2 id="sec-popup-title" className="mt-4 text-[18px] font-bold tracking-tight text-ink-900">
              {member.name} joined your workspace
            </h2>
            <div className="mt-3 space-y-1 rounded-xl bg-canvas px-3.5 py-3 text-[13px] text-ink-700">
              <div>
                <span className="text-ink-400">Email</span> · <b className="text-ink-900">{member.email}</b>
              </div>
              <div>
                <span className="text-ink-400">Role</span> · <span className="capitalize">{member.role}</span>
              </div>
              <div>
                <span className="text-ink-400">When</span> · {new Date(member.created_at).toLocaleString()}
              </div>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-500">Don’t know them? Switch them off or remove them in Settings → Team.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={done} className="flex-1 rounded-xl border border-ink-200 bg-white py-2.5 text-[13px] font-semibold text-ink-800 hover:border-ink-300">
                OK
              </button>
              <button
                type="button"
                onClick={() => {
                  done()
                  window.dispatchEvent(new CustomEvent('dispatch:open-settings', { detail: { tab: 'team' } }))
                }}
                className="flex-1 btn-primary justify-center py-2.5 text-[13px]"
              >
                See your team
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
