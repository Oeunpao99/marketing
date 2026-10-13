import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth'
import { canOpen } from '../../lib/access'
import { BOSS, onPath } from '../../lib/nav'
import usePinnedHeight from '../../lib/usePinnedHeight'

// The pages of the section you're in (lib/nav.js `sub`) as tabs across the top
// of the page — the sidebar shows only the six sections, like the boss's
// design. Nothing shows on a section with a single page.
export default function SectionTabs() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const section = BOSS.find((b) => b.sub?.some((x) => onPath(pathname, x.to)))
  const tabs = (section?.sub || []).filter((x) => canOpen(user, x.to))
  const shown = tabs.length >= 2
  const ref = useRef(null)
  usePinnedHeight(shown ? ref : { current: null }, '--tabs-h') // pinned blocks below start under the tabs
  if (!shown) return null
  return (
    // Pinned under the top bar, like the page headers below it.
    <nav ref={ref} aria-label={section.label} className="sticky top-14 z-[18] w-full bg-canvas px-5 pt-3 lg:px-10">
      <div className="flex items-end gap-3 border-b border-ink-200/80">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {tabs.map((x) => (
          <NavLink
            key={x.to}
            to={x.to}
            data-tour={x.tour}
            className={({ isActive }) =>
              `-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${
                isActive ? 'border-brand font-semibold text-brand' : 'border-transparent font-medium text-ink-500 hover:text-ink-900'
              }`
            }
          >
            <x.icon size={14} aria-hidden="true" />
            {x.label}
          </NavLink>
        ))}
      </div>
      {/* a page can put its own buttons on this line (the Content studio chat's meter, New chat, History) */}
      <div id="section-actions" className="flex flex-none items-center pb-1" />
      </div>
    </nav>
  )
}
