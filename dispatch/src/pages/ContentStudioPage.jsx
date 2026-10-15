import { useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { STUDIO_TABS } from '../lib/studioTabs'
import usePinnedHeight from '../lib/usePinnedHeight'
import VideoBuilder from '../components/studio/VideoBuilder'
import TemplatesGallery from '../components/studio/TemplatesGallery'
import AIPromptPage from './AIPromptPage'

// Content studio (/ai) — the boss's layout. Studio (the video builder) is the default tab;
// Quick content is the AI chat (images, Remotion videos, quick clips — and
// captions, asked for in the chat), so making and writing stay in one place.

// The tools are tabs on the section-tabs line (SectionTabs).
const TABS = STUDIO_TABS

export default function ContentStudioPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const asked = params.get('tab')
  // An idea handed over without a tab (Calendar's "Use this idea →") is for the
  // chat — and so is an old "Copy per channel" link (that tab is gone).
  const tab = TABS.some((t) => t.id === asked)
    ? asked
    : asked === 'copy' || (location.state && !location.state.studio)
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

  const head = useRef(null)
  usePinnedHeight(head, '--studio-head') // the chat's own pinned line goes under this

  return (
    <div className="w-full animate-fadein">
      {/* Pinned under the section tabs while the page scrolls. */}
      <div ref={head} className="sticky top-[calc(3.5rem+var(--tabs-h,0px))] z-[17] bg-canvas px-5 pb-1 pt-5 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="page-title flex flex-wrap items-center gap-2.5">
              Content studio
              {/* which tool is open — picked in the tabs above */}
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand">
                {TABS.find((t) => t.id === tab)?.label}
              </span>
            </h1>
          </div>
          {/* the open tool's own buttons (Quick content: New chat, History) */}
          <div id="studio-actions" className="flex flex-none items-center" />
        </div>
      </div>

      {tab === 'video' ? (
        <div className="px-5 pb-10 pt-6 lg:px-10">
          <VideoBuilder />
        </div>
      ) : tab === 'templates' ? (
        <div className="px-5 pb-10 pt-6 lg:px-10">
          <TemplatesGallery />
        </div>
      ) : (
        <AIPromptPage key={tab} embedded preset={tab} />
      )}
    </div>
  )
}
