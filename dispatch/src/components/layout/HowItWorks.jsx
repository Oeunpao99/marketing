import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiBarChart2,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiFileText,
  FiFilm,
  FiGlobe,
  FiHome,
  FiImage,
  FiLink,
  FiMaximize,
  FiMinus,
  FiPlus,
  FiMessageCircle,
  FiPackage,
  FiRepeat,
  FiSend,
  FiSliders,
  FiTarget,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiZap,
} from 'react-icons/fi'

// Settings → "How it works": the whole system as an org chart — ContentFlow on
// top, the five steps under it in order, and each step's pages under that.
// Every box opens its page. Mirrors the sidebar (components/layout/Sidebar.jsx).

const STEPS = [
  {
    n: 1,
    title: 'Setup',
    when: 'Once',
    text: 'Connect your accounts and tell the AI about your business',
    icon: FiSliders,
    to: '/channels',
    items: [
      { label: 'Channels', text: 'Connect Facebook, Instagram, Telegram, TikTok…', icon: FiSliders, to: '/channels' },
      { label: 'Products & brand kit', text: 'Facts, prices, logo — the AI only uses these', icon: FiPackage, to: '/products' },
      { label: 'Autopilot', text: 'What the AI may do by itself', icon: FiRepeat, to: '/auto' },
      { label: 'Chat link in posts', text: 'Your chatbot link, added to every post', icon: FiLink, to: '/channels' },
      { label: 'Chatbots → leads', text: 'Key for your chatbot (Chumnouykar)', icon: FiMessageCircle, to: '/channels' },
      { label: 'Website check', text: 'Weekly health and Google check', icon: FiGlobe, to: '/website' },
    ],
  },
  {
    n: 2,
    title: 'Plan & best time',
    when: 'Every week',
    text: 'The AI plans next week — you approve it',
    icon: FiClipboard,
    to: '/weekly',
    items: [
      { label: 'Weekly plan', text: 'Goal mix, posts, best times — Approve', icon: FiClipboard, to: '/weekly' },
      { label: 'Approvals', text: 'Daily AI ideas waiting for your OK', icon: FiFileText, to: '/review' },
      { label: 'Calendar', text: 'Every post, day by day', icon: FiCalendar, to: '/calendar' },
      { label: 'Activity plan', text: 'The team’s weekly to-do list', icon: FiCheckSquare, to: '/activity' },
    ],
  },
  {
    n: 3,
    title: 'Content studio',
    when: 'When you need it',
    text: 'Make the video, picture or caption for a post',
    icon: FiFilm,
    to: '/ai',
    items: [
      { label: 'Video builder', text: 'Brief → clips → one finished video', icon: FiFilm, to: '/ai?tab=video' },
      { label: 'Images', text: 'Posters and pictures with your logo', icon: FiImage, to: '/ai?tab=images' },
      { label: 'Copy per channel', text: 'Captions written by the AI', icon: FiZap, to: '/ai?tab=copy' },
      { label: 'Media Library', text: 'Everything made, ready to post', icon: FiImage, to: '/library' },
    ],
  },
  {
    n: 4,
    title: 'Leads & hand-off',
    when: 'Every day',
    text: 'Customers who chatted become leads for your sales team',
    icon: FiUserCheck,
    to: '/leads',
    items: [
      { label: 'Leads', text: 'Hot / Warm / Cold, and which post brought them', icon: FiUserCheck, to: '/leads' },
      { label: 'Hand over', text: 'The right rep is picked; Contacted → Won', icon: FiSend, to: '/leads' },
      { label: 'Sales team', text: 'Reps, industries, invite to the portal', icon: FiUsers, to: '/leads' },
    ],
  },
  {
    n: 5,
    title: 'Insights & sales',
    when: 'Every week',
    text: 'See what works — and what sells',
    icon: FiBarChart2,
    to: '/insights',
    items: [
      { label: 'Results', text: 'Reach, followers, leads, deals, revenue', icon: FiBarChart2, to: '/insights' },
      { label: 'What brings leads', text: 'Which kind of post finds buyers', icon: FiTarget, to: '/insights' },
      { label: 'Boost picks', text: 'Posts worth paying to boost', icon: FiTrendingUp, to: '/insights' },
    ],
  },
]

const box = 'rounded-xl border border-ink-200 bg-white text-left transition-colors hover:border-brand hover:bg-brand-soft/40'

