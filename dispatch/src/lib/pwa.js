// Installable app (PWA): service worker registration + the "Install app"
// prompt. Chrome/Edge/Android fire `beforeinstallprompt`, which we hold on to
// so Settings can offer a real Install button; iPhone/iPad Safari has no such
// API, so there we show the Share → "Add to Home Screen" steps instead.
import { useEffect, useState } from 'react'

let deferred = null
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
  // Only in real builds — in `vite dev` a service worker would just cache the
  // dev server and get in the way.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function promptInstall() {
  if (!deferred) return 'unavailable'
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  emit()
  return outcome // 'accepted' | 'dismissed'
}

/** 'installed' | 'available' (one-tap Install) | 'ios' (manual steps) | 'unsupported' */
export function useInstallState() {
  const compute = () =>
    isStandalone() ? 'installed' : deferred ? 'available' : isIOS() ? 'ios' : 'unsupported'
  const [state, setState] = useState(compute)
  useEffect(() => {
    const fn = () => setState(compute())
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return state
}
