import { useEffect, useRef, useState } from 'react'
import { FiCheck, FiMic, FiSquare, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'

// Brand kit → Brand voice: the owner records (in the browser) or uploads about
// a minute of their own speaking; the server learns the voice's fingerprint
// (backend app/brand_voice.py, app/voice_clone.py) and videos can then pick
// "Brand voice". A text to read is shown — it starts with a spoken consent.
const SCRIPT = [
  'ខ្ញុំយល់ព្រមឱ្យ ContentFlow បង្កើតសំឡេង AI ពីសំឡេងរបស់ខ្ញុំ ដើម្បីប្រើក្នុងវីដេអូរបស់ហាងខ្ញុំ។',
  'សួស្តីបង! ថ្ងៃនេះបងសុខសប្បាយទេ?',
  'ហាងយើងបើករាល់ថ្ងៃ ចាប់ពីម៉ោងប្រាំពីរព្រឹក ដល់ម៉ោងដប់យប់។',
  'បើបងមានសំណួរអ្វី អាចឆាតមកយើងបានគ្រប់ពេល។',
  'យើងមានសេវាដឹកជញ្ជូនដល់ផ្ទះ នៅភ្នំពេញ និងគ្រប់ខេត្ត។',
  'តម្លៃចាប់ពីប្រាំដុល្លារ ដល់ម្ភៃប្រាំដុល្លារ។',
  'ទិញពីរ ថែមមួយ សម្រាប់តែសប្តាហ៍នេះប៉ុណ្ណោះ។',
  'កាលពីមុន ខ្ញុំត្រូវឆ្លើយសារអតិថិជនរហូតដល់ពាក់កណ្តាលអធ្រាត្រ។',
  'សារចូលមកច្រើនណាស់ ខ្ញុំមិនអាចឆ្លើយទាន់ទេ ហើយបាត់បង់អតិថិជនជាច្រើន។',
]
const MIN_SECONDS = 20 // the server wants at least this much speech
const mediaSrc = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${url}`)
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function BrandVoice({ brand, showToast }) {
  const { refreshChannels } = useStore()
  const [voice, setVoice] = useState(null) // GET /brands/{id}/voice
  const [take, setTake] = useState(null) // { blob, url, name, seconds } — recorded or picked, not sent yet
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const rec = useRef(null)
  const timer = useRef(null)
  const secsRef = useRef(0) // the timer's count, read when the recording stops
  const fileRef = useRef(null)

  const load = () => api.get(`/brands/${brand.id}/voice`).then(setVoice).catch(() => setVoice({}))
  useEffect(() => {
    setVoice(null)
    setTake(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  // learning runs on the server (~10-30 s): check until it's done
  useEffect(() => {
    if (voice?.status !== 'learning') return undefined
    const t = setTimeout(async () => {
      const next = await api.get(`/brands/${brand.id}/voice`).catch(() => voice)
      setVoice(next)
      if (next?.status === 'ready') {
        refreshChannels() // the Voice setting can now offer "Brand voice"
        showToast('Brand voice is ready — pick it in a video’s Voice setting')
      }
    }, 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  useEffect(() => () => {
    clearInterval(timer.current)
    rec.current?.stream?.getTracks().forEach((tr) => tr.stop())
  }, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const parts = []
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' })
        const ext = (mr.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
        setTake((old) => {
          if (old?.url) URL.revokeObjectURL(old.url)
          return { blob, url: URL.createObjectURL(blob), name: `voice.${ext}`, seconds: secsRef.current }
        })
      }
      rec.current = mr
      mr.start()
      setSecs(0)
      secsRef.current = 0
      setRecording(true)
      timer.current = setInterval(() => {
        secsRef.current += 1
        setSecs(secsRef.current)
      }, 1000)
    } catch {
      showToast('Microphone not available — allow it in the browser, or upload a recording instead')
    }
  }
  const stop = () => {
    clearInterval(timer.current)
    rec.current?.stop()
    setRecording(false)
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setTake((old) => {
      if (old?.url) URL.revokeObjectURL(old.url)
      return { blob: f, url: URL.createObjectURL(f), name: f.name, seconds: null }
    })
  }

  const send = async () => {
    if (!take || !consent) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('audio', take.blob, take.name)
      fd.append('consent', 'true')
      setVoice(await api.upload(`/brands/${brand.id}/voice`, fd))
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
      setVoice({})
      refreshChannels()
      showToast('Brand voice removed')
    } catch (e) {
      showToast(`Couldn’t remove — ${e.message}`)
    }
  }

  const status = voice?.status
  const tooShort = take?.seconds != null && take.seconds < MIN_SECONDS

  return (
    <section className="card p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-900">
            Brand voice
            {status === 'ready' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <FiCheck size={11} /> Ready
              </span>
            )}
            {status === 'learning' && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">Learning…</span>
            )}
          </h2>
          <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
            Record about a minute of the owner speaking, and videos can be narrated in that voice — pick “Brand voice” in a
            video’s Voice setting. The weekly plan’s videos use it automatically. Early version: it sounds like the person,
            still a little flat.
          </p>
        </div>
        {(status === 'ready' || status === 'failed') && (
          <button type="button" onClick={forget} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-400 hover:text-red-600">
            <FiTrash2 size={12} /> Remove voice
          </button>
        )}
      </div>

      {voice === null ? (
        <div className="mt-4 h-20 rounded-xl skeleton" />
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* the text to read */}
          <div className="rounded-xl bg-ink-50 p-4">
            <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">Read this aloud</div>
            <ol className="mt-2 space-y-1.5">
              {SCRIPT.map((line, i) => (
                <li key={i} className={`font-khmer text-[14px] leading-relaxed ${i === 0 ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                  {line}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] leading-snug text-ink-400">
              A quiet room, the phone about a hand-width from your mouth, your normal friendly voice. Mistakes are fine — just re-read the line.
            </p>
          </div>

          {/* record / upload → check → send */}
          <div className="flex flex-col gap-3">
            {status === 'ready' && voice.sample && !take && (
              <div className="rounded-xl border border-ink-100 p-3">
                <div className="text-[11.5px] font-semibold text-ink-700">The recording it learned from</div>
                <audio src={mediaSrc(voice.sample)} controls className="mt-2 w-full" />
                <div className="mt-1 text-[11px] text-ink-400">
                  {voice.seconds} s of speech · {voice.base === 'male' ? 'a lower voice' : 'a higher voice'}
                </div>
              </div>
            )}
            {status === 'failed' && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{voice.error || 'The voice couldn’t be learned.'}</p>}
            {status === 'learning' && (
              <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-brand">Learning the voice — usually under a minute. You can leave this page.</p>
            )}

            {status !== 'learning' && (
              <>
                <div className="flex gap-2">
                  {recording ? (
                    <button type="button" onClick={stop} className="btn-primary flex-1 justify-center bg-red-600 hover:bg-red-700">
                      <FiSquare size={13} fill="currentColor" /> Stop · {clock(secs)}
                    </button>
                  ) : (
                    <button type="button" onClick={start} className="btn-primary flex-1 justify-center">
                      <FiMic size={14} /> {take || status === 'ready' ? 'Record again' : 'Record'}
                    </button>
                  )}
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={recording} className="btn-outline justify-center">
                    <FiUploadCloud size={14} /> Upload
                  </button>
                  <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm" className="hidden" onChange={pickFile} />
                </div>
                {recording && <p className="text-[11.5px] text-ink-500">Recording… read the text on the left. At least {MIN_SECONDS} s; a minute is better.</p>}

                {take && !recording && (
                  <div className="rounded-xl border border-ink-200 p-3">
                    <div className="text-[11.5px] font-semibold text-ink-700">
                      Your recording{take.seconds != null ? ` · ${clock(take.seconds)}` : ''}
                    </div>
                    <audio src={take.url} controls className="mt-2 w-full" />
                    {tooShort && <p className="mt-1.5 text-[11.5px] text-amber-700">A bit short — record at least {MIN_SECONDS} seconds.</p>}
                    <label className="mt-3 flex items-start gap-2 text-[11.5px] leading-snug text-ink-600">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                      This is my own voice, or I have the speaker’s permission to use it for this brand’s videos.
                    </label>
                    <button type="button" onClick={send} disabled={!consent || busy || tooShort} className="btn-primary mt-3 w-full justify-center">
                      {busy ? 'Sending…' : status === 'ready' ? 'Use this recording instead' : 'Learn this voice'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
