// "New template — try it out": who sees which new template, once.
//
// A template is new while it has an `added` date (lib/motionTemplates.js) no
// older than NEW_DAYS. A person is told about the ones added after the last
// time they were told — `templates_seen_at` in their own preferences (saved
// when they close or try the pop-up, so it follows them to a new device), the
// same place the first-run tour's flag lives (lib/tour.js).
//
// Not told: an account made after the template came out (it meets every
// template as a new person does — and the tour is for them), and while the
// first-run tour is still about to open (one pop-up at a time).

import { MOTION_TEMPLATES } from './motionTemplates'
import { canOpen } from './access'
import { shouldAutoStart } from './tour'

const SEEN_KEY = 'templates_seen_at'
export const NEW_DAYS = 14

const day = (iso) => Date.parse(`${iso}T00:00:00+07:00`) // Phnom Penh midnight

export const templatesSeenAt = (user) => user?.preferences?.[SEEN_KEY] || null

/** The templates this person hasn't been told about yet, newest first. */
export function unseenTemplates(user, now = Date.now()) {
  if (!user || !canOpen(user, '/ai') || shouldAutoStart(user)) return []
  const seen = Date.parse(templatesSeenAt(user) || '') || 0
  const made = Date.parse(user.created_at || '') || 0
  return MOTION_TEMPLATES.filter((t) => {
    if (!t.added) return false
    const at = day(t.added)
    return at > seen && now - at < NEW_DAYS * 86400000 && !(made && made > at)
  }).sort((a, b) => day(b.added) - day(a.added))
}

export function markTemplatesSeen(updatePrefs) {
  if (!updatePrefs) return
  updatePrefs({ [SEEN_KEY]: new Date().toISOString() }).catch(() => {
    /* not saved — the pop-up simply shows again next time */
  })
}
