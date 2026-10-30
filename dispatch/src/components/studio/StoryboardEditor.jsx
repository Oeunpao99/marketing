import { useEffect, useRef, useState } from 'react'
import { FiArrowDown, FiArrowUp, FiBox, FiCamera, FiCheck, FiCopy, FiFeather, FiFilm, FiHeadphones, FiMic, FiPenTool, FiPlay, FiPlus, FiRefreshCw, FiSquare, FiTrash2 } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import { lengthText, useUsage } from '../../lib/usage'
import { SCENE_LABELS, STYLE_LABELS } from './MotionBoard'

// The storyboard of a Remotion video made from the person's own story
// (POST /ai/motion/plan) — reviewed and edited here before anything is voiced
// or rendered: each scene's on-screen words and its spoken line, the order,
// scenes removed, duplicated or added. "Make the video" sends it back as it
// is (POST /ai/motion with ``script``; the server cleans it like the AI's own).
//
// A new scene is a kind the storyboard already has (so the template can draw
// it): a copy of the first scene of that kind with its words and voice
// emptied — any parts of it not edited here (list items, chart numbers) stay
// as that scene had them.

// The words on screen each scene type shows (its other parts — chart
// numbers, list items, chat messages — are kept as the AI wrote them).
export const FIELDS = {
  draw: [['name', 'Name'], ['tagline', 'Tagline']], // Logo · Drawing (logodraw.jsx): no voice
  hook: [['text', 'On screen']],
  talk: [['text', 'Says']],
  react: [
    ['text', 'Meme caption'],
    ['bubble', 'Bubble'],
  ],
  punch: [['text', 'Punchline']],
  speak: [['text', 'On the panel']],
  onair: [['text', 'On the card']],
  visit: [['text', 'Caption']],
  line: [['text', 'In the bubble']],
  agenda: [['title', 'Title']],
  keypoints: [['title', 'Title']],
  bignum: [['label', 'What it counts'], ['text', 'Line under it']],
  barchart: [['title', 'Title']],
  twocol: [['title', 'Title']],
  pullquote: [['text', 'Quote'], ['author', 'Who'], ['role', 'Their role']],
  picture: [['title', 'Title'], ['text', 'Text']],
  roadmap: [['title', 'Title']],
  overload: [['text', 'On screen']],
  crew: [['text', 'On screen']],
  pipeline: [['text', 'On screen']],
  approve: [['text', 'On screen'], ['post', 'The post'], ['button', 'Button']],
  gains: [['text', 'On screen']],
  plans: [['text', 'On screen'], ['badge', 'Badge']],
  wide: [['title', 'Caption card']],
  shot: [['title', 'On picture']],
  closeup: [['text', 'Caption card']],
  fact: [
    ['title', 'Title'],
    ['text', 'The fact'],
  ],
  shops: [['title', 'Title']],
  crowd: [
    ['title', 'Title'],
    ['label', 'On the board'],
  ],
  chatter: [['title', 'Title']],
  tale: [['title', 'Title']],
  tally: [
    ['title', 'Title'],
    ['label', 'What is counted'],
  ],
  fork: [['title', 'Title']],
  moral: [
    ['title', 'Title'],
    ['text', 'The lesson'],
  ],
  collage: [['word', 'Big word']],
  statement: [
    ['text', 'On screen'],
    ['sub', 'Under it'],
  ],
  pedestal: [
    ['title', 'On the pedestal'],
    ['left', 'Left caption'],
    ['right', 'Right caption'],
  ],
  whiteboard: [['title', 'Board title']],
  climb: [
    ['title', 'On screen'],
    ['text', 'Under it'],
    ['word', 'On the step'],
  ],
  mirror: [
    ['before', 'Old me'],
    ['after', 'New me'],
  ],
  grow: [
    ['title', 'On screen'],
    ['text', 'Under it'],
  ],
  summit: [['text', 'The lesson']],
  example: [['title', 'Title']],
  remember: [
    ['title', 'Title'],
    ['text', 'On the board'],
  ],
  note: [['title', 'List title']],
  doodle: [
    ['title', 'On screen'],
    ['text', 'Under the drawing'],
  ],
  problem: [
    ['title', 'On screen'],
    ['text', 'Under it'],
  ],
  chat: [['title', 'Chat title']],
  list: [['title', 'Title']],
  stat: [['label', 'Label']],
  product: [['title', 'Title']],
  cta: [
    ['text', 'On screen'],
    ['button', 'Button'],
  ],
  character: [['title', 'On screen']],
  compare: [['title', 'Title']],
  chart: [['title', 'Title']],
  split: [['title', 'Title']],
  myth: [
    ['myth', 'Myth'],
    ['fact', 'Fact'],
  ],
  verdict: [['text', 'On screen']],
  options: [['question', 'Question']],
  reveal: [['text', 'On screen']],
  quote: [
    ['text', 'Quote'],
    ['author', 'By'],
  ],
  customer: [
    ['name', 'Name'],
    ['business', 'Who'],
    ['text', 'Situation'],
  ],
  beforeafter: [
    ['before', 'Before'],
    ['after', 'After'],
  ],
  result: [['label', 'Label']],
  review: [
    ['text', 'Their words'],
    ['name', 'By'],
  ],
  news: [
    ['headline', 'Headline'],
    ['text', 'Why it matters'],
  ],
  notify: [['title', 'On screen']],
  step: [
    ['title', 'Step'],
    ['text', 'What happens'],
    ['result', 'Result'],
  ],
  offer: [
    ['plan', 'Plan'],
    ['badge', 'Badge'],
  ],
  screen: [
    ['title', 'On screen'],
    ['result', 'Result'],
  ],
  dashboard: [['title', 'Title']],
  chapter: [
    ['title', 'Chapter'],
    ['text', 'Under it'],
  ],
  checklist: [['title', 'Title']],
  recap: [['title', 'Title']],
  flow: [['title', 'Title']],
  apps: [['title', 'Title']],
  roll: [
    ['lead', 'Lead'],
    ['text', 'Under it'],
  ],
  table: [['title', 'View']],
  board: [['title', 'Title']],
  launch: [
    ['name', 'Product'],
    ['text', 'Promise'],
    ['badge', 'Badge'],
  ],
  button: [
    ['title', 'Card'],
    ['button', 'Button'],
    ['result', 'Result'],
  ],
  form: [
    ['title', 'Title'],
    ['toggle', 'Toggle'],
  ],
  // Unveil
  word: [
    ['word', 'Big word'],
    ['title', 'Card'],
    ['text', 'Line'],
  ],
  field: [
    ['label', 'Label'],
    ['value', 'Typed'],
    ['button', 'Button'],
  ],
  done: [['text', 'Result']],
  // AI design: the AI's layers aren't edited here — the voice line is
  canvas: [],
  // Tech explainer
  send: [['text', 'On screen']],
  address: [
    ['from', 'From'],
    ['to', 'To'],
    ['text', 'On screen'],
  ],
  lookup: [
    ['server', 'Server'],
    ['question', 'Question'],
    ['answer', 'Answer'],
  ],
  hops: [['text', 'On screen']],
  assemble: [
    ['label', 'Result'],
    ['text', 'On screen'],
  ],
  // How it works · Grid
  tasks: [
    ['title', 'Title'],
    ['sticker', 'Sticker'],
  ],
  fanout: [['title', 'Promise']],
  stack: [],
  platform: [['text', 'On screen']],
  orbit: [['text', 'On screen']],
  chaos: [['text', 'On screen']],
  phones: [],
  rank: [
    ['title', 'Item'],
    ['text', 'Why'],
  ],
  tip: [
    ['title', 'Tip'],
    ['text', 'How'],
  ],
  choice: [['question', 'Question']],
  reviews: [['title', 'Title']],
  logos: [['title', 'Title']],
  take: [
    ['before', 'Belief'],
    ['text', 'The take'],
  ],
  meme: [
    ['top', 'Top line'],
    ['bottom', 'Punchline'],
  ],
  client: [
    ['name', 'Customer'],
    ['text', 'Challenge'],
  ],
  metrics: [['title', 'Title']],
  timeline: [['title', 'Title']],
  qa: [
    ['q', 'Question'],
    ['a', 'Answer'],
  ],
  bars: [['title', 'Title']],
  donut: [['label', 'Label']],
  save: [
    ['text', 'On screen'],
    ['button', 'Button'],
  ],
  pair: [
    ['left', 'Left'],
    ['right', 'Right'],
  ],
}

