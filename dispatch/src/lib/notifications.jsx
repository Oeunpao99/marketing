// What the bell shows, in one place — used by the Notifications panel and the
// Topbar / Sidebar counts, filtered by Settings → Notifications — plus the
// optional desktop (browser) alerts that watch the same data.
import { useEffect, useMemo, useRef } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiInbox } from 'react-icons/fi'
import { useAuth } from '../auth'
import { PLAT } from '../data/brands'
import { useStore } from '../store'
import PlatformIcon from '../components/ui/PlatformIcon'

export const NOTIFY_KINDS = [
  { id: 'review', label: 'Ideas waiting for review', desc: 'New AI-written ideas that need your approval.' },
  { id: 'failed', label: 'A post failed to publish', desc: 'So you can fix it and send it again.' },
  { id: 'channel', label: 'A channel needs reconnecting', desc: 'Its login is about to expire.' },
  { id: 'published', label: 'A post was published', desc: 'Confirmation when something goes live.' },
]

export function notifyPrefs(user) {
  return { review: true, failed: true, channel: true, published: true, ...(user?.preferences?.notify || {}) }
}

export function useNotifications() {
  const { review, queue, channels } = useStore()
  const { user } = useAuth()
  const prefs = notifyPrefs(user)
  const key = JSON.stringify(prefs)

  return useMemo(() => {
    const out = []
    if (prefs.failed) {
      ;(queue || []).forEach((p, index) => {
        if (p.st !== 'failed') return
        out.push({
          id: `failed-${p.postId ?? p.targetId}`,
          kind: 'failed',
          icon: <FiAlertTriangle size={14} className="text-red-500" />,
          tag: 'Failed to post',
          dot: 'bg-red-500',
          title: p.ttl || 'Untitled',
          body: p.error || `${p.brandName || p.b} · ${p.t}`,
          to: `/post/${index}`,
          urgent: true,
        })
      })
    }
    if (prefs.review) {
      ;(review || []).forEach((draft) => {
        out.push({
          id: `review-${draft.id ?? draft.ttl}`,
          kind: 'review',
          icon: <FiInbox size={14} className="text-brand" />,
          tag: 'Ready for review',
          dot: 'bg-brand',
          title: draft.ttl || 'New post draft',
          body: `${draft.brandName || draft.b} · ${draft.made || 'Written recently'}`,
          to: '/review',
          urgent: true,
        })
      })
    }
    if (prefs.channel) {
      ;(channels || [])
        .filter((c) => c.s === 'soon')
        .forEach((c) => {
          out.push({
            id: `channel-${c.id}`,
            kind: 'channel',
            icon: <PlatformIcon name={PLAT[c.p]?.name} className="text-ink-400" />,
            tag: 'Reconnect soon',
            dot: 'bg-amber-400',
            title: `${c.h || c.b}`,
            body: `${c.b} · ${PLAT[c.p]?.name || c.p} · re-authorise soon`,
            to: '/channels',
            urgent: true,
          })
        })
    }
    if (prefs.published) {
      ;(queue || []).forEach((p, index) => {
        if (p.st !== 'posted') return
        out.push({
          id: `posted-${p.postId ?? p.targetId}`,
          kind: 'published',
          icon: <FiCheckCircle size={14} className="text-emerald-500" />,
          tag: 'Posted',
          dot: 'bg-emerald-500',
          title: p.ttl || 'Untitled',
          body: `${p.brandName || p.b} · ${p.t}`,
          to: `/post/${index}`,
          urgent: false,
        })
      })
    }
    const items = out.slice(0, 12)
    return { items, count: out.filter((i) => i.urgent).length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, queue, channels, key])
}

// ── desktop alerts ─────────────────────────────────────────────────────────
export const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window

function alert(title, body, tag) {
  try {
    const n = new Notification(title, { body, tag, icon: '/brand/favicon-64.png' })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Mounted once (Shell). Pops a browser notification when something the
 *  person opted into happens while ContentFlow isn't the tab they're on. */
export function useDesktopAlerts() {
  const { queue, review } = useStore()
  const { user } = useAuth()
  const prev = useRef(null)
  const enabled = !!user?.preferences?.desktop_alerts
  const prefs = notifyPrefs(user)

  useEffect(() => {
    const snap = {
      st: Object.fromEntries((queue || []).map((p) => [p.postId ?? p.targetId, p.st])),
      review: (review || []).length,
    }
    const before = prev.current
    prev.current = snap
    if (!before || !enabled || !desktopSupported() || Notification.permission !== 'granted') return
    if (!document.hidden) return // they're looking at the app — the bell is enough

    for (const p of queue || []) {
      const k = p.postId ?? p.targetId
      const was = before.st[k]
      if (!was || was === p.st) continue
      if (p.st === 'failed' && prefs.failed) alert('A post failed to publish', `${p.ttl} — ${p.error || 'open ContentFlow to retry'}`, `failed-${k}`)
      if (p.st === 'posted' && prefs.published) alert('Posted ✓', `${p.ttl} is live on ${p.c.join(', ')}`, `posted-${k}`)
    }
    if (prefs.review && review !== null && before.review !== null && snap.review > before.review) {
      const n = snap.review - before.review
      alert(`${n} new idea${n === 1 ? '' : 's'} waiting for you`, 'Open ContentFlow to review and approve.', 'review')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, review])
}
