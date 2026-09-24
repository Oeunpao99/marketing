import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'

export default function ReviewPage() {
  const { review, setReview, refreshReview, showToast } = useStore()
  const [busyId, setBusyId] = useState(null)

  const act = async (draft, action) => {
    if (busyId) return
    setBusyId(draft.id)
    try {
      await api.post(`/views/drafts/${draft.id}/${action}`)
      setReview((r) => (r || []).filter((x) => x.id !== draft.id))
      showToast(
        action === 'approve'
          ? draft.videoUrl
            ? 'Approved — scheduled to your connected channels'
            : 'Approved — use it from the Calendar to build a post'
          : 'Sent back — write another from Auto-generate',
      )
    } catch (e) {
      showToast(`Could not schedule — ${e.message}`)
      refreshReview()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6">
        <h1 className="page-title">
          Waiting for{" "}
          <span className="text-gradient-brand">you</span>
        </h1>
        <p className="page-sub mt-1">
          Ideas the AI wrote overnight. Approve to keep an idea, then use it to make a post — or send it back and the next batch will try another angle.
        </p>
      </div>

      {review === null ? (
        <div className="space-y-3">
          {[0, 1].map((n) => (
            <div key={n} className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1 h-5 rounded-full skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-1/3 rounded-md skeleton" />
                  <div className="h-3 w-1/4 rounded-md skeleton" />
                </div>
                <div className="h-7 w-24 rounded-xl skeleton" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded-md skeleton" />
                <div className="h-3 w-4/5 rounded-md skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : review.length === 0 ? (
        <div className="card px-7 py-14 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl grid place-items-center bg-brand-soft text-brand text-2xl">
            ✓
          </div>
          <div className="text-[14px] font-semibold text-ink-800">Nothing waiting</div>
          <div className="mt-1.5 text-[12px] text-ink-400 max-w-[44ch] mx-auto">
            Turn on a brand in Auto-generate to get a fresh batch of ideas every day.
          </div>
          <div className="mt-5">
            <Link to="/auto" className="btn-primary">
              Open Auto-generate
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {review.map((r) => {
            const color = colorForBrand(r.b)
            const busy = busyId === r.id
            const mediaUrl = r.videoUrl
              ? r.videoUrl.startsWith('http')
                ? r.videoUrl
                : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${r.videoUrl}`
              : null
            return (
              <div
                key={r.id}
                className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150"
              >
                <header className="px-4 py-3.5 border-b border-ink-100 flex items-center gap-3 flex-wrap">
                  <span className="w-[3px] h-[22px] rounded-full flex-none" style={{ background: color }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-800 leading-tight">{r.ttl}</div>
                    <div className="text-[11.5px] text-ink-400 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold" style={{ color }}>{r.brandName}</span> · {r.made}
                      {typeof r.fitScore === 'number' && (
                        <span
                          className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold"
                          style={{ color, background: `${color}14` }}
                          title="AI's own self-check: how grounded this idea is in real product facts"
                        >
                          {r.fitScore}% fit
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-2 flex-none">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(r, 'reject')}
                      className="btn-ghost px-3.5 py-1.5"
                    >
                      Rewrite
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(r, 'approve')}
                      className="btn-primary px-3.5 py-1.5"
                    >
                      {busy ? 'Working…' : mediaUrl ? 'Approve & schedule' : 'Approve'}
                    </button>
                  </div>
                </header>
                <div className="px-4 py-3 flex gap-3">
                  {mediaUrl && (
                    <img
                      src={mediaUrl}
                      alt=""
                      className="w-20 h-28 flex-none rounded-lg object-cover border border-ink-100"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    {r.insight && (
                      <p className="text-[11.5px] text-ink-500 italic leading-relaxed">{r.insight}</p>
                    )}
                    {r.body && (
                      <p
                        className={`text-[12.5px] text-ink-800 whitespace-pre-line leading-relaxed ${
                          /[ក-៿]/.test(r.body) ? 'font-khmer' : ''
                        }`}
                      >
                        {r.body}
                      </p>
                    )}
                    {Array.isArray(r.factIssues) &&
                      (r.factIssues.length > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                          <div className="text-[11.5px] font-semibold text-amber-800">
                            Check before posting — not found in your product info:
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {r.factIssues.map((issue, i) => (
                              <li key={i} className="text-[11.5px] text-amber-900 leading-snug">
                                • {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Fact-checked against your products
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
