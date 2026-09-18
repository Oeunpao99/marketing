const VARIANTS = {
  ok: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border border-amber-200',
  stop: 'bg-red-50 text-red-600 border border-red-200',
  idle: 'bg-ink-100 text-ink-500 border border-ink-200',
  lime: 'bg-brand text-white border border-brand',
}

export default function Tag({ variant = 'idle', dot = true, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${VARIANTS[variant] || VARIANTS.idle}`}
    >
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current" />}
      {children}
    </span>
  )
}