const COLOR = {
  1: { card: 'border-sky-500/50 bg-sky-500/10', badge: 'bg-sky-600 text-white', line: 'bg-sky-500/50', border: 'border-sky-500/50', sub: 'border-sky-500/30 hover:border-sky-500 hover:bg-sky-500/10', icon: 'text-sky-600', arrow: 'text-sky-500/70', chip: 'bg-sky-500/15 text-sky-700' },
  2: { card: 'border-violet-500/50 bg-violet-500/10', badge: 'bg-violet-600 text-white', line: 'bg-violet-500/50', border: 'border-violet-500/50', sub: 'border-violet-500/30 hover:border-violet-500 hover:bg-violet-500/10', icon: 'text-violet-600', arrow: 'text-violet-500/70', chip: 'bg-violet-500/15 text-violet-700' },
  3: { card: 'border-amber-500/50 bg-amber-500/10', badge: 'bg-amber-600 text-white', line: 'bg-amber-500/50', border: 'border-amber-500/50', sub: 'border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10', icon: 'text-amber-600', arrow: 'text-amber-500/70', chip: 'bg-amber-500/15 text-amber-700' },
  4: { card: 'border-emerald-500/50 bg-emerald-500/10', badge: 'bg-emerald-600 text-white', line: 'bg-emerald-500/50', border: 'border-emerald-500/50', sub: 'border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10', icon: 'text-emerald-600', arrow: 'text-emerald-500/70', chip: 'bg-emerald-500/15 text-emerald-700' },
  5: { card: 'border-rose-500/50 bg-rose-500/10', badge: 'bg-rose-600 text-white', line: 'bg-rose-500/50', border: 'border-rose-500/50', sub: 'border-rose-500/30 hover:border-rose-500 hover:bg-rose-500/10', icon: 'text-rose-600', arrow: 'text-rose-500/70', chip: 'bg-rose-500/15 text-rose-700' },
}
const cardBase = 'rounded-xl border text-left transition-colors'

// A small arrowhead at the end of a connecting line, in the line's colour.
function Arrow({ dir = 'down', className = '' }) {
  return dir === 'right' ? (
    <svg width="7" height="10" viewBox="0 0 7 10" className={`flex-none ${className}`} aria-hidden="true">
      <path d="M0 0 L7 5 L0 10 Z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="7" viewBox="0 0 10 7" className={`flex-none ${className}`} aria-hidden="true">
      <path d="M0 0 L10 0 L5 7 Z" fill="currentColor" />
    </svg>
  )
}
const CHART_WIDTH = 1190 // the chart's natural width (min-w below + padding)
const ZOOM_KEY = 'cf_guide_zoom'
const clampZoom = (z) => Math.min(1.6, Math.max(0.5, Math.round(z * 20) / 20))

