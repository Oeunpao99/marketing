import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  FiArrowUp,
  FiSquare,
  FiCheck,
  FiClock,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiImage,
  FiLayers,
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
import Select from '../components/ui/Select'
import GeneratingCanvas from '../components/ui/GeneratingCanvas'
import { MotionMaking, motionPercent, motionStage } from '../components/studio/MotionBoard'
import StoryboardEditor from '../components/studio/StoryboardEditor'
import StoryEditor from '../components/story/StoryEditor'
import { handoff } from '../lib/handoff'
import { trackJob, untrackJob } from '../lib/genJobs'
import { fmtUSD } from '../lib/money'
import { PILLAR_LABELS, pillarChipClass } from '../lib/angles'
import { kitSrc, TemplatePicker } from '../components/brandkit/BrandKit'
import { MOTION_OFF_TIP, useMotionReady } from '../lib/motionStatus'
import WriterModelSelect, { useWriterModels, writerHint } from '../components/studio/WriterModelSelect'
import { aiModelStore } from '../api/client'
import { MOTION_TEMPLATES, previewSrc } from '../lib/motionTemplates'
import MakingDrawer from '../components/studio/MakingDrawer'
import { backupName, useVoiceStatus } from '../lib/voiceStatus'
import { useBrandMarks } from '../lib/brandMarks'

// AI Agent — one chat for both asking and creating. A message that reads
// like a question ("how is my engagement?", "what should I post next?") goes
// to the marketing advisor (app/advisor.py), which answers from the
// workspace's own data and suggests posts; anything else is a prompt and is
// generated as an image/video. The composer shows which one it will do, and
// one click flips it. The page is a thread of turns and one composer;
// every option (type, size, length, brand, style) lives behind the settings
// button, and ✦ "Write it for me" turns a short idea into a full prompt
// grounded in the brand's products (the old guided brief, in one click).
// Video has two modes: an instant clip (one 4-12s render), or a storyboard
// (app/story.py) — a 16-64s video the AI scripts scene by scene, shown in the
// chat to edit, render, redo and join into one MP4.

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''

const RATIOS = [
  { id: '9:16', sub: 'Reels · TikTok · Shorts' },
  { id: '1:1', sub: 'Feed square' },
  { id: '16:9', sub: 'YouTube · landscape' },
]
// Sora 2 only renders 4 / 8 / 12-second clips (Veo: 4 / 6 / 8 — 12 becomes 8).
const LENGTHS = [4, 8, 12]
const STORY_LENGTHS = [16, 24, 32, 48, 64]
const VOICES = ['English', 'Khmer', 'Khmer + English']
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
const IMG_ETA = 30
const VID_ETA = 150
// Motion videos (app/motion.py): script + photos + render, about a minute.
const MOTION_ETA = 240 // ~60 s stories with a voice-over — 2–4 minutes
const MOTION_LANGS = ['Khmer', 'English']
// Narrator for motion videos (Azure Speech): Sreymom / Piseth in Khmer, Ava / Andrew in English.
const MOTION_VOICES = [
  ['female', 'Female'],
  ['male', 'Male'],
  ['none', 'Off'],
]
const MAX_REFS = 6 // screenshots one Remotion video can take (app/motion.py MAX_ATTACHED)
const MAX_IMAGE_REFS = 4 // pictures one image can build on (app/video.py ImageIn.reference_urls)
const isImageUrl = (url) => /\.(png|jpe?g|webp|gif)$/i.test(url || '')

let turnSeq = 0
const OPEN_CHAT = 'contentflow.openChat'

// What gets saved per turn (app/chats.py stores it as-is). Blob previews
// can't outlive the page, so a reference image is kept by its /media url.
function serializeTurn(t) {
  return {
    id: t.id,
    kind: t.kind,
    prompt: t.prompt,
    ratio: t.ratio,
    shape: t.shape,
    seconds: t.seconds,
    brandId: t.brandId,
    brandName: t.brandName,
    refUrl: t.refUrl || '',
    refUrls: t.refUrls || [],
    refPreview: t.refUrl ? `${mediaBase}${t.refUrl}` : '',
    history: t.history,
    status: t.status,
    error: t.error || '',
    answer: t.answer,
    suggestions: t.suggestions,
    video: t.video || null,
    jobId: t.jobId || null,
    storyId: t.storyId || null,
    planId: t.planId || null, // a storyboard being written on the server (Review first)
    language: t.language ?? '',
    // Remotion: "Make one for me", and the product / voice / music it was made with
    auto: !!t.auto,
    productId: t.productId ?? null,
    voice: t.voice || undefined,
    music: t.music,
    goal: t.goal || undefined,
    // Remotion from the person's own story: the storyboard to review / that was made
    reviewFirst: !!t.reviewFirst,
    length: t.length || undefined,
    plan: t.plan || undefined,
    script: t.script || undefined,
    tokens: t.tokens || 0,
    cost: t.cost || 0,
    startedAt: t.startedAt,
  }
}

// Reopening a chat: an image/video still rendering on the server resumes
// polling (they finish server-side even with the page closed), and so does a
// storyboard still being written (planId); a question that was mid-answer
// can't be resumed.
function restoreTurn(t) {
  if (t.status !== 'working') return t
  if ((t.kind === 'video' || t.kind === 'image' || t.kind === 'motion') && t.jobId) return t
  if (t.kind === 'motion' && t.planId) return t
  return { ...t, status: 'failed', error: 'Interrupted when the page closed — try again.' }
}

// Remotion templates — one per kind of post (app/motion.py style_for). The
// weekly plan picks them from each post's content goal.
const MOTION_STORIES = [
  { value: 'auto', label: 'Auto · AI picks', hint: 'The AI reads your brief and picks the template — SaaS, training, a story with people, a promo…' },
  { value: 'training', label: 'Training · Presentation', hint: 'A team training or talk — chapters, key points, checklists, recap; 16:9 for screens, up to 10 min' },
  { value: 'custom', label: 'Designed for you', hint: 'A fresh look for this topic — your app screenshots zoomed and clicked' },
  { value: 'teach', label: 'Teach · Explainer', hint: 'Characters, charts, no selling — saves & shares' },
  { value: 'sell', label: 'Sell · Tech', hint: 'Problem, product working, proof — clicks & leads' },
  { value: 'versus', label: 'Compare · Myth vs fact', hint: 'Old way vs better way, a myth busted — builds authority' },
  { value: 'poll', label: 'Poll · Quiz', hint: 'A question, A/B/C answers, a countdown — gets comments' },
  { value: 'quote', label: 'Quote', hint: 'One strong line over your photo — wins followers' },
  { value: 'testimonial', label: 'Testimonial · Customer story', hint: 'A customer’s before → after — builds trust (real reviews only from your brief)' },
  { value: 'trend', label: 'AI News · Trend', hint: 'What’s new in AI and what it means for you — awareness' },
  { value: 'pov', label: 'POV · Relatable', hint: 'A “POV:” moment, the phone blowing up — reach and tags' },
  { value: 'countdown', label: 'Top 5 · Countdown', hint: 'Big numbers counting down 5 → 1, best one last — reach and saves' },
  { value: 'thisorthat', label: 'This or that', hint: 'A-or-B choices people answer in the comments — engagement' },
  { value: 'reviews', label: 'Review wall', hint: 'Rating, real reviews, your customers’ names — trust (only real ones from your brief)' },
  { value: 'tips', label: 'Tip cards', hint: 'Numbered tips people save — followers and education' },
  { value: 'hottake', label: 'Hot take', hint: 'A bold opinion — a belief struck out, then agree or disagree' },
  { value: 'casestudy', label: 'Case study', hint: 'One customer, before → after numbers, their quote (real ones only from your brief)' },
  { value: 'faq', label: 'FAQ', hint: 'Customers’ questions as chat bubbles, answers typing in' },
  { value: 'report', label: 'Data report', hint: 'Bars, a percent ring, numbers with their source' },
  { value: 'clarity', label: 'SaaS explainer', hint: 'Calm white and blue — the mess of tools today, your app in a frame, how it works' },
  { value: 'launch', label: 'Product launch', hint: 'A cinematic launch film — the one click that does the job, your screens stacking up, “Now live”' },
  { value: 'canvas', label: 'AI design (new)', hint: 'The AI designs every scene for your brief — its own colours, backgrounds, layout and motion; best for a brief with its own look, an event screen or a cinematic launch' },
  { value: 'techflow', label: 'Tech explainer', hint: 'How a technology works — devices, data packets travelling, an address, a lookup, the path, a checklist' },
  { value: 'gridcards', label: 'How it works · Grid', hint: 'Grid paper, navy and lime — the repetitive work, then one photo becoming a post, a price poster, a caption' },
  { value: 'unveil', label: 'Unveil · Launch (light)', hint: 'A light, elegant launch — one big word, the app card coming into focus, typing, a check with confetti' },
  { value: 'showcase', label: 'Showcase · SaaS promo', hint: 'Bright launch-video look — the apps it joins, its table and board views, a rolling word' },
  { value: 'demo', label: 'Product demo', hint: 'Your product in an app window, step by step — shows the solution' },
  { value: 'offer', label: 'Offer · Pricing', hint: 'A glowing pricing card and one clear action — conversion (prices only from your brief)' },
]
// The Story menu: each template with its preview picture (public/templates/,
// as in Content studio → Templates) so people see what it looks like.
const STORY_OPTIONS = MOTION_STORIES.map((o) => {
  const t = MOTION_TEMPLATES.find((x) => x.story === o.value)
  return t ? { ...o, thumb: previewSrc(t.id) } : o
})

