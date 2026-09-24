import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FiArrowUp,
  FiCheck,
  FiClock,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiImage,
  FiMaximize2,
  FiMessageCircle,
  FiPaperclip,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiTrash2,
  FiVideo,
  FiX,
} from 'react-icons/fi'
import { useStore } from '../store'
import { api } from '../api/client'
import AutoTextarea from '../components/ui/AutoTextarea'
import { handoff } from '../lib/handoff'
import { colorForBrand } from '../lib/brandColor'

// AI Agent — one chat for both asking and creating. A message that reads
// like a question ("how is my engagement?", "what should I post next?") goes
// to the marketing advisor (app/advisor.py), which answers from the
// workspace's own data and suggests posts; anything else is a prompt and is
// generated as an image/video. The composer shows which one it will do, and
// one click flips it. The page is a thread of turns and one composer;
// every option (type, size, length, brand, style) lives behind the settings
// button, and ✦ "Write it for me" turns a short idea into a full prompt
// grounded in the brand's products (the old guided brief, in one click).

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''

const RATIOS = [
  { id: '9:16', sub: 'Reels · TikTok · Shorts' },
  { id: '1:1', sub: 'Feed square' },
  { id: '16:9', sub: 'YouTube · landscape' },
]
const LENGTHS = [4, 8, 12, 20]
const STYLES = ['Photorealistic', 'Illustration', '3D / CGI', 'Anime / Manga']
const TEMPLATES = {
  image: ['Product hero shot', 'Promo / sale banner', 'Story / Reels cover', 'Tip / quote card'],
  video: ['Talking-head intro', 'Screen demo tutorial', 'Motion graphic (text)', 'Cinematic B-roll'],
}
const SUGGESTIONS = {
  image: [
    'A clean product hero shot on a soft pastel background',
    'A bold promo banner for a weekend sale',
    'A cozy café scene for an Instagram story cover',
  ],
  video: [
    'A friendly presenter introducing our product in 5 seconds',
    'Slow cinematic B-roll of our product on a desk',
    'An energetic motion-graphic teaser for a new launch',
  ],
}

const QUESTIONS = [
  'How is my engagement going this month?',
  'What should I post next week?',
  'Which product needs more attention?',
]

// Heuristic router for the composer — shown to the person (Ask / Create
// toggle) so a wrong guess is one click to fix, never a silent surprise.
const QUESTION_START =
  /^(how|what|why|which|who|when|where|should|could|can you|can i|can we|do |does |did |is |are |was |will |would |tell me|give me (some )?(advice|ideas|tips|suggestions|feedback)|suggest|analy[sz]e|review my|help me (decide|understand|plan|improve|grow)|compare|explain|recommend|any (idea|tip|advice))/i
const KHMER_QUESTION = /(ទេ|អ្វី|យ៉ាងម៉េច|យ៉ាងដូចម្តេច|ដូចម្តេច|ហេតុអ្វី|គួរ|ប៉ុន្មាន|មែនទេ)/
function looksLikeQuestion(raw) {
  const t = raw.trim()
  if (!t) return false
  if (/[?？]\s*$/.test(t)) return true
  if (/[\u1780-\u17FF]/.test(t)) return KHMER_QUESTION.test(t)
  return QUESTION_START.test(t)
}

const fmtTok = (n) => (n || 0).toLocaleString()
const IMG_ETA = 27
const VID_ETA = 150
const isImageUrl = (url) => /\.(png|jpe?g|webp|gif)$/i.test(url || '')

let turnSeq = 0

// What gets saved per turn (app/chats.py stores it as-is). Blob previews
// can't outlive the page, so a reference image is kept by its /media url.
function serializeTurn(t) {
  return {
    id: t.id,
    kind: t.kind,
    prompt: t.prompt,
    ratio: t.ratio,
    seconds: t.seconds,
    brandId: t.brandId,
    brandName: t.brandName,
    refUrl: t.refUrl || '',
    refPreview: t.refUrl ? `${mediaBase}${t.refUrl}` : '',
    history: t.history,
    status: t.status,
    error: t.error || '',
    answer: t.answer,
    suggestions: t.suggestions,
    video: t.video || null,
    jobId: t.jobId || null,
    tokens: t.tokens || 0,
    startedAt: t.startedAt,
  }
}

// Reopening a chat: a video still rendering server-side resumes polling;
// anything else that was mid-flight when the page closed can't be resumed.
function restoreTurn(t) {
  if (t.status !== 'working') return t
  if (t.kind === 'video' && t.jobId) return t
  return { ...t, status: 'failed', error: 'Interrupted when the page closed — try again.' }
}

