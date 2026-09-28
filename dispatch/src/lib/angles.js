// Labels for the marketing angle / goal an AI caption was written with —
// mirrors ANGLES and GOALS in backend/app/content_ai.py (keys must match).
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
