// What the bell shows, in one place — used by the Notifications panel and the
// Topbar / Sidebar counts, filtered by Settings → Notifications. (Phone and
// desktop pop-ups are server-sent Web Push — see lib/push.js, app/push.py.)
import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiAward, FiCheckCircle, FiFilm, FiInbox, FiShield, FiUserPlus } from 'react-icons/fi'
import { notificationStamp, readDismissed, saveDismissed } from './notificationDismissals'
import { useAuth } from '../auth'
import { PLAT } from '../data/brands'
import { useStore } from '../store'
import { useUsage } from './usage'
import { useJoinedAlerts, useSecurityAlerts } from './securityAlerts'
import { useInsightAlerts } from './insightAlerts'
import { useWorkspaceAlerts } from './workspaceAlerts'
import { canOpen } from './access'
import PlatformIcon from '../components/ui/PlatformIcon'

export const NOTIFY_KINDS = [
  { id: 'security', label: 'A new device signed in to your account', desc: 'So you can sign it out if it wasn’t you.', pushOnly: true },
  { id: 'credits', label: 'Your videos for the month', desc: 'When a new month’s videos are ready, and when they’re running low.' },
  { id: 'tasks', label: 'Leads and team tasks', desc: 'Lead hand-offs, overdue contact, and team follow-ups.' },
  { id: 'review', label: 'Ideas waiting for review', desc: 'New AI-written ideas that need your approval.' },
  { id: 'failed', label: 'A post failed to publish', desc: 'So you can fix it and send it again.' },
  { id: 'channel', label: 'A channel needs reconnecting', desc: 'Its login is about to expire.' },
  { id: 'published', label: 'A post was published', desc: 'Confirmation when something goes live.' },
  { id: 'generated', label: 'Your image or video is ready', desc: 'When something you asked the AI Agent to make has finished.', pushOnly: true },
  { id: 'website', label: 'A website problem', desc: 'The site is down, its SSL or domain is about to expire, or its score drops.', pushOnly: true },
]

export function notifyPrefs(user) {
  return { tasks: true, security: true, credits: true, review: true, failed: true, channel: true, published: true, generated: true, website: true, ...(user?.preferences?.notify || {}) }
}

export function useNotifications() {
  const { review, queue, channels } = useStore()
  const { user } = useAuth()
  const scope = `${user?.workspace_id || 'workspace'}:${user?.id || user?.email || 'guest'}`
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const update = () => setRevision((n) => n + 1)
    window.addEventListener('dispatch:notifications-dismissed', update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener('dispatch:notifications-dismissed', update); window.removeEventListener('storage', update) }
  }, [])
  const workspace = useWorkspaceAlerts(scope)
  const prefs = notifyPrefs(user)
  const key = JSON.stringify(prefs)
  const { usage } = useUsage()
  // this month's videos running low: how many are left (null = plenty)
  const v = usage?.videos
  const lowVideos = v?.limit && v.left <= Math.max(1, Math.round(v.limit * 0.2)) ? v.left : null
  const devices = useSecurityAlerts()
  const joined = useJoinedAlerts() // owners / admins: who joined the workspace this week
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
    // someone new in the workspace (an invite link, or added by a manager) — can be dismissed
    if (prefs.security)
      joined.forEach((m) => {
        out.push({
          id: `joined-${m.id}`,
          kind: 'joined',
          icon: <FiUserPlus size={14} className="text-brand" />,
          tag: 'Team',
          dot: 'bg-brand',
          title: `${m.name} joined your workspace`,
          body: `${m.email} · ${m.role} · ${new Date(m.created_at).toLocaleString()}`,
          to: '/?settings=team',
          urgent: true,
        })
      })
    workspace.needs.forEach((need) => {
      if (['failed', 'credit', 'review'].includes(need.key)) return
      const kind = ['stuck', 'channels'].includes(need.key) ? 'channel' : ['weekly', 'no_media'].includes(need.key) ? 'review' : 'tasks'
      if (!prefs[kind] || !canOpen(user, need.to || '/command')) return
      out.push({ id: `task-${need.key}`, kind, icon: <FiInbox size={14} className="text-brand" />, tag: 'Workspace task', dot: 'bg-brand', title: `${need.count != null ? `${need.count} · ` : ''}${need.title}`, body: need.detail || '', to: need.to || '/command', urgent: true })
    })
    if (prefs.channel && workspace.health?.attention && !(insight.problems || []).length && canOpen(user, '/channels')) {
      out.push({ id: 'accounts-attention', kind: 'channel', icon: <FiAlertTriangle size={14} className="text-amber-500" />, tag: 'Connection', dot: 'bg-amber-400', title: `${workspace.health.attention} accounts need reconnecting`, body: 'Reconnect these accounts to read their latest results.', to: '/channels', urgent: true })
    }
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
    const dismissed = readDismissed(scope)
    const visible = out.filter((item) => item.kind === 'security' || !dismissed.includes(notificationStamp(item)))
    const dismissItems = (items) => {
      saveDismissed(scope, [...readDismissed(scope), ...items.filter((i) => i.kind !== 'security').map(notificationStamp)])
      window.dispatchEvent(new Event('dispatch:notifications-dismissed'))
    }
    return { items: visible, count: visible.filter((i) => i.urgent).length, dismiss: (item) => dismissItems([item]), clearAll: () => dismissItems(visible) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, queue, channels, key, lowVideos, devices, joined, insight, scope, revision, workspace, user])
}

/** Rings every bell (Topbar, MobileBar) — a video finished (MakingStatus), a new notification. */
export const ringBell = () => window.dispatchEvent(new Event('dispatch:bell-ring'))

/** True for a moment after the bell rang — the bell icon shakes (index.css .cf-bell-ring). */
export function useBellRing() {
  const [ring, setRing] = useState(0)
  useEffect(() => {
    let timer
    const on = () => {
      setRing((n) => n + 1)
      clearTimeout(timer)
      timer = setTimeout(() => setRing(0), 2400)
    }
    window.addEventListener('dispatch:bell-ring', on)
    return () => { window.removeEventListener('dispatch:bell-ring', on); clearTimeout(timer) }
  }, [])
  return ring // a new number each ring: the key that restarts the shake
}

/** Keeps the installed app's icon badge equal to the bell's count while the
 *  app is open (the service worker updates it from pushes while it's closed),
 *  and rings the bell when a notification appears that this browser hasn't
 *  seen before (a new device, the #1 post, videos used up…) — remembered, so
 *  a reload doesn't ring for the same ones again; the very first visit only
 *  remembers what's there. */
export function useAppBadge() {
  const { count, items } = useNotifications()
  const { user } = useAuth()
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    ;(count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {})
  }, [count])
  const ids = items.map((i) => i.id).join('|')
  useEffect(() => {
    if (!user) return
    const key = `cf-bell-seen:${user.workspace_id || ''}:${user.id || user.email || ''}`
    let seen = null
    try {
      seen = JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      seen = null
    }
    const now = ids ? ids.split('|') : []
    const fresh = seen ? now.filter((id) => !seen.includes(id)) : []
    if (fresh.length) ringBell()
    try {
      localStorage.setItem(key, JSON.stringify([...new Set([...(seen || []), ...now])].slice(-300)))
    } catch {
      /* private window: it just rings again next time */
    }
  }, [ids, user])
}
