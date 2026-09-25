import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiFilm, FiLayers, FiRefreshCw, FiZap } from 'react-icons/fi'
import { api } from '../api/client'
import AutoTextarea from '../components/ui/AutoTextarea'
import StoryEditor, { StatusPill, storyInput as input } from '../components/story/StoryEditor'
import { useStore } from '../store'

// Video stories on their own page: the list, a full create form, and one
// story full-size (/story?id= — where the "scenes ready" notifications land).
// The same stories are also made inline in AI Agent (Video → Storyboard).

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

const LANGUAGES = ['English', 'Khmer', 'Khmer + English']

function when(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const seconds = (Date.now() - date.getTime()) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function sceneCount(totalSeconds, sceneSeconds) {
  return Math.max(1, Math.min(Math.round(totalSeconds / sceneSeconds), Math.floor(64 / sceneSeconds)))
}

export default function VideoStoryPage() {
  const { brands, activeBrand, showToast } = useStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const [stories, setStories] = useState(null)
  const [products, setProducts] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [creation, setCreation] = useState({
    idea: '',
    brand_id: null,
    product_ids: [],
    total_seconds: 32,
    scene_seconds: 8,
    aspect_ratio: '9:16',
    language: 'English',
  })
  const [busy, setBusy] = useState('')

  const loadStories = useCallback(async () => {
    try {
      const rows = await api.get('/ai/story')
      setStories(rows || [])
      setLoadError('')
      return rows || []
    } catch (e) {
      setStories([])
      setLoadError(e.message)
      return []
    }
  }, [])

  useEffect(() => {
    if (selectedId) return
    loadStories()
    api.get('/products').then(setProducts).catch(() => setProducts([]))
  }, [loadStories, selectedId])

  useEffect(() => {
    if (!brands.length) return
    setCreation((current) => {
      if (current.brand_id && brands.some((brand) => brand.id === current.brand_id)) return current
      const brand = brands.find((item) => item.slug === activeBrand) || brands[0]
      return { ...current, brand_id: brand?.id ?? null, language: brand?.lang || 'English' }
    })
  }, [activeBrand, brands])

  const brandProducts = useMemo(
    () => (products || []).filter((product) => product.brand_id === creation.brand_id),
    [creation.brand_id, products],
  )

  const updateCreation = (patch) => setCreation((current) => ({ ...current, ...patch }))

  const selectBrand = (brandId) => {
    const brand = brands.find((item) => item.id === brandId)
    setCreation((current) => ({
      ...current,
      brand_id: brandId || null,
      product_ids: [],
      language: brand?.lang || 'English',
    }))
  }

  const toggleProduct = (productId) => {
    setCreation((current) => ({
      ...current,
      product_ids: current.product_ids.includes(productId)
        ? current.product_ids.filter((id) => id !== productId)
        : [...current.product_ids, productId],
    }))
  }

  const createStory = async (event) => {
    event.preventDefault()
    const idea = creation.idea.trim()
    if (!idea || !creation.brand_id || busy) return
    setBusy('create')
    try {
      const created = await api.post('/ai/story', {
        idea,
        brand_id: creation.brand_id,
        product_ids: creation.product_ids,
        total_seconds: Number(creation.total_seconds),
        scene_seconds: Number(creation.scene_seconds),
        aspect_ratio: creation.aspect_ratio,
        language: creation.language,
      })
      setCreation((current) => ({ ...current, idea: '', product_ids: [] }))
      showToast('Storyboard ready — review it before rendering')
      navigate(`/story?id=${created.id}`)
    } catch (e) {
      showToast(`Could not create the storyboard — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  if (selectedId) {
    return (
      <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
        <button type="button" onClick={() => navigate('/story')} className="btn-ghost mb-4 -ml-3">
          <FiArrowLeft size={15} /> All video stories
        </button>
        <StoryEditor key={selectedId} storyId={selectedId} onDeleted={() => navigate('/story')} />
      </div>
    )
  }

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6">
        <h1 className="page-title">Video story</h1>
        <p className="page-sub mt-1">
          Turn a product idea into a longer promo, scene by scene. The AI writes the storyboard, then renders and joins every clip into one video.
        </p>
      </div>

      {loadError && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          Could not load video stories: {loadError}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,.8fr)] items-start">
        <form onSubmit={createStory} className={`${card} p-5 lg:p-6`}>
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center flex-none">
              <FiFilm size={19} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-ink-900">Start a new story</h2>
              <p className="mt-0.5 text-[12px] text-ink-500">Describe the video you want. Product details keep the script factual.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Brand</span>
              <select
                value={creation.brand_id || ''}
                onChange={(event) => selectBrand(Number(event.target.value))}
                disabled={!brands.length}
                className={input}
              >
                {!brands.length && <option value="">Create a brand first</option>}
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Voiceover</span>
              <select
                value={creation.language}
                onChange={(event) => updateCreation({ language: event.target.value })}
                className={input}
              >
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
                <option value="">No voiceover</option>
              </select>
            </label>
          </div>

          <label className="block mt-4">
            <span className="label">Video idea</span>
            <AutoTextarea
              autoFocus
              minRows={5}
              maxRows={16}
              maxLength={10000}
              value={creation.idea}
              onChange={(event) => updateCreation({ idea: event.target.value })}
              placeholder="A launch film that shows the morning problem, introduces the product, proves the result, and ends with a clear call to action…"
              className={input}
            />
            <span className="mt-1.5 block text-[10.5px] text-ink-400">{creation.idea.length}/10000</span>
          </label>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="label mb-0">Products to use</span>
              {brandProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateCreation({ product_ids: [] })}
                  className={`text-[10.5px] font-bold ${creation.product_ids.length ? 'text-brand' : 'text-ink-400'}`}
                >
                  {creation.product_ids.length ? 'Use all products' : 'Using all products'}
                </button>
              )}
            </div>
            {!creation.brand_id ? (
              <div className="rounded-xl border border-dashed border-ink-200 px-4 py-5 text-center text-[11.5px] text-ink-400">
                Choose a brand to ground the story in its product information.
              </div>
            ) : products === null ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="h-14 rounded-xl skeleton" />
                <div className="h-14 rounded-xl skeleton" />
              </div>
            ) : brandProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-200 px-4 py-5 text-center">
                <p className="text-[11.5px] text-ink-400">No products saved for this brand yet.</p>
                <button type="button" onClick={() => navigate('/products')} className="mt-2 text-[11px] font-bold text-brand hover:underline">
                  Add a product
                </button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {brandProducts.map((product) => {
                  const selected = creation.product_ids.includes(product.id)
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => toggleProduct(product.id)}
                      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-brand-line bg-brand-soft'
                          : 'border-ink-200 bg-white hover:border-brand-line'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded grid place-items-center flex-none border ${
                          selected ? 'bg-brand border-brand text-white' : 'border-ink-300'
                        }`}
                      >
                        {selected && <FiCheck size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] font-semibold text-ink-800">{product.name}</span>
                        <span className="block truncate text-[10.5px] text-ink-400">
                          {product.highlights || product.description || 'Product details'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label>
              <span className="label">Format</span>
              <select
                value={creation.aspect_ratio}
                onChange={(event) => updateCreation({ aspect_ratio: event.target.value })}
                className={input}
              >
                <option value="9:16">9:16 · Vertical</option>
                <option value="16:9">16:9 · Landscape</option>
              </select>
            </label>
            <label>
              <span className="label">Length</span>
              <select
                value={creation.total_seconds}
                onChange={(event) => updateCreation({ total_seconds: Number(event.target.value) })}
                className={input}
              >
                {[8, 16, 24, 32, 48, 64].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    About {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Clip length</span>
              <select
                value={creation.scene_seconds}
                onChange={(event) => updateCreation({ scene_seconds: Number(event.target.value) })}
                className={input}
              >
                <option value={4}>4 seconds</option>
                <option value={8}>8 seconds</option>
                <option value={12}>12 seconds</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              <FiLayers size={14} />
              {sceneCount(creation.total_seconds, creation.scene_seconds)} scenes · up to 2 render at once
            </div>
            <button
              type="submit"
              disabled={!brands.length || !creation.brand_id || creation.idea.trim().length < 3 || busy === 'create'}
              className="btn-primary"
            >
              {busy === 'create' ? (
                <>
                  <span className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Writing storyboard…
                </>
              ) : (
                <>
                  <FiZap size={14} /> Write storyboard
                </>
              )}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className={`${card} p-5`}>
            <h2 className="text-[13.5px] font-bold text-ink-900">How it works</h2>
            <div className="mt-4 space-y-4">
              {[
                ['1', 'Storyboard', 'Review the title, shared look, visuals, voiceover and on-screen text.'],
                ['2', 'Render scenes', 'Approve the script and the video service renders each clip in the background.'],
                ['3', 'Join and publish', 'Review every scene, fix any failures, then create the final video for Library.'],
              ].map(([number, title, text]) => (
                <div key={number} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-soft text-brand grid place-items-center text-[10.5px] font-bold flex-none">
                    {number}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold text-ink-800">{title}</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-100">
              <h2 className="text-[13.5px] font-bold text-ink-900">Recent stories</h2>
              <button type="button" onClick={loadStories} className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Refresh stories">
                <FiRefreshCw size={14} />
              </button>
            </div>
            {stories === null ? (
              <div className="space-y-2 p-4">
                <div className="h-16 rounded-xl skeleton" />
                <div className="h-16 rounded-xl skeleton" />
              </div>
            ) : stories.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <FiFilm size={22} className="mx-auto text-ink-300" />
                <p className="mt-2 text-[11.5px] text-ink-400">Your video stories will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-ink-100">
                {stories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/story?id=${item.id}`)}
                    className="w-full px-5 py-3.5 text-left hover:bg-ink-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink-800">{item.title}</span>
                      <span className="ml-auto flex-none text-[10px] text-ink-400">{when(item.updated_at)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <StatusPill status={item.status} />
                      <span className="text-[10.5px] text-ink-400">{item.scenes} scenes · {item.total_seconds}s</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

    </div>
  )
}
