// "ContentFlow is updating" — shown over everything (login screen included)
// while the server is restarting for a deploy or in MAINTENANCE_MODE. Opened by
// the API client's `dispatch:maintenance` event; polls /api/health and closes
// by itself when the server is back — reloading straight into the new build
// if one was deployed, otherwise telling the app to retry (dispatch:back-online).
import { useEffect, useState } from 'react'
import { APP_VERSION, applyUpdate, latestVersion } from '../../lib/update'

const POLL_MS = 4000

export default function MaintenanceOverlay() {
  const [message, setMessage] = useState(null)
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
          if (v && APP_VERSION !== 'dev' && v !== APP_VERSION) return applyUpdate()
          setMessage(null)
          window.dispatchEvent(new Event('dispatch:back-online'))
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
        <img src="/brand/logo-mark.png" alt="" className="mx-auto h-14 w-14 object-contain" />
        <h2 className="mt-4 text-[17px] font-bold tracking-tight text-ink-900">ContentFlow is updating</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          {message || 'We’re installing a new version. This usually takes under a minute.'}
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full w-1/3 rounded-full bg-brand animate-indeterminate" />
        </div>
        <p className="mt-3 text-[11.5px] text-ink-400">Nothing is lost — this page comes back by itself.</p>
      </div>
    </div>
  )
}
