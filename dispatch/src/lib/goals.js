// The 9 content goals in 3 stages the Plan & best time page works with —
// mirrors GOALS / DEFAULT_MIX in backend/app/goals.py (keys must match; every
// goal is made of AI topics, see PILLAR_LABELS in angles.js).

export const STAGES = {
  attract: { label: 'Attract', sub: 'Get found and followed', line: 'border-brand', text: 'text-brand', chip: 'bg-brand-soft text-brand' },
  nurture: { label: 'Nurture', sub: 'Teach and build trust', line: 'border-violet-500', text: 'text-violet-700', chip: 'bg-violet-50 text-violet-700' },
  convert: { label: 'Convert', sub: 'Turn interest into sales', line: 'border-orange-600', text: 'text-orange-700', chip: 'bg-orange-50 text-orange-800' },
}

export const GOALS = {
  reach: {
    stage: 'attract',
    label: 'Increase Reach',
    desc: 'Get discovered by new audiences',
    eg: 'relatable and funny posts, local moments, things people tag a friend on',
    kpi: 'Reach, Impressions',
  },
  followers: {
    stage: 'attract',
    label: 'Increase Followers',
    desc: 'Attract people to follow your page',
    eg: 'short quotes and shareable lines worth following for',
    kpi: 'Follower growth',
  },
  awareness: {
    stage: 'attract',
    label: 'Awareness',
    desc: 'Make people aware of problems and opportunities',
    eg: 'what’s new in the field, why it matters for a business',
    kpi: 'Reach, Views',
  },
  engagement: {
    stage: 'attract',
    label: 'Engagement',
    desc: 'Encourage interaction',
    eg: 'polls, this-or-that, questions that are easy to answer',
    kpi: 'Comments, Reactions',
  },
  education: {
    stage: 'nurture',
    label: 'Education',
    desc: 'Teach and provide value',
    eg: 'tips, how-tos, mistakes to avoid, quick checklists',
    kpi: 'Saves, Shares',
  },
  trust: {
    stage: 'nurture',
    label: 'Trust',
    desc: 'Build credibility',
    eg: 'behind the scenes, customer stories (from real facts only)',
    kpi: 'Engagement rate',
  },
  authority: {
    stage: 'nurture',
    label: 'Authority',
    desc: 'Position the company as the expert',
    eg: 'honest comparisons: old way vs new way, option A vs B',
    kpi: 'Shares, Mentions',
  },
  solution: {
    stage: 'convert',
    label: 'Solution',
    desc: 'Show how your product solves problems',
    eg: 'product demos, a feature at work, how-to with the product',
    kpi: 'Website clicks',
  },
  conversion: {
    stage: 'convert',
    label: 'Conversion',
    desc: 'Generate leads and sales',
    eg: 'offers, why now, a clear way to buy or sign up',
    kpi: 'Leads generated',
  },
}

export const DEFAULT_MIX = {
  reach: 15,
  followers: 10,
  awareness: 15,
  engagement: 10,
  education: 15,
  trust: 10,
  authority: 5,
  solution: 10,
  conversion: 10,
}

// Which goal each AI topic (PILLAR_LABELS key) counts towards — mirrors
// backend goals.GOALS[*].pillars; plans written before goals existed use it.
const GOAL_OF_PILLAR = {
  relatable: 'reach', local_moment: 'reach', quote: 'followers', trend: 'awareness', benefit: 'awareness',
  community: 'engagement', educate: 'education', behind_scenes: 'trust', proof: 'trust',
  comparison: 'authority', product: 'solution', promotion: 'conversion',
}
export const goalOfItem = (item) => item.content_goal || GOAL_OF_PILLAR[item.pillar] || ''

export const stageOf = (goal) => STAGES[GOALS[goal]?.stage]

/** What the AI does with a measured lesson (learning.py rule id) — shown next
 *  to the lesson on the Weekly page. */
export function ruleAction(r) {
  const id = r.id || ''
  if (id.startsWith('weak-')) return 'The AI uses this less in your next plans.'
  if (id.startsWith('timing-')) {
    const at = /go out at (\d\d:\d\d)/.exec(r.evidence || '')
    return at ? `Auto-posts on this platform now go out at ${at[1]}.` : 'Auto-posts use this time.'
  }
  if (id.startsWith('day-')) return 'The week’s strongest idea goes on this day.'
  return (
    {
      format: 'The AI favours this format in your plans.',
      pillar: 'The AI leans your topic mix towards it.',
      angle: 'The AI writes about half the ideas this way.',
      subject: 'This subject now comes round twice as often.',
      questions: 'Captions now end with a short question.',
      hashtags: 'Captions follow this for hashtags.',
      length: 'Captions follow this for length.',
    }[id] || 'The AI uses this when writing your posts.'
  )
}

/** The call to action of a caption — its last line before any hashtags
 *  (CAPTION FORMAT in content_ai.py), "" for a one-line caption. */
export function ctaOf(caption) {
  const lines = String(caption || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  while (lines.length && /^(#\S+\s*)+$/.test(lines[lines.length - 1])) lines.pop()
  return lines.length > 1 ? lines[lines.length - 1].replace(/^👉\s*/, '') : ''
}