export default function HowItWorks({ onClose }) {
  const navigate = useNavigate()
  const frame = useRef(null)
  // Zoom: − / + / Fit, or Ctrl + mouse wheel over the chart. Remembered per browser.
  const [zoom, setZoomState] = useState(() => {
    try {
      return clampZoom(Number(localStorage.getItem(ZOOM_KEY)) || 1)
    } catch {
      return 1
    }
  })
  const setZoom = (z) => {
    const next = clampZoom(typeof z === 'function' ? z(zoom) : z)
    setZoomState(next)
    try {
      localStorage.setItem(ZOOM_KEY, String(next))
    } catch {
      /* private window — just not remembered */
    }
  }
  const fit = () => frame.current && setZoom((frame.current.clientWidth - 8) / CHART_WIDTH)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoomState((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const go = (to) => {
    navigate(to)
    onClose?.()
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[16px] font-bold text-ink-900">How ContentFlow works</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Five steps, left to right. Set up once — then the AI plans and posts, your chatbot brings leads, and the results make the
          next plan better. Click any box to open it.
        </p>
      </div>

      {/* ── The chart ── */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="mr-1 text-[11px] text-ink-400">Ctrl + scroll to zoom</span>
        <button type="button" onClick={() => setZoom((z) => z - 0.1)} disabled={zoom <= 0.5} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 disabled:opacity-40" aria-label="Zoom out">
          <FiMinus size={14} />
        </button>
        <button type="button" onClick={() => setZoom(1)} className="h-8 min-w-[56px] rounded-lg border border-ink-200 bg-white px-2 text-[12px] font-semibold tabular-nums text-ink-700 hover:bg-ink-50" title="Back to 100%">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => setZoom((z) => z + 0.1)} disabled={zoom >= 1.6} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 disabled:opacity-40" aria-label="Zoom in">
          <FiPlus size={14} />
        </button>
        <button type="button" onClick={fit} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50" title="Fit the whole chart in the window">
          <FiMaximize size={13} /> Fit
        </button>
      </div>
      <div ref={frame} className="-mt-5 overflow-auto rounded-2xl border border-ink-100 bg-canvas-soft p-4">
        <div className="min-w-[1180px] px-1" style={{ zoom }}>
          {/* top: ContentFlow + Command center beside it */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="rounded-2xl bg-brand px-6 py-3.5 text-center text-white shadow-sm">
                <div className="text-[15px] font-bold">ContentFlow</div>
                <div className="text-[11.5px] text-white/80">Your AI marketing team</div>
              </div>
              <button type="button" onClick={() => go('/command')} className={`${box} absolute left-full top-1/2 ml-4 flex -translate-y-1/2 items-center gap-2.5 whitespace-nowrap px-4 py-2.5`}>
                <FiHome size={16} className="flex-none text-brand" />
                <span>
                  <span className="block text-[12.5px] font-semibold text-ink-900">Command center</span>
                  <span className="block text-[11px] text-ink-500">Your home every morning</span>
                </span>
              </button>
            </div>
          </div>

          {/* connectors: down from the top, across, and down into each step */}
          <div className="mx-auto h-7 w-px bg-ink-300" />
          <div className="relative grid grid-cols-5 gap-6">
            <div className="absolute left-[10%] right-[10%] top-0 h-px bg-ink-300" />
            {STEPS.map((s) => {
              const c = COLOR[s.n]
              return (
              <div key={s.n} className="flex flex-col items-center">
                <div className={`h-4 w-px ${c.line}`} />
                <Arrow className={`-mt-px mb-0.5 ${c.arrow}`} />
                {/* step */}
                <button type="button" onClick={() => go(s.to)} className={`${cardBase} w-full border-2 px-4 py-3.5 hover:brightness-[1.03] ${c.card}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-bold shadow-sm ${c.badge}`}>{s.n}</span>
                    <s.icon size={15} className={`flex-none ${c.icon}`} />
                    <span className="truncate text-[13px] font-bold text-ink-900">{s.title}</span>
                  </div>
                  <div className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${c.chip}`}>{s.when}</div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-ink-600">{s.text}</p>
                </button>
                {/* its pages, as a tree */}
                <ul className={`ml-6 w-[calc(100%-1.5rem)] space-y-3 border-l-2 pl-4 pt-3 ${c.border}`}>
                  {s.items.map((it, k) => (
                    <li key={it.label} className="relative">
                      {/* the branch line ends at the last card, not below it */}
                      {k === s.items.length - 1 && <span className="absolute -left-[18px] bottom-0 top-[calc(50%+1px)] w-[2px] bg-canvas-soft" />}
                      <span className="absolute -left-4 top-1/2 flex -translate-y-1/2 items-center">
                        <span className={`h-0.5 w-2 ${c.line}`} />
                        <Arrow dir="right" className={c.arrow} />
                      </span>
                      <button type="button" onClick={() => go(it.to)} className={`${cardBase} flex w-full items-start gap-2.5 bg-white px-3 py-2.5 ${c.sub}`}>
                        <span className={`mt-px grid h-5 min-w-[26px] flex-none place-items-center rounded-md px-1 text-[10px] font-bold tabular-nums ${c.badge}`}>
                          {s.n}.{k + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-ink-900">{it.label}</span>
                          <span className="block text-[10.5px] leading-snug text-ink-500">{it.text}</span>
                        </span>
                        <it.icon size={13} className={`mt-0.5 flex-none ${c.icon}`} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              )
            })}
          </div>

          {/* the loop: results feed the next plan */}
          <div className="mt-7 flex items-center gap-3 rounded-xl border border-dashed border-brand/40 bg-brand-soft/40 px-4 py-3">
            <FiRepeat size={16} className="flex-none text-brand" />
            <p className="text-[12px] leading-relaxed text-ink-700">
              <b className="text-ink-900">It learns.</b> Results from <b>5 · Insights</b> and leads marked <b>Won</b> in{' '}
              <b>4 · Leads</b> go back into <b>2 · Plan</b> — the next week’s posts copy what reached people and what brought
              buyers.
            </p>
          </div>
        </div>
      </div>

      {/* ── How a customer travels through it ── */}
      <section>
        <h3 className="text-[13.5px] font-semibold text-ink-900">One customer, start to finish</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Post goes out', 'The AI’s approved post is published at the best time, with your chat link and its code (P123).'],
            ['Customer taps the link', 'They chat with your chatbot (Chumnouykar), which answers and asks what they need.'],
            ['Lead appears', 'In Leads & hand-off — Hot / Warm / Cold — showing which post brought them.'],
            ['Hand over', 'The right rep is picked (customer → industry → workload) and alerted.'],
            ['Won', 'The rep marks it Won with the amount.'],
            ['Learn', 'Insights shows which post sold; next week’s plan makes more like it.'],
          ].map(([title, text], i) => (
            <li key={title} className={`flex gap-3 rounded-xl border px-3.5 py-3 ${COLOR[[2, 4, 4, 4, 4, 5][i]].card}`}>
              <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold ${COLOR[[2, 4, 4, 4, 4, 5][i]].badge}`}>{i + 1}</span>
              <span>
                <span className="block text-[12.5px] font-semibold text-ink-900">{title}</span>
                <span className="block text-[11.5px] leading-snug text-ink-500">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Your routine ── */}
      <section>
        <h3 className="text-[13.5px] font-semibold text-ink-900">Your routine</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {[
            ['Once', ['Connect channels', 'Add products and your logo', 'Set Autopilot', 'Add the chat link and connect your chatbot', 'Add your sales team']],
            ['Every day · 5 min', ['Open Command center', 'Approve the AI’s daily ideas', 'Hand new leads to a rep']],
            ['Every week · 10 min', ['Approve next week’s plan (Monday)', 'Make any videos in Content studio', 'Look at Insights & sales', 'Mark won deals as Won']],
          ].map(([when, list]) => (
            <div key={when} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="text-[12px] font-bold uppercase tracking-[.06em] text-brand">{when}</div>
              <ul className="mt-2 space-y-1.5">
                {list.map((x) => (
                  <li key={x} className="flex gap-2 text-[12px] text-ink-700">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-ink-300" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
