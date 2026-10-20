import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiArrowRight, FiCheck, FiClock, FiPlay } from 'react-icons/fi'
import { TUTORIALS, youtubeId } from '../lib/tutorials'

// "How to use Smart Marketing" — the lesson videos (lib/tutorials.js): a player
// for the lesson picked, and the whole course beside it. Lessons without a video
// yet say "coming soon". Which ones you've watched is remembered on this device.
// Two ways in: /tutorials inside the app (TutorialsPage), and the public
// /mkt-tutorial for training sessions — no sign-in (LandingPage page="tutorials").

const WATCHED_KEY = 'smartmkt.tutorials.watched'
const readWatched = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
const km = { fontFamily: '"Kantumruy Pro", "Khmer OS Siemreap", sans-serif' }

function Player({ lesson, onEnded }) {
  const yt = youtubeId(lesson.src)
  if (yt) {
    return (
      <iframe
        key={yt}
        src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`}
        title={lesson.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    )
  }
  if (lesson.src) {
    return (
      <video
        key={lesson.src}
        src={lesson.src}
        poster={lesson.thumb || lesson.poster || undefined}
        controls
        playsInline
        preload="metadata"
        onEnded={onEnded}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />
    )
  }
  const Icon = lesson.icon
  return (
    <div className="absolute inset-0 grid place-items-center bg-night-900 text-center">
      {lesson.thumb && <img src={lesson.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
      <div className="relative px-6">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-white">
          <Icon size={24} />
        </span>
        <div className="mt-4 text-[16px] font-bold text-white">Video coming soon</div>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-white/60">
          We’re recording this lesson. You can already try it yourself on its page.
        </p>
      </div>
    </div>
  )
}

export default function TutorialsPage() {
  const navigate = useNavigate()
  return <Course openLabel="Open this page" onOpen={(to) => navigate(to)} />
}

/** The course: the player and the lesson list. Also the body of the public
 * /mkt-tutorial page (LandingPage page="tutorials", with the site's header and footer). */
export function Course({ openLabel, onOpen }) {
  const firstReady = TUTORIALS.find((l) => l.src) || TUTORIALS[0]
  const [pick, setPick] = useState(firstReady.id)
  const [watched, setWatched] = useState(readWatched)
  const lesson = TUTORIALS.find((l) => l.id === pick) || TUTORIALS[0]
  const index = TUTORIALS.indexOf(lesson)
  const ready = TUTORIALS.filter((l) => l.src).length
  const next = TUTORIALS[index + 1]

  const markWatched = (id) => {
    setWatched((w) => {
      const n = new Set(w).add(id)
      try {
        localStorage.setItem(WATCHED_KEY, JSON.stringify([...n]))
      } catch {
        // private window: just not remembered
      }
      return n
    })
  }
  // a YouTube lesson can't tell us it ended — opening it counts as watched
  useEffect(() => {
    if (youtubeId(lesson.src)) markWatched(lesson.id)
  }, [lesson.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id) => {
    setPick(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-7 animate-fadein lg:px-8">
      <div className="mb-6">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">Video tutorials</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          How to use Smart Marketing, step by step ·{' '}
          <span style={km}>របៀបប្រើ Smart Marketing</span>
          {ready > 0 && (
            <span className="text-ink-400">
              {' '}
              · {watched.size >= ready ? 'all watched' : `${[...watched].filter((id) => TUTORIALS.some((l) => l.id === id && l.src)).length} of ${ready} watched`}
            </span>
          )}
        </p>
      </div>

      {/* like a video site: the player on the left, the course as thumbnails on the right */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* the lesson picked */}
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-ink-200/60 bg-night-950 shadow-card">
            <Player lesson={lesson} onEnded={() => markWatched(lesson.id)} />
          </div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-brand">
                Lesson {index + 1} of {TUTORIALS.length}
                {lesson.length ? ` · ${lesson.length}` : lesson.minutes ? ` · ${lesson.minutes} min` : ''}
              </div>
              <h2 className="mt-1 text-[20px] font-bold leading-tight text-ink-900">{lesson.title}</h2>
              <div className="mt-0.5 text-[14px] text-ink-500" style={km}>
                {lesson.km}
              </div>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">{lesson.text}</p>
            </div>
            <div className="flex flex-none flex-wrap items-center gap-2">
              {lesson.to && (
                <button type="button" onClick={() => onOpen(lesson.to)} className="btn-outline px-4 py-2">
                  {openLabel}
                </button>
              )}
              {next && (
                <button type="button" onClick={() => choose(next.id)} className="btn-primary px-4 py-2">
                  Next lesson <FiArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* the whole course: thumbnail, title, details */}
        <div className="min-w-0">
          <div className="mb-3 text-[13px] font-semibold text-ink-700">
            {TUTORIALS.length} lessons{ready < TUTORIALS.length ? ` · ${ready} ready` : ''}
          </div>
          <ol className="space-y-1">
            {TUTORIALS.map((l, i) => {
              const on = l.id === lesson.id
              const seen = watched.has(l.id)
              const Icon = l.icon
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => choose(l.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl p-1.5 text-left transition-colors ${on ? 'bg-brand-soft' : 'hover:bg-ink-100/70'}`}
                  >
                    <span className="relative aspect-video w-[152px] flex-none overflow-hidden rounded-lg border border-ink-200/60 bg-night-900">
                      {l.thumb || l.poster ? (
                        <img src={l.thumb || l.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-white/70">
                          <Icon size={22} />
                        </span>
                      )}
                      {on && l.src && (
                        <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
                          <FiPlay size={20} className="fill-white" />
                        </span>
                      )}
                      {l.src ? (
                        (l.length || l.minutes) && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-px text-[10.5px] font-semibold text-white">
                            {l.length || `${l.minutes} min`}
                          </span>
                        )
                      ) : (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-px text-[10px] font-semibold text-white/85">Soon</span>
                      )}
                      {seen && (
                        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                          <FiCheck size={12} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className={`line-clamp-2 text-[13.5px] font-semibold leading-snug ${on ? 'text-brand' : 'text-ink-900'}`}>{l.title}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-500" style={km}>
                        {l.km}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-400">
                        Lesson {i + 1}
                        {l.src ? (
                          <>
                            {(l.length || l.minutes) && (
                              <>
                                {' · '}
                                <FiClock size={11} /> {l.length || `${l.minutes} min`}
                              </>
                            )}
                            {seen && <span className="text-emerald-600">· Watched</span>}
                          </>
                        ) : (
                          ' · Coming soon'
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
