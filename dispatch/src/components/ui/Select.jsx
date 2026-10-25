import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiChevronDown, FiSearch } from 'react-icons/fi'
import { rectOf, viewH, viewW } from '../../lib/zoom'

// A dropdown in the app's own menu style (same look as the sidebar's brand
// switcher) — use it instead of the browser's native <select> everywhere.
//
// options: [{ value, label?, hint?, color?, icon? }] — label defaults to value,
// hint is a smaller second line, color draws a dot (e.g. a brand's colour),
// icon is a small element shown before the label (e.g. an AI model's logo),
// thumb a preview picture's url (e.g. a video template) — then every row gets
// a picture (a ✦ tile when it has none) and its hint runs to two lines;
// preview a short clip's url — hovering the row (with a mouse) shows it big in
// a card beside the menu (PreviewCard), the thumb as its still.
// Values keep their type: pass numbers in, get numbers back from onChange.
// size: "sm" (h-8, compact toolbars) | "md" (default) | "lg" (h-10 forms).
// align: which edge the menu lines up with when it's wider than the button.
// searchable: a search box on top of the menu — on by itself for long lists.
const SIZES = {
  sm: 'h-8 rounded-lg px-2 text-[11.5px]',
  md: 'rounded-xl px-3 py-2 text-[12.5px]',
  lg: 'h-10 rounded-xl px-3 text-[13px]',
}

export default function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  size = 'md',
  align = 'left',
  disabled = false,
  className = '',
  buttonClassName = '',
  title,
  searchable,
  ...aria
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(-1)
  const [up, setUp] = useState(false)
  const [nudge, setNudge] = useState(null) // { left, maxWidth }: keeps a wide menu inside its panel
  const [query, setQuery] = useState('')
  const root = useRef(null)
  const menu = useRef(null)
  const list = useRef(null)
  const search = useRef(null)
  const current = options.find((o) => o.value === value)
  const thumbs = options.some((o) => o.thumb)
  const withSearch = searchable ?? options.length > 10
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => `${o.label ?? o.value} ${o.hint || ''}`.toLowerCase().includes(q)) : options

  // Open upward when there's no room below (e.g. inside a popover at the
  // bottom of the screen) — measured before paint, so it never flickers.
  // Inside a scrolling panel the panel's edges are the limit, not the window's.
  // Sideways too: a menu wider than its button is slid back inside (it used to
  // run off a phone screen and scroll the whole drawer sideways).
  useLayoutEffect(() => {
    if (!open || !menu.current || !root.current) {
      setNudge(null)
      return setUp(false)
    }
    let top = 0
    let bottom = viewH()
    let left = 0
    let right = viewW()
    let scroller = false
    for (let el = root.current.parentElement; el; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY)) {
        const r = rectOf(el)
        top = Math.max(top, r.top)
        bottom = Math.min(bottom, r.bottom)
        left = Math.max(left, r.left)
        right = Math.min(right, r.right)
        scroller = true
        break
      }
    }
    const box = rectOf(root.current)
    const room = right - left - 16
    const w = Math.min(menu.current.offsetWidth, room)
    const want = align === 'right' ? box.right - w : box.left
    const x = Math.max(left + 8, Math.min(want, right - 8 - w))
    setNudge({ left: x - box.left, maxWidth: room })
    const below = bottom - box.bottom
    const above = box.top - top
    const h = menu.current.offsetHeight + 12
    // When neither side fits, a scroller can still scroll down to the menu —
    // never up past its top — so only go up there if it truly fits.
    setUp(below < h && (above >= h || (!scroller && above > below)))
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false)
    }
    // Capture phase, so Esc closes just this menu — not the drawer or modal
    // around it, which listen for Esc on window.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  useEffect(() => {
    if (open && hover >= 0) list.current?.children[hover]?.scrollIntoView({ block: 'nearest' })
  }, [open, hover])

  // the search box takes the typing at once — not on a phone, where the keyboard would cover the list
  useEffect(() => {
    if (open && withSearch && window.matchMedia?.('(pointer: fine)').matches) search.current?.focus()
  }, [open, withSearch])

  const openMenu = () => {
    setQuery('')
    setHover(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const pick = (o) => {
    setOpen(false)
    if (o.value !== value) onChange(o.value)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openMenu()
      const step = e.key === 'ArrowDown' ? 1 : -1
      if (shown.length) setHover((h) => (h + step + shown.length) % shown.length)
    } else if ((e.key === 'Enter' || (e.key === ' ' && e.target !== search.current)) && open && shown[hover]) {
      e.preventDefault()
      pick(shown[hover])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const dot = (color) => <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`w-full flex items-center gap-2 border bg-white text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 ${
          SIZES[size] || SIZES.md
        } ${open ? 'border-brand' : 'border-ink-200 hover:border-ink-300'} ${buttonClassName}`}
        {...aria}
      >
        {current?.icon}
        {current?.thumb && <img src={current.thumb} alt="" className="h-5 w-5 flex-none rounded object-cover object-top" />}
        {current?.color && dot(current.color)}
        <span className={`min-w-0 flex-1 truncate ${current ? 'text-ink-900' : 'text-ink-400'}`}>
          {current ? current.label ?? current.value : placeholder}
        </span>
        <FiChevronDown
          size={size === 'sm' ? 13 : 15}
          className={`flex-none text-ink-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={menu}
          role="listbox"
          style={nudge ? { left: nudge.left, right: 'auto', maxWidth: Math.min(340, nudge.maxWidth) } : undefined}
          className={`absolute z-50 min-w-full w-max max-w-[min(340px,calc(100vw-32px))] ${thumbs ? 'max-h-[360px]' : 'max-h-[280px]'} overflow-y-auto glass-panel rounded-xl p-1.5 animate-fadein ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`}
        >
          {withSearch && (
            <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 bg-white px-1.5 pb-1 pt-1.5">
              <label className="flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5 focus-within:border-brand">
                <FiSearch size={13} className="flex-none text-ink-400" aria-hidden="true" />
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHover(0)
                  }}
                  placeholder="Search…"
                  aria-label="Search the list"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
              </label>
            </div>
          )}
          <div ref={list}>
          {shown.length === 0 && <div className="px-2.5 py-3 text-center text-[12px] text-ink-400">No match for “{query.trim()}”</div>}
          {shown.map((o, i) => {
            const selected = o.value === value
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(o)}
                onMouseEnter={() => setHover(i)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
                  selected ? 'bg-brand-soft' : i === hover ? 'bg-ink-50' : ''
                }`}
              >
                {o.icon}
                {o.color && dot(o.color)}
                {thumbs &&
                  (o.thumb ? (
                    <img src={o.thumb} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-lg bg-ink-100 object-cover object-top" />
                  ) : (
                    <span className="grid h-12 w-12 flex-none place-items-center rounded-lg bg-brand-soft text-[16px] text-brand" aria-hidden="true">
                      ✦
                    </span>
                  ))}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12px] truncate ${selected ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {o.label ?? o.value}
                  </span>
                  {o.hint && (
                    <span className={`block text-[10.5px] text-ink-400 ${thumbs ? 'line-clamp-2 leading-snug' : 'truncate'}`}>{o.hint}</span>
                  )}
                </span>
                {selected && <FiCheck size={14} className="flex-none text-brand" />}
              </button>
            )
          })}
          </div>
        </div>
      )}
      {open && shown[hover]?.preview && <PreviewCard option={shown[hover]} menu={menu} row={list.current?.children[hover]} />}
    </div>
  )
}

