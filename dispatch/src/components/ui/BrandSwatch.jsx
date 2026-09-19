import { colorForBrand } from '../../lib/brandColor'

export function brandColor(id) {
  return colorForBrand(id)
}

export default function BrandSwatch({ id, size = 8, className = '' }) {
  return (
    <span
      className={`inline-block rounded-full flex-none ${className}`}
      style={{ width: size, height: size, background: brandColor(id), boxShadow: `0 0 8px ${brandColor(id)}30` }}
    />
  )
}
