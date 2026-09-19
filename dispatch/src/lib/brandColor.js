// Brands come from the live API, not a fixed list, so there's no stable index
// to hardcode colors against. Hashing the slug gives every brand a color
// that's deterministic and consistent across pages without needing a real
// "color" field in the database.
const PALETTE = ['#3B82F6', '#F59E0B', '#8B5CF6', '#166432', '#DB2777', '#0891B2']

export function colorForBrand(slug) {
  if (!slug) return PALETTE[0]
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
