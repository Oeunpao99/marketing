import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowLeft, FiArrowRight, FiCheck, FiX } from 'react-icons/fi'
import { useAuth } from '../../auth'
import { markTourSeen, shouldAutoStart, tourStepsFor } from '../../lib/tour'

// The spotlight: a full-screen dim with a rounded hole cut over one piece of
// navigation, a pulsing ring around the hole, and a card with an arrow
// pointing into it. Which piece of navigation is decided per step (see
// lib/tour.js) so the same five steps work on the desktop sidebar and on the
// phone's bottom bar.

const PAD = 10 // breathing room between the target and the edge of the hole (sides)
const PAD_Y = 3 // …and above / below — nav rows are short, so keep the hole snug
const GAP = 16 // hole → card
const EDGE = 12 // card → window edge
const RADIUS = 10
const AUTO_START_MS = 700
const SETTLE_FRAMES = 30 // re-measure for half a second after each step

// The arrow is a square rotated 45°; only the two edges meeting at the corner
// that points at the target get a border, and the card is painted over the
// other half. Keyed by which side of the card the arrow sits on.
const ARROW = {
  right: { edge: 'border-b border-l', pos: { left: -6, top: '50%', marginTop: -6 } },
  left: { edge: 'border-t border-r', pos: { right: -6, top: '50%', marginTop: -6 } },
  bottom: { edge: 'border-t border-l', pos: { top: -6, left: '50%', marginLeft: -6 } },
  top: { edge: 'border-b border-r', pos: { bottom: -6, left: '50%', marginLeft: -6 } },
}

const same = (a, b) =>
  !!a === !!b && (!a || (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h))

// The first target that's actually laid out. A hidden element (the sidebar on
// a phone, the phone bar on a desktop) measures 0×0 and is passed over.
function readHole(step) {
  for (const sel of step.targets || []) {
    const el = document.querySelector(sel)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const x = Math.max(0, r.left - PAD)
    const y = Math.max(0, r.top - PAD_Y)
    const w = Math.min(r.right + PAD, window.innerWidth) - x
    const h = Math.min(r.bottom + PAD_Y, window.innerHeight) - y
    if (w < 4 || h < 4) continue
    return { x, y, w, h }
  }
  return null
}

// Card beside the hole, flipping to whichever side has room and then staying
// inside the window.
function place(hole, size, prefer) {
  if (!hole) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const room = {
    right: hole.x + hole.w + GAP + size.w + EDGE <= vw,
    left: hole.x - GAP - size.w - EDGE >= 0,
    bottom: hole.y + hole.h + GAP + size.h + EDGE <= vh,
    top: hole.y - GAP - size.h - EDGE >= 0,
  }
  const sides = [prefer, 'right', 'left', 'bottom', 'top'].filter((s, i, a) => s && a.indexOf(s) === i)
  const side = sides.find((s) => room[s]) || sides[0]
  const x =
    side === 'right' ? hole.x + hole.w + GAP : side === 'left' ? hole.x - GAP - size.w : hole.x + hole.w / 2 - size.w / 2
  const y =
    side === 'bottom' ? hole.y + hole.h + GAP : side === 'top' ? hole.y - GAP - size.h : hole.y + hole.h / 2 - size.h / 2
  const clamp = (v, max) => Math.min(Math.max(v, EDGE), Math.max(EDGE, max - EDGE))
  return { side, x: clamp(x, vw), y: clamp(y, vh) }
}

