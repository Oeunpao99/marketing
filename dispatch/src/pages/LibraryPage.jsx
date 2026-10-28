import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiEdit3,
  FiScissors,
  FiFilter,
  FiFolder,
  FiFolderPlus,
  FiGrid,
  FiHeart,
  FiList,
  FiMonitor,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiSliders,
  FiSmartphone,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import { api } from '../api/client'
import AutoTextarea from '../components/ui/AutoTextarea'
import MarkdownText from '../components/ui/MarkdownText'
import Select from '../components/ui/Select'
import { ANGLE_LABELS, GOAL_LABELS } from '../lib/angles'
import { colorForBrand } from '../lib/brandColor'
import { isKhmer } from '../lib/format'
import { handoff } from '../lib/handoff'
import { useStore } from '../store'
import { rectOf, viewH, viewW } from '../lib/zoom'

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (u) => `${mediaBase}${u}`

/** A grid picture: the server's small JPEG of an image or of a video's first
 * frame, never the full file (whole MP4s just for a still made the page
 * crawl). An image whose thumbnail can't be made falls back to the original;
 * a video then just shows the grey card with its play mark. */
function Thumb({ url, kind, className }) {
  const [step, setStep] = useState(0)
  const own = typeof url === 'string' && url.startsWith('/media/') && !url.startsWith('/media/thumb/')
  const video = kind ? kind !== 'image' : /\.(mp4|mov|webm|m4v)$/i.test(url || '')
  if (!url || step > (video ? 0 : 1) || (!own && video)) return null
  const src = own && step === 0 ? abs(`/media/thumb/${url.slice(7)}`) : abs(url)
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setStep((n) => n + 1)} className={className} />
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS_FILTERS = [
  { id: 'all', name: 'Everything' },
  { id: 'ready', name: 'Caption ready' },
  { id: 'unposted', name: 'Not posted yet' },
]

const TABS = [
  ['all', 'All'],
  ['image', 'Images'],
  ['video', 'Videos'],
  ['favorites', 'Favorites'],
  ['folders', 'Folders'],
]

const PAGE = 20 // items per load — more come as you scroll
const VIEW_KEY = 'library-view' // grid / list, remembered per browser

/** Width ÷ height of an item, from its stored resolution ("1080x1350") —
 * known before the picture loads, so the masonry never jumps. */
function ratioOf(it) {
  const [w, h] = String(it.resolution || '').split('x').map(Number)
  if (w > 0 && h > 0) return w / h
  const [a, b] = String(it.aspect_ratio || '').split(':').map(Number)
  return a > 0 && b > 0 ? a / b : 4 / 5
}

const SKELETON = [0.8, 1, 0.5625, 0.8, 1.33, 1, 0.5625, 0.8, 1, 0.8].map((r, i) => ({ id: i, r }))

/** Columns for a width — the same steps the old grid used. */
// As many ~220px-wide columns as fit (at least 2 on phones, 3 from tablets).
const columnsFor = (w) => (w < 640 ? 2 : Math.min(9, Math.max(3, Math.floor(w / 220))))

/** All / Images / Videos / Favorites / Folders, with a pill that slides to
 * the picked tab instead of jumping. */
