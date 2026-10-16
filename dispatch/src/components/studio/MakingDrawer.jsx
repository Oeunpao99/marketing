import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiMic, FiMusic, FiPause, FiPlay, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import { previewSrc, templateById } from '../../lib/motionTemplates'
import MarkdownText from '../ui/MarkdownText'

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${mediaBase}${url}`)
const khmer = (s) => (/[ក-៿]/.test(s || '') ? 'font-khmer' : '')
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const typeLabel = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/[_-]/g, ' ') : 'Scene')

// A Remotion video's "How it was made" (GET /ai/motion/making/{job}), in a
// drawer from the right like every detail view: the video, the template and
// voice it was made with, the brief, and each scene — what's on screen, the
// line the narrator says (▶ plays just that clip) and a jump to the scene.
// Videos made before this was kept show the brief and the storyboard text.
export default function MakingDrawer({ jobId, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [at, setAt] = useState(0) // the video's current time → which scene is on
  const [playing, setPlaying] = useState(-1) // the scene whose voice clip plays
  const video = useRef(null)
  const voice = useRef(null)

  useEffect(() => {
    api.get(`/ai/motion/making/${jobId}`).then(setData).catch((e) => setError(e.message))
  }, [jobId])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const m = data?.making
  const scenes = m?.scenes || []
  const current = scenes.reduce((on, s, i) => (at + 0.05 >= s.start ? i : on), -1)
  const template = m && templateById(m.style)

  const jump = (s) => {
    const v = video.current
    if (!v) return
    voice.current?.pause()
    setPlaying(-1)
    v.currentTime = s.start
    v.play().catch(() => {})
  }

  const hear = (s, i) => {
    const a = voice.current
    if (!a) return
    if (playing === i) {
      a.pause()
      setPlaying(-1)
      return
    }
    video.current?.pause()
    a.src = abs(s.audio)
    a.play().then(() => setPlaying(i)).catch(() => setPlaying(-1))
  }

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="How it was made"
        className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in"
      >
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <h2 className="flex-1 text-[15px] font-semibold text-ink-900">How it was made</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
          {error ? (
            <p className="text-[12.5px] text-red-600">{error}</p>
          ) : !data ? (
            <div className="space-y-3">
              <div className="mx-auto h-56 w-32 rounded-xl skeleton" />
              <div className="h-3 w-2/3 rounded skeleton" />
              <div className="h-3 w-5/6 rounded skeleton" />
            </div>
          ) : (
            <>
              {data.video && (
                <video
                  ref={video}
                  src={abs(data.video.url)}
                  controls
                  playsInline
                  onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
                  className={`mx-auto block rounded-xl bg-night-900 ring-1 ring-ink-900/10 ${m?.ratio === '16:9' ? 'w-full' : 'max-h-[300px]'}`}
                />
              )}

              {m && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                  {template && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-0.5 pl-0.5 pr-2.5 font-semibold text-brand">
                      <img src={previewSrc(template.id)} alt="" className="h-5 w-5 rounded-full object-cover object-top" />
                      {template.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 font-medium text-ink-700">
                    <FiMic size={11} aria-hidden="true" />
                    {m.voice === 'none' ? 'No voice' : `${{ male: 'Male', brand: 'Brand voice', native: 'Native Khmer' }[m.voice] || 'Female'} · ${m.language}`}
                  </span>
                  {m.music && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 font-medium capitalize text-ink-700">
                      <FiMusic size={11} aria-hidden="true" /> {m.music}
                    </span>
                  )}
                  <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-medium tabular-nums text-ink-700">
                    {scenes.length} scenes
                  </span>
                </div>
              )}
              {m?.why && <p className="mt-2 text-[11.5px] leading-snug text-ink-500">Why this template: {m.why}</p>}

              {data.brief && (
                <section className="mt-5">
                  <h3 className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">The brief</h3>
                  <p className={`mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-700 ${khmer(data.brief)}`}>{data.brief}</p>
                </section>
              )}

              <section className="mt-5">
                <h3 className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">
                  {m ? 'Scenes · script and voice' : 'The storyboard'}
                </h3>
                {m ? (
                  <ol className="mt-2 space-y-2">
                    {scenes.map((s, i) => (
                      <li
                        key={i}
                        className={`rounded-xl border px-3 py-2.5 transition-colors ${
                          i === current ? 'border-brand-line bg-brand-soft/50' : 'border-ink-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-ink-100 text-[10px] font-bold tabular-nums text-ink-600">
                            {i + 1}
                          </span>
                          <span className="text-[11px] font-semibold text-ink-500">{typeLabel(s.type)}</span>
                          <button
                            type="button"
                            onClick={() => jump(s)}
                            disabled={!data.video}
                            title="Play the video from this scene"
                            className="ml-auto rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-brand hover:bg-brand-soft"
                          >
                            {clock(s.start)}
                          </button>
                        </div>
                        {s.screen && <p className={`mt-1.5 text-[12.5px] leading-snug text-ink-900 ${khmer(s.screen)}`}>{s.screen}</p>}
                        {s.say && (
                          <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-ink-50 px-2.5 py-2">
                            {s.audio ? (
                              <button
                                type="button"
                                onClick={() => hear(s, i)}
                                title={playing === i ? 'Pause' : 'Hear this line'}
                                aria-label={playing === i ? 'Pause' : 'Hear this line'}
                                className="mt-px grid h-6 w-6 flex-none place-items-center rounded-full bg-brand text-white hover:bg-brand-dark"
                              >
                                {playing === i ? <FiPause size={11} /> : <FiPlay size={11} className="ml-px" />}
                              </button>
                            ) : (
                              <FiMic size={13} className="mt-0.5 flex-none text-ink-400" aria-hidden="true" />
                            )}
                            <p className={`text-[12px] leading-relaxed text-ink-700 ${khmer(s.say)}`}>{s.say}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : data.storyboard ? (
                  <div className="mt-2 rounded-xl bg-ink-50 p-3 text-[12.5px]">
                    <MarkdownText text={data.storyboard} />
                    <p className="mt-2 text-[11px] text-ink-400">Made before scenes and voice clips were kept — new videos show each scene with its voice.</p>
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-ink-500">No storyboard was kept for this video.</p>
                )}
              </section>
            </>
          )}
        </div>
        <audio ref={voice} onEnded={() => setPlaying(-1)} className="hidden" />
      </aside>
    </div>,
    document.body,
  )
}
