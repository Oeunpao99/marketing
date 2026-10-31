import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { fmtNum } from './Overview'

/** Real boosts (app/boosts.py): the brand's Facebook ad account, the confirm
 *  drawer that sends a boost, and the list of boosts with their spend. Only
 *  owners and admins connect, boost or stop — it spends money. */

const DAYS = [3, 5, 7]

function Drawer({ title, sub, onClose, children, footer }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <div role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in">
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 pb-4 pt-6">
          <div>
            <h2 className="text-[16px] font-bold text-ink-900">{title}</h2>
            {sub && <p className="mt-0.5 text-[12px] text-ink-500">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-3 border-t border-ink-100 px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/** The ad accounts from a Facebook login (?ads_pending=…): pick the one boosts are paid from. */
export function AdAccountPicker({ pending, saving, onPick, onClose }) {
  return (
    <Drawer title="Pick the ad account" sub={`Boosts for ${pending.brand_name} will be paid from it.`} onClose={onClose}>
      {pending.accounts.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-600">
          This Facebook login has no ad accounts. Create one in Meta Business settings (Accounts → Ad accounts), add a card, then connect again.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.accounts.map((a) => {
            const usable = a.currency === 'USD' && a.active
            return (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={!usable || saving}
                  onClick={() => onPick(a.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3 text-left transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink-900">{a.name}</span>
                    <span className="block text-[11.5px] text-ink-500">
                      {a.id.replace('act_', 'ID ')} · {a.currency}
                      {!a.active && ' · not active'}
                      {a.active && a.currency !== 'USD' && ' · boosts need US dollars'}
                    </span>
                  </span>
                  {usable && <span className="text-[12px] font-semibold text-brand-text">Use this</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}

/** Approve a boost: how much, how long, who sees it — then it goes to Facebook. */
export function BoostDrawer({ item, account, sending, onSend, onClose }) {
  const [amount, setAmount] = useState(item.budget || 10)
  const [other, setOther] = useState('')
  const [days, setDays] = useState(5)
  const budget = other !== '' ? Number(other) : amount
  const ok = Number.isFinite(budget) && budget >= 3 && budget <= 500
  return (
    <Drawer
      title="Boost this post on Facebook"
      sub="Facebook shows it to more people in Cambodia. You only pay what it spends, up to your budget."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ok || sending}
            onClick={() => onSend({ post_id: item.post_id, budget_usd: budget, days })}
            className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark disabled:opacity-60"
          >
            {sending ? 'Sending to Facebook…' : `Boost · $${ok ? budget : '—'} over ${days} days`}
          </button>
        </>
      }
    >
      <div className="rounded-xl border border-ink-200/70 px-4 py-3">
        <div className="line-clamp-2 text-[13px] font-semibold text-ink-900">{item.title}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-500">
          {item.ratio}× your usual engagement · {fmtNum(item.reach)} reached so far
        </div>
      </div>

      <div className="mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Total budget</div>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {[10, 25, 50].map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => {
              setAmount(amt)
              setOther('')
            }}
            className={`rounded-xl border p-2.5 text-left text-[13px] font-bold transition-all ${
              other === '' && amount === amt ? 'border-brand bg-brand-soft/30 text-ink-900' : 'border-ink-200 text-ink-900 hover:bg-ink-50/70'
            }`}
          >
            ${amt}
          </button>
        ))}
        <input
          type="number"
          min={3}
          max={500}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Other"
          className={`input rounded-xl text-[13px] font-bold ${other !== '' ? 'border-brand' : ''}`}
          aria-label="Other amount in US dollars"
        />
      </div>
      {other !== '' && !ok && <p className="mt-1.5 text-[11.5px] text-red-600">Between $3 and $500.</p>}

      <div className="mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-400">How long</div>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-xl border p-2.5 text-[13px] font-semibold transition-all ${days === d ? 'border-brand bg-brand-soft/30 text-ink-900' : 'border-ink-200 text-ink-700 hover:bg-ink-50/70'}`}
          >
            {d} days
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2 rounded-xl bg-canvas px-4 py-3 text-[12px]">
        {[
          ['Who sees it', 'People in Cambodia, 18 and over'],
          ['Per day', ok ? `about $${(budget / days).toFixed(2)}` : '—'],
          ['Paid from', account ? `${account.name} (${account.currency})` : '—'],
          ['Starts', 'after Facebook reviews the ad — usually within an hour'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-500">{k}</dt>
            <dd className="text-right font-medium text-ink-800">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">You can stop it any time from this page — you pay only for what was spent until then.</p>
    </Drawer>
  )
}

const STATUS = {
  in_review: { text: 'In review', cls: 'bg-amber-50 border-amber-200/60 text-amber-800' },
  running: { text: 'Running', cls: 'bg-emerald-50 border-emerald-200/60 text-emerald-700' },
  stopped: { text: 'Stopped', cls: 'bg-ink-100 border-ink-200/60 text-ink-600' },
  finished: { text: 'Finished', cls: 'bg-ink-100 border-ink-200/60 text-ink-600' },
  rejected: { text: 'Not approved', cls: 'bg-red-50 border-red-200/60 text-red-700' },
  failed: { text: 'Failed', cls: 'bg-red-50 border-red-200/60 text-red-700' },
}

/** The boosts sent from here: spent of budget (a bar), reach, and Stop. */
export function BoostList({ boosts, canManage, stopping, onStop }) {
  if (!boosts.length) return null
  return (
    <div className="mt-5 rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <h3 className="text-[14.5px] font-bold text-ink-900">Your boosts</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-400">Numbers from Facebook, updated every 20 minutes</p>
      <ul className="mt-3 divide-y divide-ink-100">
        {boosts.map((b) => {
          const st = STATUS[b.status] || STATUS.running
          const used = b.budget_usd ? Math.min(1, b.spend_usd / b.budget_usd) : 0
          const live = b.status === 'running' || b.status === 'in_review'
          return (
            <li key={b.id} className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_240px_190px_76px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink-900">{b.title}</span>
                  <span className={`flex-none rounded-full border px-2 py-px text-[10.5px] font-semibold ${st.cls}`}>{st.text}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-500">
                  ${b.budget_usd} over {b.days} days
                  {b.ends_at && live && ` · ends ${new Date(b.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </div>
                {b.note && <div className="mt-0.5 text-[11.5px] text-red-600">{b.note}</div>}
              </div>
              <div>
                <div className="flex justify-between text-[11.5px] text-ink-600">
                  <span>
                    Spent <b className="text-ink-900">${b.spend_usd.toFixed(2)}</b>
                  </span>
                  <span>{Math.round(used * 100)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={b.budget_usd} aria-valuenow={b.spend_usd} aria-label="Spent of budget">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${used * 100}%` }} />
                </div>
              </div>
              <div className="flex gap-4 text-[11.5px] text-ink-500">
                <span>
                  Reach <b className="text-ink-800">{fmtNum(b.reach)}</b>
                </span>
                <span>
                  Engaged <b className="text-ink-800">{fmtNum(b.engaged)}</b>
                </span>
              </div>
              <div className="sm:text-right">
                {canManage && live && (
                  <button type="button" disabled={stopping === b.id} onClick={() => onStop(b)} className="btn-outline disabled:opacity-60">
                    {stopping === b.id ? 'Stopping…' : 'Stop'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