export default function AIPromptPage({ embedded = false, preset = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast, brands, refreshCounts } = useStore()

  // settings (behind the ⚙ button)
  const [type, setType] = useState('image')
  const [ratio, setRatio] = useState('1:1')
  const [seconds, setSeconds] = useState(8)
  const [videoMode, setVideoMode] = useState('clip') // 'clip' = instant video | 'story' = storyboard | 'motion'
  const [motionVoice, setMotionVoice] = useState('female')
  const [motionMusic, setMotionMusic] = useState(true)
  // Remotion story: teach (Explainer style) or sell (Tech style); auto = sell when a product is chosen
  const [motionGoal, setMotionGoal] = useState('auto')
  // Your own story: the AI plans a storyboard you check and edit before it's rendered.
  const [motionReview, setMotionReview] = useState(true)
  const [motionLength, setMotionLength] = useState('auto')
  const [motionRatio, setMotionRatio] = useState('auto') // 'auto' (the AI picks from the brief) | '9:16' | '16:9'
  const [storySeconds, setStorySeconds] = useState(32)
  const [voice, setVoice] = useState(null) // null = the brand's language; '' = no voiceover
  const [brand, setBrand] = useState(null)
  const [style, setStyle] = useState(STYLES[0])
  const [template, setTemplate] = useState(TEMPLATES.image[0])
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Brand kit (Products → Brand kit): a poster template to follow, a product
  // photo to feature and the logo — sent along with image requests.
  const [kitOpen, setKitOpen] = useState(false)
  const [kitAssets, setKitAssets] = useState([])
  const [audiences, setAudiences] = useState([]) // audiences that brought this brand leads (Insights)
  const [kitProducts, setKitProducts] = useState([])
  // The one product an image / video is about (Settings → Product) — the
  // prompt writer then uses only it, so a brand's products never get mixed.
  const [productId, setProductId] = useState(null)
  const [kit, setKit] = useState({ templateId: null, productId: null, logo: false })
  const kitRef = useRef(null)

  // composer
  const [text, setText] = useState('')
  // attached images: [{ previewUrl, url, name }] — a Remotion video takes up to
  // MAX_REFS screenshots of their app; every other kind uses the first only
  const [refImgs, setRefImgs] = useState([])
  const refImg = refImgs[0] || null
  const setRefImg = (img) => setRefImgs(img ? [img] : [])
  const [uploadCount, setUploadCount] = useState(0)
  const uploading = uploadCount > 0
  const [writing, setWriting] = useState(false)
  const [intentPick, setIntentPick] = useState(null) // null = auto | 'ask' | 'create'
  // Embedded in the Content studio: our header buttons go on its title line
  // (ContentStudioPage #studio-actions) — on the tabs line they squeezed the
  // tabs on a phone.
  const [actionsSlot, setActionsSlot] = useState(null)
  useEffect(() => {
    setActionsSlot(embedded ? document.getElementById('studio-actions') : null)
  }, [embedded])

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

  const brandObj = brands.find((b) => b.slug === brand) || brands[0]
  // "Brand" voice only exists for a brand that has learned one (Brand kit)
  useEffect(() => {
    if (motionVoice === 'brand' && brandObj && !brandObj.voiceReady) setMotionVoice('female')
  }, [brandObj, motionVoice])
  const isImage = type === 'image'
  const isStory = type === 'video' && videoMode === 'story'
  // Motion: animated words over the brand's photos (Remotion) — Khmer or English.
  const isMotion = type === 'video' && videoMode === 'motion'
  const motionLang = /english/i.test(voice ?? brandObj?.lang ?? '') && !/khmer/i.test(voice ?? brandObj?.lang ?? '') ? 'English' : 'Khmer'
  // "Native" is the open-source Khmer voice — Khmer only, and only where the server runs it
  const nativeVoice = useVoiceStatus()?.native
  useEffect(() => {
    if (motionVoice === 'native' && (motionLang !== 'Khmer' || nativeVoice === false)) setMotionVoice('female')
  }, [motionVoice, motionLang, nativeVoice])
  const storyVoice = voice ?? (VOICES.includes(brandObj?.lang) ? brandObj.lang : 'English')
  const working = turns.some((t) => t.status === 'working')
  const kitTemplates = kitAssets.filter((a) => a.kind === 'template')
  const kitLogo = kitAssets.find((a) => a.kind === 'logo')
  const kitPhotos = kitAssets.filter((a) => a.kind === 'product')
  const kitTemplate = kitTemplates.find((t) => t.id === kit.templateId)
  const kitProduct = kitProducts.find((p) => p.id === kit.productId)
  const kitOn = isImage && !!(kitTemplate || kitProduct || (kit.logo && kitLogo))
  // Instant video: the chosen product photo becomes the clip's first frame
  // (an attached image takes its place).
  const isClip = type === 'video' && !isStory && !isMotion
  const maxRefs = isMotion ? MAX_REFS : isImage ? MAX_IMAGE_REFS : 1
  // one attached image shows big; several go small, so a row of them stays neat
  const thumb = refImgs.length > 1 ? 'h-14 w-14 rounded-xl' : 'h-[104px] w-[104px] rounded-2xl' 
  const videoFrame = isClip && !refImg && !!kitProduct

  useEffect(() => {
    if (!brand && brands.length) setBrand(brands[0].slug)
  }, [brands, brand])

  // An idea handed over from the Calendar ("Use this idea →").
  useEffect(() => {
    const s = location.state
    if (!s) return
    if (s.brandSlug) setBrand(s.brandSlug)
    // A template picked in Content studio → Templates: Remotion, with that story.
    if (s.motionStory) {
      setType('video')
      setRatio('9:16')
      setVideoMode('motion')
      setMotionGoal(s.motionStory)
      setIntentPick('create')
      const name = MOTION_STORIES.find((o) => o.value === s.motionStory)?.label || s.motionStory
      showToast(`Remotion · ${name} — write your topic or paste your story, or press Make one for me`)
    }
    const idea = [s.topic, s.extra].filter(Boolean).join('\n\n')
    if (idea) {
      setText(idea)
      showToast('Idea loaded — press ✦ to turn it into a full prompt, or send it as is')
    }
    // Keep ?tab= — dropping it would switch the Content studio back to Studio (the video builder).
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = brandObj?.id
    setAudiences([])
    if (id == null) return
    let live = true
    api
      .get(`/views/insights/boosts?brand_id=${id}`)
      .then((r) => live && setAudiences((r.what_works || []).filter((w) => w.field === 'audience').map((w) => w.value)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [brandObj?.id])

  // Opened from the Content studio's Quick content tab: starts on making an image.
  useEffect(() => {
    if (location.state?.motionStory) return // opened from a template — stays on Remotion
    if (preset === 'images') {
      setType('image')
      setIntentPick('create')
    }
  }, [preset])

  // The brand kit follows the chosen brand; its logo is on by default.
  useEffect(() => {
    const id = brandObj?.id
    setKit({ templateId: null, productId: null, logo: false })
    setProductId(null)
    if (id == null) return
    let live = true
    Promise.all([api.get(`/brand-kit?brand_id=${id}`), api.get('/products')])
      .then(([assets, products]) => {
        if (!live) return
        setKitAssets(assets)
        setKitProducts(products.filter((p) => p.brand_id === id))
        setKit((k) => ({ ...k, logo: assets.some((a) => a.kind === 'logo') }))
      })
      .catch(() => live && setKitAssets([]))
    return () => {
      live = false
    }
  }, [brandObj?.id])

  useEffect(() => {
    if (!kitOpen) return
    const onDown = (e) => {
      if (!kitRef.current?.contains(e.target)) setKitOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [kitOpen])

  // Animate progress while anything renders.
  useEffect(() => {
    if (!working) return
    const id = setInterval(() => tick((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [working])

  // Ready to type on arrival — on desktop only (on a phone it would pop the
  // keyboard up by itself), and without scrolling the page: the old
  // autoFocus made the browser scroll the box into view as the page opened.
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return
    composerRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
  }, [])

  // Keep the newest turn in view: jump to the bottom when a message is sent
  // (or a chat is opened), and follow along when an answer / image lands —
  // unless the person has scrolled up to read something older.
  const statusKey = turns.map((t) => t.status).join(',')

  const prevLenRef = useRef(0)
  useLayoutEffect(() => {
    const opening = prevLenRef.current === 0 // a chat just opened: jump, don't glide
    const grew = turns.length > prevLenRef.current
    prevLenRef.current = turns.length
    const doc = document.documentElement
    const nearBottom = () => doc.scrollHeight - (window.scrollY + window.innerHeight) < 360
    if (!turns.length || (!grew && !nearBottom())) return // empty chat: nothing to follow
    const toBottom = () => window.scrollTo({ top: doc.scrollHeight, behavior: opening ? 'auto' : 'smooth' })
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

  // A reply that lands after the page was left (e.g. the job id of a render
  // just started) goes straight into the saved chat — so reopening it resumes
  // the render instead of saying it was interrupted.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true // (dev mode mounts twice — set it back)
    return () => {
      mountedRef.current = false
    }
  }, [])
  const persistLate = (id, patch) => {
    try {
      const list = JSON.parse(latestRef.current || '[]').map((t) => (t.id === id ? { ...t, ...patch } : t))
      latestRef.current = JSON.stringify(list)
      const cid = chatIdRef.current || Number(sessionStorage.getItem(OPEN_CHAT)) || null
      if (cid) api.put(`/ai/chats/${cid}`, { turns: list }).catch(() => {})
    } catch {
      /* best effort — the render still lands in the Library */
    }
  }

  // Leaving the page: save anything not yet saved right away (the debounce
  // above would be cancelled), so a render in flight is still in the chat
  // when they come back.
  useEffect(
    () => () => {
      const json = latestRef.current
      if (!json || json === lastSavedRef.current) return
      if (chatIdRef.current) {
        api.put(`/ai/chats/${chatIdRef.current}`, { turns: JSON.parse(json) }).catch(() => {})
      } else if (!creatingRef.current) {
        api
          .post('/ai/chats', { turns: JSON.parse(json) })
          .then((c) => sessionStorage.setItem(OPEN_CHAT, String(c.id)))
          .catch(() => {})
      }
    },
    [],
  )

  // The chat that's open survives going to another page and back (and a
  // reload) — AI Agent reopens it instead of starting blank.
  useEffect(() => {
    try {
      if (chatId) sessionStorage.setItem(OPEN_CHAT, String(chatId))
    } catch {
      /* ignore */
    }
  }, [chatId])
  useEffect(() => {
    let saved = null
    try {
      saved = sessionStorage.getItem(OPEN_CHAT)
    } catch {
      saved = null
    }
    if (saved && !location.state) openChat(Number(saved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newChat = () => {
    try {
      sessionStorage.removeItem(OPEN_CHAT)
    } catch {
      /* ignore */
    }
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
      // storyboards still being written on the server: keep waiting for them
      for (const t of restored) if (t.status === 'working' && t.kind === 'motion' && t.planId && !t.jobId) resumePlan(t)
      setText('')
      setIntentPick(null)
      setHistoryOpen(false)
    } catch (e) {
      showToast(`Couldn’t open that chat — ${e.message}`)
    }
  }

  const patchTurn = (id, patch) => setTurns((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const addTokens = (n) => n && setSessionTokens((t) => t + n)

  // Latest turns, read by the poll loop so it doesn't have to restart on every change.
  const turnsRef = useRef(turns)
  useEffect(() => {
    turnsRef.current = turns
  })

  // Poll running image/video jobs (they render on the server — app/video.py).
  // This must keep checking until every job is done: a one-shot timeout armed
  // on `turns` change dies after its first response (a still-running job makes
  // no state change, so nothing re-arms it and the finished image is never
  // fetched until you leave the page and come back).
  useEffect(() => {
    if (!working) return
    let stopped = false
    let timer
    async function poll() {
      const running = turnsRef.current.filter((t) => t.status === 'working' && t.kind !== 'ask' && t.jobId)
      for (const t of running) {
        try {
          const res = await api.get(`/ai/video/${t.jobId}`)
          if (res.status === 'succeeded' && res.video) {
            untrackJob(t.jobId)
            patchTurn(t.id, { status: 'done', video: res.video, tokens: res.total_tokens, cost: res.cost_usd })
            addTokens(res.total_tokens)
            refreshCounts()
          } else if (res.status === 'failed') {
            untrackJob(t.jobId)
            patchTurn(t.id, { status: 'failed', error: res.error || 'Render failed.' })
          } else if (t.kind === 'image') {
            const queuedAhead = res.queued_ahead ?? 0
            const renderedAt = res.rendered_at ?? null
            const cur = turnsRef.current.find((x) => x.id === t.id)
            if (cur && (cur.jobStatus !== res.status || cur.queuedAhead !== queuedAhead || cur.renderedAt !== renderedAt)) {
              patchTurn(t.id, { jobStatus: res.status, queuedAhead, renderedAt })
            }
          } else if (t.kind === 'motion' && res.progress) {
            // The live storyboard: scenes written, lines spoken, frames drawn.
            const cur = turnsRef.current.find((x) => x.id === t.id)
            if (cur && JSON.stringify(cur.progress) !== JSON.stringify(res.progress)) patchTurn(t.id, { progress: res.progress })
          }
        } catch {
          /* transient — next poll */
        }
      }
      if (!stopped) timer = setTimeout(poll, 2500)
    }
    timer = setTimeout(poll, 2500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working])

  // A storyboard is written in the background (several AI steps can take
  // minutes — longer than the proxy waits on one request): ask until it's ready.
  const waitForPlan = async (planId, onThinking) => {
    const until = Date.now() + 20 * 60 * 1000
    for (;;) {
      const res = await api.get(`/ai/motion/plan/${planId}`)
      if (res.status === 'done') return res
      if (res.style) onThinking?.(res) // the template it picked, and why — shown on the card
      if (res.status === 'failed') throw new Error(res.error || 'The storyboard couldn’t be written.')
      if (Date.now() > until) throw new Error('The storyboard is taking too long — try again.')
      await new Promise((r) => setTimeout(r, 2500))
    }
  }

  // Back on a chat whose storyboard was still being written: pick it up again.
  const resumePlan = async (turn) => {
    const live = () => turnsRef.current.find((x) => x.id === turn.id)?.status === 'working'
    try {
      const res = await waitForPlan(turn.planId, (p) => live() && patchTurn(turn.id, { progress: { stage: 'story', style: p.style, why: p.why } }))
      if (!mountedRef.current) return persistLate(turn.id, { status: 'review', plan: { ...res.script, why: res.why || '', misfit: !!res.misfit } })
      if (live()) patchTurn(turn.id, { status: 'review', plan: { ...res.script, why: res.why || '', misfit: !!res.misfit } })
      refreshCounts()
    } catch (e) {
      if (!mountedRef.current) return persistLate(turn.id, { status: 'failed', error: e.message })
      if (live()) patchTurn(turn.id, { status: 'failed', error: e.message })
    }
  }

  const run = async (turn) => {
    patchTurn(turn.id, { status: 'working', error: '', video: null, startedAt: Date.now() })
    // Stop pressed while this was on its way: drop the answer (and stop a job it started).
    const live = () => turnsRef.current.find((x) => x.id === turn.id)?.status === 'working'
    const update = (id, patch) => {
      if (!mountedRef.current) return persistLate(id, patch)
      if (live()) return setTurns((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      if (patch.jobId) {
        untrackJob(patch.jobId)
        api.post(`/ai/video/${patch.jobId}/stop`).catch(() => {})
      }
      return undefined
    }
    // Everything but a question needs a brand — none means the brands didn't
    // load (e.g. the server was restarting when the page opened).
    if (turn.kind !== 'ask' && turn.brandId == null) {
      update(turn.id, { status: 'failed', error: 'No brand is loaded — refresh the page, then press Try again.' })
      return
    }
    try {
      if (turn.kind === 'ask') {
        const res = await api.post('/ai/advisor', {
          message: turn.prompt,
          history: turn.history || [],
          brand_id: turn.brandId,
          image_url: turn.refUrl || '',
        })
        update(turn.id, {
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
          reference_urls: turn.refUrls || [], // more attached images — IMAGE 2, 3, 4
          template_id: turn.kit?.templateId ?? null,
          product_id: turn.kit?.productId ?? null,
          use_logo: !!turn.kit?.logo,
        })
        if (res.video) {
          update(turn.id, { status: 'done', video: res.video, tokens: res.total_tokens, cost: res.cost_usd })
          addTokens(res.total_tokens)
          refreshCounts()
        } else {
          // Renders on the server; polled below, and still finishes (with a
          // phone notification) if the person leaves this page.
          trackJob(res.id, 'image')
          update(turn.id, { jobId: res.id })
        }
      } else if (turn.kind === 'motion' && turn.reviewFirst && !turn.script) {
        // Your own story → a storyboard to check and edit; nothing is
        // voiced or rendered until "Make the video".
        const started = await api.post('/ai/motion/plan', {
          brand_id: turn.brandId,
          idea: turn.prompt,
          product_id: turn.productId ?? null,
          language: turn.language || 'Khmer',
          goal: turn.goal || 'auto',
          music: turn.music !== false,
          length: turn.length || 'auto',
          ratio: turn.shape || 'auto',
          ref_url: turn.refUrl || '', // a screenshot of their app: the design the video copies
          ref_urls: turn.refUrls || [], // …and more of its screens (screenshots 2, 3…)
        })
        // Saved on the turn, so leaving and coming back picks it up again
        // (resumePlan) instead of "Interrupted when the page closed".
        let res = started
        if (started.plan_id && started.status !== 'done') {
          update(turn.id, { planId: started.plan_id })
          res = await waitForPlan(started.plan_id, (p) => update(turn.id, { progress: { stage: 'story', style: p.style, why: p.why } }))
        }
        update(turn.id, { status: 'review', plan: { ...res.script, why: res.why || '', misfit: !!res.misfit } })
        refreshCounts()
      } else if (turn.kind === 'motion') {
        // Script, brand photos and render all happen on the server (~1 min).
        const res = await api.post('/ai/motion', {
          brand_id: turn.brandId,
          idea: turn.auto ? '' : turn.prompt, // "Make one for me": the AI picks the topic
          product_id: turn.productId ?? null,
          language: turn.language || 'Khmer',
          voice: turn.voice || 'female',
          music: turn.music !== false,
          goal: turn.goal || 'auto',
          script: turn.script || null, // a reviewed storyboard: made exactly as it is
          ratio: turn.script?.ratio || turn.shape || (turn.ratio === '16:9' ? '16:9' : '9:16'), // a reviewed plan keeps its shape
          ref_url: turn.refUrl || '',
          ref_urls: turn.refUrls || [],
        })
        trackJob(res.id, 'video')
        update(turn.id, { jobId: res.id })
      } else if (turn.kind === 'story') {
        // Writes the storyboard only (~20-40s); clips render once it's approved.
        const res = await api.post('/ai/story', {
          idea: turn.prompt,
          brand_id: turn.brandId,
          total_seconds: turn.seconds,
          scene_seconds: 8,
          aspect_ratio: turn.ratio,
          language: turn.language,
        })
        update(turn.id, { status: 'done', storyId: res.id })
        refreshCounts()
      } else {
        const res = await api.post('/ai/video', {
          prompt: turn.prompt,
          aspect_ratio: turn.ratio,
          seconds: turn.seconds,
          brand_id: turn.brandId,
          reference_url: turn.refUrl || '',
          product_id: turn.refUrl ? null : (turn.kit?.productId ?? null),
        })
        trackJob(res.id, 'video')
        update(turn.id, { jobId: res.id })
      }
    } catch (e) {
      update(turn.id, { status: 'failed', error: e.message })
    }
  }

  const intent = intentPick || (looksLikeQuestion(text) ? 'ask' : 'create')

  // Stop everything being made: the server stops each job (a motion video's
  // render is killed; an image or filmed clip may still land in the Library).
  // Stop one video being made (the Making-your-video card's Stop).
  const stopOne = (turn) => {
    if (turn.jobId) {
      untrackJob(turn.jobId)
      api.post(`/ai/video/${turn.jobId}/stop`).catch(() => {})
    }
    setTurns((list) => list.map((x) => (x.id === turn.id ? { ...x, status: 'failed', error: 'Stopped' } : x)))
  }

  const stopAll = () => {
    for (const t of turnsRef.current.filter((x) => x.status === 'working')) {
      if (t.jobId) {
        untrackJob(t.jobId)
        api.post(`/ai/video/${t.jobId}/stop`).catch(() => {})
      }
      setTurns((list) => list.map((x) => (x.id === t.id ? { ...x, status: 'failed', error: 'Stopped' } : x)))
    }
    showToast('Stopped')
  }

  const ask = (message, image = null) => {
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
      refUrl: image?.url || '',
      refPreview: image?.previewUrl || '',
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    run(turn)
  }

  // An advisor suggestion carries an idea brief (+ pillar, product photo): it
  // goes through the same prompt writer as ✦ first, so suggested videos get
  // the short timed shot plan and start from the real product photo. Chats
  // saved before that carry a finished `prompt` and go straight to render.
  const generateSuggestion = async (sug) => {
    const kind = sug.type === 'video' ? 'video' : 'image'
    const productId = sug.product_id ?? null
    if (!sug.brief && !sug.prompt) return showToast('This suggestion is empty — ask again for fresh ideas')
    const turn = {
      id: ++turnSeq,
      prompt: sug.brief || sug.prompt,
      kind,
      ratio: kind === 'video' ? '9:16' : isImage ? ratio : '1:1',
      seconds,
      brandId: brandObj?.id ?? null,
      brandName: brandObj?.name || '',
      kit: productId ? { templateId: null, productId, logo: false } : null,
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    if (!sug.brief) return run(turn)
    try {
      const res = await api.post('/ai/prompt', {
        brand: brandObj?.name || '',
        brand_language: brandObj?.lang || '',
        brand_id: brandObj?.id ?? null,
        type: kind,
        aspect_ratio: turn.ratio,
        seconds,
        style,
        topic: sug.brief,
        has_reference: kind === 'video' && !!productId,
        brand_kit: kind === 'image' && !!productId,
        product_id: productId,
      })
      addTokens(res.total_tokens)
      patchTurn(turn.id, { prompt: res.prompt })
      run({ ...turn, prompt: res.prompt })
    } catch (e) {
      patchTurn(turn.id, { status: 'failed', error: `Couldn’t write the prompt — ${e.message}` })
    }
  }

  const send = () => {
    const prompt = text.trim()
    if (uploading || writing || !prompt) return
    if (intent === 'ask') {
      setText('')
      setIntentPick(null)
      ask(prompt, refImg)
      setRefImg(null)
      return
    }
    if (isStory && refImg) {
      showToast('Storyboards don’t use an attached image yet — remove it, or pick Instant video')
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
      kind: isStory ? 'story' : isMotion ? 'motion' : type,
      ratio: isMotion ? (motionRatio === '16:9' ? '16:9' : '9:16') : isStory && ratio === '1:1' ? '9:16' : ratio,
      shape: isMotion ? motionRatio : undefined, // what the server is asked: auto / 9:16 / 16:9
      seconds: isStory ? storySeconds : isMotion ? 15 : seconds,
      language: isStory ? storyVoice : isMotion ? motionLang : '',
      productId: isMotion ? (productId ?? null) : undefined,
      voice: isMotion ? motionVoice : undefined,
      music: isMotion ? motionMusic : undefined,
      goal: isMotion ? motionGoal : undefined,
      reviewFirst: isMotion && motionReview,
      length: isMotion && motionReview ? motionLength : undefined,
      brandId: brandObj?.id ?? null,
      brandName: brandObj?.name || '',
      refUrl: refImg?.url || '',
      refUrls: maxRefs > 1 ? refImgs.map((i) => i.url).filter(Boolean).slice(0, maxRefs) : [],
      refPreview: refImg?.previewUrl || '',
      kit: isMotion
        ? null
        : videoFrame
        ? { templateId: null, productId: kit.productId, logo: false }
        : !isStory && kitOn
          ? { ...kit, logo: kit.logo && !!kitLogo }
          : null,
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
    setText('')
    setRefImg(null)
    run(turn)
  }

  // Remotion "Make one for me": no typing — the AI picks the topic from the
  // brand's products (the chosen one, if any) and a new story angle each time.
  const makeForMe = () => {
    const product = kitProducts.find((p) => p.id === productId)
    const turn = {
      id: ++turnSeq,
      kind: 'motion',
      auto: true,
      prompt: `✨ AI picks the topic${product ? ` · ${product.name}` : ''}`,
      ratio: motionRatio === '16:9' ? '16:9' : '9:16',
      shape: motionRatio,
      seconds: 15,
      language: motionLang,
      productId: productId ?? null,
      voice: motionVoice,
      music: motionMusic,
      goal: motionGoal,
      brandId: brandObj?.id ?? null,
      brandName: brandObj?.name || '',
      refUrl: '',
      refPreview: '',
      kit: null,
      status: 'working',
      startedAt: Date.now(),
    }
    setTurns((list) => [...list, turn])
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
        seconds,
        style,
        topic: idea,
        // Video: an attached image or product photo is the clip's first frame.
        has_reference: isImage ? !!refImg && !kitOn : !!refImg || videoFrame,
        brand_kit: kitOn,
        // The product picked in Settings, else the one whose photo is in the brand kit.
        product_id: productId ?? kit.productId ?? null,
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
    const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.png`
    const previewUrl = URL.createObjectURL(file)
    setRefImgs((cur) => (maxRefs === 1 ? [{ previewUrl, url: null, name }] : cur.length >= maxRefs ? cur : [...cur, { previewUrl, url: null, name }]))
    setUploadCount((n) => n + 1)
    try {
      const fd = new FormData()
      fd.append('file', file, name)
      const up = await api.upload('/media/upload', fd)
      setRefImgs((cur) => cur.map((i) => (i.previewUrl === previewUrl ? { ...i, url: up.url } : i)))
    } catch (err) {
      setRefImgs((cur) => cur.filter((i) => i.previewUrl !== previewUrl))
      showToast(`Upload failed — ${err.message}`)
    } finally {
      setUploadCount((n) => n - 1)
    }
  }

  // the files that still fit: Remotion takes up to MAX_REFS screenshots, an
  // image up to MAX_IMAGE_REFS pictures, the rest one
  const fitting = (files) => {
    if (maxRefs === 1) return files.slice(0, 1)
    const room = maxRefs - refImgs.length
    const what = isMotion ? `${maxRefs} screenshots for one video` : `${maxRefs} images for one picture`
    if (files.length > room) showToast(room > 0 ? `Up to ${what} — added ${room}` : `Up to ${what}`)
    return files.slice(0, Math.max(0, room))
  }

  const attach = (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    for (const f of fitting(files)) attachFile(f)
  }

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    if (!item) return // plain text paste — leave it alone
    e.preventDefault()
    for (const f of fitting([item.getAsFile()])) attachFile(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) for (const f of fitting(files)) attachFile(f)
    else if (e.dataTransfer?.files?.length) showToast('Reference must be an image')
  }

  // The template list depends on the type — a type set elsewhere (a Templates
  // hand-over, a preset) must not leave a template from the other list behind.
  useEffect(() => {
    if (!TEMPLATES[type].includes(template)) setTemplate(TEMPLATES[type][0])
  }, [type, template])

  const chooseType = (t) => {
    setType(t)
    setRatio(t === 'image' ? '1:1' : '9:16')
    setTemplate(TEMPLATES[t][0])
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
    setText(turn.prompt || '')
    chooseType(turn.kind === 'image' ? 'image' : 'video')
    if (turn.kind !== 'image') setVideoMode(turn.kind === 'story' || turn.kind === 'motion' ? turn.kind : 'clip')
    if (turn.kind === 'motion') {
      setVoice(turn.language || null)
      setMotionVoice(turn.voice || 'female')
    }
    if (turn.kind === 'story') {
      setStorySeconds(turn.seconds)
      setVoice(turn.language ?? null)
    }
    setRatio(turn.ratio)
    composerRef.current?.querySelector('textarea')?.focus()
  }

  // The storyboard card: edits are kept on the turn (and saved with the chat).
  const changePlan = (turn, plan) => patchTurn(turn.id, { plan })
  const makeFromPlan = (turn) => {
    const go = { ...turn, status: 'working', script: turn.plan, progress: null, startedAt: Date.now() }
    patchTurn(turn.id, { status: 'working', script: turn.plan, progress: null, startedAt: go.startedAt })
    run(go)
  }
  // ``goal``: write it again in another template (the storyboard's "Use AI design")
  const rewritePlan = (turn, goal) => {
    const next = goal ? { goal } : {}
    patchTurn(turn.id, { plan: null, script: null, startedAt: Date.now(), ...next })
    run({ ...turn, plan: null, script: null, ...next })
  }

  const regenerate = (turn) => {
    const again = {
      ...turn,
      id: ++turnSeq,
      status: 'working',
      video: null,
      jobId: null,
      storyId: null,
      startedAt: Date.now(),
      // a try that failed for want of a brand uses the one picked now
      brandId: turn.brandId ?? brandObj?.id ?? null,
      brandName: turn.brandName || brandObj?.name || '',
    }
    setTurns((list) => [...list, again])
    run(again)
  }

  const canSend = (intent === 'ask' ? text.trim().length >= 2 : text.trim().length >= 10) && !uploading && !writing

  // New chat and History — in the Content studio they sit on its title line
  // (#studio-actions), else in this header.
  const actions = (
    <div className="flex flex-none items-center gap-0.5 sm:gap-1">
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
  )

  return (
    // Fills the screen below the top bar, so the composer always sits at the
    // bottom — even when the thread is short or empty.
    <div className="w-full px-5 lg:px-10 animate-fade flex flex-col min-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] lg:min-h-[calc(100dvh-3.5rem)]">
      {/* Page header — pinned under the top bar while the thread scrolls. */}
      {/* …under the section tabs and the Content studio title, also pinned (usePinnedHeight). */}
      <div className="sticky top-[calc(3.5rem+var(--tabs-h,0px)+var(--studio-head,0px))] z-[16] -mx-5 lg:-mx-10 px-5 lg:px-10 bg-canvas">
        {/* Phones: one compact row (the header stays pinned, so every line of
            it hides the thread) — the description shows from sm up. */}
        <div className="w-full flex items-center justify-between gap-2 sm:gap-3 py-2.5 sm:py-4">
          <div className="min-w-0">
            {/* Embedded in Content studio: no hint line — the studio title says enough. */}
            {!embedded && (
              <>
                <h1 className="text-[19px] sm:text-[22px] font-bold text-ink-900 tracking-tight leading-tight">Content studio</h1>
                <p className="mt-0.5 hidden sm:block text-[12.5px] text-ink-500">
                  Ask about your marketing, or describe an image or video to create.
                </p>
              </>
            )}
          </div>
          {!actionsSlot && actions}
        </div>
      </div>

      {actionsSlot && createPortal(actions, actionsSlot)}

      {/* The chat column — 80% of the page on desktop, centred. */}
      <div className="w-full flex-1">
        <div className="mt-2 space-y-8 pb-6">
          {turns.length === 0 && (
            <div className="pt-[14vh] pb-4 text-center">
              <h2 className="text-[22px] font-semibold text-ink-900 tracking-tight">How can I help?</h2>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:justify-center">
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
                    className="min-w-0 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-white px-3 py-2 sm:px-3.5 sm:py-1.5 text-[12px] text-ink-600 hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    {s.pick === 'ask' ? (
                      <FiMessageCircle size={12} className="flex-none text-ink-400" />
                    ) : (
                      <span className="flex-none text-brand text-[11px] leading-none">✦</span>
                    )}
                    <span className="truncate">{s.label}</span>
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
            ) : t.kind === 'story' ? (
              <StoryTurn
                key={t.id}
                t={t}
                onEdit={() => editPrompt(t)}
                onRetry={() => regenerate(t)}
                onDeleted={() => setTurns((list) => list.filter((x) => x.id !== t.id))}
              />
            ) : (
            <Turn
              key={t.id}
              t={t}
              onUse={() => useInPost(t)}
              onEdit={() => editPrompt(t)}
              onRegenerate={() => regenerate(t)}
              onLibrary={() => navigate('/library')}
              onStop={() => stopOne(t)}
              onPlanChange={(plan) => changePlan(t, plan)}
              onMake={() => makeFromPlan(t)}
              onRewrite={(goal) => rewritePlan(t, goal)}
            />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* composer */}
      <div className="composer-dock sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 z-20 -mx-5 lg:-mx-10 px-5 lg:px-10 pb-3 pt-6 bg-gradient-to-t from-canvas via-canvas to-transparent">
        {/* While the Brand kit popover is open the page behind dims (plain, no
            blur); the composer and the popover stay on top. A tap on it closes
            the popover (its outside-click handler). */}
        {kitOpen && <div className="fixed inset-0 bg-night-950/40 animate-fadein" aria-hidden="true" />}
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
          className={`relative w-full rounded-3xl border bg-white shadow-[0_8px_30px_rgba(16,24,40,0.08)] transition-colors ${
            dragging ? 'border-brand ring-4 ring-brand/15' : 'border-ink-200 focus-within:border-brand/40'
          }`}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl bg-brand-soft/80 text-[13px] font-semibold text-brand">
              Drop the image to use it as a reference
            </div>
          )}

          {refImgs.length > 0 && (
            <div className="flex flex-wrap items-end gap-1.5 px-4 pt-4">
              {refImgs.map((img, i) => (
                <div key={img.previewUrl} className={`group relative overflow-hidden bg-ink-100 ring-1 ring-ink-200 ${thumb}`}>
                  <img src={img.previewUrl} alt={i ? `Screenshot ${i + 1}` : 'Reference'} className="h-full w-full object-cover" />
                  {!img.url && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                    </div>
                  )}
                  <span className={`absolute rounded-md bg-black/55 font-semibold text-white ${refImgs.length > 1 ? 'bottom-1 left-1 px-1 text-[9px]' : 'bottom-1.5 left-1.5 px-1.5 py-0.5 text-[9.5px]'}`}>
                    {refImgs.length > 1 ? i + 1 : 'Reference'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRefImgs((cur) => cur.filter((x) => x.previewUrl !== img.previewUrl))}
                    title="Remove"
                    aria-label="Remove this image"
                    className="absolute right-1 top-1 h-5 w-5 rounded-full grid place-items-center bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 transition"
                  >
                    <FiX size={11} />
                  </button>
                </div>
              ))}
              {maxRefs > 1 && refImgs.length < maxRefs && (
                <label
                  title={isMotion ? `Add a screen (up to ${maxRefs})` : `Add an image (up to ${maxRefs})`}
                  className="grid h-14 w-14 cursor-pointer place-items-center rounded-xl border border-dashed border-ink-300 text-ink-500 hover:border-brand hover:text-brand"
                >
                  <input type="file" accept="image/*" multiple className="hidden" onChange={attach} />
                  <span className="text-center text-[9.5px] font-semibold leading-tight">
                    <FiPlus size={14} className="mx-auto" />
                    {refImgs.length}/{maxRefs}
                  </span>
                </label>
              )}
            </div>
          )}

          {intent === 'create' && videoFrame && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3.5">
              <span className="text-[11px] font-semibold text-ink-400">Starts from:</span>
              <KitChip onRemove={() => setKit((k) => ({ ...k, productId: null }))}>
                <img src={kitSrc(kitPhotos.find((a) => a.product_id === kitProduct.id)?.url)} alt="" className="h-5 w-5 rounded-sm object-cover" />
                {kitProduct.name}
              </KitChip>
            </div>
          )}

          {intent === 'create' && kitOn && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3.5">
              <span className="text-[11px] font-semibold text-ink-400">Brand kit:</span>
              {kitTemplate && (
                <KitChip onRemove={() => setKit((k) => ({ ...k, templateId: null }))}>
                  <img src={kitSrc(kitTemplate.url)} alt="" className="h-5 w-4 rounded-sm object-cover" />
                  {kitTemplate.name || 'Template'}
                </KitChip>
              )}
              {kitProduct && (
                <KitChip onRemove={() => setKit((k) => ({ ...k, productId: null }))}>
                  <img src={kitSrc(kitPhotos.find((a) => a.product_id === kitProduct.id)?.url)} alt="" className="h-5 w-5 rounded-sm object-cover" />
                  {kitProduct.name}
                </KitChip>
              )}
              {kit.logo && kitLogo && (
                <KitChip onRemove={() => setKit((k) => ({ ...k, logo: false }))}>
                  <img src={kitSrc(kitLogo.url)} alt="" className="h-5 w-5 object-contain" />
                  Logo
                </KitChip>
              )}
            </div>
          )}

          {audiences.length > 0 && !writing && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3.5">
              <span className="text-[11px] font-semibold text-ink-400" title="Audiences that have brought this brand leads">For:</span>
              {audiences.map((a) => {
                const line = `For: ${a}`
                const on = text.includes(line)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setText((t) => (on ? t.replace(`\n${line}`, '').replace(line, '') : `${t.trimEnd()}${t.trim() ? '\n' : ''}${line}`))}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      on ? 'bg-brand-soft text-brand ring-1 ring-brand-line' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          )}

          <AutoTextarea
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
                : refImg
                  ? `Ask about this image, or describe the ${isImage ? 'image' : 'video'} to make from it…`
                  : isMotion
                  ? 'What is the Remotion video about? e.g. 3 reasons customers love our soap…'
                  : isStory
                  ? 'Describe the video story — the problem, the product, the result…'
                  : `Ask about your marketing, or describe the ${isImage ? 'image' : 'video'} you want…`
            }
            className="block w-full border-0 bg-transparent px-5 pt-4 pb-2 text-[13.5px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-0 disabled:opacity-60"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5">
            {/* settings */}
            {/* the settings open as a drawer from the right (SettingsPopover) */}
            <div>
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
                  {isImage
                    ? 'Image'
                    : isMotion
                      ? `Remotion · ${motionLang}`
                      : isStory
                        ? `Storyboard · ~${storySeconds}s`
                        : `Video · ${seconds}s`}{' '}
                  · {isMotion ? (motionRatio === 'auto' ? 'Auto size' : motionRatio) : isStory && ratio === '1:1' ? '9:16' : ratio}
                </span>
              </button>
              {settingsOpen && (
                <SettingsPopover
                  onClose={() => setSettingsOpen(false)}
                  type={type}
                  setType={chooseType}
                  ratio={ratio}
                  setRatio={setRatio}
                  seconds={seconds}
                  setSeconds={setSeconds}
                  videoMode={videoMode}
                  setVideoMode={setVideoMode}
                  motionVoice={motionVoice}
                  motionMusic={motionMusic}
                  setMotionMusic={setMotionMusic}
                  motionGoal={motionGoal}
                  setMotionGoal={setMotionGoal}
                  motionReview={motionReview}
                  setMotionReview={setMotionReview}
                  motionLength={motionLength}
                  setMotionLength={setMotionLength}
                  motionRatio={motionRatio}
                  setMotionRatio={setMotionRatio}
                  setMotionVoice={setMotionVoice}
                  storySeconds={storySeconds}
                  setStorySeconds={setStorySeconds}
                  voice={storyVoice}
                  setVoice={setVoice}
                  brands={brands}
                  brand={brandObj?.slug}
                  setBrand={setBrand}
                  style={style}
                  setStyle={setStyle}
                  template={template}
                  setTemplate={setTemplate}
                  products={kitProducts}
                  product={productId}
                  setProduct={(id) => {
                    setProductId(id)
                    // Keep the brand-kit photo on the same product, so text and picture agree.
                    setKit((k) =>
                      k.productId && k.productId !== id
                        ? { ...k, productId: kitPhotos.some((a) => a.product_id === id) ? id : null }
                        : k,
                    )
                  }}
                />
              )}
            </div>

            <label
              className="h-9 w-9 rounded-full grid place-items-center text-ink-600 hover:bg-ink-100 cursor-pointer"
              title="Attach an image — ask about it, or make an image / video from it (or paste / drop one into the box)"
            >
              <input type="file" accept="image/*" multiple={maxRefs > 1} className="hidden" onChange={attach} />
              <FiPaperclip size={15} />
            </label>

            {intent === 'create' && (isImage || isClip) && (
              // Phones: not `relative`, so the panel anchors to the whole
              // composer box (full width) instead of running off the right edge.
              <div className="sm:relative" ref={kitRef}>
                <button
                  type="button"
                  onClick={() => setKitOpen((v) => !v)}
                  className={`h-9 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
                    kitOpen || kitOn || videoFrame ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                  title={
                    isClip
                      ? 'Start the video from a product photo in your brand kit, so it shows the real product'
                      : 'Use your brand kit — a poster template, a product photo and your logo'
                  }
                >
                  <FiLayers size={15} />
                  <span className="hidden sm:inline">Brand kit</span>
                </button>
                {kitOpen && (
                  <KitPopover
                    video={isClip}
                    kit={kit}
                    setKit={setKit}
                    templates={kitTemplates}
                    logo={kitLogo}
                    products={kitProducts.filter((p) => kitPhotos.some((a) => a.product_id === p.id))}
                    onManage={() => navigate('/products', { state: { view: 'kit' } })}
                  />
                )}
              </div>
            )}

            {isMotion && (
              <button
                type="button"
                onClick={makeForMe}
                disabled={!brandObj}
                className="h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-600 hover:bg-brand-soft hover:text-brand disabled:opacity-40"
                title="No typing needed — the AI picks a topic from your products and makes the whole video"
              >
                <span className="text-brand">✨</span>
                <span className="hidden sm:inline">Make one for me</span>
              </button>
            )}

            {intent === 'create' && !isMotion && (
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
              {working && (
                <button
                  type="button"
                  onClick={stopAll}
                  className="mr-1 grid h-9 w-9 place-items-center rounded-full bg-red-600 text-white shadow-[0_4px_14px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-700"
                  title="Stop — ends what’s being made now"
                  aria-label="Stop"
                >
                  <FiSquare size={13} fill="currentColor" aria-hidden="true" />
                </button>
              )}
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
      <div className="absolute inset-0 glass-overlay animate-fadein" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[360px] max-w-[92vw] glass-drawer animate-drawer-in flex flex-col">
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
          {t.refPreview && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[t.refPreview, ...(t.refUrls || []).slice(1).map((u) => `${mediaBase}${u}`)].map((src) => (
                <img key={src} src={src} alt="" className="w-28 h-28 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {t.prompt}
        </div>
        <div className="mt-1 flex items-center text-ink-400">
          <IconBtn title="Edit question" onClick={onEdit}>
            <FiEdit2 size={13} />
          </IconBtn>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-8 h-8 flex-none rounded-xl grid place-items-center bg-white ring-1 ring-ink-200/80 shadow-sm">
          <img src="/brand/logo-mark.png" alt="Marketing ឆ្លាតវៃ" className="w-6 h-6 object-contain" />
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
              <b>{t.error === 'Stopped' ? 'Stopped.' : 'Couldn’t answer.'}</b> {t.error === 'Stopped' ? '' : t.error}
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
                        title={sug.brief || sug.prompt}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-white px-3.5 py-1.5 text-[12px] font-medium text-brand hover:bg-brand-soft transition-colors"
                      >
                        <span>✦</span>
                        {sug.type === 'video' ? <FiVideo size={12} /> : <FiImage size={12} />}
                        {sug.label}
                        {PILLAR_LABELS[sug.pillar] && (
                          <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${pillarChipClass(sug.pillar)}`}>
                            {PILLAR_LABELS[sug.pillar]}
                          </span>
                        )}
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

function Turn({ t, onUse, onEdit, onRegenerate, onLibrary, onPlanChange, onMake, onRewrite, onStop }) {
  const { showToast } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [making, setMaking] = useState(false) // a Remotion video's "How it was made"
  // A Remotion video that just finished: 'in' = the card shows it complete,
  // 'out' = it fades, then false = the video reveals itself (animate-media-reveal)
  const [finishing, setFinishing] = useState(false)
  const wasStatus = useRef(t.status)
  useEffect(() => {
    const was = wasStatus.current
    wasStatus.current = t.status
    if (t.kind !== 'motion' || was !== 'working' || t.status !== 'done') return undefined
    setFinishing('in')
    const a = setTimeout(() => setFinishing('out'), 1100)
    const b = setTimeout(() => setFinishing(false), 1600)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [t.status, t.kind])
  const [copied, setCopied] = useState(false)
  // Chats saved by an older page version can hold a turn without a prompt.
  const prompt = t.prompt || ''
  const long = prompt.length > 320
  const elapsed = t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0
  const renderElapsed = t.renderedAt ? (Date.now() - new Date(t.renderedAt).getTime()) / 1000 : null
  // Images get no % back from the provider, so the number is an ETA-anchored
  // estimate (labeled "~… est"); the queue position shown while waiting is exact.
  const queued = t.kind === 'image' && t.jobStatus === 'queued'
  const rendering = t.kind === 'image' && t.jobStatus === 'running'
  const estimate =
    t.kind === 'image' && !queued
      ? Math.min(94, Math.round(100 * (1 - Math.exp(-(renderElapsed ?? elapsed) / (IMG_ETA / 2.3)))))
      : null
  const motion = t.kind === 'motion'
  const pct =
    t.kind === 'image'
      ? queued
        ? 6
        : (estimate ?? 0)
      : motion
        ? (motionPercent(t.progress, elapsed) ?? Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / (MOTION_ETA / 2.3))))))
        : Math.min(95, (elapsed / VID_ETA) * 100)
  const stage =
    queued
      ? `In queue — ${t.queuedAhead || 0} image${t.queuedAhead === 1 ? '' : 's'} ahead of yours`
      : t.kind === 'image'
        ? (renderElapsed ?? 0) >= 90
          ? "Still rendering — you can leave, we'll notify you"
          : 'Rendering the image…'
        : motion
          ? motionStage(t.progress) ||
            (t.reviewFirst && !t.script ? 'Reading your story and planning the scenes…' : null) ||
            (elapsed < 12
            ? 'Writing the script…'
            : elapsed < 20
              ? 'Picking your brand photos…'
              : elapsed < 120
                ? 'Animating the scenes…'
                : "Mixing the voice — you can leave, it lands in your Library")
          : t.jobId ? 'Rendering your video… usually 1–3 minutes' : 'Starting the render…'
  const shape =
    t.ratio === '16:9' ? 'aspect-video w-full max-w-[560px]' : t.ratio === '1:1' ? 'aspect-square w-full max-w-[400px]' : 'aspect-[9/16] w-full max-w-[280px]'
  const url = t.video ? `${mediaBase}${t.video.url}` : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
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
          {t.refPreview && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[t.refPreview, ...(t.refUrls || []).slice(1).map((u) => `${mediaBase}${u}`)].map((src) => (
                <img key={src} src={src} alt="" className="w-20 h-20 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {long && !expanded ? `${prompt.slice(0, 320).trimEnd()}…` : prompt}
          {long && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="ml-1 text-[12px] font-semibold text-brand">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-0.5 text-ink-400">
          <span className="mr-1.5 text-[10.5px]">
            {t.kind === 'image' ? 'Image' : motion ? `Remotion · ${t.language || 'Khmer'}` : `Video · ${t.seconds}s`} · {t.ratio}
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
        {/* A Remotion video: one card — progress, the steps, the storyboard rows. */}
        {(t.status === 'working' || finishing) && motion && (
          // a finished video doesn't just replace the card: the card completes
          // (100 %, every step ticked, "ready"), fades, then the video comes in
          <div className={finishing ? 'transition-all duration-500 ease-out' : ''} style={finishing === 'out' ? { opacity: 0, transform: 'scale(0.98)' } : undefined}>
          <MotionMaking
            progress={finishing ? { ...t.progress, stage: 'done' } : t.progress}
            pct={finishing ? 100 : pct}
            stage={finishing ? 'Your video is ready ✓' : stage}
            elapsed={elapsed}
            request={t.auto ? '' : t.prompt}
            meta={[t.language || 'Khmer', t.ratio, t.brandName].filter(Boolean).join(' · ')}
            onStop={finishing ? undefined : onStop}
          />
          </div>
        )}

        {t.status === 'working' && !motion && (
          <div className="flex w-full flex-col items-start gap-4 sm:flex-row">
          <div className={shape}>
            <GeneratingCanvas icon={t.kind === 'image' ? '✦' : motion ? '✺' : '▶'} stage={stage} />
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand/15">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
              {t.kind === 'image' ? (
                <span className="tabular-nums font-semibold text-ink-700">
                  {queued ? `In queue · ${t.queuedAhead || 0} ahead` : `~${Math.round(pct)}% est`}
                </span>
              ) : (
                <span className="tabular-nums font-semibold text-ink-700">{Math.round(pct)}%</span>
              )}
              <span className="tabular-nums text-ink-400">
                {Math.round(rendering && renderElapsed != null ? renderElapsed : elapsed)}s
              </span>
            </div>
          </div>
          </div>
        )}

        {t.status === 'review' && t.plan && (
          <StoryboardEditor
            plan={t.plan}
            voice={t.voice !== 'none'}
            onChange={onPlanChange}
            onMake={onMake}
            onRewrite={onRewrite}
            // one voice line, read exactly as the video will — same voice, same acting
            // (the template's style); the server keeps it, so Make reuses it
            fetchLine={(text) =>
              api.blob('/ai/motion/say', { brand_id: t.brandId, text, language: t.language || 'Khmer', voice: t.voice || 'female', style: t.plan?.style || '' })
            }
            onError={(e) => showToast(`Couldn’t play the voice — ${e.message}`)}
            onHear={async (text) => {
              try {
                const audio = await api.blob('/ai/motion/say', { brand_id: t.brandId, text, language: t.language || 'Khmer', voice: t.voice || 'female', style: t.plan?.style || '' })
                const url = URL.createObjectURL(audio)
                const el = new Audio(url)
                await new Promise((resolve) => {
                  el.onended = resolve
                  el.onerror = resolve
                  el.play().catch(resolve)
                })
                URL.revokeObjectURL(url)
              } catch (e) {
                showToast(`Couldn’t play it — ${e.message}`)
              }
            }}
          />
        )}

        {t.status === 'failed' && (
          <div className="max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
            <b>{t.error === 'Stopped' ? 'Stopped.' : 'Couldn’t generate.'}</b> {t.error === 'Stopped' ? '' : t.error}
            <button type="button" onClick={onRegenerate} className="ml-2 font-semibold text-brand hover:underline">
              Try again
            </button>
          </div>
        )}

        {t.status === 'done' && url && !finishing && (
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
                  className="block w-full h-auto rounded-2xl bg-night-900 ring-1 ring-ink-900/10 animate-media-reveal"
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
            {making && <MakingDrawer jobId={t.jobId} onClose={() => setMaking(false)} />}
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
              {motion && t.jobId && (
                <IconBtn title="How it was made — script, voice and scenes" onClick={() => setMaking(true)}>
                  <FiLayers size={14} />
                </IconBtn>
              )}
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
                {t.cost ? ` · ~${fmtUSD(t.cost)}` : ''}
              </button>
            </div>
          </>
        )}
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
    <div className="fixed inset-0 z-[120] bg-night-950/90 animate-fadein" onClick={onClose}>
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

function StoryTurn({ t, onEdit, onRetry, onDeleted }) {
  return (
    <div className="space-y-4 animate-fadein">
      <div className="flex flex-col items-end">
        <div className="max-w-[70%] rounded-2xl rounded-br-md bg-brand-soft/70 px-4 py-2.5 text-[13px] leading-relaxed text-ink-900 whitespace-pre-wrap">
          {t.prompt}
        </div>
        <div className="mt-1 flex items-center gap-0.5 text-ink-400">
          <span className="mr-1.5 text-[10.5px]">
            Storyboard · ~{t.seconds}s · {t.ratio} · {t.language || 'No voiceover'}
            {t.brandName ? ` · ${t.brandName}` : ''}
          </span>
          <IconBtn title="Edit idea" onClick={onEdit}>
            <FiEdit2 size={13} />
          </IconBtn>
        </div>
      </div>

      {t.status === 'working' && (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200/60 bg-white px-4 py-3.5 w-fit">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
          <div>
            <div className="text-[12.5px] font-semibold text-ink-800">Writing the storyboard…</div>
            <div className="text-[10.5px] text-ink-400">Scenes, voiceover and on-screen text — about 30 seconds</div>
          </div>
        </div>
      )}
      {t.status === 'failed' && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          {t.error === 'Stopped' ? 'Stopped.' : `Couldn’t write the storyboard — ${t.error}.`}
          <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}
      {t.status === 'done' && t.storyId && (
        <StoryEditor storyId={t.storyId} compact onDeleted={onDeleted} />
      )}
    </div>
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

// One column, one row per setting (label left, choices right) — only the rows
// that apply to what's being made. The ✦ prompt-writer options are tucked
// under "More options" since most people never change them.
const RATIO_SHORT = { '9:16': 'Reels', '1:1': 'Feed', '16:9': 'YouTube' }
const VOICE_SHORT = { English: 'English', Khmer: 'Khmer', 'Khmer + English': 'Both', '': 'None' }

/** A tiny outline of the frame shape, so sizes read at a glance. */
function RatioShape({ id }) {
  const [w, h] = { '9:16': [9, 15], '1:1': [13, 13], '16:9': [17, 10] }[id] || [13, 13]
  return <span className="inline-block flex-none rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} aria-hidden="true" />
}

function SettingsPopover({
  type, setType, ratio, setRatio, seconds, setSeconds, videoMode, setVideoMode, storySeconds, setStorySeconds,
  motionVoice = 'female', setMotionVoice = () => {}, motionMusic = true, setMotionMusic = () => {},
  motionGoal = 'auto', setMotionGoal = () => {},
  motionReview = true, setMotionReview = () => {}, motionLength = 'auto', setMotionLength = () => {},
  motionRatio = '16:9', setMotionRatio = () => {},
  voice, setVoice, brands, brand, setBrand, style, setStyle, template, setTemplate,
  products = [], product, setProduct, onClose,
}) {
  const markOf = useBrandMarks()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const motionReady = useMotionReady() // false: this server can't render Remotion videos
  const brandVoice = !!brands?.find((b) => b.slug === brand)?.voiceReady // its own voice is learned (Brand kit)
  const voiceStatus = useVoiceStatus() // the Gemini voice out for now → Sreymom / Piseth read
  const writers = useWriterModels()
  const story = type === 'video' && videoMode === 'story'
  const motion = type === 'video' && videoMode === 'motion'
  const motionLang = /english/i.test(voice || '') && !/khmer/i.test(voice || '') ? 'English' : 'Khmer'
  const seg = (on) =>
    `h-8 min-w-0 flex-1 rounded-lg px-2 text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
      on ? 'bg-white text-brand shadow-sm' : 'text-ink-600 hover:text-ink-900'
    }`
  const ratios = RATIOS.filter((r) => !(story && r.id === '1:1'))
  const ratioOn = (id) => ratio === id || (story && ratio === '1:1' && id === '9:16')

  // A right-side slide-over drawer, like every form in the app: plain dim
  // backdrop (no blur), ✕ / a tap outside / Esc closes it.
  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in"
      >
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <h2 className="flex-1 text-[15px] font-semibold text-ink-900">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
      <div className="flex rounded-xl bg-ink-100 p-1">
        <button type="button" className={seg(type === 'image')} onClick={() => setType('image')}>
          <FiImage size={14} /> Image
        </button>
        <button type="button" className={seg(type === 'video')} onClick={() => setType('video')}>
          <FiVideo size={14} /> Video
        </button>
      </div>

      <div className="mt-1">
        {type === 'video' && (
          <Row
            label="Type"
            hint={
              story
                ? 'Several 8s scenes joined, with a voiceover'
                : motion
                  ? 'Animated words over your brand photos · Khmer always right · ~45–60s'
                  : 'One clip, ready in a few minutes'
            }
          >
            <Segmented>
              <button type="button" className={seg(!story && !motion)} onClick={() => setVideoMode('clip')}>
                Quick clip
              </button>
              <button type="button" className={seg(story)} onClick={() => setVideoMode('story')}>
                Story
              </button>
              <button
                type="button"
                className={`${seg(motion)} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => setVideoMode('motion')}
                disabled={motionReady === false && !motion}
                title={motionReady === false ? MOTION_OFF_TIP : undefined}
              >
                Remotion
              </button>
            </Segmented>
          </Row>
        )}

        {motion && (
          <Row label="Story" hint={(MOTION_STORIES.find((o) => o.value === motionGoal) || MOTION_STORIES[0]).hint}>
            <Select size="sm" className="min-w-0 flex-1" value={motionGoal} onChange={setMotionGoal} options={STORY_OPTIONS} />
          </Row>
        )}

        {motion && (
          <Row
            label="Size"
            hint={
              motionRatio === 'auto'
                ? 'The AI picks from your brief — wide for YouTube, LinkedIn, a website or a presentation, tall for TikTok and Reels'
                : motionRatio === '16:9'
                  ? 'Wide — Training and the clean / SaaS templates; Sell, Teach, Compare, Poll, Quote and Testimonial stay tall'
                  : 'Vertical — phones, Reels and TikTok'
            }
          >
            <Segmented>
              {[
                ['auto', 'Auto'],
                ['9:16', '9:16'],
                ['16:9', '16:9'],
              ].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setMotionRatio(v)} className={`${seg(motionRatio === v)} px-0 text-[11.5px]`}>
                  {label}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        {motion && (
          <Row
            label="Voice"
            hint={
              motionVoice === 'none'
                ? 'Silent — words only'
                : motionVoice === 'native'
                  ? 'The open-source native Khmer voice (Hugging Face), run on our own server — one voice for all'
                  : motionVoice === 'brand'
                  ? 'The brand’s own recorded voice reads each scene'
                  : brandVoice
                    ? 'A narrator reads each scene · the video follows the voice'
                    : (
                      <>
                        A narrator reads each scene ·{' '}
                        <Link to="/ai?tab=voice" className="font-semibold text-brand hover:underline">
                          use your own voice
                        </Link>
                      </>
                    )
            }
          >
            <Segmented>
              {[
                ...MOTION_VOICES.slice(0, 2),
                ...(brandVoice ? [['brand', 'Brand']] : []),
                // the open-source Khmer voice (Hugging Face) — only where the server runs it
                ...(voiceStatus?.native && motionLang === 'Khmer' ? [['native', 'Native']] : []),
                MOTION_VOICES[2],
              ].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setMotionVoice(v)} className={`${seg(motionVoice === v)} px-0 text-[11.5px]`}>
                  {label}
                </button>
              ))}
            </Segmented>
            {/* the Gemini voice out for now (its daily limit): who reads instead, before anything is made */}
            {voiceStatus?.configured && !voiceStatus.available && !['none', 'native'].includes(motionVoice) && motionLang === 'Khmer' && (
              <p className="mt-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] leading-snug text-ink-600">
                The Gemini voice isn’t available right now —{' '}
                {motionVoice === 'brand' ? (
                  <>your brand voice will be made from {backupName(voiceStatus, 'female')} / {backupName(voiceStatus, 'male')}</>
                ) : (
                  <>
                    <span className="font-semibold text-ink-800">{backupName(voiceStatus, motionVoice)}</span> will read your video
                  </>
                )}
                . You can keep going; Gemini comes back by itself.
              </p>
            )}
          </Row>
        )}

        {motion && (
          <Row label="Language">
            <Segmented>
              {MOTION_LANGS.map((v) => (
                <button key={v} type="button" onClick={() => setVoice(v)} className={`${seg(motionLang === v)} px-0 text-[11.5px]`}>
                  {v}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        {type === 'video' && !motion && (
          <Row label="Length" hint={story ? `${storySeconds / 8} scenes` : undefined}>
            <Segmented>
              {(story ? STORY_LENGTHS : LENGTHS).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => (story ? setStorySeconds(n) : setSeconds(n))}
                  className={`${seg((story ? storySeconds : seconds) === n)} px-0 text-[11.5px]`}
                >
                  {n}s
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        {!motion && (
        <Row label="Size">
          <Segmented>
            {ratios.map((r) => (
              <button
                key={r.id}
                type="button"
                title={r.sub}
                onClick={() => setRatio(r.id)}
                className={`${seg(ratioOn(r.id))} h-auto flex-col gap-0 py-1`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <RatioShape id={r.id} />
                  {r.id}
                </span>
                <span className="text-[10px] font-medium leading-tight opacity-70">{RATIO_SHORT[r.id]}</span>
              </button>
            ))}
          </Segmented>
        </Row>
        )}

        {story && (
          <Row label="Voice">
            <Segmented>
              {[...VOICES, ''].map((v) => (
                <button
                  key={v || 'none'}
                  type="button"
                  title={v || 'No voiceover'}
                  onClick={() => setVoice(v)}
                  className={`${seg(voice === v)} px-0 text-[11.5px]`}
                >
                  {VOICE_SHORT[v]}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        <Row label="Brand">
          <Select
            size="sm"
            align="right"
            value={brand || ''}
            onChange={setBrand}
            options={brands.map((b) => ({ value: b.slug, label: b.name, ...markOf(b) }))}
          />
        </Row>

        {products.length > 1 && (
          <Row label="Product" hint={product ? undefined : 'The AI picks the product your idea is about'}>
            <Select
              size="sm"
              align="right"
              value={product ?? ''}
              onChange={(v) => setProduct(v === '' ? null : Number(v))}
              options={[{ value: '', label: 'Let AI choose' }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Row>
        )}
      </div>

      {/* the settings people change less often — all open; the drawer scrolls */}
      <div className="mt-5 text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">More</div>
        <div>
          <div>
        {motion && (
          <Row
            label="Storyboard"
            hint={
              motionReview
                ? 'Paste your story — the AI plans the scenes, you check and edit them, then make the video'
                : 'Straight to the video — the AI writes and renders it in one go'
            }
          >
            <Segmented>
              {[
                [true, 'Review first'],
                [false, 'Make directly'],
              ].map(([v, label]) => (
                <button key={label} type="button" onClick={() => setMotionReview(v)} className={`${seg(motionReview === v)} px-0 text-[11.5px]`}>
                  {label}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        {motion && motionReview && (
          <Row
            label="Length"
            hint={motionLength === 'auto' ? `As long as your story needs — 30 s to ${motionGoal === 'training' || motionGoal === 'auto' ? '10 min for a training, 2' : '2'} min` : 'About this long'}
          >
            <Segmented>
              {(motionGoal === 'training' || motionGoal === 'auto'
                ? [
                    ['auto', 'Auto'],
                    ['120', '2 min'],
                    ['300', '5 min'],
                    ['600', '10 min'],
                  ]
                : [
                    ['auto', 'Auto'],
                    ['60', '1 min'],
                    ['120', '2 min'],
                  ]
              ).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setMotionLength(v)} className={`${seg(motionLength === v)} px-0 text-[11.5px]`}>
                  {label}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        {motion && (
          <Row label="Music" hint={motionMusic ? 'A track matched to the mood, quiet under the voice' : 'No background music'}>
            <Segmented>
              {[
                [true, 'On'],
                [false, 'Off'],
              ].map(([v, label]) => (
                <button key={label} type="button" onClick={() => setMotionMusic(v)} className={`${seg(motionMusic === v)} px-0 text-[11.5px]`}>
                  {label}
                </button>
              ))}
            </Segmented>
          </Row>
        )}

        <WriterRow />
          </div>
          {!motion && (
            <>
              <Row label="Template" hint={<>Used by <span className="text-brand">✦</span> Write it for me when it turns your idea into a full prompt</>}>
                <Select size="sm" value={template} onChange={setTemplate} options={TEMPLATES[type].map((x) => ({ value: x }))} />
              </Row>
              <Row label="Style">
                <Select size="sm" value={style} onChange={setStyle} options={STYLES.map((x) => ({ value: x }))} />
              </Row>
            </>
          )}
        </div>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

/** "Writer AI": which model writes — shown when the workspace may pick from 2+. */
function WriterRow() {
  const data = useWriterModels()
  const [pick, setPick] = useState(aiModelStore.get())
  if (!data || (data.models || []).length < 2) return null
  return (
    <Row label="Writer AI" hint={writerHint(data, pick)}>
      <WriterModelSelect onPick={setPick} />
    </Row>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-100 py-2.5">
      <div className="w-14 flex-none">
        <div className="text-[12px] font-semibold text-ink-700">{label}</div>
      </div>
      <div className="min-w-0 flex-1">
        {children}
        {/* up to two lines — the whole hint on hover */}
        {hint && (
          <div className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-ink-400" title={typeof hint === 'string' ? hint : undefined}>
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

function Segmented({ children }) {
  return <div className="flex rounded-xl bg-ink-100 p-0.5">{children}</div>
}


function KitChip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft py-0.5 pl-1 pr-1.5 text-[11.5px] font-semibold text-brand">
      {children}
      <button type="button" onClick={onRemove} className="grid h-4 w-4 place-items-center rounded-full hover:bg-brand/15" aria-label="Remove">
        <FiX size={10} />
      </button>
    </span>
  )
}

/** The composer's Brand kit popover: which template to follow, which product
 *  photo to feature, and whether to put the logo on. */
// ``video``: Instant video only uses a product photo, as the clip's first frame.
function KitPopover({ video = false, kit, setKit, templates, logo, products, onManage }) {
  const empty = video ? !products.length : !templates.length && !logo && !products.length
  return (
    <div className="absolute inset-x-2 bottom-full z-30 mb-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-4 shadow-[0_12px_40px_rgba(16,24,40,0.16)] sm:inset-x-auto sm:bottom-11 sm:left-0 sm:mb-0 sm:w-[340px]">
      {empty ? (
        <div className="text-[12.5px] leading-relaxed text-ink-600">
          {video
            ? 'Add product photos to your brand kit — a video can then start from the real product instead of one the AI invents.'
            : 'Add your logo, product photos and posters you like — every image can then follow your style.'}
          <button type="button" onClick={onManage} className="mt-2 block font-semibold text-brand hover:underline">
            Set up the brand kit →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {!video && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">Follow a poster template</div>
              {templates.length ? (
                <TemplatePicker templates={templates} value={kit.templateId} onChange={(templateId) => setKit((k) => ({ ...k, templateId }))} />
              ) : (
                <div className="text-[11.5px] text-ink-400">No templates yet.</div>
              )}
            </div>
          )}
          {products.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-700">
                {video ? 'Start the video from a product photo' : 'Show a product photo'}
              </div>
              {video && (
                <p className="mb-1.5 text-[11px] leading-snug text-ink-500">
                  The photo is the first frame and the AI brings it to life, so the video shows your real product.
                  Use a photo without people’s faces.
                </p>
              )}
              <Select
                value={kit.productId ?? ''}
                onChange={(v) => setKit((k) => ({ ...k, productId: v === '' ? null : v }))}
                options={[{ value: '', label: 'No product photo' }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
                buttonClassName="text-[12px]"
              />
            </div>
          )}
          {logo && !video && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-700">
                <img src={kitSrc(logo.url)} alt="" className="h-6 w-6 object-contain" /> Put my logo on it
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={kit.logo}
                aria-label="Put my logo on it"
                onClick={() => setKit((k) => ({ ...k, logo: !k.logo }))}
                className={`relative h-5 w-9 flex-none rounded-full transition-colors duration-150 ${kit.logo ? 'bg-brand' : 'bg-ink-200'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150 ${kit.logo ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          )}
          <button type="button" onClick={onManage} className="text-[11.5px] font-semibold text-ink-500 hover:text-brand">
            Manage brand kit →
          </button>
        </div>
      )}
    </div>
  )
}
