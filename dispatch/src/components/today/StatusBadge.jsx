/** One status language everywhere: a colored dot + plain text, no filled
 *  background. green = posted · blue (pulsing) = posting · amber = waiting ·
 *  red = failed. */
const STATUS = {
  posted: { label: "Posted", dot: "bg-emerald-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
  sending: { label: "Posting", dot: "bg-brand animate-pulse-glow" },
  waiting: { label: "Waiting", dot: "bg-amber-400" },
};

export default function StatusBadge({ status, compact }) {
  const s = STATUS[status] || STATUS.waiting;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-ink-700 ${
        compact ? "text-[11.5px]" : "text-[12px]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full flex-none ${s.dot}`} />
      {s.label}
    </span>
  );
}
