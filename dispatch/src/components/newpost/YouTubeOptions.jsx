import { useEffect, useRef, useState } from 'react'
import { FiImage, FiUpload, FiX, FiZap } from 'react-icons/fi'
import { api } from '../../api/client'
import GeneratingCanvas from '../ui/GeneratingCanvas'

// The composer's YouTube choices, saved as platform_options.youtube and used by
// app/publishers.py _publish_youtube:
//   format        "auto" | "short" | "video" — Short or a normal (feed) video
//   thumbnail_url a "/media/…" picture set as the video's thumbnail (not for
//                 Shorts — YouTube doesn't take custom thumbnails on those)
// The thumbnail can be uploaded or made with AI (POST /ai/image, 16:9 — the
// server draws Khmer words itself, and it's charged like any image).

const FORMATS = [
  ['auto', 'Auto', 'Vertical and 3 min or less → Short, else a video'],
  ['short', 'Short', 'In the Shorts feed — needs a vertical clip of 3 min or less'],
  ['video', 'Video', 'A normal YouTube video, with a thumbnail you choose'],
]

export default function YouTubeOptions({ value, onChange, brandId, title, caption }) {
  const v = value || { format: 'auto' }
  const set = (patch) => onChange({ ...v, ...patch })
  const [busy, setBusy] = useState('') // '' | 'upload' | 'ai'
  const [err, setErr] = useState('')
  const [dragging, setDragging] = useState(false) // a picture is being dragged over the thumbnail area
  const [headline, setHeadline] = useState(() => (title || caption || '').split('\n')[0].slice(0, 60))
  const fileRef = useRef(null)
  const live = useRef(true)
  useEffect(() => () => (live.current = false), [])

  const upload = async (file) => {
    if (!file) return
    setBusy('upload')
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file, file.name || 'thumbnail.jpg')
      const up = await api.upload('/media/upload', fd)
      if (live.current) set({ thumbnail_url: up.url })
    } catch (e) {
      if (live.current) setErr(e.message)
    } finally {
      if (live.current) setBusy('')
    }
  }

  const makeWithAi = async () => {
    setBusy('ai')
    setErr('')
    const topic = (caption || '').replace(/\s+/g, ' ').slice(0, 220)
    const prompt =
      `A YouTube video thumbnail, 16:9. Bold and eye-catching, high contrast, one clear focal subject, ` +
      `big readable headline text: "${headline.trim() || 'Watch this'}". ` +
      (topic ? `The video is about: ${topic}. ` : '') +
      `Clean modern design in the brand's colours, the headline large on one side, no small text, no borders, no watermark.`
    try {
      let job = await api.post('/ai/image', { prompt, aspect_ratio: '16:9', brand_id: brandId ?? null, use_logo: brandId != null })
      // the image renders in the background — wait for it (about half a minute)
      for (let i = 0; i < 90 && live.current && job.status !== 'succeeded' && job.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        job = await api.get(`/ai/video/${job.id}`)
      }
      if (!live.current) return
      if (job.status !== 'succeeded' || !job.video?.url) throw new Error(job.error || 'The thumbnail took too long — try again.')
      set({ thumbnail_url: job.video.url })
    } catch (e) {
      if (live.current) setErr(e.message)
    } finally {
      if (live.current) setBusy('')
    }
  }

  const fmt = v.format || 'auto'
  return (
    <div className="space-y-3 rounded-xl border border-ink-200 bg-canvas p-3">
      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">Post as</div>
        <div className="flex rounded-xl bg-ink-100 p-0.5 text-[12px] font-semibold">
          {FORMATS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => set({ format: id })}
              className={`flex-1 rounded-lg py-1.5 ${fmt === id ? 'bg-white text-brand shadow-sm dark:bg-brand/30 dark:text-white dark:ring-1 dark:ring-inset dark:ring-brand/60' : 'text-ink-500 hover:text-ink-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-500">{FORMATS.find(([id]) => id === fmt)?.[2]}</p>
      </div>

      {fmt !== 'short' && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-semibold text-ink-700">
            Thumbnail
            {v.thumbnail_url && (
              <button type="button" onClick={() => set({ thumbnail_url: '' })} className="flex items-center gap-1 font-medium text-ink-500 hover:text-red-600">
                <FiX size={12} /> Remove
              </button>
            )}
          </div>

          {/* the thumbnail area — drop a picture anywhere on it */}
          <div
            onDragOver={(e) => {
              if (busy || ![...(e.dataTransfer?.types || [])].includes('Files')) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
              if (file) upload(file)
              else setErr('Drop a picture (JPG, PNG or WebP).')
            }}
            className={`relative rounded-xl transition-shadow ${dragging ? 'ring-2 ring-brand ring-offset-2' : ''}`}
          >
            {v.thumbnail_url ? (
              <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                <img src={v.thumbnail_url} alt="Thumbnail" className="aspect-video w-full object-cover" />
              </div>
            ) : busy === 'ai' || busy === 'upload' ? (
              // the Studio's "making it" look: smoke, the floating logo, a shimmer
              <div className="h-40 w-full">
                <GeneratingCanvas
                  small
                  icon={busy === 'ai' ? '✨' : '⬆'}
                  stage={busy === 'ai' ? 'Making your thumbnail… about 30 s' : 'Uploading your picture…'}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-[11.5px] transition-colors ${
                  dragging ? 'border-brand bg-brand-soft text-brand' : 'border-ink-300 bg-white text-ink-400 hover:border-brand/60 hover:text-ink-600'
                }`}
              >
                <FiImage size={20} />
                <span className="font-semibold">{dragging ? 'Drop it here' : 'Drag a picture here, or click to choose'}</span>
                <span>No thumbnail? YouTube picks a frame from the video.</span>
              </button>
            )}
            {dragging && v.thumbnail_url && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-brand/70 text-[13px] font-bold text-white">Drop to replace</div>
            )}
          </div>

          {/* the words on the left half, the two ways to get one on the right */}
          <div className="mt-2 grid grid-cols-2 items-end gap-2">
            <label className="block min-w-0 text-[11px] font-medium text-ink-600">
              Text on the thumbnail
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value.slice(0, 60))}
                placeholder="e.g. 3 ways to save $540"
                className="input mt-1 h-9 py-0"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={makeWithAi}
                className="btn-primary h-9 min-w-0 rounded-lg px-2 text-[12px] disabled:opacity-50"
              >
                <FiZap size={13} className="flex-none" />
                <span className="truncate">{v.thumbnail_url ? 'Another' : 'Make with AI'}</span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => fileRef.current?.click()}
                className="btn-outline h-9 min-w-0 rounded-lg px-2 text-[12px] disabled:opacity-50"
              >
                <FiUpload size={13} className="flex-none" />
                <span className="truncate">Upload</span>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {err && <p className="mt-1.5 text-[11.5px] text-red-600">{err}</p>}
          <p className="mt-1.5 text-[10.5px] text-ink-400">
            1280×720 is best. AI thumbnails use credits like an image. YouTube shows custom thumbnails only on channels with a verified phone number.
          </p>
        </div>
      )}
    </div>
  )
}
