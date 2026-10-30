/**
 * Sound effects — a whoosh on every scene change, a pop when something springs
 * in, a blop per chat bubble / notification, a click on buttons, a ding on
 * success, ticks on a countdown. Files: public/sfx/<name>.mp3 (made by
 * tools/make_sfx.py). Each cue's frame mirrors the animation it sounds for, in
 * the scene components (MotionPost.jsx, explainer.jsx, goaltemplates.jsx,
 * testimonial.jsx, saas.jsx) — move one, move the other.
 */
import { Html5Audio, Sequence, staticFile } from 'remotion'
import { FPS, TRANSITION } from './shared'
import { hitFrames } from './canvas'
import { mouthBeats } from './reaction'
import { presenterCues } from './presenter'
import { podcastCues } from './podcast'
import { parableCues } from './parable'
import { dialogueCues } from './dialogue'
import { streetCues } from './street3d'
import { illustratedCues } from './illustrated'
import { aiteamCues } from './aiteam'
import { saashubCues } from './saashub'
import { deckCues } from './deck'
import { logodrawCues } from './logodraw'

const VOLUME = {
  whoosh: 0.22, pop: 0.3, blop: 0.32, click: 0.35, ding: 0.28, tick: 0.18, impact: 0.55, riser: 0.3, sketch: 0.5,
  swish: 0.24, swoosh: 0.3, shimmer: 0.2, cash: 0.34, coin: 0.28, notify: 0.3, typing: 0.22, drumroll: 0.28,
  applause: 0.26, page: 0.32, chime: 0.26, drop: 0.48, confetti: 0.28, shutter: 0.3,
}
const SAAS = new Set(['cyber', 'trend', 'pov', 'demo', 'offer', 'custom', 'showcase', 'launch', 'clarity', 'countdown', 'thisorthat', 'reviews', 'tips', 'hottake', 'casestudy', 'faq', 'report'])
// What the video is about — from its template, or from the music mood the AI picked for it
// (public/music/<mood>/), so an event or an offer sounds like one in any template.
const TEACH = new Set(['teach', 'training', 'lesson', 'tips', 'faq', 'doodle', 'paper'])
const PROMO = new Set(['offer', 'sell', 'fintech'])
const LAUNCH = new Set(['launch', 'skylaunch', 'unveil', 'showcase', 'productfx', 'spotlight', 'appdemo', 'clarity'])

