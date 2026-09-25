// The placeholder while a render runs: drifting brand-colour smoke, the
// ContentFlow mark floating in the middle with puffs rising off it, and a
// shimmer sweep (keyframes: index.css, "cf-*"). `small` is for thumbnails
// (a storyboard scene): smaller mark, no wordmark, a shorter label.
const PUFFS = [
  { delay: '0s', drift: '-26px' },
  { delay: '0.9s', drift: '18px' },
  { delay: '1.8s', drift: '-8px' },
  { delay: '2.7s', drift: '30px' },
]

export default function GeneratingCanvas({ icon = '▶', stage, small = false }) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#E8F1FB] ring-1 ring-brand/10 ${small ? 'rounded-xl' : 'rounded-2xl'}`}>
      <div className="cf-smoke cf-smoke-a" />
      <div className="cf-smoke cf-smoke-b" />
      <div className="cf-smoke cf-smoke-c" />
      <div className="cf-sweep" />

      {!small && PUFFS.map((p) => (
        <span key={p.delay} className="cf-puff" style={{ animationDelay: p.delay, '--drift': p.drift }} />
      ))}

      <div className="absolute inset-0 grid place-items-center">
        <div className="cf-float flex flex-col items-center">
          <div className="relative">
            <span className={`cf-halo absolute bg-white/70 blur-md ${small ? '-inset-2 rounded-2xl' : '-inset-4 rounded-[28px]'}`} />
            <span
              className={`relative grid place-items-center bg-white shadow-[0_10px_30px_rgb(var(--brand)/0.35)] ${
                small ? 'w-10 h-10 rounded-xl' : 'w-16 h-16 rounded-2xl'
              }`}
            >
              <img src="/brand/logo-mark.png" alt="" className={`object-contain ${small ? 'w-7 h-7' : 'w-12 h-12'}`} />
            </span>
          </div>
          {!small && <span className="mt-3 text-[14px] font-bold tracking-tight text-ink-900/80">ContentFlow</span>}
        </div>
      </div>

      {stage && (
        <div className={`absolute inset-x-0 bottom-0 ${small ? 'p-1.5' : 'p-3'}`}>
          <div
            className={`mx-auto w-fit max-w-full truncate rounded-full bg-white/70 font-medium text-ink-700 backdrop-blur-sm ${
              small ? 'px-2 py-0.5 text-[9.5px]' : 'px-3 py-1 text-[11px]'
            }`}
          >
            {icon} {stage}
          </div>
        </div>
      )}
    </div>
  )
}
