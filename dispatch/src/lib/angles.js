// Labels for the content pillar / marketing angle / goal an AI caption was
// written with — mirrors PILLARS, ANGLES and GOALS in backend/app/content_ai.py
// (keys must match).
export const PILLAR_LABELS = {
  educate: 'Education',
  local_moment: 'Local moment',
  relatable: 'Relatable',
  community: 'Community',
  behind_scenes: 'Behind the scenes',
  product: 'Product',
  proof: 'Customer proof',
  promotion: 'Promotion',
}

// The pillars that pitch the product (content_ai.SELLING_PILLARS).
export const SELLING_PILLARS = ['product', 'proof', 'promotion']

// Chip colours: selling posts stand out so a too-salesy week is easy to spot.
export const pillarChipClass = (pillar) =>
  SELLING_PILLARS.includes(pillar) ? 'bg-amber-50 text-amber-700' : 'bg-brand-soft text-brand'

export const ANGLE_LABELS = {
  problem_solution: 'Problem → Solution',
  direct_offer: 'Direct offer',
  engagement: 'Engagement',
  story: 'Story',
  short_hook: 'Short & punchy',
  how_to: 'Tip / how-to',
  social_proof: 'Social proof',
}

export const GOAL_LABELS = {
  awareness: 'Awareness',
  engagement: 'Engagement',
  leads: 'Leads',
  sales: 'Sales',
}

// "Problem → Solution · Sales", or "" for a hand-made draft.
export function angleText(angle, goal) {
  return [ANGLE_LABELS[angle], GOAL_LABELS[goal]].filter(Boolean).join(' · ')
}