export default function OnboardingTour() {
  const { user, updatePrefs } = useAuth()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false) // opened, but not yet measured
  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState(null)
  const [size, setSize] = useState({ w: 300, h: 180 })
  const cardRef = useRef(null)
  const started = useRef(false)

  const steps = tourStepsFor(user)
  const step = steps[Math.min(index, steps.length - 1)] || null
  const last = index >= steps.length - 1

  const show = useCallback((at) => {
    setIndex(at)
    setHole(null)
    setPending(true)
    setOpen(true)
  }, [])

  // First run: open once the shell has settled, so the very first thing the
  // page does isn't a spotlight over a sidebar still laying out.
  useEffect(() => {
    if (started.current || !shouldAutoStart(user)) return
    started.current = true
    const t = setTimeout(() => show(0), AUTO_START_MS)
    return () => clearTimeout(t)
  }, [user, show])

  // Replay: Settings → Profile → "Take the tour again".
  useEffect(() => {
    const start = () => show(0)
    window.addEventListener('dispatch:open-tour', start)
    return () => window.removeEventListener('dispatch:open-tour', start)
  }, [show])

  const measure = useCallback(() => {
    const next = step ? readHole(step) : null
    setHole((prev) => (same(prev, next) ? prev : next))
  }, [step])

  useEffect(() => {
    if (!open || !step) return undefined
    measure()
    setPending(false)

    // Nav re-lays out around the step (a badge appears, the card animates in),
    // and a target can move without resizing — so re-measure for a moment
    // after every change as well as on scroll and resize.
    let frames = 0
    let raf = requestAnimationFrame(function tick() {
      measure()
      if (++frames < SETTLE_FRAMES) raf = requestAnimationFrame(tick)
    })

    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    for (const sel of step.targets || []) {
      const el = document.querySelector(sel)
      if (el) observer.observe(el)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step, measure])

  // The card's own size, so placement can be worked out before it's painted
  // (steps have different amounts of text) and it never jumps mid-tour.
  useLayoutEffect(() => {
    if (!open) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width) setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
  }, [open, index, hole])

  const finish = useCallback(() => {
    setOpen(false)
    markTourSeen(updatePrefs)
  }, [updatePrefs])

  const next = useCallback(() => {
    setHole(null)
    setPending(true)
    if (last) return finish()
    setIndex((i) => i + 1)
  }, [last, finish])

  const back = useCallback(() => {
    setHole(null)
    setPending(true)
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') return finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        // A focused button already advances on Enter — don't double-step.
        if (e.key === 'Enter' && e.target?.closest?.('button, a')) return
        e.preventDefault()
        return next()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        return back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, back, finish])

  if (!open || !step) return null

  const at = place(hole, size, step.place)
  const centred = !at
  const arrow = at ? ARROW[at.side] : null
  const ring = hole && { left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: RADIUS }

  return createPortal(
    <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-labelledby="tour-title" onClick={next}>
      {/* The dim, with the target cut out of it. */}
      <svg className="absolute inset-0 h-full w-full animate-fade" aria-hidden="true">
        <defs>
          <mask id="tour-cutout" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="#fff" />
            {/* SVG wants x / y / rx — the ring's CSS left / top / borderRadius
                are ignored here, which put the hole in the top-left corner. */}
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={RADIUS} fill="#000" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(10 12 16 / 0.62)" mask="url(#tour-cutout)" />
      </svg>
      {ring && <div className="tour-ring pointer-events-none absolute" style={ring} />}

      {/* The dim stays up between steps; only the card and the hole wait for
          the new target, so the spotlight never appears in the wrong place.
          `animate-fade`, not `fadein`: the keyframe sets a transform, which
          would override the centring translate and the measured position. */}
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className={`absolute w-[300px] animate-fade rounded-2xl border border-ink-200/70 bg-white shadow-pop ${
          centred ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-5' : 'p-4'
        } ${pending ? 'invisible' : ''}`}
        style={at ? { left: at.x, top: at.y } : undefined}
      >
        {arrow && <span className={`absolute h-3 w-3 rotate-45 border-ink-200/70 bg-white ${arrow.edge}`} style={arrow.pos} />}

        <div className="flex items-start gap-3">
          {centred && (
            <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
              {last ? <FiCheck size={16} /> : <FiArrowRight size={16} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="tour-title" className="text-[15px] font-bold leading-snug text-brand">
              {step.title}
            </h2>
            <p className="mt-2 text-[13px] leading-[1.6] text-ink-700">{step.body}</p>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip the tour"
            className="-mt-1 -mr-1 grid h-7 w-7 flex-none place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800"
          >
            <FiX size={15} />
          </button>
        </div>

        <div className={`flex items-center gap-2 ${centred ? 'mt-5' : 'mt-4'}`}>
          <span className="text-[11.5px] font-semibold text-ink-600 tabular-nums">
            {index + 1} of {steps.length}
          </span>
          <span className="flex-1 flex gap-1">
            {steps.map((s, i) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-brand' : 'bg-ink-300'}`} />
            ))}
          </span>
          {index > 0 && (
            <button type="button" onClick={back} className="btn-ghost h-8 px-2" aria-label="Previous step">
              <FiArrowLeft size={14} />
            </button>
          )}
          <button type="button" onClick={next} className="btn-primary h-8 px-3.5">
            {last ? 'Get started' : 'Next'}
            {!last && <FiArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
