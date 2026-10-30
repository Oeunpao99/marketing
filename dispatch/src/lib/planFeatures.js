// What the workspace's plan unlocks (backend app/plan_features.py — sent with GET /usage as
// `features`). The server refuses what the plan doesn't include (a 402 with the reason);
// this keeps the pages honest about it: a lock and an Upgrade instead of a button that fails.
import { useUsage } from './usage'

// the lowest plan with each feature — what the lock says to upgrade to
export const NEEDS = {
  auto_post: 'Growth',
  leads: 'Growth',
  boost: 'Growth',
  own_voice: 'Business',
  api: 'Business',
  export: 'Business',
  no_watermark: 'Starter',
}

export const FEATURE_NAMES = {
  auto_post: 'Posting automatically',
  leads: 'Leads & hand-off',
  boost: 'Boost suggestions',
  own_voice: 'Your own voice for videos',
  api: 'API & MCP',
  export: 'Excel / CSV export',
  no_watermark: 'Videos without the watermark',
}

/** The plan's features — null while the usage loads (treat as allowed: the server still checks). */
export function usePlanFeatures() {
  const { usage } = useUsage()
  return usage?.features || null
}

/** true / false — and true while loading, so nothing flashes locked. */
export const has = (features, key) => !features || !!features[key]

/** "2 of 3" style room left: { most, left } for brands / channels; most null = no limit. */
export function room(features, key, have) {
  const most = features ? features[key] : null
  return { most, left: most == null ? Infinity : Math.max(0, most - have) }
}