/** The music's mood from its path ("music/event/x.mp3" → "event"). */
export const moodOf = (music) => (String(music || '').match(/music\/([^/]+)\//) || [])[1] || ''

/** [{ at: frame in the scene, s: sound }] for one scene — ``index``: its place in the video. */
export function cuesFor(scene, style, frames, first, mood = '', index = 0, next = null) {
  if (style === 'picture') return [] // Picture story: soft crossfades under the voice — no whooshes
  const kind = {
    teach: mood === 'learning' || TEACH.has(style),
    promo: mood === 'promo' || PROMO.has(style),
    event: mood === 'event' || mood === 'festive',
    launch: mood === 'launch' || mood === 'cinematic' || LAUNCH.has(style),
  }
  const cues = [...varied(cuesOf(scene, style, frames, first, index, kind), kind)]
  const add = (at, s) => at < frames - 4 && cues.push({ at: Math.max(0, Math.round(at)), s })
  // the moment that carries the video: a launch drops on its reveal, an event cheers its close
  const big = (s) => s && (s.type === 'reveal' || s.type === 'launch')
  if (kind.launch && big(scene) && !first) add(4, 'drop')
  // …and builds to it: the riser (1.4 s) starts at the end of the scene before and peaks on the drop
  // (the next scene's frame 4, which overlaps this one's last TRANSITION frames)
  if (kind.launch && big(next) && frames > 70) add(frames - TRANSITION + 4 - 42, 'riser')
  if (kind.event && scene.type === 'cta') {
    add(6, 'confetti')
    add(18, 'applause')
  }
  if (kind.event && (scene.type === 'stat' || scene.type === 'result')) add(4, 'drumroll')
  return cues
}

/** The same cues in the video's own sounds: a lesson's success is a marimba chime, an offer's a
 * coin; the first notification is a phone's own chime. */
function* varied(cues, kind) {
  let notes = 0
  for (const c of cues) {
    if (c.s === 'ding' && kind.teach) yield { ...c, s: 'chime' }
    else if (c.s === 'ding' && kind.promo) yield { ...c, s: 'coin' }
    else if (c.s === 'blop' && c.note && notes++ === 0) yield { ...c, s: 'notify' }
    else yield c
  }
}

function cuesOf(scene, style, frames, first, index, kind) {
  // the scene change: a page turning in a lesson; in the SaaS explainer the sound of its own
  // transition (clarity.jsx: swoosh, whip, zoom in turn); launches and SaaS films alternate
  const change = kind.teach
    ? 'page'
    : style === 'clarity' || style === 'launch' // the swoosh / whip / zoom (clarity.jsx clarityTransitions)
      ? ['swoosh', 'swish', 'whoosh'][(index - 1 + 3) % 3]
      : kind.launch || SAAS.has(style)
        ? (index % 2 ? 'whoosh' : 'swish')
        : 'whoosh'
  const cues = first ? [] : [{ at: 0, s: change }] // the transition slides in at the scene's frame 0
  const add = (at, s) => at < frames - 4 && cues.push({ at: Math.max(0, Math.round(at)), s })
  const n = (list, max = 4) => Math.min(max, (list || []).length)
  const saas = SAAS.has(style)
  if (style === 'presenter') {
    // Presenter · Brand host keeps its cue frames beside its animations (presenter.jsx)
    presenterCues(scene).forEach(([at, s]) => add(at, s))
    return cues
  }
  if (style === 'podcast') {
    podcastCues(scene).forEach(([at, s]) => add(at, s)) // podcast.jsx
    return cues
  }
  if (style === 'logodraw') {
    logodrawCues().forEach(([at, s]) => add(at, s)) // logodraw.jsx — the pencil, the fill, the chime
    return cues
  }
  if (style === 'deck') {
    deckCues(scene).forEach(([at, s]) => add(at, s)) // deck.jsx
    return cues
  }
  if (style === 'aiteam') {
    aiteamCues(scene).forEach(([at, s]) => add(at, s)) // aiteam.jsx
    return cues
  }
  if (style === 'saashub') {
    saashubCues(scene).forEach(([at, s]) => add(at, s)) // saashub.jsx
    return cues
  }
  if (style === 'illustrated') {
    illustratedCues(scene).forEach(([at, s]) => add(at, s)) // illustrated.jsx
    return cues
  }
  if (style === 'street3d') {
    streetCues(scene).forEach(([at, s]) => add(at, s)) // street3d.jsx
    return cues
  }
  if (style === 'dialogue') {
    dialogueCues(scene).forEach(([at, s]) => add(at, s)) // dialogue.jsx
    return cues
  }
  if (style === 'parable') {
    parableCues(scene).forEach(([at, s]) => add(at, s)) // parable.jsx
    return cues
  }
  // Reaction meme (reaction.jsx): its hook is a meme moment and its close has the animals
  const type = style === 'reaction' && scene.type === 'hook' ? 'react' : style === 'reaction' && scene.type === 'cta' ? 'memecta' : scene.type
  switch (type) {
    case 'chat':
      for (let i = 0; i < n(scene.messages); i++) add(24 + i * 45, 'blop')
      break
    case 'list': {
      const [start, step] = saas ? [14, 12] : style === 'training' ? [12, 10] : style === 'explainer' ? [18, 22] : [22, 26]
      for (let i = 0; i < n(scene.items); i++) add(start + i * step, 'pop')
      break
    }
    case 'climb': // rise.jsx: the hero lands on the next step
      add(24, 'pop')
      break
    case 'whiteboard': // lesson.jsx usePointer: each part arrives as the stick reaches it
    case 'example': {
      const list = scene.type === 'whiteboard' ? scene.parts : scene.people
      const k = n(list, scene.type === 'whiteboard' ? 4 : 3)
      const start = (scene.type === 'whiteboard' ? 0.6 : 0.7) * FPS
      const step = Math.max(0.7 * FPS, Math.min(1.6 * FPS, (frames - start - 0.8 * FPS) / Math.max(1, k)))
      for (let i = 0; i < k; i++) add(start + i * step, 'pop')
      break
    }
    case 'react': // reaction.jsx: a pop on every mouth flap, a bang when one is shocked
    case 'punch': {
      const moods = scene.moods || []
      const who = scene.type === 'punch' ? [0] : (scene.who || [0]).slice(0, 2)
      const beats = []
      who.forEach((_, i) => {
        const mood = moods[i] || (scene.type === 'punch' ? 'shock' : 'pop')
        if (mood === 'pop' || mood === 'laugh') beats.push(...mouthBeats(mood, frames, FPS, scene.type === 'punch' ? 0.25 : 0.55 + i * 0.2))
      })
      beats.sort((a, b) => a - b).slice(0, 8).forEach((f) => add(f, 'pop'))
      if (scene.type === 'punch' || moods.includes('shock')) add((scene.type === 'punch' ? 0.6 : 0.85) * FPS, 'impact')
      if (scene.bubble) add(0.9 * FPS, 'blop')
      break
    }
    case 'memecta':
      add(0.9 * FPS, 'pop')
      break
    case 'talk': // cartoon.jsx: the bubble pops, the item lands
      add(6, 'pop')
      if (scene.item) add(18, 'blop')
      break
    case 'note':
      for (let i = 0; i < n(scene.checks, 5); i++) add(23 + i * 16, 'pop')
      break
    case 'problem':
      add(4, 'pop')
      if (scene.count) add(12, 'blop')
      break
    case 'options': {
      const opts = n(scene.options)
      for (let i = 0; i < opts; i++) add(14 + i * 10, 'pop')
      const from = 24 + opts * 10
      const len = Math.max(60, Math.min(5 * FPS, frames - from - 30))
      for (let k = 0; k < Math.round(len / FPS); k++) add(from + k * FPS, 'tick')
      add(from + len, Number.isInteger(scene.answer) && scene.answer >= 0 ? 'ding' : 'pop')
      break
    }
    case 'split': {
      add(4, 'pop')
      const pts = Math.max(n(scene.left?.points, 3), n(scene.right?.points, 3))
      for (let i = 0; i < pts * 2; i++) add(26 + i * 14, 'pop')
      break
    }
    case 'myth':
      add(4, 'pop')
      add(Math.min(60, frames * 0.45), 'ding')
      break
    case 'beforeafter':
      add(2, 'pop')
      add(Math.min(40, Math.round(frames * 0.35)), 'pop')
      break
    case 'result':
    case 'stat':
      add(4, 'pop')
      add(54, 'ding') // the number has counted up
      break
    case 'review':
      for (let i = 0; i < 5; i++) add(6 + i * 5, 'pop')
      break
    case 'notify': {
      const gap = Math.max(10, Math.min(28, Math.round((frames * 0.6) / Math.max(1, n(scene.notes)))))
      for (let i = 0; i < n(scene.notes); i++) add(12 + i * gap, 'blop')
      cues.forEach((c) => c.s === 'blop' && (c.note = true))
      break
    }
    case 'step': {
      const clickAt = Math.min(62, Math.round(frames * 0.45))
      add(clickAt, 'click')
      if (scene.result) add(clickAt + 6, 'ding')
      break
    }
    case 'screen': {
      add(4, 'pop')
      if (!(Array.isArray(scene.focus) && scene.focus.length === 4)) break
      add(44, 'pop') // the focus lights up
      if ((scene.action || 'click') === 'click') {
        const clickAt = Math.min(78, Math.round(frames * 0.55))
        add(clickAt, 'click')
        if (scene.result) add(clickAt + 6, 'ding')
      } else if (scene.result && scene.action !== 'zoom') add(58, 'ding')
      break
    }
    case 'dashboard':
      for (let i = 0; i < n(scene.metrics, 3); i++) add(10 + i * 8, 'pop')
      add(54, 'ding') // the numbers have counted up
      break
    case 'flow': {
      const nodes = n(scene.nodes)
      for (let i = 0; i < nodes; i++) add(12 + i * 16, 'pop')
      add(12 + nodes * 16, 'ding') // the last step ticks
      break
    }
    case 'launch': {
      const n = [...String(scene.name || '')].length
      add(8, 'swoosh')
      add(8 + n * 2 + 14, 'ding') // the badge pops
      break
    }
    case 'button': {
      const clickAt = Math.min(Math.round(frames * 0.5), 62)
      add(2, 'whoosh')
      add(clickAt, 'click')
      if (scene.result) add(clickAt + 6, 'ding')
      break
    }
    case 'form': {
      let at = 14
      for (const f of (scene.fields || []).slice(0, 3)) {
        add(at, 'typing') // the value types itself in
        at += Math.max(10, Math.round([...String(f.value || '')].length * 1.1)) + 6
      }
      if (scene.toggle) add(at + 18, 'click')
      break
    }
    case 'take':
      add(0, 'pop')
      if (scene.before) add(16, 'whoosh') // struck out
      add(scene.before ? 40 : 8, 'pop')
      break
    case 'client':
      add(0, 'pop')
      add(18, 'whoosh')
      break
    case 'metrics':
      for (let i = 0; i < n(scene.rows, 3); i++) add(8 + i * 8, 'pop')
      add(52 + (n(scene.rows, 3) - 1) * 8, 'ding')
      break
    case 'timeline':
      for (let i = 0; i < n(scene.steps, 4); i++) add(8 + i * 14, 'blop')
      break
    case 'quote':
      add(style === 'casestudy' ? 2 : 4, 'pop')
      break
    case 'qa':
      add(0, 'blop')
      add(12, 'blop')
      break
    case 'bars':
      for (let i = 0; i < n(scene.data, 6); i++) add(10 + i * 6, 'tick')
      add(44 + (n(scene.data, 6) - 1) * 6, 'ding')
      break
    case 'donut':
      add(4, 'pop')
      add(48, 'ding')
      break
    case 'rank':
      add(0, 'whoosh')
      add(6, 'pop') // the number lands
      add(12, 'whoosh') // its card
      break
    case 'choice':
      add(6, 'pop')
      add(12, 'pop')
      add(20, 'blop') // VS
      if (scene.percent > 0 && scene.percent < 100) add(70, 'ding')
      break
    case 'reviews':
      add(2, 'pop')
      for (let i = 0; i < n(scene.cards, 4); i++) add(14 + i * 8, 'blop')
      add(40, 'ding') // the score has counted up
      break
    case 'logos':
      add(2, 'pop')
      break
    case 'tip':
      add(0, 'whoosh')
      add(8, 'pop')
      break
    case 'save':
      add(2, 'pop')
      add(40, 'click')
      add(48, 'ding')
      break
    case 'platform':
      add(2, 'pop')
      add(16, 'whoosh') // the app rises
      break
    case 'orbit':
      add(2, 'pop')
      for (let i = 0; i < n(scene.tags, 6); i++) add(10 + i * 5, 'blop')
      break
    case 'chaos':
      for (let i = 0; i < n(scene.cards, 6); i++) add(4 + i * 4, 'blop')
      break
    case 'phones': {
      add(0, 'whoosh')
      const words = n(scene.words, 6)
      const each = Math.max(18, Math.round((frames - 10) / Math.max(1, words)))
      for (let k = 1; k < words; k++) add(6 + k * each, 'tick')
      break
    }
    case 'pair':
      add(6, 'pop')
      add(32, 'click')
      break
    case 'gallery': // clarity.jsx: the window swings in, the cards pop in one by one
      add(2, 'swoosh')
      for (let i = 0; i < n(scene.cards, 6); i++) add(16 + i * 5, 'pop')
      break
    case 'stack': {
      const pages = n(scene.images, 4)
      const step = Math.max(14, Math.min(30, Math.round((frames * 0.6) / Math.max(1, pages))))
      for (let i = 0; i < pages; i++) add(4 + i * step, 'whoosh')
      break
    }
    case 'apps':
      add(2, 'pop')
      for (let i = 0; i < n(scene.apps, 8); i++) add(8 + i * 4, 'blop')
      break
    case 'table': {
      const rows = n(scene.rows, 6)
      for (let i = 0; i < rows; i++) add(10 + i * 5, 'blop')
      add(Math.min(Math.round(frames * 0.62), 10 + rows * 5 + 28), 'click') // Sort
      break
    }
    case 'board':
      add(18, 'click') // the card is picked up
      add(52, 'ding') // …and dropped in the last column
      break
    case 'roll': {
      const words = n(scene.words, 5)
      const step = Math.max(12, Math.min(28, Math.round((frames * 0.5) / Math.max(1, words))))
      for (let j = 1; j < words; j++) add(16 + j * step, 'tick')
      add(16 + (words - 1) * step + 8, 'ding')
      break
    }
    case 'offer':
      add(14, 'cash') // the price lands
      for (let i = 0; i < n(scene.features); i++) add(30 + i * 10, 'click')
      break
    case 'cta': {
      const button = saas ? 20 : style === 'explainer' ? 26 : style === 'testimonial' || style === 'training' ? 22 : 30
      add(4, 'pop')
      if (scene.button) add(button, 'pop')
      if (scene.button && saas) add(52, 'click') // the pointer taps it
      break
    }
    case 'chapter':
      add(2, 'whoosh')
      break
    case 'checklist':
      for (let i = 0; i < n(scene.checks, 6); i++) add(20 + i * 14, 'click')
      break
    case 'recap':
      for (let i = 0; i < n(scene.points, 5); i++) add(10 + i * 12, 'pop')
      break
    case 'character':
      add(8, 'pop')
      break
    case 'compare':
      add(14, 'pop')
      break
    case 'canvas': {
      // AI design (canvas.jsx): a riser builds to each big reveal, the impact lands on it
      const pause = Math.round((Number(scene.pause) || 0) * FPS)
      if (pause) cues.length = 0 // the breath before a reveal is silent
      for (const h of hitFrames(scene, FPS)) {
        if (h >= 42) add(h - 42, 'riser') // the riser is 1.4 s — it peaks on the hit
        add(h, 'impact')
      }
      let pops = 0
      for (const L of scene.layers || []) {
        if (L.hit) continue
        const at = (L.at || 0) * FPS + pause
        if (L.kind === 'alert') add(at, 'blop')
        else if (L.in === 'pop' && pops++ < 3) add(at, 'pop')
      }
      break
    }
    case 'hook':
    case 'reveal':
      add(4, 'pop')
      // clarity.jsx makeLine: the sparkle lands 26 frames after it sets off, after the words
      if (style === 'clarity' || style === 'launch') add(8 + [...String(scene.text || '').split(' ')].length * 4 + 18, 'shimmer')
      break
    default: // news, verdict, quote, customer, product, point
      add(4, 'pop')
  }
  return cues
}

/** The scene's sound effects, each starting on its frame. */
export function SceneSfx({ scene, style, frames, first, mood = '', index = 0, next = null }) {
  return cuesFor(scene, style, frames, first, mood, index, next).map(({ at, s }, k) => (
    <Sequence key={k} from={at} layout="none">
      <Html5Audio src={staticFile(`sfx/${s}.mp3`)} volume={VOLUME[s]} />
    </Sequence>
  ))
}
