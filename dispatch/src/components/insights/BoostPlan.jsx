import { useState } from 'react'
import { fmtNum } from './Overview'

/** "What would a monthly boost budget reach?" — worked out ONLY from the boosts this
 *  workspace has really run (their spend, reach and engagement), never from example
 *  figures. Until $10 has been spent there is nothing honest to say, so it says so.
 *  Leads, deals and ROI need leads linked to posts and the CRM's close rates; they
 *  join this card when those exist. */

const MIN_SPEND = 10 // dollars spent before the numbers mean anything
const BUDGETS = [100, 250, 500, 1000]
const usd = (n) => `$${Number(n).toFixed(n < 10 ? 2 : 0)}`

export default function BoostPlan({ boosts, canApprove, onApprove }) {
  const [budget, setBudget] = useState(250)
  const spent = boosts.reduce((a, b) => a + b.spend_usd, 0)
  const reach = boosts.reduce((a, b) => a + b.reach, 0)
  const engaged = boosts.reduce((a, b) => a + b.engaged, 0)
  const ready = spent >= MIN_SPEND && reach > 0
  const perThousand = ready ? (spent / reach) * 1000 : 0
  const perEngagement = ready && engaged ? spent / engaged : 0
  const need = Math.max(0, MIN_SPEND - spent)

  return (
    <div className="mt-8 rounded-2xl border border-ink-200/60 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight text-ink-900">Budget plan</h2>
          <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-ink-500">
            What a monthly boost budget would reach — worked out from the boosts you have really run, not from examples.
          </p>
        </div>
        {ready && (
          <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Monthly budget">
            {BUDGETS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={budget === b}
                onClick={() => setBudget(b)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${budget === b ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                ${b.toLocaleString()}
              </button>
            ))}
          </div>
          {canApprove && (
            <button type="button" onClick={() => onApprove(budget)} className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark">
              Approve ${budget.toLocaleString()} a month
            </button>
          )}
          </div>
        )}
      </div>

      {!ready ? (
        <div className="mt-4 rounded-xl bg-canvas px-4 py-4">
          <div className="flex items-center justify-between text-[12px] text-ink-600">
            <span>
              Spent on boosts so far <b className="text-ink-900">{usd(spent)}</b>
            </span>
            <span>of {usd(MIN_SPEND)} needed</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={MIN_SPEND} aria-valuenow={Math.min(spent, MIN_SPEND)} aria-label="Spent towards the plan">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (spent / MIN_SPEND) * 100)}%` }} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
            {boosts.length
              ? `Once ${usd(need)} more has been spent, this shows what a monthly budget would reach.`
              : 'Run your first boost — after about $10 has been spent, this shows what a monthly budget would reach, and what each person reached costs you.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Monthly budget', usd(budget), `${usd(budget / 30)} a day`],
              ['People it would reach', `≈ ${fmtNum(Math.round((budget / perThousand) * 1000))}`, `at ${usd(perThousand)} per 1,000 people`],
              ['Engagements', perEngagement ? `≈ ${fmtNum(Math.round(budget / perEngagement))}` : '—', perEngagement ? `at ${usd(perEngagement)} each` : 'none yet'],
              ['Based on', `${boosts.length} boost${boosts.length === 1 ? '' : 's'}`, `${usd(spent)} spent · ${fmtNum(reach)} reached`],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-xl bg-canvas px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{k}</div>
                <div className="mt-0.5 text-[21px] font-bold leading-tight tracking-tight text-ink-900">{v}</div>
                <div className="text-[11.5px] text-ink-500">{sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
            An estimate: your next boosts may cost more or less. Leads, deals and return on spend appear here once leads are linked to the posts you boost.
          </p>
        </>
      )}
    </div>
  )
}
