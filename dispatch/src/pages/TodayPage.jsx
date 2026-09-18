import { useStore } from '../store'
import DayView from '../components/today/DayView'

function StatTile({ label, value, accent, busy }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5 backdrop-blur-sm">
      {busy && (
        <span className="absolute top-0 left-0 h-0.5 w-full animate-pulse-glow bg-violet-400" />
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-[10.5px] font-bold tracking-[0.14em] uppercase ${accent}`}>
          {label}
        </span>
        <span className="font-display text-[26px] leading-none text-white tabular-nums">{value}</span>
      </div>
    </div>
  )
}

export default function TodayPage() {
  const { queue, channels } = useStore()
  const liveCount = channels.filter((c) => c.s !== 'off').length
  const postedCount = queue.filter((q) => q.st === 'posted').length
  const sendingCount = queue.filter((q) => q.st === 'sending').length
  const waitingCount = queue.filter((q) => q.st === 'queued' || q.st === 'sending').length
  const doneRatio = queue.length ? Math.round((postedCount / queue.length) * 100) : 0

  return (
    <div className="p-5 lg:p-8 w-full animate-fadein max-w-[920px] mx-auto">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-950 px-6 pt-8 pb-10 lg:px-10 lg:pt-10 shadow-2xl">
        <div className="pointer-events-none absolute -top-28 -right-20 h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,255,255,0.06),transparent)]" />

        <div className="relative">
          <div className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.22em] uppercase text-white/45">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-[10px] text-white/70">T</span>
            Ti P'sa · Dispatch
          </div>

          <h1 className="mt-4 font-display text-[34px] lg:text-[44px] leading-[1.05] tracking-tight text-white">
            Thursday,{' '}
            <em className="bg-gradient-to-r from-emerald-300 via-violet-300 to-amber-200 bg-clip-text italic text-transparent">
              4 September
            </em>
          </h1>
          <p className="mt-2.5 text-[14px] text-white/55 max-w-[52ch]">
            Everything going out today, in the order it goes out. All times Phnom Penh.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
              {liveCount} of 12 channels live
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              Phnom Penh · UTC+7
            </span>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3">
            <StatTile label="Posted" value={postedCount} accent="text-emerald-300" />
            <StatTile label="Posting" value={sendingCount} accent="text-violet-300" busy={sendingCount > 0} />
            <StatTile label="Waiting" value={waitingCount} accent="text-amber-300" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-400 transition-all duration-500"
                style={{ width: `${doneRatio}%` }}
              />
            </div>
            <span className="font-mono text-[11.5px] text-white/45 tabular-nums">
              {doneRatio}% day complete
            </span>
          </div>
        </div>
      </section>

      <div className="mt-5 bg-white border border-ink-100 rounded-3xl shadow-card overflow-hidden">
        <header className="px-5 lg:px-7 pt-5 pb-3 flex items-center justify-between gap-3.5">
          <div>
            <h2 className="text-[15px] font-display text-ink-900 tracking-tight">Queue</h2>
            <p className="text-[12px] text-ink-400 mt-0.5">In dispatch order · refresh every 6s</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[12px] font-semibold text-ink-500">
            <span className="h-2 w-2 rounded-full bg-brand animate-pulse-glow" />
            live
          </span>
        </header>
        <DayView queue={queue} />
      </div>
    </div>
  )
}