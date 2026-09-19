export default function StatusBadge({ status, compact }) {
  const size = compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
  if (status === 'posted') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 font-bold text-emerald-700 ${size}`}>
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Posted
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 font-bold text-red-600 ${size}`}>
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Failed
      </span>
    )
  }
  if (status === 'sending') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 font-bold text-violet-600 ${size}`}>
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-violet-300 border-t-violet-600" />
        Posting
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 font-semibold text-ink-500 ${size}`}>
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 3.8V6l1.6 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Queued
    </span>
  )
}