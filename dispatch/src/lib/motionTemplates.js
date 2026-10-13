// The Remotion video templates (motion/src — MotionPost.jsx, explainer.jsx,
// goaltemplates.jsx) and which content goal uses which. Mirrors the backend:
// app/motion.py STYLES / GOAL_STYLES. `story` is the chat's Story value
// (AIPromptPage MOTION_STORIES); the preview pictures are made by
// motion/tools/make_previews.sh into public/templates/.

export const MOTION_TEMPLATES = [
  {
    id: 'sell',
    story: 'sell',
    name: 'Sell',
    look: 'Dark, app-style — a phone chat, your product, numbers counting up',
    steps: ['Hook', 'Problem', 'What it costs', 'Solution working', 'Proof', 'Call to action'],
    goals: ['solution', 'conversion'],
  },
  {
    id: 'teach',
    story: 'teach',
    name: 'Teach',
    look: 'Light, hand-drawn — a person with moods, price tags, charts that grow',
    steps: ['Hook', 'A person’s story', 'Two choices', 'Chart', '3 tips', 'Happy ending'],
    goals: ['education', 'awareness', 'reach'],
  },
  {
    id: 'versus',
    story: 'versus',
    name: 'Compare',
    look: 'Red ✗ / green ✓ split screen',
    steps: ['Hook', 'Old way vs new way', 'Myths busted', 'Verdict', 'Share'],
    goals: ['authority'],
  },
  {
    id: 'poll',
    story: 'poll',
    name: 'Poll / quiz',
    look: 'Game-show stage — answer buttons and a countdown',
    steps: ['The challenge', '3 questions', 'Countdown', 'The answers', 'Comment'],
    goals: ['engagement'],
  },
  {
    id: 'quote',
    story: 'quote',
    name: 'Quote',
    look: 'Cinematic — your photo, darkened, the words written in slowly',
    steps: ['Intro', '3 lessons', 'Follow'],
    goals: ['followers'],
  },
  {
    id: 'testimonial',
    story: 'testimonial',
    name: 'Testimonial',
    look: 'Warm cream and gold — the customer, before → after, their result',
    steps: ['Hook', 'The customer', 'Before → after', 'The result', 'Their review*', 'Call to action'],
    note: '* only with a real customer’s words in your brief — otherwise it’s told as an example customer',
    goals: ['trust'],
  },
]

// A goal's template; the ones without their own yet use Teach, and say which
// template they'll get (the planned next templates).
export const GOAL_TEMPLATE = {
  reach: { id: 'teach', planned: 'Relatable POV' },
  followers: { id: 'quote' },
  awareness: { id: 'teach', planned: 'Trend / news' },
  engagement: { id: 'poll' },
  education: { id: 'teach' },
  trust: { id: 'testimonial' },
  authority: { id: 'versus' },
  solution: { id: 'sell' },
  conversion: { id: 'sell', planned: 'Offer / promo' },
}

export const templateById = (id) => MOTION_TEMPLATES.find((t) => t.id === id)
