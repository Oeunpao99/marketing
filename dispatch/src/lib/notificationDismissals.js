const keyFor = (scope) => `contentflow.dismissedNotifications:${scope}`
export const notificationStamp = (item) => JSON.stringify([item.id, item.title, item.body])
export function readDismissed(scope) {
  try { const value = JSON.parse(localStorage.getItem(keyFor(scope)) || '[]'); return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [] } catch { return [] }
}
export function saveDismissed(scope, stamps) {
  try { localStorage.setItem(keyFor(scope), JSON.stringify([...new Set(stamps)].slice(-1000))) } catch { /* Browser storage unavailable. */ }
}
