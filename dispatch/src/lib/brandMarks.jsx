import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { colorForBrand } from './brandColor'
import { kitSrc } from '../components/brandkit/BrandKit'

// Each brand's logo (from its brand kit), shared by every brand list — one
// request for the whole app, refreshed after a minute.
let pending = null
let loadedAt = 0
const loadLogos = () => {
  if (!pending || Date.now() - loadedAt > 60000) {
    loadedAt = Date.now()
    pending = api
      .get('/brand-kit')
      .then((list) => {
        const logos = {}
        for (const a of list || []) if (a.kind === 'logo' && a.url && !(a.brand_id in logos)) logos[a.brand_id] = a.url
        return logos
      })
      .catch(() => ({}))
  }
  return pending
}

export function useBrandLogos() {
  const [logos, setLogos] = useState({})
  useEffect(() => {
    let live = true
    loadLogos().then((l) => live && setLogos(l))
    return () => {
      live = false
    }
  }, [])
  return logos
}

// A brand's logo as a small tile — its colour dot when it has no logo yet.
export function BrandMark({ brand, logo, size = 18 }) {
  if (!logo) return <span className="flex-none rounded-full" style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5), background: colorForBrand(brand?.slug) }} />
  return <img src={kitSrc(logo)} alt="" style={{ width: size, height: size }} className="flex-none rounded-[5px] bg-white object-contain ring-1 ring-ink-200" />
}

// For a Select's brand options: { icon: the logo } or { color: the brand's dot }.
export function useBrandMarks() {
  const logos = useBrandLogos()
  return (b) => (logos[b?.id] ? { icon: <BrandMark brand={b} logo={logos[b.id]} /> } : { color: colorForBrand(b?.slug) })
}
