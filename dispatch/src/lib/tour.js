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
    body: 'It writes posts for your brand, schedules them, and publishes them to your social accounts. Here are the five things you will use most — it takes about thirty seconds.',
  },
  {
    id: 'platforms',
    route: '/channels',
    title: 'First, connect your accounts',
    body: 'ContentFlow can only post where it is connected. Open Platforms and link Facebook, TikTok, YouTube, Instagram, Telegram or LinkedIn. Nothing can be published until you do.',
    targets: ['[data-tour="channels"]'],
    place: 'right',
  },
  {
    id: 'content',
    route: '/review',
    title: 'Approve what gets written',
    body: 'Every draft waits for you here first. Read it, change the wording if you want, then approve it and ContentFlow schedules it for you. The number beside Content is how many are waiting.',
    targets: ['[data-tour="review"]', '[data-tour="m-review"]'],
    place: 'right',
  },
  {
    id: 'compose',
    route: '/new',
    title: 'Or write a post yourself',
    body: 'Do not want to wait for a draft? Write one here. Add a photo or video, choose the brand and the platforms it goes to, and pick the day and time.',
    targets: ['[data-tour="new"]', '[data-tour="topbar-compose"]'],
    place: 'right',
  },
  {
    id: 'calendar',
    route: '/calendar',
    title: 'Check what is going out',
    body: 'The Calendar shows the whole month: everything scheduled, everything posting, and everything already published. Drag a post to move it, or click one to edit it.',
    targets: ['[data-tour="calendar"]', '[data-tour="m-calendar"]'],
    place: 'right',
  },
  {
    id: 'ai',
    route: '/ai',
    title: 'Ask the AI Agent anything',
    body: 'Chat with it to research a topic, plan a campaign, or create a post in one go. It already knows your brands, your channels and what you have published.',
    targets: ['[data-tour="ai"]', '[data-tour="m-ai"]', '[data-tour="topbar-ai"]'],
    place: 'right',
  },
  {
    id: 'done',
    route: '/',
    title: 'That is everything — you are set up',
    body: 'Your next step is connecting a platform. After that, switch on Auto-generate and it will write for you every morning. Invite the rest of your team under Settings, then Team.',
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
