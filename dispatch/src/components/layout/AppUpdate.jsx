import { useState } from 'react'
import { FiRefreshCw, FiX } from 'react-icons/fi'
import { applyUpdate, usePullToRefresh, useUpdateAvailable } from '../../lib/update'

// "A new version is ready" banner + the pull-to-refresh indicator (installed
// phone app). Mounted once in Shell. See src/lib/update.js.
export default function AppUpdate() {
  const available = useUpdateAvailable()
  const [dismissed, setDismissed] = useState(false)
  const pull = usePullToRefresh()

  return (
    <>
      {pull > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[70] flex justify-center"
          style={{ opacity: Math.min(1, pull * 1.4) }}
        >
          <span
            className="grid h-10 w-10 place-items-center rounded-full glass-panel text-brand"
            style={{ transform: `translateY(${pull * 18}px) rotate(${pull * 300}deg)` }}
          >
            <FiRefreshCw size={17} className={pull >= 1 ? 'animate-spin' : ''} />
          </span>
        </div>
      )}

      {available && !dismissed && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 z-[75] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl glass-panel py-2 pl-4 pr-2 animate-fadein">
            <span className="text-[12.5px] font-medium text-ink-800">✨ A new version of ContentFlow is ready</span>
            <button type="button" onClick={applyUpdate} className="btn-primary px-3 py-1.5">
              Update
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Later"
              className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-ink-100"
            >
              <FiX size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
