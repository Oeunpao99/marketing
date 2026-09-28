import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiDownload,
  FiImage,
  FiMoreHorizontal,
  FiPlay,
  FiRefreshCw,
  FiSend,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import { api } from '../api/client'
import AutoTextarea from '../components/ui/AutoTextarea'
import Select from '../components/ui/Select'
import { ANGLE_LABELS, GOAL_LABELS } from '../lib/angles'
import { colorForBrand } from '../lib/brandColor'
import { isKhmer } from '../lib/format'
import { handoff } from '../lib/handoff'
import { useStore } from '../store'

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (u) => `${mediaBase}${u}`

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const chip = (on) =>
  `px-3 py-1.5 rounded-xl border text-[12px] font-semibold flex items-center gap-2 transition-all duration-150 ${
    on ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-line'
  }`

const STATUS_FILTERS = [
  { id: 'all', name: 'Everything' },
  { id: 'ready', name: 'Caption ready' },
  { id: 'unposted', name: 'Not posted yet' },
]

export default function LibraryPage() {
  const navigate = useNavigate()
  const { brands, showToast } = useStore()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openId, setOpenId] = useState(null) // item in the detail panel
  const [confirmItem, setConfirmItem] = useState(null) // item awaiting delete
  const [writing, setWriting] = useState({}) // job id -> true while "Write caption" runs

  const load = useCallback(() => api.get('/views/library').then(setItems).catch(() => setItems([])), [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Captions are written in the background right after a render — keep
  // checking while any is still being written.
  const anyWriting = (items || []).some((it) => it.caption_status === 'writing')
  useEffect(() => {
    if (!anyWriting) return undefined
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [anyWriting, load])

  const patchItem = (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const open = (items || []).find((x) => x.id === openId) || null

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter(
      (it) =>
        (brandFilter === 'all' || it.brand_slug === brandFilter || (brandFilter === 'none' && !it.brand_slug)) &&
        (kindFilter === 'all' || it.kind === kindFilter) &&
        (statusFilter === 'all' ||
          (statusFilter === 'ready' && it.caption) ||
          (statusFilter === 'unposted' && !it.posted_count)),
    )
  }, [items, brandFilter, kindFilter, statusFilter])

  const counts = useMemo(() => {
    const c = { all: items?.length || 0 }
    for (const it of items || []) c[it.brand_slug || 'none'] = (c[it.brand_slug || 'none'] || 0) + 1
    return c
  }, [items])

  const usePost = (it, caption = it.caption) => {
    handoff.set({
      name: it.filename,
      size: 0,
      kind: it.kind,
      url: abs(it.url),
      videoId: it.video_id,
      caption: caption || '',
      source: 'Library',
    })
    navigate('/new')
  }

  const writeCaption = async (it, opts = {}) => {
    setWriting((w) => ({ ...w, [it.id]: true }))
    try {
      const res = await api.post(`/views/library/${it.id}/caption`, opts)
      patchItem(it.id, res)
      showToast('Caption ready')
    } catch (e) {
      showToast(`Could not write a caption — ${e.message}`)
    } finally {
      setWriting((w) => ({ ...w, [it.id]: false }))
    }
  }

  const remove = async (it) => {
    try {
      await api.del(`/views/library/${it.id}`)
      setItems((xs) => xs.filter((x) => x.id !== it.id))
      setOpenId(null)
      setConfirmItem(null)
      showToast('Deleted')
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
      setConfirmItem(null)
    }
  }

  const brandTabs = [
    { id: 'all', name: 'All brands' },
    ...brands.map((b) => ({ id: b.slug, name: b.name })),
    ...(counts.none ? [{ id: 'none', name: 'No brand' }] : []),
  ]

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6">
        <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Library</h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Every image and video the AI made — each with a caption ready to post. Pick one and you’re one click from publishing.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {brandTabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setBrandFilter(t.id)} className={chip(brandFilter === t.id)}>
            {t.id !== 'all' && t.id !== 'none' && (
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: colorForBrand(t.id) }} />
            )}
            {t.name}
            {counts[t.id] != null && <span className="text-ink-400 font-medium">{counts[t.id]}</span>}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-200" />
        {['all', 'image', 'video'].map((k) => (
          <button key={k} type="button" onClick={() => setKindFilter(k)} className={chip(kindFilter === k)}>
            {k === 'all' ? 'All types' : k === 'image' ? 'Images' : 'Videos'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-200" />
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setStatusFilter(f.id)} className={chip(statusFilter === f.id)}>
            {f.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      {items === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-ink-100 bg-white overflow-hidden">
              <div className="aspect-[4/5] skeleton" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-2/3 rounded skeleton" />
                <div className="h-3 w-full rounded skeleton" />
                <div className="h-3 w-5/6 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-[14px] font-semibold text-ink-700">
            {items.length ? 'Nothing matches these filters' : 'Nothing here yet'}
          </div>
          <div className="text-[12px] text-ink-400 mt-1">
            Generate an image or video in the AI agent — it lands here with a caption ready.
          </div>
          {!items.length && (
            <button type="button" onClick={() => navigate('/ai')} className="btn-primary mt-4">
              Open the AI agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filtered.map((it) => (
            <LibraryCard
              key={it.id}
              it={it}
              busy={!!writing[it.id]}
              onOpen={() => setOpenId(it.id)}
              onUse={() => usePost(it)}
              onWrite={() => writeCaption(it)}
              onDelete={() => setConfirmItem(it)}
            />
          ))}
        </div>
      )}

      {open && (
        <DetailPanel
          it={open}
          busy={!!writing[open.id]}
          onClose={() => setOpenId(null)}
          onUse={(text) => usePost(open, text)}
          onDelete={() => setConfirmItem(open)}
          onRewrite={(opts) => writeCaption(open, opts)}
          onSaved={(patch) => patchItem(open.id, patch)}
          showToast={showToast}
        />
      )}

      {confirmItem &&
        createPortal(
          <div className="fixed inset-0 z-[120] grid place-items-center glass-overlay p-4 animate-fadein" onClick={() => setConfirmItem(null)}>
            <div className="w-full max-w-sm rounded-3xl glass-panel p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 text-[14px] font-bold text-ink-800">
                <FiTrash2 size={15} className="text-red-600" /> Delete this {confirmItem.kind}?
              </div>
              <p className="mt-2 text-[12px] text-ink-600 leading-relaxed">
                It and its caption are removed from the Library for good. Posts already published with it stay online.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmItem(null)} className="btn-ghost px-3.5 py-1.5">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => remove(confirmItem)}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Where a Library item's caption stands — writing, ready, failed, or none yet. */
function CaptionState({ it, busy, onWrite }) {
  if (busy || it.caption_status === 'writing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand">
        <FiRefreshCw size={11} className="animate-spin" /> Writing caption…
      </span>
    )
  }
  if (it.caption) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <FiCheck size={12} className="flex-none" />
        <span className="truncate">Caption ready{it.caption_angle && ANGLE_LABELS[it.caption_angle] ? ` · ${ANGLE_LABELS[it.caption_angle]}` : ''}</span>
      </span>
    )
  }
  if (!it.brand_slug) return <span className="text-[11px] text-ink-400">Pick a brand to write a caption</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onWrite()
      }}
      className="text-[11px] font-semibold text-brand hover:underline"
    >
      ✨ {it.caption_status === 'failed' ? 'Try writing the caption again' : 'Write caption'}
    </button>
  )
}

