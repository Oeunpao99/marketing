import { useState } from 'react'
import { FiCheck } from 'react-icons/fi'
import { useStore } from '../../store'
import { colorForBrand } from '../../lib/brandColor'
import BrandVoice from '../brandkit/BrandVoice'

// Content studio → Voice: record or upload the owner's voice so videos can
// speak in it — one voice per brand (the same card as Products → Brand kit).
export default function VoiceStudio() {
  const { brands, showToast } = useStore()
  const [pick, setPick] = useState(null)
  const brand = brands.find((b) => b.id === pick) || brands[0]

  if (!brands.length) return <div className="h-40 rounded-2xl skeleton" />
  return (
    <div className="space-y-5">
      {brands.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Brand">
          {brands.map((b) => {
            const on = b.id === brand.id
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setPick(b.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  on ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-line'
                }`}
              >
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: colorForBrand(b.slug) }} />
                {b.name}
                {b.voiceReady && <FiCheck size={12} className="text-emerald-600" aria-label="has a voice" />}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid">
        <BrandVoice key={brand.id} brand={brand} showToast={showToast} />
      </div>
    </div>
  )
}
