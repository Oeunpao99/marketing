// Dot + plain text — the color lives only in the dot, never a filled background.
const DOTS = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-400',
  stop: 'bg-red-500',
  idle: 'bg-ink-300',
  lime: 'bg-brand',
}

export default function Tag({ variant = 'idle', dot = true, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium text-ink-700">
      {dot && <span className={`w-2 h-2 rounded-full flex-none ${DOTS[variant] || DOTS.idle}`} />}
      {children}
    </span>
  )
}
