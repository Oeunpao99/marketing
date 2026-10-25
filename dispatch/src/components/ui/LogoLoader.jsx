// While a page fetches its content: our logo breathing (a gentle grow / glow),
// a soft ring pulsing out from it, and a line saying what's loading — instead
// of empty grey boxes. Stays still for people who turn motion off.
export default function LogoLoader({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex min-h-[calc(60vh/var(--z,1))] flex-col items-center justify-center gap-5 animate-fadein ${className}`} role="status" aria-live="polite">
      <style>{`
        @keyframes ll-breathe { 0%, 100% { transform: scale(0.94); filter: drop-shadow(0 4px 10px rgb(var(--brand) / 0.15)) } 50% { transform: scale(1.06); filter: drop-shadow(0 10px 24px rgb(var(--brand) / 0.35)) } }
        @keyframes ll-ring { 0% { transform: scale(0.7); opacity: 0.55 } 100% { transform: scale(1.7); opacity: 0 } }
        @keyframes ll-dots { 0%, 80%, 100% { opacity: 0.25 } 40% { opacity: 1 } }
        .ll-mark { animation: ll-breathe 1.8s ease-in-out infinite }
        .ll-ring { animation: ll-ring 1.8s ease-out infinite }
        .ll-dot { animation: ll-dots 1.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .ll-mark, .ll-ring, .ll-dot { animation: none } }
      `}</style>
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="ll-ring absolute inset-0 rounded-full border-2 border-brand/40" />
        <span className="ll-ring absolute inset-0 rounded-full border-2 border-brand/30" style={{ animationDelay: '0.9s' }} />
        <img src="/brand/logo-mark.png" alt="" className="ll-mark h-14 w-14 object-contain" />
      </div>
      <div className="flex items-center gap-1 text-[13px] font-medium text-ink-500">
        {label}
        <span className="ml-0.5 inline-flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="ll-dot h-1 w-1 rounded-full bg-brand" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </span>
      </div>
    </div>
  )
}