// What else is in the scene, in one line.
function extras(s) {
  if (s.items?.length) return s.items.map((i) => i.text).join(' · ')
  if (s.messages?.length) return s.messages.map((m) => m.text).join(' / ')
  if (s.options?.length) return s.options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('  ')
  if (s.series?.length) return s.series.map((x) => `${x.name}: ${x.values.join(' → ')}`).join(' · ')
  if (s.left && s.right) return `${s.left.name || s.left.label} vs ${s.right.name || s.right.label}`
  if (s.type === 'stat' || s.type === 'result') return `${s.prefix || ''}${s.value}${s.suffix || ''}`
  if (s.chips?.length) return s.chips.join(' · ')
  if (s.type === 'screen') return `Screenshot ${s.shot}${s.target ? ` → ${s.target}` : ''}`
  if (s.checks?.length) return s.checks.join(' ✓ ')
  if (s.points?.length) return s.points.map((p) => p.title).join(' · ')
  if (s.metrics?.length) return s.metrics.map((m) => `${m.label} ${m.prefix || ''}${m.value}${m.suffix || ''}`).join(' · ')
  if (s.nodes?.length) return s.nodes.map((n) => n.label).join(' → ')
  if (s.notes?.length) return s.notes.map((n) => `${n.app}: ${n.text}`).join(' / ')
  if (s.type === 'apps' || s.apps?.length) return (s.apps || []).map((a) => a.name).join(' · ')
  if (s.words?.length) return s.words.join(' / ')
  if (s.type === 'table') return `${(s.columns || []).join(' | ')} · ${(s.rows || []).length} rows`
  if (s.type === 'metrics') return (s.rows || []).map((m) => `${m.label}: ${m.prefix || ''}${m.before}${m.suffix || ''} → ${m.prefix || ''}${m.after}${m.suffix || ''}`).join(' · ')
  if (s.type === 'timeline') return (s.steps || []).map((x) => `${x.when}: ${x.text}`).join(' → ')
  if (s.type === 'bars') return (s.data || []).map((x) => `${x.label} ${s.prefix || ''}${x.value}${s.suffix || ''}`).join(' · ') + (s.source ? ` (${s.source})` : '')
  if (s.type === 'donut') return `${s.value}%${s.source ? ` (${s.source})` : ''}`
  if (s.type === 'choice') return `A: ${s.left?.name || ''} · B: ${s.right?.name || ''}${s.percent ? ` (${s.percent}% A)` : ''}`
  if (s.type === 'reviews') return (s.cards || []).map((c) => `“${c.text}” — ${c.name}`).join(' · ')
  if (s.type === 'logos') return (s.names || []).join(' · ')
  if (s.type === 'orbit') return `${s.center?.title || ''} — ${(s.tags || []).map((x) => x.label).join(' · ')}`
  if (s.type === 'chaos') return (s.cards || []).map((x) => `${x.app}: ${x.title}`).join(' / ')
  if (s.type === 'phones') return (s.words || []).join(' ')
  if (s.type === 'form') return (s.fields || []).map((f) => `${f.label}: ${f.value}`).join(' · ')
  if (s.type === 'canvas') return (s.layers || []).map((L) => L.text || L.title).filter(Boolean).join(' · ')
  if (s.type === 'send') return `${s.from?.label || s.from?.device} → ${s.to?.label || s.to?.device}`
  if (s.type === 'hops') return (s.nodes || []).map((n) => n.label || n.device).join(' → ')
  if (s.type === 'tasks') return (s.items || []).map((x) => x.text).join(' · ')
  if (s.type === 'fanout') return [...(s.outputs || []).map((o, i) => `${i + 1}. ${o.kind}${o.value ? ` ${o.value}` : ''}`), ...(s.checks || []).map((c) => `✓ ${c}`)].join('  ')
  if (s.type === 'word') return (s.rows || []).map((x) => (x.sub ? `${x.name} (${x.sub})` : x.name)).join(' · ')
  if (s.type === 'stack') return `Screenshots ${(s.shots || []).join(', ')}${s.words?.length ? ` — ${s.words.join(' / ')}` : ''}`
  if (s.type === 'board') return (s.columns || []).map((c) => c.name).join(' → ')
  if (s.features?.length) return [s.price && `${s.price}${s.period || ''}`, ...s.features].filter(Boolean).join(' · ')
  return ''
}

