import { useEffect, useRef, useState } from 'react'
import { FiCheck, FiChevronDown, FiFeather, FiMic, FiMicOff, FiMonitor } from 'react-icons/fi'
import { kitSrc } from '../brandkit/BrandKit'

// The live storyboard of a Remotion video while it's made — what the AI is
// doing right now, scene by scene (app/motion.py _progress, polled with the
// job): the story being written, each scene as it's planned, each voice line
// as it's spoken, then the frames being drawn.

export const SCENE_LABELS = {
  hook: 'Hook',
  problem: 'Problem',
  chat: 'Chat',
  list: 'List',
  stat: 'Number',
  product: 'Product',
  cta: 'Call to action',
  character: 'Character',
  compare: 'Two people',
  chart: 'Chart',
  split: 'Old vs new',
  myth: 'Myth vs fact',
  verdict: 'Verdict',
  options: 'Answers',
  reveal: 'The answer',
  quote: 'Quote',
  customer: 'Customer',
  beforeafter: 'Before → after',
  result: 'Result',
  review: 'Review',
  news: 'News',
  notify: 'Notifications',
  step: 'Step',
  offer: 'Offer',
  screen: 'Screenshot',
  dashboard: 'Dashboard',
  flow: 'Flow',
  chapter: 'Chapter',
  checklist: 'Checklist',
  recap: 'Recap',
  apps: 'Works with',
  roll: 'Rolling word',
  table: 'Table view',
  board: 'Board',
  launch: 'Introducing',
  button: 'The click',
  form: 'Form',
  word: 'Big word',
  tasks: 'The work today',
  canvas: 'Scene',
  send: 'Device → device',
  address: 'The address',
  lookup: 'The lookup',
  hops: 'The path',
  assemble: 'It comes back',
  fanout: 'One → many',
  field: 'Typing',
  done: 'Done ✓',
  stack: 'Screen deck',
  platform: 'The product',
  orbit: 'Orbit',
  chaos: 'The mess today',
  phones: 'Phones',
  pair: 'Two words',
  rank: 'Top 5 item',
  tip: 'Tip',
  choice: 'This or that',
  reviews: 'Reviews',
  logos: 'Trusted by',
  save: 'Save this',
  take: 'Hot take',
  meme: 'Meme',
  react: 'Reaction',
  punch: 'Punchline',
  collage: 'Collage',
  statement: 'Statement',
  pedestal: 'On the pedestal',
  speak: 'The host explains',
  onair: 'At the mic',
  visit: 'In the story',
  line: 'Someone speaks',
  agenda: 'Agenda',
  keypoints: 'Key points',
  bignum: 'A big number',
  barchart: 'Chart',
  twocol: 'Two columns',
  pullquote: 'Quote',
  picture: 'Picture',
  roadmap: 'Roadmap',
  overload: 'The work piling up',
  crew: 'The AI team',
  pipeline: 'One in, many out',
  approve: 'Approve with one tap',
  gains: 'Results',
  plans: 'Plans',
  wide: 'The place',
  shot: 'Picture',
  closeup: 'Close-up',
  fact: 'A fact',
  shops: 'The two shops',
  crowd: 'People walk in',
  chatter: 'Their messages',
  tale: 'The story',
  tally: 'The count',
  fork: 'Two paths',
  moral: 'The lesson',
  client: 'The customer',
  metrics: 'Before → after',
  timeline: 'Timeline',
  qa: 'Question',
  bars: 'Bar chart',
  donut: 'Percent',
}

