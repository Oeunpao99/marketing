import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaLinkedin } from 'react-icons/fa'
import {
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiExternalLink,
  FiLayers,
  FiPlus,
  FiSearch,
  FiSend,
  FiX,
} from 'react-icons/fi'
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from 'react-icons/si'
import { PLAT } from '../../data/brands'
import { colorForBrand } from '../../lib/brandColor'
import { BrandMark, useBrandLogos } from '../../lib/brandMarks'

const PLATFORM_THEMES = {
  facebook: {
    name: 'Facebook',
    Icon: SiFacebook,
    color: '#1877F2',
    bg: 'bg-[#1877F2]/10',
    border: 'border-[#1877F2]/30',
    text: 'text-[#1877F2]',
    checkedBorder: 'border-[#1877F2]',
    checkedBg: 'bg-[#1877F2]/5',
    pill: 'bg-[#1877F2]/10 text-[#1877F2]',
  },
  tiktok: {
    name: 'TikTok',
    Icon: SiTiktok,
    color: '#000000',
    bg: 'bg-night-900/10 dark:bg-white/10',
    border: 'border-night-900/20 dark:border-white/20',
    text: 'text-night-900 dark:text-white',
    checkedBorder: 'border-night-900 dark:border-white',
    checkedBg: 'bg-night-900/5 dark:bg-white/5',
    pill: 'bg-night-900/10 text-night-900 dark:bg-white/15 dark:text-white',
  },
  youtube: {
    name: 'YouTube',
    Icon: SiYoutube,
    color: '#FF0000',
    bg: 'bg-[#FF0000]/10',
    border: 'border-[#FF0000]/30',
    text: 'text-[#FF0000]',
    checkedBorder: 'border-[#FF0000]',
    checkedBg: 'bg-[#FF0000]/5',
    pill: 'bg-[#FF0000]/10 text-[#FF0000]',
  },
  instagram: {
    name: 'Instagram',
    Icon: SiInstagram,
    color: '#E4405F',
    bg: 'bg-[#E4405F]/10',
    border: 'border-[#E4405F]/30',
    text: 'text-[#E4405F]',
    checkedBorder: 'border-[#E4405F]',
    checkedBg: 'bg-[#E4405F]/5',
    pill: 'bg-[#E4405F]/10 text-[#E4405F]',
  },
  telegram: {
    name: 'Telegram',
    Icon: SiTelegram,
    color: '#229ED9',
    bg: 'bg-[#229ED9]/10',
    border: 'border-[#229ED9]/30',
    text: 'text-[#229ED9]',
    checkedBorder: 'border-[#229ED9]',
    checkedBg: 'bg-[#229ED9]/5',
    pill: 'bg-[#229ED9]/10 text-[#229ED9]',
  },
  linkedin: {
    name: 'LinkedIn',
    Icon: FaLinkedin,
    color: '#0A66C2',
    bg: 'bg-[#0A66C2]/10',
    border: 'border-[#0A66C2]/30',
    text: 'text-[#0A66C2]',
    checkedBorder: 'border-[#0A66C2]',
    checkedBg: 'bg-[#0A66C2]/5',
    pill: 'bg-[#0A66C2]/10 text-[#0A66C2]',
  },
}

/**
 * Creative, clean, and intuitive Channel & Page Selector
 * - Filter tabs by Brand or All Brands
 * - Distinct platform branding & badges (Facebook Blue, TikTok, YouTube Red, Telegram, etc.)
 * - Selected accounts tray with quick dismiss chips
 * - Compact expandable drawer for unconnected channels
 */
