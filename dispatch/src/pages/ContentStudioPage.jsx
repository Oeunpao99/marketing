import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import VideoBuilder from '../components/studio/VideoBuilder'
import AIPromptPage from './AIPromptPage'

// Content studio (/ai) — the boss's layout. Video builder is the default tab;
// Images and Copy per channel are the AI chat, opened in that mode, so image and
// caption making stay in one place.

const TABS = [
  { id: 'video', label: 'Video builder' },
  { id: 'images', label: 'Images' },
  { id: 'copy', label: 'Copy per channel' },
]

export default function ContentStudioPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const asked = params.get('tab')
  // An idea handed over without a tab (Calendar's "Use this idea →") is for the chat.
  const tab = TABS.some((t) => t.id === asked)
    ? asked
    : location.state && !location.state.studio
      ? 'images'
      : 'video'

  // Keep the tab in the url so a reload or a shared link opens the same place.
  useEffect(() => {
    if (asked !== tab) {
      const next = new URLSearchParams(params)
      next.set('tab', tab)
      setParams(next, { replace: true, state: location.state })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="w-full animate-fadein">
      <div className="px-5 pt-7 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Content studio</h1>
            <p className="page-sub mt-1">Generate copy, images and video — short AI clips combined into one high-quality cut</p>
          </div>
          <div className="inline-flex rounded-xl bg-ink-100/70 p-1" role="tablist" aria-label="Studio">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setParams({ tab: t.id })}
                className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                  tab === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'video' ? (
        <div className="px-5 pb-10 pt-6 lg:px-10">
          <VideoBuilder />
        </div>
      ) : (
        <AIPromptPage key={tab} embedded preset={tab} />
      )}
    </div>
  )
}