export const STYLE_LABELS = { tech: 'Sell', explainer: 'Teach', versus: 'Compare', poll: 'Poll', quote: 'Quote', testimonial: 'Testimonial', trend: 'AI News', pov: 'POV', demo: 'Product demo', offer: 'Offer', spotlight: '3D · Spotlight', productfx: 'Product showcase', skylaunch: 'SaaS launch · Sky', fintech: 'Fintech · Wallet & Card', stickman: 'Stick figures', appdemo: '3D · App demo', showcase: 'Showcase', launch: 'Product launch', unveil: 'Unveil', gridcards: 'How it works · Grid', techflow: 'Tech explainer', canvas: 'AI design', neural: 'AI explainer · Neural', paper: 'AI notes · Paper', doodle: 'Doodle notes', cartoon: 'Story · Characters', lesson: 'Lesson · Teacher', rise: 'Rise · Mindset', reaction: 'Reaction meme', studio: 'Collage · Studio', presenter: 'Presenter · Brand host', podcast: 'Podcast · Story talk', parable: 'Parable · Two paths', dialogue: 'Dialogue · Two voices', street3d: '3D · Street', illustrated: 'Illustrated · Everyday Cambodia', aiteam: 'AI service · Your AI team', saashub: 'SaaS Hub · Connect & Automate', picture: 'Picture story', deck: 'Slides · Presentation', clarity: 'SaaS explainer', countdown: 'Top 5', thisorthat: 'This or that', reviews: 'Review wall', tips: 'Tip cards', hottake: 'Hot take', casestudy: 'Case study', faq: 'FAQ', report: 'Data report', custom: 'Designed for you', training: 'Training' }

/** 0-99 from the real steps: the story is the only part without a count, so
 * it creeps up with time; the voice counts lines, the render counts frames. */
export function motionPercent(progress, elapsed) {
  if (!progress) return null
  const scenes = progress.scenes || []
  const voiced = scenes.filter((s) => s.voice === 'done' || s.voice === 'skip').length
  switch (progress.stage) {
    case 'story':
      return Math.min(24, 4 + elapsed * 0.7)
    case 'polish':
      return 27
    case 'pictures':
      return 31
    case 'voice':
      return 32 + (scenes.length ? (23 * voiced) / scenes.length : 0)
    case 'render':
      return Math.min(99, 55 + 44 * (progress.render || 0))
    default:
      return null
  }
}

export function motionStage(progress) {
  if (!progress) return null
  const scenes = progress.scenes || []
  const speaking = scenes.findIndex((s) => s.voice === 'speaking')
  const style = STYLE_LABELS[progress.style]
  switch (progress.stage) {
    case 'story':
      return `Writing the story${style ? ` · ${style}` : ''}…`
    case 'polish':
      return 'Polishing the script — one story, scene to scene…'
    case 'pictures':
      // templates whose pictures the image AI draws (Doodle, AI design, Reaction, Story) count them
      return progress.drawings
        ? `Painting the pictures · ${progress.drawn || 0} of ${progress.drawings} done${(progress.painting || []).length > 1 ? ' — two at a time' : ' — about 20 s each'}`
        : 'Picking your brand photos…'
    case 'check':
      return 'Checking its design — fixing anything that looks off…'
    case 'voice':
      return speaking >= 0 ? `Recording the voice · scene ${speaking + 1} of ${scenes.length}` : 'Recording the voice…'
    case 'render':
      return `Animating the scenes · ${Math.round(100 * (progress.render || 0))}%`
    default:
      return null
  }
}

/** A small moving sound wave beside the mic while a line is recorded. */
function VoiceWave() {
  return (
    <span className="cf-wave inline-flex h-3.5 items-center gap-[2px]" role="img" aria-label="Recording now">
      {[0, 0.2, 0.4, 0.1, 0.3].map((delay, i) => (
        <span key={i} className="h-full w-[2.5px] rounded-full bg-brand" style={{ animationDelay: `${delay}s` }} />
      ))}
    </span>
  )
}

// ── "Making your video": one card for a Remotion video being made ──────────
const STEPS = [
  { key: 'story', label: 'Story' },
  { key: 'voice', label: 'Voice' },
  { key: 'render', label: 'Animate' },
  { key: 'done', label: 'Done' },
]
const stepOf = (stage) => (stage === 'voice' ? 1 : stage === 'render' ? 2 : stage === 'done' ? 4 : 0) // done: every step ticked
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const BACKGROUNDS = { grid: 'grid', glow: 'soft glow', dots: 'dots', clean: 'clean' }

