import { useCallback, useEffect, useState } from 'react'
import { FiClock, FiFilm, FiImage, FiRefreshCw, FiVideo } from 'react-icons/fi'
import { templateById } from '../../lib/motionTemplates'

// Admin portal → Making now (backend app/admin.py GET /making): every video and
// picture being made right now, in every account — queued or running, not
// finished yet. A template video shows its stage (story, pictures, voice,
// render) and how far along it is, live; the page refreshes itself every few
// seconds while it's open.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const KIND = {
  motion: { icon: FiFilm, label: 'Template video' },
  video: { icon: FiVideo, label: 'AI-filmed video' },
  image: { icon: FiImage, label: 'Picture' },
}
const REFRESH_MS = 3000

function took(s) {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** The job's icon in a ring that fills with its progress; without a percent the ring
 * spins, a queued job's clock breathes. */
function ProgressIcon({ job }) {
  const { icon: Icon } = KIND[job.kind] || KIND.motion
  const size = 64
  const r = 27
  const c = 2 * Math.PI * r
  const known = job.percent != null
  const waiting = job.status === 'queued'
  return (
    <div className="relative grid flex-none place-items-center" style={{ width: size, height: size }}>
      {!waiting && <span className="absolute inset-1 rounded-full bg-brand-soft animate-ai-pulse" aria-hidden="true" />}
      <svg width={size} height={size} viewBox="0 0 64 64" className={`absolute inset-0 -rotate-90 ${known || waiting ? '' : 'animate-spin'}`} aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-ink-100" />
        {!waiting && (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-brand transition-[stroke-dashoffset] duration-700 ease-out"
            strokeDasharray={c}
            strokeDashoffset={known ? c * (1 - job.percent / 100) : c * 0.72}
          />
        )}
      </svg>
      <span className={`relative grid h-10 w-10 place-items-center rounded-full ${waiting ? 'bg-ink-50 text-ink-400' : 'bg-brand-soft text-brand'}`}>
        {waiting ? <FiClock size={18} className="animate-pulse" /> : <Icon size={18} className="animate-pulse-glow" />}
      </span>
    </div>
  )
}

function JobRow({ job, onOpen, team }) {
  const kind = KIND[job.kind] || KIND.motion
  const template = job.template ? templateById(job.template)?.name || job.template : ''
  const waiting = job.status === 'queued'
  return (
    <div className={`${card} flex items-center gap-4 p-4`}>
      <ProgressIcon job={job} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {team ? (
            <span className="truncate text-[14px] font-semibold text-ink-900">{job.user || 'Someone on your team'}</span>
          ) : (
            <button type="button" onClick={() => onOpen(job.workspace_id)} className="truncate text-[14px] font-semibold text-ink-900 hover:text-brand">
              {job.account}
            </button>
          )}
          {job.brand && <span className="truncate text-[12.5px] text-ink-500">· {job.brand}</span>}
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{template || kind.label}</span>
          {job.ratio && <span className="text-[11px] font-semibold text-ink-400">{job.ratio}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className={`font-semibold ${waiting ? 'text-ink-500' : 'text-brand'}`}>
            {waiting ? `In the queue · #${job.queue}` : job.stage}
            {job.percent != null && !waiting && ` · ${job.percent}%`}
          </span>
          <span className="text-ink-400">{took(job.elapsed)} since asked</span>
          {job.user && !team && <span className="text-ink-400">by {job.user}</span>}
          {job.scenes > 0 && <span className="text-ink-400">{job.scenes} scenes</span>}
        </div>
        {/* the bar: filled to its percent, or a sliding stripe while there's no number */}
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
          {waiting ? null : job.percent != null ? (
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, job.percent)}%` }} />
          ) : (
            <div className="h-full w-1/3 rounded-full bg-brand animate-indeterminate" />
          )}
        </div>
        {job.prompt && <p className="mt-2 truncate text-[12px] text-ink-500" title={job.prompt}>“{job.prompt}”</p>}
      </div>
    </div>
  )
}

export default function MakingNow({ api, onOpen = () => {}, team = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setData(await api('GET', '/making'))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [api])
  useEffect(() => {
    load()
    const id = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const jobs = data?.jobs || []
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">Making now</h1>
          <p className="mt-1 text-[13px] text-ink-500">
            {team ? 'What everyone on your team is making right now — updates by itself.' : 'Every video and picture being made right now, in every account — updates by itself.'}
          </p>
        </div>
        <button type="button" onClick={load} className="btn-outline">
          <FiRefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {[
          ['Being made', data?.running ?? '—', 'text-brand'],
          ['Waiting in the queue', data?.queued ?? '—', 'text-ink-900'],
        ].map(([label, value, cls]) => (
          <div key={label} className={`${card} min-w-[180px] px-5 py-4`}>
            <div className="text-[12px] font-semibold text-ink-500">{label}</div>
            <div className={`mt-1 text-[26px] font-bold tabular-nums ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}

      <div className="mt-5 space-y-3">
        {!data && !error ? (
          [0, 1].map((i) => <div key={i} className={`${card} h-[104px] skeleton`} />)
        ) : jobs.length ? (
          jobs.map((j) => <JobRow key={j.id} job={j} onOpen={onOpen} team={team} />)
        ) : (
          <div className={`${card} px-6 py-14 text-center`}>
            <FiFilm size={26} className="mx-auto text-ink-300" />
            <p className="mt-3 text-[14px] font-semibold text-ink-700">Nothing is being made right now</p>
            <p className="mt-1 text-[12.5px] text-ink-400">When {team ? 'anyone on your team' : 'someone'} presses Make, their video shows up here with its progress.</p>
          </div>
        )}
      </div>
    </div>
  )
}
