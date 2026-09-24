// Keeping installed apps up to date.
//
// A phone app added to the home screen usually *resumes* instead of
// restarting, so it can keep running an old build for days. Each build is
// stamped with a version (vite.config.js → __APP_VERSION__ + /version.json);
// we check the server's on open/return and every 10 minutes and, if it's
// newer, offer a one-tap Update. Plus pull-to-refresh for the installed app,
// which has no browser reload button.
import { useEffect, useRef, useState } from 'react'
import { isStandalone } from './pwa'

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export async function latestVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()).version || null
  } catch {
    return null
  }
}

/** Reload into the newest build (refresh the service worker first). */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    /* ignore — the reload below still fetches the new page */
  }
  window.location.reload()
}

/** True once the server has a newer build than the one running. */
export function useUpdateAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (APP_VERSION === 'dev') return // vite dev reloads by itself
    const check = async () => {
      const v = await latestVersion()
      if (v && v !== APP_VERSION) setAvailable(true)
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const id = setInterval(check, 10 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(id)
    }
  }, [])
  return available
}

/** Pull down from the top of the page to reload — only in the installed app
 *  on a touch screen (the browser has its own). Returns 0..1 for the
 *  indicator; reloads when released past the threshold. */
export function usePullToRefresh() {
  const [pull, setPull] = useState(0)
  const start = useRef(null)
  const pullRef = useRef(0)

  useEffect(() => {
    if (!isStandalone() || !('ontouchstart' in window)) return
    const THRESHOLD = 90
    const onStart = (e) => {
      // only from the very top, and not while a popup / sheet is open
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden') return
      start.current = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      pullRef.current = Math.min(1, dy / THRESHOLD)
      setPull(pullRef.current)
    }
    const onEnd = () => {
      if (start.current != null && pullRef.current >= 1) applyUpdate()
      start.current = null
      pullRef.current = 0
      setPull(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])
  return pull
}
