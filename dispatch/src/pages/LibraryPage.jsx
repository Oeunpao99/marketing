import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'
import { handoff } from '../lib/handoff'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }
const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (u) => `${mediaBase}${u}`

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { brands, showToast } = useStore()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [open, setOpen] = useState(null) // item in the lightbox
  const [confirmItem, setConfirmItem] = useState(null) // item awaiting delete

  const load = () =>
    api.get('/views/library').then(setItems).catch(() => setItems([]))

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter(
      (it) =>
        (brandFilter === 'all' || it.brand_slug === brandFilter || (brandFilter === 'none' && !it.brand_slug)) &&
        (kindFilter === 'all' || it.kind === kindFilter),
    )
  }, [items, brandFilter, kindFilter])

  const counts = useMemo(() => {
    const c = { all: items?.length || 0 }
    for (const it of items || []) c[it.brand_slug || 'none'] = (c[it.brand_slug || 'none'] || 0) + 1
    return c
  }, [items])

  const usePost = (it) => {
    handoff.set({
      name: it.filename,
      size: 0,
      kind: it.kind,
      url: abs(it.url),
      videoId: it.video_id,
    })
    navigate('/new')
  }

  const remove = async (it) => {
    try {
      await api.del(`/views/library/${it.id}`)
      setItems((xs) => xs.filter((x) => x.id !== it.id))
      setOpen(null)
      setConfirmItem(null)
      showToast('Deleted')
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
      setConfirmItem(null)
    }
  }

  const brandTabs = [
    { id: 'all', name: 'All' },
    ...brands.map((b) => ({ id: b.slug, name: b.name })),
    ...(counts.none ? [{ id: 'none', name: 'No brand' }] : []),
  ]

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6">
        <h1 className="font-display text-[34px] lg:text-[42px] leading-tight tracking-tight text-ink-900">
          Library
        </h1>
        <p className="mt-1.5 text-ink-500 text-[15px]">
          Every image and video the AI agent has made, newest first.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {brandTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setBrandFilter(t.id)}
            className={`px-3.5 py-2 rounded-xl border text-[13px] font-semibold flex items-center gap-2 transition-all duration-150 ${
              brandFilter === t.id ? 'border-brand bg-brand/5 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'
            }`}
          >
            {t.id !== 'all' && t.id !== 'none' && (
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: BRAND_COLORS[t.id] || '#166432' }} />
            )}
            {t.name}
            {counts[t.id] != null && <span className="text-ink-400 font-medium">{counts[t.id]}</span>}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-200" />
        {['all', 'image', 'video'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKindFilter(k)}
            className={`px-3 py-2 rounded-xl border text-[13px] font-semibold capitalize transition-all duration-150 ${
              kindFilter === k ? 'border-brand bg-brand/5 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'
            }`}
          >
            {k === 'all' ? 'All types' : `${k}s`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {items === null ? (
        <div className="py-20 text-center text-ink-400 text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-[15px] font-semibold text-ink-700">Nothing here yet</div>
          <div className="text-[13px] text-ink-400 mt-1">
            Generate an image or video in the{' '}
            <button type="button" onClick={() => navigate('/ai')} className="text-brand font-semibold hover:underline">
              AI agent
            </button>{' '}
            and it lands here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((it) => (
            <div
              key={it.id}
              className="group relative rounded-2xl overflow-hidden border border-ink-100 bg-white flex flex-col hover:shadow-card transition-all duration-150"
            >
              <button
                type="button"
                onClick={() => setOpen(it)}
                className="block w-full aspect-square bg-ink-50 relative grid place-items-center"
              >
                {it.kind === 'image' ? (
                  <img src={abs(it.url)} alt="" className="w-full h-full object-contain" loading="lazy" />
                ) : (
                  <video src={abs(it.url)} className="w-full h-full object-contain" muted preload="metadata" />
                )}

                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-ink-900/70 text-white text-[10px] font-bold uppercase tracking-wide">
                  {it.kind}
                </span>
              </button>

              <div className="p-2.5 flex-1">
                <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: BRAND_COLORS[it.brand_slug] || '#94a3b8' }} />
                  <span className="truncate font-semibold text-ink-700">{it.brand_name}</span>
                  <span className="ml-auto flex-none text-ink-400">{when(it.created_at)}</span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-400 line-clamp-2 leading-snug">{it.prompt}</p>
                {it.total_tokens > 0 && (
                  <div className="mt-1 text-[10.5px] font-mono text-ink-300">
                    {it.total_tokens.toLocaleString()} tokens
                  </div>
                )}
              </div>

              {/* actions */}
              <div className="p-2 flex gap-1.5 border-t border-ink-100 bg-white">
                <button
                  type="button"
                  onClick={() => usePost(it)}
                  className="flex-1 px-2 py-1.5 rounded-lg gradient-brand text-white text-[11.5px] font-bold"
                >
                  Use →
                </button>
                <a
                  href={abs(it.url)}
                  download={it.filename}
                  className="px-2 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-600 text-[11.5px] font-bold hover:bg-ink-50"
                >
                  ↓
                </a>
                <button
                  type="button"
                  onClick={() => setConfirmItem(it)}
                  className="px-2 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-500 text-[11.5px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10 animate-fadein"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-3xl overflow-hidden max-w-6xl w-full max-h-full flex flex-col lg:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-ink-950 flex items-center justify-center lg:w-[62%] p-3 min-h-0">
              {open.kind === 'image' ? (
                <img src={abs(open.url)} alt="" className="max-h-[75vh] w-auto h-auto max-w-full object-contain rounded-xl animate-media-reveal" />
              ) : (
                <video src={abs(open.url)} controls autoPlay className="max-h-[75vh] w-auto max-w-full rounded-xl" />
              )}
            </div>
            <div className="flex-1 p-5 lg:p-6 flex flex-col min-w-0">
              <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: BRAND_COLORS[open.brand_slug] || '#94a3b8' }} />
                <span className="font-semibold text-ink-800">{open.brand_name}</span>
                <span className="text-ink-300">·</span>
                <span className="capitalize">{open.kind}</span>
                <span className="text-ink-300">·</span>
                <span>{open.aspect_ratio}</span>
                {open.resolution && <><span className="text-ink-300">·</span><span>{open.resolution}</span></>}
                {open.total_tokens > 0 && (
                  <><span className="text-ink-300">·</span><span className="font-mono">{open.total_tokens.toLocaleString()} tok</span></>
                )}
                <span className="ml-auto text-ink-400">{when(open.created_at)}</span>
              </div>
              <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-400">Prompt</div>
              <p className="mt-1 text-[13px] text-ink-700 leading-relaxed overflow-y-auto flex-1 pr-1">
                {open.prompt}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => usePost(open)}
                  className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[13px] font-bold hover:shadow-glow-lg transition-all duration-200"
                >
                  Use → create a post
                </button>
                <a
                  href={abs(open.url)}
                  download={open.filename}
                  className="px-4 py-2.5 rounded-xl border border-ink-300 text-ink-700 text-[13px] font-bold hover:bg-ink-50"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setConfirmItem(open)}
                  className="px-4 py-2.5 rounded-xl border border-ink-200 text-ink-500 text-[13px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="ml-auto px-4 py-2.5 rounded-xl text-ink-500 text-[13px] font-bold hover:bg-ink-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    {/* Delete confirmation */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-[60] bg-ink-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadein"
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-dock max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 grid place-items-center mb-3">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                <path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-[16px] font-display text-ink-900 tracking-tight">Delete this generation?</h3>
            <p className="mt-1 text-[13px] text-ink-500 leading-relaxed">
              This cannot be undone. {confirmItem.filename} will be permanently removed from the library.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-[13px] font-bold hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove(confirmItem)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
