import { Link } from 'react-router-dom'
import { FiCheck } from 'react-icons/fi'
import { Donut, MIX, fmtNum } from './Overview'

/** One boost pick, read at a glance by a business owner: what the attention is
 *  made of (a donut: reactions / comments / shares), how far above the usual
 *  post it is, and where it stands on the road to a boost (beat the average →
 *  brought leads → boost). The budget and the approve button only show once
 *  leads came from it. */
export default function BoostCard({ it, amount, skipped, boosting, onAmount, onApprove, onSkip }) {
  const parts = MIX.map((m) => ({ slug: m.id, label: m.label, color: m.color, value: it.mix?.[m.id] || 0 }))
  const total = parts.reduce((s, p) => s + p.value, 0)
  const talk = total ? Math.round(((parts[1].value + parts[2].value) / total) * 100) : 0
  const chip =
    it.kind === 'boost'
      ? { text: `Boost · suggested $${it.budget}`, cls: 'bg-emerald-50 border-emerald-200/60 text-emerald-700' }
      : it.kind === 'skip'
        ? { text: "Don't boost", cls: 'bg-ink-100 border-ink-200/60 text-ink-600' }
        : { text: 'Link leads to decide', cls: 'bg-amber-50 border-amber-200/60 text-amber-800' }
  const steps = [
    { label: 'Beat your average', done: true },
    { label: it.leads ? `${it.leads} lead${it.leads > 1 ? 's' : ''}` : 'Brought leads', done: it.leads > 0, now: !it.leads },
    { label: 'Boost', done: false, now: it.kind === 'boost' },
  ]
  const channel = it.channel.charAt(0).toUpperCase() + it.channel.slice(1)

  return (
    <div className="flex flex-col rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900" title={it.title}>
          {it.title}
        </h3>
        <span className={`flex-none whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.text}</span>
      </div>
      <div className="mt-1 text-[11.5px] text-ink-400">
        {channel} · posted {new Date(it.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        {it.reach > 0 && ` · ${fmtNum(it.reach)} reached`}
      </div>

      {/* the picture: what the attention is made of, and how far above the usual post */}
      <div className="mt-4 flex items-center gap-4">
        <Donut segments={parts} size={104} stroke={14} label="Engagement" of="by kind">
          <div>
            <div className="text-[17px] font-bold leading-none text-ink-900">{fmtNum(total)}</div>
            <div className="mt-0.5 text-[10px] text-ink-500">engaged</div>
          </div>
        </Donut>
        <div className="min-w-0">
          <div className="text-[30px] font-bold leading-none tracking-tight text-ink-900">{it.ratio}×</div>
          <div className="mt-1 text-[12px] leading-snug text-ink-600">
            more than your usual {channel} post{it.usual ? ` (${fmtNum(it.usual)})` : ''}
          </div>
          <ul className="mt-2 space-y-0.5 text-[11.5px] text-ink-600">
            {parts.map((p) => (
              <li key={p.slug} className="flex items-center gap-1.5">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: p.color }} aria-hidden="true" />
                {p.label} <b className="ml-auto pl-2 font-semibold tabular-nums text-ink-800">{fmtNum(p.value)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {total > 0 && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
          {talk >= 20
            ? `${talk}% are comments and shares — people are talking about it, not just liking it.`
            : `Mostly reactions — only ${talk}% comments and shares.`}
        </p>
      )}

      {it.summary && <p className="mt-2 text-[11.5px] italic leading-relaxed text-ink-500">“{it.summary}”</p>}

      {/* where it stands on the road to a boost */}
      <ol className="mt-4 flex items-center gap-1.5 text-[11px]">
        {steps.map((s, i) => (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                s.done ? 'bg-emerald-600 text-white' : s.now ? 'border-2 border-amber-400 text-amber-700' : 'border border-ink-200 text-ink-400'
              }`}
            >
              {s.done ? <FiCheck className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate ${s.done ? 'font-medium text-ink-800' : s.now ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="h-px min-w-[8px] flex-1 bg-ink-200" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-700">{it.reason}</p>

      {it.kind === 'boost' && (
        <div className="mt-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Budget</div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {it.tiers.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onAmount(amt)}
                className={`relative rounded-xl border p-2 text-left transition-all ${
                  amount === amt ? 'border-brand bg-brand-soft/30 shadow-xs' : 'border-ink-200 hover:bg-ink-50/70'
                }`}
              >
                {amt === it.budget && (
                  <span className="absolute -top-2 right-1.5 rounded-full bg-brand px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-white">
                    Suggested
                  </span>
                )}
                <div className="text-[13px] font-bold text-ink-900">${amt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 border-t border-ink-100 pt-3">
          {boosting ? (
            <span className="text-[12px] font-semibold text-emerald-700">Boosting now — see Your boosts below</span>
          ) : it.kind === 'boost' ? (
            skipped ? (
              <span className="text-[12px] italic text-ink-400">Skipped</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark"
                >
                  Approve boost · ${amount}
                </button>
                <button type="button" onClick={onSkip} className="text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800">
                  Skip
                </button>
              </>
            )
          ) : (
            <>
              {it.kind === 'check' ? (
                <Link to="/leads" className="btn-outline">
                  Link leads from this post
                </Link>
              ) : (
                <span className="text-[12px] text-ink-500">Likes, not buyers.</span>
              )}
              {/* the owner's call: boost it without leads to judge by */}
              {it.channel === 'facebook' && (
                <button type="button" onClick={onApprove} className="ml-auto text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800">
                  Boost anyway
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