// Seconds a scene runs — mirrors app/motion.py estimate_seconds.
const KHMER = /[ក-៿]/g
const spokenSeconds = (say = '') => (say.match(KHMER) || []).length / 11 + (say.match(/[A-Za-z0-9]+/g) || []).length / 2.6
const MIN_SECONDS = { draw: 10, chart: 5.2, compare: 4.2, character: 3.8, cta: 3.8, product: 3.6, myth: 5, quote: 5.6, options: 9.8, split: 8, beforeafter: 5.4, result: 4.2, review: 6, customer: 4.4, news: 5, notify: 7, step: 4.8, offer: 5.6, screen: 5, dashboard: 5.2, flow: 6.4, chapter: 3.2, checklist: 5.8, recap: 6, apps: 5, table: 5.1, board: 4.6, roll: 4.8, launch: 4.2, button: 4.6, form: 5.2, word: 4.2, field: 4.8, done: 3.4, tasks: 5.3, fanout: 6.4, canvas: 5, send: 4.2, address: 4.4, lookup: 5.2, hops: 6.2, assemble: 4.6, stack: 4.9, platform: 4.4, orbit: 5, chaos: 5, phones: 5, pair: 3.8, rank: 4.2, tip: 4.6, doodle: 4.2, talk: 3.4, react: 4.2, punch: 3.2, collage: 4, statement: 4.4, pedestal: 4.6, speak: 4.2, onair: 4.2, visit: 4.4, wide: 4.4, closeup: 4.2, fact: 4.6, line: 3.6, shops: 4.6, crowd: 5, chatter: 5, tale: 4.2, tally: 4.6, fork: 4.8, moral: 4.6, note: 4, climb: 4, mirror: 4.8, grow: 4.8, summit: 5.2, whiteboard: 5, example: 6.5, remember: 4.4, choice: 5, reviews: 5.8, logos: 4, save: 3.4, take: 5.2, meme: 4.6, client: 5, metrics: 5.2, timeline: 5.2, qa: 4.5, bars: 5, donut: 4.6, shot: 5 }

