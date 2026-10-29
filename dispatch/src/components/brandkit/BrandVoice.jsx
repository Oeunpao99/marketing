import { useEffect, useRef, useState } from 'react'
import { FiCheck, FiMic, FiPause, FiPlay, FiRefreshCw, FiSquare, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'
import AutoTextarea from '../ui/AutoTextarea'
import PlanLock from '../billing/PlanLock'
import { has, usePlanFeatures } from '../../lib/planFeatures'

// The brand's own voice (Content studio → Voice, and Products → Brand kit):
// the owner records in the browser — or drops / picks a recording — of about a
// minute of their speaking; the server learns the voice's fingerprint
// (backend app/brand_voice.py, app/voice_clone.py) and videos can then pick
// "Brand". A text to read is shown — it starts with a spoken consent. Once
// it's ready, one line is played by the Female reader, the Male reader and
// the brand voice side by side.
const SCRIPT = [
  'ខ្ញុំយល់ព្រមឱ្យ Marketing ឆ្លាតវៃ បង្កើតសំឡេង AI ពីសំឡេងរបស់ខ្ញុំ ដើម្បីប្រើក្នុងវីដេអូរបស់ហាងខ្ញុំ។',
  'សួស្តីបង! ថ្ងៃនេះបងសុខសប្បាយទេ?',
  'ហាងយើងបើករាល់ថ្ងៃ ចាប់ពីម៉ោងប្រាំពីរព្រឹក ដល់ម៉ោងដប់យប់។',
  'បើបងមានសំណួរអ្វី អាចឆាតមកយើងបានគ្រប់ពេល។',
  'យើងមានសេវាដឹកជញ្ជូនដល់ផ្ទះ នៅភ្នំពេញ និងគ្រប់ខេត្ត។',
  'តម្លៃចាប់ពីប្រាំដុល្លារ ដល់ម្ភៃប្រាំដុល្លារ។',
  'ទិញពីរ ថែមមួយ សម្រាប់តែសប្តាហ៍នេះប៉ុណ្ណោះ។',
  'កាលពីមុន ខ្ញុំត្រូវឆ្លើយសារអតិថិជនរហូតដល់ពាក់កណ្តាលអធ្រាត្រ។',
  'សារចូលមកច្រើនណាស់ ខ្ញុំមិនអាចឆ្លើយទាន់ទេ ហើយបាត់បង់អតិថិជនជាច្រើន។',
]
const COMPARE_LINE = 'សួស្តីបង! ហាងយើងមានប្រូម៉ូសិនពិសេស ទិញពីរ ថែមមួយ សម្រាប់តែសប្តាហ៍នេះប៉ុណ្ណោះ។ ឆាតមកយើងឥឡូវនេះ!'
const MIN_SECONDS = 20 // the server wants at least this much speech
const GOOD_SECONDS = 60 // the ring fills at a minute — enough for a good voice
const AUDIO = /\.(m4a|mp3|wav|ogg|opus|webm|aac|flac|mp4)$/i
const mediaSrc = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${url}`)
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function BrandVoice({ brand, showToast }) {
  const { refreshChannels } = useStore()
  const features = usePlanFeatures()
  const [voice, setVoice] = useState(null) // GET /brands/{id}/voice
  const [take, setTake] = useState(null) // { blob, url, name, seconds } — recorded or dropped, not sent yet
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [level, setLevel] = useState(0) // the mic's loudness, 0..1, while recording
  const [over, setOver] = useState(false) // a file is being dragged over the drop zone
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const rec = useRef(null)
  const timer = useRef(null)
  const secsRef = useRef(0) // the timer's count, read when the recording stops
  const meter = useRef(null) // { ctx, raf }
  const fileRef = useRef(null)

  const load = () => api.get(`/brands/${brand.id}/voice`).then(setVoice).catch(() => setVoice({}))
  useEffect(() => {
    setVoice(null)
    setTake(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  // learning runs on the server (~10-60 s): check until it's done
  useEffect(() => {
    if (voice?.status !== 'learning') return undefined
    const t = setTimeout(async () => {
      const next = await api.get(`/brands/${brand.id}/voice`).catch(() => voice)
      setVoice(next)
      if (next?.status === 'ready') {
        refreshChannels() // the Voice setting can now offer "Brand"
        showToast('Your voice is ready — hear it below, then pick “Brand” in a video’s Voice setting')
      }
    }, 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  const stopMeter = () => {
    if (meter.current) {
      cancelAnimationFrame(meter.current.raf)
      meter.current.ctx.close().catch(() => {})
      meter.current = null
    }
    setLevel(0)
  }

  useEffect(
    () => () => {
      clearInterval(timer.current)
      stopMeter()
      rec.current?.stream?.getTracks().forEach((tr) => tr.stop())
    },
    [],
  )

  const keep = (blob, name, seconds) =>
    setTake((old) => {
      if (old?.url) URL.revokeObjectURL(old.url)
      return { blob, url: URL.createObjectURL(blob), name, seconds }
    })

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const parts = []
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        stopMeter()
        const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' })
        keep(blob, `voice.${(mr.mimeType || '').includes('mp4') ? 'm4a' : 'webm'}`, secsRef.current)
      }
      // a live level meter, so people see the mic hears them
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const an = ctx.createAnalyser()
        an.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(an)
        const buf = new Uint8Array(an.fftSize)
        const tick = () => {
          an.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += ((v - 128) / 128) ** 2
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
          if (meter.current) meter.current.raf = requestAnimationFrame(tick) // stopped: no next frame
        }
        meter.current = { ctx, raf: requestAnimationFrame(tick) }
      } catch {
        /* no meter — recording still works */
      }
      rec.current = mr
      mr.start()
      secsRef.current = 0
      setSecs(0)
      setRecording(true)
      timer.current = setInterval(() => {
        secsRef.current += 1
        setSecs(secsRef.current)
      }, 1000)
    } catch {
      showToast('Microphone not available — allow it in the browser, or drop a recording instead')
    }
  }

  const stop = () => {
    clearInterval(timer.current)
    rec.current?.stop()
    setRecording(false)
  }

  const takeFile = (f) => {
    if (!f) return
    if (!(f.type.startsWith('audio/') || f.type === 'video/mp4' || AUDIO.test(f.name))) {
      showToast('That isn’t an audio file — use M4A, MP3, WAV, OGG, Opus or WebM')
      return
    }
    keep(f, f.name, null)
  }

  const send = async () => {
    if (!take || !consent) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('audio', take.blob, take.name)
      fd.append('consent', 'true')
      const next = await api.upload(`/brands/${brand.id}/voice`, fd)
      setVoice((v) => ({ readers: v?.readers, ...next }))
      setTake(null)
      setConsent(false)
    } catch (e) {
      showToast(`Couldn’t send the recording — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const forget = async () => {
    try {
      await api.del(`/brands/${brand.id}/voice`)
      setVoice((v) => ({ readers: v?.readers }))
      refreshChannels()
      showToast('Voice removed — its recording and fingerprint are deleted')
    } catch (e) {
      showToast(`Couldn’t remove — ${e.message}`)
    }
  }

  const status = voice?.status
  const tooShort = take?.seconds != null && take.seconds < MIN_SECONDS
  const ring = Math.min(1, secs / GOOD_SECONDS)

  // the brand's own voice: Business and up — a voice already made stays, so it can be removed
  if (!has(features, 'own_voice') && !status) {
    return (
      <section className="lg:col-span-2">
        <PlanLock feature="own_voice" text="Record a minute of your own voice, and your videos speak in it — in Khmer or English." />
      </section>
    )
  }

  return (
    <section className="card overflow-hidden lg:col-span-2">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
            <FiMic size={18} />
          </span>
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink-900">
              {brand.name} voice
              {status === 'ready' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <FiCheck size={11} /> Ready
                </span>
              )}
              {status === 'learning' && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">Learning…</span>}
            </h2>
            <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
              Record about a minute of the owner speaking, and videos can be narrated in that voice — pick “Brand” in a video’s
              Voice setting. The weekly plan’s videos use it automatically. Early version: it sounds like the person, still a
              little flat.
            </p>
          </div>
        </div>
        {(status === 'ready' || status === 'failed') && (
          <button type="button" onClick={forget} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-400 hover:text-red-600">
            <FiTrash2 size={12} /> Remove voice
          </button>
        )}
      </div>

      {voice === null ? (
        <div className="m-5 h-40 rounded-xl skeleton" />
      ) : (
        <>
          {status === 'ready' && <Compare brand={brand} readers={voice.readers || []} base={voice.base} showToast={showToast} />}

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* the text to read */}
            <div className="rounded-2xl bg-ink-50 p-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">Read this aloud</div>
              <ol className="mt-2 space-y-1.5">
                {SCRIPT.map((line, i) => (
                  <li key={i} className={`font-khmer text-[14px] leading-relaxed ${i === 0 ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                    {line}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-snug text-ink-400">
                A quiet room, the phone about a hand-width from your mouth, your normal friendly voice. Mistakes are fine — just
                re-read the line.
              </p>
            </div>

            {/* record or drop → check → learn */}
            <div className="flex flex-col gap-3">
              {status === 'failed' && <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{voice.error || 'The voice couldn’t be learned.'}</p>}

              {status === 'learning' ? (
                <LearningFlow since={voice.at} />
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!recording) setOver(true)
                  }}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOver(false)
                    if (!recording) takeFile(e.dataTransfer.files?.[0])
                  }}
                  className={`relative flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors ${
                    over ? 'border-brand bg-brand-soft' : recording ? 'border-red-300 bg-red-50/40' : 'border-ink-200 bg-white'
                  }`}
                >
                  {/* the mic: a ring fills toward a minute, the bars follow your voice */}
                  <button
                    type="button"
                    onClick={recording ? stop : start}
                    aria-label={recording ? 'Stop recording' : 'Start recording'}
                    className="relative grid h-28 w-28 place-items-center rounded-full"
                  >
                    <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90" aria-hidden="true">
                      <circle cx="56" cy="56" r="52" fill="none" strokeWidth="5" className="stroke-ink-100" />
                      {recording && (
                        <circle
                          cx="56"
                          cy="56"
                          r="52"
                          fill="none"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 52}
                          strokeDashoffset={2 * Math.PI * 52 * (1 - ring)}
                          className={secs >= MIN_SECONDS ? 'stroke-emerald-500' : 'stroke-red-500'}
                          style={{ transition: 'stroke-dashoffset 1s linear' }}
                        />
                      )}
                    </svg>
                    {recording && (
                      <span
                        className="absolute inset-3 rounded-full bg-red-500/15"
                        style={{ transform: `scale(${1 + level * 0.25})`, transition: 'transform 80ms linear' }}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`relative grid h-[76px] w-[76px] place-items-center rounded-full text-white shadow-lg transition-colors ${
                        recording ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-dark'
                      }`}
                    >
                      {recording ? <FiSquare size={22} fill="currentColor" /> : <FiMic size={28} />}
                    </span>
                  </button>

                  {recording ? (
                    <>
                      <div className="mt-3 flex h-6 items-end gap-1" aria-hidden="true">
                        {[0.5, 0.8, 1, 0.7, 0.9, 0.6, 0.85].map((k, i) => (
                          <span key={i} className="w-1.5 rounded-full bg-red-500" style={{ height: `${Math.max(12, level * k * 100)}%`, transition: 'height 80ms linear' }} />
                        ))}
                      </div>
                      <div className="mt-1.5 font-mono text-[15px] font-semibold tabular-nums text-ink-900">{clock(secs)}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-500">
                        {secs < MIN_SECONDS ? `Keep reading — at least ${MIN_SECONDS} s` : secs < GOOD_SECONDS ? 'Good — a minute is even better' : 'Great — tap to stop'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 text-[13.5px] font-semibold text-ink-900">{over ? 'Drop it here' : take || status === 'ready' ? 'Record again' : 'Tap to record'}</div>
                      <div className="mt-1 text-[11.5px] text-ink-500">
                        or drag an audio file here ·{' '}
                        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                          <FiUploadCloud size={12} /> browse
                        </button>
                      </div>
                      <div className="mt-1 text-[10.5px] text-ink-400">M4A (iPhone), MP3, WAV, OGG / Opus (Telegram), WebM</div>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm" className="hidden" onChange={(e) => {
                    takeFile(e.target.files?.[0])
                    e.target.value = ''
                  }} />
                </div>
              )}

              {take && !recording && status !== 'learning' && (
                <div className="rounded-2xl border border-ink-200 p-3">
                  <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold text-ink-700">
                    <span className="truncate">{take.seconds != null ? `Your recording · ${clock(take.seconds)}` : take.name}</span>
                    <button type="button" onClick={() => setTake(null)} className="text-ink-400 hover:text-red-600" aria-label="Discard">
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                  <audio src={take.url} controls className="mt-2 w-full" />
                  {tooShort && <p className="mt-1.5 text-[11.5px] text-amber-700">A bit short — record at least {MIN_SECONDS} seconds.</p>}
                  <label className="mt-3 flex items-start gap-2 text-[11.5px] leading-snug text-ink-600">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                    <span>
                      This is my own voice, or I have the speaker’s permission to use it for this brand’s videos, and I agree to
                      the{' '}
                      <a href="/terms#voice" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                        Voice cloning terms
                      </a>
                      .
                    </span>
                  </label>
                  <button type="button" onClick={send} disabled={!consent || busy || tooShort} className="btn-primary mt-3 w-full justify-center">
                    {busy ? 'Sending…' : status === 'ready' ? 'Use this recording instead' : 'Learn this voice'}
                  </button>
                </div>
              )}

              {status === 'ready' && voice.sample && !take && !recording && (
                <div className="rounded-2xl border border-ink-100 p-3">
                  <div className="text-[11.5px] font-semibold text-ink-700">The recording it learned from</div>
                  <audio src={mediaSrc(voice.sample)} controls className="mt-2 w-full" />
                  <div className="mt-1 text-[11px] text-ink-400">
                    {voice.seconds} s of speech · {voice.base === 'male' ? 'a lower voice' : 'a higher voice'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

// What learning a voice goes through, shown one after another while it runs
// (the server doesn't report steps — they follow the clock, and the last one
// waits until it's really done).
const STEPS = [
  { at: 0, label: 'Listening to your recording', sub: 'Cleaning out the silences and the room noise' },
  { at: 6, label: 'Hearing how you speak', sub: 'Your pitch, your tone, the colour of your voice' },
  { at: 16, label: 'Building your voice fingerprint', sub: '256 numbers that describe how you sound' },
  { at: 30, label: 'Teaching the narrator your voice', sub: 'So every line of your videos sounds like you' },
]
const sine = (amp, period, phase = 0) => {
  let d = ''
  for (let x = 0; x <= 600; x += 4) d += `${x ? 'L' : 'M'}${x},${(40 + amp * Math.sin((x / period) * 2 * Math.PI + phase)).toFixed(1)}`
  return d
}
const WAVES = [
  { d: sine(22, 150), dur: '3.2s', op: 0.85, w: 3 },
  { d: sine(14, 100, 1.2), dur: '2.1s', op: 0.5, w: 2.5 },
  { d: sine(28, 200, 2.4), dur: '4.6s', op: 0.3, w: 2 },
]

/** While the voice is learned: sound waves flowing through, the steps
 *  ticking by, a bar easing toward the end. */
function LearningFlow({ since }) {
  const started = Date.parse(since || '') || Date.now()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 400)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, (now - started) / 1000)
  const step = STEPS.reduce((on, x, i) => (s >= x.at ? i : on), 0)
  const pct = Math.min(96, Math.round(100 * (1 - Math.exp(-s / 22)))) // eases in, never claims done

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-brand-line bg-gradient-to-br from-brand-soft via-white to-brand-soft/40 px-5 pb-5 pt-4">
      {/* the voice flowing through */}
      <div className="relative -mx-5 h-24" aria-hidden="true">
        <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {WAVES.map((w, i) => (
            <path key={i} d={w.d} fill="none" strokeWidth={w.w} strokeLinecap="round" className="stroke-brand" opacity={w.op}>
              <animateTransform attributeName="transform" type="translate" from="0 0" to={`-${i === 1 ? 100 : i === 2 ? 200 : 150} 0`} dur={w.dur} repeatCount="indefinite" />
            </path>
          ))}
        </svg>
        <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-white shadow-[0_0_0_10px_rgb(var(--brand)/0.12),0_0_0_22px_rgb(var(--brand)/0.06)]">
          <FiMic size={22} className="animate-pulse" />
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-[13.5px] font-semibold text-ink-900">Learning your voice</div>
        <div className="font-mono text-[12px] font-semibold tabular-nums text-brand">{pct}%</div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 space-y-2.5">
        {STEPS.map((x, i) => {
          const done = i < step
          const on = i === step
          return (
            <li key={x.label} className={`flex items-start gap-2.5 transition-opacity duration-500 ${i > step ? 'opacity-40' : ''}`}>
              <span
                className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] ${
                  done ? 'bg-emerald-500 text-white' : on ? 'bg-brand text-white' : 'bg-white text-ink-400 ring-1 ring-ink-200'
                }`}
              >
                {done ? <FiCheck size={11} /> : on ? <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[12.5px] ${on ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{x.label}</span>
                {on && <span className="block text-[11px] text-ink-500 animate-fadein">{x.sub}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-[11px] text-ink-400">Usually under a minute — the first voice on a server takes a little longer. You can leave this page; it keeps going.</p>
    </div>
  )
}

/** One line read by the brand voice and every reader the server has — Azure's
 *  Sreymom and Piseth, and Gemini's when it reads the videos — so the owner
 *  hears what the clone sounds like (each ▶ is a voice preview: POST
 *  /ai/motion/say, a little AI credit). */
function Compare({ brand, readers, base, showToast }) {
  const [line, setLine] = useState(COMPARE_LINE)
  const [clips, setClips] = useState({}) // voice → { url, text } or "busy"
  const [playing, setPlaying] = useState('')
  const audio = useRef(null)

  useEffect(() => () => Object.values(clips).forEach((c) => c?.url && URL.revokeObjectURL(c.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  // the brand voice is a video reader's line turned into the owner's voice —
  // name the reader it's made from (Gemini's when Gemini reads the videos)
  const from = readers.find((x) => x.voice === (base === 'male' ? 'male' : 'female')) ||
    readers.find((x) => x.voice === (base === 'male' ? 'piseth' : 'sreymom'))
  const voices = [
    { v: 'brand', name: `${brand.name} voice`, note: `Your voice${from ? ` · made from ${from.name}` : ''}`, you: true },
    ...readers.map((x) => ({ v: x.voice, name: x.name, note: x.note })),
  ]

  const play = async (v) => {
    const a = audio.current
    if (playing === v) {
      a.pause()
      setPlaying('')
      return
    }
    let clip = clips[v]
    if (!clip || clip === 'busy' || clip.text !== line.trim()) {
      setClips((c) => ({ ...c, [v]: 'busy' }))
      try {
        const blob = await api.blob('/ai/motion/say', { brand_id: brand.id, text: line.trim(), language: 'Khmer', voice: v })
        clip = { url: URL.createObjectURL(blob), text: line.trim() }
        setClips((c) => {
          if (c[v]?.url) URL.revokeObjectURL(c[v].url)
          return { ...c, [v]: clip }
        })
      } catch (e) {
        setClips((c) => ({ ...c, [v]: undefined }))
        showToast(`Couldn’t make that voice — ${e.message}`)
        return
      }
    }
    a.src = clip.url
    a.play().then(() => setPlaying(v)).catch(() => setPlaying(''))
  }

  return (
    <div className="border-b border-ink-100 bg-gradient-to-b from-brand-soft/50 to-transparent px-5 py-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-brand">Hear the difference</div>
      <AutoTextarea
        minRows={1}
        maxRows={4}
        value={line}
        onChange={(e) => setLine(e.target.value)}
        maxLength={300}
        className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-khmer text-[13.5px] leading-relaxed text-ink-800 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {voices.map(({ v, name, note, you }) => {
          const clip = clips[v]
          const on = playing === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => play(v)}
              disabled={!line.trim() || clip === 'busy'}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                you ? 'border-brand-line bg-white ring-2 ring-brand/15' : 'border-ink-200 bg-white hover:border-ink-300'
              } ${on ? 'shadow-md' : ''}`}
            >
              <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-white ${you ? 'bg-brand' : 'bg-ink-800'}`}>
                {clip === 'busy' ? <FiRefreshCw size={15} className="animate-spin" /> : on ? <FiPause size={15} /> : <FiPlay size={15} className="ml-0.5" />}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[13px] font-semibold ${you ? 'text-brand' : 'text-ink-900'}`}>{name}</span>
                <span className="block truncate text-[11px] text-ink-500">{note}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-ink-400">Each ▶ makes the line once; change the line to compare another.</p>
      <audio ref={audio} onEnded={() => setPlaying('')} className="hidden" />
    </div>
  )
}
