// Per-member feature access (backend app/access.py). Owners and admins can use
// everything; an editor's `user.access` is null (everything) or a list of
// feature keys. The server refuses the API calls behind a missing feature —
// this only keeps the menus and pages honest about it.

// Page → the feature it belongs to. Pages not listed (Dashboard, Calendar,
// brands) are open to everyone in the workspace.
const PAGE_FEATURE = [
  ['/channels', 'channels'],
  ['/new', 'compose'],
  ['/post/', 'compose'],
  ['/review', 'content'],
  ['/ai', 'ai'],
  ['/story', 'ai'],
  ['/weekly', 'weekly'],
  ['/auto', 'auto'],
  ['/library', 'library'],
  ['/products', 'products'],
  ['/insights', 'insights'],
  ['/website', 'website'],
]

export const featureForPath = (path) =>
  PAGE_FEATURE.find(([p]) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))?.[1] || null

export function canUse(user, feature) {
  if (!feature || !user) return true
  if (user.role === 'owner' || user.role === 'admin') return true
  return user.access == null || user.access.includes(feature)
}

export const canOpen = (user, path) => canUse(user, featureForPath(path))
