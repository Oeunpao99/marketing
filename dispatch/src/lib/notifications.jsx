// What the bell shows, in one place — used by the Notifications panel and the
// Topbar / Sidebar counts, filtered by Settings → Notifications. (Phone and
// desktop pop-ups are server-sent Web Push — see lib/push.js, app/push.py.)
import { useEffect, useMemo } from 'react'
import { FiAlertTriangle, FiAward, FiCheckCircle, FiFilm, FiInbox, FiShield } from 'react-icons/fi'
import { useAuth } from '../auth'
import { PLAT } from '../data/brands'
import { useStore } from '../store'
import { useUsage } from './usage'
import { useSecurityAlerts } from './securityAlerts'
import { useInsightAlerts } from './insightAlerts'
import PlatformIcon from '../components/ui/PlatformIcon'

export const NOTIFY_KINDS = [
  { id: 'security', label: 'A new device signed in to your account', desc: 'So you can sign it out if it wasn’t you.', pushOnly: true },
  { id: 'credits', label: 'Your videos for the month', desc: 'When a new month’s videos are ready, and when they’re running low.' },
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
  const { usage } = useUsage()
  // this month's videos running low: how many are left (null = plenty)
  const v = usage?.videos
  const lowVideos = v?.limit && v.left <= Math.max(1, Math.round(v.limit * 0.2)) ? v.left : null
  const devices = useSecurityAlerts()
  const insight = useInsightAlerts() // Analytics: what can't report numbers, and the #1 post

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
    // this month's videos running low — a link to more (the Plans page's packs)
    if (lowVideos != null && prefs.credits) {
      out.push({
        id: 'videos-low',
        kind: 'credits',
        icon: <FiFilm size={14} className={lowVideos <= 0 ? 'text-red-500' : 'text-amber-500'} />,
        tag: 'Videos this month',
        dot: lowVideos <= 0 ? 'bg-red-500' : 'bg-amber-400',
        title: lowVideos <= 0 ? 'This month’s videos are used up' : `${lowVideos} video${lowVideos === 1 ? '' : 's'} left this month`,
        body: `${v.used} of ${v.limit} made — add a video pack or upgrade for more`,
        to: '/upgrade#top-up',
        urgent: lowVideos <= 0,
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
    // a platform whose connection broke — its posts can't report numbers (Analytics found it;
    // here instead of a banner on that page)
    if (prefs.channel) {
      ;(insight.problems || []).forEach((p) => {
        out.push({
          id: `stats-${p.slug}`,
          kind: 'channel',
          icon: <PlatformIcon name={p.label} className="text-ink-400" />,
          tag: 'Reconnect',
          dot: 'bg-amber-400',
          title: p.permission ? `${p.label} isn’t sharing post stats yet` : `${p.label} is disconnected`,
          body: `${p.count} post${p.count === 1 ? '' : 's'} can’t report numbers${p.accounts?.length ? ` — reconnect ${p.accounts.join(', ')}` : ' until you reconnect'} and allow every permission`,
          to: '/channels',
          urgent: true,
        })
      })
    }
    // the post that's #1 by engagement right now
    if (insight.top) {
      out.push({
        id: `top-${insight.top.id}`,
        kind: 'published',
        icon: <FiAward size={14} className="text-amber-500" />,
        tag: 'Your #1 post',
        dot: 'bg-amber-400',
        title: insight.top.title,
        body: `${Number(insight.top.engagement).toLocaleString('en-US')} engagement${insight.top.views ? ` · ${Number(insight.top.views).toLocaleString('en-US')} views` : ''} — your best right now`,
        to: `/insights/${insight.top.id}`,
        urgent: false,
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
  }, [review, queue, channels, key, lowVideos, devices, insight])
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
