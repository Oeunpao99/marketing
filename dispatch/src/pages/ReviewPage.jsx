import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiCheck, FiChevronDown, FiImage, FiRefreshCw } from 'react-icons/fi'
import { api } from '../api/client'
import { PILLAR_LABELS, angleText, pillarChipClass } from '../lib/angles'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'

// Approvals — the extra daily ideas Autopilot writes each morning (Setup →
// Autopilot → Daily posts = "Ask me"). Separate from the Weekly plan. Approve
// one (with a picture it's scheduled at once; without, it goes to the Calendar)
// or Rewrite it (the next batch tries another angle).

const card = 'min-w-0 flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card [overflow-wrap:anywhere]'
const khmer = (t) => (/[ក-៿]/.test(t || '') ? 'font-khmer' : '')
const mediaSrc = (url) => (url ? (url.startsWith('http') ? url : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${url}`) : null)

// The AI's own fit score: green when it's specific to the brand, amber when it's
// generic, red when it's weak.
const fitClass = (n) =>
  n >= 70 ? 'bg-emerald-500/10 text-emerald-700' : n >= 40 ? 'bg-amber-500/10 text-amber-700' : 'bg-red-500/10 text-red-700'

export default function ReviewPage() {
  const { review: allReview, setReview, refreshReview, showToast, activeBrand, brands } = useStore()
  // Follows the brand picked in the sidebar ("All brands" shows every one).
  const brandName = brands.find((b) => b.slug === activeBrand)?.name
  const review = allReview && brandName ? allReview.filter((r) => r.b === activeBrand) : allReview
  const otherBrands = allReview && brandName ? allReview.length - review.length : 0
  const [busyId, setBusyId] = useState(null)
  const [bulk, setBulk] = useState(false)

  const flagged = (r) => Array.isArray(r.factIssues) && r.factIssues.length > 0
  const clean = (review || []).filter((r) => !flagged(r))

  const act = async (draft, action, quiet = false) => {
    setBusyId(draft.id)
    try {
      await api.post(`/views/drafts/${draft.id}/${action}`)
      setReview((r) => (r || []).filter((x) => x.id !== draft.id))
      if (!quiet)
        showToast(
          action === 'approve'
            ? draft.videoUrl
              ? 'Approved — scheduled to your connected channels'
              : 'Approved — it’s in the Calendar; add a picture there to schedule it'
            : 'Sent back — the next batch will try another angle',
        )
      return true
    } catch (e) {
      if (!quiet) showToast(`Could not ${action === 'approve' ? 'approve' : 'send back'} — ${e.message}`)
      refreshReview()
      return false
    } finally {
      setBusyId(null)
    }
  }

  const approveAll = async () => {
    if (bulk || !clean.length) return
    setBulk(true)
    let ok = 0
    for (const r of clean) if (await act(r, 'approve', true)) ok += 1
    setBulk(false)
    showToast(`${ok} idea${ok === 1 ? '' : 's'} approved${ok < clean.length ? ` · ${clean.length - ok} couldn’t be` : ''}`)
  }

  return (
    <div className="w-full px-5 py-8 animate-fadein lg:px-10 lg:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub mt-1">Daily ideas from Autopilot</p>
        </div>
        {clean.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/auto" className="btn-ghost px-3 text-ink-600">
              Autopilot settings
            </Link>
            <button type="button" onClick={approveAll} disabled={bulk || !!busyId} className="btn-primary">
              {bulk ? 'Approving…' : `Approve all unflagged (${clean.length})`}
            </button>
          </div>
        )}
      </div>

      {review === null ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className={`${card} p-4`}>
              <div className="h-4 w-2/3 rounded-md skeleton" />
              <div className="mt-2 h-3 w-1/3 rounded-md skeleton" />
              <div className="mt-4 space-y-1.5">
                <div className="h-3 w-full rounded-md skeleton" />
                <div className="h-3 w-4/5 rounded-md skeleton" />
                <div className="h-3 w-3/5 rounded-md skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : review.length === 0 ? (
        <div className="card px-7 py-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-2xl text-brand">✓</div>
          <div className="text-[14px] font-semibold text-ink-800">Nothing waiting{brandName ? ` for ${brandName}` : ''}</div>
          <div className="mx-auto mt-1.5 max-w-[48ch] text-[12px] text-ink-400">
            {otherBrands > 0
              ? `${otherBrands} idea${otherBrands === 1 ? ' is' : 's are'} waiting for other brands — pick “All brands” in the sidebar to see them.`
              : 'Daily ideas appear here when Daily posts is set to “Ask me” in Autopilot. The Weekly plan has its own list.'}
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/weekly" className="btn-outline">
              Open the Weekly plan
            </Link>
            <Link to="/auto" className="btn-primary">
              Autopilot settings
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-500">
            <span>
              <b className="text-ink-800">{review.length}</b> waiting · {clean.length} ready to approve ·{' '}
              {review.length - clean.length} to check first
            </span>
            {otherBrands > 0 && (
              <span>
                Showing <b className="text-ink-800">{brandName}</b> only · {otherBrands} more from other brands (pick “All brands” in the
                sidebar)
              </span>
            )}
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {review.map((r) => (
              <IdeaCard
                key={r.id}
                r={r}
                busy={busyId === r.id || bulk}
                isFlagged={flagged(r)}
                onApprove={() => act(r, 'approve')}
                onRewrite={() => act(r, 'reject')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IdeaCard({ r, busy, isFlagged, onApprove, onRewrite }) {
  const [more, setMore] = useState(false)
  const [why, setWhy] = useState(false)
  const [checks, setChecks] = useState(false)
  const color = colorForBrand(r.b)
  const media = mediaSrc(r.videoUrl)
  const isVideo = /\.(mp4|mov|webm)$/i.test(r.videoUrl || '')
  const long = (r.body || '').length > 260 || (r.body || '').split('\n').length > 6

  return (
    <article className={`${card} ${isFlagged ? 'border-amber-300' : ''}`}>
      {/* picture */}
      {media ? (
        <div className="aspect-[16/9] bg-ink-50">
          {isVideo ? (
            <video src={media} className="h-full w-full object-cover" muted playsInline controls preload="metadata" />
          ) : (
            <img src={media} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-2 text-[11.5px] text-ink-500">
          <FiImage size={13} /> No picture yet — after approving, add one in the Calendar
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        {/* who / when / fit */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-500">
          <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
          <span className="font-semibold text-ink-700">{r.brandName}</span>
          <span>· {r.made}</span>
          {typeof r.fitScore === 'number' && (
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold ${fitClass(r.fitScore)}`}
              title="The AI’s own check: how specific and grounded this idea is for your brand"
            >
              {r.fitScore}% fit
            </span>
          )}
        </div>

        {/* title + labels */}
        <h3 className={`mt-2 text-[14.5px] font-semibold leading-snug text-ink-900 ${khmer(r.ttl)}`}>{r.ttl}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PILLAR_LABELS[r.pillar] && (
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${pillarChipClass(r.pillar)}`}>{PILLAR_LABELS[r.pillar]}</span>
          )}
          {angleText(r.angle, r.goal) && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600">{angleText(r.angle, r.goal)}</span>
          )}
        </div>

        {/* caption, folded */}
        {r.body && (
          <div className="mt-3">
            <p
              className={`whitespace-pre-line text-[12.5px] leading-relaxed text-ink-800 ${khmer(r.body)}`}
              style={!more && long ? { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
            >
              {r.body}
            </p>
            {long && (
              <button type="button" onClick={() => setMore((v) => !v)} className="mt-1 text-[11.5px] font-semibold text-brand hover:underline">
                {more ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* why the AI wrote it */}
        {r.insight && (
          <div className="mt-3 border-t border-ink-100 pt-2">
            <button type="button" onClick={() => setWhy((v) => !v)} className="flex w-full items-center gap-1.5 text-[11.5px] font-semibold text-ink-500 hover:text-ink-800">
              <FiChevronDown size={13} className={`transition-transform ${why ? 'rotate-180' : ''}`} /> Why this idea
            </button>
            {why && <p className="mt-1.5 text-[11.5px] italic leading-relaxed text-ink-500">{r.insight}</p>}
          </div>
        )}

        {/* the fact check */}
        {Array.isArray(r.factIssues) &&
          (isFlagged ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
              <button type="button" onClick={() => setChecks((v) => !v)} className="flex w-full items-center gap-1.5 text-left text-[11.5px] font-semibold text-amber-800">
                <FiAlertTriangle size={13} className="flex-none" />
                {r.factIssues.length} thing{r.factIssues.length === 1 ? '' : 's'} to check — not in your product info
                <FiChevronDown size={13} className={`ml-auto flex-none transition-transform ${checks ? 'rotate-180' : ''}`} />
              </button>
              {checks && (
                <ul className="mt-1.5 space-y-0.5">
                  {r.factIssues.map((issue, i) => (
                    <li key={i} className={`text-[11.5px] leading-snug text-amber-900 ${khmer(issue)}`}>
                      • {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
              <FiCheck size={12} /> Fact-checked against your products
            </div>
          ))}

        {/* actions */}
        <div className="mt-auto flex items-center justify-end gap-2 pt-4">
          <button type="button" disabled={busy} onClick={onRewrite} className="btn-ghost px-3 py-1.5 text-ink-600">
            <FiRefreshCw size={13} /> Rewrite
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className={`${isFlagged ? 'btn-outline' : 'btn-primary'} px-3.5 py-1.5`}
            title={isFlagged ? 'Check the flagged parts first — approve if they’re right' : undefined}
          >
            {busy ? 'Working…' : media ? 'Approve & schedule' : isFlagged ? 'Approve anyway' : 'Approve'}
          </button>
        </div>
      </div>
    </article>
  )
}
