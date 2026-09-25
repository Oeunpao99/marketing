// "Improve with AI" for one published post (backend app/improve.py): why it
// likely underperformed — from its own numbers and what has worked for the
// brand — and a better version to edit and repost on the same channel at the
// brand's best time.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheckCircle, FiCopy, FiRefreshCw, FiZap } from 'react-icons/fi'
import { api } from '../../api/client'
import { isKhmer } from '../../lib/format'
import AutoTextarea from '../ui/AutoTextarea'

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const slotLabel = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Phnom_Penh',
  })

function Bullets({ title, items }) {
  if (!items?.length) return null
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((d, i) => (
          <li key={i} className={`text-[12.5px] leading-relaxed text-ink-700 ${isKhmer(d) ? 'font-khmer' : ''}`}>
            • {d}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ImproveCard({ post, platformName, weakText, showToast }) {
  const [state, setState] = useState('idle') // idle | loading | ready | scheduling | done
  const [result, setResult] = useState(null)
  const [caption, setCaption] = useState('')
  const [scheduled, setScheduled] = useState(null)

  const run = async () => {
    setState('loading')
    try {
      const out = await api.post(`/ai/improve/${post.target_id}`)
      setResult(out)
      setCaption(out.caption)
      setState('ready')
    } catch (e) {
      showToast(e.message)
      setState(result ? 'ready' : 'idle')
    }
  }

  const schedule = async () => {
    setState('scheduling')
    try {
      setScheduled(await api.post(`/ai/improve/${post.target_id}/schedule`, { title: result.title, caption }))
      setState('done')
    } catch (e) {
      showToast(e.message)
      setState('ready')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      showToast('Caption copied')
    } catch {
      showToast('Could not copy — select the text instead')
    }
  }

  const weak = !!weakText

  if (!result) {
    return (
      <section
        className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${
          weak ? 'border-amber-200 bg-gradient-to-r from-amber-50/80 to-white' : ''
        }`}
      >
        <span
          className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${
            weak ? 'bg-amber-100 text-amber-800' : 'bg-brand-soft text-brand'
          }`}
        >
          <FiZap size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">
            {weak ? 'This post underperformed — improve it with AI' : 'Improve with AI'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-600">
            {weak ? `${weakText}. ` : ''}
            The AI compares it with your other {platformName} posts and what works for you, then writes a better
            version you can repost.
          </p>
        </div>
        <button type="button" disabled={state === 'loading'} onClick={run} className="btn-primary flex-none">
          {state === 'loading' ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />{' '}
              Rewriting…
            </>
          ) : (
            <>
              <FiZap size={14} /> Improve with AI
            </>
          )}
        </button>
      </section>
    )
  }

  return (
    <section className={`${card} overflow-hidden`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
            <FiZap size={15} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">Improved version</h2>
            {result.usual != null && result.engagement != null && (
              <div className="text-[11.5px] text-ink-500">
                This post: {Math.round(result.engagement)} engagement · your usual on {platformName}: {result.usual}{' '}
                ({result.compared_with} posts)
              </div>
            )}
          </div>
        </div>
        {state !== 'done' && (
          <button
            type="button"
            onClick={run}
            disabled={state === 'loading' || state === 'scheduling'}
            className="btn-ghost px-3 py-1.5"
          >
            <FiRefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} />
            {state === 'loading' ? 'Rewriting…' : 'Try another'}
          </button>
        )}
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <Bullets title="Why it likely underperformed" items={result.diagnosis} />
          <Bullets title="What changed" items={result.changes} />
        </div>

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">
            New caption — edit if you like
          </h3>
          <AutoTextarea
            value={caption}
            minRows={5}
            maxRows={16}
            disabled={state === 'done'}
            onChange={(e) => setCaption(e.target.value)}
            className={`w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-ink-800 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 ${
              isKhmer(caption) ? 'font-khmer' : ''
            }`}
          />
          {Array.isArray(result.fact_issues) &&
            (result.fact_issues.length > 0 ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                <div className="text-[11.5px] font-semibold text-amber-800">
                  Check before posting — not found in your product info:
                </div>
                <ul className="mt-1 space-y-0.5">
                  {result.fact_issues.map((issue, i) => (
                    <li key={i} className="text-[11.5px] leading-snug text-amber-900">
                      • {issue}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Fact-checked against your products
              </div>
            ))}

          {state === 'done' ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-800">
              <FiCheckCircle size={15} />
              <span className="flex-1">
                Scheduled on {platformName} for <b>{slotLabel(scheduled.scheduled_for)}</b>
                {result.has_media ? ', with the same media' : ''}.
              </span>
              <Link to="/calendar" className="font-semibold underline">
                Open Calendar
              </Link>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={state !== 'ready' || !caption.trim()}
                onClick={schedule}
                className="btn-primary"
              >
                {state === 'scheduling' ? 'Scheduling…' : `Repost on ${platformName} · ${slotLabel(result.slot)}`}
              </button>
              <button type="button" onClick={copy} className="btn-outline">
                <FiCopy size={13} /> Copy
              </button>
              <span className="text-[11px] text-ink-400">
                {result.has_media ? 'Same image/video' : 'Text only'} · your best time for {platformName}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
