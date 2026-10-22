import { FiCopy, FiFilm, FiImage, FiMusic, FiScissors, FiTrash2, FiType } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import { fmtTime } from '../../lib/editorModel'
import { isKhmer } from '../../lib/format'

// The video editor's right panel: the picked clip's settings — volume, place,
// size, fades; words, their size, colour and look. With nothing picked, the
// video's shape.

const KIND = {
  video: { label: 'Video', icon: FiFilm },
  image: { label: 'Picture', icon: FiImage },
  audio: { label: 'Sound', icon: FiMusic },
  text: { label: 'Words', icon: FiType },
}
const COLORS = ['#ffffff', '#FFD84D', '#FF6B6B', '#4ADE80', '#60A5FA', '#111111']
export const RATIOS = [
  { id: '9:16', label: '9:16', hint: 'Reels, TikTok' },
  { id: '16:9', label: '16:9', hint: 'YouTube' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '4:5', label: '4:5', hint: 'Feed' },
]

function Row({ label, children }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      {children}
    </div>
  )
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
      <span className="w-12 flex-none text-right text-[11px] tabular-nums text-ink-500">{fmt(value)}</span>
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

export default function Inspector({ clip, ratio, onRatio, onLive, onStart, onChange, onSplit, onDuplicate, onDelete }) {
  if (!clip) {
    return (
      <aside className="h-full min-h-0 overflow-y-auto border-ink-200 bg-white p-4 lg:w-[272px] lg:flex-none lg:border-l">
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
  const sounds = clip.kind === 'video' || clip.kind === 'audio'
  const pct = (v) => `${Math.round(v * 100)}%`

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-ink-200 bg-white p-4 lg:w-[272px] lg:flex-none lg:border-l">
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

      <div className="mt-4 space-y-2.5">
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
            <Row label="Size">
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

        {(clip.kind === 'video' || clip.kind === 'image') && (
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
            <Row label="Size">
              <Range value={clip.scale ?? 1} min={0.1} max={3} step={0.01} onStart={onStart} onChange={(v) => live({ scale: v })} fmt={pct} />
            </Row>
            <Row label="Left / right">
              <Range value={clip.x || 0} min={-100} max={100} step={1} onStart={onStart} onChange={(v) => live({ x: v })} />
            </Row>
            <Row label="Up / down">
              <Range value={clip.y || 0} min={-100} max={100} step={1} onStart={onStart} onChange={(v) => live({ y: v })} />
            </Row>
          </>
        )}

        <Row label="Fade in">
          <Range value={clip.fadeIn || 0} min={0} max={Math.min(5, clip.dur / 2)} step={0.1} onStart={onStart} onChange={(v) => live({ fadeIn: v })} fmt={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label="Fade out">
          <Range value={clip.fadeOut || 0} min={0} max={Math.min(5, clip.dur / 2)} step={0.1} onStart={onStart} onChange={(v) => live({ fadeOut: v })} fmt={(v) => `${v.toFixed(1)}s`} />
        </Row>
        {visual && (clip.x || clip.y || (clip.scale ?? 1) !== 1) ? (
          <button type="button" onClick={() => set({ x: 0, y: 0, scale: 1 })} className="w-full rounded-lg py-1.5 text-[11px] font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-800">
            Reset place and size
          </button>
        ) : null}
      </div>
    </aside>
  )
}
