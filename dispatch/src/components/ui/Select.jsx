import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FiCheck, FiChevronDown } from 'react-icons/fi'

// A dropdown in the app's own menu style (same look as the sidebar's brand
// switcher) — use it instead of the browser's native <select> everywhere.
//
// options: [{ value, label?, hint?, color? }] — label defaults to value, hint
// is a smaller second line, color draws a dot (e.g. a brand's colour).
// Values keep their type: pass numbers in, get numbers back from onChange.
// size: "sm" (h-8, compact toolbars) | "md" (default) | "lg" (h-10 forms).
// align: which edge the menu lines up with when it's wider than the button.
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
  ...aria
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(-1)
  const [up, setUp] = useState(false)
  const root = useRef(null)
  const menu = useRef(null)
  const current = options.find((o) => o.value === value)

  // Open upward when there's no room below (e.g. inside a popover at the
  // bottom of the screen) — measured before paint, so it never flickers.
  useLayoutEffect(() => {
    if (!open || !menu.current || !root.current) return setUp(false)
    const below = window.innerHeight - root.current.getBoundingClientRect().bottom
    const above = root.current.getBoundingClientRect().top
    const h = menu.current.offsetHeight + 12
    setUp(below < h && above > below)
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
    if (open && hover >= 0) menu.current?.children[hover]?.scrollIntoView({ block: 'nearest' })
  }, [open, hover])

  const openMenu = () => {
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
      setHover((h) => (h + step + options.length) % options.length)
    } else if ((e.key === 'Enter' || e.key === ' ') && open && options[hover]) {
      e.preventDefault()
      pick(options[hover])
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
          className={`absolute z-50 min-w-full w-max max-w-[min(340px,calc(100vw-32px))] max-h-[280px] overflow-y-auto glass-panel rounded-xl p-1.5 animate-fadein ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`}
        >
          {options.map((o, i) => {
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
                {o.color && dot(o.color)}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12px] truncate ${selected ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {o.label ?? o.value}
                  </span>
                  {o.hint && <span className="block text-[10.5px] text-ink-400 truncate">{o.hint}</span>}
                </span>
                {selected && <FiCheck size={14} className="flex-none text-brand" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
