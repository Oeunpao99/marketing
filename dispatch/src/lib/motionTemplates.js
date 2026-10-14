// The Remotion video templates (motion/src — MotionPost.jsx, explainer.jsx,
// goaltemplates.jsx) and which content goal uses which. Mirrors the backend:
// app/motion.py STYLES / GOAL_STYLES. `story` is the chat's Story value
// (AIPromptPage MOTION_STORIES); the preview pictures are made by
// motion/tools/make_previews.sh into public/templates/.

export const MOTION_TEMPLATES = [
  {
    id: 'training',
    story: 'training',
    name: 'Training',
    look: 'Clean corporate deck — chapters, key points, checklists, recap; 16:9 or 9:16, up to 10 min',
    steps: ['Title', 'Chapters', 'Key points', 'Checklists', 'Recap', 'Closing'],
    note: 'Paste your training script with Review first on — the AI follows your parts as chapters',
    goals: ['education'],
  },
  {
    id: 'custom',
    story: 'custom',
    name: 'Designed for you',
    look: 'A new look every video — colours from your topic, your app screenshots zoomed and clicked',
    steps: ['Hook', 'The problem', 'Shown working', 'Proof', 'Call to action'],
    note: 'Add app screenshots in Products → Brand kit to have them shown',
    goals: ['solution', 'education', 'awareness'],
  },
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
  {
    id: 'clarity',
    story: 'clarity',
    name: 'SaaS explainer',
    look: 'Calm white and light blue — notifications flying in, your app rising in a frame, chips orbiting, phones turning',
    steps: ['Hook', 'The mess today', 'The product', 'How it works', 'Call to action'],
    note: 'Add app screenshots in Products → Brand kit to have them in the frame and the phones',
    goals: ['education', 'awareness'],
  },
  {
    id: 'launch',
    story: 'launch',
    name: 'Product launch',
    look: 'Cinematic purple launch film — a tilted app card, the camera pushes in, a hand clicks the button',
    steps: ['Hook', 'Introducing', 'The click', 'Your screens', 'Call to action'],
    note: 'Add 2+ app screenshots in Products → Brand kit for the screen deck',
    goals: ['conversion'],
  },
  {
    id: 'showcase',
    story: 'showcase',
    name: 'Showcase',
    look: 'Bright SaaS promo — apps floating in bubbles, your table and board views, a word that rolls and lands',
    steps: ['Hook', 'Who it’s for', 'Works with', 'Shown working', 'Call to action'],
    note: 'Table and board rows are sample data, never real customers',
    goals: ['solution'],
  },
  // SaaS / AI — one dark, glowing look (motion/src/saas.jsx)
  {
    id: 'trend',
    story: 'trend',
    name: 'AI News',
    look: 'Dark AI look — news cards, a live ticker, what it means for you',
    steps: ['Hook', 'What’s new', 'What it means', 'Follow'],
    goals: ['awareness'],
  },
  {
    id: 'pov',
    story: 'pov',
    name: 'POV',
    look: 'Dark AI look — a “POV:” moment, the phone blowing up, the relief',
    steps: ['POV hook', 'Notifications', 'The turn', 'Tag a friend'],
    goals: ['reach'],
  },
  {
    id: 'demo',
    story: 'demo',
    name: 'Product demo',
    look: 'Dark AI look — your product in an app window, clicked step by step',
    steps: ['Hook', 'Step 1-2-3', 'Result', 'Call to action'],
    goals: ['solution'],
  },
  {
    id: 'offer',
    story: 'offer',
    name: 'Offer',
    look: 'Dark AI look — a glowing pricing card and one clear action',
    steps: ['Hook', 'What you get', 'The offer', 'Call to action'],
    note: 'Prices and discounts only from your brief or product details',
    goals: ['conversion'],
  },
]

// Each goal's templates — the weekly plan takes one of them at random per
// video (app/motion.py GOAL_STYLES).
export const GOAL_TEMPLATES = {
  reach: ['pov', 'teach'],
  followers: ['quote'],
  awareness: ['trend', 'teach', 'custom', 'clarity'],
  engagement: ['poll'],
  education: ['teach', 'custom', 'training', 'clarity'],
  trust: ['testimonial'],
  authority: ['versus'],
  solution: ['sell', 'demo', 'custom', 'showcase'],
  conversion: ['offer', 'sell', 'launch'],
}

export const templateById = (id) => MOTION_TEMPLATES.find((t) => t.id === id)
