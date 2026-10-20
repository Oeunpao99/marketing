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
  // the cover (the lesson's thumbnail) with one big play button; the video and
  // its controls only once it's pressed, so the bar no longer covers the cover
  const [playing, setPlaying] = useState(false)
  useEffect(() => setPlaying(false), [lesson.id])
  const yt = youtubeId(lesson.src)
  const cover = lesson.thumb || lesson.poster
  if (lesson.src && !playing) {
    return (
      <button type="button" onClick={() => setPlaying(true)} aria-label={`Play: ${lesson.title}`} className="group absolute inset-0">
        {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/20" />
        <span className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-white shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)] ring-8 ring-white/40 transition-transform group-hover:scale-105">
          <FiPlay size={32} className="ml-1 fill-white" />
        </span>
      </button>
    )
  }
  if (yt) {
    return (
      <iframe
        key={yt}
        src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&autoplay=1`}
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
        poster={cover || undefined}
        controls
        autoPlay
        playsInline
        onEnded={onEnded}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />
    )
  }
  return (
    <div className="absolute inset-0 grid place-items-center bg-night-900 text-center">
      {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
      <div className="relative px-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[13px] font-semibold text-white backdrop-blur">
          <FiClock size={14} /> Video coming soon
        </span>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-white/75">
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

  const seenReady = TUTORIALS.filter((l) => l.src && watched.has(l.id)).length
  const readyList = TUTORIALS.filter((l) => l.src)
  const soonList = TUTORIALS.filter((l) => !l.src)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 animate-fadein lg:px-8 xl:px-0">
      {/* title + a slim progress bar */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">
            <span style={km}>មេរៀនជាវីដេអូ</span> <span className="text-ink-300">·</span> Video tutorials
          </h1>
          <p className="mt-1 text-[13px] text-ink-500" style={km}>
            របៀបប្រើ Smart Marketing ម្តងមួយជំហាន
          </p>
        </div>
        {ready > 0 && (
          <div className="w-56">
            <div className="flex justify-between text-[12px] font-semibold text-ink-500">
              <span>
                {seenReady} of {ready} watched
              </span>
              <span>{TUTORIALS.length} lessons</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(seenReady / ready) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* the lesson picked */}
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-ink-200/60 bg-night-950 shadow-card">
            <Player lesson={lesson} onEnded={() => markWatched(lesson.id)} />
          </div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold leading-snug text-ink-900" style={km}>
                {lesson.km}
              </h2>
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
                <span className="font-semibold text-ink-700">{lesson.title}</span> — {lesson.text}
              </p>
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

        {/* the course: lessons you can watch as picture cards, the rest as quiet lines */}
        <div className="min-w-0">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Watch now</div>
          <ol className="space-y-1">
            {readyList.map((l) => {
              const on = l.id === lesson.id
              const seen = watched.has(l.id)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => choose(l.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors ${on ? 'bg-brand-soft' : 'hover:bg-ink-100/70'}`}
                  >
                    <span className="relative h-[68px] w-[104px] flex-none overflow-hidden rounded-lg bg-canvas">
                      {l.art && <img src={l.art} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      {(l.length || l.minutes) && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{l.length || `${l.minutes}m`}</span>
                      )}
                      {seen && (
                        <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white">
                          <FiCheck size={10} strokeWidth={3.5} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] font-semibold ${on ? 'text-brand' : 'text-ink-900'}`} style={km}>
                        {l.km}
                      </span>
                      <span className="block truncate text-[12px] text-ink-500">{l.title}</span>
                    </span>
                    {on && <FiPlay size={14} className="mr-1 flex-none fill-brand text-brand" />}
                  </button>
                </li>
              )
            })}
          </ol>

          {soonList.length > 0 && (
            <>
              <div className="mb-1 mt-6 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Coming soon</div>
              <ol>
                {soonList.map((l) => {
                  const on = l.id === lesson.id
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => choose(l.id)}
                        aria-current={on ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${on ? 'bg-ink-100' : 'hover:bg-ink-50'}`}
                      >
                        <span className="w-5 flex-none text-right text-[12px] font-semibold text-ink-300">{TUTORIALS.indexOf(l) + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-500" style={km}>
                          {l.km}
                        </span>
                        <span className="flex-none text-[11px] text-ink-300">Soon</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
