import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import SectionTabs from './SectionTabs'
import Topbar from './Topbar'
import MobileBar from './MobileBar'
import AIAssistant from '../ai/AIAssistant'
import CreateBrandDrawer from './CreateBrandDrawer'
import AppUpdate from './AppUpdate'
import OnboardingTour from './OnboardingTour'
import WelcomeHello from './WelcomeHello'
import CreditClaimFx from './CreditClaimFx'
import NewTemplates from './NewTemplates'
import NewFeature from './NewFeature'
import { useStore } from '../../store'
import { useAutoRunWatcher } from '../../lib/autoRuns'
import { useGenJobWatcher } from '../../lib/genJobs'
import { useAppBadge } from '../../lib/notifications'

const KEY = 'dispatch.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// The sidebar's width — drag its right edge (double-click resets).
const WIDTH_KEY = 'dispatch.sidebarWidth'
const WIDTH_DEFAULT = 252
const WIDTH_MIN = 220
const WIDTH_MAX = 420
const clampWidth = (w) => Math.round(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, w)))

function readWidth() {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY))
    return w ? clampWidth(w) : WIDTH_DEFAULT
  } catch {
    return WIDTH_DEFAULT
  }
}

function saveWidth(w) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    /* ignore */
  }
}

/** The grab strip on the sidebar's right edge (wide screens only). */
function ResizeHandle({ width, onChange }) {
  const drag = useRef(null)
  const [active, setActive] = useState(false)
  const down = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
    setActive(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const move = (e) => {
    if (drag.current) onChange(clampWidth(drag.current.w + e.clientX - drag.current.x), false)
  }
  const up = (e) => {
    if (!drag.current) return
    onChange(clampWidth(drag.current.w + e.clientX - drag.current.x), true)
    drag.current = null
    setActive(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      title="Drag to resize · double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => onChange(WIDTH_DEFAULT, true)}
      className="group fixed top-0 z-30 hidden h-screen w-2 -translate-x-1/2 cursor-col-resize lg:block"
      style={{ left: width }}
    >
      <div className={`mx-auto h-full w-0.5 transition-colors ${active ? 'bg-brand' : 'bg-transparent group-hover:bg-brand/50'}`} />
    </div>
  )
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Mounted once for the whole app, so a background Auto-generate run still
// announces itself when it finishes even if the person left that page.
function useRunFinishedToast() {
  const { auto, showToast, refreshReview, refreshAuto } = useStore()
  const onFinish = useCallback(
    (run) => {
      refreshAuto()
      if (run.status === 'idle') return
      const name = (auto || []).find((a) => a.id === run.automation_id)?.brand_name || 'Auto-generate'
      const r = run.result || {}
      if (run.status === 'failed') showToast(`${name}: could not generate — ${run.error}`)
      else if (r.regenerated)
        showToast(
          `${name}: regenerated — ${plural(r.count, 'new idea')}` +
            (r.kept_live ? `, ${r.kept_live} already-posted left alone` : ''),
        )
      else if (r.already_ran_today) showToast(`${name}: already wrote ${plural(r.count, 'idea')} for today`)
      else showToast(`${name}: wrote ${plural(r.count, 'new idea')} for today`)
      refreshReview()
    },
    [auto, showToast, refreshReview, refreshAuto],
  )
  useAutoRunWatcher(onFinish)
}

export default function Shell({ children }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [width, setWidth] = useState(readWidth)
  const resize = (w, done) => {
    setWidth(w)
    if (done) saveWidth(w)
  }
  useRunFinishedToast()
  useGenJobWatcher()
  useAppBadge()

  // A new page opens at the top. Without this the browser kept the previous
  // page's scroll offset, so e.g. AI Agent opened part-way down, then
  // snapped and crept into place — it looked like the page was shaking.
  // Layout effect = before the first paint, so nothing visibly jumps.
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const toggle = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !v
    })

  return (
    <div
      className="min-h-screen bg-canvas grid lg:grid-cols-[var(--side)_minmax(0,1fr)]"
      style={{ '--side': collapsed ? '72px' : `${width}px` }}
    >
      <Sidebar collapsed={collapsed} />
      {!collapsed && <ResizeHandle width={width} onChange={resize} />}
      <div className="min-w-0 flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Topbar onToggleSidebar={toggle} />
        {/* Every page uses the full width, starting right at the sidebar. */}
        <SectionTabs />
        <main className="min-w-0 w-full">{children}</main>
      </div>
      <MobileBar />
      <AIAssistant />
      <CreateBrandDrawer />
      <AppUpdate />
      <WelcomeHello />
      <CreditClaimFx />
      <OnboardingTour />
      <NewTemplates />
      <NewFeature />
    </div>
  )
}
