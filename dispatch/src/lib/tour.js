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
// The steps follow the sidebar from the top (lib/nav.js BOSS — each anchor is
// that item's `tour`). Keep these in step with the sidebar when it changes.
export const TOUR_STEPS = [
  {
    id: 'welcome',
    route: '/',
    title: 'Welcome to Marketing ឆ្លាតវៃ',
    body: 'It plans your posts, makes the pictures and videos, and publishes them to your social accounts. Here are the places you will use most — it takes about thirty seconds.',
  },
  {
    id: 'command',
    route: '/command',
    title: 'Your day at a glance',
    body: 'Command center is home: what needs you today, what is going out, new leads, and how your posts are doing.',
    targets: ['[data-tour="command"]'],
    place: 'right',
  },
  {
    id: 'setup',
    route: '/channels',
    title: 'Start in Setup: brand → platform → products',
    body: 'Setup is where you begin: create your brand, connect Facebook, Instagram, TikTok, YouTube… so it can publish, then add its products so the AI writes true posts. A line at the top of the page shows where you are.',
    targets: ['[data-tour="channels"]'],
    place: 'right',
  },
  {
    id: 'plan',
    route: '/weekly',
    title: 'Approve your plan',
    body: 'Plan & best time holds your weekly plan — read each post, change it if you want, and approve it. The number beside it is how many are waiting. Its Calendar tab shows everything scheduled and published.',
    targets: ['[data-tour="plan"]', '[data-tour="m-review"]', '[data-tour="m-calendar"]'],
    place: 'right',
  },
  {
    id: 'studio',
    route: '/ai',
    title: 'Make pictures and videos',
    body: 'Content studio creates images, videos and Remotion clips for your brand — describe what you want, or pick a template. Everything you make is kept in its Media Library.',
    targets: ['[data-tour="ai"]', '[data-tour="m-ai"]', '[data-tour="topbar-ai"]'],
    place: 'right',
  },
  {
    id: 'compose',
    route: '/new',
    title: 'Or write a post yourself',
    body: 'Compose writes one post now: add a photo or video, choose the brand and the channels, and pick the day and time.',
    targets: ['[data-tour="topbar-compose"]'],
    place: 'bottom',
  },
  {
    id: 'done',
    route: '/',
    title: 'That is everything — you are set up',
    body: 'Your next step is connecting a channel under Setup. Then switch on Autopilot and it will plan for you every week. Invite your team under Settings, then Team.',
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
