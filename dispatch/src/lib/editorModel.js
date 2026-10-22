// The video editor's timeline as data (pages/EditorPage.jsx) — the same shape
// motion/src/timeline.jsx plays and app/editor.py saves:
//   { tracks: [{ id, kind: video|text|audio, muted?, hidden? }],
//     clips:  [{ id, track, kind: video|image|audio|text, start, dur, from, srcDur, src, … }] }
// Times are seconds. Every change here returns a NEW timeline (undo keeps the old one).

export const FPS = 30
export const MIN_DUR = 0.1
export const IMAGE_SECONDS = 3
export const TEXT_SECONDS = 3

let seq = 0
export const newId = (p = 'c') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 24)

const r3 = (n) => Math.round(n * 1000) / 1000
export const snapFrame = (t) => Math.round(t * FPS) / FPS

/** Which kind of track a clip goes on. */
export const trackKindFor = (kind) => (kind === 'text' ? 'text' : kind === 'audio' ? 'audio' : 'video')

export const TRACK_LABELS = { video: 'Video', text: 'Words', audio: 'Sound' }

/** A new project's tracks, top to bottom: words over an overlay over the main video, then sound. */
export const startTracks = () => [
  { id: newId('t'), kind: 'text' },
  { id: newId('t'), kind: 'video' },
  { id: newId('t'), kind: 'video' },
  { id: newId('t'), kind: 'audio' },
]

export const endOf = (c) => c.start + c.dur
export const lengthOf = (tl) => Math.max(0, ...tl.clips.map(endOf))

/** Clips on one track, in time order. */
export const onTrack = (tl, trackId, except) => tl.clips.filter((c) => c.track === trackId && c.id !== except).sort((a, b) => a.start - b.start)

/** Does [start, start+dur) fit on the track without covering another clip? */
export const fits = (tl, trackId, start, dur, except) =>
  onTrack(tl, trackId, except).every((c) => start + dur <= c.start + 1e-6 || start >= endOf(c) - 1e-6)

/** The first free spot at or after `start` on the track for a clip `dur` long. */
export const freeSpot = (tl, trackId, start, dur, except) => {
  let t = Math.max(0, start)
  for (const c of onTrack(tl, trackId, except)) {
    if (t + dur <= c.start + 1e-6) break
    if (t < endOf(c)) t = endOf(c)
  }
  return r3(t)
}

/** A track of this kind where the clip fits at `start` — the one asked for first — or a new one. */
export const placeOn = (tl, kind, wantTrack, start, dur) => {
  const want = trackKindFor(kind)
  const ordered = [...tl.tracks.filter((t) => t.id === wantTrack), ...tl.tracks.filter((t) => t.id !== wantTrack)]
  for (const t of ordered) if (t.kind === want && fits(tl, t.id, start, dur)) return { tl, track: t.id }
  // no room: a new track of that kind, above the others of its sort (sound: at the bottom)
  const track = { id: newId('t'), kind: want }
  const tracks = [...tl.tracks]
  const firstOf = (k) => tracks.findIndex((t) => t.kind === k)
  let at = tracks.length // sound: at the bottom
  if (want === 'text') at = 0
  else if (want === 'video') at = firstOf('video') >= 0 ? firstOf('video') : firstOf('audio') >= 0 ? firstOf('audio') : tracks.length
  tracks.splice(at, 0, track)
  return { tl: { ...tl, tracks }, track: track.id }
}

/** Add a clip (an imported file, a Library video or words) at `start`, on `trackId` if it fits. */
export const addClip = (tl, base, start, trackId) => {
  const dur = r3(base.dur || (base.kind === 'image' ? IMAGE_SECONDS : TEXT_SECONDS))
  const at = snapFrame(Math.max(0, start))
  const placed = placeOn(tl, base.kind, trackId, at, dur)
  const clip = {
    from: 0,
    volume: 1,
    scale: 1,
    x: 0,
    y: 0,
    fadeIn: 0,
    fadeOut: 0,
    ...base,
    id: newId(),
    track: placed.track,
    start: at,
    dur,
  }
  if (clip.kind === 'video' || clip.kind === 'image') clip.fit = clip.fit || 'contain'
  return { tl: { ...placed.tl, clips: [...placed.tl.clips, clip] }, id: clip.id }
}

