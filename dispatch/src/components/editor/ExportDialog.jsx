import { createPortal } from 'react-dom'
import { FiCheck, FiDownload, FiFilm, FiFolder, FiSend, FiUpload, FiX } from 'react-icons/fi'
import { EDIT_SIZES } from '../../../motion/src/timeline'
import { fmtTime } from '../../lib/editorModel'

// The video editor's export window, laid out like CapCut's: the video's cover on the left,
// what will be made on the right (name, length, size, resolution, codec, format, frame
// rate), then a big progress bar while it renders, then the finished video to play.
//   step "setup"   → Export / Cancel
//   step "running" → the progress; Keep editing (closes, the export goes on) / Stop
//   step "done"    → Use in post / Download / Open Library / Done

// what our renders weigh, about: H.264 at 1080p, 30 fps (Remotion's default quality)
const MB_PER_SECOND = 0.55
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`

const STAGES = [
  [0, 'Getting your clips ready…'],
  [0.02, 'Drawing every frame…'],
  [0.97, 'Putting the video together…'],
]

export default function ExportDialog({ studio = false, step, name, onName, seconds, ratio, cover, pct, done, onExport, onCancel, onKeepEditing, onStop, onPost, onDownload, onLibrary, onClose }) {
  if (!step) return null
  const [w, h] = EDIT_SIZES[ratio] || EDIT_SIZES['9:16']
  const p = Math.max(0, Math.min(100, pct || 0))
  const stage = [...STAGES].reverse().find(([at]) => p / 100 >= at)?.[1]
  const rows = [
    ['Video name', step === 'setup' ? null : name],
    ['Duration', fmtTime(seconds)],
    ['Size', done?.size ? mb(done.size) : `${mb(Math.max(0.3, seconds) * MB_PER_SECOND * 1024 * 1024)} (estimated)`],
    ['Resolution', `${Math.min(w, h)}p · ${w} × ${h}`],
    ['Codec', 'H.264'],
    ['Format', 'mp4'],
    ['Frame rate', '30fps'],
  ]

  return createPortal(
    <div
      className={`fixed inset-0 z-[160] grid place-items-center bg-night-950/60 p-4 animate-fadein ${studio ? 'studio' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Export"
      onClick={step === 'setup' ? onCancel : undefined}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[calc(92vh/var(--z,1))] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-ink-900">{step === 'done' ? 'Exported' : step === 'running' ? 'Exporting' : 'Export'} · {name || 'Untitled video'}</h2>
          {step !== 'running' && (
            <button type="button" onClick={step === 'done' ? onClose : onCancel} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
              <FiX size={16} />
            </button>
          )}
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* the cover — the finished video once it's made */}
          <div className="relative grid min-h-[220px] place-items-center overflow-hidden rounded-xl bg-night-950">
            {step === 'done' && done?.url ? (
              <video src={done.url} controls autoPlay muted playsInline className="max-h-[calc(52vh/var(--z,1))] w-full object-contain" />
            ) : cover ? (
              <img src={cover} alt="" className="max-h-[calc(52vh/var(--z,1))] w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-[12px] text-white/60">
                <FiFilm size={28} /> {name || 'Your video'}
              </span>
            )}
            {step === 'running' && (
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">{p}%</span>
            )}
          </div>

          {/* what will be made */}
          <div className="rounded-xl bg-canvas p-4">
            <div className="text-[16px] font-semibold text-ink-900">{step === 'done' ? 'Your video is ready' : step === 'running' ? 'Exporting' : 'Export settings'}</div>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {step === 'setup' && (
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <dt className="text-ink-500">Video name</dt>
                  <dd>
                    <input
                      value={name}
                      onChange={(e) => onName(e.target.value.slice(0, 120))}
                      className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] text-ink-900 outline-none focus:border-brand"
                      aria-label="Video name"
                    />
                  </dd>
                </div>
              )}
              {rows
                .filter(([, v]) => v != null)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-3">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="truncate font-medium text-ink-900">{v}</dd>
                  </div>
                ))}
            </dl>
            {step === 'done' && (
              <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-emerald-700">
                <FiCheck size={14} /> Saved to your Library
              </p>
            )}
          </div>
        </div>

        {/* the progress, and what to do */}
        <div className="border-t border-ink-200 px-5 py-4">
          {step === 'running' && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="text-ink-600">{stage}</span>
                <span className="font-semibold tabular-nums text-ink-900">{p}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, p)}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === 'setup' && (
              <>
                <button type="button" onClick={onCancel} className="btn-outline">
                  Cancel
                </button>
                <button type="button" onClick={onExport} className="btn-primary">
                  <FiUpload size={13} /> Export
                </button>
              </>
            )}
            {step === 'running' && (
              <>
                <span className="mr-auto text-[11.5px] text-ink-500">You can keep editing — the export carries on.</span>
                <button type="button" onClick={onStop} className="btn-outline">
                  Stop
                </button>
                <button type="button" onClick={onKeepEditing} className="btn-primary">
                  Keep editing
                </button>
              </>
            )}
            {step === 'done' && (
              <>
                <button type="button" onClick={onLibrary} className="btn-outline">
                  <FiFolder size={13} /> Open Library
                </button>
                <button type="button" onClick={onDownload} className="btn-outline">
                  <FiDownload size={13} /> Download
                </button>
                <button type="button" onClick={onPost} className="btn-outline">
                  <FiSend size={13} /> Use in post
                </button>
                <button type="button" onClick={onClose} className="btn-primary">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
