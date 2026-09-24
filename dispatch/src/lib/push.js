// Web Push on this device — subscribe / unsubscribe with the browser's push
// service and register the subscription with the backend (app/push.py).
import { api } from '../api/client'
import { isIOS, isStandalone } from './pwa'

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const swReady = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The app’s service worker isn’t running — reload and try again.')), 8000)),
  ])

/**
 * Why push can / can't work here:
 * 'ready' | 'on' | 'ios-install' (iPhone: add to Home Screen first) |
 * 'insecure' (needs HTTPS) | 'unsupported' | 'denied' | 'server-off'
 */
export async function pushStatus() {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!window.isSecureContext) return 'insecure'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  let server
  try {
    server = await api.get('/push/key')
  } catch {
    return 'server-off'
  }
  if (!server.enabled) return 'server-off'
  try {
    const reg = await swReady()
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'ready'
  } catch {
    return 'ready'
  }
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed.')
  const { public_key: key, enabled } = await api.get('/push/key')
  if (!enabled) throw new Error('Push isn’t set up on the server yet.')
  const reg = await swReady()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
  const json = sub.toJSON()
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: navigator.userAgent.slice(0, 290),
  })
}

export async function disablePush() {
  const reg = await swReady()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}

export const sendTestPush = () => api.post('/push/test')
