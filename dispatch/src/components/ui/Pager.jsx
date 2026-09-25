// Shared pager for long lists (Analytics "All published posts", Today's Queue).
/** "Showing 11–20 of 23" + Previous / page numbers / Next. Long runs collapse
 *  to 1 … 4 5 6 … 12 so the bar never wraps. */
export default function Pager({ page, pages, total, perPage, onPage }) {
  if (pages <= 1) return null
  const nums = []
  for (let p = 0; p < pages; p++) {
    if (p === 0 || p === pages - 1 || Math.abs(p - page) <= 1) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const btn = 'h-8 min-w-8 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed'
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3" aria-label="Pages">
      <span className="text-[12px] text-ink-500 tabular-nums">
        Showing {page * perPage + 1}–{Math.min(total, (page + 1) * perPage)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} className={`${btn} text-ink-700 hover:bg-ink-100`}>
          Previous
        </button>
        {nums.map((p, i) =>
          p === '…' ? (
            <span key={`gap${i}`} className="px-1 text-ink-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`${btn} tabular-nums ${p === page ? 'bg-brand-soft text-brand' : 'text-ink-700 hover:bg-ink-100'}`}
            >
              {p + 1}
            </button>
          ),
        )}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} className={`${btn} text-ink-700 hover:bg-ink-100`}>
          Next
        </button>
      </div>
    </nav>
  )
}
