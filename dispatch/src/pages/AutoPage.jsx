import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'

const TOPIC_SOURCES = [
  'Trending in Cambodia + your topic bank',
  'Your topic bank only',
  'Product feature list',
  'AI news feeds',
]

function when(dateStr) {
  if (!dateStr) return 'never'
  const today = new Date().toISOString().slice(0, 10)
  return dateStr === today ? 'today' : dateStr
}

export default function AutoPage() {
  const { auto, setAuto, refreshAuto, refreshReview, showToast } = useStore()
  const [runningId, setRunningId] = useState(null)

  const update = async (automation, patch) => {
    setAuto((list) => (list || []).map((a) => (a.id === automation.id ? { ...a, ...patch } : a)))
    try {
      await api.patch(`/automations/${automation.id}`, patch)
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      refreshAuto()
    }
  }

  const runNow = async (automation) => {
    if (runningId) return
    setRunningId(automation.id)
    try {
      const res = await api.post(`/views/auto/${automation.id}/run-now`)
      showToast(
        res.already_ran_today
          ? `Already wrote ${res.count} idea${res.count === 1 ? '' : 's'} for today`
          : `Wrote ${res.count} new idea${res.count === 1 ? '' : 's'} for today`,
      )
      refreshReview()
      refreshAuto()
    } catch (e) {
      showToast(`Could not generate — ${e.message}`)
    } finally {
      setRunningId(null)
    }
  }

  return (
    <div className="p-5 lg:p-8 w-full animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[38px] leading-tight tracking-tight text-ink-900">
            Auto-<em className="italic text-brand">generate</em>
          </h1>
          <p className="mt-1.5 text-ink-500 max-w-[56ch] text-[15px]">
            Tell the AI when to write and how many ideas per day. It reads each brand's products, writes a title, an insight, and a ready-to-edit caption for each idea, and leaves them in Waiting for you.
          </p>
        </div>
        <Link
          to="/products"
          className="px-4 py-2 rounded-xl bg-white border border-ink-200 text-ink-700 text-[13.5px] font-semibold hover:border-brand transition-all duration-200 flex-none"
        >
          Manage products →
        </Link>
      </div>

      {auto === null ? (
        <div className="py-16 text-center text-ink-400 text-[13px]">Loading…</div>
      ) : (
        <div className="space-y-4">
          {auto.map((a) => {
            const color = colorForBrand(a.brand_slug)
            const running = runningId === a.id
            return (
              <div key={a.id} className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150">
                <header className="px-4 py-3.5 flex items-center gap-3 border-b border-ink-100">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}30` }} />
                  <div className="flex-1">
                    <div className="font-semibold text-ink-800" style={{ color }}>{a.brand_name}</div>
                    <div className="text-[12.5px] text-ink-400">{a.brand_lang} · last wrote {when(a.last_run_on)}</div>
                  </div>
                  <Toggle on={a.enabled} onChange={(v) => update(a, { enabled: v })} />
                </header>

                {a.enabled && (
                  <div className="p-4 grid sm:grid-cols-3 gap-4">
                    <Field label="Write at" hint="Early enough to review before the first post.">
                      <input
                        type="time"
                        value={a.run_at}
                        className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        onChange={(e) => update(a, { run_at: e.target.value })}
                      />
                    </Field>
                    <Field label="Ideas per day" hint="Per brand, one batch a day.">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={a.videos_per_day}
                        className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        onChange={(e) => update(a, { videos_per_day: Math.max(1, Math.min(5, +e.target.value || 1)) })}
                      />
                    </Field>
                    <Field label="Topics from" hint="Where the ideas come from.">
                      <select
                        value={a.topic_source}
                        className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        onChange={(e) => update(a, { topic_source: e.target.value })}
                      >
                        {TOPIC_SOURCES.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Before it lands" hint="Whether ideas need your sign-off.">
                      <select
                        value={a.require_approval ? 'yes' : 'no'}
                        className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        onChange={(e) => update(a, { require_approval: e.target.value === 'yes' })}
                      >
                        <option value="yes">Wait for me to approve</option>
                        <option value="no">Write straight to the calendar</option>
                      </select>
                    </Field>

                    <Field label="Media" hint="Generates an image per idea and finishes the post — costs real image-generation credits every run.">
                      <div className="flex items-center h-[38px]">
                        <Toggle on={a.auto_media} onChange={(v) => update(a, { auto_media: v })} />
                      </div>
                    </Field>

                    <div className="sm:col-span-2 flex items-center">
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => runNow(a)}
                        className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[13px] font-bold hover:shadow-glow disabled:opacity-60 transition-all duration-150 flex items-center gap-2"
                      >
                        {running && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                        {running ? 'Writing…' : "Generate today's ideas now"}
                      </button>
                    </div>

                    <div className="sm:col-span-3 bg-brand/5 border border-brand/10 rounded-xl px-3.5 py-2.5 text-[13px] text-ink-600 leading-relaxed">
                      {a.videos_per_day} idea{a.videos_per_day === 1 ? '' : 's'} written at{' '}
                      <b className="font-mono text-ink-800">{a.run_at}</b> from{' '}
                      <b className="text-ink-800">{a.topic_source.toLowerCase()}</b>, self-checked against your{' '}
                      <Link to="/products" className="text-brand font-semibold hover:underline">products</Link>
                      {a.auto_media && <> — weak ideas are dropped automatically, and an image is generated for the rest</>}, then{' '}
                      {a.require_approval ? (
                        a.auto_media ? (
                          <>held in <Link to="/review" className="text-brand font-semibold hover:underline">Waiting for you</Link> as a finished post — approve schedules it to your connected channels, one click.</>
                        ) : (
                          <>held in <Link to="/review" className="text-brand font-semibold hover:underline">Waiting for you</Link> until you approve.</>
                        )
                      ) : a.auto_media ? (
                        <>scheduled straight to your connected channels, no review needed.</>
                      ) : (
                        <>written straight onto the <Link to="/calendar" className="text-brand font-semibold hover:underline">calendar</Link>, no review needed.</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <span className="block font-semibold text-[12.5px] text-ink-800 mb-1">{label}</span>
      {hint && <span className="block text-[12px] text-ink-400 mb-1.5 leading-snug">{hint}</span>}
      {children}
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 select-none text-[12.5px] text-ink-600"
      role="switch"
      aria-checked={on}
    >
      <span className={`relative w-[34px] h-[19px] rounded-full transition-colors duration-150 flex-none ${on ? 'bg-brand' : 'bg-ink-300'}`}>
        <span
          className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-white shadow transition-transform duration-150 ${on ? 'translate-x-[15px]' : ''}`}
        />
      </span>
      {on ? 'On' : 'Off'}
    </button>
  )
}