export const updateClip = (tl, id, patch) => ({ ...tl, clips: tl.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

export const removeClip = (tl, id) => ({ ...tl, clips: tl.clips.filter((c) => c.id !== id) })

/** Cut a clip in two at time `t` (the playhead). Returns the new timeline and the right half's id. */
export const splitClip = (tl, id, t) => {
  const c = tl.clips.find((x) => x.id === id)
  if (!c) return { tl, id: null }
  const at = snapFrame(t)
  if (at <= c.start + MIN_DUR || at >= endOf(c) - MIN_DUR) return { tl, id: null }
  const left = { ...c, dur: r3(at - c.start), fadeOut: 0 }
  const right = { ...c, id: newId(), start: at, dur: r3(endOf(c) - at), fadeIn: 0 }
  if (c.kind === 'video' || c.kind === 'audio') right.from = r3((c.from || 0) + (at - c.start))
  return { tl: { ...tl, clips: tl.clips.flatMap((x) => (x.id === id ? [left, right] : [x])) }, id: right.id }
}

/** A copy right after the clip (or on a free spot after it). */
export const duplicateClip = (tl, id) => {
  const c = tl.clips.find((x) => x.id === id)
  if (!c) return { tl, id: null }
  const start = freeSpot(tl, c.track, endOf(c), c.dur)
  const copy = { ...c, id: newId(), start }
  return { tl: { ...tl, clips: [...tl.clips, copy] }, id: copy.id }
}

/** How long a clip may become — a video or sound can't run past its file's end. */
export const maxDur = (c) => (c.kind === 'video' || c.kind === 'audio') && c.srcDur > 0 ? Math.max(MIN_DUR, c.srcDur - (c.from || 0)) : 3600

/**
 * Trim a clip's edge. side "left": the clip starts later (or earlier, up to
 * the start of its file) and its end stays put; "right": it ends earlier/later.
 * `t` is where the edge should go (seconds). Neighbours on the track stop it.
 */
export const trimClip = (tl, id, side, t) => {
  const c = tl.clips.find((x) => x.id === id)
  if (!c) return tl
  const others = onTrack(tl, c.track, id)
  const end = endOf(c)
  if (side === 'left') {
    const prev = others.filter((o) => endOf(o) <= c.start + 1e-6).pop()
    let lo = prev ? endOf(prev) : 0
    if (c.kind === 'video' || c.kind === 'audio') lo = Math.max(lo, c.start - (c.from || 0)) // the file's start
    const s = snapFrame(Math.min(end - MIN_DUR, Math.max(lo, t)))
    const shift = s - c.start
    const patch = { start: r3(s), dur: r3(end - s) }
    if (c.kind === 'video' || c.kind === 'audio') patch.from = r3(Math.max(0, (c.from || 0) + shift))
    return updateClip(tl, id, patch)
  }
  const next = others.find((o) => o.start >= end - 1e-6)
  const hi = Math.min(next ? next.start : Infinity, c.start + maxDur(c))
  const e = snapFrame(Math.max(c.start + MIN_DUR, Math.min(hi, t)))
  return updateClip(tl, id, { dur: r3(e - c.start) })
}

/** Move a clip to `start` on `trackId` (a track of its sort). Where it would cover another clip it stays where it was. */
export const moveClip = (tl, id, start, trackId) => {
  const c = tl.clips.find((x) => x.id === id)
  if (!c) return tl
  const track = tl.tracks.find((t) => t.id === trackId && t.kind === trackKindFor(c.kind)) ? trackId : c.track
  const s = snapFrame(Math.max(0, start))
  if (fits(tl, track, s, c.dur, id)) return updateClip(tl, id, { start: r3(s), track })
  if (track !== c.track && fits(tl, c.track, s, c.dur, id)) return updateClip(tl, id, { start: r3(s) })
  return tl
}

/** Edges a moving edge snaps to: 0, the playhead, every other clip's start and end. */
export const snapPoints = (tl, except, playhead) => {
  const pts = [0, playhead]
  for (const c of tl.clips) if (c.id !== except) pts.push(c.start, endOf(c))
  return pts
}

/** `t` pulled to the nearest snap point within `tol` seconds. */
export const snapTo = (t, pts, tol) => {
  let best = t
  let gap = tol
  for (const p of pts) {
    const d = Math.abs(p - t)
    if (d < gap) {
      gap = d
      best = p
    }
  }
  return best
}

/** Tracks with nothing on them are dropped — except one of each kind, so there's always somewhere to drop. */
export const tidyTracks = (tl) => {
  const used = new Set(tl.clips.map((c) => c.track))
  const kept = new Set()
  const tracks = tl.tracks.filter((t) => {
    if (used.has(t.id)) return true
    if (!kept.has(t.kind)) {
      kept.add(t.kind)
      return true
    }
    return false
  })
  return tracks.length === tl.tracks.length ? tl : { ...tl, tracks }
}

export const fmtTime = (t, frames = false) => {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return frames ? `${base}:${String(Math.floor((s * FPS) % FPS)).padStart(2, '0')}` : base
}

/** A file's length, read from its metadata in the browser (0 when it can't be read). */
export const probeSeconds = (url, kind) =>
  new Promise((resolve) => {
    if (kind === 'image') return resolve(0)
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video')
    el.preload = 'metadata'
    el.muted = true
    const done = (v) => {
      el.removeAttribute('src')
      resolve(v)
    }
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0)
    el.onerror = () => done(0)
    setTimeout(() => done(0), 15000)
    el.src = url
  })

/** What kind of clip a file is. */
export const kindOfFile = (file) => {
  const t = file.type || ''
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('audio/')) return 'audio'
  if (t.startsWith('video/')) return 'video'
  const ext = (file.name || '').split('.').pop().toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) return 'audio'
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video'
  return null
}

/** Keep at most this many steps of undo. */
export const HISTORY = 100
