import { useEffect, useState } from 'react'

// Shown while a video story's clips are joined (app/story.py → ffmpeg): a
// little video editor. The real scene clips, their voiceover (as waveforms)
// and on-screen captions fly into a three-track timeline, a playhead sweeps
// across, and the monitor plays through the scenes. Keyframes: index.css
// ("cf-fly", "cf-playhead", "cf-wave", "cf-screen-in").

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (url) => `${mediaBase}${url || ''}`

function timecode(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

// Steady waveform bar heights per scene (no flicker between re-renders).
function bars(seed, count = 14) {
  return Array.from({ length: count }, (_, i) => 0.3 + (((seed + 1) * 37 + i * 53) % 70) / 100)
}

function Track({ label, children }) {
  return (
    <div className="flex h-full items-center gap-2">
      <span className="w-6 flex-none text-[9px] font-bold text-white/35">{label}</span>
      <div className="relative flex h-full min-w-0 flex-1 gap-1">{children}</div>
    </div>
  )
}

export default function JoiningCanvas({ story }) {
  const scenes = story.scenes || []
  const total = scenes.reduce((sum, s) => sum + (s.seconds || 0), 0) || 1
  const vertical = story.aspect_ratio === '9:16'
  const [current, setCurrent] = useState(0)

  // The monitor steps through the scenes, like scrubbing the edit.
  useEffect(() => {
    if (scenes.length < 2) return
    const id = setInterval(() => setCurrent((n) => (n + 1) % scenes.length), 1800)
    return () => clearInterval(id)
  }, [scenes.length])

  const scene = scenes[current] || {}
  const fly = (i, fx, fy, fr) => ({
    '--fx': fx,
    '--fy': fy,
    '--fr': fr,
    animationDelay: `${i * 0.12}s`,
  })

  return (
    <div className="overflow-hidden rounded-2xl bg-[#0F1522] text-white shadow-[0_12px_40px_rgba(15,21,34,0.35)] ring-1 ring-white/5">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
          <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
          <span className="h-2 w-2 rounded-full bg-[#28C840]" />
        </span>
        <img src="/brand/logo-mark.png" alt="" className="ml-1.5 h-4 w-4 object-contain" />
        <span className="truncate text-[10.5px] font-semibold text-white/70">ContentFlow Editor — {story.title}</span>
        <span className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-full bg-brand/20 px-2 py-0.5 text-[9.5px] font-bold text-brand-light">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-light animate-pulse" /> Exporting MP4
        </span>
      </div>

      {/* monitor */}
      <div className="flex justify-center bg-black/40 px-4 py-3">
        <div
          className={`relative overflow-hidden rounded-lg bg-black ring-1 ring-white/10 ${
            vertical ? 'aspect-[9/16] h-[200px]' : 'aspect-video w-full max-w-[360px]'
          }`}
        >
          {scene.video_url && (
            <video
              key={scene.key}
              src={abs(scene.video_url)}
              muted
              autoPlay
              loop
              playsInline
              className="cf-screen-in absolute inset-0 h-full w-full object-cover"
            />
          )}
          {scene.on_screen && (
            <span
              key={`t-${scene.key}`}
              className="cf-screen-in absolute inset-x-2 bottom-[18%] text-center text-[12px] font-extrabold leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,.7)]"
            >
              {scene.on_screen}
            </span>
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/85">
            {current + 1}/{scenes.length} · {timecode(scene.starts_at)}
          </span>
        </div>
      </div>

      {/* timeline */}
      <div className="space-y-1.5 px-3.5 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 flex-none" />
          <div className="flex min-w-0 flex-1 justify-between text-[8.5px] tabular-nums text-white/30">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}>{timecode(Math.round(total * f))}</span>
            ))}
          </div>
        </div>

        <div className="relative space-y-1.5">
          {/* V1 — the clips */}
          <div className="h-9">
            <Track label="V1">
              {scenes.map((s, i) => (
                <div
                  key={s.key}
                  className={`cf-fly relative h-full overflow-hidden rounded-md bg-brand/40 ring-1 ${i === current ? 'ring-brand-light' : 'ring-white/10'}`}
                  style={{ flex: s.seconds, ...fly(i, `${(i % 2 ? 1 : -1) * 30}px`, '-70px', `${i % 2 ? 7 : -7}deg`) }}
                >
                  {s.video_url && (
                    <video
                      src={`${abs(s.video_url)}#t=0.8`}
                      muted
                      preload="metadata"
                      playsInline
                      disablePictureInPicture
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
                    />
                  )}
                  <span className="absolute bottom-0.5 left-1 text-[8px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">{i + 1}</span>
                </div>
              ))}
            </Track>
          </div>

          {/* A1 — the voiceover */}
          <div className="h-6">
            <Track label="A1">
              {scenes.map((s, i) => (
                <div
                  key={s.key}
                  className="cf-fly flex h-full items-center justify-around overflow-hidden rounded-md bg-emerald-500/20 px-1 ring-1 ring-emerald-400/20"
                  style={{ flex: s.seconds, ...fly(i + 2, '-40px', '60px', '-5deg') }}
                >
                  {bars(i).map((h, b) => (
                    <span
                      key={b}
                      className="cf-wave w-[2px] rounded-full bg-emerald-300/80"
                      style={{ height: `${Math.round(h * (s.voiceover ? 100 : 40))}%`, animationDelay: `${(b % 5) * 0.12}s` }}
                    />
                  ))}
                </div>
              ))}
            </Track>
          </div>

          {/* T1 — on-screen captions */}
          <div className="h-5">
            <Track label="T1">
              {scenes.map((s, i) => (
                <div
                  key={s.key}
                  className="cf-fly flex h-full min-w-0 items-center overflow-hidden rounded-md bg-amber-400/20 px-1.5 ring-1 ring-amber-300/20"
                  style={{ flex: s.seconds, ...fly(i + 4, '60px', '-20px', '6deg') }}
                >
                  <span className="truncate text-[8.5px] font-semibold text-amber-100/90">{s.on_screen || '—'}</span>
                </div>
              ))}
            </Track>
          </div>

          {/* playhead over the tracks */}
          <div className="pointer-events-none absolute inset-y-[-4px] left-8 right-0">
            <div className="cf-playhead absolute inset-y-0 w-px bg-red-400 shadow-[0_0_8px_rgba(248,113,113,.9)]">
              <span className="absolute -left-[4px] -top-1 h-2 w-[9px] rounded-sm bg-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* export status */}
      <div className="border-t border-white/5 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3 text-[10.5px]">
          <span className="font-semibold text-white/85">
            Joining {scenes.length} clips{scenes.some((s) => s.voiceover) ? ' · voice' : ''}
            {scenes.some((s) => s.on_screen) ? ' · captions' : ''}
          </span>
          <span className="tabular-nums text-white/45">
            {total}s · {story.aspect_ratio} · MP4
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-brand animate-indeterminate" />
        </div>
      </div>
    </div>
  )
}
