/**
 * Sound effects — a whoosh on every scene change, a pop when something springs
 * in, a blop per chat bubble / notification, a click on buttons, a ding on
 * success, ticks on a countdown. Files: public/sfx/<name>.mp3 (made by
 * tools/make_sfx.py). Each cue's frame mirrors the animation it sounds for, in
 * the scene components (MotionPost.jsx, explainer.jsx, goaltemplates.jsx,
 * testimonial.jsx, saas.jsx) — move one, move the other.
 */
import { Html5Audio, Sequence, staticFile } from 'remotion'
import { FPS } from './shared'

const VOLUME = { whoosh: 0.22, pop: 0.3, blop: 0.32, click: 0.35, ding: 0.28, tick: 0.18 }
const SAAS = new Set(['trend', 'pov', 'demo', 'offer', 'custom', 'showcase'])

/** [{ at: frame in the scene, s: sound }] for one scene. */
export function cuesFor(scene, style, frames, first) {
  const cues = first ? [] : [{ at: 0, s: 'whoosh' }] // the transition slides in at the scene's frame 0
  const add = (at, s) => at < frames - 4 && cues.push({ at: Math.max(0, Math.round(at)), s })
  const n = (list, max = 4) => Math.min(max, (list || []).length)
  const saas = SAAS.has(style)
  switch (scene.type) {
    case 'chat':
      for (let i = 0; i < n(scene.messages); i++) add(24 + i * 45, 'blop')
      break
    case 'list': {
      const [start, step] = saas ? [14, 12] : style === 'training' ? [12, 10] : style === 'explainer' ? [18, 22] : [22, 26]
      for (let i = 0; i < n(scene.items); i++) add(start + i * step, 'pop')
      break
    }
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
      add(14, 'pop')
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
    default: // hook, news, reveal, verdict, quote, customer, product, point
      add(4, 'pop')
  }
  return cues
}

/** The scene's sound effects, each starting on its frame. */
export function SceneSfx({ scene, style, frames, first }) {
  return cuesFor(scene, style, frames, first).map(({ at, s }, k) => (
    <Sequence key={k} from={at} layout="none">
      <Html5Audio src={staticFile(`sfx/${s}.mp3`)} volume={VOLUME[s]} />
    </Sequence>
  ))
}