export function estimateSeconds(scenes) {
  const total = scenes.reduce((n, s) => n + Math.max(MIN_SECONDS[s.type] || 3.4, spokenSeconds(s.say) + 1.3), 0)
  return Math.max(0, Math.round(total - 0.47 * (scenes.length - 1)))
}

const fmtLength = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s` : `${sec} s`)

// Picture story (motion/src/picture.jsx): how its pictures are painted and the
// colours of the words on them (app/motion.py PICTURE_ARTS / clean_ink) — picked
// as cards
const ARTS = [
  { id: 'film', label: 'Film still', note: 'Real-looking, like a movie', Icon: FiCamera },
  { id: 'painted', label: 'Painted', note: 'Soft anime film painting', Icon: FiFeather },
  { id: 'illustration', label: 'Illustration', note: 'Clean flat drawing', Icon: FiPenTool },
  { id: '3d', label: '3D film', note: 'Like an animated movie', Icon: FiBox },
  { id: 'stickman', label: 'Stick figures', note: 'Black ink on a white page', Icon: FiFeather },
]
// ready-made word colours: [name, text, highlight ('' = the brand's colour)]
const INKS = [
  ['Brand', '#FFFFFF', ''],
  ['Gold', '#FFFFFF', '#FFD400'],
  ['Ocean', '#FFFFFF', '#22D3EE'],
  ['Warm', '#FFE8A3', '#F43F5E'],
  ['Sunny', '#FFD400', '#FFFFFF'],
  ['Ink', '#111111', '#E11D2E'], // for a white page — Stick figures
]
const TEXT_COLORS = ['#FFFFFF', '#FFE8A3', '#FFD400', '#111111']
const ACCENTS = ['', '#FFD400', '#22D3EE', '#F43F5E', '#22C55E', '#FFFFFF']

function Swatches({ colors, value, onPick, label }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c || 'brand'}
          type="button"
          onClick={() => onPick(c)}
          title={c || 'Your brand colour'}
          className={`grid h-7 min-w-7 place-items-center rounded-full border-2 px-1 text-[10px] font-bold ${
            (value || '') === c ? 'border-brand ring-2 ring-brand/25' : 'border-ink-200'
          }`}
          style={c ? { backgroundColor: c } : undefined}
        >
          {!c && <span className="px-1 text-ink-600">Brand</span>}
        </button>
      ))}
      {/* any colour of their own */}
      <label title="Pick your own colour" className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-ink-300 text-[13px] text-ink-500 hover:border-brand">
        +
        <input type="color" value={value || '#ffffff'} onChange={(e) => onPick(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

/** A selectable card: a ring and a tick when it's the one picked. */
function Card({ on, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`relative flex min-w-0 flex-col rounded-xl border p-2 text-left transition-colors ${on ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-ink-200 bg-white hover:border-brand/60'}`}
    >
      {on && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-brand text-white">
          <FiCheck size={10} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  )
}

