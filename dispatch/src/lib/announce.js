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

// A template's `added`: a date ("2026-10-21" = Phnom Penh midnight) or, better, a full
// time ("2026-10-21T18:15:00+07:00"). Use the time for a template added today — someone
// who closed the pop-up this morning has a "seen" time later than today's midnight, so
// a date alone would never show them a template added this afternoon.
const day = (iso) => Date.parse(String(iso).includes('T') ? iso : `${iso}T00:00:00+07:00`)

export const templatesSeenAt = (user) => user?.preferences?.[SEEN_KEY] || null

/** The templates this person hasn't been told about yet, newest first. */
export function unseenTemplates(user, now = Date.now()) {
  if (!user || !canOpen(user, '/ai') || shouldAutoStart(user)) return []
  const seen = Date.parse(templatesSeenAt(user) || '') || 0
  const made = Date.parse(user.created_at || '') || 0
  return MOTION_TEMPLATES.filter((t) => {
    if (!t.added) return false
    const at = day(t.added)
    // a date still to come isn't announced yet — closing the pop-up saves "now", which is
    // always before it, so it came back on every page (2026-10-23)
    if (at > now) return false
    return at > seen && now - at < NEW_DAYS * 86400000 && !(made && made > at)
  }).sort((a, b) => day(b.added) - day(a.added))
}

export function markTemplatesSeen(updatePrefs) {
  if (!updatePrefs) return
  updatePrefs({ [SEEN_KEY]: new Date().toISOString() }).catch(() => {
    /* not saved — the pop-up simply shows again next time */
  })
}

// ── "New feature" (components/layout/NewFeature.jsx) ───────────────────────
// A new part of the app, introduced once to each person who can open it: add
// an entry here with `added` (a full time, as above). Seen ids are kept in
// `features_seen` in their preferences. Same rules as templates: not for an
// account made after the feature, not while the first-run tour is about to
// open, and not while a new-template pop-up is waiting (one pop-up at a time).
export const NEW_FEATURES = [
  {
    id: 'video-editor',
    added: '2026-10-22T10:00:00+07:00',
    to: '/editor',
    eyebrow: 'New feature',
    title: 'Introducing the Video editor',
    body: 'Cut, trim and adjust your generated videos freely — add your own clips, music, pictures and words, then export a new video to your Library.',
    points: ['Cut & trim', 'Drag & drop', 'Music & words', 'Export in one click'],
    cta: 'Try it now',
  },
]
const FEATURES_KEY = 'features_seen'
const FEATURE_DAYS = 30

/** The features this person hasn't been introduced to yet, newest first. */
export function unseenFeatures(user, now = Date.now()) {
  if (!user || shouldAutoStart(user) || unseenTemplates(user, now).length) return []
  const seen = new Set(user.preferences?.[FEATURES_KEY] || [])
  const made = Date.parse(user.created_at || '') || 0
  return NEW_FEATURES.filter((f) => {
    const at = day(f.added)
    return at <= now && !seen.has(f.id) && canOpen(user, f.to) && now - at < FEATURE_DAYS * 86400000 && !(made && made > at)
  }).sort((a, b) => day(b.added) - day(a.added))
}

export function markFeatureSeen(user, updatePrefs, id) {
  if (!updatePrefs) return
  const seen = new Set(user?.preferences?.[FEATURES_KEY] || [])
  seen.add(id)
  updatePrefs({ [FEATURES_KEY]: [...seen] }).catch(() => {
    /* not saved — the pop-up simply shows again next time */
  })
}