/** The look the AI picked for a "Designed for you" video: its three colours
 * as swatches, light / dark and the background (app/motion.py clean_look). */
function LookChip({ look }) {
  const label = [look.kicker, look.mode === 'light' ? 'Light' : 'Dark', BACKGROUNDS[look.background]].filter(Boolean).join(' · ')
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600" title="The look the AI picked for this video">
      <span className="flex -space-x-1" aria-hidden="true">
        {[look.bg, look.a, look.b].map((c, i) => (
          <span key={i} className="h-3 w-3 rounded-full ring-1 ring-ink-200" style={{ background: c }} />
        ))}
      </span>
      {label}
    </span>
  )
}

/** What a step shows when it's clicked: Story = every scene's words on
 * screen and its voice line; Voice = the lines being recorded. */
const STEP_HINT = {
  story: 'The story the AI wrote — what each scene shows and says',
  voice: 'The voice lines, as they are recorded',
  render: 'The scenes are being drawn — the story and voice are final',
}

/** Progress, the four steps and the storyboard rows, top to bottom, in one
 * full-width card (replaces the smoke canvas + side storyboard for Remotion).
 * A step that has started can be clicked to see its work; a row opens alone. */
/** A long request (a whole pasted brief): 3 lines and a fade, "See more"
 * opens it all. Short ones show as they are. */
function LongText({ text }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 220 || text.split(/\n/).length > 3
  return (
    <span className="mt-0.5 block">
      <span className={`relative block whitespace-pre-line text-[11.5px] leading-snug text-ink-500 ${long && !open ? 'max-h-[4.2em] overflow-hidden' : ''}`}>
        {text}
        {long && !open && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.2em] bg-gradient-to-b from-transparent to-ink-50" aria-hidden="true" />}
      </span>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-[11.5px] font-semibold text-brand hover:underline">
          {open ? 'See less' : 'See more'}
        </button>
      )}
    </span>
  )
}

/** Before the first scene: the AI's thinking, step by step — it read the
 * request, it knows the brand and settings, it picked a template (and why),
 * it's writing the story — so the wait shows work, not just a percentage. */