function LibraryCard({ it, busy, onOpen, onUse, onWrite, onDelete }) {
  const [menu, setMenu] = useState(false)
  const caption = it.caption || ''
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card hover:shadow-card-hover transition-all duration-150">
      <button type="button" onClick={onOpen} className="relative block aspect-[4/5] w-full overflow-hidden bg-ink-50">
        {it.kind === 'image' ? (
          <img src={abs(it.url)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <>
            <video src={`${abs(it.url)}#t=0.1`} className="h-full w-full object-cover" muted preload="metadata" playsInline />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white">
                <FiPlay size={15} className="ml-0.5" />
              </span>
            </span>
          </>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {it.kind === 'image' ? <FiImage size={10} /> : <FiPlay size={10} />}
          {it.kind === 'video' && it.seconds ? `${it.seconds}s` : it.kind}
        </span>
        {it.posted_count > 0 && (
          <span className="absolute right-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-ink-700">
            Posted{it.posted_count > 1 ? ` · ${it.posted_count}×` : ''}
          </span>
        )}
      </button>

      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="flex-1 cursor-pointer p-3 text-left">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: colorForBrand(it.brand_slug) }} />
          <span className="truncate font-semibold text-ink-700">{it.brand_name}</span>
          <span className="ml-auto flex-none text-ink-400">{when(it.created_at)}</span>
        </div>
        {caption ? (
          <p className={`mt-1.5 line-clamp-3 whitespace-pre-line text-[12px] leading-snug text-ink-800 ${isKhmer(caption) ? 'font-khmer' : ''}`}>
            {caption}
          </p>
        ) : (
          <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-ink-400 italic">No caption yet</p>
        )}
        <div className="mt-2">
          <CaptionState it={it} busy={busy} onWrite={onWrite} />
        </div>
      </div>

      <div className="flex gap-1.5 border-t border-ink-100 p-2">
        <button type="button" onClick={onUse} className="btn-primary flex-1 justify-center text-[11.5px]">
          <FiSend size={12} /> Use in post
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label="More"
            className="grid h-full w-9 place-items-center rounded-xl border border-ink-200 text-ink-500 hover:bg-ink-50"
          >
            <FiMoreHorizontal size={15} />
          </button>
          {menu && (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute bottom-[calc(100%+6px)] right-0 z-40 w-40 glass-panel rounded-xl p-1.5 animate-fadein">
                <a
                  href={abs(it.url)}
                  download={it.filename}
                  onClick={() => setMenu(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-700 hover:bg-ink-50"
                >
                  <FiDownload size={13} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false)
                    onDelete()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-red-600 hover:bg-red-50"
                >
                  <FiTrash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const ANGLE_OPTIONS = [{ value: '', label: 'Any angle' }, ...Object.entries(ANGLE_LABELS).map(([value, label]) => ({ value, label }))]
const GOAL_OPTIONS = [{ value: '', label: 'Any goal' }, ...Object.entries(GOAL_LABELS).map(([value, label]) => ({ value, label }))]

/** One item up close: the media, its caption (edit, copy, rewrite with an
 * angle / goal), how it was made, and what to do with it. */
function DetailPanel({ it, busy, onClose, onUse, onDelete, onRewrite, onSaved, showToast }) {
  const [text, setText] = useState(it.caption || '')
  const [saving, setSaving] = useState(false)
  const [angle, setAngle] = useState('')
  const [goal, setGoal] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  // A new caption arrived (rewrite, or the background writer finished).
  useEffect(() => setText(it.caption || ''), [it.caption])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = text.trim() !== (it.caption || '').trim()
  const writingNow = busy || it.caption_status === 'writing'

  const save = async () => {
    setSaving(true)
    try {
      onSaved(await api.patch(`/views/library/${it.id}/caption`, { caption: text }))
      showToast('Caption saved')
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Caption copied')
    } catch {
      showToast('Could not copy — select the text and copy it')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-3 lg:p-8 animate-fadein" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-card-hover lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 items-center justify-center bg-night-950 p-3 lg:w-[55%]">
          {it.kind === 'image' ? (
            <img src={abs(it.url)} alt="" className="max-h-[42vh] lg:max-h-[82vh] w-auto max-w-full rounded-xl object-contain" />
          ) : (
            <video src={abs(it.url)} controls autoPlay className="max-h-[42vh] lg:max-h-[82vh] w-auto max-w-full rounded-xl" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5 lg:p-6">
          <div className="flex items-center gap-2 text-[12px] text-ink-500">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: colorForBrand(it.brand_slug) }} />
            <span className="font-semibold text-ink-800">{it.brand_name}</span>
            <span className="text-ink-300">·</span>
            <span className="capitalize">{it.kind}</span>
            <span className="text-ink-300">·</span>
            <span>{it.aspect_ratio}</span>
            <span className="text-ink-300">·</span>
            <span>{when(it.created_at)}</span>
            {it.posted_count > 0 && (
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600">
                Posted {it.posted_count}×
              </span>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-ink-400 hover:text-ink-700">
              <FiX size={18} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <div className="text-[12.5px] font-bold text-ink-900">Caption</div>
            <CaptionState it={it} busy={busy} onWrite={() => onRewrite({})} />
          </div>
          {writingNow && !it.caption ? (
            <div className="mt-2 space-y-2 rounded-xl border border-ink-100 p-3">
              <div className="h-3 w-5/6 rounded skeleton" />
              <div className="h-3 w-full rounded skeleton" />
              <div className="h-3 w-2/3 rounded skeleton" />
              <div className="h-3 w-3/4 rounded skeleton" />
            </div>
          ) : (
            <AutoTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              minRows={6}
              maxRows={16}
              maxLength={5000}
              placeholder={it.brand_slug ? 'No caption yet — write one below, or type your own.' : 'Type a caption…'}
              className={`mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-800 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 ${
                isKhmer(text) ? 'font-khmer' : ''
              }`}
            />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {dirty && (
              <button type="button" onClick={save} disabled={saving} className="btn-primary text-[11.5px]">
                {saving ? 'Saving…' : 'Save caption'}
              </button>
            )}
            <button type="button" onClick={copy} disabled={!text.trim()} className="btn-outline text-[11.5px]">
              <FiCopy size={12} /> Copy
            </button>
          </div>

          {it.brand_slug && (
            <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
              <div className="text-[11.5px] font-semibold text-ink-700">Write it a different way</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Select size="sm" value={angle} onChange={setAngle} options={ANGLE_OPTIONS} />
                <Select size="sm" value={goal} onChange={setGoal} options={GOAL_OPTIONS} align="right" />
              </div>
              <button
                type="button"
                disabled={writingNow}
                onClick={() => onRewrite({ angle, goal })}
                className="btn-outline mt-2 w-full justify-center text-[11.5px]"
              >
                <FiRefreshCw size={12} className={writingNow ? 'animate-spin' : ''} />
                {writingNow ? 'Writing…' : it.caption ? 'Rewrite caption' : 'Write caption'}
              </button>
              <p className="mt-1.5 text-[10.5px] text-ink-400">Uses a little AI credit. Replaces the caption above.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="mt-4 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500 hover:text-ink-800"
          >
            How it was made
            <FiChevronDown size={13} className={`transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
          </button>
          {showPrompt && (
            <div className="mt-1.5 rounded-xl bg-ink-50 p-3 text-[11.5px] leading-relaxed text-ink-600 whitespace-pre-line">
              {it.prompt}
              {it.total_tokens > 0 && <div className="mt-2 font-mono text-[10.5px] text-ink-400">{it.total_tokens.toLocaleString()} tokens</div>}
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <button type="button" onClick={() => onUse(text)} className="btn-primary">
              <FiSend size={13} /> Use in post
            </button>
            <a href={abs(it.url)} download={it.filename} className="btn-outline">
              <FiDownload size={13} /> Download
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-ink-500 hover:bg-red-50 hover:text-red-600"
            >
              <FiTrash2 size={13} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