function SlidingTabs({ tab, onPick }) {
  const refs = useRef({})
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const el = refs.current[tab]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [tab])
  return (
    <div className="relative mb-6 mt-5 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Show">
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full rounded-full bg-brand shadow-[0_4px_12px_-4px_rgb(var(--brand)/0.5)] transition-all duration-300 ease-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {TABS.map(([k, label]) => (
        <button
          key={k}
          ref={(el) => (refs.current[k] = el)}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => onPick(k)}
          className={`relative flex-none rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors duration-300 ${
            tab === k ? 'text-white' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Pinterest-style columns: each item goes, in order, to the shortest column
 * so far (by its known ratio) — the newest stay along the top row, every
 * picture shows at its real shape, and loading more only adds at the bottom. */
function Masonry({ items, ratio, render }) {
  const [el, setEl] = useState(null)
  const [cols, setCols] = useState(4)
  useEffect(() => {
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setCols(columnsFor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  const columns = useMemo(() => {
    const out = Array.from({ length: cols }, () => ({ h: 0, items: [] }))
    for (const it of items) {
      const c = out.reduce((a, b) => (b.h < a.h - 0.01 ? b : a))
      c.items.push(it)
      c.h += 1 / ratio(it) + 0.06 // + the gap, in widths
    }
    return out
  }, [items, cols, ratio])
  return (
    <div ref={setEl} className="flex items-start gap-3 sm:gap-4">
      {columns.map((c, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          {c.items.map((it) => (
            <div key={it.id}>{render(it)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

const Spinner = ({ className = '' }) => (
  <span className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700 ${className}`} />
)

export default function LibraryPage() {
  const navigate = useNavigate()
  const { brands, showToast, setLibraryNew } = useStore()
  const [items, setItems] = useState(null) // loaded so far (null = first page loading)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [brandCounts, setBrandCounts] = useState({})
  // When they last looked, before this visit — anything finished after it is
  // tagged "New" for the whole visit (the sidebar badge clears right away).
  const [seenBefore, setSeenBefore] = useState(null)
  const [newCount, setNewCount] = useState(0)
  const [tab, setTab] = useState('all')
  const [folders, setFolders] = useState(null)
  const [folderId, setFolderId] = useState(null) // the folder open in the Folders tab
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('') // the search, once typing pauses
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const [openId, setOpenId] = useState(null) // item in the detail panel
  const [confirmItem, setConfirmItem] = useState(null) // item awaiting delete
  const [confirmFolder, setConfirmFolder] = useState(null) // folder awaiting delete
  const [writing, setWriting] = useState({}) // job id -> true while "Write caption" runs
  const [folderMenu, setFolderMenu] = useState(null) // { it, rect } — the "add to folder" picker

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // The folder grid shows in the Folders tab until one is opened (a search
  // looks through everything instead).
  const showingFolders = tab === 'folders' && folderId == null && !q

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (tab === 'image' || tab === 'video') p.set('kind', tab)
    if (tab === 'favorites') p.set('favorites', 'true')
    if (tab === 'folders' && folderId != null) p.set('folder', folderId)
    if (brandFilter !== 'all') p.set('brand', brandFilter)
    if (statusFilter !== 'all') p.set('status', statusFilter)
    if (q) p.set('q', q)
    return p.toString()
  }, [tab, folderId, brandFilter, statusFilter, q])

  // Each filter change starts a new sequence; answers for an older one are dropped.
  const seq = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const moreRef = useRef(false)

  const fetchPage = useCallback(
    (offset, limit) => api.get(`/views/library?${params ? `${params}&` : ''}offset=${offset}&limit=${limit}`),
    [params],
  )
  const apply = (r) => {
    setItems(r.items)
    setHasMore(r.has_more)
    setBrandCounts(r.brand_counts || {})
  }

  // First page whenever the filters change.
  useEffect(() => {
    if (showingFolders) return
    const my = ++seq.current
    setItems(null)
    setHasMore(false)
    fetchPage(0, PAGE)
      .then((r) => my === seq.current && apply(r))
      .catch(() => {
        if (my === seq.current) setItems([])
      })
  }, [fetchPage, showingFolders])

  // Re-fetch what's already loaded (new renders, captions written, edits
  // elsewhere) without losing the scroll position.
  const refresh = useCallback(() => {
    if (!itemsRef.current) return
    const my = seq.current
    fetchPage(0, Math.max(PAGE, itemsRef.current.length))
      .then((r) => my === seq.current && apply(r))
      .catch(() => {})
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (moreRef.current || !hasMore || !itemsRef.current) return
    moreRef.current = true
    setLoadingMore(true)
    const my = seq.current
    fetchPage(itemsRef.current.length, PAGE)
      .then((r) => {
        if (my !== seq.current) return
        setItems((xs) => {
          const have = new Set(xs.map((x) => x.id))
          return [...xs, ...r.items.filter((x) => !have.has(x.id))]
        })
        setHasMore(r.has_more)
      })
      .catch(() => {})
      .finally(() => {
        moreRef.current = false
        setLoadingMore(false)
      })
  }, [fetchPage, hasMore])

  // Infinite scroll: a marker under the grid loads the next page as it comes
  // near. Re-observed after each load, so a short page keeps filling.
  const [sentinel, setSentinel] = useState(null)
  const loaded = items?.length || 0
  useEffect(() => {
    if (!sentinel) return undefined
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), { rootMargin: '800px 0px' })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [sentinel, loadMore, loaded])

  const loadFolders = useCallback(
    () =>
      api
        .get('/views/library/folders')
        .then(setFolders)
        .catch(() => setFolders([])),
    [],
  )

  useEffect(() => {
    loadFolders()
    // Being on the page counts as seeing what lands while it's open, too.
    const markSeen = (first) =>
      api
        .post('/views/library/seen')
        .then((r) => {
          if (first) {
            setSeenBefore(new Date(r.previous).getTime())
            setNewCount(r.new_count || 0)
          }
          setLibraryNew(0)
        })
        .catch(() => {})
    markSeen(true)
    return undefined
  }, [loadFolders, setLibraryNew])

  useEffect(() => {
    const onFocus = () => {
      refresh()
      loadFolders()
      api
        .post('/views/library/seen')
        .then(() => setLibraryNew(0))
        .catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, loadFolders, setLibraryNew])

  const isNew = (it) => seenBefore != null && it.ready_at && new Date(it.ready_at).getTime() > seenBefore

  // Captions are written in the background right after a render — keep
  // checking while any is still being written.
  const anyWriting = (items || []).some((it) => it.caption_status === 'writing')
  useEffect(() => {
    if (!anyWriting) return undefined
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [anyWriting, refresh])

  const patchItem = (id, patch) => setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const dropItem = (id) => setItems((xs) => (xs || []).filter((x) => x.id !== id))
  const open = (items || []).find((x) => x.id === openId) || null

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

  /** Heart it, or move it into / out of a folder. */
  const editItem = async (it, patch) => {
    patchItem(it.id, patch) // right away; put back if the save fails
    try {
      const res = await api.patch(`/views/library/${it.id}`, patch)
      patchItem(it.id, res)
      // It no longer belongs in the list being looked at.
      if ((tab === 'favorites' && !res.favorite) || (folderId != null && res.folder_id !== folderId)) {
        dropItem(it.id)
        if (openId === it.id) setOpenId(null)
      }
      if ('folder_id' in patch) {
        loadFolders()
        const f = (folders || []).find((x) => x.id === res.folder_id)
        showToast(res.folder_id ? `Added to ${f ? `“${f.name}”` : 'the folder'}` : 'Removed from the folder')
      }
    } catch (e) {
      patchItem(it.id, { favorite: it.favorite, folder_id: it.folder_id })
      showToast(`Could not save — ${e.message}`)
    }
  }

  const createFolder = async (name) => {
    try {
      const f = await api.post('/views/library/folders', { name })
      setFolders((fs) => [f, ...(fs || [])])
      return f
    } catch (e) {
      showToast(`Could not make the folder — ${e.message}`)
      return null
    }
  }

  const renameFolder = async (f, name) => {
    try {
      const res = await api.patch(`/views/library/folders/${f.id}`, { name })
      setFolders((fs) => (fs || []).map((x) => (x.id === f.id ? res : x)))
    } catch (e) {
      showToast(`Could not rename — ${e.message}`)
    }
  }

  const deleteFolder = async (f) => {
    try {
      await api.del(`/views/library/folders/${f.id}`)
      setFolders((fs) => (fs || []).filter((x) => x.id !== f.id))
      setItems((xs) => (xs || []).map((x) => (x.folder_id === f.id ? { ...x, folder_id: null } : x)))
      if (folderId === f.id) setFolderId(null)
      showToast('Folder deleted — its pictures stay in the Library')
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
    } finally {
      setConfirmFolder(null)
    }
  }

  const remove = async (it) => {
    try {
      await api.del(`/views/library/${it.id}`)
      dropItem(it.id)
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
    ...(brandCounts.none ? [{ id: 'none', name: 'No brand' }] : []),
  ]
  const totalCount = Object.values(brandCounts).reduce((a, b) => a + b, 0)
  const activeFilters = (brandFilter !== 'all') + (statusFilter !== 'all')
  const clearAll = () => {
    setBrandFilter('all')
    setStatusFilter('all')
    setQuery('')
    setQ('')
  }
  const setViewMode = (v) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private window — just this visit */
    }
  }
  const pickTab = (k) => {
    setTab(k)
    setFolderId(null)
  }
  const currentFolder = (folders || []).find((f) => f.id === folderId) || null
  const cardProps = (it) => ({
    it,
    isNew: isNew(it),
    busy: !!writing[it.id],
    onOpen: () => setOpenId(it.id),
    onUse: () => usePost(it),
    onWrite: () => writeCaption(it),
    onDelete: () => setConfirmItem(it),
    onFavorite: () => editItem(it, { favorite: !it.favorite }),
    onFolder: (rect) => setFolderMenu({ it, rect }),
  })

  const emptyText =
    tab === 'favorites' && !q && !activeFilters
      ? ['No favorites yet', 'Tap the ♥ on any picture to keep it here.']
      : folderId != null && !q && !activeFilters
        ? ['This folder is empty', 'Add pictures with the folder button on any picture.']
        : totalCount
          ? ['Nothing matches', 'Try another search or filter.']
          : ['Nothing here yet', 'Generate an image or video in the AI agent — it lands here with a caption ready.']

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-7 animate-fadein">
      {/* Title on the left, the tools on the right — kept quiet so the pictures lead */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-[26px] font-bold text-ink-900 tracking-tight leading-tight">
          Library
          {newCount > 0 && (
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold tracking-normal text-brand">
              {newCount} new
            </span>
          )}
        </h1>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label="Filters"
              title="Filter by brand or status"
              className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
                filtersOpen || activeFilters ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
              }`}
            >
              <FiFilter size={17} />
              {activeFilters > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9.5px] font-bold text-white">
                  {activeFilters}
                </span>
              )}
            </button>
            {filtersOpen && (
              <>
                <button type="button" aria-label="Close filters" className="fixed inset-0 z-30 cursor-default" onClick={() => setFiltersOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-64 space-y-3 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-card-hover animate-fadein sm:left-auto sm:right-0">
                  <div>
                    <div className="mb-1.5 text-[11.5px] font-semibold text-ink-500">Brand</div>
                    <Select
                      value={brandFilter}
                      onChange={setBrandFilter}
                      aria-label="Brand"
                      buttonClassName="w-full font-medium"
                      options={brandTabs.map((t) => ({
                        value: t.id,
                        label: t.name,
                        hint: t.id === 'all' ? `${totalCount}` : brandCounts[t.id] != null ? `${brandCounts[t.id]}` : undefined,
                        color: t.id !== 'all' && t.id !== 'none' ? colorForBrand(t.id) : undefined,
                      }))}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11.5px] font-semibold text-ink-500">Status</div>
                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      aria-label="Status"
                      buttonClassName="w-full font-medium"
                      options={STATUS_FILTERS.map((f) => ({ value: f.id, label: f.name }))}
                    />
                  </div>
                  {activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBrandFilter('all')
                        setStatusFilter('all')
                      }}
                      className="text-[12px] font-semibold text-brand hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center rounded-full p-0.5" role="group" aria-label="View">
            {[
              ['grid', FiGrid, 'Grid'],
              ['list', FiList, 'List'],
            ].map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                aria-pressed={view === v}
                aria-label={`${label} view`}
                title={`${label} view`}
                className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
                  view === v ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <FiSearch size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library"
              aria-label="Search library"
              className="h-10 w-full rounded-full border border-ink-200 bg-white pl-10 pr-4 text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <button type="button" onClick={() => navigate('/ai?tab=images')} className="btn-primary h-10 flex-none rounded-full px-4" title="Make a new image or video">
            <FiPlus size={15} /> New
          </button>
        </div>
      </div>

      {/* Tabs — a highlight slides to the picked one */}
      <SlidingTabs tab={tab} onPick={pickTab} />

      {/* An open folder: where you are, and its own actions */}
      {tab === 'folders' && currentFolder && (
        <FolderBar
          folder={currentFolder}
          onBack={() => setFolderId(null)}
          onRename={(name) => renameFolder(currentFolder, name)}
          onDelete={() => setConfirmFolder(currentFolder)}
        />
      )}

      {/* The picked tab's items fade in (a new key per tab / folder) */}
      <div key={`${tab}:${folderId ?? ''}`} className="animate-fadein">
      {showingFolders ? (
        <FolderGrid
          folders={folders}
          onOpen={(f) => setFolderId(f.id)}
          onCreate={createFolder}
          onRename={renameFolder}
          onDelete={(f) => setConfirmFolder(f)}
        />
      ) : items === null ? (
        <Masonry items={SKELETON} render={(s) => <div className="w-full rounded-2xl skeleton" style={{ aspectRatio: s.r }} />} ratio={(s) => s.r} />
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-[14px] font-semibold text-ink-700">{emptyText[0]}</div>
          <div className="text-[12px] text-ink-400 mt-1">{emptyText[1]}</div>
          {q || activeFilters ? (
            <button type="button" onClick={clearAll} className="btn-outline mt-4">
              Clear search and filters
            </button>
          ) : (
            !totalCount && (
              <button type="button" onClick={() => navigate('/ai?tab=images')} className="btn-primary mt-4">
                Open the AI agent
              </button>
            )
          )}
        </div>
      ) : (
        <>
          {view === 'list' ? (
            <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
              {items.map((it) => (
                <LibraryRow key={it.id} {...cardProps(it)} />
              ))}
            </div>
          ) : (
            <Masonry items={items} ratio={ratioOf} render={(it) => <LibraryCard key={it.id} {...cardProps(it)} />} />
          )}
          {hasMore && <div ref={setSentinel} aria-hidden className="h-px" />}
          {loadingMore && (
            <div className="grid place-items-center py-8" role="status" aria-label="Loading more">
              <Spinner />
            </div>
          )}
        </>
      )}
      </div>

      {open && (
        <DetailPanel
          it={open}
          busy={!!writing[open.id]}
          folders={folders || []}
          onClose={() => setOpenId(null)}
          onUse={(text) => usePost(open, text)}
          onDelete={() => setConfirmItem(open)}
          onRewrite={(opts) => writeCaption(open, opts)}
          onSaved={(patch) => patchItem(open.id, patch)}
          onEdit={(patch) => editItem(open, patch)}
          onShaped={refresh}
          showToast={showToast}
        />
      )}

      {folderMenu && (
        <FolderMenu
          it={folderMenu.it}
          rect={folderMenu.rect}
          folders={folders || []}
          onPick={(id) => {
            editItem(folderMenu.it, { folder_id: id })
            setFolderMenu(null)
          }}
          onCreate={async (name) => {
            const f = await createFolder(name)
            if (f) editItem(folderMenu.it, { folder_id: f.id })
            setFolderMenu(null)
          }}
          onClose={() => setFolderMenu(null)}
        />
      )}

      {confirmItem && (
        <Confirm
          title={`Delete this ${confirmItem.kind}?`}
          text="It and its caption are removed from the Library for good. Posts already published with it stay online."
          onCancel={() => setConfirmItem(null)}
          onConfirm={() => remove(confirmItem)}
        />
      )}
      {confirmFolder && (
        <Confirm
          title={`Delete the folder “${confirmFolder.name}”?`}
          text="Only the folder goes — its pictures and videos stay in the Library."
          onCancel={() => setConfirmFolder(null)}
          onConfirm={() => deleteFolder(confirmFolder)}
        />
      )}
    </div>
  )
}

function Confirm({ title, text, onCancel, onConfirm }) {
  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center glass-overlay p-4 animate-fadein" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl glass-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-[14px] font-bold text-ink-800">
          <FiTrash2 size={15} className="flex-none text-red-600" /> {title}
        </div>
        <p className="mt-2 text-[12px] text-ink-600 leading-relaxed">{text}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost px-3.5 py-1.5">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A one-line name box: Enter saves, Escape cancels. */
function NameInput({ initial = '', placeholder = 'Folder name', onSave, onCancel, className = '' }) {
  const [name, setName] = useState(initial)
  const done = useRef(false) // Enter then blur must not save twice
  const finish = (fn) => {
    if (done.current) return
    done.current = true
    fn()
  }
  const save = () => finish(() => (name.trim() ? onSave(name.trim()) : onCancel()))
  return (
    <input
      autoFocus
      value={name}
      maxLength={80}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') finish(onCancel)
      }}
      onBlur={save}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-brand bg-white px-2.5 py-1.5 text-[13px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand/15 ${className}`}
    />
  )
}

