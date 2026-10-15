import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth'
import { canOpen } from '../../lib/access'
import { BOSS, onPath } from '../../lib/nav'
import usePinnedHeight from '../../lib/usePinnedHeight'
import { STUDIO_TABS } from '../../lib/studioTabs'

// The pages of the section you're in (lib/nav.js `sub`) as tabs across the top
// of the page — the sidebar shows only the six sections, like the boss's
// design. Nothing shows on a section with a single page. The Content studio's
// "/ai" tab is shown as its four tools (/ai?tab=…), each a tab of its own.
const tabCls = (on) =>
  `-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${
    on ? 'border-brand font-semibold text-brand' : 'border-transparent font-medium text-ink-500 hover:text-ink-900'
  }`

export default function SectionTabs() {
  const { pathname, search } = useLocation()
  const { user } = useAuth()
  const section = BOSS.find((b) => b.sub?.some((x) => onPath(pathname, x.to)))
  const tabs = (section?.sub || []).filter((x) => canOpen(user, x.to))
  const shown = tabs.length >= 2
  const ref = useRef(null)
  usePinnedHeight(shown ? ref : { current: null }, '--tabs-h') // pinned blocks below start under the tabs
  // phones: the row scrolls sideways — keep the open tab in view
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname, search])
  if (!shown) return null
  // one Content studio tool (/ai?tab=…) as a tab
  const studioTab = (t, tour) => {
    const on = pathname === '/ai' && (new URLSearchParams(search).get('tab') || 'video') === t.id
    return (
      <Link key={t.id} to={`/ai?tab=${t.id}`} data-tour={tour} aria-current={on ? 'page' : undefined} className={tabCls(on)}>
        <t.icon size={14} aria-hidden="true" />
        {t.label}
      </Link>
    )
  }
  return (
    // Pinned under the top bar, like the page headers below it.
    <nav ref={ref} aria-label={section.label} className="sticky top-14 z-[18] w-full bg-canvas px-5 pt-3 lg:px-10">
      <div className="flex items-end gap-3 border-b border-ink-200/80">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {tabs.map((x) =>
          x.to === '/ai' ? (
            studioTab(STUDIO_TABS[0], x.tour)
          ) : (
            <NavLink key={x.to} to={x.to} data-tour={x.tour} className={({ isActive }) => tabCls(isActive)}>
              <x.icon size={14} aria-hidden="true" />
              {x.label}
            </NavLink>
          ),
        )}
        {/* Studio · Media Library stay side by side; the other tools follow */}
        {tabs.some((x) => x.to === '/ai') && STUDIO_TABS.slice(1).map((t) => studioTab(t))}
      </div>
      {/* a page can put its own buttons on this line (the Content studio chat's meter, New chat, History) */}
      <div id="section-actions" className="flex flex-none items-center pb-1" />
      </div>
    </nav>
  )
}
