// What the bell shows, in one place — used by the Notifications panel and the
// Topbar / Sidebar counts, filtered by Settings → Notifications. (Phone and
// desktop pop-ups are server-sent Web Push — see lib/push.js, app/push.py.)
import { useEffect, useMemo } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiGift, FiInbox, FiShield } from 'react-icons/fi'
import { useAuth } from '../auth'
import { PLAT } from '../data/brands'
import { useStore } from '../store'
import { useCredits } from './credits'
import { useSecurityAlerts } from './securityAlerts'
import PlatformIcon from '../components/ui/PlatformIcon'

export const NOTIFY_KINDS = [
  { id: 'security', label: 'A new device signed in to your account', desc: 'So you can sign it out if it wasn’t you.', pushOnly: true },
  { id: 'credits', label: 'Monthly AI credits are ready', desc: 'Once a month, when your new credits can be claimed.' },
  { id: 'review', label: 'Ideas waiting for review', desc: 'New AI-written ideas that need your approval.' },
  { id: 'failed', label: 'A post failed to publish', desc: 'So you can fix it and send it again.' },
  { id: 'channel', label: 'A channel needs reconnecting', desc: 'Its login is about to expire.' },
  { id: 'published', label: 'A post was published', desc: 'Confirmation when something goes live.' },
  { id: 'generated', label: 'Your image or video is ready', desc: 'When something you asked the AI Agent to make has finished.', pushOnly: true },
  { id: 'website', label: 'A website problem', desc: 'The site is down, its SSL or domain is about to expire, or its score drops.', pushOnly: true },
]

export function notifyPrefs(user) {
  return { security: true, credits: true, review: true, failed: true, channel: true, published: true, generated: true, website: true, ...(user?.preferences?.notify || {}) }
}

export function useNotifications() {
  const { review, queue, channels } = useStore()
  const { user } = useAuth()
  const prefs = notifyPrefs(user)
  const key = JSON.stringify(prefs)
  const { credits } = useCredits()
  const claimable = credits?.claim_available ? credits.claim_credits ?? credits.monthly_credits : 0
  const devices = useSecurityAlerts()

  return useMemo(() => {
    const out = []
    // a device signed in that this person hadn't used before — always shown, first:
    // it may be someone else using the account (Notifications.jsx: "Was this you?")
    devices.forEach((d) => {
      out.push({
        id: `device-${d.id}`,
        kind: 'security',
        icon: <FiShield size={14} className="text-red-500" />,
        tag: 'Security',
        dot: 'bg-red-500',
        title: 'New device signed in to your account',
        body: `${d.device} · ${d.location} · ${new Date(d.created_at).toLocaleString()}`,
        action: 'device',
        session: d.id,
        urgent: true,
      })
    })
    // this month's credits wait to be claimed — first, with its own Claim button (Notifications.jsx)
    if (claimable && prefs.credits) {
      out.push({
        id: 'credits-claim',
        kind: 'credits',
        icon: <FiGift size={14} className="text-brand" />,
        tag: 'Monthly credits',
        dot: 'bg-brand',
        title: 'Your monthly AI credits are ready',
        body: `${claimable.toLocaleString('en-US')} credits for this month — claim them to keep using AI`,
        action: 'claim',
        urgent: true,
      })
    }
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
  }, [review, queue, channels, key, claimable, devices])
}

/** Keeps the installed app's icon badge equal to the bell's count while the
 *  app is open (the service worker updates it from pushes while it's closed). */
export function useAppBadge() {
  const { count } = useNotifications()
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    ;(count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {})
  }, [count])
}
