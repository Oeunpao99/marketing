// The first-run spotlight tour (components/layout/OnboardingTour.jsx).
//
// "Has this person seen it" lives in their own preferences, the same place
// `library_seen_at` goes (backend/app/views.py) — so it follows them to a new
// device, and every member of a workspace gets their own. The flag is only
// written when they finish or skip, so a reload mid-tour starts it again
// rather than losing them halfway.

import { canOpen } from './access'

const SEEN_KEY = 'tour_seen_at'

// Don't ambush someone who has been using the app for months — the tour is
// for people who signed up in the last few weeks and still haven't seen it.
const NEW_ACCOUNT_DAYS = 30

// `targets` are tried in order and the first one actually on screen wins, so
// one step works on both the desktop sidebar and the phone's bottom bar
// (a hidden element measures 0×0 and is skipped). A step with no visible
// target falls back to a centred card.
export const TOUR_STEPS = [
  {
    id: 'welcome',
    route: '/',
    title: 'Welcome to ContentFlow',
    body: 'It writes, schedules and publishes your social content for you. Five things worth knowing, about thirty seconds.',
  },
  {
    id: 'platforms',
    route: '/channels',
    title: 'Start by connecting a platform',
    body: 'Everything ContentFlow makes ends up somewhere. Connect Facebook, TikTok, YouTube, Instagram, Telegram or LinkedIn, and each brand keeps its own set of accounts.',
    targets: ['[data-tour="channels"]'],
    place: 'right',
  },
  {
    id: 'content',
    route: '/review',
    title: 'Nothing goes out without you',
    body: 'Written drafts and AI posts wait here to be approved, edited or rejected. The number on the left is how many are waiting on you right now.',
    targets: ['[data-tour="review"]', '[data-tour="m-review"]'],
    place: 'right',
  },
  {
    id: 'compose',
    route: '/new',
    title: 'Write one yourself',
    body: 'Need something specific? Write it here or start from a prompt. Attach images and video, choose the brands and platforms, and set the time to post.',
    targets: ['[data-tour="new"]', '[data-tour="topbar-compose"]'],
    place: 'right',
  },
  {
    id: 'calendar',
    route: '/calendar',
    title: 'The month at a glance',
    body: 'Everything queued, scheduled and already published, so you can spot a gap, move a post, or just check what is going out next.',
    targets: ['[data-tour="calendar"]', '[data-tour="m-calendar"]'],
    place: 'right',
  },
  {
    id: 'ai',
    route: '/ai',
    title: 'Ask the AI Agent anything',
    body: 'Chat with it to research, plan and create. It already knows your brands, your channels and what has been posted.',
    targets: ['[data-tour="ai"]', '[data-tour="m-ai"]', '[data-tour="topbar-ai"]'],
    place: 'right',
  },
  {
    id: 'done',
    route: '/',
    title: 'That’s it — you’re set up',
    body: 'Next: connect a platform, then let Auto-generate write for you every morning. Bring other people in under Settings → Team.',
  },
]

// Anywhere can open the tour without prop drilling (same bus as
// `dispatch:open-settings`):  openTour()
export const openTour = () => window.dispatchEvent(new Event('dispatch:open-tour'))

const accountAgeMs = (user) => {
  const made = Date.parse(user?.created_at || '')
  return Number.isNaN(made) ? null : Date.now() - made
}

export const tourSeenAt = (user) => user?.preferences?.[SEEN_KEY] || null

export function shouldAutoStart(user) {
  if (!user || tourSeenAt(user)) return false
  const age = accountAgeMs(user)
  // No created_at (an older server) — better to show it once than not at all.
  return age == null || age < NEW_ACCOUNT_DAYS * 86400000
}

// Drop the steps this person's access doesn't include (App.jsx's <Guarded>
// would show "This part isn't in your access" instead of the page).
export const tourStepsFor = (user) => TOUR_STEPS.filter((s) => canOpen(user, s.route))

export function markTourSeen(updatePrefs) {
  if (!updatePrefs) return
  updatePrefs({ [SEEN_KEY]: new Date().toISOString() }).catch(() => {
    /* not saved — the next visit just shows the tour again */
  })
}