// AI design (motion/src/canvas.jsx): how its pictures are made — painted by the image AI
// (the default, a few cents a video) or drawn as vector code by Claude (moving parts, the
// same people every scene, real words in them — costs more)
const CANVAS_PICTURES = [
  { id: 'flat', label: 'Painted', note: 'Colourful illustrations — quick and light', Icon: FiFeather },
  { id: 'vector', label: 'Vector', note: 'Clean drawings with moving parts', Icon: FiPenTool },
]

function CanvasPictures({ plan, onChange }) {
  const theme = plan.theme || {}
  if (theme.pictures === 'sketch') return null // Doodle notes' ink sketches — its own look
  const on = theme.pictures === 'vector' ? 'vector' : 'flat'
  return (
    <div className="border-b border-ink-200/70 px-4 py-4">
      <div className="mb-2 text-[11.5px] font-semibold text-ink-600">Pictures</div>
      <div className="grid grid-cols-2 gap-2">
        {CANVAS_PICTURES.map(({ id, label, note, Icon }) => (
          <Card key={id} on={on === id} onClick={() => onChange({ ...plan, theme: { ...theme, pictures: id } })}>
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${on === id ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600'}`}>
              <Icon size={16} />
            </span>
            <span className="mt-2 text-[12.5px] font-semibold text-ink-900">{label}</span>
            <span className="text-[11px] leading-snug text-ink-500">{note}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}

function PictureLook({ plan, onChange }) {
  const ink = { text: '#FFFFFF', accent: '', ...(plan.ink || {}) }
  const setInk = (patch) => onChange({ ...plan, ink: { ...ink, ...patch } })
  const art = plan.art || 'film'
  const preset = INKS.findIndex(([, t, a]) => t === (ink.text || '').toUpperCase() && a === (ink.accent || '').toUpperCase())
  const [custom, setCustom] = useState(preset < 0)
  const brand = 'rgb(var(--brand))'
  return (
    <div className="space-y-4 border-b border-ink-200/70 px-4 py-4">
      <div>
        <div className="mb-2 text-[11.5px] font-semibold text-ink-600">Picture style</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ARTS.map(({ id, label, note, Icon }) => (
            <Card key={id} on={art === id} onClick={() => onChange({ ...plan, art: id })}>
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${art === id ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600'}`}>
                <Icon size={16} />
              </span>
              <span className="mt-2 text-[12.5px] font-semibold text-ink-900">{label}</span>
              <span className="text-[11px] leading-snug text-ink-500">{note}</span>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-ink-600">Text look</span>
          <span className="text-[11px] text-ink-400">Put [brackets] round the words to highlight</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {INKS.map(([name, t, a], k) => (
            <Card
              key={name}
              on={!custom && preset === k}
              title={a ? undefined : 'The highlight in your brand colour'}
              onClick={() => {
                setCustom(false)
                onChange({ ...plan, ink: { text: t, accent: a } })
              }}
            >
              {/* the words as they'll look on a picture */}
              <span className="grid h-10 place-items-center rounded-lg bg-night-900 px-1 text-center text-[13px] font-extrabold leading-tight">
                <span style={{ color: t }}>
                  Aa <span style={{ color: a || brand }}>word</span>
                </span>
              </span>
              <span className="mt-1.5 text-center text-[11.5px] font-semibold text-ink-800">{name}</span>
            </Card>
          ))}
          <Card on={custom} onClick={() => setCustom(true)} title="Your own colours">
            <span className="grid h-10 place-items-center rounded-lg border border-dashed border-ink-300 text-[18px] text-ink-400">+</span>
            <span className="mt-1.5 text-center text-[11.5px] font-semibold text-ink-800">Custom</span>
          </Card>
        </div>
        {custom && (
          <div className="mt-3 space-y-2.5 rounded-xl bg-canvas p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 flex-none text-[11.5px] font-semibold text-ink-600">Text</span>
              <Swatches label="Text colour" colors={TEXT_COLORS} value={ink.text} onPick={(c) => setInk({ text: c })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 flex-none text-[11.5px] font-semibold text-ink-600">Highlight</span>
              <Swatches label="Highlight colour" colors={ACCENTS} value={ink.accent} onPick={(c) => setInk({ accent: c })} />
            </div>
            <span className="inline-block rounded-lg bg-night-900 px-3 py-1.5 text-[15px] font-extrabold" style={{ color: ink.text }}>
              Your words <span style={{ color: ink.accent || brand }}>highlighted</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const SILENT_STYLES = new Set(['logodraw'])

export default function StoryboardEditor({ plan, onChange, onMake, onRewrite, voice = true, onHear, fetchLine, onError }) {
  const [hearing, setHearing] = useState(null) // the line being played
  // this month's videos left and the plan's longest video (lib/usage.js) — what "Make the video" uses of them
  const { usage: month } = useUsage()
  // "Listen to the whole voice": every line in order, the next one fetched while
  // this one plays (no gaps); the scene being read is lit. Lines heard here are
  // kept on the server a while, so Make the video reuses them.
  const [playing, setPlaying] = useState(null) // the scene being read in the run
  const run = useRef(null)
  useEffect(() => () => run.current?.stop(), [])
  const listenAll = async () => {
    if (run.current) return run.current.stop()
    const lines = scenes.map((s, i) => [i, (s.say || '').trim()]).filter(([, t]) => t)
    if (!lines.length || !fetchLine) return
    let stopped = false
    let audio = null
    run.current = {
      stop: () => {
        stopped = true
        audio?.pause()
        run.current = null
        setPlaying(null)
      },
    }
    let next = fetchLine(lines[0][1])
    for (let k = 0; k < lines.length && !stopped; k++) {
      const [i] = lines[k]
      setPlaying(i)
      let blob
      try {
        blob = await next
      } catch (e) {
        onError?.(e)
        break
      }
      if (k + 1 < lines.length) next = fetchLine(lines[k + 1][1])
      next?.catch?.(() => {}) // handled when it's its turn
      if (stopped) break
      const url = URL.createObjectURL(blob)
      audio = new Audio(url)
      await new Promise((done) => {
        audio.onended = done
        audio.onerror = done
        audio.play().catch(done)
      })
      URL.revokeObjectURL(url)
    }
    if (!stopped) {
      run.current = null
      setPlaying(null)
    }
  }

  const hear = async (i, text) => {
    if (!onHear || !text?.trim() || hearing != null) return
    setHearing(i)
    try {
      await onHear(text.trim())
    } finally {
      setHearing(null)
    }
  }
  const scenes = plan?.scenes || []
  const set = (i, patch) => onChange({ ...plan, scenes: scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const move = (i, d) => {
    const next = [...scenes]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange({ ...plan, scenes: next })
  }
  const remove = (i) => onChange({ ...plan, scenes: scenes.filter((_, j) => j !== i) })
  const insert = (at, scene) => onChange({ ...plan, scenes: [...scenes.slice(0, at), scene, ...scenes.slice(at)] })
  const duplicate = (i) => insert(i + 1, structuredClone(scenes[i]))
  // the kinds of scene this storyboard has — the ones its template draws
  const kinds = [...new Set(scenes.map((s) => s.type))]
  const blank = (type) => {
    const like = structuredClone(scenes.find((s) => s.type === type) || { type })
    for (const [key] of FIELDS[type] || []) like[key] = ''
    like.say = ''
    return like
  }
  const [adding, setAdding] = useState(null) // where "Add scene" puts it: an index, or null (menu shut)
  const addMenu = (at) => (
    <div className="mt-2 rounded-xl border border-ink-200 bg-white p-2 shadow-sm animate-fadein">
      <div className="px-1.5 pb-1.5 text-[11px] text-ink-500">Add a scene{at < scenes.length ? ` after scene ${at}` : ' at the end'} — pick its kind:</div>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              insert(at, blank(type))
              setAdding(null)
            }}
            className="rounded-full border border-ink-200 px-3 py-1 text-[12px] font-medium text-ink-700 hover:border-brand hover:bg-brand-soft hover:text-brand"
          >
            {SCENE_LABELS[type] || type}
          </button>
        ))}
        <button type="button" onClick={() => setAdding(null)} className="rounded-full px-3 py-1 text-[12px] text-ink-400 hover:text-ink-700">
          Cancel
        </button>
      </div>
    </div>
  )
  // a template with no voice (Logo · Drawing — app/motion.py SILENT_STYLES): no voice boxes, one scene is a video
  const silent = SILENT_STYLES.has(plan?.style)
  const speaks = voice && !silent
  const fewest = silent ? 1 : 2
  const seconds = estimateSeconds(scenes)
  // the month's videos this one uses: up to 1 min 1, up to 3 min 2, longer 1 per 3 min (app/usage.py)
  const units = seconds <= 60 ? 1 : seconds <= 180 ? 2 : Math.ceil(seconds / 180)
  const tooLong = !!month?.longest_seconds && seconds > month.longest_seconds + 5
  const style = STYLE_LABELS[plan?.style]

  return (
    <div className="w-full max-w-[720px] rounded-2xl border border-ink-200/70 bg-white animate-fadein">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200/70 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink-900">Storyboard — check it, then make the video</div>
          <div className="mt-0.5 text-[11.5px] text-ink-500">
            {scenes.length} scenes · ≈ {fmtLength(seconds)}
            {silent ? ' · no voice — music and sound effects' : speaks ? ' with the voice' : ''} · nothing is recorded or rendered until you press Make
          </div>
        </div>
        {style && (
          <span title={plan?.why ? `AI picked ${style}: ${plan.why}` : undefined} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand">
            {plan?.why ? 'AI picked · ' : ''}
            {style}
          </span>
        )}
      </div>
      {/* their script designs its own film, but a fixed template was picked */}
      {plan?.misfit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200/70 bg-brand-soft px-4 py-2.5 text-[12px] text-ink-800">
          <span className="min-w-0 flex-1">
            Your script describes its own looks — backgrounds, reveals, a pause. <b>{style}</b> can only use its own scene types; <b>AI design</b> builds every scene to match your script.
          </span>
          <button
            type="button"
            onClick={() => onRewrite('canvas')}
            className="flex-none rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-dark"
          >
            Use AI design
          </button>
        </div>
      )}

      {plan?.style === 'picture' && <PictureLook plan={plan} onChange={onChange} />}
      {plan?.style === 'canvas' && <CanvasPictures plan={plan} onChange={onChange} />}

      <ol className="divide-y divide-ink-200/60">
        {scenes.map((s, i) => {
          const more = extras(s)
          return (
            <li key={i} className={`flex gap-3 px-4 py-3 transition-colors ${playing === i ? 'bg-brand-soft/50' : ''}`}>
              <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-lg bg-ink-100 text-[11px] font-bold tabular-nums text-ink-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{SCENE_LABELS[s.type] || s.type}</span>
                  <span className="flex items-center gap-0.5 text-ink-400">
                    {!silent && (
                      <button type="button" title="Add a scene after this one" onClick={() => setAdding(adding === i + 1 ? null : i + 1)} className={`rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 ${adding === i + 1 ? 'bg-brand-soft text-brand' : ''}`}>
                        <FiPlus size={13} />
                      </button>
                    )}
                    <button type="button" title="Duplicate this scene" onClick={() => duplicate(i)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700">
                      <FiCopy size={12} />
                    </button>
                    <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30">
                      <FiArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={i === scenes.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded-md p-1 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                    >
                      <FiArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      title="Remove this scene"
                      disabled={scenes.length <= fewest}
                      onClick={() => remove(i)}
                      className="rounded-md p-1 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </span>
                </div>
                {(FIELDS[s.type] || []).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <span className="w-16 flex-none text-[11px] text-ink-400">{label}</span>
                    <input
                      value={s[key] || ''}
                      placeholder="Type the words on screen…"
                      onChange={(e) => set(i, { [key]: e.target.value })}
                      className={`min-w-0 flex-1 rounded-lg border bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400 focus:border-brand ${s[key]?.trim() ? 'border-ink-200' : 'border-red-200'}`}
                    />
                  </label>
                ))}
                {more && <div className="pl-[4.5rem] text-[11.5px] text-ink-500 line-clamp-2">{more}</div>}
                {speaks && (
                  <label className="flex items-start gap-2">
                    <span className="mt-1.5 flex w-16 flex-none items-center gap-1 text-[11px] text-ink-400">
                      <FiMic size={11} /> Voice
                    </span>
                    <AutoTextarea
                      value={s.say || ''}
                      minRows={1}
                      maxRows={5}
                      placeholder="What the voice says in this scene…"
                      onChange={(e) => set(i, { say: e.target.value })}
                      className={`min-w-0 flex-1 rounded-lg border bg-white px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 focus:border-brand ${s.say?.trim() ? 'border-ink-200' : 'border-red-200'}`}
                    />
                    {onHear && (
                      <button
                        type="button"
                        onClick={() => hear(i, s.say)}
                        disabled={hearing != null || !s.say?.trim()}
                        title="Hear this line, as the video will say it"
                        aria-label={`Hear line ${i + 1}`}
                        className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg text-brand hover:bg-brand-soft disabled:opacity-40"
                      >
                        {hearing === i ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                        ) : (
                          <FiPlay size={14} />
                        )}
                      </button>
                    )}
                  </label>
                )}
                {adding === i + 1 && i + 1 < scenes.length && addMenu(i + 1)}
              </div>
            </li>
          )
        })}
      </ol>
      {/* add at the end (a one-scene template — Logo · Drawing — has nothing to add) */}
      {!silent && (
        <div className="border-t border-ink-200/60 px-4 py-2.5">
          {adding === scenes.length ? (
            addMenu(scenes.length)
          ) : (
            <button
              type="button"
              onClick={() => setAdding(scenes.length)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-brand hover:bg-brand-soft"
            >
              <FiPlus size={14} /> Add a scene
            </button>
          )}
        </div>
      )}

      {/* what "Make the video" uses of the month (app/usage.py video_units): by its length */}
      {month?.videos && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 text-[12px] ${tooLong || units > month.videos.left ? 'border-red-200 bg-red-50 text-red-700' : 'border-ink-200/70 bg-ink-50 text-ink-600'}`}>
          <span className="flex items-center gap-1.5 font-semibold text-ink-900">
            <FiFilm size={13} className="text-brand" /> Uses {units} of your videos
          </span>
          <span className="text-ink-500">about {lengthText(Math.round(seconds))} · your plan makes videos up to {lengthText(month.longest_seconds)}</span>
          <span className="ml-auto tabular-nums">
            {tooLong ? (
              <b>Too long for your plan — shorten it, or upgrade for longer videos</b>
            ) : units > month.videos.left ? (
              <b>
                Not enough videos left — you have {month.videos.left} of {month.videos.limit} this month
              </b>
            ) : (
              <>
                {month.videos.left} of {month.videos.limit} left this month
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200/70 px-4 py-3">
        <span className="text-[11px] text-ink-400">Words in [brackets] are highlighted on screen.</span>
        <div className="flex flex-wrap items-center gap-2">
          {speaks && fetchLine && (
            <button
              type="button"
              onClick={listenAll}
              disabled={hearing != null || !scenes.some((s) => s.say?.trim())}
              title="Hear every line in order, as the video will say it — then make the video"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50 ${
                playing != null ? 'border-brand bg-brand-soft text-brand' : 'border-ink-200 text-ink-700 hover:bg-ink-50'
              }`}
            >
              {playing != null ? (
                <>
                  <FiSquare size={12} fill="currentColor" /> Stop · scene {playing + 1}
                </>
              ) : (
                <>
                  <FiHeadphones size={14} /> Listen to the whole voice
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRewrite()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            <FiRefreshCw size={13} /> Write it again
          </button>
          <button
            type="button"
            onClick={onMake}
            disabled={scenes.length < fewest}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            <FiFilm size={14} /> Make the video
            {month?.videos && <span className="font-normal opacity-80">· {units} of {month.videos.left} left</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
