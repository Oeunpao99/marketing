import { useCallback, useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBar from './MobileBar'
import AIAssistant from '../ai/AIAssistant'
import CreateBrandDrawer from './CreateBrandDrawer'
import { useStore } from '../../store'
import { useAutoRunWatcher } from '../../lib/autoRuns'
import { useGenJobWatcher } from '../../lib/genJobs'

const KEY = 'dispatch.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
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
  useRunFinishedToast()
  useGenJobWatcher()

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
      className={`min-h-screen bg-canvas grid ${
        collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[252px_minmax(0,1fr)]'
      }`}
    >
      <Sidebar collapsed={collapsed} />
      <div className="min-w-0 flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Topbar onToggleSidebar={toggle} />
        <main className="min-w-0 mx-auto w-full max-w-[1480px]">{children}</main>
      </div>
      <MobileBar />
      <AIAssistant />
      <CreateBrandDrawer />
    </div>
  )
}