/**
 * The hovered option, big: a card floating beside the open menu (left of it,
 * or right when there's no room on the left) with a speech-bubble tail
 * pointing at the row — its clip playing, its name and hint under it. Only
 * with a mouse (a phone has no hover). In a portal, so a transformed drawer
 * around the menu can't clip or shift it.
 */
function PreviewCard({ option, menu, row }) {
  const [box, setBox] = useState(null)
  const [still, setStill] = useState(false) // the clip couldn't play: its picture instead
  useLayoutEffect(() => {
    setStill(false)
    if (!menu.current || !row || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return setBox(null)
    const m = rectOf(menu.current)
    const r = rectOf(row)
    const W = 230
    const H = Math.round((W * 16) / 9) + 74 // the 9:16 clip + its name and hint
    const gap = 14
    const left = m.left - gap - W >= 8 ? m.left - gap - W : m.right + gap + W <= viewW() - 8 ? m.right + gap : null
    if (left == null) return setBox(null)
    const mid = r.top + r.height / 2
    const top = Math.max(8, Math.min(mid - H / 2, viewH() - 8 - H))
    setBox({ left, top, W, H, tail: Math.max(22, Math.min(H - 22, mid - top)), side: left < m.left ? 'right' : 'left' })
  }, [option.value, row, menu])
  if (!box) return null
  const tail = {
    position: 'absolute',
    top: box.tail - 9,
    [box.side]: -8,
    width: 18,
    height: 18,
    transform: 'rotate(45deg)',
    borderRadius: 3,
    // only the half outside the card (the diamond's point towards the menu)
    clipPath: box.side === 'right' ? 'polygon(0 0, 100% 0, 100% 100%)' : 'polygon(0 0, 0 100%, 100% 100%)',
  }
  return createPortal(
    <div
      className="pointer-events-none fixed z-[1000] animate-fadein rounded-2xl bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.28)] ring-1 ring-ink-200"
      style={{ left: box.left, top: box.top, width: box.W }}
      aria-hidden="true"
    >
      <div style={tail} className="bg-white ring-1 ring-ink-200" />
      <div className="relative overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: '9 / 16' }}>
        {still || !option.preview ? (
          <img src={option.thumb} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <video key={option.preview} src={option.preview} poster={option.thumb} autoPlay muted loop playsInline onError={() => setStill(true)} className="h-full w-full object-cover object-top" />
        )}
      </div>
      <div className="px-1 pb-0.5 pt-2">
        <div className="truncate text-[12.5px] font-semibold text-ink-900">{option.label ?? option.value}</div>
        {option.hint && <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-ink-500">{option.hint}</div>}
      </div>
    </div>,
    document.body,
  )
}
