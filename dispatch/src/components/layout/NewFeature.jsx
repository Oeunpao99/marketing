import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FiArrowRight, FiCheck, FiChevronsLeft, FiChevronsRight, FiMusic, FiPlay, FiScissors, FiType, FiX, FiZap } from 'react-icons/fi'
import { useAuth } from '../../auth'
import { markFeatureSeen, unseenFeatures } from '../../lib/announce'
import { Sparkles } from './NewTemplates'

// "New feature" — introduces a new part of the app once to each person
// (lib/announce.js NEW_FEATURES decides what and who). Same look as the
// "New template" pop-up: plain dim backdrop, a solid card, sparkles, no blur.

const SHOW_AFTER_MS = 2200 // let the app settle first

// A small, live picture of the video editor: a player, the tools, and a
// timeline with words, two cut clips and music while the red line sweeps by.
function EditorArt() {
  return (
    <div className="relative w-[220px] flex-none overflow-hidden rounded-2xl bg-night-950 p-3 shadow-lg ring-1 ring-ink-200 sm:w-[250px]">
      <span className="absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
        <FiZap size={11} /> New
      </span>
      {/* the player */}
      <div className="relative mx-auto mt-6 aspect-video w-full overflow-hidden rounded-lg bg-gradient-to-br from-sky-600 via-indigo-600 to-fuchsia-600">
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-night-950 shadow">
            <FiPlay size={15} className="translate-x-px" />
          </span>
        </div>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">Your video</span>
      </div>
      {/* the tools */}
      <div className="mt-2.5 flex items-center gap-1.5 text-white/70">
        <span className="cf-snip grid h-7 w-7 place-items-center rounded-lg bg-brand text-white shadow">
          <FiScissors size={13} />
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
          <FiChevronsLeft size={14} />
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
          <FiChevronsRight size={14} />
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-white/50">00:12</span>
      </div>
      {/* the timeline */}
      <div className="relative mt-2 space-y-1.5 rounded-lg bg-white/5 p-1.5">
        <div className="flex h-4 items-center">
          <span className="ml-[22%] flex h-full w-[38%] items-center gap-1 rounded bg-amber-500 px-1 text-[8px] font-bold text-white">
            <FiType size={8} /> Words
          </span>
        </div>
        <div className="flex h-7 gap-1">
          <span className="h-full w-[46%] rounded bg-sky-600" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)', backgroundSize: '14px 100%' }} />
          <span className="h-full w-[36%] rounded bg-indigo-600" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)', backgroundSize: '14px 100%' }} />
        </div>
        <div className="flex h-4 items-center">
          <span
            className="flex h-full w-[84%] items-center gap-1 rounded bg-emerald-600 px-1 text-[8px] font-bold text-white"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 1px, transparent 1px 4px)' }}
          >
            <FiMusic size={8} />
          </span>
        </div>
        {/* the red line */}
        <div className="cf-sweep pointer-events-none absolute bottom-0 top-0 w-px bg-red-500">
          <span className="absolute -left-[3px] -top-0.5 h-1.5 w-1.5 rotate-45 bg-red-500" />
        </div>
      </div>
    </div>
  )
}

export default function NewFeature() {
  const { user, updatePrefs } = useAuth()
  const navigate = useNavigate()
  const [feature, setFeature] = useState(null)

  // decided again when their saved "seen" lists change (e.g. after the tour or a template pop-up)
  const keys = [user?.preferences?.features_seen, user?.preferences?.templates_seen_at, user?.preferences?.tour_seen_at]
  const key = JSON.stringify(keys)
  useEffect(() => {
    if (!user) return undefined
    const [next] = unseenFeatures(user)
    if (!next) return undefined
    const t = setTimeout(() => setFeature(next), SHOW_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key])

  const close = () => {
    if (feature) markFeatureSeen(user, updatePrefs, feature.id)
    setFeature(null)
  }
  useEffect(() => {
    if (!feature) return undefined
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature])

  if (!feature) return null
  const tryIt = () => {
    const to = feature.to
    close()
    navigate(to)
  }

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/60" onClick={close} />
      <div className="cf-pop-in relative w-full max-w-[660px]">
        <Sparkles />
        <div className="relative max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="new-feature-title">
          <button type="button" onClick={close} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-ink-500 hover:text-ink-900" aria-label="Close">
            <FiX size={16} />
          </button>
          {/* the picture beside the words on a computer, above them on a phone */}
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
            <EditorArt />
            <div className="min-w-0 flex-1 self-stretch sm:self-center">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-brand">{feature.eyebrow}</div>
              <h2 id="new-feature-title" className="mt-0.5 pr-8 text-[22px] font-bold leading-tight tracking-tight text-ink-900">
                {feature.title}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{feature.body}</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {feature.points.map((p) => (
                  <li key={p} className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-700">
                    <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-brand-soft text-brand">
                      <FiCheck size={10} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={tryIt} className="btn-primary h-11 flex-1 rounded-xl text-[13.5px]">
                  {feature.cta} <FiArrowRight size={15} />
                </button>
                <button type="button" onClick={close} className="btn-outline h-11 rounded-xl px-5 text-[13.5px]">
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
