import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiCopy, FiExternalLink, FiLink, FiX } from 'react-icons/fi'
import { api } from '../../api/client'

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${mediaBase}${url}`)
const isImage = (url) => /\.(png|jpe?g|webp|gif)$/i.test(url || '')
const day = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })

// Share for approval (backend app/planning/approvals.py), in a drawer from the right:
// a link the team sends their boss — they watch it and press Approve or Ask for changes,
// no account, no download. A revised video can go on a link the boss sent back, as
// its next version (the boss keeps the same link).
export default function ShareDrawer({ videoId, caption = '', onClose }) {
  const [link, setLink] = useState(undefined) // undefined = loading, null = none yet
  const [asked, setAsked] = useState([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/approvals?video_id=${videoId}`).then(setLink).catch((e) => (setLink(null), setError(e.message)))
    api.get('/approvals/asked').then((l) => setAsked((l || []).filter((x) => x.video_id !== videoId))).catch(() => {})
  }, [videoId])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const full = link ? `${window.location.origin}${link.path}` : ''
  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      setLink(await fn())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const create = () => run(() => api.post('/approvals', { video_id: videoId, caption }))
  const asVersion = (l) => run(() => api.post(`/approvals/${l.id}/version`, { video_id: videoId, caption }))
  const turnOff = () => run(async () => (await api.del(`/approvals/${link.id}`), { ...link, live: false }))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the link is on screen to copy by hand */
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Share for approval"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in"
      >
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <h2 className="flex-1 text-[15px] font-semibold text-ink-900">Share for approval</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-[13px] text-ink-700">
          <p className="text-ink-500">
            Send a link to your boss or client — they watch it on their phone and press <b className="text-ink-800">Approve</b> or{' '}
            <b className="text-ink-800">Ask for changes</b>. No account, no download.
          </p>

          {link === undefined && <p className="mt-6 text-ink-400">Loading…</p>}

          {link && link.live && (
            <div className="mt-5 space-y-4">
              <Status link={link} />
              <div>
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">The link</div>
                <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
                  <FiLink size={14} className="flex-none text-ink-400" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-800">{full}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={copy} className="btn-primary">
                    {copied ? <FiCheck size={13} /> : <FiCopy size={13} />} {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <a href={full} target="_blank" rel="noreferrer" className="btn-outline">
                    <FiExternalLink size={13} /> See what they see
                  </a>
                </div>
                <p className="mt-2 text-[11.5px] text-ink-400">
                  Works until {day(link.expires_at)} · only this {link.version > 1 ? `video (version ${link.version})` : 'video'} — nothing else in your account
                </p>
              </div>
              <button type="button" onClick={turnOff} disabled={busy} className="text-[12px] font-semibold text-red-600 hover:underline">
                Turn off link
              </button>
            </div>
          )}

          {link && !link.live && (
            <div className="mt-5 rounded-xl bg-ink-50 px-3.5 py-3 text-ink-600">
              This video's link is off. Make a new one to share it again.
            </div>
          )}

          {link !== undefined && !(link && link.live) && (
            <div className="mt-5 space-y-5">
              <button type="button" onClick={create} disabled={busy} className="btn-primary w-full justify-center">
                <FiLink size={13} /> {busy ? 'Making the link…' : 'Make a link'}
              </button>
              {asked.length > 0 && (
                <div>
                  <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">Or send this as the fixed version of</div>
                  <ul className="space-y-2">
                    {asked.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 rounded-xl border border-ink-200 p-2.5">
                        {l.media &&
                          (isImage(l.media) ? (
                            <img src={abs(l.media)} alt="" className="h-12 w-12 flex-none rounded-lg object-cover" />
                          ) : (
                            <video src={abs(l.media)} muted preload="metadata" className="h-12 w-12 flex-none rounded-lg bg-ink-100 object-cover" />
                          ))}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-amber-700">Changes asked{l.version > 1 ? ` · v${l.version}` : ''}</div>
                          <div className="line-clamp-2 text-[12px] text-ink-600">“{l.comment}”</div>
                        </div>
                        <button type="button" onClick={() => asVersion(l)} disabled={busy} className="btn-outline flex-none text-[11.5px]">
                          Send as v{l.version + 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] text-ink-400">Your boss keeps the same link and sees this one as the new version.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-[12.5px] text-red-600">{error}</p>}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function Status({ link }) {
  if (link.status === 'approved')
    return (
      <div className="rounded-xl bg-emerald-50 px-3.5 py-3 text-emerald-800">
        <div className="font-semibold">Approved ✓{link.version > 1 ? ` · version ${link.version}` : ''}</div>
        {link.comment && <div className="mt-1 text-[12.5px]">“{link.comment}”</div>}
      </div>
    )
  if (link.status === 'changes')
    return (
      <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-amber-800">
        <div className="font-semibold">Changes asked{link.version > 1 ? ` · version ${link.version}` : ''}</div>
        <div className="mt-1 text-[12.5px]">“{link.comment}”</div>
        <div className="mt-1.5 text-[11.5px] text-amber-700">Fix it, then share the new video and pick “Send as v{link.version + 1}”.</div>
      </div>
    )
  return <div className="rounded-xl bg-ink-50 px-3.5 py-3 text-ink-600">Waiting for an answer{link.version > 1 ? ` · version ${link.version}` : ''}</div>
}
