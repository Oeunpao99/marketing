import { useEffect, useState } from 'react'
import { FiCheck, FiEdit3 } from 'react-icons/fi'
import AutoTextarea from '../components/ui/AutoTextarea'

// The boss's page (/approve/<token> — backend app/planning/approvals.py): the video or
// picture the team shared, its caption, and Approve / Ask for changes. No sign-in —
// the unguessable link is the key; it opens only this one video. Made for a phone.
const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${mediaBase}${url}`)
const khmer = (s) => (/[ក-៿]/.test(s || '') ? 'font-khmer' : '')

async function call(token, body) {
  const res = await fetch(`/api/public/approve/${encodeURIComponent(token)}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'This link isn’t working — ask the team for a new one.')
  return data
}

export default function ApprovePage({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // a private review page: kept out of search engines
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    document.title = 'Approve this video'
    call(token).then(setData).catch((e) => setError(e.message))
    return () => meta.remove()
  }, [token])

  const decide = async (decision) => {
    setBusy(true)
    try {
      const r = await call(token, { decision, comment: decision === 'changes' ? note : '' })
      setData((d) => ({ ...d, ...r }))
      setAsking(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data)
    return (
      <Frame>
        <p className="py-16 text-center text-[14px] text-ink-600">{error}</p>
      </Frame>
    )
  if (!data)
    return (
      <Frame>
        <p className="py-16 text-center text-[14px] text-ink-400">Loading…</p>
      </Frame>
    )

  return (
    <Frame>
      <div className="flex items-center gap-3">
        {data.logo && (
          <span className="flex h-12 flex-none items-center rounded-xl bg-white px-2.5 ring-1 ring-ink-200">
            <img src={abs(data.logo)} alt="" className="h-9 w-auto max-w-[160px] object-contain" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold text-ink-900">{data.brand || 'Your team'}</div>
          <div className="text-[13px] text-ink-500">asks you to check this {data.kind === 'image' ? 'picture' : 'video'}{data.version > 1 ? ` · version ${data.version}` : ''}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-start">
      <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-night-950">
        {data.kind === 'image' ? (
          <img src={abs(data.media)} alt="" className="max-h-[80vh] w-auto max-w-full object-contain" />
        ) : (
          <video src={abs(data.media)} controls playsInline preload="metadata" className="max-h-[80vh] w-full bg-night-950" />
        )}
      </div>

      <div className="lg:sticky lg:top-6">
      {data.caption && (
        <div className="rounded-2xl border border-ink-100 bg-white p-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Caption</div>
          <p className={`whitespace-pre-wrap text-[14px] leading-relaxed text-ink-800 ${khmer(data.caption)}`}>{data.caption}</p>
        </div>
      )}

      <div className="mt-4">
        {data.status === 'approved' && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <div className="text-[15px] font-semibold">You approved this ✓</div>
            <div className="mt-0.5 text-[12.5px]">The team has been told. You can still ask for changes below.</div>
          </div>
        )}
        {data.status === 'changes' && (
          <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
            <div className="text-[15px] font-semibold">You asked for changes</div>
            <div className={`mt-1 text-[13px] ${khmer(data.comment)}`}>“{data.comment}”</div>
            <div className="mt-1 text-[12px]">The team will send the fixed version on this same link.</div>
          </div>
        )}

        {asking ? (
          <div className="mt-3 rounded-2xl border border-ink-200 bg-white p-4">
            <div className="mb-2 text-[13px] font-semibold text-ink-900">What should change?</div>
            <AutoTextarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minRows={3}
              autoFocus
              placeholder="e.g. Change the price to $5, and use the blue logo"
              className={`w-full rounded-xl border border-ink-200 px-3 py-2 text-[14px] text-ink-900 outline-none focus:border-brand ${khmer(note)}`}
            />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy || !note.trim()} onClick={() => decide('changes')} className="btn-primary flex-1 justify-center">
                {busy ? 'Sending…' : 'Send to the team'}
              </button>
              <button type="button" onClick={() => setAsking(false)} className="btn-outline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data.status !== 'approved' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('approve')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-semibold text-white hover:bg-emerald-700"
              >
                <FiCheck size={18} /> Approve
              </button>
            )}
            <button
              type="button"
              onClick={() => setAsking(true)}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white text-[15px] font-semibold text-ink-800 hover:border-ink-300 ${data.status === 'approved' ? 'col-span-2' : ''}`}
            >
              <FiEdit3 size={16} /> Ask for changes
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
      </div>
      </div>
      </div>
    </Frame>
  )
}

function Frame({ children }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 lg:px-10 lg:py-8">
      <div className="w-full">{children}</div>
      <p className="mt-8 text-center text-[11px] text-ink-400">Shared with Smart Marketing</p>
    </div>
  )
}
