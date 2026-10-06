import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FiPlus } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'
import AutoTextarea from '../ui/AutoTextarea'
import Select from '../ui/Select'
import StoryEditor, { storyInput } from '../story/StoryEditor'

// Content studio → Video builder. No video open: the brief on the left and the
// clip board (dimmed preview + recent videos) on the right. A video open
// (?story=<id>): StoryEditor's studio layout — its brief, clips, timeline.

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const LANGUAGES = [
  { value: 'Khmer', label: 'Khmer voice-over' },
  { value: 'English', label: 'English voice-over' },
  { value: 'Khmer + English', label: 'Khmer + English' },
  { value: '', label: 'No voice-over' },
]
const STEPS = [
  ['Hook', 'from-amber-600 to-amber-800'],
  ['Problem', 'from-rose-600 to-rose-800'],
  ['Solution', 'from-sky-600 to-sky-800'],
  ['Proof', 'from-emerald-600 to-emerald-800'],
  ['Call to action', 'from-violet-600 to-violet-800'],
]

const chip = (on) =>
  `rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
    on ? 'bg-brand-soft text-brand ring-1 ring-brand-line' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70'
  }`

const langFor = (brand) =>
  /khmer/i.test(brand?.lang || '') ? (/english/i.test(brand.lang) ? 'Khmer + English' : 'Khmer') : 'English'

