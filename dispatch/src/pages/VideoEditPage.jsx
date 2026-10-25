import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FiArrowDown, FiArrowLeft, FiArrowUp, FiCheck, FiCopy, FiDownload, FiMic, FiMusic, FiPause, FiPlay, FiRotateCcw, FiSend, FiTrash2, FiVolume2, FiZap } from 'react-icons/fi'
import { api } from '../api/client'
import AutoTextarea from '../components/ui/AutoTextarea'
import { FIELDS } from '../components/studio/StoryboardEditor'
import { SCENE_LABELS, STYLE_LABELS } from '../components/studio/MotionBoard'
import { handoff } from '../lib/handoff'
import { isKhmer } from '../lib/format'
import { useStore } from '../store'

// The video editor: a finished template video from the Library, edited and drawn
// again (GET / POST /ai/motion/edit/{id}). The words on screen and the spoken
// line of each scene, their order, the music, the voice volume and the sound
// effects. A line left as it was keeps its voice (free); a changed one is read
// again. Saving makes a NEW video in the Library — the original stays — ready
// to post or download.

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (u) => (u ? `${mediaBase}${u}` : '')
const plain = (t) => String(t || '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()
let nextKey = 1

/** On / off, in the app's own style. */
function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 flex-none rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink-200'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function Slider({ value, onChange, min, max, disabled, label }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input type="range" min={min} max={max} step={5} value={Math.round(value * 100)} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value) / 100)} className="min-w-0 flex-1 accent-[rgb(var(--brand))] disabled:opacity-40" />
      <span className="w-11 flex-none text-right text-[11.5px] tabular-nums text-ink-500">{Math.round(value * 100)}%</span>
    </div>
  )
}

