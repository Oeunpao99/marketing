import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Player } from '@remotion/player'
import { FiArrowLeft, FiCheck, FiDownload, FiFilm, FiMaximize, FiPause, FiPlay, FiPlus, FiSend, FiSkipBack, FiTrash2, FiUpload, FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { Timeline, EDIT_SIZES } from '../../motion/src/timeline'
import MediaPanel, { DRAG_TYPE } from '../components/editor/MediaPanel'
import Inspector, { RATIOS } from '../components/editor/Inspector'
import TimelineArea from '../components/editor/TimelineArea'
import { createClock, usePlaying, useTime } from '../components/editor/clock'
import { abs, thumbOf } from '../components/editor/media'
import {
  FPS,
  HISTORY,
  addClip,
  duplicateClip,
  endOf,
  fmtTime,
  kindOfFile,
  lengthOf,
  probeSeconds,
  removeClip,
  splitClip,
  trimClip,
  startTracks,
  tidyTracks,
  updateClip,
} from '../lib/editorModel'
import { handoff } from '../lib/handoff'
import { useStore } from '../store'

// Content studio → Video editor: a CapCut-style editor. /editor lists the
// projects; /editor/:id is the editor — import files, drag them onto the
// timeline, cut, trim, move, add words, then export a new Library video
// (app/editor.py). The player plays motion/src/timeline.jsx, the same file
// the server renders, so the export looks like the preview.

const MAX_BYTES = 200 * 1024 * 1024
const TIMELINE_H = 280 // the timeline's height to start with (px); double-click the bar to go back to it
const TIMELINE_MIN = 140
const TIMELINE_KEY = 'cf_editor_timeline_h'
const isTyping = () => {
  const el = document.activeElement
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/i.test(el.type)
}

// ── the project list ────────────────────────────────────────────────────────
function Projects() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { brands, activeBrand, showToast } = useStore()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const brandId = brands.find((b) => b.slug === activeBrand)?.id ?? null
  const fromLibrary = params.get('src')

  useEffect(() => {
    api
      .get('/editor/projects')
      .then(setRows)
      .catch(() => setRows([]))
  }, [])

  const create = useCallback(
    async (ratio, name, first) => {
      setBusy(true)
      try {
        let data = { tracks: startTracks(), clips: [] }
        if (first) data = addClip(data, first, 0, data.tracks[2].id).tl
        const p = await api.post('/editor/projects', { name: name || 'Untitled video', ratio, brand_id: brandId, data })
        navigate(`/editor/${p.id}`, { replace: !!first })
      } catch (e) {
        showToast(e.message || 'Could not start a new video')
        setBusy(false)
      }
    },
    [brandId, navigate, showToast],
  )

  // "Open in editor" from the Library: /editor?src=/media/…&name=…&ratio=…&kind=…
  const started = useRef(false)
  useEffect(() => {
    if (!fromLibrary || started.current) return
    started.current = true
    const kind = params.get('kind') === 'image' ? 'image' : 'video'
    const name = params.get('name') || 'Library video'
    probeSeconds(abs(fromLibrary), kind).then((secs) =>
      create(params.get('ratio') || '9:16', name.replace(/\.\w+$/, ''), { kind, src: fromLibrary, name, srcDur: secs, dur: kind === 'image' ? 3 : secs || 5 }),
    )
  }, [fromLibrary, params, create])

  const remove = async (p) => {
    try {
      await api.del(`/editor/projects/${p.id}`)
      setRows((xs) => xs.filter((x) => x.id !== p.id))
      showToast('Project deleted — its exported videos stay in the Library')
    } catch (e) {
      showToast(e.message || 'Could not delete it')
    }
  }

  return (
    <div className="w-full px-5 pt-6 pb-10 lg:px-10 animate-fadein">
      <div className="mb-6">
        <h1 className="page-title">Video editor</h1>
      </div>

      <h2 className="mb-2 text-[13px] font-bold text-ink-900">Start a new video</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RATIOS.map((r) => {
          const [w, h] = EDIT_SIZES[r.id]
          return (
            <button key={r.id} type="button" disabled={busy || !!fromLibrary} onClick={() => create(r.id)} className="group flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-3 text-left transition-colors hover:border-brand disabled:opacity-50">
              <span className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-ink-100 group-hover:bg-brand-soft">
                <span className="rounded-[3px] border-2 border-ink-400 group-hover:border-brand" style={{ width: (w / Math.max(w, h)) * 30, height: (h / Math.max(w, h)) * 30 }} />
              </span>
              <span>
                <span className="flex items-center gap-1 text-[13px] font-bold text-ink-900">
                  <FiPlus size={13} /> {r.label}
                </span>
                <span className="text-[11.5px] text-ink-500">{r.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {fromLibrary && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" /> Opening your Library video in the editor…
        </p>
      )}

      <h2 className="mb-2 mt-8 text-[13px] font-bold text-ink-900">Your projects</h2>
      {rows == null ? (
        <div className="grid place-items-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        </div>
      ) : rows.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((p) => (
            <div key={p.id} className="group overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <button type="button" onClick={() => navigate(`/editor/${p.id}`)} className="block w-full text-left">
                <div className="relative aspect-video bg-night-950">
                  {p.cover && <img src={thumbOf(p.cover)} alt="" loading="lazy" className="h-full w-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                  {!p.cover && <FiFilm size={22} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/30" />}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-night-950/80 px-1.5 py-0.5 text-[10px] tabular-nums text-white">{fmtTime(p.seconds)}</span>
                  <span className="absolute left-1.5 top-1.5 rounded bg-night-950/80 px-1.5 py-0.5 text-[10px] text-white">{p.ratio}</span>
                </div>
                <div className="px-3 pb-1 pt-2">
                  <div className="truncate text-[12.5px] font-semibold text-ink-900">{p.name}</div>
                  <div className="text-[11px] text-ink-500">{new Date(p.updated_at).toLocaleDateString()}</div>
                </div>
              </button>
              <div className="flex justify-end px-2 pb-2">
                <button type="button" title="Delete this project" onClick={() => remove(p)} className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600">
                  <FiTrash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-[12.5px] text-ink-500">No projects yet — start one above.</p>
      )}
    </div>
  )
}

// ── the player: sized to fit, with its own controls ─────────────────────────
function Stage({ playerRef, clock, inputProps, ratio, frames, onDropItem, onDropFiles }) {
  const box = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [over, setOver] = useState(false) // something dragged over the player
  const accepts = (e) => e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')
  const [w, h] = EDIT_SIZES[ratio] || EDIT_SIZES['9:16']
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return undefined
    const fit = () => {
      const bw = el.clientWidth
      const bh = el.clientHeight
      const k = Math.min(bw / w, bh / h)
      setSize({ w: Math.floor(w * k), h: Math.floor(h * k) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])

  // the player tells the clock where it is
  useEffect(() => {
    const p = playerRef.current
    if (!p) return undefined
    const onFrame = (e) => clock.set(e.detail.frame / FPS)
    const onPlay = () => clock.setPlaying(true)
    const onPause = () => clock.setPlaying(false)
    p.addEventListener('frameupdate', onFrame)
    p.addEventListener('seeked', onFrame)
    p.addEventListener('play', onPlay)
    p.addEventListener('pause', onPause)
    p.addEventListener('ended', onPause)
    return () => {
      p.removeEventListener('frameupdate', onFrame)
      p.removeEventListener('seeked', onFrame)
      p.removeEventListener('play', onPlay)
      p.removeEventListener('pause', onPause)
      p.removeEventListener('ended', onPause)
    }
  }, [playerRef, clock, size.w > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[260px] min-w-0 flex-1 flex-col bg-ink-100">
      {/* drop from the left panel (or files from the computer) — added at the red line */}
      <div
        ref={box}
        className="relative flex min-h-0 flex-1 items-center justify-center p-3"
        onDragOver={(e) => {
          if (!accepts(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOver(false)
        }}
        onDrop={(e) => {
          if (!accepts(e)) return
          e.preventDefault()
          setOver(false)
          const raw = e.dataTransfer.getData(DRAG_TYPE)
          if (raw) {
            try {
              onDropItem(JSON.parse(raw))
            } catch {
              /* not ours */
            }
          } else if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files)
        }}
      >
        {size.w > 0 && (
          <div style={{ width: size.w, height: size.h }} className={`relative overflow-hidden rounded-md bg-night-950 shadow-lg transition-shadow ${over ? 'ring-2 ring-brand ring-offset-2 ring-offset-ink-100' : 'ring-1 ring-ink-200'}`}>
            {over && (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-night-950/40">
                <span className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white shadow">Drop to add at the red line</span>
              </div>
            )}
            <Player
              ref={playerRef}
              component={Timeline}
              inputProps={inputProps}
              durationInFrames={frames}
              compositionWidth={w}
              compositionHeight={h}
              fps={FPS}
              style={{ width: size.w, height: size.h }}
              clickToPlay={false}
              doubleClickToFullscreen
              spaceKeyToPlayOrPause={false}
              moveToBeginningWhenEnded={false}
            />
          </div>
        )}
      </div>
      <Controls playerRef={playerRef} clock={clock} frames={frames} />
    </div>
  )
}

function Controls({ playerRef, clock, frames }) {
  const t = useTime(clock)
  const playing = usePlaying(clock)
  const btn = 'grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900'
  return (
    <div className="flex flex-none items-center justify-center gap-2 border-t border-ink-200 bg-white px-3 py-1.5 text-ink-900">
      <button type="button" title="Back to the start" onClick={() => playerRef.current?.seekTo(0)} className={btn}>
        <FiSkipBack size={14} />
      </button>
      <button type="button" title="Play / pause (Space)" onClick={() => playerRef.current?.toggle()} className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-ink-50 hover:scale-105">
        {playing ? <FiPause size={15} /> : <FiPlay size={15} className="translate-x-px" />}
      </button>
      <span className="min-w-[120px] text-center text-[11.5px] tabular-nums text-ink-500">
        <b className="font-semibold text-ink-900">{fmtTime(t, true)}</b> / {fmtTime(frames / FPS, true)}
      </span>
      <button type="button" title="Full screen" onClick={() => playerRef.current?.requestFullscreen()} className={btn}>
        <FiMaximize size={14} />
      </button>
    </div>
  )
}

// ── the editor ──────────────────────────────────────────────────────────────
function Workspace({ id }) {
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [project, setProject] = useState(null) // { id, name, ratio, brand_id }
  const [error, setError] = useState('')
  const [tl, setTl] = useState(null)
  const [selected, setSelected] = useState(null)
  const [zoom, setZoom] = useState(60)
  // the timeline's height (big screens): dragged with the bar above it, kept for next time
  const [timelineH, setTimelineH] = useState(() => {
    try {
      return Number(localStorage.getItem(TIMELINE_KEY)) || TIMELINE_H
    } catch {
      return TIMELINE_H
    }
  })
  const box = useRef(null)
  const startResize = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const y0 = e.clientY
    const h0 = timelineH
    const most = Math.max(TIMELINE_MIN, (box.current?.clientHeight || 800) - 240) // the player keeps some room
    let h = h0
    const move = (ev) => {
      h = Math.round(Math.min(most, Math.max(TIMELINE_MIN, h0 + (y0 - ev.clientY))))
      setTimelineH(h)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      try {
        localStorage.setItem(TIMELINE_KEY, String(h))
      } catch {
        /* not kept — fine */
      }
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const [uploads, setUploads] = useState([])
  const [save, setSave] = useState('saved') // saved | saving | waiting | failed
  const [job, setJob] = useState(null) // the export: { id, pct }
  const [done, setDone] = useState(null) // the exported video
  const [, bump] = useState(0) // re-draw when undo / redo become (un)available
  const clock = useMemo(() => createClock(), [])
  const playerRef = useRef(null)
  const now = useRef(null) // the timeline as it is (no waiting for React)
  const hist = useRef({ past: [], future: [] })
  const pending = useRef(null) // the timeline before a drag / slider move began
  const durations = useRef(new Map())
  const loaded = useRef(false)

  useEffect(() => {
    let alive = true
    api
      .get(`/editor/projects/${id}`)
      .then((p) => {
        if (!alive) return
        const data = p.data?.tracks?.length ? p.data : { tracks: startTracks(), clips: p.data?.clips || [] }
        now.current = data
        setTl(data)
        setProject({ id: p.id, name: p.name, ratio: p.ratio, brand_id: p.brand_id })
      })
      .catch((e) => alive && setError(e.message || 'This project can’t be opened.'))
    return () => {
      alive = false
    }
  }, [id])

  // ── history: every change is one undo step; a drag or a slider move is one too
  const show = (next) => {
    now.current = next
    setTl(next)
  }
  const flush = useCallback(() => {
    if (pending.current && pending.current !== now.current) {
      hist.current.past = [...hist.current.past, pending.current].slice(-HISTORY)
      hist.current.future = []
      bump((n) => n + 1)
    }
    pending.current = null
  }, [])
  const begin = useCallback(() => {
    flush()
    pending.current = now.current
  }, [flush])
  const live = useCallback((next) => show(tidyTracks(next)), [])
  const commit = useCallback(
    (fn) => {
      flush()
      const cur = now.current
      const next = fn(cur)
      if (!next || next === cur) return
      hist.current.past = [...hist.current.past, cur].slice(-HISTORY)
      hist.current.future = []
      show(tidyTracks(next))
      bump((n) => n + 1)
    },
    [flush],
  )
  const undo = useCallback(() => {
    flush()
    const { past, future } = hist.current
    if (!past.length) return
    hist.current = { past: past.slice(0, -1), future: [now.current, ...future] }
    show(past[past.length - 1])
    bump((n) => n + 1)
  }, [flush])
  const redo = useCallback(() => {
    flush()
    const { past, future } = hist.current
    if (!future.length) return
    hist.current = { past: [...past, now.current], future: future.slice(1) }
    show(future[0])
    bump((n) => n + 1)
  }, [flush])

  // ── saving: a second after the last change
  const saveNow = useCallback(async () => {
    if (!project || !now.current) return
    setSave('saving')
    try {
      await api.put(`/editor/projects/${project.id}`, { name: project.name, ratio: project.ratio, data: now.current })
      setSave('saved')
    } catch {
      setSave('failed')
    }
  }, [project])
  useEffect(() => {
    if (!tl || !project) return undefined
    if (!loaded.current) {
      loaded.current = true
      return undefined
    }
    setSave('waiting')
    const timer = setTimeout(saveNow, 1000)
    return () => clearTimeout(timer)
  }, [tl, project, saveNow])
  // leaving with a change not saved yet: save it on the way out
  const saveRef = useRef(saveNow)
  saveRef.current = saveNow
  const saveState = useRef(save)
  saveState.current = save
  useEffect(() => () => saveState.current === 'waiting' && saveRef.current(), [])

  // ── the player
  const seek = useCallback((t) => {
    const f = Math.max(0, Math.round(t * FPS))
    playerRef.current?.seekTo(f)
    clock.set(f / FPS)
  }, [clock])
  const frames = Math.max(FPS, Math.round(((tl && lengthOf(tl)) || 0) * FPS))
  const inputProps = useMemo(
    () => (tl ? { ratio: project?.ratio, tracks: tl.tracks, clips: tl.clips.map((c) => (c.src ? { ...c, src: abs(c.src) } : c)) } : null),
    [tl, project?.ratio],
  )

  // ── adding things
  const lengthOfFile = async (item) => {
    if (item.kind === 'image' || item.kind === 'text') return 0
    if (item.srcDur) return item.srcDur
    if (!durations.current.has(item.src)) durations.current.set(item.src, await probeSeconds(abs(item.src), item.kind))
    return durations.current.get(item.src)
  }
  const addMedia = useCallback(
    async (item, t, track) => {
      if (item.kind === 'text') {
        const { kind, text, size, look, color, y, name } = item
        let added = null
        commit((cur) => {
          const r = addClip(cur, { kind, text, size, look, color, y, name }, t, track)
          added = r.id
          return r.tl
        })
        setSelected(added)
        return added
      }
      if (!item.src) return null
      const secs = await lengthOfFile(item)
      let added = null
      commit((cur) => {
        const r = addClip(cur, { kind: item.kind, src: item.src, name: item.name, srcDur: secs, dur: item.kind === 'image' ? 3 : secs || 5 }, t, track)
        added = r.id
        return r.tl
      })
      setSelected(added)
      return added
    },
    [commit], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const importFiles = useCallback(
    async (files) => {
      const out = []
      for (const file of Array.from(files || [])) {
        const kind = kindOfFile(file)
        if (!kind) {
          showToast(`${file.name}: only videos, pictures and sounds can be imported`)
          continue
        }
        if (file.size > MAX_BYTES) {
          showToast(`${file.name} is over 200 MB`)
          continue
        }
        const temp = { id: `up${Math.random().toString(36).slice(2)}`, kind, src: '', name: file.name, uploading: true }
        setUploads((xs) => [temp, ...xs])
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('tag', `editor-${kind}`)
          if (project?.brand_id) fd.append('brand_id', String(project.brand_id))
          const r = await api.upload('/media/upload', fd)
          const item = { id: r.id, kind, src: r.url, name: r.filename }
          setUploads((xs) => xs.map((x) => (x.id === temp.id ? item : x)))
          out.push(item)
        } catch (e) {
          setUploads((xs) => xs.filter((x) => x.id !== temp.id))
          showToast(`Could not import ${file.name} — ${e.message || 'try again'}`)
        }
      }
      return out
    },
    [project?.brand_id, showToast],
  )
  const dropFiles = useCallback(
    async (files, t, track) => {
      let at = t
      for (const item of await importFiles(files)) {
        const id = await addMedia(item, at, track)
        const added = now.current.clips.find((c) => c.id === id)
        if (added) at = endOf(added) // the next file goes after this one
      }
    },
    [importFiles, addMedia],
  )

  // ── clip actions
  const selectedClip = tl?.clips.find((c) => c.id === selected) || null
  const split = useCallback(() => {
    const t = clock.get()
    const cur = now.current
    const sel = cur.clips.find((c) => c.id === selected)
    const targets = sel && t > sel.start && t < endOf(sel) ? [sel] : sel ? [] : cur.clips.filter((c) => t > c.start && t < endOf(c))
    if (!targets.length) {
      showToast(sel ? 'Move the red line onto the clip to cut it' : 'Move the red line onto a clip to cut it')
      return
    }
    commit((x) => targets.reduce((acc, c) => splitClip(acc, c.id, t).tl, x))
  }, [clock, selected, commit, showToast])
  // Q / W (CapCut's keys): drop the part before / after the red line
  const trimTo = useCallback(
    (side) => {
      const t = clock.get()
      const cur = now.current
      const sel = cur.clips.find((c) => c.id === selected)
      const targets = sel && t > sel.start && t < endOf(sel) ? [sel] : sel ? [] : cur.clips.filter((c) => t > c.start && t < endOf(c))
      if (!targets.length) {
        showToast(sel ? 'Move the red line onto the clip to trim it' : 'Move the red line onto a clip to trim it')
        return
      }
      commit((x) => targets.reduce((acc, c) => trimClip(acc, c.id, side, t), x))
    },
    [clock, selected, commit, showToast],
  )
  const remove = useCallback(() => {
    if (!selected) return
    commit((x) => removeClip(x, selected))
    setSelected(null)
  }, [selected, commit])
  const duplicate = useCallback(() => {
    if (!selected) return
    let copy = null
    commit((x) => {
      const r = duplicateClip(x, selected)
      copy = r.id
      return r.tl
    })
    if (copy) setSelected(copy)
  }, [selected, commit])
  const setTrack = useCallback((trackId, patch) => commit((x) => ({ ...x, tracks: x.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) })), [commit])

  // ── keys
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping()) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === ' ') {
        e.preventDefault()
        playerRef.current?.toggle()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicate()
      } else if ((!mod && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'c')) || (mod && e.key.toLowerCase() === 'b')) {
        e.preventDefault()
        split()
      } else if (!mod && e.key.toLowerCase() === 'q') {
        e.preventDefault()
        trimTo('left')
      } else if (!mod && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        trimTo('right')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault()
          remove()
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 1 / FPS
        seek(clock.get() + (e.key === 'ArrowLeft' ? -step : step))
      } else if (e.key === 'Home') {
        seek(0)
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, duplicate, split, trimTo, remove, selected, seek, clock])

  // ── export
  const exportVideo = async () => {
    if (!now.current?.clips.length) {
      showToast('Add a video, picture or words to the timeline first')
      return
    }
    playerRef.current?.pause()
    try {
      await api.put(`/editor/projects/${project.id}`, { name: project.name, ratio: project.ratio, data: now.current })
      setSave('saved')
      const res = await api.post(`/editor/projects/${project.id}/export`)
      setDone(null)
      setJob({ id: res.id, pct: 0 })
    } catch (e) {
      showToast(e.message || 'Could not export — try again')
    }
  }
  useEffect(() => {
    if (!job?.id) return undefined
    let alive = true
    const timer = setInterval(async () => {
      try {
        const j = await api.get(`/ai/video/${job.id}`)
        if (!alive) return
        if (j.status === 'succeeded' && j.video) {
          setJob(null)
          setDone({ url: j.video.url, filename: j.video.filename, video_id: j.video.id })
          showToast('Exported to your Library')
        } else if (j.status === 'failed') {
          setJob(null)
          if (j.error !== 'Stopped') showToast(j.error || 'Could not export — try again')
        } else {
          setJob((x) => x && { ...x, pct: Math.round((j.progress?.render || 0) * 100) })
        }
      } catch {
        // a missed poll — the next one tries again
      }
    }, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [job?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const stopExport = async () => {
    try {
      await api.post(`/ai/video/${job.id}/stop`)
    } catch {
      /* it may have just finished */
    }
    setJob(null)
  }
  const post = () => {
    handoff.set({ name: done.filename, size: 0, kind: 'video', url: abs(done.url), videoId: done.video_id, caption: '', source: 'Library' })
    navigate('/new')
  }

  if (error) {
    return (
      <div className="w-full px-5 py-10 lg:px-10">
        <button type="button" onClick={() => navigate('/editor')} className="btn-outline mb-6">
          <FiArrowLeft size={13} /> Projects
        </button>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
      </div>
    )
  }
  if (!tl || !project) {
    return (
      <div className="grid w-full place-items-center px-5 py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    )
  }

  const saveLabel = { saved: 'Saved', saving: 'Saving…', waiting: 'Saving…', failed: 'Not saved — check your connection' }[save]

  return (
    <div ref={box} className="flex w-full flex-col bg-canvas text-ink-900 lg:h-[calc(100dvh-3.5rem-var(--tabs-h,0px))]">
      {/* top bar */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-3 py-2">
        <button type="button" onClick={() => navigate('/editor')} title="Your projects" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900">
          <FiArrowLeft size={15} />
        </button>
        <input
          value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value.slice(0, 120) }))}
          aria-label="Project name"
          className="min-w-0 max-w-[260px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13.5px] font-semibold text-ink-900 outline-none hover:border-ink-200 focus:border-brand"
        />
        <span className={`flex items-center gap-1 text-[11px] ${save === 'failed' ? 'text-red-600' : 'text-ink-400'}`}>
          {save === 'saved' && <FiCheck size={11} />} {saveLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {job ? (
            <>
              <span className="flex items-center gap-2 text-[12px] text-ink-600">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                Exporting… {job.pct ? `${job.pct}%` : ''}
              </span>
              <button type="button" onClick={stopExport} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                Stop
              </button>
            </>
          ) : (
            <button type="button" onClick={exportVideo} className="btn-primary">
              <FiUpload size={13} /> Export
            </button>
          )}
        </div>
      </div>

      {done && (
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[12.5px]">
          <FiCheck size={14} className="text-emerald-700" />
          <span className="min-w-0 flex-1 text-emerald-800">Your video is in the Library. Keep editing — export again any time.</span>
          <button type="button" onClick={post} className="btn-primary">
            <FiSend size={12} /> Use in post
          </button>
          <a href={abs(done.url)} download={done.filename} className="btn-outline">
            <FiDownload size={12} /> Download
          </a>
          <button type="button" onClick={() => navigate('/library')} className="btn-outline">
            Open Library
          </button>
          <button type="button" aria-label="Close" onClick={() => setDone(null)} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100">
            <FiX size={13} />
          </button>
        </div>
      )}

      {/* media · player · settings */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <div className="order-2 h-[300px] overflow-hidden lg:order-none lg:h-auto">
          <MediaPanel
            uploads={uploads}
            setUploads={setUploads}
            onImport={importFiles}
            onAdd={(item) => addMedia(item, clock.get(), null)}
            onAddWords={(w) => addMedia({ kind: 'text', ...w }, clock.get(), null)}
          />
        </div>
        <div className="order-1 flex h-[56vh] min-w-0 flex-1 lg:order-none lg:h-auto">
          <Stage
            playerRef={playerRef}
            clock={clock}
            inputProps={inputProps}
            ratio={project.ratio}
            frames={frames}
            onDropItem={(item) => addMedia(item, clock.get(), null)}
            onDropFiles={(files) => dropFiles(files, clock.get(), null)}
          />
        </div>
        <div className="order-3 overflow-hidden lg:order-none">
          <Inspector
            clip={selectedClip}
            ratio={project.ratio}
            onRatio={(r) => setProject((p) => ({ ...p, ratio: r }))}
            onStart={begin}
            onLive={(cid, patch) => live(updateClip(now.current, cid, patch))}
            onChange={(cid, patch) => commit((x) => updateClip(x, cid, patch))}
            onSplit={split}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </div>
      </div>

      {/* drag up / down: a taller timeline or a bigger player */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize the timeline"
        onPointerDown={startResize}
        onDoubleClick={() => setTimelineH(TIMELINE_H)}
        className="group relative hidden h-2 flex-none cursor-row-resize lg:block"
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-200 transition-colors group-hover:h-[3px] group-hover:bg-brand" />
        <div className="absolute left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-300 group-hover:bg-brand" />
      </div>

      {/* the timeline */}
      <div className="h-[300px] flex-none lg:h-[var(--tl-h)]" style={{ '--tl-h': `${timelineH}px` }}>
        <TimelineArea
          tl={tl}
          clock={clock}
          selected={selected}
          onSelect={setSelected}
          onSeek={seek}
          onBegin={begin}
          onLive={live}
          onCommit={flush}
          onDropMedia={addMedia}
          onDropFiles={dropFiles}
          onTrack={setTrack}
          onSplit={split}
          onTrimStart={() => trimTo('left')}
          onTrimEnd={() => trimTo('right')}
          onDelete={remove}
          onDuplicate={duplicate}
          onUndo={undo}
          onRedo={redo}
          canUndo={hist.current.past.length > 0 || (pending.current && pending.current !== tl)}
          canRedo={hist.current.future.length > 0}
          zoom={zoom}
          setZoom={setZoom}
        />
      </div>
    </div>
  )
}

export default function EditorPage() {
  const { id } = useParams()
  return id ? <Workspace id={Number(id)} /> : <Projects />
}
