import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth'
import { canOpen } from '../../lib/access'
import { BOSS, onPath } from '../../lib/nav'

// The pages of the section you're in (lib/nav.js `sub`) as tabs across the top
// of the page — the sidebar shows only the six sections, like the boss's
// design. Nothing shows on a section with a single page.
export default function SectionTabs() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const section = BOSS.find((b) => b.sub?.some((x) => onPath(pathname, x.to)))
  const tabs = (section?.sub || []).filter((x) => canOpen(user, x.to))
  if (tabs.length < 2) return null
  return (
    <nav aria-label={section.label} className="w-full px-5 pt-3 lg:px-10">
      <div className="flex gap-1 overflow-x-auto border-b border-ink-200/80">
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
    </nav>
  )
}