export default function ChannelPicker({ brands, channels, selectedChannels, toggle }) {
  const logos = useBrandLogos()
  const [activeBrand, setActiveBrand] = useState('all') // 'all' or brand slug
  const [q, setQ] = useState('')
  const [expandedOff, setExpandedOff] = useState({}) // { [brandSlug]: boolean }

  const isOn = (id) => selectedChannels.some((x) => x.id === id)

  // Map channels by brand
  const channelsByBrand = useMemo(() => {
    const map = {}
    for (const b of brands) {
      const rows = channels.filter((c) => c.b === b.slug)
      map[b.slug] = {
        all: rows,
        live: rows.filter((c) => c.s !== 'off'),
        off: rows.filter((c) => c.s === 'off'),
      }
    }
    return map
  }, [brands, channels])

  // Total live channels count across all brands
  const totalLiveChannels = useMemo(() => {
    return channels.filter((c) => c.s !== 'off').length
  }, [channels])

  // Brands matching search filter
  const filteredBrands = useMemo(() => {
    const query = q.trim().toLowerCase()
    return brands.filter((b) => {
      if (activeBrand !== 'all' && b.slug !== activeBrand) return false
      if (!query) return true

      // Match brand name or slug
      if (b.name.toLowerCase().includes(query) || b.slug.toLowerCase().includes(query)) return true

      // Match channel platform name or handle
      const brandChannels = channelsByBrand[b.slug]?.all || []
      return brandChannels.some(
        (c) =>
          c.p.toLowerCase().includes(query) ||
          (PLAT[c.p]?.name || '').toLowerCase().includes(query) ||
          (c.h || '').toLowerCase().includes(query),
      )
    })
  }, [brands, activeBrand, q, channelsByBrand])

  const brandsPickedCount = new Set(selectedChannels.map((c) => c.b)).size

  const toggleOffDrawer = (slug) => {
    setExpandedOff((prev) => ({ ...prev, [slug]: !prev[slug] }))
  }

  // Select all or clear visible channels
  const visibleLiveChannels = useMemo(() => {
    return filteredBrands.flatMap((b) => channelsByBrand[b.slug]?.live || [])
  }, [filteredBrands, channelsByBrand])

  const allVisibleSelected =
    visibleLiveChannels.length > 0 && visibleLiveChannels.every((c) => isOn(c.id))

  const handleSelectAllVisible = () => {
    const shouldSelect = !allVisibleSelected
    visibleLiveChannels.forEach((c) => toggle(c.id, shouldSelect))
  }

  return (
    <section className="mb-8 space-y-4">
      {/* Header bar: Title, Selected Summary, Search & Quick Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-soft text-brand">
              <FiSend size={13} />
            </span>
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-700">
              Where it goes
            </h2>
          </div>
          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-600">
            {totalLiveChannels} connected
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Search */}
          <div className="relative flex-1 sm:w-60">
            <FiSearch
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search page or brand…"
              className="w-full rounded-xl border border-ink-200 bg-white py-1.5 pl-8 pr-7 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                aria-label="Clear search"
              >
                <FiX size={13} />
              </button>
            )}
          </div>

          {/* Quick Select All / Clear Visible button */}
          {visibleLiveChannels.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllVisible}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-brand hover:text-brand shadow-xs transition-colors"
            >
              <FiCheck size={13} />
              {allVisibleSelected ? 'Clear visible' : 'Select all'}
            </button>
          )}
        </div>
      </div>

      {/* Selected Channels Tray (appears when 1 or more channels selected) */}
      {selectedChannels.length > 0 && (
        <div className="rounded-2xl border border-brand-line bg-gradient-to-r from-brand-soft/40 to-brand-soft/20 p-3 sm:p-3.5 shadow-xs animate-fadein">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white text-[11px] font-bold">
                ✓
              </span>
              <span className="text-[13px] font-bold text-ink-900">
                Ready to post to {selectedChannels.length} account{selectedChannels.length === 1 ? '' : 's'}
                <span className="text-ink-500 font-normal"> across {brandsPickedCount} brand{brandsPickedCount === 1 ? '' : 's'}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => selectedChannels.forEach((c) => toggle(c.id, false))}
              className="text-[12px] font-medium text-ink-500 hover:text-brand underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>

          {/* Interactive chips of selected accounts */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
            {selectedChannels.map((c) => {
              const theme = PLATFORM_THEMES[c.p] || {}
              const Icon = theme.Icon
              const brand = brands.find((b) => b.slug === c.b)
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-800 shadow-xs"
                >
                  {Icon && <Icon size={12} style={{ color: theme.color }} />}
                  <span className="font-bold text-ink-900">{theme.name || c.p}</span>
                  <span className="text-ink-500 truncate max-w-[120px]">{c.h || brand?.name}</span>
                  <button
                    type="button"
                    onClick={() => toggle(c.id, false)}
                    className="ml-0.5 text-ink-400 hover:text-red-500"
                    title="Remove from post"
                  >
                    <FiX size={12} />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Brand Navigation Tabs (when multiple brands exist) */}
      {brands.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[12.5px] scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveBrand('all')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-semibold transition-all whitespace-nowrap shadow-xs ${activeBrand === 'all'
                ? 'bg-brand text-white shadow-glow'
                : 'bg-white border border-ink-200/80 text-ink-700 hover:border-brand/40'
              }`}
          >
            <FiLayers size={13} />
            <span>All Brands</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[11px] ${activeBrand === 'all' ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600'
                }`}
            >
              {totalLiveChannels}
            </span>
          </button>

          {brands.map((b) => {
            const bLive = channelsByBrand[b.slug]?.live || []
            const bPicked = bLive.filter((c) => isOn(c.id)).length
            const isTabActive = activeBrand === b.slug
            const brandColor = colorForBrand(b.slug)

            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBrand(b.slug)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 font-semibold transition-all whitespace-nowrap shadow-xs ${isTabActive
                    ? 'bg-brand text-white shadow-glow'
                    : 'bg-white border border-ink-200/80 text-ink-700 hover:border-brand/40'
                  }`}
              >
                {/* Brand mini circle */}
                <span
                  className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: brandColor }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <span>{b.name}</span>

                {/* Counts */}
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10.5px] ${isTabActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600'
                    }`}
                >
                  {bPicked > 0 ? `${bPicked}/${bLive.length}` : bLive.length}
                </span>

                {/* Dot indicator if picked */}
                {bPicked > 0 && !isTabActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Brand Sections */}
      <div className="space-y-4">
        {filteredBrands.map((b) => {
          const { live, off } = channelsByBrand[b.slug] || { live: [], off: [] }
          const picked = live.filter((c) => isOn(c.id)).length
          const brandColor = colorForBrand(b.slug)
          const allPicked = live.length > 0 && picked === live.length
          const isDrawerOpen = !!expandedOff[b.slug]

          return (
            <div
              key={b.id}
              className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-card transition-all duration-200 ${picked > 0 ? 'border-brand/50 shadow-sm' : 'border-ink-200/80 hover:border-ink-300'
                }`}
            >
              {/* Brand Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3.5 mb-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  {logos[b.id] ? (
                    <BrandMark brand={b} logo={logos[b.id]} size={38} />
                  ) : (
                    <span
                      className="grid h-9 w-9 flex-none place-items-center rounded-xl text-[15px] font-bold text-white shadow-xs"
                      style={{ background: brandColor }}
                    >
                      {b.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[16.5px] font-bold text-ink-900 tracking-tight">
                        {b.name}
                      </h3>
                      {b.lang && (
                        <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-600">
                          {b.lang}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-500 mt-0.5">
                      {live.length} active channel{live.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                {/* Right side: Selection counter & toggle button */}
                {live.length > 0 && (
                  <div className="flex items-center gap-3 text-[12.5px]">
                    <span
                      className={`font-semibold ${picked > 0 ? 'text-brand' : 'text-ink-400'
                        }`}
                    >
                      {picked} of {live.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => live.forEach((c) => toggle(c.id, !allPicked))}
                      className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-brand hover:text-brand shadow-xs transition-colors"
                    >
                      {allPicked ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                )}
              </div>

              {/* Connected Channel Cards Grid */}
              {live.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {live.map((c) => (
                    <CreativeChannelCard
                      key={c.id}
                      platform={c.p}
                      handle={c.h}
                      checked={isOn(c.id)}
                      onChange={(v) => toggle(c.id, v)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-[13px] text-ink-400">
                  No active channels connected for {b.name}.
                </div>
              )}

              {/* Clean, Non-Intrusive Unconnected Channels Bar */}
              {off.length > 0 && (
                <div className="mt-3 pt-3 border-t border-ink-100/70">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() => toggleOffDrawer(b.slug)}
                      className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-800 font-medium"
                    >
                      {isDrawerOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                      <span>
                        {off.length} unconnected platform{off.length === 1 ? '' : 's'} (
                        {[...new Set(off.map((c) => PLAT[c.p]?.name || c.p))].join(' · ')})
                      </span>
                    </button>

                    <Link
                      to="/channels"
                      className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand hover:underline"
                    >
                      <span>Connect in Channels</span>
                      <FiExternalLink size={11} />
                    </Link>
                  </div>

                  {/* Expanded view showing greyed out cards */}
                  {isDrawerOpen && (
                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 animate-fadein">
                      {off.map((c) => {
                        const theme = PLATFORM_THEMES[c.p] || {}
                        const Icon = theme.Icon
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between rounded-xl border border-dashed border-ink-200 bg-canvas-soft px-3 py-2 text-[12px] opacity-75"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {Icon && <Icon size={14} className="text-ink-400" />}
                              <span className="font-semibold text-ink-600 truncate">
                                {theme.name || c.p}
                              </span>
                            </div>
                            <Link
                              to="/channels"
                              className="text-[11px] font-bold text-brand hover:underline flex-none ml-1"
                            >
                              + Add
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filteredBrands.length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-[13px] text-ink-400 space-y-1">
            <p className="font-medium text-ink-600">No channels or brands found matching "{q}".</p>
            <p className="text-[12px] text-ink-400">Try searching by platform name like "TikTok" or "Facebook".</p>
          </div>
        )}
      </div>
    </section>
  )
}

/** Modern, authentic branded platform card */
function CreativeChannelCard({ platform, handle, checked, onChange }) {
  const meta = PLAT[platform] || {}
  const theme = PLATFORM_THEMES[platform] || {
    name: platform,
    color: '#6366F1',
    bg: 'bg-brand-soft',
    text: 'text-brand',
    checkedBorder: 'border-brand',
    checkedBg: 'bg-brand-soft/20',
    pill: 'bg-brand-soft text-brand',
  }
  const Icon = theme.Icon

  return (
    <label
      className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 p-3 transition-all duration-150 select-none ${checked
          ? `${theme.checkedBorder} ${theme.checkedBg} shadow-xs -translate-y-0.5`
          : 'border-ink-200/80 bg-white hover:border-ink-300 hover:shadow-xs'
        }`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />

      {/* Left: Platform Icon Badge */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span
          className={`grid h-10 w-10 flex-none place-items-center rounded-xl shadow-xs transition-transform duration-150 group-hover:scale-105 ${checked ? 'ring-2 ring-white/60' : ''
            }`}
          style={{
            backgroundColor: checked ? theme.color : undefined,
            color: checked ? '#ffffff' : theme.color,
          }}
        >
          {Icon ? (
            <Icon size={19} className={checked ? 'text-white' : ''} />
          ) : (
            <span className="font-bold text-[13px]">
              {(theme.name || platform).charAt(0)}
            </span>
          )}
        </span>

        {/* Center: Details (Platform name, handle, type hint) */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="block text-[13.5px] font-bold text-ink-900 leading-tight">
              {theme.name || meta.name || platform}
            </span>
            {meta.as && (
              <span className="text-[10px] text-ink-400 font-medium hidden sm:inline">
                · {meta.as.replace('Posts as a ', '').replace('Posts to ', '')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-none max-w-[130px] sm:max-w-[150px] ${checked ? 'bg-white/80 text-ink-800' : 'bg-canvas text-ink-600'
                }`}
              title={handle || undefined}
            >
              {handle || 'Connected Page'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Circular Checkbox Indicator */}
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 transition-all duration-150 ${checked
            ? 'border-brand bg-brand text-white shadow-xs scale-105'
            : 'border-ink-300 bg-white text-transparent group-hover:border-ink-400'
          }`}
      >
        <FiCheck size={11} strokeWidth={3.5} />
      </span>

      {/* Focus ring */}
      <span
        className="pointer-events-none absolute inset-0 rounded-xl ring-brand/30 peer-focus-visible:ring-4"
        aria-hidden="true"
      />
    </label>
  )
}
