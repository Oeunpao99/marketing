import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FiArrowRight, FiFilm, FiX, FiZap } from 'react-icons/fi'
import { useAuth } from '../../auth'
import { markTemplatesSeen, unseenTemplates } from '../../lib/announce'
import { previewSrc } from '../../lib/motionTemplates'

// "New template — try it out": a pop-up the first time someone opens the app
// after a template was added (lib/announce.js decides who and which). Plain dim
// backdrop and a solid card, no blur. "Try it" opens the Studio with that
// template picked, exactly like Content studio → Templates → Use this template.

const SHOW_AFTER_MS = 1800 // let the app settle first

// The four-point star of the logo's AI sparkle (as CreditCoin) — blinking round the card
// with the same "cf-twinkle" animation (index.css; still for reduced motion).
const STAR = 'M0 -9 C0.9 -2.2 2.2 -0.9 9 0 C2.2 0.9 0.9 2.2 0 9 C-0.9 2.2 -2.2 0.9 -9 0 C-2.2 -0.9 -0.9 -2.2 0 -9 Z'
const SPARKLES = [
  // [left, top, size, delay, colour]  — in % of the card, so they sit on its edges
  ['-3%', '-4%', 30, '0s', 'text-amber-300'],
  ['96%', '6%', 22, '0.7s', 'text-white'],
  ['101%', '38%', 16, '1.3s', 'text-amber-200'],
  ['-5%', '46%', 20, '0.4s', 'text-white'],
  ['-2%', '92%', 24, '1s', 'text-amber-200'],
  ['97%', '95%', 30, '0.2s', 'text-amber-300'],
  ['50%', '-6%', 16, '1.6s', 'text-white'],
]
function Sparkles() {
  return SPARKLES.map(([left, top, size, delay, color], i) => (
    <svg
      key={i}
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      className={`cf-twinkle pointer-events-none absolute ${color}`}
      style={{ left, top, marginLeft: -size / 2, marginTop: -size / 2, animationDelay: delay, filter: 'drop-shadow(0 0 6px rgba(255, 220, 120, 0.8))' }}
      aria-hidden="true"
    >
      <path d={STAR} fill="currentColor" />
    </svg>
  ))
}

function Preview({ t }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-brand-soft">
      {!broken && <img src={previewSrc(t.id)} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover object-[50%_28%]" />}
      {broken && (
        <div className="absolute inset-0 grid place-items-center text-brand">
          <FiFilm size={42} />
        </div>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
        <FiZap size={11} /> New
      </span>
    </div>
  )
}

export default function NewTemplates() {
  const { user, updatePrefs } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)

  // decided once per person (and again if their saved "seen" changes, e.g. after the tour)
  const seenKey = user?.preferences?.templates_seen_at || ''
  const tourKey = user?.preferences?.tour_seen_at || ''
  useEffect(() => {
    if (!user) return undefined
    const found = unseenTemplates(user)
    if (!found.length) return undefined
    const t = setTimeout(() => {
      setList(found)
      setAt(0)
      setOpen(true)
    }, SHOW_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, seenKey, tourKey])

  const close = () => {
    setOpen(false)
    markTemplatesSeen(updatePrefs)
  }
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const t = list[at]
  if (!open || !t) return null
  const many = list.length > 1
  const tryIt = () => {
    close()
    navigate('/ai?tab=images', { state: { motionStory: t.story } })
  }

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/60" onClick={close} />
      <div className="cf-pop-in relative w-full max-w-[440px]">
        <Sparkles />
        <div className="relative overflow-hidden rounded-3xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="new-template-title">
        <button type="button" onClick={close} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink-500 shadow-sm hover:text-ink-900" aria-label="Close">
          <FiX size={16} />
        </button>
        <Preview key={t.id} t={t} />
        <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-brand">{many ? `${list.length} new templates` : 'New template'}</div>
        <h2 id="new-template-title" className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-ink-900">
          {t.name}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{t.look}</p>
        {t.steps?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.steps.slice(0, 4).map((s) => (
              <span key={s} className="rounded-full bg-ink-100 px-2.5 py-1 text-[11.5px] font-medium text-ink-600">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={tryIt} className="btn-primary h-11 flex-1 rounded-xl text-[13.5px]">
            Try it out <FiArrowRight size={15} />
          </button>
          {many && at < list.length - 1 ? (
            <button type="button" onClick={() => setAt(at + 1)} className="btn-outline h-11 rounded-xl px-5 text-[13.5px]">
              Next ({at + 1}/{list.length})
            </button>
          ) : (
            <button type="button" onClick={close} className="btn-outline h-11 rounded-xl px-5 text-[13.5px]">
              Later
            </button>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
