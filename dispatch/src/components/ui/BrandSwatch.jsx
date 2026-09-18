import { BRANDS } from '../../data/brands'

const BRAND_COLOR = {
  assist: '#3B82F6',
  chum: '#F59E0B',
  hub: '#8B5CF6',
}

export function brandColor(id) {
  return BRAND_COLOR[id] || '#166432'
}

export function brandName(id) {
  return BRANDS.find((b) => b.id === id)?.name || id
}

export default function BrandSwatch({ id, size = 8, className = '' }) {
  return (
    <span
      className={`inline-block rounded-full flex-none ${className}`}
      style={{ width: size, height: size, background: brandColor(id), boxShadow: `0 0 8px ${brandColor(id)}30` }}
    />
  )
}
