import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }

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
          ? "Approved — added to today's queue"
          : "Sent back — write another from Auto-generate",
      )
    } catch (e) {
      showToast(`Could not update — ${e.message}`)
      refreshReview()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-5 lg:p-8 w-full animate-fadein">
      <div className="mb-6">
        <h1 className="font-display text-[38px] leading-tight tracking-tight text-ink-900">
          Waiting for <em className="italic text-brand">you</em>
        </h1>
        <p className="mt-1.5 text-ink-500 max-w-[56ch] text-[15px]">
          Ideas the AI wrote overnight. Approve to keep an idea, then use it to make a post — or send it back and the next batch will try another angle.
        </p>
      </div>

      {review === null ? (
        <div className="bg-white border border-ink-100 rounded-2xl p-8 text-center text-ink-400 shadow-card">
          Loading…
        </div>
      ) : review.length === 0 ? (
        <div className="bg-white border border-ink-100 rounded-2xl p-8 text-center text-ink-400 shadow-card">
          Nothing waiting. Turn on a brand in{' '}
          <Link to="/auto" className="text-brand font-semibold hover:underline">
            Auto-generate
          </Link>{' '}
          to get a daily batch of ideas.
        </div>
      ) : (
        <div className="space-y-3">
          {review.map((r) => {
            const color = BRAND_COLORS[r.b] || '#166432'
            const busy = busyId === r.id
            return (
              <div
                key={r.id}
                className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150"
              >
                <header className="px-4 py-3.5 border-b border-ink-100 flex items-center gap-3 flex-wrap">
                  <span className="w-[3px] h-[22px] rounded-full flex-none" style={{ background: color }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-800 leading-tight">{r.ttl}</div>
                    <div className="text-[12.5px] text-ink-400">
                      <span className="font-semibold" style={{ color }}>{r.brandName}</span> · {r.made}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-2 flex-none">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(r, 'reject')}
                      className="px-3.5 py-1.5 rounded-xl bg-ink-50 border border-ink-200 text-ink-600 text-[13px] font-medium hover:bg-ink-100 hover:border-ink-300 disabled:opacity-50 transition-all duration-150"
                    >
                      Rewrite
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(r, 'approve')}
                      className="px-3.5 py-1.5 rounded-xl gradient-brand text-white text-[13px] font-semibold hover:shadow-glow disabled:opacity-50 transition-all duration-150"
                    >
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                  </div>
                </header>
                <div className="px-4 py-3 space-y-2">
                  {r.insight && (
                    <p className="text-[12.5px] text-ink-500 italic leading-relaxed">{r.insight}</p>
                  )}
                  {r.body && (
                    <p className="text-[13px] text-ink-700 whitespace-pre-line leading-relaxed">{r.body}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
