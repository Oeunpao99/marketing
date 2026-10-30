// What Analytics found that the bell should carry (lib/notifications.jsx), so it isn't a
// banner on the page (the user, 2026-10-30): the platforms whose connection is broken
// ("TikTok is disconnected — 3 posts can't report numbers") and the post that's #1 by
// engagement. Analytics works these out when it loads its numbers; they're kept in this
// browser so the bell still shows them after leaving the page.
import { useSyncExternalStore } from 'react'

const KEY = 'cf_insight_alerts'
const SEEN_KEY = 'cf_top_post_seen' // the #1 posts already celebrated with the pop-up
const listeners = new Set()

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') ?? fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private window — kept for this page only */
  }
}

let state = read(KEY, { problems: [], top: null })
const emit = () => listeners.forEach((l) => l())

function update(patch) {
  const next = { ...state, ...patch }
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  write(KEY, state)
  emit()
}

/** Analytics: the platforms that can't report numbers now ([] = all fine). */
export const setConnectionProblems = (problems) => update({ problems: problems || [] })
/** Analytics: the post that's #1 by engagement (null = none worth a word). */
export const setTopPost = (top) => update({ top: top || null })

export function useInsightAlerts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      const onStorage = (e) => {
        if (e.key === KEY) {
          state = read(KEY, state)
          cb()
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', onStorage)
      }
    },
    () => state,
  )
}

/** The #1 pop-up shows once per post. */
export const topPostSeen = (id) => read(SEEN_KEY, []).includes(id)
export const markTopPostSeen = (id) => write(SEEN_KEY, [...read(SEEN_KEY, []).filter((x) => x !== id), id].slice(-50))
