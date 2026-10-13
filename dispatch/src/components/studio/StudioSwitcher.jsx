import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiChevronDown } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import { STUDIO_TABS } from '../../lib/studioTabs'

// In the top bar while you're in the Content studio: one icon — the tool
// you're on — that opens all four tools on hover (or a tap, on a phone).
// The menu is drawn on <body> (fixed, under the icon): inside the top bar it
// sat below the page's own pinned headers, which covered it.
export default function StudioSwitcher() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const root = useRef(null)
  const menu = useRef(null)
  const [at, setAt] = useState(null) // the menu's place: under the icon, right-aligned

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !root.current?.contains(e.target) && !menu.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  if (pathname !== '/ai') return null
  const current = new URLSearchParams(search).get('tab')
  const here = STUDIO_TABS.find((t) => t.id === current) || STUDIO_TABS[0]
  const place = () => {
    const r = root.current?.getBoundingClientRect()
    if (r) setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }
  const show = () => {
    clearTimeout(timer.current)
    place()
    setOpen(true)
  }
  const hide = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), 180) // room to move the mouse into the menu
  }

  return (
    <div ref={root} className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        onClick={() => {
          place()
          setOpen((o) => !o)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Studio: ${here.label} — switch tool`}
        className={`inline-flex h-9 items-center gap-1 rounded-lg px-2 transition-colors ${open ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-100'}`}
      >
        <here.icon size={18} aria-hidden="true" />
        <FiChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open &&
        at &&
        createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label="Studio"
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ top: at.top, right: at.right }}
          className="fixed z-[120] w-[290px] rounded-2xl border border-ink-200 bg-white p-1.5 shadow-pop animate-fadein"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">Content studio</div>
          {STUDIO_TABS.map((t) => {
            const on = t.id === here.id
            return (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                aria-current={on ? 'page' : undefined}
                onClick={() => {
                  setOpen(false)
                  navigate(`/ai?tab=${t.id}`)
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? 'bg-brand-soft' : 'hover:bg-ink-50'}`}
              >
                <span className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg ${on ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600'}`}>
                  <t.icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-semibold ${on ? 'text-brand' : 'text-ink-900'}`}>{t.label}</span>
                  <span className="block text-[11.5px] leading-snug text-ink-500">{t.hint}</span>
                </span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
