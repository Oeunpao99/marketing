import { useState } from 'react'
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiArrowDown, FiArrowUp, FiCopy, FiFilm, FiImage, FiMinus, FiMusic, FiRotateCw, FiScissors, FiTrash2, FiType } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import { fmtTime } from '../../lib/editorModel'
import { isKhmer } from '../../lib/format'
import { ANIMS, FILTERS } from '../../../motion/src/timeline'
import { thumbOf } from './media'

// The video editor's right panel: the picked clip's settings in CapCut's tabs —
// Basic (volume, place, size, turn, opacity, fades; words, their size, colour
// and look), Speed, Animation (in / out) and Adjust (a filter, brightness,
// contrast, saturation, blur). With nothing picked, the video's shape.

const KIND = {
  video: { label: 'Video', icon: FiFilm },
  image: { label: 'Picture', icon: FiImage },
  audio: { label: 'Sound', icon: FiMusic },
  text: { label: 'Words', icon: FiType },
}
const COLORS = ['#ffffff', '#FFD84D', '#FF6B6B', '#4ADE80', '#60A5FA', '#111111']
const TABS = [
  { id: 'basic', label: 'Basic', kinds: ['video', 'image', 'audio', 'text'] },
  { id: 'speed', label: 'Speed', kinds: ['video', 'audio'] },
  { id: 'animation', label: 'Animation', kinds: ['video', 'image', 'text'] },
  { id: 'adjust', label: 'Adjust', kinds: ['video', 'image'] },
]
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
const ANIM_LABELS = {
  none: 'None',
  fade: 'Fade',
  zoom: 'Zoom in',
  'zoom-out': 'Zoom out',
  pop: 'Pop',
  'slide-left': 'From left',
  'slide-right': 'From right',
  'slide-up': 'From below',
  'slide-down': 'From above',
  spin: 'Spin',
}
const FILTER_LABELS = { none: 'None', bw: 'B&W', warm: 'Warm', cool: 'Cool', vintage: 'Vintage', vivid: 'Vivid', fade: 'Faded', drama: 'Drama' }
/** An adjustment (1 = as it was) shown as −100 … +100. */
const signed = (v) => {
  const n = Math.round((v - 1) * 100)
  return n > 0 ? `+${n}` : String(n)
}
export const RATIOS = [
  { id: '9:16', label: '9:16', hint: 'Reels, TikTok' },
  { id: '16:9', label: '16:9', hint: 'YouTube' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '4:5', label: '4:5', hint: 'Feed' },
]

function Row({ label, children }) {
  return (
    <div className="space-y-1">
      <div className="text-[12px] font-medium text-ink-600">{label}</div>
      {children}
    </div>
  )
}

/** A group's title (CapCut: Transform, Blend…) with a line above it. */
function Heading({ children }) {
  return <div className="-mx-4 border-t border-ink-200 px-4 pb-0.5 pt-3.5 text-[13px] font-semibold text-ink-900 first:border-t-0 first:pt-0">{children}</div>
}

/** A slider with its value; `fmt` shows it. Changes while dragging are live; `onDone` keeps one undo step. */
function Range({ value, min, max, step, onChange, onStart, fmt = (v) => v }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        className="edit-range min-w-0 flex-1"
        style={{ '--pct': `${((value - min) / (max - min || 1)) * 100}%` }}
      />
      <span className="min-w-[50px] flex-none rounded-md bg-ink-100 px-1.5 py-1 text-center text-[11px] font-medium tabular-nums text-ink-800">{fmt(value)}</span>
    </div>
  )
}

