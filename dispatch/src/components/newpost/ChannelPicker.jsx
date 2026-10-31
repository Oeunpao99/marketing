import { FaLinkedin } from 'react-icons/fa'
import { FiCheck } from 'react-icons/fi'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { PLAT } from '../../data/brands'
import { colorForBrand } from '../../lib/brandColor'
import { PLAT_BRAND_CLASS as PLAT_COLORS } from '../ui/PlatformIcon'
import { BrandMark, useBrandLogos } from '../../lib/brandMarks'

const ICONS = { facebook: SiFacebook, instagram: SiInstagram, tiktok: SiTiktok, youtube: SiYoutube, telegram: SiTelegram, linkedin: FaLinkedin }

/** Where a post goes: each brand is a section, each connected social account is its own
 *  big card (platform logo, platform name, the account's name), three across on a wide
 *  screen — so which account is which is never a guess. Tick a card to send the post there. */
export default function ChannelPicker({ brands, channels, selectedChannels, toggle }) {
  const logos = useBrandLogos()
  const isOn = (id) => selectedChannels.some((x) => x.id === id)
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[11px] font-bold tracking-[.08em] uppercase text-ink-400">Where it goes</h2>
      <div className="space-y-7">
        {brands.map((b) => {
          const rows = channels.filter((c) => c.b === b.slug)
          const live = rows.filter((c) => c.s !== 'off')
          const picked = live.filter((c) => isOn(c.id)).length
          const color = colorForBrand(b.slug)
          return (
            <div key={b.id}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {logos[b.id] ? (
                  <BrandMark brand={b} logo={logos[b.id]} size={26} />
                ) : (
                  <span className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}30` }} />
                )}
                <span className="text-[16px] font-bold text-ink-900">{b.name}</span>
                {b.lang && <span className="text-[12.5px] text-ink-400">{b.lang}</span>}
                {live.length > 0 && (
                  <span className="ml-auto flex items-center gap-3 text-[12.5px]">
                    <span className="text-ink-500">
                      {picked} of {live.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => live.forEach((c) => toggle(c.id, picked < live.length))}
                      className="font-semibold text-brand hover:underline"
                    >
                      {picked < live.length ? 'Select all' : 'Clear'}
                    </button>
                  </span>
                )}
              </div>
              {rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-5 text-[13px] text-ink-400">No channels connected for this brand yet — add them in Setup → Channels.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((c) => (
                    <ChannelCard
                      key={c.id}
                      platform={c.p}
                      handle={c.s === 'off' ? '' : c.h}
                      off={c.s === 'off'}
                      checked={isOn(c.id)}
                      onChange={(v) => toggle(c.id, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ChannelCard({ platform, handle, off, checked, onChange }) {
  const name = PLAT[platform]?.name || platform
  const Icon = ICONS[platform]
  return (
    <label
      className={`group relative flex min-h-[88px] items-center gap-4 rounded-2xl border-2 px-4 py-3.5 transition-all duration-150 ${
        off
          ? 'cursor-not-allowed border-ink-100 bg-ink-50/60'
          : checked
            ? 'cursor-pointer border-brand bg-brand-soft/30 shadow-card'
            : 'cursor-pointer border-ink-200 bg-white hover:border-ink-300 hover:shadow-card'
      }`}
    >
      <input type="checkbox" className="peer sr-only" disabled={off} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`grid h-12 w-12 flex-none place-items-center rounded-xl bg-ink-50 ring-1 ring-ink-100 ${off ? 'opacity-40' : ''} ${PLAT_COLORS[name] || 'text-ink-500'}`}>
        {Icon && <Icon size={24} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-bold leading-tight ${off ? 'text-ink-400' : 'text-ink-900'}`}>{name}</span>
        <span className={`mt-0.5 block truncate text-[13px] ${off ? 'text-ink-400' : 'text-ink-600'}`} title={handle || undefined}>
          {off ? 'Not connected' : handle || 'Connected'}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 transition-colors ${
          checked ? 'border-brand bg-brand text-white' : 'border-ink-300 text-transparent group-hover:border-ink-400'
        } ${off ? 'opacity-0' : ''}`}
      >
        <FiCheck size={14} strokeWidth={3} />
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-brand/30 peer-focus-visible:ring-4" aria-hidden="true" />
    </label>
  )
}
