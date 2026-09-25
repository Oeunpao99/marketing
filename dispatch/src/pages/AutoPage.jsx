import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { FiPlay, FiRefreshCw, FiSettings, FiTrendingUp, FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import { PLAT } from '../data/brands'
import PlatformIcon from '../components/ui/PlatformIcon'
import AutoTextarea from '../components/ui/AutoTextarea'
import { seedRuns, startRun, useAutoRuns, useSmoothProgress } from '../lib/autoRuns'

const TOPIC_SOURCES = [
  { value: 'Trending in Cambodia + your topic bank', short: 'Trending + topic bank' },
  { value: 'Your topic bank only', short: 'Topic bank' },
  { value: 'Product feature list', short: 'Product features' },
  { value: 'AI news feeds', short: 'AI news' },
]

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const input =
  'w-full bg-white border border-ink-200 rounded-xl px-3 py-2 text-[12.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'

function when(dateStr) {
  if (!dateStr) return 'never'
  const today = new Date().toISOString().slice(0, 10)
  return dateStr === today ? 'today' : dateStr
}

function modeOf(a) {
  if (a.require_approval) return 'Review first'
  return a.auto_media ? 'Auto-post' : 'To calendar'
}

export default function AutoPage() {
  const { auto, setAuto, refreshAuto, refreshReview, channels, showToast } = useStore()
  const runs = useAutoRuns()
  const [starting, setStarting] = useState(null)
  const [confirmRegen, setConfirmRegen] = useState(null)
  const [editId, setEditId] = useState(null)

  const editing = (auto || []).find((a) => a.id === editId) || null

  // A run started before a reload (or by someone else) — keep showing it.
  useEffect(() => seedRuns(auto), [auto])

  const update = async (automation, patch) => {
    setAuto((list) => (list || []).map((a) => (a.id === automation.id ? { ...a, ...patch } : a)))
    try {
      await api.patch(`/automations/${automation.id}`, patch)
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      refreshAuto()
    }
  }

  const updateBrand = async (automation, patch) => {
    const local = {}
    if ('lang' in patch) local.brand_lang = patch.lang
    if ('voice_examples' in patch) local.brand_voice = patch.voice_examples
    setAuto((list) => (list || []).map((a) => (a.brand_id === automation.brand_id ? { ...a, ...local } : a)))
    try {
      await api.patch(`/brands/${automation.brand_id}`, patch)
      showToast('Brand voice saved')
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      refreshAuto()
    }
  }

  // Starts the run in the background and returns right away — progress
  // shows on the brand's row (and in its settings drawer); a toast says when
  // it's done, even from another page (see Shell's useRunFinishedToast).
  const runNow = async (automation, force = false) => {
    if (starting || runs[automation.id]) return
    setStarting(automation.id)
    setConfirmRegen(null)
    try {
      await startRun(automation.id, force)
      showToast(`${force ? 'Regenerating' : 'Generating'} in the background — you can keep working`)
    } catch (e) {
      showToast(`Could not start — ${e.message}`)
    } finally {
      setStarting(null)
    }
  }

  // Ran today already → the action becomes "regenerate", which asks first.
  const run = (a) => (when(a.last_run_on) === 'today' ? setConfirmRegen(a) : runNow(a))

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Auto-generate</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            Daily AI-written ideas for each brand, grounded in its products.
          </p>
        </div>
        <Link to="/products" className="btn-outline flex-none">
          Manage products
        </Link>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] font-semibold text-ink-500">
                <th className="px-5 py-3 font-semibold">Brand</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Schedule</th>
                <th className="px-3 py-3 font-semibold">Topics</th>
                <th className="px-3 py-3 font-semibold">Mode</th>
                <th className="px-3 py-3 font-semibold">Media</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {auto === null
                ? [0, 1, 2].map((n) => (
                    <tr key={n} className="border-t border-ink-100">
                      <td className="px-5 py-4" colSpan={7}>
                        <div className="h-4 w-1/2 rounded skeleton" />
                      </td>
                    </tr>
                  ))
                : auto.map((a) => {
                    const color = colorForBrand(a.brand_slug)
                    const active = runs[a.id]
                    const running = !!active || starting === a.id
                    const topic = TOPIC_SOURCES.find((t) => t.value === a.topic_source)?.short || a.topic_source || '—'
                    return (
                      <tr
                        key={a.id}
                        onClick={() => setEditId(a.id)}
                        className="border-t border-ink-100 hover:bg-ink-50/60 cursor-pointer transition-colors duration-100"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: color }} />
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-ink-900 truncate">{a.brand_name}</div>
                              {active ? (
                                <RunProgress run={active} />
                              ) : (
                                <div className="text-[11.5px] text-ink-500">
                                  {a.brand_lang || 'No language set'} · wrote {when(a.last_run_on)}
                                  {a.learn_from_results && a.learnings?.rules?.length > 0 && (
                                    <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-700">
                                      <FiTrendingUp size={11} aria-hidden="true" /> learning from {a.learnings.rules.length} result
                                      {a.learnings.rules.length === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <Toggle on={a.enabled} onChange={(v) => update(a, { enabled: v })} />
                        </td>
                        <td className="px-3 py-3.5 text-[12.5px] text-ink-700 tabular-nums">
                          {a.enabled ? `${a.run_at} · ${a.videos_per_day}/day` : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-3 py-3.5 text-[12.5px] text-ink-700">
                          {a.enabled ? topic : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-3 py-3.5 text-[12.5px] text-ink-700">
                          {a.enabled ? modeOf(a) : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-700">
                            <span className={`w-2 h-2 rounded-full ${a.auto_media ? 'bg-emerald-500' : 'bg-ink-300'}`} />
                            {a.auto_media ? 'On' : 'Off'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {a.enabled && (
                              <button
                                type="button"
                                disabled={running}
                                onClick={() => run(a)}
                                title={when(a.last_run_on) === 'today' ? "Regenerate today's ideas" : "Generate today's ideas now"}
                                className="w-8 h-8 grid place-items-center rounded-lg text-ink-500 hover:bg-brand-soft hover:text-brand disabled:opacity-50"
                              >
                                {running ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                                ) : when(a.last_run_on) === 'today' ? (
                                  <FiRefreshCw size={15} />
                                ) : (
                                  <FiPlay size={15} />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditId(a.id)}
                              title="Settings"
                              className="w-8 h-8 grid place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                            >
                              <FiSettings size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <SettingsDrawer
          a={editing}
          channels={channels}
          run={runs[editing.id]}
          running={!!runs[editing.id] || starting === editing.id}
          onUpdate={(patch) => update(editing, patch)}
          onBrandUpdate={(patch) => updateBrand(editing, patch)}
          onRun={() => run(editing)}
          onClose={() => setEditId(null)}
        />
      )}

      {confirmRegen &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] glass-overlay flex items-center justify-center p-4 animate-fadein"
            onClick={() => setConfirmRegen(null)}
          >
            <div className="glass-panel rounded-3xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[15.5px] font-bold text-ink-900 tracking-tight">Regenerate today’s ideas?</h3>
              <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed">
                Today’s batch for <b className="text-ink-800">{confirmRegen.brand_name}</b> is replaced with a fresh
                one. Anything already <b>posted for real</b> is left alone. This can’t be undone.
              </p>
              <p className="mt-2 text-[12px] text-ink-400">
                It runs in the background — you’ll see the progress on the brand’s row and can keep working.
              </p>
              <div className="mt-6 flex gap-2 justify-end">
                <button type="button" onClick={() => setConfirmRegen(null)} className="btn-outline">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => runNow(confirmRegen, true)}
                  className="btn bg-red-600 text-white hover:bg-red-700"
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function RunProgress({ run, className = '' }) {
  const pct = useSmoothProgress(run)
  return (
    <div className={`mt-1 w-full max-w-[280px] ${className}`}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-brand font-medium truncate">{run.step || 'Working…'}</span>
        <span className="tabular-nums font-semibold text-ink-700 flex-none">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-brand-soft overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

const LANGUAGES = ['English', 'Khmer', 'Khmer + English']

function SettingsDrawer({ a, channels, run, running, onUpdate, onBrandUpdate, onRun, onClose }) {
  const [voice, setVoice] = useState(a.brand_voice || '')
  useEffect(() => setVoice(a.brand_voice || ''), [a.brand_id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // null/empty auto_channel_ids means "every connected channel".
  const live = channels.filter((c) => c.b === a.brand_slug && c.s === 'live')
  const liveIds = live.map((c) => c.id)
  const allowed = (id) => !a.auto_channel_ids || a.auto_channel_ids.length === 0 || a.auto_channel_ids.includes(id)
  const toggleChannel = (id, checked) => {
    const current = a.auto_channel_ids && a.auto_channel_ids.length ? a.auto_channel_ids : liveIds
    const next = checked ? [...new Set([...current, id])] : current.filter((x) => x !== id)
    const all = liveIds.length > 0 && liveIds.every((x) => next.includes(x))
    onUpdate({ auto_channel_ids: all ? null : next })
  }
  const ranToday = when(a.last_run_on) === 'today'

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button type="button" aria-label="Close" className="absolute inset-0 glass-overlay animate-fadein cursor-default" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-[440px] glass-drawer animate-drawer-in flex flex-col"
      >
        <header className="flex items-center gap-3 px-6 py-5 border-b border-ink-100">
          <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: colorForBrand(a.brand_slug) }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] font-bold text-ink-900 tracking-tight truncate">{a.brand_name}</h2>
            <p className="text-[11.5px] text-ink-500">
              {a.brand_lang || 'No language set'} · last wrote {when(a.last_run_on)}
            </p>
          </div>
          <Toggle on={a.enabled} onChange={(v) => onUpdate({ enabled: v })} />
          <button type="button" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Close">
            <FiX size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!a.enabled && (
            <div className="rounded-xl bg-ink-50 px-3.5 py-3 text-[12px] text-ink-600">
              Automation is off for this brand. Turn it on to write ideas every day.
            </div>
          )}

          <Section title="Brand voice">
            <Field label="Language">
              <div className="grid grid-cols-3 rounded-xl border border-ink-200 p-0.5">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onBrandUpdate({ lang: l })}
                    className={`py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                      (a.brand_lang || '') === l ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Example captions">
              <AutoTextarea
                value={voice}
                minRows={4}
                maxRows={12}
                onChange={(e) => setVoice(e.target.value)}
                onBlur={() => voice !== (a.brand_voice || '') && onBrandUpdate({ voice_examples: voice })}
                placeholder="Paste 3–5 real captions you've posted and liked, one after another. The AI copies their tone and wording — not their facts."
                className={`${input} leading-relaxed ${/[\u1780-\u17FF]/.test(voice) ? 'font-khmer' : ''}`}
              />
              <p className="mt-1 text-[11px] text-ink-400">Saved when you click away.</p>
            </Field>
          </Section>

          <Section title="Learn from results">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ink-800">Use what works for this brand</div>
                <div className="text-[11px] text-ink-500">Writes and schedules new posts using your own post results</div>
              </div>
              <Toggle on={a.learn_from_results} onChange={(v) => onUpdate({ learn_from_results: v })} />
            </div>
            {a.learn_from_results && <Learned learnings={a.learnings} />}
          </Section>

          <Section title="Schedule">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Write at">
                <input type="time" value={a.run_at} className={input} onChange={(e) => onUpdate({ run_at: e.target.value })} />
              </Field>
              <Field label="Ideas per day">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={a.videos_per_day}
                  className={input}
                  onChange={(e) => onUpdate({ videos_per_day: Math.max(1, Math.min(10, +e.target.value || 1)) })}
                />
              </Field>
            </div>
            <Field label="Topics from">
              <select value={a.topic_source} className={input} onChange={(e) => onUpdate({ topic_source: e.target.value })}>
                {TOPIC_SOURCES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.value}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Delivery">
            <Field label="Before it lands">
              <div className="grid grid-cols-2 rounded-xl border border-ink-200 p-0.5">
                {[
                  { v: true, l: 'Review first' },
                  { v: false, l: 'Skip review' },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    onClick={() => onUpdate({ require_approval: o.v })}
                    className={`py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                      a.require_approval === o.v ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ink-800">Generate media</div>
                <div className="text-[11px] text-ink-500">An image per idea — uses image credits each run</div>
              </div>
              <Toggle on={a.auto_media} onChange={(v) => onUpdate({ auto_media: v })} />
            </div>

            {a.auto_media && (
              <>
                <Field label="Post at">
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={a.post_at || ''}
                      className={input}
                      onChange={(e) => onUpdate({ post_at: e.target.value || null })}
                    />
                    {a.post_at && (
                      <button type="button" onClick={() => onUpdate({ post_at: null })} className="flex-none text-[11.5px] text-ink-500 hover:text-ink-800">
                        Clear
                      </button>
                    )}
                  </div>
                  {!a.post_at && (
                    <p className="mt-1 text-[11px] text-ink-400">
                      {a.learn_from_results && Object.keys(a.learnings?.post_hours || {}).length
                        ? `Blank = your best time from results (${Object.entries(a.learnings.post_hours)
                            .map(([k, v]) => `${PLAT[k]?.name || k} ${v}`)
                            .join(', ')}), else each platform's usual time`
                        : "Blank = each platform's usual time"}
                    </p>
                  )}
                </Field>

                <Field label="Channels">
                  {live.length === 0 ? (
                    <p className="text-[12px] text-ink-400">No connected channels for this brand yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {live.map((c) => (
                        <label key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink-50 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-brand"
                            checked={allowed(c.id)}
                            onChange={(e) => toggleChannel(c.id, e.target.checked)}
                          />
                          <PlatformIcon name={PLAT[c.p]?.name} className="text-ink-500" />
                          <span className="text-[12.5px] text-ink-800">{PLAT[c.p]?.name || c.p}</span>
                          <span className="text-[11.5px] text-ink-400 truncate">{c.h}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </Field>
              </>
            )}
          </Section>
        </div>

        <footer className="px-6 py-4 border-t border-ink-100 flex items-center justify-between gap-3">
          {run ? (
            <RunProgress run={run} className="mt-0 flex-1" />
          ) : (
          <button type="button" disabled={running || !a.enabled} onClick={onRun} className="btn-outline">
            {running ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            ) : ranToday ? (
              <FiRefreshCw size={14} />
            ) : (
              <FiPlay size={14} />
            )}
            {ranToday ? 'Regenerate today' : 'Generate now'}
          </button>
          )}
          <button type="button" onClick={onClose} className="btn-primary">
            Done
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

/** What app/learning.py found for this brand — each rule with its evidence,
 *  or why there's nothing yet. */
function Learned({ learnings }) {
  const rules = learnings?.rules || []
  if (!rules.length) {
    return (
      <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-600">
        Nothing to learn from yet{learnings?.posts ? ` — ${learnings.posts} post${learnings.posts === 1 ? '' : 's'} with numbers so far` : ''}.
        Once a few posts have likes and comments, the AI starts using what works (best time, format, questions, caption length).
      </p>
    )
  }
  return (
    <ul className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
      {rules.map((r) => (
        <li key={r.id} className="flex items-start gap-2 text-[12px]">
          <FiTrendingUp size={13} className="mt-0.5 flex-none text-emerald-700" aria-hidden="true" />
          <span>
            <span className="font-medium text-ink-900">{r.text}</span>
            <span className="block text-[11px] text-ink-500">{r.evidence}</span>
          </span>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-ink-500">From your last {learnings.posts} posts with numbers · updates as new results come in</li>
    </ul>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <span className="block text-[12px] font-semibold text-ink-800 mb-1.5">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative w-[34px] h-[19px] rounded-full transition-colors duration-150 flex-none ${on ? 'bg-brand' : 'bg-ink-300'}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-white shadow transition-transform duration-150 ${on ? 'translate-x-[15px]' : ''}`}
      />
    </button>
  )
}