export default function VideoBuilder() {
  const { brands, activeBrand, showToast } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const storyId = params.get('story')

  const [brandId, setBrandId] = useState(null)
  const [idea, setIdea] = useState('')
  const [productId, setProductId] = useState(0) // 0 = all of the brand's products
  const [audience, setAudience] = useState('')
  const [language, setLanguage] = useState('English')
  const [seconds, setSeconds] = useState(40)
  const [aspect, setAspect] = useState('9:16')
  const [busy, setBusy] = useState(false)
  const [products, setProducts] = useState([])
  const [audiences, setAudiences] = useState([])
  const [recent, setRecent] = useState([])

  const brand = brands.find((b) => b.id === brandId) || brands.find((b) => b.slug === activeBrand) || brands[0]

  // A post handed over from Plan & best time ("Make content →") becomes the brief.
  useEffect(() => {
    const s = location.state
    if (!s?.studio) return
    const from = brands.find((b) => b.slug === s.brandSlug)
    if (from) setBrandId(from.id)
    setIdea([s.topic, s.extra].filter(Boolean).join('\n\n'))
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!brand) return
    setLanguage(langFor(brand))
    setProductId(0)
    let live = true
    api.get('/products').then((rows) => live && setProducts((rows || []).filter((p) => p.brand_id === brand.id))).catch(() => {})
    // Audiences the AI found bringing this brand leads (Insights → What brings leads).
    api
      .get(`/views/insights/boosts?brand_id=${brand.id}`)
      .then((r) => live && setAudiences((r.what_works || []).filter((w) => w.field === 'audience').map((w) => w.value)))
      .catch(() => live && setAudiences([]))
    return () => {
      live = false
    }
  }, [brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (storyId) return
    api.get('/ai/story').then((r) => setRecent((r || []).slice(0, 5))).catch(() => {})
  }, [storyId])

  const productOptions = useMemo(
    () => [{ value: 0, label: 'All products' }, ...products.map((p) => ({ value: p.id, label: p.name }))],
    [products],
  )

  const write = async () => {
    if (busy || !brand || idea.trim().length < 3) return
    setBusy(true)
    try {
      const made = await api.post('/ai/story', {
        idea: audience.trim() ? `${idea.trim()}\n\nAudience: ${audience.trim()}` : idea.trim(),
        brand_id: brand.id,
        product_ids: productId ? [productId] : [],
        total_seconds: seconds,
        scene_seconds: 8,
        aspect_ratio: aspect,
        language,
      })
      setParams({ tab: 'video', story: String(made.id) })
      showToast('Clips written — check them, then generate')
    } catch (e) {
      showToast(`Could not write the clips — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (storyId) {
    return (
      <div>
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setParams({ tab: 'video' })} className="btn-outline">
            <FiPlus size={14} /> New video
          </button>
        </div>
        <StoryEditor key={storyId} storyId={storyId} onDeleted={() => setParams({ tab: 'video' })} />
      </div>
    )
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      {/* ── Brief ── */}
      <section className={`${card} p-5`}>
        <h2 className="text-[15px] font-semibold text-ink-900">Brief</h2>
        {brands.length > 1 ? (
          <div className="mt-3">
            <Select value={brand?.id} onChange={setBrandId} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
        ) : (
          brand && <p className="mt-0.5 text-[12px] text-ink-500">{brand.name}</p>
        )}

        <label className="mt-4 block">
          <span className="label">What should this post do?</span>
          <AutoTextarea
            minRows={4}
            maxRows={14}
            maxLength={4000}
            className={storyInput}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Show shop owners that our AI answers price and stock questions at night, and books the order. End with: Message us DEMO."
          />
        </label>

        <div className="mt-4">
          <span className="label">Product</span>
          <Select size="lg" value={productId} onChange={setProductId} options={productOptions} disabled={!products.length} />
        </div>

        <div className="mt-4">
          <span className="label">Audience segment</span>
          {audiences.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {audiences.map((a) => (
                <button key={a} type="button" onClick={() => setAudience(audience === a ? '' : a)} className={chip(audience === a)}>
                  {a}
                </button>
              ))}
            </div>
          )}
          <input
            className={storyInput}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who is it for? e.g. retail shop owners"
          />
          {audiences.length > 0 && <p className="mt-1.5 text-[10.5px] text-ink-400">Suggested: the audiences that have brought this brand leads.</p>}
        </div>

        <div className="mt-4">
          <span className="label">Language</span>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button key={l.label} type="button" onClick={() => setLanguage(l.value)} className={chip(language === l.value)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <span className="label">Length</span>
            <Select size="lg" value={seconds} onChange={setSeconds} options={[16, 24, 32, 40, 48].map((n) => ({ value: n, label: `${n / 8} clips · ${n} s` }))} />
          </div>
          <div>
            <span className="label">Format</span>
            <Select
              size="lg"
              value={aspect}
              onChange={setAspect}
              options={[
                { value: '9:16', label: '9:16 · Vertical' },
                { value: '16:9', label: '16:9 · Landscape' },
              ]}
            />
          </div>
        </div>

        <button type="button" onClick={write} disabled={busy || !brand || idea.trim().length < 3} className="btn-primary mt-5 w-full justify-center">
          {busy ? 'Writing the clips…' : 'Write the clips'}
        </button>
        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">
          Writing the clips costs a little AI credit. Making the video costs more — you see the price before anything is made.
        </p>
      </section>

      {/* ── The clip board, before there is a video ── */}
      <div className="min-w-0 space-y-4">
        <div className="relative">
          <div className="pointer-events-none grid select-none gap-4 opacity-60 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5" aria-hidden="true">
            {STEPS.slice(0, Math.min(5, seconds / 8)).map(([name, color], i) => (
              <div key={name} className={`${card} overflow-hidden`}>
                <div className={`relative flex aspect-[16/11] items-end bg-gradient-to-br ${color} p-3`}>
                  <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">Clip {i + 1} · 8 s</span>
                  <span className="text-[14px] font-bold text-white">{name}</span>
                </div>
                <div className="space-y-2 p-3.5">
                  <div className="h-2.5 w-11/12 rounded bg-ink-100" />
                  <div className="h-2.5 w-3/4 rounded bg-ink-100" />
                  <div className="h-2.5 w-1/2 rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="rounded-2xl border border-ink-200/70 bg-white/95 px-6 py-4 text-center shadow-md">
              <p className="text-[14px] font-semibold text-ink-900">Your clips will appear here</p>
              <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-ink-500">
                Fill in the brief and press <b>Write the clips</b>. You check and edit every clip before anything is made.
              </p>
            </div>
          </div>
        </div>

        <section className={`${card} p-5`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold text-ink-900">Timeline</h3>
            <span className="font-mono text-[11.5px] text-ink-400">0:00 — 0:{String(seconds).padStart(2, '0')}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: seconds / 8 }, (_, i) => (
              <div key={i} className="flex-1 rounded-md bg-ink-100 px-2.5 py-2 text-[11px] font-semibold text-ink-400">
                Clip {i + 1}
              </div>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className={`${card} flex flex-wrap items-center gap-2 p-4`}>
            <span className="mr-1 text-[12px] font-semibold text-ink-700">Recent videos</span>
            {recent.map((r) => (
              <button key={r.id} type="button" onClick={() => setParams({ tab: 'video', story: String(r.id) })} className={chip(false)}>
                {r.title}
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
