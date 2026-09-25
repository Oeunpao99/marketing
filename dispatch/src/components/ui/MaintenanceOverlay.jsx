// "ContentFlow is updating" — shown over everything (login screen included)
// while the server is restarting for a deploy or in MAINTENANCE_MODE. Opened by
// the API client's `dispatch:maintenance` event; polls /api/health and, once
// the server is back, flips to a green "All set" check for a moment before
// closing — reloading straight into the new build if one was deployed,
// otherwise telling the app to retry (dispatch:back-online).
import { useEffect, useState } from 'react'
import { FiCheck, FiSettings, FiTool } from 'react-icons/fi'
import { APP_VERSION, applyUpdate, latestVersion } from '../../lib/update'

const POLL_MS = 4000
const DONE_MS = 1600 // how long the "All set" check stays up

export default function MaintenanceOverlay() {
  const [message, setMessage] = useState(null)
  const [done, setDone] = useState(false)
  const open = message != null

  useEffect(() => {
    const onDown = (e) => setMessage(e.detail?.message || '')
    window.addEventListener('dispatch:maintenance', onDown)
    return () => window.removeEventListener('dispatch:maintenance', onDown)
  }, [])

  useEffect(() => {
    if (!open) return
    let stopped = false
    let timer
    const check = async () => {
      try {
        const res = await fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store' })
        const data = res.ok ? await res.json() : null
        if (data && !data.maintenance) {
          const v = await latestVersion()
          const newBuild = v && APP_VERSION !== 'dev' && v !== APP_VERSION
          setDone(true)
          timer = setTimeout(() => {
            if (newBuild) return applyUpdate()
            setMessage(null)
            setDone(false)
            window.dispatchEvent(new Event('dispatch:back-online'))
          }, DONE_MS)
          return
        }
        if (data?.message) setMessage(data.message)
      } catch {
        /* still down — keep waiting */
      }
      if (!stopped) timer = setTimeout(check, POLL_MS)
    }
    timer = setTimeout(check, POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-ink-50/85 p-6 backdrop-blur-sm animate-fadein" role="alertdialog" aria-live="polite">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-xl ring-1 ring-ink-200/70">
        {done ? (
          <span key="done" className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-check-pop">
            <FiCheck size={40} strokeWidth={3} />
          </span>
        ) : (
          <span key="work" className="relative mx-auto block h-20 w-20 rounded-full bg-brand-soft">
            <FiSettings size={44} className="absolute left-[14px] top-[12px] text-brand animate-spin-slow motion-reduce:animate-none" />
            <span className="absolute bottom-[10px] right-[8px] grid h-9 w-9 place-items-center rounded-full bg-white shadow-md ring-1 ring-ink-100">
              <FiTool size={18} className="text-amber-500 origin-center animate-wrench motion-reduce:animate-none" />
            </span>
          </span>
        )}

        <h2 className="mt-5 text-[17px] font-bold tracking-tight text-ink-900">
          {done ? 'All set!' : 'ContentFlow is updating'}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          {done
            ? 'You’re on the latest version — picking up where you left off.'
            : message || 'We’re installing a new version. This usually takes under a minute.'}
        </p>

        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-ink-100">
          {done ? (
            <div className="h-full w-full rounded-full bg-emerald-500" />
          ) : (
            <span className="absolute top-0 h-full rounded-full bg-brand animate-indeterminate" />
          )}
        </div>
        {!done && <p className="mt-3 text-[11.5px] text-ink-400">Nothing is lost — this page comes back by itself.</p>}
      </div>
    </div>
  )
}