function Segments({ value, options, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${value === o.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function Inspector({ clip, ratio, onRatio, onLive, onStart, onChange, onSpeed, onSpeedLive, onSplit, onDuplicate, onDelete }) {
  const [tab, setTab] = useState('basic') // stays on the same tab from clip to clip, where it fits
  if (!clip) {
    return (
      <aside className="h-full min-h-0 overflow-y-auto border-ink-200 bg-white p-4 lg:w-[288px] lg:flex-none lg:border-l">
        <h3 className="text-[13px] font-bold text-ink-900">Video</h3>
        <div className="mt-3 space-y-4">
          <Row label="Shape">
            <div className="grid grid-cols-2 gap-1.5">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRatio(r.id)}
                  className={`rounded-lg px-2 py-2 text-left ring-1 transition-colors ${ratio === r.id ? 'bg-brand-soft text-brand ring-brand' : 'bg-ink-50 text-ink-700 ring-ink-200 hover:ring-ink-300'}`}
                >
                  <span className="block text-[12px] font-bold">{r.label}</span>
                  <span className="block text-[10px] text-ink-400">{r.hint}</span>
                </button>
              ))}
            </div>
          </Row>
          <div className="rounded-xl bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500">
            <b className="text-ink-800">How to edit</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Drag files from the left onto the timeline</li>
              <li>Drag a clip to move it, its edges to trim it</li>
              <li>
                <b className="text-ink-800">S</b> or <b className="text-ink-800">Ctrl+B</b> cuts at the red line, <b className="text-ink-800">Delete</b> removes
              </li>
              <li>
                <b className="text-ink-800">Q</b> trims the start to the red line, <b className="text-ink-800">W</b> the end
              </li>
              <li>
                <b className="text-ink-800">Space</b> plays, <b className="text-ink-800">Ctrl+Z</b> undoes
              </li>
            </ul>
          </div>
        </div>
      </aside>
    )
  }

  const K = KIND[clip.kind] || KIND.video
  const set = (patch) => onChange(clip.id, patch) // one undo step
  const live = (patch) => onLive(clip.id, patch) // while a slider moves
  const visual = clip.kind !== 'audio'
  const picture = clip.kind === 'video' || clip.kind === 'image'
  const sounds = clip.kind === 'video' || clip.kind === 'audio'
  const pct = (v) => `${Math.round(v * 100)}%`
  const tabs = TABS.filter((t) => t.kinds.includes(clip.kind))
  const at = tabs.some((t) => t.id === tab) ? tab : 'basic'
  const speed = clip.speed > 0 ? clip.speed : 1
  const scale = clip.scale ?? 1
  // align buttons: the clip against an edge of the frame (x / y are % of the frame from the centre)
  const edge = Math.max(0, (1 - scale) * 50)
  const thumb = clip.kind === 'video' || clip.kind === 'image' ? thumbOf(clip.src) : ''
  const adjusted = (clip.brightness ?? 1) !== 1 || (clip.contrast ?? 1) !== 1 || (clip.saturation ?? 1) !== 1 || (clip.blur || 0) > 0

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-ink-200 bg-white p-4 lg:w-[288px] lg:flex-none lg:border-l">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-100 text-ink-700">
          <K.icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold text-ink-900">{K.label}</h3>
          <p className="truncate text-[10.5px] tabular-nums text-ink-400">
            {fmtTime(clip.start, true)} → {fmtTime(clip.start + clip.dur, true)} · {clip.dur.toFixed(1)}s
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        <button type="button" onClick={onSplit} title="Cut at the red line (S)" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-50 py-1.5 text-[11px] font-semibold text-ink-700 hover:bg-ink-100">
          <FiScissors size={12} /> Cut
        </button>
        <button type="button" onClick={onDuplicate} title="Duplicate (Ctrl+D)" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-50 py-1.5 text-[11px] font-semibold text-ink-700 hover:bg-ink-100">
          <FiCopy size={12} /> Copy
        </button>
        <button type="button" onClick={onDelete} title="Delete" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-50 py-1.5 text-[11px] font-semibold text-ink-700 hover:bg-red-50 hover:text-red-600">
          <FiTrash2 size={12} /> Delete
        </button>
      </div>

      {/* CapCut's tabs: what each kind of clip can change */}
      {tabs.length > 1 && (
        <div className="mt-4 flex border-b border-ink-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px flex-1 border-b-2 px-1 pb-2 text-[12px] font-semibold transition-colors ${at === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {at === 'basic' && (
          <>
            {clip.kind === 'text' && (
              <>
                <Row label="Words">
                  <AutoTextarea
                    value={clip.text || ''}
                    minRows={2}
                    maxRows={8}
                    onFocus={onStart}
                    onChange={(e) => live({ text: e.target.value })}
                    className={`w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-[13px] text-ink-900 outline-none focus:border-brand ${isKhmer(clip.text) ? 'font-khmer' : ''}`}
                  />
                </Row>
                <Row label="Text size">
                  <Range value={clip.size || 64} min={20} max={220} step={1} onStart={onStart} onChange={(v) => live({ size: v })} />
                </Row>
                <Row label="Colour">
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Colour ${c}`}
                        onClick={() => set({ color: c })}
                        className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-white ${(clip.color || '#ffffff').toLowerCase() === c.toLowerCase() ? 'ring-brand' : 'ring-transparent'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </Row>
                <Row label="Look">
                  <Segments
                    value={clip.look || 'box'}
                    onChange={(v) => set({ look: v })}
                    options={[
                      { id: 'plain', label: 'Plain' },
                      { id: 'box', label: 'Box' },
                      { id: 'outline', label: 'Outline' },
                    ]}
                  />
                </Row>
              </>
            )}

            {sounds && (
              <Row label="Volume">
                <Range value={clip.volume ?? 1} min={0} max={2} step={0.05} onStart={onStart} onChange={(v) => live({ volume: v })} fmt={pct} />
              </Row>
            )}

            {picture && (
              <Row label="Fill">
                <Segments
                  value={clip.fit || 'contain'}
                  onChange={(v) => set({ fit: v })}
                  options={[
                    { id: 'contain', label: 'Fit', hint: 'The whole picture, with bars' },
                    { id: 'cover', label: 'Fill', hint: 'Fill the frame, edges cut off' },
                  ]}
                />
              </Row>
            )}

            {visual && (
              <>
                <Heading>Transform</Heading>
                <Row label="Size">
                  <Range value={scale} min={0.1} max={3} step={0.01} onStart={onStart} onChange={(v) => live({ scale: v })} fmt={pct} />
                </Row>
                <Row label="Left / right">
                  <Range value={clip.x || 0} min={-100} max={100} step={1} onStart={onStart} onChange={(v) => live({ x: v })} />
                </Row>
                <Row label="Up / down">
                  <Range value={clip.y || 0} min={-100} max={100} step={1} onStart={onStart} onChange={(v) => live({ y: v })} />
                </Row>
                <Row label="Rotate">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <Range value={clip.rotate || 0} min={-180} max={180} step={1} onStart={onStart} onChange={(v) => live({ rotate: v })} fmt={(v) => `${v}°`} />
                    </div>
                    <button
                      type="button"
                      title="Turn 90°"
                      aria-label="Turn 90 degrees"
                      onClick={() => set({ rotate: (((clip.rotate || 0) + 90 + 180) % 360) - 180 })}
                      className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    >
                      <FiRotateCw size={13} />
                    </button>
                  </div>
                </Row>
                {picture && (
                  <Row label="Align">
                    <div className="grid grid-cols-6 gap-1">
                      {[
                        ['Left', { x: -edge }, FiAlignLeft],
                        ['Centre left to right', { x: 0 }, FiAlignCenter],
                        ['Right', { x: edge }, FiAlignRight],
                        ['Top', { y: -edge }, FiArrowUp],
                        ['Middle', { y: 0 }, FiMinus],
                        ['Bottom', { y: edge }, FiArrowDown],
                      ].map(([label, patch, Icon]) => (
                        <button
                          key={label}
                          type="button"
                          title={edge === 0 && label !== 'Middle' && !label.startsWith('Centre') ? `${label} — make it smaller first` : label}
                          aria-label={`Align ${label}`}
                          onClick={() => set(patch)}
                          className="grid h-7 place-items-center rounded-lg bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                        >
                          <Icon size={13} />
                        </button>
                      ))}
                    </div>
                  </Row>
                )}
                <Heading>Blend</Heading>
                <Row label="Opacity">
                  <Range value={clip.opacity ?? 1} min={0} max={1} step={0.01} onStart={onStart} onChange={(v) => live({ opacity: v })} fmt={pct} />
                </Row>
              </>
            )}

            <Heading>Fades</Heading>
            <Row label="Fade in">
              <Range value={clip.fadeIn || 0} min={0} max={Math.min(5, clip.dur / 2)} step={0.1} onStart={onStart} onChange={(v) => live({ fadeIn: v })} fmt={(v) => `${v.toFixed(1)}s`} />
            </Row>
            <Row label="Fade out">
              <Range value={clip.fadeOut || 0} min={0} max={Math.min(5, clip.dur / 2)} step={0.1} onStart={onStart} onChange={(v) => live({ fadeOut: v })} fmt={(v) => `${v.toFixed(1)}s`} />
            </Row>
            {visual && (clip.x || clip.y || scale !== 1 || clip.rotate || (clip.opacity ?? 1) !== 1) ? (
              <button
                type="button"
                onClick={() => set({ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 })}
                className="w-full rounded-lg py-1.5 text-[11px] font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              >
                Reset place, size and turn
              </button>
            ) : null}
          </>
        )}

        {/* how fast it plays — it keeps the same part of the file, so it gets shorter or longer */}
        {at === 'speed' && (
          <>
            <Row label="Speed">
              <div className="grid grid-cols-4 gap-1">
                {SPEEDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSpeed(clip.id, v)}
                    className={`rounded-lg py-1.5 text-[12px] font-semibold tabular-nums ring-1 transition-colors ${speed === v ? 'bg-brand-soft text-brand ring-brand' : 'bg-ink-50 text-ink-700 ring-ink-200 hover:ring-ink-300'}`}
                  >
                    {v}×
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Exact speed">
              <Range value={speed} min={0.25} max={4} step={0.05} onStart={onStart} onChange={(v) => onSpeedLive(clip.id, v)} fmt={(v) => `${v.toFixed(2)}×`} />
            </Row>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
              Faster makes the clip shorter, slower makes it longer — it stops at the next clip on its track.
              {clip.kind === 'video' && ' The sound plays at the same speed.'}
            </p>
          </>
        )}

        {/* how it comes in and goes out */}
        {at === 'animation' &&
          [
            ['In', 'animIn', 'animInDur'],
            ['Out', 'animOut', 'animOutDur'],
          ].map(([label, key, durKey]) => (
            <Row key={key} label={`Animation ${label.toLowerCase()}`}>
              <div className="grid grid-cols-3 gap-1">
                {ANIMS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set({ [key]: a, ...(a !== 'none' && !clip[durKey] ? { [durKey]: 0.5 } : {}) })}
                    className={`rounded-lg px-1 py-1.5 text-[11px] font-semibold ring-1 transition-colors ${(clip[key] || 'none') === a ? 'bg-brand-soft text-brand ring-brand' : 'bg-ink-50 text-ink-700 ring-ink-200 hover:ring-ink-300'}`}
                  >
                    {ANIM_LABELS[a]}
                  </button>
                ))}
              </div>
              {(clip[key] || 'none') !== 'none' && (
                <div className="pt-1.5">
                  <Range
                    value={clip[durKey] ?? 0.5}
                    min={0.1}
                    max={Math.max(0.1, Math.min(3, clip.dur / 2))}
                    step={0.1}
                    onStart={onStart}
                    onChange={(v) => live({ [durKey]: v })}
                    fmt={(v) => `${v.toFixed(1)}s`}
                  />
                </div>
              )}
            </Row>
          ))}

        {/* colour: a filter, then the fine adjustments */}
        {at === 'adjust' && (
          <>
            <Row label="Filter">
              <div className="grid grid-cols-4 gap-1.5">
                {Object.keys(FILTERS).map((f) => (
                  <button key={f} type="button" onClick={() => set({ filter: f })} className="group text-center">
                    <span
                      className={`block aspect-square overflow-hidden rounded-lg ring-2 ${(clip.filter || 'none') === f ? 'ring-brand' : 'ring-transparent group-hover:ring-ink-300'}`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" style={{ filter: FILTERS[f] || undefined }} />
                      ) : (
                        <span className="block h-full w-full bg-gradient-to-br from-amber-300 via-rose-400 to-sky-500" style={{ filter: FILTERS[f] || undefined }} />
                      )}
                    </span>
                    <span className={`mt-1 block text-[10.5px] font-semibold ${(clip.filter || 'none') === f ? 'text-brand' : 'text-ink-600'}`}>{FILTER_LABELS[f]}</span>
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Brightness">
              <Range value={clip.brightness ?? 1} min={0.3} max={1.7} step={0.01} onStart={onStart} onChange={(v) => live({ brightness: v })} fmt={signed} />
            </Row>
            <Row label="Contrast">
              <Range value={clip.contrast ?? 1} min={0.3} max={1.7} step={0.01} onStart={onStart} onChange={(v) => live({ contrast: v })} fmt={signed} />
            </Row>
            <Row label="Saturation">
              <Range value={clip.saturation ?? 1} min={0} max={2} step={0.01} onStart={onStart} onChange={(v) => live({ saturation: v })} fmt={signed} />
            </Row>
            <Row label="Blur">
              <Range value={clip.blur || 0} min={0} max={30} step={0.5} onStart={onStart} onChange={(v) => live({ blur: v })} fmt={(v) => (v ? v.toFixed(1) : 'Off')} />
            </Row>
            {adjusted || (clip.filter && clip.filter !== 'none') ? (
              <button
                type="button"
                onClick={() => set({ brightness: 1, contrast: 1, saturation: 1, blur: 0, filter: 'none' })}
                className="w-full rounded-lg py-1.5 text-[11px] font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              >
                Reset colour
              </button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