function Thinking({ request, meta, style, why, elapsed }) {
  const lines = [
    { done: true, label: 'Read your request', body: request ? `“${request}”` : 'Make one for me — the AI picks the topic' },
    { at: 1.2, done: true, label: 'Your brand and settings', body: meta },
    { at: 2.4, done: !!style, label: style ? `Picked the template: ${style}` : 'Choosing the best template for it', body: style ? why : '' },
    { at: 2.4, wait: !style, done: false, label: 'Writing your story, scene by scene', body: 'Each scene’s words on screen and what the voice says' },
  ]
  return (
    <ol className="mx-4 mb-4 space-y-2.5 rounded-xl bg-ink-50 px-4 py-3.5">
      {lines.map((l, i) => {
        if ((l.at || 0) > elapsed || l.wait) return null
        const busy = !l.done
        return (
          <li key={i} className="flex items-start gap-2.5 animate-fadein">
            <span
              className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] ${
                busy ? 'bg-brand-soft text-brand' : 'bg-emerald-500 text-white'
              }`}
            >
              {busy ? <span className="h-2 w-2 animate-ping rounded-full bg-brand" /> : '✓'}
            </span>
            <span className="min-w-0">
              <span className={`block text-[12.5px] ${busy ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                {l.label}
                {busy && <span className="ml-0.5 inline-block animate-pulse">…</span>}
              </span>
              {l.body && (i === 0 ? <LongText text={l.body} /> : <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-500">{l.body}</span>)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// AI design's checklist: every ask in the brief, and whether the design has it
function Asks({ asks }) {
  const [open, setOpen] = useState(false)
  const got = asks.filter((a) => a.ok).length
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11.5px] font-semibold text-ink-500 hover:text-ink-800">
        Your brief · {got}/{asks.length} asks in the design {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {asks.map((a) => (
            <li key={a.id} className="flex gap-1.5 text-[11.5px] leading-snug">
              <span className={a.ok ? 'text-emerald-600' : 'text-amber-600'}>{a.ok ? '✓' : '○'}</span>
              <span className={a.ok ? 'text-ink-600' : 'text-ink-400'}>{a.need}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The live design view in the Animate step: each designed scene's picture
 * (from the self-check's preview), full width, the status on top of it. The
 * big view follows the scene being animated, and every change of scene plays
 * a transition (slide, zoom, wipe, flip, blur — in turn); the filmstrip ticks
 * scenes off as they're done. */
const SWAPS = ['cf-swap-slide', 'cf-swap-zoom', 'cf-swap-wipe', 'cf-swap-flip', 'cf-swap-blur']
function SceneSketches({ sketches, render }) {
  const shots = (sketches || []).map((u) => (u ? kitSrc(u) : null)) // /api/… links (the dev server is on :8000)
  const n = shots.length
  const at = Math.min(n - 1, Math.floor((render || 0) * n))
  const cur = shots[at] ? at : shots.findIndex(Boolean)
  // the scene shown before this one stays underneath while the new one comes in
  const [prev, setPrev] = useState({ shown: cur, under: -1 })
  useEffect(() => {
    if (cur !== prev.shown) setPrev({ shown: cur, under: prev.shown })
  }, [cur, prev.shown])
  const strip = useRef(null)
  useEffect(() => {
    strip.current?.children[cur]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [cur])
  return (
    <div className="border-b border-ink-100 px-4 py-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-night ring-1 ring-ink-200" style={{ perspective: 1200 }}>
        {/* a vertical video: its own picture, soft and wide, fills the space beside it */}
        <img key={`bg${cur}`} src={shots[cur]} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl animate-fadein" />
        {prev.under >= 0 && shots[prev.under] && <img src={shots[prev.under]} alt="" className="absolute inset-0 h-full w-full object-contain" />}
        <img key={cur} src={shots[cur]} alt={`Scene ${cur + 1}`} className={`absolute inset-0 h-full w-full object-contain ${SWAPS[cur % SWAPS.length]}`} />
        {/* the status, on the picture */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-2.5 text-[11.5px] font-semibold text-white">
          <span className="inline-flex items-center gap-2">
            <img src="/brand/logo-mark.png" alt="" className="h-5 w-5 animate-pulse object-contain" />
            Animating scene {at + 1} of {n}
          </span>
          <span className="tabular-nums">{Math.round(100 * (render || 0))}%</span>
        </div>
        <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/10">
          <span className="cf-scan block h-full w-1/3 bg-white/70" />
        </span>
      </div>
      {/* the filmstrip */}
      <div ref={strip} className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {shots.map((src, i) => {
          const done = i < at
          const now = i === cur
          return (
            <span
              key={i}
              className={`relative aspect-video w-16 flex-none overflow-hidden rounded-md bg-night transition duration-300 ${now ? 'scale-105 ring-2 ring-brand' : 'ring-1 ring-ink-200'} ${!now && !done ? 'opacity-55' : ''}`}
            >
              {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="absolute inset-0 animate-pulse bg-white/10" />}
              {done && (
                <span className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-brand text-white">
                  <FiCheck size={9} strokeWidth={3} />
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function MotionMaking({ progress, pct, stage, elapsed, onStop, request = '', meta = '' }) {
  const scenes = progress?.scenes || []
  const step = stepOf(progress?.stage)
  const rendering = progress?.stage === 'render'
  // pictures the image AI paints (Picture story, Doodle, Presenter…): each row shows its
  // picture once painted, a moving feather while it's being painted (app/motion.py _start_doodles)
  const pics = progress?.pictures || []
  const painting = new Set(progress?.painting || [])
  const waiting = new Set(progress?.waiting || [])
  const style = STYLE_LABELS[progress?.style]
  const thinking = scenes.length === 0 && (!progress?.stage || progress.stage === 'story')
  const [view, setView] = useState(null) // 'story' | 'voice' | 'render' | null
  const [opened, setOpened] = useState(() => new Set())
  const toggleRow = (i) =>
    setOpened((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  return (
    <section className="w-full max-w-[760px] rounded-2xl border border-ink-200/70 bg-white animate-fadein">
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-ink-900">Making your video</span>
              {style && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">{style}</span>}
              {scenes.length > 0 && <span className="text-[11.5px] text-ink-400">{scenes.length} scenes</span>}
              {progress?.look && <LookChip look={progress.look} />}
            </div>
            {progress?.why && !thinking && <div className="mt-0.5 text-[11.5px] text-ink-400">AI picked {style}: {progress.why}</div>}
            {progress?.design_note && <div className="mt-0.5 text-[11.5px] text-emerald-700">✓ {progress.design_note}</div>}
            {progress?.asks?.length > 0 && <Asks asks={progress.asks} />}
            {progress?.voice_note && (
              <div className="mt-1 rounded-lg bg-ink-50 px-2 py-1 text-[11.5px] text-ink-600">{progress.voice_note}</div>
            )}
            <div className={`mt-0.5 truncate text-[12px] ${progress?.stage === 'done' ? 'font-semibold text-emerald-600' : 'text-ink-500'}`}>{stage}</div>
          </div>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <span className="h-2.5 w-2.5 rounded-[3px] bg-current" aria-hidden="true" /> Stop
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand/15">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <span className="flex-none text-[11px] tabular-nums text-ink-500">
            <b className="font-semibold text-ink-700">{Math.round(pct)}%</b> · {clock(elapsed)}
          </span>
        </div>
        {/* the four steps */}
        <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px]">
          {STEPS.map((s, i) => {
            const done = i < step
            const now = i === step
            const canOpen = (done || now) && s.key !== 'done' && scenes.length > 0
            const picked = view === s.key
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                {i > 0 && <span className={`h-px w-5 sm:w-8 ${done || now ? 'bg-brand/50' : 'bg-ink-200'}`} aria-hidden="true" />}
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => setView(picked ? null : s.key)}
                  aria-pressed={picked}
                  title={canOpen ? (picked ? 'Back to the scene list' : STEP_HINT[s.key]) : undefined}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-shadow disabled:cursor-default ${
                    done ? 'bg-brand text-white' : now ? 'bg-brand-soft text-brand' : 'text-ink-400'
                  } ${picked ? 'ring-2 ring-brand/40 ring-offset-1' : canOpen ? 'hover:ring-2 hover:ring-brand/25' : ''}`}
                >
                  {done ? <FiCheck size={11} strokeWidth={3} /> : now ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> : null}
                  {s.label}
                </button>
              </li>
            )
          })}
        </ol>
        {view && <p className="mt-2 text-[11.5px] text-ink-500">{STEP_HINT[view]} · click the step again to close</p>}
      </header>
      {/* before the first scene: what the AI understood and decided */}
      {thinking && <Thinking request={request} meta={meta} style={style} why={progress?.why} elapsed={elapsed || 0} />}

      <div className="border-t border-ink-100">
        {/* the designed scenes, live — in the Animate step only */}
        {progress?.stage === 'render' && progress?.sketches?.some(Boolean) && (
          <SceneSketches sketches={progress.sketches} render={progress.render} />
        )}
        {scenes.length === 0 ? (
          <div className="space-y-2.5 px-4 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="h-5 w-5 flex-none animate-pulse rounded-md bg-ink-100" />
                <span className="h-3 w-20 flex-none animate-pulse rounded bg-ink-100" />
                <span className="h-3 flex-1 animate-pulse rounded bg-ink-100" style={{ maxWidth: `${70 - i * 12}%` }} />
              </div>
            ))}
            <p className="text-[11.5px] text-ink-400">The AI is planning the scenes…</p>
          </div>
        ) : (
          <ol className="divide-y divide-ink-100">
            {scenes.map((s, i) => {
              const speaking = s.voice === 'speaking'
              const done = rendering || s.voice === 'done'
              // what's opened under the row: the step's view, or this row alone
              const showScreen = (view === 'story' || (opened.has(i) && view !== 'voice')) && (s.screen || s.text)
              const showSay = (view === 'story' || view === 'voice' || opened.has(i)) && s.say
              return (
                <li key={i} className={`transition-colors ${speaking ? 'bg-brand-soft/60' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleRow(i)}
                  aria-expanded={!!(showScreen || showSay)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-ink-50/70"
                >
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-md text-[10.5px] font-bold tabular-nums ${
                      done ? 'bg-brand text-white' : speaking ? 'bg-brand/20 text-brand' : 'bg-ink-100 text-ink-500'
                    }`}
                  >
                    {done ? <FiCheck size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="w-[92px] flex-none truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                    {SCENE_LABELS[s.type] || s.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-800" title={s.text}>
                    {s.text || '—'}
                  </span>
                  <span className="flex flex-none items-center gap-1 text-[10.5px] text-ink-400">
                    {pics[i] ? (
                      <img src={kitSrc(pics[i])} alt={`Scene ${i + 1}'s picture`} className="mr-1 h-7 w-12 rounded-md object-cover ring-1 ring-ink-200 animate-fadein" />
                    ) : painting.has(i) ? (
                      <span className="mr-1 inline-flex items-center gap-1 font-semibold text-brand">
                        <FiFeather size={13} className="cf-feather" /> Painting
                      </span>
                    ) : waiting.has(i) && !rendering ? (
                      <FiFeather size={12} className="mr-1 text-ink-300" title="Waiting to be painted" aria-label="Waiting to be painted" />
                    ) : null}
                    {speaking ? (
                      <>
                        <FiMic size={12} className="text-brand" /> <VoiceWave />
                      </>
                    ) : s.voice === 'done' ? (
                      <span className="tabular-nums">{s.seconds}s</span>
                    ) : s.voice === 'skip' ? (
                      <FiMicOff size={12} />
                    ) : null}
                    {(s.screen || s.say) && (
                      <FiChevronDown size={13} className={`ml-0.5 transition-transform ${showScreen || showSay ? 'rotate-180' : ''}`} aria-hidden="true" />
                    )}
                  </span>
                </button>
                {(showScreen || showSay) && (
                  <div className="space-y-1.5 pb-2.5 pl-[52px] pr-4 sm:pl-[148px]">
                    {pics[i] && (opened.has(i) || view === 'story') && (
                      <img src={kitSrc(pics[i])} alt={`Scene ${i + 1}'s picture`} className="max-h-40 rounded-lg object-contain ring-1 ring-ink-200" />
                    )}
                    {showScreen && (
                      <p className="flex gap-2 text-[12px] leading-relaxed text-ink-700">
                        <FiMonitor size={13} className="mt-[3px] flex-none text-ink-400" aria-label="On screen" />
                        <span>{s.screen || s.text}</span>
                      </p>
                    )}
                    {showSay && (
                      <p className="flex gap-2 text-[12px] leading-relaxed text-ink-500">
                        <FiMic size={13} className={`mt-[3px] flex-none ${speaking ? 'text-brand' : 'text-ink-400'}`} aria-label="Says" />
                        <span className="italic">“{s.say}”</span>
                      </p>
                    )}
                  </div>
                )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
