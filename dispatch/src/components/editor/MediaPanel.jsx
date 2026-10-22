import { useEffect, useRef, useState } from 'react'
import { FiFilm, FiImage, FiMusic, FiPlus, FiTrash2, FiType, FiUploadCloud } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'
import { abs, thumbOf } from './media'

// The video editor's left panel: files imported into the editor, the Library's
// videos and pictures, and words to put on the video. Drag one onto the
// timeline, or press + to add it where the playhead is.

export const DRAG_TYPE = 'application/x-cf-media'

const TABS = [
  { id: 'imports', label: 'Import', icon: FiUploadCloud },
  { id: 'library', label: 'Library', icon: FiFilm },
  { id: 'words', label: 'Words', icon: FiType },
]

// ready-made words: a title, a subtitle line, a label
export const WORD_PRESETS = [
  { name: 'Title', text: 'Your title', size: 96, look: 'plain', color: '#ffffff', y: -30 },
  { name: 'Subtitle', text: 'A line of subtitle', size: 54, look: 'box', color: '#ffffff', y: 32 },
  { name: 'Outline', text: 'Big words', size: 84, look: 'outline', color: '#FFD84D', y: 0 },
  { name: 'Khmer title', text: 'ចំណងជើង', size: 90, look: 'box', color: '#ffffff', y: -30 },
]

const KIND_ICON = { video: FiFilm, image: FiImage, audio: FiMusic }

function Tile({ item, onAdd, onRemove }) {
  const Icon = KIND_ICON[item.kind] || FiFilm
  const thumb = item.kind === 'audio' ? '' : thumbOf(item.src)
  return (
    <div
      draggable={!item.uploading}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="group relative aspect-square cursor-grab overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200 active:cursor-grabbing"
      title={item.name}
    >
      {thumb ? (
        <img src={thumb} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
      ) : (
        <div className="grid h-full w-full place-items-center text-ink-400">
          <Icon size={22} />
        </div>
      )}
      {item.uploading && (
        <div className="absolute inset-0 grid place-items-center bg-night-950/70">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      <span className="absolute left-1 top-1 rounded bg-night-950/75 p-0.5 text-white/80">
        <Icon size={10} />
      </span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-night-950/90 to-transparent px-1.5 pb-1 pt-3 text-[10px] text-white/85">{item.name}</span>
      {!item.uploading && (
        <span className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onRemove && (
            <button type="button" title="Remove from imports" onClick={() => onRemove(item)} className="grid h-6 w-6 place-items-center rounded-md bg-night-950/80 text-white/80 hover:text-red-300">
              <FiTrash2 size={11} />
            </button>
          )}
          <button type="button" title="Add at the playhead" onClick={() => onAdd(item)} className="grid h-6 w-6 place-items-center rounded-md bg-brand text-white">
            <FiPlus size={13} />
          </button>
        </span>
      )}
    </div>
  )
}

export default function MediaPanel({ onImport, onAdd, onAddWords, uploads, setUploads }) {
  const { showToast } = useStore()
  const [tab, setTab] = useState('imports')
  const [library, setLibrary] = useState(null)
  const [over, setOver] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    let alive = true
    api
      .get('/editor/media')
      .then((rows) => alive && setUploads(rows.map((r) => ({ id: r.id, kind: r.kind, src: r.url, name: r.filename }))))
      .catch(() => alive && setUploads([]))
    return () => {
      alive = false
    }
  }, [setUploads])

  useEffect(() => {
    if (tab !== 'library' || library) return
    api
      .get('/views/library?limit=80&offset=0')
      .then((r) =>
        setLibrary(
          (r.items || [])
            .filter((it) => it.url && (it.kind === 'image' || it.kind === 'video' || it.kind === 'motion'))
            .map((it) => ({ id: `lib${it.video_id}`, kind: it.kind === 'image' ? 'image' : 'video', src: it.url, name: it.filename || it.prompt || 'Library item' })),
        ),
      )
      .catch(() => setLibrary([]))
  }, [tab, library])

  const importFiles = (files) => onImport(files)

  const removeUpload = async (item) => {
    try {
      await api.del(`/editor/media/${item.id}`)
      setUploads((xs) => xs.filter((x) => x.id !== item.id))
    } catch (e) {
      showToast(e.message || 'Could not remove it')
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-ink-200 bg-white lg:w-[272px] lg:flex-none lg:border-r">
      <div className="flex flex-none gap-1 border-b border-ink-200 p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors ${tab === t.id ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {tab === 'imports' && (
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                setOver(true)
              }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.files?.length) return
              e.preventDefault()
              setOver(false)
              importFiles(e.dataTransfer.files)
            }}
            className="min-h-full"
          >
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-4 text-center transition-colors ${over ? 'border-brand bg-brand-soft text-brand' : 'border-ink-300 text-ink-600 hover:border-brand hover:text-brand'}`}
            >
              <FiUploadCloud size={20} />
              <span className="text-[12px] font-semibold">Import</span>
              <span className="text-[10.5px] text-ink-400">Videos, pictures, music — or drop files here</span>
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept="video/*,image/*,audio/*"
              className="hidden"
              onChange={(e) => {
                importFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {uploads.length > 0 ? (
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 lg:grid-cols-2">
                {uploads.map((it) => (
                  <Tile key={it.id} item={it} onAdd={onAdd} onRemove={removeUpload} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-center text-[11px] text-ink-400">What you import shows here — drag it onto the timeline.</p>
            )}
          </div>
        )}

        {tab === 'library' &&
          (library == null ? (
            <div className="grid place-items-center py-10">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            </div>
          ) : library.length ? (
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-2">
              {library.map((it) => (
                <Tile key={it.id} item={it} onAdd={onAdd} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-[11px] text-ink-400">Your Library is empty — videos and pictures you make show here.</p>
          ))}

        {tab === 'words' && (
          <div className="space-y-1.5">
            {WORD_PRESETS.map((w) => (
              <div
                key={w.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'text', ...w }))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="group flex cursor-grab items-center gap-2 rounded-xl bg-night-800 px-3 py-2.5 ring-1 ring-white/5 hover:ring-white/15"
              >
                <span
                  className={`min-w-0 flex-1 truncate font-bold ${w.look === 'box' ? 'rounded bg-black/60 px-1.5 py-0.5' : ''}`}
                  style={{ color: w.color, fontSize: Math.min(18, w.size / 5), WebkitTextStroke: w.look === 'outline' ? '0.6px black' : undefined }}
                >
                  {w.text}
                </span>
                <span className="text-[10.5px] text-white/40">{w.name}</span>
                <button type="button" title="Add at the playhead" onClick={() => onAddWords(w)} className="grid h-6 w-6 flex-none place-items-center rounded-md bg-brand text-white">
                  <FiPlus size={13} />
                </button>
              </div>
            ))}
            <p className="px-1 pt-1 text-[10.5px] leading-relaxed text-ink-400">Change the words, size and colour on the right after you add them. Khmer shows in Kantumruy, like the templates.</p>
          </div>
        )}
      </div>
    </aside>
  )
}
