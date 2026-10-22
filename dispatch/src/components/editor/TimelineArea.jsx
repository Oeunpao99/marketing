import { memo, useEffect, useRef, useState } from 'react'
import { FiChevronsLeft, FiChevronsRight, FiCopy, FiEye, FiEyeOff, FiFilm, FiMinus, FiMusic, FiPlus, FiRotateCcw, FiRotateCw, FiScissors, FiTrash2, FiType, FiVolume2, FiVolumeX } from 'react-icons/fi'
import { endOf, fmtTime, moveClip, snapPoints, snapTo, trimClip } from '../../lib/editorModel'
import { useTime } from './clock'
import { DRAG_TYPE } from './MediaPanel'
import { thumbOf } from './media'

// The video editor's timeline: a ruler, the tracks (words, videos, sound) and
// their clips, and the red playhead line. Drag a clip to move it (to another
// track of its sort too), drag its edges to trim, drop files from the left
// panel onto a track. Clicking the ruler or an empty spot moves the playhead.

const LABEL_W = 88
const ROW_H = { text: 34, video: 58, audio: 42 }
const TRACK_ICON = { text: FiType, video: FiFilm, audio: FiMusic }
const CLIP_CLS = {
  video: 'bg-sky-700 ring-sky-400',
  image: 'bg-indigo-700 ring-indigo-400',
  text: 'bg-amber-600 ring-amber-300',
  audio: 'bg-emerald-700 ring-emerald-400',
}
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]

function Ruler({ zoom, seconds }) {
  const step = STEPS.find((s) => s * zoom >= 70) || 120
  const ticks = []
  for (let t = 0; t <= seconds; t += step) ticks.push(t)
  return (
    <div className="relative h-full">
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full border-l border-ink-200" style={{ left: t * zoom }}>
          <span className="ml-1 text-[9.5px] tabular-nums text-ink-400">{fmtTime(t)}</span>
        </div>
      ))}
      {ticks.map((t) =>
        [1, 2, 3, 4].map((q) => <div key={`${t}-${q}`} className="absolute bottom-0 h-1.5 border-l border-ink-200" style={{ left: (t + (step * q) / 5) * zoom }} />),
      )}
    </div>
  )
}

/** The red line — on its own so playback re-draws only it. Keeps itself in view while playing. */
function Playhead({ clock, zoom, scroller, height }) {
  const t = useTime(clock)
  const x = t * zoom
  useEffect(() => {
    const el = scroller.current
    if (!el || !clock.isPlaying()) return
    const view = el.clientWidth - LABEL_W
    if (x > el.scrollLeft + view - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80)
  }, [x, clock, scroller])
  return (
    <div className="pointer-events-none absolute top-0 z-20" style={{ left: LABEL_W + x, height }}>
      <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-red-500" />
      <div className="absolute left-0 top-0 h-full w-px bg-red-500" />
    </div>
  )
}

function Clip({ clip, zoom, selected, onPointerDown }) {
  const left = clip.start * zoom
  const width = Math.max(4, clip.dur * zoom)
  const thumb = clip.kind === 'video' || clip.kind === 'image' ? thumbOf(clip.src) : ''
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, clip, 'move')}
      className={`group absolute inset-y-1 cursor-grab overflow-hidden rounded-md text-white shadow-sm active:cursor-grabbing ${CLIP_CLS[clip.kind] || CLIP_CLS.video} ${selected ? 'z-10 ring-2' : 'ring-0'}`}
      style={{ left, width }}
      title={clip.name || clip.text || ''}
    >
      {thumb && (
        <div
          className="absolute inset-0 opacity-70"
          style={{ backgroundImage: `url("${thumb}")`, backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%' }}
        />
      )}
      {clip.kind === 'audio' && (
        <div
          className="absolute inset-x-0 bottom-1 top-4 opacity-40"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.9) 0 2px, transparent 2px 5px)', maskImage: 'linear-gradient(transparent 0, black 30%, black 70%, transparent 100%)' }}
        />
      )}
      <span className="relative block truncate px-2 pt-0.5 text-[10.5px] font-semibold drop-shadow">
        {clip.kind === 'text' ? clip.text || 'Words' : clip.name || ''}
      </span>
      {clip.volume === 0 && clip.kind !== 'text' && clip.kind !== 'image' && (
        <FiVolumeX size={11} className="absolute bottom-1 left-1.5 opacity-80" />
      )}
      {/* the edges: drag to trim */}
      <div onPointerDown={(e) => onPointerDown(e, clip, 'left')} className={`absolute inset-y-0 left-0 w-2 cursor-ew-resize ${selected ? 'bg-white/80' : 'group-hover:bg-white/40'}`} />
      <div onPointerDown={(e) => onPointerDown(e, clip, 'right')} className={`absolute inset-y-0 right-0 w-2 cursor-ew-resize ${selected ? 'bg-white/80' : 'group-hover:bg-white/40'}`} />
    </div>
  )
}

