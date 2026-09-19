import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { api } from '../api/client'
import { BRANDS } from '../data/brands'
import Tag from '../components/ui/Tag'
import DropZone, { humanSize } from '../components/ui/DropZone'
import { handoff } from '../lib/handoff'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''

const STYLES = [
  { id: 'photo', name: 'Photorealistic' },
  { id: 'illustration', name: 'Illustration' },
  { id: '3d', name: '3D / CGI' },
  { id: 'anime', name: 'Anime / Manga' },
]

const TEMPLATE_TYPES = [
  { id: 'image', name: 'Image' },
  { id: 'video', name: 'Video' },
]

const RATIOS = [
  { id: '9:16', name: '9:16', sub: 'Reels / TikTok / Shorts' },
  { id: '1:1', name: '1:1', sub: 'Feed square' },
  { id: '16:9', name: '16:9', sub: 'YouTube / landscape' },
]

const STEPS = [
  { n: 1, label: 'Brief' },
  { n: 2, label: 'Prompt' },
  { n: 3, label: 'Create' },
]

const icons = {
  image: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <circle cx="7" cy="8" r="1.4" />
      <path d="M3 15l4.2-4.2 2.6 2.6 3-3 4.2 4.2" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2.5" y="4" width="12" height="12" rx="2.5" />
      <path d="M14.5 8.5l3-1.8v6.6l-3-1.8" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10 2l1.6 4.4L16 8l-4.4 1.6L10 14l-1.6-4.4L4 8l4.4-1.6z" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="7" y="7" width="9" height="9" rx="2" />
      <path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" />
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-11 h-11">
      <rect x="4" y="8" width="16" height="12" rx="2.5" />
      <path d="M12 8V4M9 3.5h6" />
      <circle cx="9" cy="13" r="1" />
      <circle cx="15" cy="13" r="1" />
      <path d="M9 17h6" />
    </svg>
  ),
}

const IMAGE_TEMPLATES = [
  { id: 'product-shot', name: 'Product hero shot', ratio: '1:1' },
  { id: 'promo-banner', name: 'Promo / sale banner', ratio: '16:9' },
  { id: 'story-cover', name: 'Story / Reels cover', ratio: '9:16' },
  { id: 'tip-card', name: 'Tip / quote card', ratio: '1:1' },
]

const VIDEO_TEMPLATES = [
  { id: 'talking-head', name: 'Talking-head intro', ratio: '9:16' },
  { id: 'demo-tutorial', name: 'Screen demo tutorial', ratio: '9:16' },
  { id: 'motion-graphic', name: 'Motion graphic (text)', ratio: '9:16' },
  { id: 'lofi-broll', name: 'Cinematic B-roll', ratio: '16:9' },
]

function localPrompt({ brand, type, template, style, topic, mood, extra }) {
  const brandName = BRANDS.find((b) => b.id === brand)?.name || 'the brand'
  const styleName = STYLES.find((s) => s.id === style)?.name || 'photorealistic'
  const platformNote =
    template.ratio === '9:16'
      ? 'vertical 9:16, optimized for Shorts, Reels, and TikTok'
      : `${template.ratio} format`
  const lines = [
    `Create a ${styleName.toLowerCase()} ${type} in ${platformNote} for ${brandName}.`,
    `Template: ${template.name}.`,
    `Core message / topic: ${topic || '(fill in your main topic here)'}.`,
  ]
  if (mood) lines.push(`Mood: ${mood}.`)
  if (extra.trim()) lines.push(`Additional direction: ${extra.trim()}`)
  if (type === 'video') {
    lines.push(
      'One continuous shot under 20 seconds, strong hook in the first second, gentle camera push-in, no on-screen text, no captions.',
    )
  } else {
    lines.push('Strong composition, high contrast, clean margin around the subject for live text overlays.')
  }
  return lines.join('\n\n')
}

const fmtTok = (n) => (n || 0).toLocaleString()

