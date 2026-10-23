// The landing page's guide: past the hero our robot takes off and, as the page
// scrolls, flies to a spot beside each section (alternating sides), says one
// line about it, then rests. Across and up/down move on different easings so
// the flight curves; in the air it tilts towards where it's going and a little
// jet glows under it. Click it to go to the next section.
// Wide screens: it sits in the margin beside the content. Narrow ones: small,
// in the bottom corner. Reduced motion: it moves without flying.
import { useEffect, useRef, useState } from 'react'
import LiveAvatar from '../ui/LiveAvatar'

// in page order — side: which margin it lands in; y: where, as a share of the window height
const STOPS = [
  { id: 'how', side: 'right', y: 0.3, en: 'Four steps — you only do the last one.', km: 'បួនជំហាន — បងធ្វើតែជំហានចុងក្រោយ។' },
  { id: 'features', side: 'left', y: 0.46, en: 'This is what I do for you every week.', km: 'នេះជាអ្វីដែលខ្ញុំធ្វើជូនបងរៀងរាល់សប្តាហ៍។' },
  { id: 'everywhere', side: 'right', y: 0.56, en: 'One post, on every page you have.', km: 'ប្រកាសមួយ ទៅគ្រប់ទំព័ររបស់បង។' },
  { id: 'videos', side: 'left', y: 0.34, en: 'I made these videos — press play!', km: 'ខ្ញុំធ្វើវីដេអូទាំងនេះ — ចុចមើលមើល!' },
  { id: 'tutorials', side: 'right', y: 0.5, en: 'Stuck? Short lessons right here.', km: 'ជាប់គាំង? មានមេរៀនខ្លីៗនៅទីនេះ។' },
  { id: 'more', side: 'left', y: 0.6, en: 'And a few more tricks…', km: 'ហើយមានល្បិចបន្ថែមទៀត…' },
  { id: 'pricing', side: 'right', y: 0.32, en: 'Start free, grow when you’re ready.', km: 'ចាប់ផ្តើមឥតគិតថ្លៃ ពង្រីកពេលបងរួចរាល់។' },
  { id: 'faq', side: 'left', y: 0.5, en: 'Questions? I’ve got answers.', km: 'មានសំណួរ? ខ្ញុំមានចម្លើយ។' },
]
const FLIGHT_MS = 1150
const TALK_MS = 4500 // the line shows this long after landing

export default function SkyGuide({ t }) {
  const [at, setAt] = useState(-1) // which stop (-1: still in the hero — hidden)
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [flying, setFlying] = useState(false)
  const [talking, setTalking] = useState(false)
  const prev = useRef({ x: null, at: -1 })

  // which section owns the middle of the window
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const mid = window.innerHeight * 0.55
      let found = -1
      STOPS.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top < mid) found = i
      })
      setAt(found)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    const onResize = () => { setWin({ w: window.innerWidth, h: window.innerHeight }); onScroll() }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // the page's content is max-w-6xl (1152px) — the guide lives in the margin beside
  // it only when that margin fits it; otherwise it waits in the bottom corner
  const margin = (win.w - 1152) / 2
  const wide = margin >= 120
  const size = wide ? Math.min(112, margin - 24) : 68
  const edge = wide ? Math.max(12, Math.round((margin - size) / 2)) : 12
  const bubbleW = wide ? Math.min(230, margin - 2 * 12) : 200
  const stop = STOPS[Math.max(0, at)]
  const x = wide ? (stop.side === 'right' ? win.w - size - edge : edge) : win.w - size - 12
  const y = wide ? Math.round(win.h * stop.y) : win.h - size - 18
  const dir = prev.current.x == null || x === prev.current.x ? 0 : x > prev.current.x ? 1 : -1

  // a new stop: fly, land, say the line, go quiet
  useEffect(() => {
    if (at < 0) return undefined
    const moved = prev.current.at !== at
    prev.current = { x, at }
    if (!moved) return undefined
    setFlying(true)
    setTalking(false)
    const land = setTimeout(() => { setFlying(false); setTalking(true) }, FLIGHT_MS)
    const hush = setTimeout(() => setTalking(false), FLIGHT_MS + TALK_MS)
    return () => { clearTimeout(land); clearTimeout(hush) }
  }, [at, x])

  const hidden = at < 0
  // the line sits above it, kept inside the margin (it never covers the section)
  const toRight = !wide || stop.side === 'right'
  const bubbleX = toRight ? size + Math.min(edge, 12) - bubbleW : -Math.min(edge, 12)
  const next = () => {
    const target = document.getElementById(STOPS[Math.min(STOPS.length - 1, at + 1)].id)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-40" aria-hidden="true">
      <style>{`
        .sky-x { transition: transform ${FLIGHT_MS}ms cubic-bezier(.55,0,.25,1), opacity .5s ease; }
        .sky-y { transition: transform ${FLIGHT_MS}ms cubic-bezier(.3,1.25,.4,1); }
        .sky-tilt { transition: transform .45s ease; }
        @keyframes sky-jet { 0%, 100% { opacity: .55; transform: translateX(-50%) scaleY(.8) } 50% { opacity: 1; transform: translateX(-50%) scaleY(1.25) } }
        .sky-jet { animation: sky-jet .18s linear infinite; transform-origin: top center; }
        @keyframes sky-pop { from { opacity: 0; transform: scale(.7) } to { opacity: 1; transform: scale(1) } }
        .sky-pop { animation: sky-pop .35s cubic-bezier(.2,1.4,.4,1) both; }
        @media (prefers-reduced-motion: reduce) { .sky-x, .sky-y { transition: opacity .3s ease; } .sky-jet { display: none } }
      `}</style>
      {/* across */}
      <div className="sky-x" style={{ transform: `translate3d(${hidden ? win.w - size - 40 : x}px, 0, 0)`, opacity: hidden ? 0 : 1 }}>
        {/* up and down — a springier easing, so the path arcs */}
        <div className="sky-y" style={{ transform: `translate3d(0, ${hidden ? 80 : y}px, 0)` }}>
          <div className="relative" style={{ width: size, height: size }}>
            {talking && !hidden && (
              <div
                className={`sky-pop absolute bottom-[96%] rounded-2xl bg-white px-3 py-2 text-[12.5px] font-bold leading-snug text-ink-900 shadow-pop ${toRight ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                style={{ left: bubbleX, width: bubbleW, transformOrigin: toRight ? 'right bottom' : 'left bottom' }}
              >
                {t(stop.en, stop.km)}
              </div>
            )}
            <button
              type="button"
              onClick={next}
              tabIndex={-1}
              className="sky-tilt pointer-events-auto absolute inset-0 cursor-pointer"
              style={{ transform: `rotate(${flying ? dir * 14 : 0}deg) scale(${flying ? 0.92 : 1})` }}
              title={t('Next', 'បន្ទាប់')}
            >
              {flying && (
                <span className="sky-jet absolute left-1/2 top-[88%] h-[34%] w-[22%] rounded-full bg-[radial-gradient(ellipse_at_top,rgba(125,230,255,.95),rgba(59,130,246,.45)_45%,transparent_72%)] blur-[2px]" />
              )}
              <LiveAvatar size={size} wave={talking} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