function TimelineArea({ tl, clock, selected, onSelect, onSeek, onLive, onBegin, onCommit, onDropMedia, onDropFiles, onTrack, onSplit, onTrimStart, onTrimEnd, onDelete, onDuplicate, onUndo, onRedo, canUndo, canRedo, zoom, setZoom }) {
  const scroller = useRef(null)
  const drag = useRef(null)
  const [dropAt, setDropAt] = useState(null) // { track, t } while something is dragged over

  const seconds = Math.max(30, Math.ceil(Math.max(0, ...tl.clips.map(endOf)) + 15))
  const width = seconds * zoom
  const height = 24 + tl.tracks.reduce((n, t) => n + ROW_H[t.kind], 0) + 36

  const timeAt = (clientX) => {
    const el = scroller.current
    const box = el.getBoundingClientRect()
    return Math.max(0, (clientX - box.left - LABEL_W + el.scrollLeft) / zoom)
  }
  const trackAt = (clientX, clientY) => {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      if (el.dataset?.track) return el.dataset.track
    }
    return null
  }

  // seeking: press on the ruler (or an empty spot on a track) and drag
  const startSeek = (e) => {
    if (e.button !== 0) return
    onSelect(null)
    onSeek(timeAt(e.clientX))
    const move = (ev) => onSeek(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // moving and trimming a clip — live while dragging, one undo step at the end
  const startClip = (e, clip, mode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect(clip.id)
    const base = tl
    const pts = snapPoints(base, clip.id, clock.get())
    const tol = 8 / zoom
    const x0 = e.clientX
    let moved = false
    drag.current = { id: clip.id }
    onBegin()
    const move = (ev) => {
      const dt = (ev.clientX - x0) / zoom
      if (!moved && Math.abs(ev.clientX - x0) < 3) return
      moved = true
      if (mode === 'move') {
        let s = clip.start + dt
        const snapS = snapTo(s, pts, tol)
        const snapE = snapTo(s + clip.dur, pts, tol)
        if (snapS !== s) s = snapS
        else if (snapE !== s + clip.dur) s = snapE - clip.dur
        onLive(moveClip(base, clip.id, s, trackAt(ev.clientX, ev.clientY) || clip.track))
      } else {
        const edge = mode === 'left' ? clip.start + dt : endOf(clip) + dt
        onLive(trimClip(base, clip.id, mode, snapTo(edge, pts, tol)))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      drag.current = null
      onCommit(moved)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // dropping from the media panel, or files from the computer
  const accepts = (e) => e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')
  const onDragOver = (e) => {
    if (!accepts(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropAt({ track: trackAt(e.clientX, e.clientY), t: timeAt(e.clientX) })
  }
  const onDrop = (e) => {
    if (!accepts(e)) return
    e.preventDefault()
    setDropAt(null)
    const t = timeAt(e.clientX)
    const track = trackAt(e.clientX, e.clientY)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (raw) {
      try {
        onDropMedia(JSON.parse(raw), t, track)
      } catch {
        /* not ours */
      }
    } else if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files, t, track)
  }

  // Ctrl + wheel zooms (CapCut-style)
  useEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    const wheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => Math.min(300, Math.max(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [setZoom])

  const btn = 'grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent'
  let y = 24

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-ink-200 bg-white">
      {/* the tools */}
      <div className="flex flex-none items-center gap-0.5 border-b border-ink-200 px-2 py-1">
        <button type="button" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} className={btn}>
          <FiRotateCcw size={14} />
        </button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} className={btn}>
          <FiRotateCw size={14} />
        </button>
        <span className="mx-1 h-5 w-px bg-ink-200" />
        <button type="button" title="Cut at the red line (S, C or Ctrl+B)" onClick={onSplit} className={btn}>
          <FiScissors size={14} />
        </button>
        <button type="button" title="Trim the start to the red line (Q)" onClick={onTrimStart} className={btn}>
          <FiChevronsLeft size={15} />
        </button>
        <button type="button" title="Trim the end to the red line (W)" onClick={onTrimEnd} className={btn}>
          <FiChevronsRight size={15} />
        </button>
        <button type="button" title="Duplicate (Ctrl+D)" onClick={onDuplicate} disabled={!selected} className={btn}>
          <FiCopy size={14} />
        </button>
        <button type="button" title="Delete (Del)" onClick={onDelete} disabled={!selected} className={btn}>
          <FiTrash2 size={14} />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" title="Zoom out" onClick={() => setZoom((z) => Math.max(8, z / 1.4))} className={btn}>
            <FiMinus size={13} />
          </button>
          <input type="range" min={8} max={300} value={Math.round(zoom)} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom the timeline" className="edit-range hidden w-28 sm:block" style={{ '--pct': `${((zoom - 8) / 292) * 100}%` }} />
          <button type="button" title="Zoom in (Ctrl + wheel)" onClick={() => setZoom((z) => Math.min(300, z * 1.4))} className={btn}>
            <FiPlus size={13} />
          </button>
        </div>
      </div>

      {/* the tracks */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto" onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}>
        <div className="relative" style={{ width: LABEL_W + width, minHeight: height }}>
          {/* ruler */}
          <div className="sticky top-0 z-[15] flex h-6 bg-white">
            <div className="sticky left-0 z-[16] flex-none bg-white" style={{ width: LABEL_W }} />
            <div className="relative flex-1 cursor-pointer" onPointerDown={startSeek}>
              <Ruler zoom={zoom} seconds={seconds} />
            </div>
          </div>

          {tl.tracks.map((t) => {
            const h = ROW_H[t.kind]
            const Icon = TRACK_ICON[t.kind]
            y += h
            return (
              <div key={t.id} className="flex border-b border-ink-100" style={{ height: h }}>
                <div className="sticky left-0 z-[12] flex flex-none items-center gap-1 border-r border-ink-200 bg-white px-2 text-ink-400" style={{ width: LABEL_W }}>
                  <Icon size={12} className="flex-none" />
                  {t.kind !== 'text' && (
                    <button type="button" title={t.muted ? 'Sound on' : 'Mute this track'} onClick={() => onTrack(t.id, { muted: !t.muted })} className="grid h-6 w-6 place-items-center rounded hover:bg-ink-100 hover:text-ink-800">
                      {t.muted ? <FiVolumeX size={12} className="text-red-500" /> : <FiVolume2 size={12} />}
                    </button>
                  )}
                  {t.kind !== 'audio' && (
                    <button type="button" title={t.hidden ? 'Show this track' : 'Hide this track'} onClick={() => onTrack(t.id, { hidden: !t.hidden })} className="grid h-6 w-6 place-items-center rounded hover:bg-ink-100 hover:text-ink-800">
                      {t.hidden ? <FiEyeOff size={12} className="text-red-500" /> : <FiEye size={12} />}
                    </button>
                  )}
                </div>
                <div data-track={t.id} className={`relative flex-1 ${dropAt?.track === t.id ? 'bg-brand-soft' : 'bg-ink-50/60'} ${t.hidden ? 'opacity-40' : ''}`} onPointerDown={startSeek}>
                  {tl.clips
                    .filter((c) => c.track === t.id)
                    .map((c) => (
                      <Clip key={c.id} clip={c} zoom={zoom} selected={selected === c.id} onPointerDown={startClip} />
                    ))}
                  {dropAt?.track === t.id && <div className="pointer-events-none absolute inset-y-1 w-0.5 rounded bg-brand" style={{ left: dropAt.t * zoom }} />}
                </div>
              </div>
            )
          })}
          {/* below the tracks: drop here for a new track */}
          <div className="flex" style={{ height: 36 }}>
            <div className="sticky left-0 z-[12] flex-none bg-white" style={{ width: LABEL_W }} />
            <div className="flex flex-1 items-center pl-3 text-[10.5px] text-ink-400" onPointerDown={startSeek}>
              {tl.clips.length ? 'Drop here for a new track' : 'Drag videos, pictures, sounds or words here'}
            </div>
          </div>
          <Playhead clock={clock} zoom={zoom} scroller={scroller} height={Math.max(height, y + 36)} />
        </div>
      </div>
    </section>
  )
}

export default memo(TimelineArea)