export default function AIPromptPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast, brands, refreshCounts } = useStore()

  // settings (behind the ⚙ button)
  const [type, setType] = useState('image')
  const [ratio, setRatio] = useState('1:1')
  const [seconds, setSeconds] = useState(8)
  const [brand, setBrand] = useState(null)
  const [style, setStyle] = useState(STYLES[0])
  const [template, setTemplate] = useState(TEMPLATES.image[0])
  const [settingsOpen, setSettingsOpen] = useState(false)

  // composer
  const [text, setText] = useState('')
  const [refImg, setRefImg] = useState(null) // { previewUrl, url, name }
  const [uploading, setUploading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [intentPick, setIntentPick] = useState(null) // null = auto | 'ask' | 'create'

  // thread
  const [turns, setTurns] = useState([])
  const [chatId, setChatId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const chatIdRef = useRef(null)
  const creatingRef = useRef(null)
  const [sessionTokens, setSessionTokens] = useState(0)
  const [, tick] = useState(0)

  const bottomRef = useRef(null)
  const composerRef = useRef(null)
  const settingsRef = useRef(null)

  const brandObj = brands.find((b) => b.slug === brand) || brands[0]
  const isImage = type === 'image'
  const working = turns.some((t) => t.status === 'working')

  useEffect(() => {
    if (!brand && brands.length) setBrand(brands[0].slug)
  }, [brands, brand])

  // An idea handed over from the Calendar ("Use this idea →").
  useEffect(() => {
    const s = location.state
    if (!s) return
    if (s.brandSlug) setBrand(s.brandSlug)
    const idea = [s.topic, s.extra].filter(Boolean).join('\n\n')
    if (idea) {
      setText(idea)
      showToast('Idea loaded — press ✦ to turn it into a full prompt, or send it as is')
    }
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the settings popover on an outside click.
  useEffect(() => {
    if (!settingsOpen) return
    const onDown = (e) => {
      if (!settingsRef.current?.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [settingsOpen])

  // Animate progress while anything renders.
  useEffect(() => {
    if (!working) return
    const id = setInterval(() => tick((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [working])

  // Keep the newest turn in view: jump to the bottom when a message is sent
  // (or a chat is opened), and follow along when an answer / image lands —
  // unless the person has scrolled up to read something older.
  const statusKey = turns.map((t) => t.status).join(',')
  const prevLenRef = useRef(0)
  useLayoutEffect(() => {
    const grew = turns.length > prevLenRef.current
    prevLenRef.current = turns.length
    const doc = document.documentElement
    const nearBottom = () => doc.scrollHeight - (window.scrollY + window.innerHeight) < 360
    if (!grew && !nearBottom()) return
    const toBottom = () => window.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' })
    requestAnimationFrame(toBottom)
    // Media grows the page once it has loaded — follow it down once more.
    const id = setTimeout(() => nearBottom() && toBottom(), 700)
    return () => clearTimeout(id)
  }, [turns.length, statusKey])

  // Save the thread (debounced) — first save creates the chat, later ones update it.
  // Skips saves when nothing changed (so just opening an old chat doesn't
  // bump it to the top of History), and catches up on anything that changed
  // while the very first save was still creating the chat.
  const lastSavedRef = useRef('')
  const latestRef = useRef('')
  useEffect(() => {
    if (!turns.length) return
    const json = JSON.stringify(turns.map(serializeTurn))
    latestRef.current = json
    if (json === lastSavedRef.current) return
    const id = setTimeout(async () => {
      try {
        if (chatIdRef.current) {
          await api.put(`/ai/chats/${chatIdRef.current}`, { turns: JSON.parse(json) })
          lastSavedRef.current = json
        } else if (!creatingRef.current) {
          creatingRef.current = api.post('/ai/chats', { turns: JSON.parse(json) })
          const created = await creatingRef.current
          chatIdRef.current = created.id
          setChatId(created.id)
          lastSavedRef.current = json
          creatingRef.current = null
          if (latestRef.current !== json) {
            await api.put(`/ai/chats/${created.id}`, { turns: JSON.parse(latestRef.current) })
            lastSavedRef.current = latestRef.current
          }
        }
      } catch {
        creatingRef.current = null /* saving is best-effort; the next change retries */
      }
    }, 700)
    return () => clearTimeout(id)
  }, [turns])

  const newChat = () => {
    setTurns([])
    setChatId(null)
    chatIdRef.current = null
    creatingRef.current = null
    lastSavedRef.current = ''
    setText('')
    setIntentPick(null)
    setRefImg(null)
    composerRef.current?.querySelector('textarea')?.focus()
  }

  const openChat = async (id) => {
    try {
      const chat = await api.get(`/ai/chats/${id}`)
      const restored = (chat.turns || []).map(restoreTurn)
      turnSeq = Math.max(turnSeq, ...restored.map((t) => t.id || 0))
      chatIdRef.current = chat.id
      creatingRef.current = null
      lastSavedRef.current = JSON.stringify(restored.map(serializeTurn))
      setChatId(chat.id)
      setTurns(restored)
      setText('')
      setIntentPick(null)
      setHistoryOpen(false)
    } catch (e) {
      showToast(`Couldn’t open that chat — ${e.message}`)
    }
  }

  const patchTurn = (id, patch) => setTurns((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const addTokens = (n) => n && setSessionTokens((t) => t + n)

  // Poll running video jobs.
  useEffect(() => {
    const running = turns.filter((t) => t.status === 'working' && t.kind === 'video' && t.jobId)
    if (!running.length) return
    const id = setTimeout(async () => {
      for (const t of running) {
        try {
          const res = await api.get(`/ai/video/${t.jobId}`)
          if (res.status === 'succeeded' && res.video) {
            patchTurn(t.id, { status: 'done', video: res.video, tokens: res.total_tokens })
            addTokens(res.total_tokens)
            refreshCounts()
          } else if (res.status === 'failed') {
            patchTurn(t.id, { status: 'failed', error: res.error || 'Render failed.' })
          }
        } catch {
          /* transient — next poll */
        }
      }
    }, 3000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns])

  const run = async (turn) => {
    patchTurn(turn.id, { status: 'working', error: '', video: null, startedAt: Date.now() })
    try {
      if (turn.kind === 'ask') {
        const res = await api.post('/ai/advisor', {
          message: turn.prompt,
          history: turn.history || [],
          brand_id: turn.brandId,
        })
        patchTurn(turn.id, {
          status: 'done',
          answer: res.answer,
          suggestions: res.suggestions || [],
          remaining: res.remaining_today,
        })
      } else if (turn.kind === 'image') {
        const res = await api.post('/ai/image', {
          prompt: turn.prompt,
          aspect_ratio: turn.ratio,
          brand_id: turn.brandId,
          reference_url: turn.refUrl || '',
        })
        patchTurn(turn.id, { status: 'done', video: res.video, tokens: res.total_tokens })
        addTokens(res.total_tokens)
        refreshCounts()
      } else {
        const res = await api.post('/ai/video', {
          prompt: turn.prompt,
          aspect_ratio: turn.ratio,
          seconds: turn.seconds,
          brand_id: turn.brandId,
        })
        patchTurn(turn.id, { jobId: res.id })
      }
    } catch (e) {
      patchTurn(turn.id, { status: 'failed', error: e.message })
    }
  }

  const intent = intentPick || (looksLikeQuestion(text) ? 'ask' : 'create')

  const ask = (message) => {
    // The last few Q&A pairs, so follow-ups ("and on TikTok?") make sense.
    const history = turns
      .filter((t) => t.kind === 'ask' && t.status === 'done')
      .slice(-4)
      .flatMap((t) => [
        { role: 'user', content: t.prompt },
        { role: 'assistant', content: t.answer },
      ])
    const turn = {
      id: ++turnSeq,
      kind: 'ask',
      prompt: message,
      history,
      brandId: brandObj?.id ?? null,
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    run(turn)
  }

  const generateSuggestion = (sug) => {
    const kind = sug.type === 'video' ? 'video' : 'image'
    const turn = {
      id: ++turnSeq,
      prompt: sug.prompt,
      kind,
      ratio: kind === 'video' ? '9:16' : isImage ? ratio : '1:1',
      seconds,
      brandId: brandObj?.id ?? null,
      brandName: brandObj?.name || '',
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    run(turn)
  }

  const send = () => {
    const prompt = text.trim()
    if (uploading || writing || !prompt) return
    if (intent === 'ask') {
      setText('')
      setIntentPick(null)
      ask(prompt)
      return
    }
    if (prompt.length < 10) {
      showToast('Write a little more — at least 10 characters')
      return
    }
    setIntentPick(null)
    const turn = {
      id: ++turnSeq,
      prompt,
      kind: type,
      ratio,
      seconds,
      brandId: brandObj?.id ?? null,
      brandName: brandObj?.name || '',
      refUrl: refImg?.url || '',
      refPreview: refImg?.previewUrl || '',
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    setText('')
    setRefImg(null)
    run(turn)
  }

  const writeForMe = async () => {
    const idea = text.trim()
    if (!idea || writing) return
    setWriting(true)
    try {
      const res = await api.post('/ai/prompt', {
        brand: brandObj?.name || '',
        brand_language: brandObj?.lang || '',
        brand_id: brandObj?.id ?? null,
        type,
        template,
        aspect_ratio: ratio,
        style,
        topic: idea,
        has_reference: isImage && !!refImg,
      })
      setText(res.prompt)
      addTokens(res.total_tokens)
      showToast('Prompt written — review it, then send')
    } catch (e) {
      showToast(`Couldn’t write the prompt — ${e.message}`)
    } finally {
      setWriting(false)
      composerRef.current?.querySelector('textarea')?.focus()
    }
  }

  // A reference image from the 📎 button, a paste (Ctrl+V a screenshot) or a
  // drop onto the composer. Shown straight away from the local file while it
  // uploads; references only drive *image* generation, so attaching one
  // switches the composer to Create · Image.
  const [dragging, setDragging] = useState(false)
  const attachFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Reference must be an image')
    if (type !== 'image') {
      chooseType('image')
      showToast('Reference images work with image generation — switched to Image')
    }
    setIntentPick('create')
    const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.png`
    const previewUrl = URL.createObjectURL(file)
    setRefImg({ previewUrl, url: null, name })
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file, name)
      const up = await api.upload('/media/upload', fd)
      setRefImg((cur) => (cur?.previewUrl === previewUrl ? { ...cur, url: up.url } : cur))
    } catch (err) {
      setRefImg((cur) => (cur?.previewUrl === previewUrl ? null : cur))
      showToast(`Upload failed — ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const attach = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    attachFile(file)
  }

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    if (!item) return // plain text paste — leave it alone
    e.preventDefault()
    attachFile(item.getAsFile())
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
    if (file) attachFile(file)
    else if (e.dataTransfer?.files?.length) showToast('Reference must be an image')
  }

  const chooseType = (t) => {
    setType(t)
    setRatio(t === 'image' ? '1:1' : '9:16')
    setTemplate(TEMPLATES[t][0])
    if (t === 'video') setRefImg(null)
  }

  const useInPost = (turn) => {
    handoff.set({
      name: turn.video.filename,
      size: 0,
      kind: isImageUrl(turn.video.url) ? 'image' : 'video',
      url: `${mediaBase}${turn.video.url}`,
      videoId: turn.video.id,
    })
    navigate('/new')
  }

  const editPrompt = (turn) => {
    setText(turn.prompt)
    chooseType(turn.kind)
    setRatio(turn.ratio)
    composerRef.current?.querySelector('textarea')?.focus()
  }

  const regenerate = (turn) => {
    const again = { ...turn, id: ++turnSeq, status: 'working', video: null, jobId: null, startedAt: Date.now() }
    setTurns((list) => [...list, again])
    run(again)
  }

  const canSend = (intent === 'ask' ? text.trim().length >= 2 : text.trim().length >= 10) && !uploading && !writing

  return (
    // Fills the screen below the top bar, so the composer always sits at the
    // bottom — even when the thread is short or empty.
    <div className="w-full px-5 lg:px-10 animate-fadein flex flex-col min-h-[calc(100dvh-7.5rem)] lg:min-h-[calc(100dvh-3.5rem)]">
      {/* Page header — pinned under the top bar while the thread scrolls. */}
      <div className="sticky top-14 z-20 -mx-5 lg:-mx-10 px-5 lg:px-10 bg-[#F4F6F9]/90 backdrop-blur-md">
        <div className="mx-auto w-full lg:w-4/5 flex items-center justify-between gap-3 py-4">
          <div>
            <h1 className="text-[22px] font-bold text-ink-900 tracking-tight leading-tight">AI Agent</h1>
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              Ask about your marketing, or describe an image or video to create.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {sessionTokens > 0 && (
              <span className="mr-2 hidden sm:inline text-[11px] text-ink-400" title="Provider tokens used on this page since you opened it">
                {fmtTok(sessionTokens)} tokens this session
              </span>
            )}
            <button
              type="button"
              onClick={newChat}
              disabled={!turns.length}
              title="New chat"
              aria-label="New chat"
              className="h-9 w-9 rounded-xl grid place-items-center text-ink-600 hover:bg-white hover:shadow-sm hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none transition"
            >
              <FiPlus size={18} />
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="History"
              aria-label="History"
              className={`h-9 w-9 rounded-xl grid place-items-center transition ${
                historyOpen ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-white hover:shadow-sm hover:text-brand'
              }`}
            >
              <FiClock size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* The chat column — 80% of the page on desktop, centred. */}
      <div className="mx-auto w-full lg:w-4/5 flex-1">
        <div className="mt-2 space-y-8 pb-6">
          {turns.length === 0 && (
            <div className="pt-[14vh] pb-4 text-center">
              <h2 className="text-[22px] font-semibold text-ink-900 tracking-tight">How can I help?</h2>
              <div className="mt-6 flex flex-nowrap justify-center gap-2 overflow-x-auto side-scroll pb-1">
                {[
                  { label: 'How’s my engagement?', text: QUESTIONS[0], pick: 'ask' },
                  { label: 'What to post next week?', text: QUESTIONS[1], pick: 'ask' },
                  { label: isImage ? 'Product hero shot' : 'Product intro video', text: SUGGESTIONS[type][0], pick: 'create' },
                  { label: isImage ? 'Weekend sale banner' : 'Cinematic B-roll', text: SUGGESTIONS[type][1], pick: 'create' },
                ].map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => {
                      setText(s.text)
                      setIntentPick(s.pick)
                      composerRef.current?.querySelector('textarea')?.focus()
                    }}
                    title={s.text}
                    className="flex-none inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] text-ink-600 hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    {s.pick === 'ask' ? (
                      <FiMessageCircle size={12} className="flex-none text-ink-400" />
                    ) : (
                      <span className="flex-none text-brand text-[11px] leading-none">✦</span>
                    )}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) =>
            t.kind === 'ask' ? (
              <AskTurn
                key={t.id}
                t={t}
                onRetry={() => regenerate(t)}
                onGenerate={generateSuggestion}
                onEdit={() => {
                  setText(t.prompt)
                  setIntentPick('ask')
                  composerRef.current?.querySelector('textarea')?.focus()
                }}
              />
            ) : (
            <Turn
              key={t.id}
              t={t}
              onUse={() => useInPost(t)}
              onEdit={() => editPrompt(t)}
              onRegenerate={() => regenerate(t)}
              onLibrary={() => navigate('/library')}
            />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* composer */}
      <div className="sticky bottom-16 lg:bottom-0 z-20 -mx-5 lg:-mx-10 px-5 lg:px-10 pb-5 pt-6 bg-gradient-to-t from-[#F4F6F9] via-[#F4F6F9] to-transparent">
        <div
          ref={composerRef}
          onDragOver={(e) => {
            if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
          }}
          onDrop={onDrop}
          className={`relative mx-auto w-full lg:w-4/5 rounded-3xl border bg-white shadow-[0_8px_30px_rgba(16,24,40,0.08)] transition-colors ${
            dragging ? 'border-brand ring-4 ring-brand/15' : 'border-ink-200 focus-within:border-brand/40'
          }`}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl bg-brand-soft/80 text-[13px] font-semibold text-brand">
              Drop the image to use it as a reference
            </div>
          )}

          {refImg && (
            <div className="px-4 pt-4">
              <div className="group relative w-[104px] h-[104px] overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-200">
                <img src={refImg.previewUrl} alt="Reference" className="h-full w-full object-cover" />
                {uploading && !refImg.url && (
                  <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-[1px]">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                  </div>
                )}
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">
                  Reference
                </span>
                <button
                  type="button"
                  onClick={() => setRefImg(null)}
                  title="Remove reference"
                  aria-label="Remove reference"
                  className="absolute right-1.5 top-1.5 h-6 w-6 rounded-full grid place-items-center bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 transition"
                >
                  <FiX size={13} />
                </button>
              </div>
            </div>
          )}

          <AutoTextarea
            autoFocus
            minRows={1}
            maxRows={10}
            value={text}
            disabled={writing}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) send()
              }
            }}
            placeholder={
              writing
                ? 'Writing your prompt…'
                : `Ask about your marketing, or describe the ${isImage ? 'image' : 'video'} you want…`
            }
            className="block w-full border-0 bg-transparent px-5 pt-4 pb-2 text-[13.5px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-0 disabled:opacity-60"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5">
            {/* settings */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className={`h-9 pl-2.5 pr-3 rounded-full inline-flex items-center gap-2 text-[12px] font-medium transition-colors ${
                  settingsOpen ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-100'
                }`}
                title="Settings"
              >
                <FiSliders size={15} />
                <span className="hidden sm:inline">
                  {isImage ? 'Image' : `Video · ${seconds}s`} · {ratio}
                </span>
              </button>
              {settingsOpen && (
                <SettingsPopover
                  type={type}
                  setType={chooseType}
                  ratio={ratio}
                  setRatio={setRatio}
                  seconds={seconds}
                  setSeconds={setSeconds}
                  brands={brands}
                  brand={brandObj?.slug}
                  setBrand={setBrand}
                  style={style}
                  setStyle={setStyle}
                  template={template}
                  setTemplate={setTemplate}
                />
              )}
            </div>

            {intent === 'create' && (
              <label
                className="h-9 w-9 rounded-full grid place-items-center text-ink-600 hover:bg-ink-100 cursor-pointer"
                title="Attach a reference image — or paste / drop one into the box"
              >
                <input type="file" accept="image/*" className="hidden" onChange={attach} />
                <FiPaperclip size={15} />
              </label>
            )}

            {intent === 'create' && (
            <button
              type="button"
              onClick={writeForMe}
              disabled={!text.trim() || writing}
              className="h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-600 hover:bg-brand-soft hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-600"
              title="Turn your idea into a detailed prompt using this brand's products"
            >
              {writing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
              ) : (
                <span className="text-brand">✦</span>
              )}
              <span className="hidden sm:inline">{writing ? 'Writing…' : 'Write it for me'}</span>
            </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <div
                className="inline-flex h-8 rounded-full bg-ink-100 p-0.5"
                role="radiogroup"
                aria-label="Ask a question or create media"
                title={intentPick ? 'Chosen by you' : 'Picked automatically from what you typed — click to switch'}
              >
                {[
                  { id: 'ask', label: 'Ask', icon: <FiMessageCircle size={12} /> },
                  { id: 'create', label: 'Create', icon: <span className="text-[11px] leading-none">✦</span> },
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={intent === o.id}
                    onClick={() => setIntentPick(o.id)}
                    className={`px-2.5 rounded-full inline-flex items-center gap-1 text-[11.5px] font-semibold transition-colors ${
                      intent === o.id ? 'bg-white text-brand shadow-sm' : 'text-ink-500 hover:text-ink-800'
                    }`}
                  >
                    {o.icon}
                    {o.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="h-9 w-9 rounded-full grid place-items-center bg-brand text-white hover:bg-brand-dark disabled:bg-ink-200 disabled:text-ink-400 transition-colors"
                title={intent === 'ask' ? 'Ask (Enter)' : 'Generate (Enter)'}
                aria-label={intent === 'ask' ? 'Ask' : 'Generate'}
              >
                <FiArrowUp size={17} />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-ink-400">
          Enter to send · Shift + Enter for a new line · answers use your own brands, products and post numbers
        </p>
      </div>

      {historyOpen && (
        <HistoryDrawer
          currentId={chatId}
          onOpen={openChat}
          onClose={() => setHistoryOpen(false)}
          onDeleted={(id) => {
            if (id === chatIdRef.current) newChat()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function dayGroup(iso) {
  const d = new Date(iso)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const diff = (start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return 'Previous 7 days'
  if (diff < 30) return 'Previous 30 days'
  return 'Older'
}

function HistoryDrawer({ currentId, onOpen, onClose, onDeleted, showToast }) {
  const [chats, setChats] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .get(`/ai/chats${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setChats)
        .catch(() => setChats([]))
    }, q ? 250 : 0)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remove = async (chat) => {
    setChats((list) => (list || []).filter((c) => c.id !== chat.id))
    try {
      await api.del(`/ai/chats/${chat.id}`)
      onDeleted(chat.id)
      showToast('Chat deleted')
    } catch (e) {
      showToast(`Couldn’t delete — ${e.message}`)
    }
  }

  const groups = []
  for (const c of chats || []) {
    const label = dayGroup(c.updated_at)
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(c)
    else groups.push({ label, items: [c] })
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-ink-950/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[360px] max-w-[92vw] bg-white shadow-drawer animate-drawer-in flex flex-col">
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold text-ink-900">History</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="h-8 w-8 rounded-lg grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <FiX size={16} />
          </button>
        </header>
        <div className="px-5 pb-3">
          <div className="relative">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats"
              className="w-full h-9 rounded-xl border border-ink-200 bg-ink-50/60 pl-9 pr-3 text-[12.5px] focus:outline-none focus:border-brand/40 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-5">
          {chats === null ? (
            <div className="space-y-2 px-2 pt-2">
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="h-9 rounded-lg skeleton" />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="px-4 pt-10 text-center text-[12.5px] text-ink-400">
              {q ? `No chats match “${q}”` : 'No chats yet — your conversations will show up here.'}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mt-3 first:mt-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-ink-400">{g.label}</div>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
                      c.id === currentId ? 'bg-brand-soft' : 'hover:bg-ink-50'
                    }`}
                    onClick={() => onOpen(c.id)}
                  >
                    <span className="flex-none text-ink-400">
                      {c.has_media ? <FiImage size={14} /> : <FiMessageCircle size={14} />}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] ${
                        c.id === currentId ? 'font-semibold text-brand' : 'text-ink-800'
                      } ${/[\u1780-\u17FF]/.test(c.title) ? 'font-khmer' : ''}`}
                    >
                      {c.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(c)
                      }}
                      title="Delete chat"
                      aria-label="Delete chat"
                      className="flex-none h-7 w-7 rounded-md grid place-items-center text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

const ASK_STAGES = [
  [4, 'Reading your brands and products…'],
  [10, 'Pulling your latest post numbers…'],
  [18, 'Looking for what works…'],
  [Infinity, 'Writing your advice…'],
]

function AskTurn({ t, onRetry, onGenerate, onEdit }) {
  const [copied, setCopied] = useState(false)
  const elapsed = t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0
  const stage = ASK_STAGES.find(([s]) => elapsed < s)[1]
  const khmer = (x) => (/[\u1780-\u17FF]/.test(x || '') ? 'font-khmer' : '')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.answer || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4 animate-fadein">
      <div className="flex flex-col items-end">
        <div className={`max-w-[70%] rounded-2xl rounded-br-md bg-brand-soft/70 px-4 py-2.5 text-[13px] leading-relaxed text-ink-900 whitespace-pre-wrap ${khmer(t.prompt)}`}>
          {t.prompt}
        </div>
        <div className="mt-1 flex items-center text-ink-400">
          <IconBtn title="Edit question" onClick={onEdit}>
            <FiEdit2 size={13} />
          </IconBtn>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-8 h-8 flex-none rounded-xl grid place-items-center bg-brand text-white text-[13px] font-bold shadow-sm">
          C
        </span>
        <div className="min-w-0 flex-1 max-w-[860px]">
          {t.status === 'working' && (
            <div className="inline-flex items-center gap-2.5 pt-1.5 text-[12.5px] text-ink-500">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              {stage}
            </div>
          )}

          {t.status === 'failed' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
              <b>Couldn’t answer.</b> {t.error}
              <button type="button" onClick={onRetry} className="ml-2 font-semibold text-brand hover:underline">
                Try again
              </button>
            </div>
          )}

          {t.status === 'done' && (
            <>
              <div className={`pt-1 ${khmer(t.answer)}`}>
                <Markdown text={t.answer} />
              </div>

              {t.suggestions?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                    Make one of these now
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.suggestions.map((sug) => (
                      <button
                        key={sug.label}
                        type="button"
                        onClick={() => onGenerate(sug)}
                        title={sug.prompt}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-white px-3.5 py-1.5 text-[12px] font-medium text-brand hover:bg-brand-soft transition-colors"
                      >
                        <span>✦</span>
                        {sug.type === 'video' ? <FiVideo size={12} /> : <FiImage size={12} />}
                        {sug.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-1.5 flex items-center gap-1 text-ink-400">
                <IconBtn title={copied ? 'Copied' : 'Copy answer'} onClick={copy}>
                  {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
                </IconBtn>
                <IconBtn title="Ask again" onClick={onRetry}>
                  <FiRefreshCw size={13} />
                </IconBtn>
                {typeof t.remaining === 'number' && t.remaining <= 10 && (
                  <span className="ml-1 text-[10.5px]">{t.remaining} questions left today</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Just enough markdown for the advisor's answers: ## headings, - / 1.
// bullets, **bold**, paragraphs. Rendered as React nodes — never as HTML.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

function Markdown({ text }) {
  const blocks = []
  let list = null
  const flush = () => {
    if (list) blocks.push(list)
    list = null
  }
  ;(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      if (!list) list = { type: 'list', ordered: /^\s*\d/.test(line), items: [], key: i }
      list.items.push(bullet[1])
      return
    }
    flush()
    if (!line.trim()) return
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    blocks.push(heading ? { type: 'h', text: heading[1], key: i } : { type: 'p', text: line, key: i })
  })
  flush()

  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed text-ink-700">
      {blocks.map((b) =>
        b.type === 'h' ? (
          <h3 key={b.key} className="pt-1 text-[13.5px] font-semibold text-ink-900">
            {inline(b.text)}
          </h3>
        ) : b.type === 'p' ? (
          <p key={b.key}>{inline(b.text)}</p>
        ) : b.ordered ? (
          <ol key={b.key} className="list-decimal space-y-1 pl-5 marker:text-ink-400">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={b.key} className="list-disc space-y-1 pl-5 marker:text-brand/60">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

function Turn({ t, onUse, onEdit, onRegenerate, onLibrary }) {
  const [expanded, setExpanded] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [copied, setCopied] = useState(false)
  const long = t.prompt.length > 320
  const elapsed = t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0
  const pct =
    t.kind === 'image'
      ? Math.min(92, 100 * (1 - Math.exp(-elapsed / (IMG_ETA / 2.3))))
      : Math.min(95, (elapsed / VID_ETA) * 100)
  const stage =
    t.kind === 'image'
      ? elapsed < 3 ? 'Sending your prompt…' : elapsed < 12 ? 'Composing the image…' : elapsed < 22 ? 'Adding detail and lighting…' : 'Almost there…'
      : t.jobId ? 'Rendering your video… usually 1–3 minutes' : 'Starting the render…'
  const shape =
    t.ratio === '16:9' ? 'aspect-video w-full max-w-[560px]' : t.ratio === '1:1' ? 'aspect-square w-full max-w-[400px]' : 'aspect-[9/16] w-full max-w-[280px]'
  const url = t.video ? `${mediaBase}${t.video.url}` : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4 animate-fadein">
      {/* your prompt */}
      <div className="flex flex-col items-end">
        <div className="max-w-[70%] rounded-2xl rounded-br-md bg-brand-soft/70 px-4 py-2.5 text-[13px] leading-relaxed text-ink-900 whitespace-pre-wrap">
          {t.refPreview && <img src={t.refPreview} alt="" className="mb-2 w-20 h-20 rounded-lg object-cover" />}
          {long && !expanded ? `${t.prompt.slice(0, 320).trimEnd()}…` : t.prompt}
          {long && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="ml-1 text-[12px] font-semibold text-brand">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-0.5 text-ink-400">
          <span className="mr-1.5 text-[10.5px]">
            {t.kind === 'image' ? 'Image' : `Video · ${t.seconds}s`} · {t.ratio}
            {t.brandName ? ` · ${t.brandName}` : ''}
          </span>
          <IconBtn title={copied ? 'Copied' : 'Copy prompt'} onClick={copy}>
            {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
          </IconBtn>
          <IconBtn title="Edit prompt" onClick={onEdit}>
            <FiEdit2 size={13} />
          </IconBtn>
        </div>
      </div>

      {/* result */}
      <div className="flex flex-col items-start">
        {t.status === 'working' && (
          <div className={shape}>
            <GeneratingCanvas kind={t.kind} stage={stage} />
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand/15">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
              <span className="tabular-nums font-semibold text-ink-700">{Math.round(pct)}%</span>
              <span className="tabular-nums text-ink-400">{Math.round(elapsed)}s</span>
            </div>
          </div>
        )}

        {t.status === 'failed' && (
          <div className="max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
            <b>Couldn’t generate.</b> {t.error}
            <button type="button" onClick={onRegenerate} className="ml-2 font-semibold text-brand hover:underline">
              Try again
            </button>
          </div>
        )}

        {t.status === 'done' && url && (
          <>
            {isImageUrl(t.video.url) ? (
              <button
                type="button"
                onClick={() => setViewing(true)}
                title="View full size"
                className={`group relative block ${shape.replace(/aspect-\S+/, '')} cursor-zoom-in rounded-2xl`}
              >
                <img
                  src={url}
                  alt=""
                  className="block w-full h-auto rounded-2xl ring-1 ring-ink-900/10 bg-ink-50 animate-media-reveal transition group-hover:brightness-95"
                />
                <span className="absolute right-2.5 top-2.5 h-8 w-8 rounded-full grid place-items-center bg-black/45 text-white opacity-0 group-hover:opacity-100 transition">
                  <FiMaximize2 size={14} />
                </span>
              </button>
            ) : (
              <div className={`group relative ${shape.replace(/aspect-\S+/, '')}`}>
                <video
                  src={url}
                  controls
                  playsInline
                  className="block w-full h-auto rounded-2xl bg-ink-900 ring-1 ring-ink-900/10 animate-media-reveal"
                />
                <button
                  type="button"
                  onClick={() => setViewing(true)}
                  title="View full size"
                  aria-label="View full size"
                  className="absolute right-2.5 top-2.5 h-8 w-8 rounded-full grid place-items-center bg-black/45 text-white opacity-0 group-hover:opacity-100 transition"
                >
                  <FiMaximize2 size={14} />
                </button>
              </div>
            )}
            {viewing && (
              <MediaViewer
                url={url}
                isImage={isImageUrl(t.video.url)}
                filename={t.video.filename}
                onUse={() => {
                  setViewing(false)
                  onUse()
                }}
                onClose={() => setViewing(false)}
              />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={onUse}
                className="h-8 px-3 rounded-full bg-brand text-white text-[12px] font-semibold hover:bg-brand-dark transition-colors"
              >
                Use in a post →
              </button>
              <IconBtn title="Regenerate" onClick={onRegenerate}>
                <FiRefreshCw size={14} />
              </IconBtn>
              <a
                href={url}
                download={t.video.filename}
                title="Download"
                className="h-8 w-8 rounded-full grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              >
                <FiDownload size={14} />
              </a>
              <button type="button" onClick={onLibrary} className="ml-1 text-[11px] text-ink-400 hover:text-brand">
                Saved to Library
                {t.tokens ? ` · ${fmtTok(t.tokens)} tok` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// The placeholder while a render runs: drifting brand-colour smoke, the
// ContentFlow mark floating in the middle with puffs rising off it, and a
// shimmer sweep (keyframes: index.css, "cf-*").
const PUFFS = [
  { delay: '0s', drift: '-26px' },
  { delay: '0.9s', drift: '18px' },
  { delay: '1.8s', drift: '-8px' },
  { delay: '2.7s', drift: '30px' },
]

function GeneratingCanvas({ kind, stage }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#E8F1FB] ring-1 ring-brand/10">
      <div className="cf-smoke cf-smoke-a" />
      <div className="cf-smoke cf-smoke-b" />
      <div className="cf-smoke cf-smoke-c" />
      <div className="cf-sweep" />

      {PUFFS.map((p) => (
        <span key={p.delay} className="cf-puff" style={{ animationDelay: p.delay, '--drift': p.drift }} />
      ))}

      <div className="absolute inset-0 grid place-items-center">
        <div className="cf-float flex flex-col items-center">
          <div className="relative">
            <span className="cf-halo absolute -inset-4 rounded-[28px] bg-white/70 blur-md" />
            <span className="relative w-14 h-14 rounded-2xl grid place-items-center bg-brand text-white text-[22px] font-bold shadow-[0_10px_30px_rgba(26,111,196,.45)]">
              C
            </span>
          </div>
          <span className="mt-3 text-[14px] font-bold tracking-tight text-ink-900/80">ContentFlow</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="mx-auto w-fit max-w-full truncate rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-ink-700 backdrop-blur-sm">
          {kind === 'image' ? '✦ ' : '▶ '}
          {stage}
        </div>
      </div>
    </div>
  )
}

// Full-size view of a generated image/video: dark backdrop, media fitted to
// the screen, and the same actions as the chat row.
function MediaViewer({ url, isImage, filename, onUse, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink-950/90 animate-fadein" onClick={onClose}>
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onUse}
          className="h-9 px-4 rounded-full bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-dark transition-colors"
        >
          Use in a post →
        </button>
        <a
          href={url}
          download={filename}
          title="Download"
          aria-label="Download"
          className="h-9 w-9 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20"
        >
          <FiDownload size={16} />
        </a>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className="h-9 w-9 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20"
        >
          <FiX size={18} />
        </button>
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-16">
        {isImage ? (
          <img
            src={url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl animate-media-reveal"
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl shadow-2xl"
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

function IconBtn({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-8 w-8 rounded-full grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-ink-800"
    >
      {children}
    </button>
  )
}

function SettingsPopover({
  type, setType, ratio, setRatio, seconds, setSeconds, brands, brand, setBrand, style, setStyle, template, setTemplate,
}) {
  const seg = (on) =>
    `flex-1 h-8 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
      on ? 'bg-white text-brand shadow-sm' : 'text-ink-600 hover:text-ink-900'
    }`
  const chip = (on) =>
    `h-8 px-2.5 rounded-lg border text-[11.5px] font-medium transition-colors ${
      on ? 'border-brand/40 bg-brand-soft text-brand' : 'border-ink-200 text-ink-600 hover:border-ink-300'
    }`
  return (
    <div className="absolute bottom-full left-0 mb-2 w-[330px] max-w-[calc(100vw-40px)] rounded-2xl border border-ink-200 bg-white p-4 shadow-pop animate-fadein space-y-4">
      <div className="flex rounded-xl bg-ink-100 p-1">
        <button type="button" className={seg(type === 'image')} onClick={() => setType('image')}>
          <FiImage size={14} /> Image
        </button>
        <button type="button" className={seg(type === 'video')} onClick={() => setType('video')}>
          <FiVideo size={14} /> Video
        </button>
      </div>

      <Setting label="Size">
        <div className="grid grid-cols-3 gap-1.5">
          {RATIOS.map((r) => (
            <button key={r.id} type="button" onClick={() => setRatio(r.id)} className={`${chip(ratio === r.id)} h-auto py-1.5 text-left`}>
              <div className="font-semibold">{r.id}</div>
              <div className="text-[10px] text-ink-400 leading-tight">{r.sub}</div>
            </button>
          ))}
        </div>
      </Setting>

      {type === 'video' && (
        <Setting label="Length">
          <div className="flex gap-1.5">
            {LENGTHS.map((n) => (
              <button key={n} type="button" onClick={() => setSeconds(n)} className={chip(seconds === n)}>
                {n}s
              </button>
            ))}
          </div>
        </Setting>
      )}

      <Setting label="Brand">
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <button key={b.slug} type="button" onClick={() => setBrand(b.slug)} className={`${chip(brand === b.slug)} inline-flex items-center gap-1.5`}>
              <span className="w-2 h-2 rounded-full" style={{ background: colorForBrand(b.slug) }} />
              {b.name}
            </button>
          ))}
        </div>
      </Setting>

      <div className="border-t border-ink-100 pt-3">
        <div className="mb-2 text-[10.5px] text-ink-400">Used when ✦ writes the prompt for you</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-[11.5px] text-ink-700 focus:outline-none focus:border-brand"
          >
            {TEMPLATES[type].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-[11.5px] text-ink-700 focus:outline-none focus:border-brand"
          >
            {STYLES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function Setting({ label, children }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      {children}
    </div>
  )
}
