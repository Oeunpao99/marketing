import { useEffect, useState } from 'react'
import {
  FiAward,
  FiBookOpen,
  FiChevronDown,
  FiChevronUp,
  FiEye,
  FiMessageCircle,
  FiMinus,
  FiPlus,
  FiShield,
  FiSun,
  FiTarget,
  FiUserPlus,
  FiZap,
} from 'react-icons/fi'
import { DEFAULT_MIX, GOALS, STAGES } from '../../lib/goals'

// "Content goals": the 9 goals in Attract / Nurture / Convert, each with its
// KPI and a − / + share of the month. Saving it (PUT /weekly/mix) makes the
// next plan match; clicking a goal filters the posts below to it.

const STEP = 5
const ICON = {
  reach: FiSun,
  followers: FiUserPlus,
  awareness: FiEye,
  engagement: FiMessageCircle,
  education: FiBookOpen,
  trust: FiShield,
  authority: FiAward,
  solution: FiZap,
  conversion: FiTarget,
}
const OPEN_KEY = 'cf_goals_details'
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}
const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

export default function ContentGoals({ mix, custom, perMonth, counts, span = 'next week', filter, onFilter, onSave, saving }) {
  const [draft, setDraft] = useState(mix)
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (fn) =>
    setOpenState((o) => {
      const next = typeof fn === 'function' ? fn(o) : fn
      try {
        localStorage.setItem(OPEN_KEY, next ? '1' : '0')
      } catch {
        /* private window — just not remembered */
      }
      return next
    })
  useEffect(() => setDraft(mix), [mix])

  const total = Object.values(draft).reduce((s, v) => s + v, 0)
  const dirty = Object.keys(GOALS).some((g) => (draft[g] || 0) !== (mix[g] || 0))
  const bump = (g, by) => setDraft((d) => ({ ...d, [g]: Math.max(0, Math.min(100, (d[g] || 0) + by)) }))
  const stageTotal = (stage) => Object.keys(GOALS).filter((g) => GOALS[g].stage === stage).reduce((s, g) => s + (draft[g] || 0), 0)

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">Content goals</h2>
          <p className="mt-0.5 max-w-[78ch] text-[12px] leading-relaxed text-ink-500">
            Every post has one goal and is judged by that goal’s KPI, not only by leads. Set the monthly mix and the AI
            fills the plan to match. Click a goal to show only its posts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              total === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}
            title={total === 100 ? '' : 'The shares are scaled to add up to 100% when the plan is written'}
          >
            Mix total {total}%
          </span>
          {dirty && (
            <button type="button" disabled={saving || total === 0} onClick={() => onSave(draft)} className="btn-primary px-3 py-1.5">
              {saving ? 'Saving…' : 'Save mix'}
            </button>
          )}
          <button
            type="button"
            disabled={saving || (!custom && !dirty)}
            onClick={() => (custom ? onSave(null) : setDraft(DEFAULT_MIX))}
            className="btn-outline px-3 py-1.5"
            title={!custom && !dirty ? 'Already using the AI’s mix' : 'Go back to the mix the AI recommends'}
          >
            Reset to AI mix
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost px-2.5 py-1.5 text-brand" aria-expanded={open}>
            {open ? 'Hide details' : 'Show details'} {open ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {Object.entries(STAGES).map(([key, stage]) => (
            <div key={key} className="min-w-0">
              <div className={`flex items-baseline justify-between gap-2 border-b-2 pb-1.5 ${stage.line}`}>
                <span className={`text-[11px] font-bold uppercase tracking-[.08em] ${stage.text}`}>{stage.label}</span>
                <span className="text-[11.5px] text-ink-500">
                  {stage.sub} · {stageTotal(key)}%
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {Object.entries(GOALS)
                  .filter(([, g]) => g.stage === key)
                  .map(([gk, g]) => {
                    const pct = draft[gk] || 0
                    const active = filter === gk
                    return (
                      <div
                        key={gk}
                        className={`rounded-xl border p-3.5 transition-colors ${
                          active ? 'border-brand bg-brand-soft/60' : 'border-ink-200/70 hover:bg-ink-50/70'
                        }`}
                      >
                        <button type="button" onClick={() => onFilter(active ? '' : gk)} className="block w-full text-left" aria-pressed={active}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-semibold text-ink-900">{g.label}</span>
                            <span className="text-[11px] text-ink-400">{`${counts[gk] || 0} ${span}`}</span>
                          </span>
                          <span className="mt-1 block text-[12px] text-ink-600">{g.desc}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">e.g. {g.eg}</span>
                        </button>
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
                          <span className="min-w-0 truncate text-[11px] text-ink-500">
                            KPI · <b className="font-semibold text-ink-700">{g.kpi}</b>
                          </span>
                          <span className="flex flex-none items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => bump(gk, -STEP)}
                              disabled={pct <= 0}
                              aria-label={`Less ${g.label}`}
                              className="grid h-7 w-7 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                            >
                              <FiMinus size={13} />
                            </button>
                            <span className="w-11 text-center leading-tight">
                              <b className="block text-[13px] tabular-nums text-ink-900">{pct}%</b>
                              <span className="block text-[10px] tabular-nums text-ink-400">≈{Math.round((pct / Math.max(total, 1)) * perMonth)}/mo</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => bump(gk, STEP)}
                              disabled={pct >= 100}
                              aria-label={`More ${g.label}`}
                              className="grid h-7 w-7 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                            >
                              <FiPlus size={13} />
                            </button>
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(GOALS).map(([gk, g]) => {
            const Icon = ICON[gk] || FiTarget
            const active = filter === gk
            const n = counts[gk] || 0
            return (
              <button
                key={gk}
                type="button"
                onClick={() => onFilter(active ? '' : gk)}
                aria-pressed={active}
                title={`${g.label} · KPI: ${g.kpi} · ${n} post${n === 1 ? '' : 's'} ${span} — click to show only these`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                  active ? 'border-brand bg-brand-soft text-brand' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                }`}
              >
                <Icon size={13} className={active ? 'text-brand' : 'text-ink-500'} aria-hidden="true" />
                {g.label}
                <span className="font-mono text-[12px] tabular-nums text-ink-500">· {draft[gk] || 0}%</span>
                {n === 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`No post for this goal ${span}`} />}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