export default function AIPromptPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast, brands, refreshCounts } = useStore()
  const [sessionTokens, setSessionTokens] = useState(0)
  const [promptTokens, setPromptTokens] = useState(0)
  const addTokens = (n) => n && setSessionTokens((t) => t + n)

  const [brand, setBrand] = useState('chum')
  const [type, setType] = useState('video')
  const [templateId, setTemplateId] = useState('talking-head')
  const [style, setStyle] = useState('photo')
  const [topic, setTopic] = useState('')
  const [mood, setMood] = useState('')
  const [extra, setExtra] = useState('')

  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState([]) // [{ text, note }]
  const [aiUsed, setAiUsed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [briefOpen, setBriefOpen] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [copied, setCopied] = useState(false)

  const [ratio, setRatio] = useState('9:16')
  const [seconds, setSeconds] = useState(8)
  const [job, setJob] = useState(null) // { id, status, error, video }
  const [videoErr, setVideoErr] = useState(null)
  const [startedAt, setStartedAt] = useState(0)
  const [, tick] = useState(0)
  const [imgBusy, setImgBusy] = useState(false)
  const [refImg, setRefImg] = useState(null) // { previewUrl, url, name } once uploaded
  const [refUploading, setRefUploading] = useState(false)

  const [asset, setAsset] = useState(null)
  const pollRef = useRef(null)

  // Arrived with an idea from the Calendar page ("Use this idea →") — prefill
  // the brief so the agent writes a prompt grounded in that idea/caption.
  useEffect(() => {
    const handoffState = location.state
    if (!handoffState) return
    if (handoffState.brandSlug) setBrand(handoffState.brandSlug)
    if (handoffState.topic) setTopic(handoffState.topic)
    if (handoffState.extra) setExtra(handoffState.extra)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const templates = type === 'image' ? IMAGE_TEMPLATES : VIDEO_TEMPLATES
  const template = templates.find((t) => t.id === templateId) || templates[0]
  const brandObj = BRANDS.find((b) => b.id === brand)
  const brandId = brands.find((b) => b.slug === brand)?.id ?? null
  const styleName = STYLES.find((s) => s.id === style)?.name || 'Photorealistic'
  const rendering = job && (job.status === 'queued' || job.status === 'running')
  const isImage = type === 'image'

  const pushHistory = (text, note) => setHistory((h) => [...h, { text, note }].slice(-8))

  const resetDownstream = () => {
    setPrompt('')
    setHistory([])
    setJob(null)
    setVideoErr(null)
    setBriefOpen(true)
    setRefImg(null)
  }

  const generate = async () => {
    if (generating) return
    const t = templates.find((x) => x.id === templateId) || templates[0]
    setGenerating(true)
    setCopied(false)
    try {
      const res = await api.post('/ai/prompt', {
        brand: brandObj?.name || '',
        brand_language: brandObj?.lang || '',
        brand_id: brandId,
        type,
        template: t.name,
        aspect_ratio: t.ratio,
        style: styleName,
        topic,
        mood,
        extra,
        has_reference: isImage && !!refImg?.url,
      })
      setPrompt(res.prompt)
      pushHistory(res.prompt, 'first draft')
      setAiUsed(true)
      setBriefOpen(false)
      setPromptTokens(res.total_tokens || 0)
      addTokens(res.total_tokens)
      showToast('Prompt written by AI')
    } catch (e) {
      const p = localPrompt({ brand, type, template: t, style, topic, mood, extra })
      setPrompt(p)
      pushHistory(p, 'template')
      setAiUsed(false)
      setBriefOpen(false)
      showToast(`AI unavailable (${e.message}) — used the template`)
    } finally {
      setGenerating(false)
    }
  }

  const refine = async () => {
    if (refining || !prompt || !feedback.trim()) return
    setRefining(true)
    setCopied(false)
    try {
      const res = await api.post('/ai/prompt', {
        type,
        aspect_ratio: template.ratio,
        prior_prompt: prompt,
        feedback: feedback.trim(),
      })
      setPrompt(res.prompt)
      pushHistory(res.prompt, feedback.trim())
      setAiUsed(true)
      setFeedback('')
      setPromptTokens((p) => p + (res.total_tokens || 0))
      addTokens(res.total_tokens)
      showToast('Prompt refined')
    } catch (e) {
      showToast(`Could not refine (${e.message})`)
    } finally {
      setRefining(false)
    }
  }

  const copy = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Could not copy — select the text and copy manually')
    }
  }

  const generateVideo = async () => {
    if (rendering || !prompt) return
    setVideoErr(null)
    setJob(null)
    try {
      const res = await api.post('/ai/video', {
        prompt,
        aspect_ratio: ratio,
        seconds,
        brand_id: brandId,
      })
      setJob(res)
      setStartedAt(Date.now())
      showToast('Rendering your video…')
    } catch (e) {
      setVideoErr(e.message)
    }
  }

  const generateImage = async () => {
    if (imgBusy || !prompt) return
    setVideoErr(null)
    setJob(null)
    setImgBusy(true)
    setStartedAt(Date.now())
    try {
      const res = await api.post('/ai/image', {
        prompt,
        aspect_ratio: ratio,
        brand_id: brandId,
        reference_url: refImg?.url || '',
      })
      setJob(res)
      addTokens(res.total_tokens)
      refreshCounts()
      showToast('Image ready')
    } catch (e) {
      setVideoErr(e.message)
    } finally {
      setImgBusy(false)
    }
  }

  // Poll the render job while it runs.
  useEffect(() => {
    clearTimeout(pollRef.current)
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return
    pollRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/ai/video/${job.id}`)
        setJob(res)
        if (res.status === 'succeeded') {
          addTokens(res.total_tokens)
          refreshCounts()
          showToast('Video ready')
        }
        if (res.status === 'failed') showToast(`Render failed: ${res.error}`)
      } catch (e) {
        setJob((j) => ({ ...j, error: e.message }))
      }
    }, 3000)
    return () => clearTimeout(pollRef.current)
  }, [job])

  // Re-render often while a job runs, to animate elapsed time + progress bar.
  const working = rendering || imgBusy
  useEffect(() => {
    if (!working) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [working])

  const elapsed = working && startedAt ? (Date.now() - startedAt) / 1000 : 0
  const imgEta = 27
  const imgPct = Math.min(92, 100 * (1 - Math.exp(-elapsed / (imgEta / 2.3))))
  const imgStage =
    elapsed < 2
      ? 'Sending your prompt…'
      : elapsed < 10
        ? 'Composing the image…'
        : elapsed < 22
          ? 'Adding detail and lighting…'
          : 'Almost there…'
  // Ticking token estimate while an image renders (gpt-image low ≈ 200-260 tok).
  const imgTokEst = 12 + Math.round(Math.min(1, elapsed / imgEta) * 220)

  const useGeneratedVideo = () => {
    if (!job?.video) return
    handoff.set({
      name: job.video.filename,
      size: 0,
      kind: isImage ? 'image' : 'video',
      url: `${mediaBase}${job.video.url}`,
      videoId: job.video.id,
    })
    navigate('/new')
  }

  const useDroppedAsset = () => {
    if (asset) handoff.set(asset)
    navigate('/new')
  }

  const takeReference = async (meta) => {
    if (meta.kind !== 'image') {
      showToast('Reference must be an image')
      return
    }
    setRefUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', meta.file, meta.name || 'reference')
      const up = await api.upload('/media/upload', fd)
      setRefImg({ previewUrl: meta.url, url: up.url, name: meta.name })
    } catch (e) {
      showToast(`Upload failed — ${e.message}`)
    } finally {
      setRefUploading(false)
    }
  }

  // gpt-image sizes are 1:1 / 2:3 / 3:2 — the preview just shows the image at
  // its true shape, capped so portrait doesn't run off the screen.
  const previewMax =
    ratio === '16:9' ? 'max-w-[720px]' : ratio === '1:1' ? 'max-w-[520px]' : 'max-w-[400px]'

  const step = job?.video ? 3 : prompt ? 2 : 1

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      {/* Header + steps */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] lg:text-[42px] leading-tight tracking-tight text-ink-900">
            AI <em className="italic text-brand">agent</em>
          </h1>
          <p className="mt-1.5 text-ink-500 max-w-[58ch] text-[15px]">
            Brief, prompt, then the image or video — one focused flow.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sessionTokens > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-600"
              title="Total provider tokens used on this page since you opened it"
            >
              <span className="text-brand">◈</span>
              {fmtTok(sessionTokens)} tokens this session
            </span>
          )}
          <StepIndicator current={step} />
        </div>
      </div>

      <div className="space-y-5">
        {/* ── 1 · BRIEF ─────────────────────────────────────────── */}
        {briefOpen ? (
          <section className="bg-white border border-ink-100 rounded-2xl shadow-card p-6 lg:p-8 animate-fadein">
            <StepHead n={1} title="Brief" hint="What do you need the agent to make?" />

            <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-2 xl:grid-cols-3">
              {/* Brand — full width */}
              <div className="lg:col-span-2 xl:col-span-3">
                <Label>Brand</Label>
                <div className="flex gap-2 flex-wrap">
                  {BRANDS.map((b) => {
                    const color = BRAND_COLORS[b.id] || '#166432'
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBrand(b.id)}
                        className={`px-4 py-2.5 rounded-xl border-[1.5px] bg-white text-[13.5px] font-bold flex items-center gap-2.5 transition-all duration-150 ${
                          brand === b.id
                            ? 'shadow-card text-ink-900'
                            : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:shadow-card'
                        }`}
                        style={brand === b.id ? { borderColor: color } : undefined}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: color }} />
                        {b.name}
                        {brand === b.id && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Selected</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Type + template */}
              <div>
                <Label>Type</Label>
                <div className="inline-flex rounded-xl border border-ink-200 bg-ink-50/70 p-1 mb-4">
                  {TEMPLATE_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setType(t.id)
                        setTemplateId(t.id === 'image' ? 'product-shot' : 'talking-head')
                        setRatio(t.id === 'image' ? '1:1' : '9:16')
                        resetDownstream()
                      }}
                      className={`px-5 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all duration-150 ${
                        type === t.id ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      <span className={type === t.id ? 'text-brand' : 'text-ink-400'}>{icons[t.id]}</span>
                      {t.name}
                    </button>
                  ))}
                </div>

                <Label>Template</Label>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTemplateId(t.id)
                        setRatio(t.ratio)
                        setPrompt('')
                        setHistory([])
                        setJob(null)
                      }}
                      className={`rounded-xl border p-3 text-left transition-all duration-150 ${
                        templateId === t.id
                          ? 'border-brand ring-2 ring-brand/15 bg-white shadow-card'
                          : 'border-ink-200 bg-white hover:border-ink-300 hover:shadow-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="grid place-items-center rounded-md border border-ink-200 bg-ink-50 font-mono text-[8.5px] font-bold text-ink-500 flex-none"
                          style={{
                            width: t.ratio === '16:9' ? 34 : t.ratio === '1:1' ? 26 : 20,
                            height: t.ratio === '16:9' ? 20 : t.ratio === '1:1' ? 26 : 30,
                          }}
                        >
                          {t.ratio}
                        </span>
                        {templateId === t.id && (
                          <span className="w-5 h-5 rounded-full gradient-brand text-white grid place-items-center text-[11px] font-bold flex-none">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-[12.5px] font-bold text-ink-800 leading-tight">{t.name}</div>
                    </button>
                  ))}
                </div>

                {isImage && (
                  <div className="mt-4">
                    <Label>Reference image (optional)</Label>
                    {refImg ? (
                      <div className="flex items-center gap-3 bg-white border border-ink-200 rounded-xl p-2.5">
                        <img src={refImg.previewUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-none bg-ink-100" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-ink-800 truncate">{refImg.name}</div>
                          <div className="text-[11.5px] text-ink-400">The agent edits / builds on this image</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRefImg(null)}
                          className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <DropZone
                        compact
                        accept="image/*"
                        onFile={takeReference}
                        title={refUploading ? 'Uploading…' : 'Drop an image to enhance or build on'}
                        hint="Keep the parts you like, change the rest via the prompt"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Style + mood */}
              <div>
                <Label>Style</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyle(s.id)}
                      className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold text-left transition-all duration-150 ${
                        style === s.id
                          ? 'border-brand ring-2 ring-brand/15 bg-white shadow-card'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:shadow-card'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <Label>Mood / tone</Label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  >
                    <option value="">Optional</option>
                    <option>Friendly & warm</option>
                    <option>Bold & energetic</option>
                    <option>Minimal & clean</option>
                    <option>Luxury & premium</option>
                    <option>Playful & fun</option>
                    <option>Professional & trustworthy</option>
                  </select>
                </div>
              </div>

              {/* Topic + extra */}
              <div className="lg:col-span-2 xl:col-span-1 space-y-4">
                <div>
                  <Label>What's it about</Label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Main message — e.g. Three ways to save phone data"
                    className="w-full bg-white border border-ink-200 rounded-xl px-3.5 py-3 text-[14px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <Label>Extra direction</Label>
                  <textarea
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    rows={2}
                    placeholder="Colours, props, camera angle, references… (optional)"
                    className="w-full bg-white border border-ink-200 rounded-xl px-3.5 py-3 text-[14px] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-ink-100 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="px-7 py-3.5 rounded-2xl gradient-brand text-white text-[15px] font-bold flex items-center justify-center gap-2.5 hover:shadow-glow-lg disabled:opacity-80 disabled:cursor-not-allowed transition-all duration-200"
              >
                {generating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Writing your prompt…
                  </>
                ) : (
                  <>
                    <span className="text-white">{icons.spark}</span>
                    2 · {prompt ? 'Rewrite the prompt' : 'Write the prompt'}
                  </>
                )}
              </button>
              {prompt && (
                <button
                  type="button"
                  onClick={() => setBriefOpen(false)}
                  className="text-[13px] font-semibold text-ink-500 hover:text-ink-800"
                >
                  Keep current prompt
                </button>
              )}
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="w-full text-left bg-white border border-ink-100 rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-brand/40 hover:shadow-card transition-all duration-150"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl grid place-items-center gradient-brand text-white flex-none">
                {icons[type]}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink-900 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Step 1 · Brief</span>
                </div>
                <div className="text-[12.5px] text-ink-500 truncate">
                  <b className="text-ink-800">{brandObj?.name}</b>
                  <span className="text-ink-400"> · </span>
                  {isImage ? 'Image' : 'Video'}
                  <span className="text-ink-400"> · </span>
                  {template.name}
                  <span className="text-ink-400"> · </span>
                  {styleName}
                  {topic ? <span className="text-ink-400"> · “{topic}”</span> : null}
                </div>
              </div>
            </div>
            <span className="ml-auto flex-none text-[12.5px] font-bold text-brand">Edit brief</span>
          </button>
        )}

        {/* ── 2 · PROMPT  +  3 · CREATE — side by side on wide screens ── */}
        {prompt && (
        <div className="grid gap-5 xl:grid-cols-2 items-start">
          <section className="bg-white border border-ink-100 rounded-2xl shadow-card p-6 lg:p-8 animate-fadein">
            <div className="flex items-start justify-between gap-3">
              <StepHead n={2} title="Prompt" hint="Edit directly, or tell the agent what to change" />
              <div className="flex items-center gap-2 flex-none pt-1">
                {promptTokens > 0 && (
                  <span className="text-[11.5px] font-mono text-ink-400">{fmtTok(promptTokens)} tok</span>
                )}
                <Tag variant={aiUsed ? 'lime' : 'idle'}>{aiUsed ? 'AI-written' : 'Template'}</Tag>
                {copied && <Tag variant="ok">Copied</Tag>}
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={16}
              className="mt-5 w-full min-h-[340px] max-h-[62vh] font-sans text-[13.5px] text-ink-800 bg-ink-50/60 border border-ink-200/80 rounded-2xl p-4 lg:p-5 leading-[1.65] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <div className="mt-1.5 text-right text-[11px] text-ink-400 font-mono">
              {prompt.trim().split(/\s+/).filter(Boolean).length} words
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refine()}
                placeholder="e.g. more cinematic, add a product close-up, warmer light"
                className="flex-1 bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                onClick={refine}
                disabled={refining || !feedback.trim()}
                className="px-5 py-2.5 rounded-xl border-2 border-brand text-brand text-[13px] font-bold hover:bg-brand/5 disabled:opacity-50 transition-all duration-150 flex items-center justify-center gap-2"
              >
                {refining && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                )}
                {refining ? 'Refining…' : 'Refine'}
              </button>
            </div>

            {history.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mr-1">Versions</span>
                {history.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    title={h.note}
                    onClick={() => setPrompt(h.text)}
                    className={`px-2 py-1 rounded-lg text-[11.5px] font-semibold border transition-all duration-150 ${
                      h.text === prompt ? 'border-brand bg-brand/5 text-ink-800' : 'border-ink-200 text-ink-500 hover:border-ink-300'
                    }`}
                  >
                    v{i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copy}
                className="px-4 py-2 rounded-xl border border-ink-300 text-ink-700 text-[13px] font-bold flex items-center gap-2 hover:bg-ink-50 transition-all duration-150"
              >
                {icons.copy} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>

          {/* ── 3 · CREATE ────────────────────────────────────────── */}
          {(() => {
          const busy = isImage ? imgBusy : rendering
          return (
            <section className="bg-white border border-ink-100 rounded-2xl shadow-card p-6 lg:p-8 animate-fadein">
              <div className="flex items-start justify-between gap-3">
                <StepHead
                  n={3}
                  title={isImage ? 'Create the image' : 'Create the video'}
                  hint={isImage ? 'Generated here, saved to your library' : 'Rendered here, saved to your library'}
                />
                <div className="flex-none flex items-center gap-2 pt-1">
                  {job?.status === 'succeeded' && job?.total_tokens > 0 && (
                    <span className="text-[11.5px] font-mono text-ink-400">
                      {fmtTok(job.total_tokens)} tok
                    </span>
                  )}
                  {job?.status === 'succeeded' && <Tag variant="ok">Ready</Tag>}
                  {job?.status === 'failed' && <Tag variant="stop">Failed</Tag>}
                </div>
              </div>

              {!job?.video ? (
                <div className="mt-6 space-y-4">
                  {isImage && refImg && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-[12px] text-ink-600">
                      <img src={refImg.previewUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-none" />
                      <span className="flex-1 min-w-0 truncate">
                        Building on <b className="text-ink-800">{refImg.name}</b>
                      </span>
                    </div>
                  )}

                  <div>
                    <Label>Aspect ratio{isImage ? ' (image renders square / portrait / landscape)' : ''}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {RATIOS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={busy}
                          onClick={() => setRatio(r.id)}
                          className={`rounded-xl border px-2.5 py-2 text-left transition-all duration-150 disabled:opacity-50 ${
                            ratio === r.id ? 'border-brand ring-2 ring-brand/20 bg-white shadow-card' : 'border-ink-200 bg-white hover:border-ink-300'
                          }`}
                        >
                          <div className="text-[13px] font-bold text-ink-800">{r.name}</div>
                          <div className="text-[10.5px] text-ink-400 leading-tight mt-0.5">{r.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isImage && (
                    <div>
                      <Label>Length — {seconds}s</Label>
                      <input
                        type="range"
                        min={3}
                        max={20}
                        value={seconds}
                        disabled={busy}
                        onChange={(e) => setSeconds(Number(e.target.value))}
                        className="w-full accent-brand"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={isImage ? generateImage : generateVideo}
                    disabled={busy}
                    className="w-full px-7 py-3.5 rounded-2xl gradient-brand text-white text-[15px] font-bold flex items-center justify-center gap-2.5 hover:shadow-glow-lg disabled:opacity-80 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {busy ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        {isImage
                          ? `Generating… ${Math.round(elapsed)}s`
                          : `${job?.status === 'queued' ? 'Queued…' : 'Rendering…'} ${Math.round(elapsed)}s`}
                      </>
                    ) : (
                      <>
                        <span className="text-white">{icons.spark}</span>
                        {isImage ? (refImg ? 'Generate from reference' : 'Generate image') : 'Generate video'}
                      </>
                    )}
                  </button>
                </div>
              ) : null}

              {/* progress + notices */}
              {!job?.video && (
                <div className="mt-5 space-y-3">
                  {isImage && imgBusy && (
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand/15">
                        <div
                          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-linear"
                          style={{ width: `${imgPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[12.5px] text-ink-500">
                        <span>{imgStage}</span>
                        <span className="font-mono text-ink-400">
                          ~{fmtTok(imgTokEst)} tok · {Math.round(imgPct)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {rendering && !isImage && (
                    <p className="text-[12.5px] text-ink-400">
                      This usually takes 1–3 minutes. You can leave this page — the video lands in
                      your library either way.
                    </p>
                  )}

                  {job?.status === 'failed' && (
                    <p className="text-[12.5px] text-red-600">{job.error}</p>
                  )}

                  {videoErr && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800">
                      <b>{isImage ? 'Image' : 'Video'} generation isn't ready.</b> {videoErr}
                      <div className="mt-1 text-amber-700">
                        {isImage
                          ? 'Deploy an image model (gpt-image-1 / -2 / dall-e-3) in Azure and set '
                          : 'Set up a video provider ('}
                        <code className="mx-1">{isImage ? 'AZURE_OPENAI_IMAGE_*' : 'VIDEO_PROVIDER'}</code>
                        {isImage ? '.' : ' = azure_sora or gemini_veo).'} You can still bring your own
                        file below.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* result */}
              {job?.video && (
                <div className="mt-6 flex flex-col items-center">
                  {isImage ? (
                    <img
                      key={job.video.id}
                      src={`${mediaBase}${job.video.url}`}
                      alt=""
                      className={`block w-full ${previewMax} h-auto rounded-2xl ring-1 ring-ink-900/10 shadow-dock bg-ink-50 animate-media-reveal`}
                    />
                  ) : (
                    <div
                      key={job.video.id}
                      className={`w-full ${previewMax} overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-ink-900/10 shadow-dock animate-media-reveal`}
                    >
                      <video
                        src={`${mediaBase}${job.video.url}`}
                        controls
                        playsInline
                        className="block w-full h-auto"
                      />
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap justify-center gap-2 animate-fadein">
                    <button
                      type="button"
                      onClick={useGeneratedVideo}
                      className="px-6 py-3 rounded-2xl gradient-brand text-white text-[14px] font-bold hover:shadow-glow-lg transition-all duration-200"
                    >
                      Use this {isImage ? 'image' : 'video'} → create a post
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJob(null)
                        setVideoErr(null)
                      }}
                      className="px-5 py-3 rounded-2xl border border-ink-300 text-ink-600 text-[14px] font-bold hover:bg-ink-50 transition-all duration-150"
                    >
                      {isImage ? 'Generate again' : 'Render again'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/library')}
                    className="mt-2 text-[12.5px] font-semibold text-ink-400 hover:text-brand"
                  >
                    Saved to your Library →
                  </button>
                </div>
              )}
            </section>
          )
          })()}
        </div>
        )}

        {/* Bring your own — tucked away */}
        {prompt && !job?.video && (
          <details className="group bg-white border border-ink-100 rounded-2xl px-5 py-4">
            <summary className="cursor-pointer list-none text-[12.5px] font-bold tracking-wide uppercase text-ink-400 flex items-center justify-between">
              Or bring your own file
              <span className="text-ink-300 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <div className="mt-4">
              {asset ? (
                <div className="flex items-center gap-3 bg-white border border-ink-200 rounded-xl p-3">
                  {asset.kind === 'image' ? (
                    <img src={asset.url} alt="" className="w-14 h-14 rounded-lg object-cover flex-none bg-ink-100" />
                  ) : (
                    <video src={asset.url} className="w-14 h-14 rounded-lg object-cover flex-none bg-ink-900" muted />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink-800 truncate">{asset.name}</div>
                    <div className="text-[12px] text-ink-400">{asset.kind} · {humanSize(asset.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={useDroppedAsset}
                    className="px-3 py-1.5 rounded-lg gradient-brand text-white text-[12.5px] font-bold"
                  >
                    Use it →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(asset.url)
                      setAsset(null)
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-all duration-150"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <DropZone
                  compact
                  onFile={setAsset}
                  title="Drop an image or video"
                  hint="Use a file you already have — it travels to the new post"
                />
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function Label({ children }) {
  return (
    <label className="block text-[11px] font-bold tracking-[.09em] uppercase text-ink-400 mb-2">{children}</label>
  )
}

function StepHead({ n, title, hint }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl grid place-items-center flex-none text-[14px] font-bold gradient-brand text-white shadow-glow">
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-[15.5px] font-bold text-ink-900 leading-tight">{title}</div>
        <div className="text-[12.5px] text-ink-400">{hint}</div>
      </div>
    </div>
  )
}

function StepIndicator({ current }) {
  return (
    <div className="hidden md:flex items-center gap-2">
      {STEPS.map((s, i) => {
        const state = current > s.n ? 'done' : current === s.n ? 'active' : 'idle'
        return (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && (
              <span className={`w-8 h-px ${state !== 'idle' ? 'bg-brand' : 'bg-ink-200'} transition-colors duration-200`} />
            )}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-200 ${
                state === 'done'
                  ? 'border-brand/30 bg-brand/5 text-ink-800'
                  : state === 'active'
                    ? 'border-brand bg-white text-ink-900 shadow-card'
                    : 'border-ink-200 bg-white text-ink-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-bold flex-none ${
                  state === 'done' || state === 'active' ? 'gradient-brand text-white' : 'bg-ink-100 text-ink-500'
                }`}
              >
                {state === 'done' ? '✓' : s.n}
              </span>
              <span className="text-[12px] font-semibold">{s.label}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}