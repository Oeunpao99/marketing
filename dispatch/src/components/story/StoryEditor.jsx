import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FiCheckCircle,
  FiDownload,
  FiEdit3,
  FiFilm,
  FiPlay,
  FiRefreshCw,
  FiTrash2,
  FiVolume2,
  FiVolumeX,
  FiX,
  FiZap,
} from 'react-icons/fi'
import { api } from '../../api/client'
import { colorForBrand } from '../../lib/brandColor'
import { handoff } from '../../lib/handoff'
import { useStore } from '../../store'
import AutoTextarea from '../ui/AutoTextarea'
import GeneratingCanvas from '../ui/GeneratingCanvas'
import JoiningCanvas from './JoiningCanvas'

// One video story (app/story.py), loaded by id: edit the storyboard, approve
// it, watch the scenes render, redo any scene, join them, use the result.
// Used full-page on /story?id= and inline in an AI Agent chat (compact).

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (url) => `${mediaBase}${url || ''}`
const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
export const storyInput =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[12.5px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'

const STATUS = {
  draft: { label: 'Draft', dot: 'bg-ink-300', text: 'text-ink-500' },
  rendering: { label: 'Rendering', dot: 'bg-brand animate-pulse-glow', text: 'text-brand' },
  review: { label: 'Review scenes', dot: 'bg-amber-400', text: 'text-amber-700' },
  combining: { label: 'Joining video', dot: 'bg-brand animate-pulse-glow', text: 'text-brand' },
  done: { label: 'Ready', dot: 'bg-emerald-500', text: 'text-emerald-700' },
}
const RUNNING = ['rendering', 'combining']

function timecode(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

function fileName(story) {
  const slug = (story.title || 'video-story')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'video-story'}.mp4`
}

export function StatusPill({ status }) {
  const meta = STATUS[status] || STATUS.draft
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold">
      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
      <span className={meta.text}>{meta.label}</span>
    </span>
  )
}

export default function StoryEditor({ storyId, compact = false, onDeleted }) {
  const { brands, showToast } = useStore()
  const navigate = useNavigate()
  const [story, setStory] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [dirty, setDirty] = useState(false)
  const [renderConfirm, setRenderConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [redoEdit, setRedoEdit] = useState(null)
  const pollBusy = useRef(false)

  const load = useCallback(async () => {
    try {
      setStory(await api.get(`/ai/story/${storyId}`))
      setLoadError('')
    } catch (e) {
      setLoadError(e.message)
    }
  }, [storyId])

  useEffect(() => {
    setStory(null)
    setDirty(false)
    load()
  }, [load])

  // Poll while clips render or join (they carry on server-side if the page closes).
  const status = story?.status
  useEffect(() => {
    if (!RUNNING.includes(status)) return
    let active = true
    const timer = window.setInterval(async () => {
      if (pollBusy.current) return
      pollBusy.current = true
      try {
        const next = await api.get(`/ai/story/${storyId}`)
        if (!active) return
        setStory(next)
        if (!RUNNING.includes(next.status)) {
          if (next.status === 'done') showToast('Your video is ready')
          else if (next.status === 'review') {
            const failed = (next.scenes || []).filter((scene) => scene.state === 'failed').length
            if (failed) showToast(`${failed} scene${failed === 1 ? '' : 's'} failed — redo and try again`)
            else if (next.error) showToast('Could not join the clips — try again')
            else showToast('Your scenes are ready to review')
          }
        }
      } catch {
        /* transient — next poll */
      } finally {
        pollBusy.current = false
      }
    }, 2500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [status, storyId, showToast])

  const updateStory = (change) => {
    setStory((current) => ({ ...current, ...change }))
    setDirty(true)
  }

  const updateScene = (key, change) => {
    setStory((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.key === key ? { ...scene, ...change } : scene)),
    }))
    setDirty(true)
  }

  const saveDraft = async () => {
    if (!story || story.status !== 'draft') return false
    try {
      const saved = await api.patch(`/ai/story/${story.id}`, {
        title: story.title,
        style: story.style,
        scenes: story.scenes.map(({ key, visual, voiceover, on_screen }) => ({ key, visual, voiceover, on_screen })),
      })
      setStory(saved)
      setDirty(false)
      return true
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      return false
    }
  }

  const saveChanges = async () => {
    if (busy || !dirty) return
    setBusy('save')
    if (await saveDraft()) showToast('Storyboard saved')
    setBusy('')
  }

  const startRender = async () => {
    if (!story || busy) return
    setRenderConfirm(false)
    setBusy('render')
    if (dirty && !(await saveDraft())) {
      setBusy('')
      return
    }
    try {
      setStory(await api.post(`/ai/story/${story.id}/render`))
      setDirty(false)
      showToast('Rendering started — you can leave this page')
    } catch (e) {
      showToast(`Could not start rendering — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const combine = async () => {
    if (!story || busy) return
    setBusy('combine')
    try {
      setStory(await api.post(`/ai/story/${story.id}/combine`))
      showToast('Joining the clips — this can take a minute')
    } catch (e) {
      showToast(`Could not join the clips — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const redoScene = async (event) => {
    event.preventDefault()
    if (!redoEdit || !story || busy) return
    const { scene } = redoEdit
    setBusy(`redo:${scene.key}`)
    try {
      const next = await api.post(`/ai/story/${story.id}/scenes/${encodeURIComponent(scene.key)}/redo`, {
        key: scene.key,
        visual: redoEdit.visual,
        voiceover: redoEdit.voiceover,
        on_screen: redoEdit.on_screen,
      })
      setStory(next)
      setRedoEdit(null)
      showToast(`Scene ${story.scenes.findIndex((item) => item.key === scene.key) + 1} is rendering again`)
    } catch (e) {
      showToast(`Could not redo the scene — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const removeStory = async () => {
    if (!story || busy) return
    setBusy('delete')
    try {
      await api.del(`/ai/story/${story.id}`)
      setDeleteConfirm(false)
      showToast('Video story deleted')
      onDeleted?.()
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const useFinal = () => {
    if (!story?.final_video?.url) return
    handoff.set({
      name: fileName(story),
      size: 0,
      kind: 'video',
      url: abs(story.final_video.url),
      videoId: story.final_video.id,
    })
    navigate('/new')
  }

  if (!story) {
    return loadError ? (
      <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-[12.5px] text-red-700">
        {loadError}
        <button type="button" onClick={load} className="ml-2 font-semibold underline">
          Try again
        </button>
      </div>
    ) : (
      <div className="space-y-3">
        <div className="h-20 rounded-2xl skeleton" />
        <div className="h-48 rounded-2xl skeleton" />
      </div>
    )
  }

  const brand = brands.find((item) => item.id === story.brand_id)
  const counts = story.scenes.reduce((result, scene) => ({ ...result, [scene.state]: (result[scene.state] || 0) + 1 }), {})
  const failed = counts.failed || 0
  const done = counts.done || 0
  const allDone = done === story.scenes.length
  const locked = RUNNING.includes(story.status)
  const draft = story.status === 'draft'

  const showFinal = story.status === 'done' || story.status === 'combining' || story.final_video

  const dialogs = (
    <>
        {renderConfirm && (
          <ConfirmDialog
            title="Approve this storyboard?"
            text={`The video service will render ${story.scenes.length} clips for “${story.title}”${story.estimated_cost != null ? ` — about $${Number(story.estimated_cost).toFixed(2)} of AI credit` : ''}. You can leave this page while it runs.`}
            confirm="Approve & render"
            onCancel={() => setRenderConfirm(false)}
            onConfirm={startRender}
          />
        )}
        {deleteConfirm && (
          <ConfirmDialog
            title="Delete this video story?"
            text={`“${story.title}” and its storyboard will be removed. Videos already in the Library stay there.`}
            confirm="Delete story"
            danger
            busy={busy === 'delete'}
            onCancel={() => setDeleteConfirm(false)}
            onConfirm={removeStory}
          />
        )}
        {redoEdit && (
          <RedoDialog
            value={redoEdit}
            story={story}
            busy={busy === `redo:${redoEdit.scene.key}`}
            onChange={setRedoEdit}
            onCancel={() => setRedoEdit(null)}
            onSubmit={redoScene}
          />
        )}
    </>
  )

  if (compact) {
    return (
      <>
        <CompactStory
          story={story}
          brand={brand}
          busy={busy}
          dirty={dirty}
          done={done}
          failed={failed}
          allDone={allDone}
          showFinal={showFinal}
          onTitle={(title) => updateStory({ title })}
          onStyle={(style) => updateStory({ style })}
          onScene={updateScene}
          onSave={saveChanges}
          onRender={() => setRenderConfirm(true)}
          onCombine={combine}
          onRedo={(scene) =>
            setRedoEdit({ scene, visual: scene.visual || '', voiceover: scene.voiceover || '', on_screen: scene.on_screen || '' })
          }
          onDelete={onDeleted ? () => setDeleteConfirm(true) : null}
          onUseFinal={useFinal}
          onLibrary={() => navigate('/library')}
        />
        <div className="mt-2 text-right">
          <button type="button" onClick={() => navigate(`/ai?tab=video&story=${story.id}`)} className="text-[11.5px] font-semibold text-brand hover:underline">
            Open in studio view →
          </button>
        </div>
        {dialogs}
      </>
    )
  }

  const voice = story.language ? `${story.language} voice-over` : 'No voice-over'
  const redoOf = (scene) =>
    setRedoEdit({ scene, visual: scene.visual || '', voiceover: scene.voiceover || '', on_screen: scene.on_screen || '' })

  return (
    <div className="animate-fadein space-y-5">
      {/* What this video is, and the one next action */}
      <section className={`${card} flex flex-wrap items-center justify-between gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          {draft ? (
            <input
              value={story.title}
              onChange={(event) => updateStory({ title: event.target.value })}
              maxLength={200}
              className="-ml-1 w-full max-w-3xl rounded-lg bg-transparent px-1 text-[20px] font-bold tracking-tight text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand/15"
              aria-label="Video title"
            />
          ) : (
            <h2 className="break-words text-[20px] font-bold tracking-tight text-ink-900">“{story.title}”</h2>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
            <span>
              {story.scenes.length} short AI clip{story.scenes.length === 1 ? '' : 's'} → one {story.total_seconds} s video ·{' '}
              {story.aspect_ratio === '9:16' ? 'vertical 9:16' : 'landscape 16:9'} · {voice}
            </span>
            <StatusPill status={story.status} />
            {!draft && <span>{done} of {story.scenes.length} clips ready</span>}
            {dirty && draft && <span className="font-semibold text-amber-600">Unsaved changes</span>}
          </div>
          {!draft && (
            <div className="mt-3 flex max-w-xl gap-1" aria-label={`${done} of ${story.scenes.length} clips ready`}>
              {story.scenes.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1.5 flex-1 rounded-full ${
                    s.state === 'done'
                      ? `bg-gradient-to-r ${ROLE_COLOR[roleKey(s, i, story.scenes.length)]}`
                      : s.state === 'failed'
                        ? 'bg-red-400'
                        : s.state === 'rendering'
                          ? 'bg-brand/50 animate-pulse-glow'
                          : 'bg-ink-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && onDeleted && (
            <button type="button" onClick={() => setDeleteConfirm(true)} className="btn-danger px-3" aria-label="Delete video">
              <FiTrash2 size={14} />
            </button>
          )}
          {draft && (
            <>
              <button type="button" onClick={saveChanges} disabled={!dirty || !!busy} className="btn-outline">
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setRenderConfirm(true)} disabled={!!busy || !story.title.trim()} className="btn-primary">
                <FiZap size={14} /> Generate clips
                {story.estimated_cost != null && <span className="opacity-75">· ${Number(story.estimated_cost).toFixed(2)}</span>}
              </button>
            </>
          )}
          {(story.status === 'review' || story.status === 'rendering') && (
            <button
              type="button"
              onClick={combine}
              disabled={!!busy || !allDone || story.status !== 'review'}
              className="btn-primary"
              title={allDone ? '' : 'Every clip has to be ready first'}
            >
              <FiFilm size={14} /> {busy === 'combine' ? 'Starting…' : 'Combine & render'}
            </button>
          )}
          {story.status === 'combining' && <span className="text-[12px] font-semibold text-brand">Joining the clips…</span>}
          {story.status === 'done' && story.final_video?.url && (
            <button type="button" onClick={useFinal} className="btn-primary">
              <FiPlay size={14} /> Use in a post
            </button>
          )}
        </div>
      </section>

      {story.error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] leading-relaxed text-red-700">{story.error}</div>
      )}
      {story.status === 'review' && failed > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          {failed} clip{failed === 1 ? '' : 's'} could not be made. Press Redo on {failed === 1 ? 'it' : 'them'} (you can change the text first), then combine.
        </div>
      )}

      {showFinal && <ResultCard story={story} voice={voice} onUseFinal={useFinal} onLibrary={() => navigate('/library')} />}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* ── Brief ── */}
        <aside className={`${card} space-y-4 p-5 xl:sticky xl:top-20`}>
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Brief</h3>
            {brand && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                <span className="h-2 w-2 rounded-full" style={{ background: colorForBrand(brand.slug) }} />
                {brand.name}
              </p>
            )}
          </div>
          <div>
            <div className="label">What this video should do</div>
            <FoldText text={story.idea} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
            <dt className="text-ink-500">Language</dt>
            <dd className="text-right font-semibold text-ink-800">{voice}</dd>
            <dt className="text-ink-500">Format</dt>
            <dd className="text-right font-semibold text-ink-800">{story.aspect_ratio}</dd>
            <dt className="text-ink-500">Length</dt>
            <dd className="text-right font-semibold text-ink-800">{story.total_seconds} s · {story.scenes.length} clips</dd>
            {story.estimated_cost != null && (
              <>
                <dt className="text-ink-500">Clips cost</dt>
                <dd className="text-right font-semibold text-ink-800">≈ ${Number(story.estimated_cost).toFixed(2)} AI credit</dd>
              </>
            )}
          </dl>
          {draft ? (
            <SharedLook story={story} editable bare onChange={(style) => updateStory({ style })} />
          ) : (
            <div>
              <div className="label">Shared look (used in every clip)</div>
              <FoldText text={story.style || 'No shared look was provided.'} lines={4} />
            </div>
          )}
          <div className="rounded-xl bg-ink-50/70 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-500">
            The AI is told to use only facts from your product info. Logo, colours and prices inside the clips aren’t
            checked automatically — watch the clips before you post.
          </div>
        </aside>

        {/* ── Clips, timeline, result ── */}
        <div className="min-w-0 space-y-5">
          {draft && (
            <p className="text-[12px] text-ink-500">
              Check each clip — change any text — then <b className="text-ink-700">Generate clips</b>. Nothing is made, or charged, before that.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {story.scenes.map((scene, index) => (
              <ClipCard
                key={scene.key}
                scene={scene}
                index={index}
                story={story}
                editable={draft}
                busy={busy}
                onChange={(change) => updateScene(scene.key, change)}
                onRedo={() => redoOf(scene)}
              />
            ))}
          </div>
          <Timeline story={story} />
        </div>
      </div>

      {dialogs}
    </div>
  )
}

// ── the studio layout's parts ─────────────────────────────────────────────
// Each clip's job in the story. The AI names it (app/story.py); older stories
// get one by position.
const ROLE_NAMES = { hook: 'Hook', problem: 'Problem', solution: 'Solution', proof: 'Proof', cta: 'Call to action' }
const MIDDLE_ROLES = ['problem', 'solution', 'proof']
const ROLE_COLOR = {
  hook: 'from-amber-600 to-amber-800',
  problem: 'from-rose-600 to-rose-800',
  solution: 'from-sky-600 to-sky-800',
  proof: 'from-emerald-600 to-emerald-800',
  cta: 'from-violet-600 to-violet-800',
  video: 'from-ink-700 to-ink-900',
}

function roleKey(scene, index, count) {
  if (ROLE_NAMES[scene.role]) return scene.role
  if (count === 1) return 'video'
  if (index === 0) return 'hook'
  if (index === count - 1) return 'cta'
  return MIDDLE_ROLES[(index - 1) % MIDDLE_ROLES.length]
}
const roleName = (scene, index, count) => ROLE_NAMES[roleKey(scene, index, count)] || 'Video'

function ClipCard({ scene, index, story, editable, busy, onChange, onRedo }) {
  const count = story.scenes.length
  const key = roleKey(scene, index, count)
  const working = ['pending', 'rendering'].includes(scene.state) && !editable
  const canRedo = !editable && story.status !== 'combining' && ['done', 'failed'].includes(scene.state)
  const words = (scene.voiceover || '').trim() ? (scene.voiceover.trim().match(/\S+/g) || []).length : 0

  return (
    <article className={`${card} flex flex-col overflow-hidden transition-shadow hover:shadow-card-hover`}>
      <div className={`relative bg-night-950 ${story.aspect_ratio === '9:16' ? 'aspect-[3/4]' : 'aspect-video'}`}>
        {scene.video_url ? (
          <video src={abs(scene.video_url)} controls preload="metadata" playsInline className="h-full w-full bg-black object-cover" />
        ) : (
          <div className={`flex h-full flex-col justify-end bg-gradient-to-br ${ROLE_COLOR[key]} p-3`}>
            {working && (
              <span className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Making this clip" />
            )}
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-white/70">{ROLE_NAMES[key] || 'Video'}</span>
            <span className="mt-0.5 line-clamp-2 text-[13.5px] font-bold leading-snug text-white">{scene.on_screen || ' '}</span>
          </div>
        )}
        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white">
          Clip {index + 1} · {scene.seconds} s
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-ink-900">{roleName(scene, index, count)}</span>
          <span className="font-mono text-[10.5px] text-ink-400">
            {timecode(scene.starts_at)}–{timecode(scene.starts_at + scene.seconds)}
          </span>
        </div>
        {editable ? (
          <div className="mt-2 space-y-2">
            <AutoTextarea minRows={3} maxRows={10} maxLength={6000} value={scene.visual} onChange={(e) => onChange({ visual: e.target.value })} className={`${storyInput} text-[11.5px]`} aria-label={`Clip ${index + 1} picture`} />
            {story.language && (
              <AutoTextarea minRows={1} maxRows={5} maxLength={1000} value={scene.voiceover} onChange={(e) => onChange({ voiceover: e.target.value })} placeholder="What the narrator says" className={`${storyInput} text-[11.5px]`} aria-label={`Clip ${index + 1} voice-over`} />
            )}
            <input maxLength={80} value={scene.on_screen} onChange={(e) => onChange({ on_screen: e.target.value })} placeholder="On-screen text (Latin letters)" className={`${storyInput} text-[11.5px]`} aria-label={`Clip ${index + 1} on-screen text`} />
            {story.language && (
              <div className={`text-right text-[10px] ${words > scene.word_budget ? 'font-semibold text-amber-700' : 'text-ink-400'}`}>
                {words}/{scene.word_budget} words fit in {scene.seconds} s
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mt-1 line-clamp-4 text-[11.5px] leading-relaxed text-ink-500" title={scene.visual}>{scene.visual}</p>
            {scene.voiceover && <p className="mt-1.5 line-clamp-3 text-[11px] italic leading-relaxed text-ink-400">“{scene.voiceover}”</p>}
          </>
        )}
        {scene.state === 'failed' && <p className="mt-2 text-[11px] leading-snug text-red-600">{scene.error || 'This clip could not be made.'}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <SceneState state={editable ? 'draft' : scene.state} />
          {canRedo && (
            <button type="button" onClick={onRedo} disabled={!!busy} className="text-[11.5px] font-semibold text-brand hover:underline disabled:opacity-50">
              Redo
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

// Long brief text, folded to a few lines with "Show all".
function FoldText({ text, lines = 6 }) {
  const [open, setOpen] = useState(false)
  const long = (text || '').length > lines * 60 || (text || '').split('\n').length > lines
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/60 px-3.5 py-3">
      <p
        className="whitespace-pre-line text-[12px] leading-relaxed text-ink-700"
        style={!open && long ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
      >
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[11.5px] font-semibold text-brand hover:underline">
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

// The finished video, first thing on the page: the player at its own shape on
// a dark stage, and what to do with it beside it.
function ResultCard({ story, voice, onUseFinal, onLibrary }) {
  const vertical = story.aspect_ratio === '9:16'
  if (!story.final_video?.url) {
    return (
      <section className={`${card} overflow-hidden`}>
        <JoiningCanvas story={story} />
      </section>
    )
  }
  return (
    <section className={`${card} grid overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]`}>
      <div className="grid place-items-center bg-night-950 p-4">
        <video
          src={abs(story.final_video.url)}
          controls
          playsInline
          className={`block rounded-xl bg-black object-contain ${vertical ? 'max-h-[68vh] w-auto' : 'max-h-[60vh] w-full'}`}
        />
      </div>
      <div className="flex flex-col p-6">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-emerald-700">
          <FiCheckCircle size={15} /> Your video is ready
        </div>
        <h3 className="mt-2 text-[19px] font-bold leading-snug tracking-tight text-ink-900">{story.title}</h3>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-semibold text-ink-600">
          {[`${story.total_seconds} s`, story.aspect_ratio, voice, `${story.scenes.length} clips`].map((t) => (
            <span key={t} className="rounded-full bg-ink-100 px-2.5 py-1">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-1">
          {story.scenes.map((s, i) => (
            <span
              key={s.key}
              style={{ flex: `${s.seconds} 1 0` }}
              title={roleName(s, i, story.scenes.length)}
              className={`h-2 rounded-full bg-gradient-to-r ${ROLE_COLOR[roleKey(s, i, story.scenes.length)]}`}
            />
          ))}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
          Saved to your Media Library. Watch it through once — check the logo, colours and any text — then put it in a post.
        </p>
        <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
          <button type="button" onClick={onUseFinal} className="btn-primary justify-center sm:col-span-2">
            <FiPlay size={14} /> Use in a post
          </button>
          <a href={abs(story.final_video.url)} download className="btn-outline justify-center">
            <FiDownload size={13} /> Download
          </a>
          <button type="button" onClick={onLibrary} className="btn-outline justify-center">
            Open in Library
          </button>
        </div>
      </div>
    </section>
  )
}

function Timeline({ story }) {
  const count = story.scenes.length
  const draft = story.status === 'draft'
  const bar = {
    pending: 'bg-ink-200 text-ink-600',
    rendering: 'bg-brand/50 text-white animate-pulse-glow',
    failed: 'bg-red-200 text-red-800',
    draft: 'bg-ink-100 text-ink-600',
  }
  const spoken = story.scenes.filter((s) => (s.voiceover || '').trim()).length
  return (
    <section className={`${card} p-5`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-ink-900">Timeline</h3>
        <span className="font-mono text-[11.5px] text-ink-500">0:00 — {timecode(story.total_seconds)}</span>
      </div>
      <div className="flex gap-1">
        {story.scenes.map((s, i) => (
          <div
            key={s.key}
            style={{ flex: `${s.seconds} 1 0` }}
            title={`${roleName(s, i, count)} · ${s.seconds} s`}
            className={`truncate rounded-md px-2.5 py-2 text-[11px] font-semibold ${
              !draft && s.state === 'done' ? `bg-gradient-to-r text-white ${ROLE_COLOR[roleKey(s, i, count)]}` : bar[draft ? 'draft' : s.state] || bar.draft
            }`}
          >
            Clip {i + 1} · {roleName(s, i, count)}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1.5 text-[11px] text-ink-500">
        <div className="rounded-md bg-ink-50 px-3 py-1.5">
          {story.language ? `Voice-over · ${story.language} · spoken inside each clip (${spoken} of ${count} clips)` : 'No voice-over'}
        </div>
        <div className="rounded-md bg-ink-50 px-3 py-1.5">On-screen text · drawn by the video model in each clip (Latin letters only)</div>
      </div>
    </section>
  )
}

// ── the chat (compact) layout ────────────────────────────────────────────
// One card: header, the shared look (folded), the scenes as numbered rows
// whose fields read like text and grow as you type, and an action bar.
const field =
  'w-full bg-transparent rounded-lg px-2 py-1 -mx-2 text-ink-800 placeholder:text-ink-300 hover:bg-ink-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 transition-colors'

function CompactStory({
  story, brand, busy, dirty, done, failed, allDone, showFinal,
  onTitle, onStyle, onScene, onSave, onRender, onCombine, onRedo, onDelete, onUseFinal, onLibrary,
}) {
  const draft = story.status === 'draft'
  const locked = RUNNING.includes(story.status)
  const [lookOpen, setLookOpen] = useState(false)

  let hint = ''
  let buttons = null
  if (draft) {
    hint = dirty ? 'Unsaved changes' : 'Edit anything above, then approve — each scene renders as its own clip.'
    buttons = (
      <>
        {dirty && (
          <button type="button" onClick={onSave} disabled={!!busy} className="btn-outline">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        )}
        <button type="button" onClick={onRender} disabled={!!busy || !story.title.trim()} className="btn-primary">
          <FiZap size={14} /> Approve & render
        </button>
      </>
    )
  } else if (story.status === 'review') {
    hint = failed ? `Redo the failed scene${failed === 1 ? '' : 's'} first.` : 'Happy with every scene? Join them in order.'
    buttons = (
      <button type="button" onClick={onCombine} disabled={!!busy || !allDone} className="btn-primary">
        <FiFilm size={14} /> {busy === 'combine' ? 'Starting…' : 'Join into one video'}
      </button>
    )
  } else if (story.status === 'rendering') {
    hint = `Rendering — ${done} of ${story.scenes.length} scenes ready. You can leave; we'll notify you.`
  } else if (story.status === 'combining') {
    hint = 'Joining the clips into one MP4…'
  } else if (story.status === 'done') {
    hint = 'Saved to your Library.'
  }

  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden animate-fadein">
      {/* header */}
      <div className="px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-brand">
          <FiFilm size={12} /> Storyboard
          <span className="ml-auto normal-case tracking-normal font-semibold">
            <StatusPill status={story.status} />
          </span>
        </div>
        {draft ? (
          <input
            value={story.title}
            onChange={(event) => onTitle(event.target.value)}
            maxLength={200}
            aria-label="Story title"
            className={`${field} mt-1.5 text-[17px] font-bold tracking-tight text-ink-900`}
          />
        ) : (
          <h2 className="mt-1.5 text-[17px] font-bold tracking-tight text-ink-900 break-words">{story.title}</h2>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-400">
          {brand && (
            <span className="inline-flex items-center gap-1.5 text-ink-600">
              <span className="w-2 h-2 rounded-full" style={{ background: colorForBrand(brand.slug) }} />
              {brand.name}
            </span>
          )}
          <span>·</span>
          <span>{story.scenes.length} scenes · {story.total_seconds}s · {story.aspect_ratio}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            {story.language ? <FiVolume2 size={12} /> : <FiVolumeX size={12} />}
            {story.language || 'No voiceover'}
          </span>
        </div>
      </div>

      {locked && (
        <div className="px-5 pb-4">
          <div className="flex gap-1">
            {story.scenes.map((scene) => (
              <span
                key={scene.key}
                className={`h-1.5 flex-1 rounded-full ${
                  scene.state === 'done'
                    ? 'bg-emerald-500'
                    : scene.state === 'failed'
                      ? 'bg-red-500'
                      : scene.state === 'rendering' || story.status === 'combining'
                        ? 'bg-brand animate-pulse-glow'
                        : 'bg-ink-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {story.error && (
        <div className="mx-5 mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-red-700">{story.error}</div>
      )}


      {/* shared look */}
      <div className="border-t border-ink-100 bg-ink-50/50 px-5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-400">Look & feel · every scene</span>
          <button type="button" onClick={() => setLookOpen((v) => !v)} className="text-[11px] font-semibold text-brand hover:underline">
            {lookOpen ? 'Show less' : draft ? 'Show all / edit' : 'Show all'}
          </button>
        </div>
        {lookOpen && draft ? (
          <AutoTextarea
            minRows={3}
            maxRows={14}
            maxLength={6000}
            value={story.style}
            onChange={(event) => onStyle(event.target.value)}
            placeholder="Characters, setting, palette, lighting and camera style used in every scene…"
            className={`${field} mt-1.5 text-[12.5px] leading-relaxed bg-white`}
          />
        ) : (
          <p className={`mt-1.5 text-[12.5px] leading-relaxed text-ink-600 ${lookOpen ? '' : 'line-clamp-2'}`}>
            {story.style || 'No shared look.'}
          </p>
        )}
      </div>

      {/* scenes */}
      <ol className="divide-y divide-ink-100 border-t border-ink-100">
        {story.scenes.map((scene, index) => (
          <CompactScene
            key={scene.key}
            scene={scene}
            index={index}
            story={story}
            editable={draft}
            busy={busy}
            onChange={(change) => onScene(scene.key, change)}
            onRedo={() => onRedo(scene)}
          />
        ))}
      </ol>

      {/* the joined video — the last step, so it comes after the scenes */}
      {showFinal && (
        <div className="border-t border-ink-100 bg-ink-50/40 px-5 py-4">
          <FinalVideo story={story} compact onUseFinal={onUseFinal} onLibrary={onLibrary} />
        </div>
      )}

      {/* action bar */}
      {(hint || buttons || onDelete) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50/50 px-5 py-3">
          {onDelete && !locked && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete this storyboard"
              aria-label="Delete this storyboard"
              className="h-9 w-9 rounded-xl grid place-items-center text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <FiTrash2 size={15} />
            </button>
          )}
          <span className={`min-w-0 flex-1 text-[11.5px] ${dirty && draft ? 'font-semibold text-amber-600' : 'text-ink-500'}`}>{hint}</span>
          {buttons && <div className="flex items-center gap-2">{buttons}</div>}
        </div>
      )}
    </div>
  )
}

function CompactScene({ scene, index, story, editable, busy, onChange, onRedo }) {
  const words = (scene.voiceover || '').trim() ? (scene.voiceover.trim().match(/\S+/g) || []).length : 0
  const over = editable && scene.word_budget && words > scene.word_budget
  const canRedo = !editable && story.status !== 'combining' && !['pending', 'rendering'].includes(scene.state)
  const vertical = story.aspect_ratio === '9:16'
  const hasMedia = scene.video_url || ['pending', 'rendering'].includes(scene.state)

  return (
    <li className="flex gap-3.5 px-5 py-4">
      <div className="flex-none w-9 text-center">
        <span className="mx-auto w-7 h-7 rounded-lg bg-ink-900 text-ink-50 grid place-items-center text-[11px] font-bold">{index + 1}</span>
        <div className="mt-1.5 text-[10px] leading-tight text-ink-400">
          {timecode(scene.starts_at)}
          <br />
          {scene.seconds}s
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {!editable && (
          <div>
            <SceneState state={scene.state} />
          </div>
        )}
        {editable ? (
          <AutoTextarea
            minRows={1}
            maxRows={8}
            maxLength={6000}
            value={scene.visual}
            onChange={(event) => onChange({ visual: event.target.value })}
            aria-label={`Scene ${index + 1} visual`}
            className={`${field} text-[13px] leading-relaxed`}
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-800">{scene.visual}</p>
        )}

        <div className="flex items-start gap-2 rounded-xl bg-brand-soft/50 px-3 py-2">
          <FiVolume2 size={13} className="mt-[5px] flex-none text-brand" />
          {editable ? (
            <AutoTextarea
              minRows={1}
              maxRows={4}
              maxLength={1000}
              value={scene.voiceover}
              onChange={(event) => onChange({ voiceover: event.target.value })}
              placeholder="No voiceover in this scene"
              aria-label={`Scene ${index + 1} voiceover`}
              className={`${field} mx-0 px-1.5 py-0.5 text-[12.5px] italic leading-relaxed hover:bg-white/70`}
            />
          ) : (
            <p className="py-0.5 text-[12.5px] italic leading-relaxed text-ink-700">{scene.voiceover || 'No voiceover'}</p>
          )}
          {editable && scene.word_budget && (
            <span className={`mt-[3px] flex-none text-[10px] ${over ? 'font-bold text-amber-600' : 'text-ink-400'}`} title="Words that fit this scene">
              {words}/{scene.word_budget}
            </span>
          )}
        </div>

        {editable ? (
          <div className="flex items-center gap-2">
            <span className="flex-none rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-500">Aa</span>
            <input
              maxLength={80}
              value={scene.on_screen}
              onChange={(event) => onChange({ on_screen: event.target.value })}
              placeholder="On-screen text (optional)"
              aria-label={`Scene ${index + 1} on-screen text`}
              className={`${field} text-[12px] font-semibold`}
            />
          </div>
        ) : (
          scene.on_screen && (
            <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-800">
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-500">Aa</span>
              {scene.on_screen}
            </div>
          )
        )}

        {scene.state === 'failed' && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-[11.5px] leading-relaxed text-red-700">
            {scene.error || 'This scene could not be rendered.'}
          </div>
        )}
        {canRedo && (
          <button type="button" onClick={onRedo} disabled={!!busy} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand hover:underline disabled:opacity-50">
            <FiEdit3 size={12} /> {scene.state === 'failed' ? 'Edit & redo' : 'Edit & redo this scene'}
          </button>
        )}
      </div>

      {hasMedia && (
        <div className={`flex-none ${vertical ? 'w-[110px] sm:w-[128px]' : 'w-[170px] sm:w-[220px]'}`}>
          {scene.video_url ? (
            <video
              src={abs(scene.video_url)}
              controls
              preload="metadata"
              playsInline
              className={`${vertical ? 'aspect-[9/16]' : 'aspect-video'} w-full rounded-xl bg-black object-contain`}
            />
          ) : (
            <div className={`${vertical ? 'aspect-[9/16]' : 'aspect-video'} w-full`}>
              <GeneratingCanvas small stage={scene.state === 'rendering' ? 'Rendering…' : 'Queued'} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function SharedLook({ story, editable, bare = false, onChange }) {
  const body = (
    <label className="block">
      <span className="label">Shared look (used in every scene)</span>
      {editable ? (
        <AutoTextarea
          minRows={3}
          maxRows={14}
          maxLength={6000}
          value={story.style}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Characters, setting, palette, lighting and camera style used in every scene…"
          className={storyInput}
        />
      ) : (
        <p className="rounded-xl border border-ink-100 bg-white px-3.5 py-3 text-[12px] leading-relaxed text-ink-700">
          {story.style || 'No shared look was provided.'}
        </p>
      )}
    </label>
  )
  return bare ? body : <section className={`${card} p-4`}>{body}</section>
}

function SceneState({ state }) {
  const meta = {
    draft: ['bg-ink-100 text-ink-500', 'Draft'],
    pending: ['bg-ink-100 text-ink-600', 'Queued'],
    rendering: ['bg-brand-soft text-brand', 'Rendering'],
    done: ['bg-emerald-50 text-emerald-700', 'Ready'],
    failed: ['bg-red-50 text-red-700', 'Failed'],
  }[state] || ['bg-ink-100 text-ink-500', state]
  return <span className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${meta[0]}`}>{meta[1]}</span>
}

function FinalVideo({ story, compact = false, onUseFinal, onLibrary }) {
  if (!story.final_video?.url) {
    return (
      <JoiningCanvas story={story} />
    )
  }
  const shape = compact && story.aspect_ratio === '9:16' ? 'max-w-[300px] mx-auto' : ''
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="bg-night-950 p-2">
        <video
          src={abs(story.final_video.url)}
          controls
          playsInline
          className={`w-full ${shape} block max-h-[58vh] rounded-xl bg-black object-contain`}
        />
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-[12px] font-bold text-ink-900">
          <FiCheckCircle size={15} className="text-emerald-500" /> Your video is ready
        </div>
        <p className="mt-1 text-[10.5px] text-ink-400">{story.total_seconds}s · {story.aspect_ratio} · saved to the Library</p>
        <div className={`mt-4 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <a href={abs(story.final_video.url)} download={fileName(story)} className="btn-outline px-3">
            <FiDownload size={13} /> Download
          </a>
          <button type="button" onClick={onUseFinal} className="btn-primary px-3">
            <FiPlay size={13} /> Use in post
          </button>
          {compact && (
            <button type="button" onClick={onLibrary} className="btn-outline px-3">
              Library
            </button>
          )}
        </div>
        {!compact && (
          <button type="button" onClick={onLibrary} className="btn-ghost mt-2 w-full">
            Open in Library
          </button>
        )}
      </div>
    </div>
  )
}

function ConfirmDialog({ title, text, confirm, danger = false, busy = false, onCancel, onConfirm }) {
  return createPortal(
    <div className="fixed inset-0 z-[110] glass-overlay flex items-center justify-center p-4 animate-fadein" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="glass-panel rounded-3xl w-full max-w-sm p-6" onClick={(event) => event.stopPropagation()}>
        <div className={`w-10 h-10 rounded-full grid place-items-center ${danger ? 'bg-red-100 text-red-600' : 'bg-brand-soft text-brand'}`}>
          {danger ? <FiTrash2 size={18} /> : <FiFilm size={18} />}
        </div>
        <h2 className="mt-4 text-[15.5px] font-bold text-ink-900">{title}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">{text}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-outline">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}>
            {busy ? 'Working…' : confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function RedoDialog({ value, story, busy, onChange, onCancel, onSubmit }) {
  const index = story.scenes.findIndex((scene) => scene.key === value.scene.key)
  return createPortal(
    <div className="fixed inset-0 z-[110] glass-overlay flex items-center justify-center p-4 animate-fadein" onClick={onCancel}>
      <form role="dialog" aria-modal="true" onSubmit={onSubmit} className="glass-panel rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-ink-100">
          <div>
            <h2 className="text-[16px] font-bold text-ink-900">Edit & redo scene {index + 1}</h2>
            <p className="mt-1 text-[11.5px] text-ink-500">The old clip will be replaced and the joined video cleared.</p>
          </div>
          <button type="button" onClick={onCancel} className="w-8 h-8 grid place-items-center rounded-lg text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={17} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <label className="block">
            <span className="label">Visual direction</span>
            <AutoTextarea required minRows={3} maxRows={14} maxLength={6000} value={value.visual} onChange={(event) => onChange({ ...value, visual: event.target.value })} className={storyInput} />
          </label>
          <label className="block">
            <span className="label">Voiceover</span>
            <AutoTextarea minRows={1} maxRows={6} maxLength={1000} value={value.voiceover} onChange={(event) => onChange({ ...value, voiceover: event.target.value })} className={storyInput} />
          </label>
          <label className="block">
            <span className="label">On-screen text</span>
            <input maxLength={80} value={value.on_screen} onChange={(event) => onChange({ ...value, on_screen: event.target.value })} className={storyInput} />
          </label>
        </div>
        <footer className="px-6 py-4 border-t border-ink-100 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-outline">Cancel</button>
          <button type="submit" disabled={busy || !value.visual.trim()} className="btn-primary">
            <FiRefreshCw size={14} /> {busy ? 'Starting…' : 'Save & redo scene'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
