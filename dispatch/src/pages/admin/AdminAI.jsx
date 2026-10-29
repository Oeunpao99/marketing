import { useCallback, useEffect, useState } from 'react'
import { FiCheck, FiRefreshCw } from 'react-icons/fi'
import ModelLogo from '../../components/ui/ModelLogo'
import { AccountBars, ModelDonut, SpendLine } from './AdminCharts'

// Admin portal → AI usage (backend app/admin.py /ai/*): every writing model's
// price per 1M tokens, markup and on/off; what each model and each tenant used
// over a period — tokens in / out, what it cost us, what their credit was
// charged and the margin. AccountAiSection is the same per tenant, in the
// account drawer: which models it may use, and each person's usage by model.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const usd = (n) => `$${Number(n || 0).toFixed(Number(n || 0) < 1 ? 4 : 2)}`
const num = (n) => Number(n || 0).toLocaleString()
const PERIODS = [7, 30, 90]

function useAdminLoad(api, path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setData(await api('GET', path))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [api, path])
  useEffect(() => {
    load()
  }, [load])
  return { data, error, load, setData }
}

export default function AiUsage({ api, onOpen }) {
  const [days, setDays] = useState(30)
  const usage = useAdminLoad(api, `/ai/usage?days=${days}`)
  const models = useAdminLoad(api, '/ai/models')
  const [open, setOpen] = useState(null)
  const label = (k) => models.data?.models.find((m) => m.key === k)?.label || k || 'Other'
  const u = usage.data
  const total = (u?.models || []).reduce((a, m) => ({ cost: a.cost + m.cost, charged: a.charged + m.charged, calls: a.calls + m.calls }), { cost: 0, charged: 0, calls: 0 })

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">AI usage</h1>
          <p className="mt-1 text-[13px] text-ink-500">What each model and each account used — our cost, what their credit was charged, and the margin.</p>
        </div>
        <div className="flex rounded-xl bg-ink-100 p-1">
          {PERIODS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${days === d ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
              {d} days
            </button>
          ))}
        </div>
        <button type="button" onClick={() => (usage.load(), models.load())} className="grid h-9 w-9 place-items-center rounded-xl text-ink-500 hover:bg-ink-100" aria-label="Reload">
          <FiRefreshCw size={15} />
        </button>
      </header>

      {usage.error && <p className="text-[13px] text-red-600">{usage.error}</p>}

      {/* totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          ['AI calls', num(total.calls)],
          ['Cost to us', usd(total.cost)],
          ['Charged to credit', usd(total.charged)],
          ['Margin', usd(total.charged - total.cost)],
        ].map(([k, v]) => (
          <div key={k} className={`${card} px-4 py-3.5`}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
            <div className="mt-1 text-[20px] font-bold tabular-nums text-ink-900">{v}</div>
          </div>
        ))}
      </div>

      {/* the charts: over time, by model, by account — the tables below have every number */}
      {u && (
        <>
          <section className={`${card} px-5 py-4`}>
            <h2 className="mb-3 text-[13.5px] font-semibold text-ink-900">Per day, by model</h2>
            <SpendLine daily={u.daily || []} keys={u.models.map((m) => m.model)} label={label} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className={`${card} px-5 py-4`}>
              <h2 className="mb-3 text-[13.5px] font-semibold text-ink-900">Share by model</h2>
              <ModelDonut models={u.models} label={label} />
            </section>
            <section className={`${card} px-5 py-4`}>
              <h2 className="mb-3 text-[13.5px] font-semibold text-ink-900">Top accounts</h2>
              <AccountBars tenants={u.tenants} onOpen={onOpen} />
            </section>
          </div>
        </>
      )}

      {/* by model */}
      <section className={card}>
        <h2 className="border-b border-ink-100 px-5 py-3 text-[13.5px] font-semibold text-ink-900">By model</h2>
        {/* a phone: one card per model */}
        <ul className="divide-y divide-ink-100 md:hidden">
          {(u?.models || []).map((m) => (
            <li key={m.model} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <ModelLogo model={m.model} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">{label(m.model)}</span>
                <span className="text-[13px] font-bold tabular-nums text-ink-900">{usd(m.charged)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-[11.5px] tabular-nums text-ink-500">
                <span>{num(m.calls)} calls</span>
                <span>{num(m.tokens)} tokens</span>
                {m.input_tokens + m.output_tokens > 0 && (
                  <span>
                    {num(m.input_tokens)} in · {num(m.output_tokens)} out
                  </span>
                )}
                <span>cost {usd(m.cost)}</span>
              </div>
            </li>
          ))}
          {u && !u.models.length && <li className="px-5 py-4 text-[12.5px] text-ink-400">No AI writing in this period.</li>}
        </ul>
        <table className="hidden w-full text-[12.5px] md:table">
          <thead>
            <tr className="text-left text-ink-400">
              <th className="px-5 py-2 font-medium">Model</th>
              <th className="px-2 py-2 text-right font-medium">Calls</th>
              <th className="px-2 py-2 text-right font-medium">Tokens in</th>
              <th className="px-2 py-2 text-right font-medium">Tokens out</th>
              <th className="px-2 py-2 text-right font-medium">Total tokens</th>
              <th className="px-2 py-2 text-right font-medium">Cost</th>
              <th className="px-5 py-2 text-right font-medium">Charged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(u?.models || []).map((m) => (
              <tr key={m.model} className="text-ink-700">
                <td className="px-5 py-2 font-semibold text-ink-900">
                  <span className="inline-flex items-center gap-2">
                    <ModelLogo model={m.model} />
                    {label(m.model)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{num(m.calls)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(m.input_tokens)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(m.output_tokens)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(m.tokens)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(m.cost)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{usd(m.charged)}</td>
              </tr>
            ))}
            {u && !u.models.length && (
              <tr>
                <td colSpan={7} className="px-5 py-4 text-ink-400">No AI writing in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* by account */}
      <section className={card}>
        <h2 className="border-b border-ink-100 px-5 py-3 text-[13.5px] font-semibold text-ink-900">By account</h2>
        <ul className="divide-y divide-ink-100">
          {(u?.tenants || []).map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">{t.name}</span>
                <span className="w-20 text-right text-[12px] tabular-nums text-ink-500">{num(t.calls)} calls</span>
                <span className="w-24 text-right text-[12px] tabular-nums text-ink-500">cost {usd(t.cost)}</span>
                <span className="w-24 text-right text-[12.5px] font-semibold tabular-nums text-ink-900">{usd(t.charged)}</span>
              </button>
              {open === t.id && (
                <div className="bg-ink-50/60 px-5 pb-3 pt-1">
                  <table className="w-full text-[12px]">
                    <tbody>
                      {t.models.map((m) => (
                        <tr key={m.model} className="text-ink-600">
                          <td className="py-1">
                            <span className="inline-flex items-center gap-1.5">
                              <ModelLogo model={m.model} size={13} />
                              {label(m.model)}
                            </span>
                          </td>
                          <td className="py-1 text-right tabular-nums">{num(m.calls)} calls</td>
                          <td className="py-1 text-right tabular-nums">
                            {num(m.input_tokens)} in · {num(m.output_tokens)} out
                          </td>
                          <td className="py-1 text-right tabular-nums">cost {usd(m.cost)}</td>
                          <td className="py-1 text-right font-semibold tabular-nums text-ink-800">{usd(m.charged)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={() => onOpen(t.id)} className="mt-2 text-[12px] font-semibold text-brand hover:underline">
                    Open account → models and people
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* models & pricing */}
      <section className={card}>
        <h2 className="border-b border-ink-100 px-5 py-3 text-[13.5px] font-semibold text-ink-900">Models & pricing</h2>
        <p className="px-5 pt-3 text-[12px] text-ink-500">
          Price = what the provider charges us per 1M tokens. Credit charged = price × markup. A model needs its keys in the server’s .env and a price before it can be turned on.
        </p>
        <div className="divide-y divide-ink-100">
          {(models.data?.models || []).map((m) => (
            <ModelRow key={m.key} m={m} api={api} onSaved={(d) => models.setData(d)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ModelRow({ m, api, onSaved }) {
  const [v, setV] = useState({ price_in: m.price_in, price_out: m.price_out, markup: m.markup })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const dirty = v.price_in !== m.price_in || v.price_out !== m.price_out || v.markup !== m.markup
  const save = async (body) => {
    setBusy(true)
    setNote('')
    try {
      onSaved(await api('PATCH', `/ai/models/${m.key}`, body))
      setNote('Saved')
    } catch (e) {
      setNote(`⚠ ${e.message}`)
    } finally {
      setBusy(false)
    }
  }
  const field = (k, label, step) => (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-500 md:flex-row md:items-center md:gap-1.5 md:text-[12px]">
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
        className="w-full min-w-0 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12.5px] tabular-nums text-ink-900 outline-none focus:border-brand md:w-20"
      />
    </label>
  )
  return (
    <div className="flex flex-col gap-2.5 px-5 py-3 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
      <div className="min-w-0 md:min-w-[180px] md:flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-900">
          <ModelLogo model={m.key} vendor={m.vendor} size={18} />
          {m.label}
          <span className="text-[11px] font-medium text-ink-400">{m.vendor}</span>
          {!m.configured && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">no key in .env</span>}
        </div>
        <div className="text-[11.5px] text-ink-500">
          Charged ${(v.price_in * v.markup).toFixed(2)} in · ${(v.price_out * v.markup).toFixed(2)} out per 1M tokens
        </div>
      </div>
      {/* a phone: the three boxes side by side, then On / Save */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 md:contents">
      {field('price_in', 'In $', '0.01')}
      {field('price_out', 'Out $', '0.01')}
      {field('markup', '× markup', '0.05')}
      {dirty ? (
        <button type="button" disabled={busy} onClick={() => save(v)} className="btn-primary !px-3 !py-1.5 text-[12px]">
          {busy ? 'Saving…' : 'Save'}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ enabled: !m.enabled })}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${m.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}
        >
          {m.enabled ? 'On' : 'Off'}
        </button>
      )}
      </div>
      {note && <span className={`text-[11.5px] ${note.startsWith('⚠') ? 'text-red-600' : 'text-emerald-700'}`}>{note}</span>}
    </div>
  )
}

/** Account drawer: which models this account may use, and each person's usage by model. */
export function AccountAiSection({ id, api }) {
  const { data, error, load } = useAdminLoad(api, `/workspaces/${id}/ai`)
  const [busy, setBusy] = useState(false)
  if (error) return <p className="text-[12.5px] text-red-600">{error}</p>
  if (!data) return <p className="text-[12.5px] text-ink-400">Loading…</p>
  const all = data.allowed === null
  const allowed = all ? data.catalog.map((c) => c.key) : data.allowed
  const save = async (next) => {
    setBusy(true)
    try {
      await api('POST', `/workspaces/${id}/ai-models`, { allowed: next })
      await load()
    } finally {
      setBusy(false)
    }
  }
  const toggle = (key) => {
    const next = allowed.includes(key) ? allowed.filter((k) => k !== key) : [...allowed, key]
    save(next)
  }
  const label = (k) => data.catalog.find((c) => c.key === k)?.label || k || 'Other'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(all ? data.catalog.map((c) => c.key) : null)}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${all ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600'}`}
        >
          {all ? 'All models' : 'Allow all'}
        </button>
        {data.catalog.map((c) => {
          const on = allowed.includes(c.key)
          return (
            <button
              key={c.key}
              type="button"
              disabled={busy}
              onClick={() => toggle(c.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${on ? 'border-brand bg-brand-soft text-brand' : 'border-ink-200 text-ink-500'}`}
            >
              {on ? <FiCheck size={12} /> : <ModelLogo model={c.key} size={13} />}
              {c.label}
              {data.default === c.key && <span className="text-[10.5px] font-medium">· default</span>}
            </button>
          )
        })}
      </div>
      {data.usage.length === 0 ? (
        <p className="text-[12.5px] text-ink-400">No AI writing in the last 30 days.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-400">
              <th className="py-1 font-medium">Person</th>
              <th className="py-1 font-medium">Model</th>
              <th className="py-1 text-right font-medium">Tokens in / out</th>
              <th className="py-1 text-right font-medium">Cost</th>
              <th className="py-1 text-right font-medium">Charged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.usage.map((r, i) => (
              <tr key={i} className="text-ink-700">
                <td className="py-1.5">{r.user}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <ModelLogo model={r.model} size={13} />
                    {label(r.model)}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {num(r.input_tokens)} / {num(r.output_tokens)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{usd(r.cost)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{usd(r.charged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