/** Up to three of a folder's latest pictures — one big, two stacked. */
function Covers({ urls }) {
  if (!urls.length) {
    return (
      <span className="grid h-full w-full place-items-center text-ink-300">
        <FiFolder size={34} />
      </span>
    )
  }
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-2 gap-0.5">
      <Thumb url={urls[0]} className={`h-full w-full object-cover ${urls.length > 1 ? 'col-span-2' : 'col-span-3'} row-span-2`} />
      {urls.slice(1, 3).map((u, i) => (
        <Thumb key={u} url={u} className={`h-full w-full object-cover ${urls.length === 2 && i === 0 ? 'row-span-2' : ''}`} />
      ))}
    </span>
  )
}

/** The Folders tab: a "New folder" tile, then each folder with its covers. */
function FolderGrid({ folders, onOpen, onCreate, onRename, onDelete }) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(null)
  if (folders === null) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] rounded-2xl skeleton" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      <div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="grid aspect-[4/3] w-full place-items-center rounded-2xl border-2 border-dashed border-ink-200 text-ink-400 transition-colors hover:border-brand hover:text-brand"
        >
          <span className="flex flex-col items-center gap-1.5 text-[12.5px] font-semibold">
            <FiFolderPlus size={24} /> New folder
          </span>
        </button>
        <div className="mt-2 min-h-[34px]">
          {adding && (
            <NameInput
              onSave={async (name) => {
                setAdding(false)
                await onCreate(name)
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      </div>
      {folders.map((f) => (
        <div key={f.id} className="group">
          <button type="button" onClick={() => onOpen(f)} className="block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-ink-100 transition-shadow hover:shadow-card-hover">
            <Covers urls={f.covers || []} />
          </button>
          <div className="mt-2 flex min-h-[34px] items-center gap-1">
            {renaming === f.id ? (
              <NameInput
                initial={f.name}
                onSave={(name) => {
                  setRenaming(null)
                  if (name !== f.name) onRename(f, name)
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <>
                <button type="button" onClick={() => onOpen(f)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-semibold text-ink-900">{f.name}</div>
                  <div className="text-[11.5px] text-ink-400">
                    {f.count} item{f.count === 1 ? '' : 's'}
                  </div>
                </button>
                <span className="flex flex-none gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button type="button" onClick={() => setRenaming(f.id)} title="Rename" aria-label="Rename" className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
                    <FiEdit2 size={13} />
                  </button>
                  <button type="button" onClick={() => onDelete(f)} title="Delete folder" aria-label="Delete folder" className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600">
                    <FiTrash2 size={13} />
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Above an open folder: Folders › name, with rename and delete. */
function FolderBar({ folder, onBack, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className="-mt-2 mb-5 flex items-center gap-1.5 text-[14px]">
      <button type="button" onClick={onBack} className="font-semibold text-ink-500 hover:text-ink-900">
        Folders
      </button>
      <FiChevronRight size={15} className="flex-none text-ink-300" />
      {renaming ? (
        <div className="w-60">
          <NameInput
            initial={folder.name}
            onSave={(name) => {
              setRenaming(false)
              if (name !== folder.name) onRename(name)
            }}
            onCancel={() => setRenaming(false)}
          />
        </div>
      ) : (
        <>
          <span className="truncate font-bold text-ink-900">{folder.name}</span>
          <span className="flex-none text-[12px] text-ink-400">· {folder.count}</span>
          <button type="button" onClick={() => setRenaming(true)} title="Rename" aria-label="Rename folder" className="ml-1 grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
            <FiEdit2 size={13} />
          </button>
          <button type="button" onClick={onDelete} title="Delete folder" aria-label="Delete folder" className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600">
            <FiTrash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}

/** "Add to folder" — drawn on the page, not inside the card, so it's never
 * clipped; opens under the button (or above, near the bottom of the screen). */
function FolderMenu({ it, rect, folders, onPick, onCreate, onClose }) {
  const [adding, setAdding] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    // The page scrolling moves the card away — close; scrolling the list itself is fine.
    const onScroll = (e) => !box.current?.contains(e.target) && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])
  const width = 240
  const left = Math.max(8, Math.min(rect.right - width, viewW() - width - 8))
  const below = rect.bottom + 320 < viewH()
  const pos = below ? { top: rect.bottom + 6 } : { bottom: viewH() - rect.top + 6 }
  return createPortal(
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[115] cursor-default" onClick={onClose} />
      <div
        ref={box}
        className="fixed z-[116] max-h-[300px] overflow-y-auto rounded-2xl border border-ink-100 bg-white p-1.5 shadow-card-hover animate-fadein"
        style={{ left, width, ...pos }}
      >
        <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-ink-400">Add to folder</div>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-800 hover:bg-ink-50"
          >
            <FiFolder size={13} className="flex-none text-ink-400" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {it.folder_id === f.id && <FiCheck size={13} className="flex-none text-brand" />}
          </button>
        ))}
        {it.folder_id != null && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-600 hover:bg-ink-50"
          >
            <FiX size={13} className="flex-none" /> Remove from folder
          </button>
        )}
        <div className="mt-1 border-t border-ink-100 pt-1">
          {adding ? (
            <div className="p-1">
              <NameInput onSave={onCreate} onCancel={() => setAdding(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-brand hover:bg-ink-50"
            >
              <FiFolderPlus size={13} className="flex-none" /> New folder
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
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

/** Small round button on the hover bar of a card. */
const barBtn = 'grid h-8 w-8 flex-none place-items-center rounded-full bg-white/20 text-white hover:bg-white/35'

/** One picture in the grid — the image alone at its real shape. Brand, date
 * and actions show on hover (tap opens the detail panel on a phone); small
 * marks say the caption is ready / being written, and the ♥ stays when set.
 * A video plays silently while the pointer is over it, like the Templates. */
function LibraryCard({ it, isNew, busy, onOpen, onUse, onWrite, onDelete, onFavorite, onFolder }) {
  const writingNow = busy || it.caption_status === 'writing'
  const [hover, setHover] = useState(false)
  const [playing, setPlaying] = useState(false)
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn(e)
  }
  const preview = (on) => {
    if (it.kind === 'image' || !window.matchMedia?.('(hover: hover)').matches) return
    setHover(on) // the clip loads only now, and goes away again after
    if (!on) setPlaying(false)
  }
  return (
    <div
      className="group relative overflow-hidden rounded-2xl bg-ink-100"
      style={{ aspectRatio: ratioOf(it) }}
      onMouseEnter={() => preview(true)}
      onMouseLeave={() => preview(false)}
    >
      <button type="button" onClick={onOpen} aria-label={`Open ${it.kind}`} className="absolute inset-0 block h-full w-full">
        <Thumb url={it.url} kind={it.kind} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        {it.kind !== 'image' && hover && (
          <video src={abs(it.url)} className={`absolute inset-0 h-full w-full object-cover ${playing ? '' : 'opacity-0'}`} muted loop autoPlay playsInline onPlaying={() => setPlaying(true)} />
        )}
      </button>

      {it.kind === 'video' && !playing && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
            <FiPlay size={16} className="ml-0.5" />
          </span>
        </span>
      )}
      <span className="pointer-events-none absolute left-2.5 top-2.5 flex gap-1">
        {isNew && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">New</span>
        )}
        {it.kind === 'video' && it.seconds > 0 && (
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">{it.seconds}s</span>
        )}
      </span>
      <button
        type="button"
        onClick={stop(onFavorite)}
        aria-pressed={!!it.favorite}
        aria-label={it.favorite ? 'Remove from favorites' : 'Add to favorites'}
        title={it.favorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full shadow-sm transition-opacity ${
          it.favorite
            ? 'bg-white/95 text-rose-500 opacity-100'
            : 'bg-black/35 text-white opacity-0 hover:bg-black/50 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
      >
        <FiHeart size={15} fill={it.favorite ? 'currentColor' : 'none'} />
      </button>

      {/* Status marks — tucked away while the hover bar shows */}
      <span className="pointer-events-none absolute bottom-2.5 left-2.5 flex gap-1 transition-opacity group-hover:opacity-0">
        {writingNow ? (
          <span title="Writing caption…" className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-brand shadow-sm">
            <FiRefreshCw size={12} className="animate-spin" />
          </span>
        ) : (
          it.caption && (
            <span title="Caption ready" className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-emerald-600 shadow-sm">
              <FiCheck size={13} strokeWidth={3} />
            </span>
          )
        )}
        {it.posted_count > 0 && (
          <span title={`Posted ${it.posted_count}×`} className="flex h-6 items-center gap-1 rounded-full bg-white/90 px-2 text-[10.5px] font-bold text-ink-700 shadow-sm">
            <FiSend size={10} /> {it.posted_count > 1 ? `${it.posted_count}×` : 'Posted'}
          </span>
        )}
      </span>

      {/* Hover bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2.5 pt-12 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        <div className="flex items-center gap-1.5 text-[11px] text-white/85">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: colorForBrand(it.brand_slug) }} />
          <span className="truncate font-semibold text-white">{it.brand_name}</span>
          <span className="ml-auto flex-none">{when(it.created_at)}</span>
        </div>
        <div className="pointer-events-auto mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={stop(onUse)}
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[11.5px] font-semibold text-night-950 hover:bg-white/90"
          >
            <FiSend size={12} className="flex-none" /> <span className="truncate">Use in post</span>
          </button>
          {!it.caption && it.brand_slug && !writingNow && (
            <button type="button" onClick={stop(onWrite)} title="Write a caption" aria-label="Write a caption" className={barBtn}>
              ✨
            </button>
          )}
          <button
            type="button"
            onClick={stop((e) => onFolder(rectOf(e.currentTarget)))}
            title="Add to folder"
            aria-label="Add to folder"
            className={barBtn}
          >
            <FiFolderPlus size={14} />
          </button>
          <a href={abs(it.url)} download={it.filename} onClick={(e) => e.stopPropagation()} title="Download" aria-label="Download" className={barBtn}>
            <FiDownload size={14} />
          </a>
          <button type="button" onClick={stop(onDelete)} title="Delete" aria-label="Delete" className={`${barBtn} hover:!bg-red-500/80`}>
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** The list view: one compact row per item, for when the details matter. */
function LibraryRow({ it, isNew, busy, onOpen, onUse, onWrite, onFavorite }) {
  const caption = it.caption || ''
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="flex cursor-pointer items-center gap-3 border-b border-ink-100 px-3 py-2.5 last:border-b-0 hover:bg-ink-50"
    >
      <div className="relative h-14 w-14 flex-none overflow-hidden rounded-xl bg-ink-100">
        {it.kind === 'image' ? (
          <Thumb url={it.url} kind="image" className="h-full w-full object-cover" />
        ) : (
          <>
            <Thumb url={it.url} kind="video" className="h-full w-full object-cover" />
            <span className="absolute inset-0 grid place-items-center text-white">
              <FiPlay size={14} />
            </span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {caption ? (
          <p className={`line-clamp-1 text-[12.5px] text-ink-800 ${isKhmer(caption) ? 'font-khmer' : ''}`}>{caption}</p>
        ) : (
          <p className="line-clamp-1 text-[12.5px] italic text-ink-400">No caption yet</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: colorForBrand(it.brand_slug) }} />
          <span className="truncate font-semibold text-ink-700">{it.brand_name}</span>
          <span className="text-ink-300">·</span>
          <span className="flex-none capitalize">{it.kind}</span>
          <span className="text-ink-300">·</span>
          <span className="flex-none">{when(it.created_at)}</span>
          {isNew && <span className="flex-none rounded-full bg-brand px-1.5 text-[9.5px] font-bold uppercase text-white">New</span>}
          {it.posted_count > 0 && (
            <span className="flex-none rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">Posted {it.posted_count}×</span>
          )}
        </div>
      </div>
      <div className="hidden flex-none sm:block" onClick={(e) => e.stopPropagation()}>
        <CaptionState it={it} busy={busy} onWrite={onWrite} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onFavorite()
        }}
        aria-pressed={!!it.favorite}
        aria-label={it.favorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`grid h-8 w-8 flex-none place-items-center rounded-full hover:bg-ink-100 ${it.favorite ? 'text-rose-500' : 'text-ink-400'}`}
      >
        <FiHeart size={15} fill={it.favorite ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onUse()
        }}
        className="btn-outline flex-none text-[11.5px]"
      >
        <FiSend size={12} /> <span className="hidden sm:inline">Use in post</span>
      </button>
    </div>
  )
}

const ANGLE_OPTIONS = [{ value: '', label: 'Any angle' }, ...Object.entries(ANGLE_LABELS).map(([value, label]) => ({ value, label }))]
const GOAL_OPTIONS = [{ value: '', label: 'Any goal' }, ...Object.entries(GOAL_LABELS).map(([value, label]) => ({ value, label }))]

/** One item up close: the media, its caption (edit, copy, rewrite with an
 * angle / goal), how it was made, its ♥ and folder, and what to do with it. */
function DetailPanel({ it, busy, folders, onClose, onUse, onDelete, onRewrite, onSaved, onEdit, onShaped, showToast }) {
  const navigate = useNavigate()
  const [text, setText] = useState(it.caption || '')
  // The same video in the other shape: a template video is drawn again, anything else fitted (POST /ai/motion/other-shape)
  const target = ratioOf(it) > 1 ? '9:16' : '16:9'
  const [shape, setShape] = useState(null) // { id, redraw, pct } while it's being made
  const [saving, setSaving] = useState(false)
  const [angle, setAngle] = useState('')
  const [goal, setGoal] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  // Rewrite (angle / goal) and "How it was made" live behind one settings icon.
  const [settings, setSettings] = useState(false)

  // A new caption arrived (rewrite, or the background writer finished).
  useEffect(() => setText(it.caption || ''), [it.caption])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!shape?.id) return undefined
    let alive = true
    const timer = setInterval(async () => {
      try {
        const j = await api.get(`/ai/video/${shape.id}`)
        if (!alive) return
        if (j.status === 'succeeded') {
          setShape(null)
          showToast(`The ${target} version is in your Library`)
          onShaped()
        } else if (j.status === 'failed') {
          setShape(null)
          showToast(j.error && j.error !== 'Stopped' ? j.error : 'Could not make it — try again')
        } else {
          setShape((s) => s && { ...s, pct: Math.round((j.progress?.render || 0) * 100) })
        }
      } catch {
        // a missed poll — the next one tries again
      }
    }, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [shape?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeShape = async () => {
    try {
      const res = await api.post(`/ai/motion/other-shape/${it.id}`)
      setShape({ id: res.id, redraw: res.redraw, pct: 0 })
      showToast(res.redraw ? `Drawing it again in ${target} — same scenes and voice` : `Fitting it into ${target}`)
    } catch (e) {
      showToast(`Could not start — ${e.message}`)
    }
  }

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

  const folderOptions = [{ value: '', label: 'No folder' }, ...folders.map((f) => ({ value: String(f.id), label: f.name }))]

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-3 lg:p-8 animate-fadein" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-card-hover lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 items-center justify-center bg-night-950 p-3 lg:w-[55%]">
          {it.kind === 'image' ? (
            <img src={abs(it.url)} alt="" className="max-h-[calc(42vh/var(--z,1))] lg:max-h-[calc(82vh/var(--z,1))] w-auto max-w-full rounded-xl object-contain" />
          ) : (
            // its real shape from the start, with the first frame showing while it loads
            <video
              src={abs(it.url)}
              poster={it.url?.startsWith('/media/') ? abs(`/media/thumb/${it.url.slice(7)}`) : undefined}
              controls
              autoPlay
              playsInline
              preload="auto"
              style={{ aspectRatio: ratioOf(it) }}
              className="h-[calc(42vh/var(--z,1))] lg:h-[calc(82vh/var(--z,1))] w-auto max-w-full rounded-xl bg-black object-contain"
            />
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
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit({ favorite: !it.favorite })}
                aria-pressed={!!it.favorite}
                aria-label={it.favorite ? 'Remove from favorites' : 'Add to favorites'}
                title={it.favorite ? 'Remove from favorites' : 'Add to favorites'}
                className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-ink-100 ${it.favorite ? 'text-rose-500' : 'text-ink-400 hover:text-ink-700'}`}
              >
                <FiHeart size={16} fill={it.favorite ? 'currentColor' : 'none'} />
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700">
                <FiX size={18} />
              </button>
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <FiFolder size={13} className="flex-none text-ink-400" />
            <Select
              size="sm"
              value={it.folder_id != null ? String(it.folder_id) : ''}
              onChange={(v) => onEdit({ folder_id: v ? Number(v) : null })}
              options={folderOptions}
              aria-label="Folder"
              buttonClassName="min-w-[170px]"
            />
          </div>

          <div className="mt-5 flex items-center gap-2">
            <div className="text-[12.5px] font-bold text-ink-900">Caption</div>
            <CaptionState it={it} busy={busy} onWrite={() => onRewrite({})} />
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={copy}
                disabled={!text.trim()}
                title="Copy caption"
                aria-label="Copy caption"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-40"
              >
                <FiCopy size={15} />
              </button>
              <button
                type="button"
                onClick={() => setSettings((v) => !v)}
                aria-expanded={settings}
                title="Rewrite the caption · how it was made"
                aria-label="Caption settings"
                className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                  settings ? 'bg-brand-soft text-brand' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                }`}
              >
                <FiSliders size={15} />
              </button>
            </span>
          </div>

          {/* behind the settings icon: rewrite with an angle / goal, and the prompt it was made from */}
          {settings && (
            <div className="mt-2 rounded-xl border border-ink-200 p-3 animate-fadein">
              {it.brand_slug && (
                <>
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
                    title="Writes a new caption · replaces this one"
                  >
                    <FiRefreshCw size={12} className={writingNow ? 'animate-spin' : ''} />
                    {writingNow ? 'Writing…' : it.caption ? 'Rewrite caption' : 'Write caption'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowPrompt((v) => !v)}
                className={`inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500 hover:text-ink-800 ${it.brand_slug ? 'mt-3' : ''}`}
              >
                How it was made
                <FiChevronDown size={13} className={`transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
              </button>
              {showPrompt && (
                <div className="mt-1.5 max-h-60 overflow-y-auto rounded-lg bg-ink-50 p-3">
                  <MarkdownText text={it.prompt} />
                  {it.total_tokens > 0 && <div className="mt-2 font-mono text-[10.5px] text-ink-400">{it.total_tokens.toLocaleString()} tokens</div>}
                </div>
              )}
            </div>
          )}
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
          {dirty && (
            <div className="mt-2">
              <button type="button" onClick={save} disabled={saving} className="btn-primary text-[11.5px]">
                {saving ? 'Saving…' : 'Save caption'}
              </button>
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <button type="button" onClick={() => onUse(text)} className="btn-primary">
              <FiSend size={13} /> Use in post
            </button>
            <a href={abs(it.url)} download={it.filename} className="btn-outline">
              <FiDownload size={13} /> Download
            </a>
            {it.editable && (
              <button type="button" onClick={() => navigate(`/library/edit/${it.id}`)} title="Change the words, the voice lines, the order and the sound — saved as a new video" className="btn-outline">
                <FiEdit3 size={13} /> Edit video
              </button>
            )}
            {it.deck && (
              <button type="button" onClick={() => navigate(`/present/${it.id}`)} title="Present the slides, or download them as a PDF" className="btn-primary">
                <FiMonitor size={13} /> Present
              </button>
            )}
            {it.kind !== 'image' && (
              <button
                type="button"
                onClick={() => navigate(`/editor?${new URLSearchParams({ src: it.url, name: it.filename || 'Library video', ratio: it.aspect_ratio || '9:16', kind: 'video' })}`)}
                title="Open it on the video editor's timeline — cut, trim, add music and words"
                className="btn-outline"
              >
                <FiScissors size={13} /> Open in editor
              </button>
            )}
            {it.kind !== 'image' && (
              <button
                type="button"
                onClick={makeShape}
                disabled={!!shape}
                title={`The same video in ${target} — a template video is drawn again for the new shape, others are fitted`}
                className="btn-outline disabled:opacity-70"
              >
                {target === '9:16' ? <FiSmartphone size={13} /> : <FiMonitor size={13} />}
                {shape ? `Making ${target}… ${shape.pct ? `${shape.pct}%` : ''}` : `Make ${target} version`}
              </button>
            )}
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