export default function VideoEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [src, setSrc] = useState(null) // the video as it is (GET /ai/motion/edit)
  const [error, setError] = useState('')
  const [scenes, setScenes] = useState([])
  const [sound, setSound] = useState({ music: true, music_volume: 1, voice_volume: 1, sfx: true })
  const [job, setJob] = useState(null) // { id, pct, stage } while saving
  const [done, setDone] = useState(null) // the new video: { url, filename, video_id }
  const [playing, setPlaying] = useState(null) // the scene whose voice is playing
  const [hearing, setHearing] = useState(null)
  const audio = useRef(null)

  useEffect(() => {
    let alive = true
    api
      .get(`/ai/motion/edit/${id}`)
      .then((v) => {
        if (!alive) return
        setSrc(v)
        setScenes(v.scenes.map((s) => ({ ...s, key: nextKey++, origSay: s.say, origText: { ...s.text } })))
        setSound({ music: v.music, music_volume: v.music_volume, voice_volume: v.voice_volume, sfx: v.sfx })
      })
      .catch((e) => alive && setError(e.message || 'This video can’t be edited.'))
    return () => {
      alive = false
      audio.current?.pause()
    }
  }, [id])

  // saving: follow the new video until it's in the Library
  useEffect(() => {
    if (!job?.id) return undefined
    let alive = true
    const timer = setInterval(async () => {
      try {
        const j = await api.get(`/ai/video/${job.id}`)
        if (!alive) return
        if (j.status === 'succeeded' && j.video) {
          setJob(null)
          setDone({ url: j.video.url, filename: j.video.filename, video_id: j.video.id })
          showToast('Saved to your Library')
        } else if (j.status === 'failed') {
          setJob(null)
          showToast(j.error && j.error !== 'Stopped' ? j.error : 'Could not save the edit — try again')
        } else {
          setJob((x) => x && { ...x, stage: j.progress?.stage || x.stage, pct: Math.round((j.progress?.render || 0) * 100) })
        }
      } catch {
        // a missed poll — the next one tries again
      }
    }, 2500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [job?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, patch) => setScenes((xs) => xs.map((s) => (s.key === k ? { ...s, ...patch } : s)))
  const move = (n, d) =>
    setScenes((xs) => {
      const out = [...xs]
      ;[out[n], out[n + d]] = [out[n + d], out[n]]
      return out
    })
  const duplicate = (n) => setScenes((xs) => [...xs.slice(0, n + 1), { ...xs[n], key: nextKey++ }, ...xs.slice(n + 1)])
  const remove = (n) => setScenes((xs) => xs.filter((_, k) => k !== n))
  const reset = (k) => setScenes((xs) => xs.map((s) => (s.key === k ? { ...s, say: s.origSay, text: { ...s.origText } } : s)))

  const revoiced = scenes.filter((s) => plain(s.say) !== plain(s.origSay) && plain(s.say)).length
  const changed = useMemo(() => {
    if (!src) return false
    const order = scenes.map((s) => s.i).join(',') !== src.scenes.map((s) => s.i).join(',')
    const words = scenes.some((s) => plain(s.say) !== plain(s.origSay) || Object.keys(s.text).some((k) => plain(s.text[k]) !== plain(s.origText[k])))
    const snd = sound.music !== src.music || sound.music_volume !== src.music_volume || sound.voice_volume !== src.voice_volume || sound.sfx !== src.sfx
    return order || words || snd
  }, [scenes, sound, src])

  const playClip = (s) => {
    audio.current?.pause()
    if (playing === s.key) return setPlaying(null)
    const a = new Audio(abs(s.clip))
    a.onended = () => setPlaying(null)
    a.play().catch(() => setPlaying(null))
    audio.current = a
    setPlaying(s.key)
  }

  // a changed line, read as the video will say it (POST /ai/motion/say — a few credits)
  const hear = async (s) => {
    audio.current?.pause()
    setHearing(s.key)
    try {
      const blob = await api.blob('/ai/motion/say', { brand_id: src.brand_id, text: plain(s.say), language: src.language || 'Khmer', voice: src.voice === 'none' ? 'female' : src.voice, style: src.style })
      const a = new Audio(URL.createObjectURL(blob))
      a.onended = () => setPlaying(null)
      await a.play()
      audio.current = a
      setPlaying(s.key)
    } catch (e) {
      showToast(e.message || 'Could not read that line — try again')
    } finally {
      setHearing(null)
    }
  }

  const save = async () => {
    try {
      const res = await api.post(`/ai/motion/edit/${id}`, {
        scenes: scenes.map((s) => ({ i: s.i, text: s.text, say: s.say })),
        ...sound,
      })
      setJob({ id: res.id, pct: 0, stage: revoiced ? 'voice' : 'render' })
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
    }
  }

  const post = () => {
    handoff.set({ name: done.filename, size: 0, kind: 'video', url: abs(done.url), videoId: done.video_id, caption: src.caption || '', source: 'Library' })
    navigate('/new')
  }

  const wide = src?.ratio === '16:9'
  if (error) {
    return (
      <div className="w-full px-5 py-10 lg:px-10">
        <button type="button" onClick={() => navigate('/library')} className="btn-outline mb-6">
          <FiArrowLeft size={13} /> Library
        </button>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
      </div>
    )
  }
  if (!src) {
    return (
      <div className="grid w-full place-items-center px-5 py-24 text-[13px] text-ink-500">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    )
  }

  return (
    <div className="w-full px-5 pt-6 lg:px-10 animate-fadein">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => navigate('/library')} className="btn-outline">
          <FiArrowLeft size={13} /> Library
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Edit video</h1>
          <p className="page-sub mt-0.5">
            {STYLE_LABELS[src.style] || 'Template video'} · {src.ratio} · {src.seconds}s — change the words, the voice lines, the order and the sound, then save it as a new video.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] xl:grid-cols-[minmax(0,480px)_1fr]">
        {/* the video: as it is, or the new one once it's saved */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl bg-night-950 p-2">
            <video
              key={done?.url || src.url}
              src={abs(done?.url || src.url)}
              controls
              playsInline
              preload="metadata"
              style={{ aspectRatio: wide ? '16 / 9' : '9 / 16' }}
              className={`mx-auto w-auto max-w-full rounded-xl bg-black object-contain ${wide ? 'h-auto w-full' : 'h-[calc(62vh/var(--z,1))]'}`}
            />
          </div>
          {done ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-emerald-800">
                <FiCheck size={15} /> Your edited video is in the Library
              </div>
              <p className="mt-1 text-[12px] text-emerald-800/80">The original is kept as it was. Post the new one now, or download it.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={post} className="btn-primary">
                  <FiSend size={13} /> Use in post
                </button>
                <a href={abs(done.url)} download={done.filename} className="btn-outline">
                  <FiDownload size={13} /> Download
                </a>
                <button type="button" onClick={() => navigate('/library')} className="btn-outline">
                  Open Library
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-center text-[11.5px] text-ink-400">The video as it is now — your changes show in the new one.</p>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {/* the sound */}
          <section className="rounded-2xl border border-ink-200 bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
              <FiVolume2 size={15} /> Sound
            </h2>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <FiMusic size={14} className="flex-none text-ink-400" />
                <span className="w-32 flex-none text-[12.5px] font-semibold text-ink-800">
                  Music{src.music_name ? <span className="block truncate text-[11px] font-normal capitalize text-ink-400">{src.music_name}</span> : null}
                </span>
                <Switch on={sound.music} onChange={(v) => setSound((x) => ({ ...x, music: v }))} label="Music on or off" />
                <Slider value={sound.music_volume} min={0} max={150} disabled={!sound.music || !src.music} onChange={(v) => setSound((x) => ({ ...x, music_volume: v }))} label="Music volume" />
              </div>
              {!src.music && <p className="pl-6 text-[11.5px] text-ink-400">This video was made without music.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <FiMic size={14} className="flex-none text-ink-400" />
                <span className="w-32 flex-none text-[12.5px] font-semibold text-ink-800">Voice</span>
                <span className="w-11 flex-none" />
                <Slider value={sound.voice_volume} min={20} max={100} disabled={src.voice === 'none'} onChange={(v) => setSound((x) => ({ ...x, voice_volume: v }))} label="Voice volume" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <FiZap size={14} className="flex-none text-ink-400" />
                <span className="w-32 flex-none text-[12.5px] font-semibold text-ink-800">
                  Sound effects<span className="block text-[11px] font-normal text-ink-400">whoosh, pop, ding</span>
                </span>
                <Switch on={sound.sfx} onChange={(v) => setSound((x) => ({ ...x, sfx: v }))} label="Sound effects on or off" />
              </div>
            </div>
          </section>

          {/* the scenes */}
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200/70 px-4 py-3 sm:px-5">
              <h2 className="text-[14px] font-bold text-ink-900">Scenes</h2>
              <span className="text-[11.5px] text-ink-500">{scenes.length} scenes · changed lines get a new voice, the rest keep theirs</span>
            </div>
            <ol className="divide-y divide-ink-200/60">
              {scenes.map((s, n) => {
                const newVoice = plain(s.say) !== plain(s.origSay)
                const edited = newVoice || Object.keys(s.text).some((k) => plain(s.text[k]) !== plain(s.origText[k]))
                const labels = Object.fromEntries(FIELDS[s.type] || [])
                return (
                  <li key={s.key} className={`flex gap-3 px-4 py-3.5 sm:px-5 ${playing === s.key ? 'bg-brand-soft/50' : ''}`}>
                    <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-lg bg-ink-100 text-[11px] font-bold tabular-nums text-ink-600">{n + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{SCENE_LABELS[s.type] || s.type}</span>
                          <span className="text-[10.5px] tabular-nums text-ink-400">{s.seconds}s</span>
                          {edited && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Edited</span>}
                        </span>
                        <span className="flex flex-none items-center gap-0.5 text-ink-400">
                          {edited && (
                            <button type="button" title="Undo this scene's changes" onClick={() => reset(s.key)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700">
                              <FiRotateCcw size={12} />
                            </button>
                          )}
                          <button type="button" title="Duplicate this scene" onClick={() => duplicate(n)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700">
                            <FiCopy size={12} />
                          </button>
                          <button type="button" title="Move up" disabled={n === 0} onClick={() => move(n, -1)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30">
                            <FiArrowUp size={13} />
                          </button>
                          <button type="button" title="Move down" disabled={n === scenes.length - 1} onClick={() => move(n, 1)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30">
                            <FiArrowDown size={13} />
                          </button>
                          <button type="button" title="Remove this scene" disabled={scenes.length <= 1} onClick={() => remove(n)} className="rounded-md p-1 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                            <FiTrash2 size={13} />
                          </button>
                        </span>
                      </div>
                      {Object.keys(s.text).map((key) => (
                        <label key={key} className="flex items-center gap-2">
                          <span className="w-20 flex-none text-[11px] text-ink-400">{labels[key] || key}</span>
                          <input
                            value={s.text[key]}
                            onChange={(e) => set(s.key, { text: { ...s.text, [key]: e.target.value } })}
                            className={`min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:border-brand ${isKhmer(s.text[key]) ? 'font-khmer' : ''}`}
                          />
                        </label>
                      ))}
                      {src.voice !== 'none' && (
                        <label className="flex items-start gap-2">
                          <span className="mt-1.5 flex w-20 flex-none items-center gap-1 text-[11px] text-ink-400">
                            <FiMic size={11} /> Voice
                          </span>
                          <div className="min-w-0 flex-1">
                            <AutoTextarea
                              value={s.say}
                              minRows={1}
                              maxRows={6}
                              placeholder="No voice in this scene"
                              onChange={(e) => set(s.key, { say: e.target.value })}
                              className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 focus:border-brand ${newVoice ? 'border-amber-300' : 'border-ink-200'} ${isKhmer(s.say) ? 'font-khmer' : ''}`}
                            />
                            {newVoice && plain(s.say) && <p className="mt-1 text-[11px] text-amber-700">This line will be read again with the video’s voice.</p>}
                          </div>
                          {newVoice ? (
                            <button type="button" onClick={() => hear(s)} disabled={hearing != null || !plain(s.say)} title="Hear the new line (uses a few credits)" className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg text-brand hover:bg-brand-soft disabled:opacity-40">
                              {hearing === s.key ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" /> : <FiPlay size={14} />}
                            </button>
                          ) : (
                            s.clip && (
                              <button type="button" onClick={() => playClip(s)} title="Listen to this scene's voice" className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800">
                                {playing === s.key ? <FiPause size={14} /> : <FiPlay size={14} />}
                              </button>
                            )
                          )}
                        </label>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      </div>

      {/* save: always in reach */}
      {!done && (
        <div className="sticky bottom-0 z-30 -mx-5 mt-6 border-t border-ink-200 bg-white px-5 py-3 lg:-mx-10 lg:px-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-[12.5px] text-ink-600">
              {job ? (
                <>
                  <b className="text-ink-900">{job.stage === 'voice' ? 'Recording the new lines…' : `Drawing the video… ${job.pct ? `${job.pct}%` : ''}`}</b> — you can leave this page; it lands in your Library.
                </>
              ) : changed ? (
                <>
                  Saved as a <b className="text-ink-900">new video</b> in your Library — the original stays.
                  {revoiced ? ` ${revoiced} line${revoiced > 1 ? 's' : ''} will be read again (a few credits).` : ' No new voice needed.'}
                </>
              ) : (
                'Change something above, then save it as a new video.'
              )}
            </span>
            <button type="button" onClick={save} disabled={!changed || !!job} className="btn-primary disabled:opacity-50">
              {job ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <FiCheck size={14} />}
              {job ? 'Saving…' : 'Save as new video'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
