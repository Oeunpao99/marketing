/**
 * How it works · Grid — after a Khmer explainer the user loved (2026-10-16):
 * pale grid paper, navy and lime green, bold Khmer headlines with a lime
 * highlighter stroke under the key word, white cards with navy icon tiles, a
 * tilted lime sticker, and karaoke subtitles (MotionPost → Caption look).
 * For a product or service that solves an everyday problem.
 *
 * Its own scenes (app/motion.py GRID_PROMPT):
 *
 *   { type: "tasks", title?, items: [{ icon, text }], sticker? }      the repetitive work, cards with a turning ↻, the sticker
 *   { type: "fanout", title?, image? | icon, outputs: [{ kind, value? }], checks?: [text] }
 *        one input (the product photo) → 2-3 numbered results: post | price | tags | chat | list
 *
 * The rest (hook, list, stat, reveal, step, flow, cta) are saas.jsx's scenes
 * in this palette. Every scene lays itself out for 9:16 and 16:9.
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
export const NAVY = '#1E3470'
export const LIME = '#7CC242'
const GREY = '#E4E8EF'
const card = (r = 22) => ({
  background: '#FFFFFF',
  borderRadius: r,
  boxShadow: '0 18px 40px rgba(30,52,112,0.10), 0 2px 6px rgba(30,52,112,0.06)',
  border: '2px solid rgba(30,52,112,0.05)',
})

/** Grid paper. */
export function Paper() {
  return (
    <AbsoluteFill style={{ background: '#EEF1F6' }}>
      <NeatGrid color="rgba(30,52,112,0.075)" size={54} />
    </AbsoluteFill>
  )
}

/** The headline: bold navy, the ⟦key word⟧ on a lime highlighter stroke. */
function Headline({ text, wide, delay = 0 }) {
  if (!text) return null
  return <Words text={text} delay={delay} align="center" color={NAVY} style={{ fontWeight: 700, fontSize: fitSize(text, wide ? 84 : 92), justifyContent: 'center' }} />
}

/** A navy tile with a white icon. */
function Tile({ name, size }) {
  return (
    <div style={{ width: size, height: size, flex: 'none', borderRadius: size * 0.2, background: NAVY, display: 'grid', placeItems: 'center' }}>
      <Icon name={name} size={size * 0.46} color="#FFFFFF" stroke={2.3} />
    </div>
  )
}

// ── tasks: the repetitive work, cards with a turning ↻, the sticker ────────
function makeTasks() {
  return function Tasks({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const items = scene.items || []
    const H = wide ? 120 : 150
    const W = wide ? 980 : width - 200
    const start = scene.title ? 14 : 4
    const stickerAt = start + items.length * 7 + 10
    const pop = spring({ frame: frame - stickerAt, fps, config: { damping: 9, mass: 0.8 } })
    return (
      <AbsoluteFill>
        <Paper />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: wide ? 26 : 34, paddingBottom: wide ? 120 : 330, flexDirection: 'column' }}>
          {scene.title && (
            <div style={{ width: W, marginBottom: 20 }}>
              <Headline text={scene.title} wide={wide} />
            </div>
          )}
          {items.map((it, i) => {
            const s = spring({ frame: frame - start - i * 7, fps, config: { damping: 15 } })
            const spin = Math.max(0, frame - start - i * 7 - 14) * 4
            return (
              <div key={i} style={{ width: W, height: H, ...card(24), display: 'flex', alignItems: 'center', gap: 30, padding: '0 30px', opacity: s, transform: `translateX(${(1 - s) * 160}px)` }}>
                <Tile name={it.icon || 'Repeat'} size={H * 0.68} />
                <div style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontWeight: 700, fontSize: wide ? 46 : 52, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(it.text)}</div>
                <div style={{ width: H * 0.45, height: H * 0.45, flex: 'none', borderRadius: '50%', background: '#F1F3F7', display: 'grid', placeItems: 'center', transform: `rotate(${spin}deg)` }}>
                  <Icon name="Repeat" size={H * 0.24} color="#3A4660" stroke={2.4} />
                </div>
              </div>
            )
          })}
          {scene.sticker && (
            <div
              style={{
                marginTop: 20,
                padding: wide ? '16px 40px' : '20px 46px',
                background: LIME,
                border: '5px solid #16213A',
                borderRadius: 22,
                boxShadow: '0 10px 0 rgba(22,33,58,0.85)',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: wide ? 50 : 58,
                color: '#16213A',
                transform: `scale(${pop}) rotate(${-3 + (1 - pop) * -10}deg)`,
                opacity: Math.min(1, pop * 2),
              }}
            >
              {clean(scene.sticker)}
            </div>
          )}
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

/** A grey text line, as a placeholder in the mock cards. */
const Bar = ({ w, h = 14, c = GREY }) => <div style={{ width: w, height: h, borderRadius: h / 2, background: c }} />

/** What each result card shows. */
function Mock({ out, image, icon, h }) {
  const pic = (size) =>
    image ? (
      <Img src={srcOf(image)} style={{ width: '100%', height: size, objectFit: 'cover', borderRadius: 12, background: '#F4EBDD' }} />
    ) : (
      <div style={{ width: '100%', height: size, borderRadius: 12, background: '#EEF1F6', display: 'grid', placeItems: 'center' }}>
        <Icon name={icon || 'Image'} size={size * 0.4} color={NAVY} />
      </div>
    )
  // the platform's mark, drawn (the icon set has no brand logos): Facebook's f, Instagram's camera…
  const platform = {
    facebook: { bg: '#1877F2', mark: 'f' },
    instagram: { bg: 'linear-gradient(45deg, #F58529, #DD2A7B 55%, #8134AF)', icon: 'Camera' },
    tiktok: { bg: '#111111', icon: 'Music2' },
    telegram: { bg: '#229ED9', icon: 'Send' },
  }[(out.value || '').toLowerCase()]
  if (out.kind === 'post')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 40 }}>
          {platform && (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: platform.bg, display: 'grid', placeItems: 'center', color: '#FFFFFF', fontFamily: 'Arial, sans-serif', fontWeight: 900, fontSize: 30, lineHeight: 1 }}>
              {platform.mark ? <span style={{ marginTop: 6 }}>{platform.mark}</span> : <Icon name={platform.icon} size={22} color="#FFFFFF" />}
            </div>
          )}
        </div>
        <Bar w="85%" />
        <Bar w="60%" />
        {pic(h * 0.42)}
        <Bar w="90%" />
      </div>
    )
  if (out.kind === 'price')
    return (
      <div style={{ position: 'relative', height: '100%', borderRadius: 14, background: '#F7EFE3', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 8, bottom: 40, width: '48%' }}>{pic(h * 0.5)}</div>
        <div style={{ position: 'absolute', right: 14, top: '30%', fontFamily: FONT, fontWeight: 800, fontSize: h * 0.17, color: NAVY, letterSpacing: '-0.03em' }}>{clean(out.value) || '$'}</div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, height: 30, borderRadius: 15, background: NAVY }} />
      </div>
    )
  if (out.kind === 'tags')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 50 }}>
        <Bar w="90%" />
        <Bar w="75%" />
        <Bar w="55%" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', marginTop: 20, fontFamily: FONT, fontWeight: 800, fontSize: h * 0.08, color: NAVY }}>
          {['#', '#', '#', '#'].map((x, i) => (
            <span key={i}>{x}</span>
          ))}
        </div>
      </div>
    )
  if (out.kind === 'chat')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 50 }}>
        <div style={{ alignSelf: 'flex-start', width: '62%', height: 44, borderRadius: 18, background: GREY }} />
        <div style={{ alignSelf: 'flex-end', maxWidth: '88%', padding: '12px 16px', borderRadius: 18, background: NAVY, color: '#FFFFFF', fontFamily: FONT, fontWeight: 600, fontSize: h * 0.055, lineHeight: 1.35 }}>
          {clean(out.value) || '…'}
        </div>
        <div style={{ alignSelf: 'flex-start', width: '44%', height: 44, borderRadius: 18, background: GREY }} />
      </div>
    )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 50 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: LIME, display: 'grid', placeItems: 'center' }}>
            <Icon name="Check" size={16} color={NAVY} stroke={3} />
          </div>
          <Bar w={`${70 - i * 12}%`} />
        </div>
      ))}
    </div>
  )
}

// ── fanout: one input → numbered results, the ✓ pills ──────────────────────
function makeFanout() {
  return function Fanout({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const outs = (scene.outputs || []).slice(0, 3)
    const n = Math.max(1, outs.length)
    const titleH = scene.title ? 10 : 0
    const tile = spring({ frame: frame - titleH - 4, fps, config: { damping: 13 } })
    const arrow = interpolate(frame, [titleH + 14, titleH + 24], [0, 1], clamp)
    const gap = wide ? 34 : 26
    const W = wide ? 1300 : width - 120
    const cw = (W - gap * (n - 1)) / n
    const ch = wide ? 330 : Math.min(420, cw * 1.25)
    const T = wide ? 190 : 260
    const checksAt = titleH + 30 + n * 8 + 8
    return (
      <AbsoluteFill>
        <Paper />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: wide ? 22 : 30, paddingBottom: wide ? 110 : 330 }}>
          {scene.title && (
            <div style={{ width: W, marginBottom: wide ? 6 : 16 }}>
              <Headline text={scene.title} wide={wide} />
            </div>
          )}
          {/* the one input */}
          <div style={{ width: T, height: T, borderRadius: 30, overflow: 'hidden', ...card(30), transform: `scale(${tile})`, display: 'grid', placeItems: 'center', background: scene.image ? '#F4EBDD' : '#FFFFFF' }}>
            {scene.image ? <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Tile name={scene.icon || 'Image'} size={T * 0.5} />}
          </div>
          <div style={{ height: wide ? 50 : 70, display: 'grid', placeItems: 'center', opacity: arrow, transform: `translateY(${(1 - arrow) * -14}px)` }}>
            <Icon name="ArrowDown" size={wide ? 46 : 56} color={NAVY} stroke={2.6} />
          </div>
          {/* the results */}
          <div style={{ display: 'flex', gap, width: W }}>
            {outs.map((o, i) => {
              const s = spring({ frame: frame - titleH - 24 - i * 8, fps, config: { damping: 12 } })
              return (
                <div key={i} style={{ position: 'relative', width: cw, height: ch, ...card(24), padding: 20, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 70}px) scale(${0.85 + 0.15 * s})` }}>
                  <div style={{ position: 'absolute', left: -2, top: -2, width: 54, height: 54, borderRadius: '22px 0 16px 0', background: NAVY, color: '#FFFFFF', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 30, zIndex: 1 }}>
                    {i + 1}
                  </div>
                  <Mock out={o} image={scene.image} icon={scene.icon} h={ch} />
                </div>
              )
            })}
          </div>
          {/* the ✓ pills */}
          {(scene.checks || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginTop: wide ? 6 : 14 }}>
              {scene.checks.map((c, i) => {
                const s = spring({ frame: frame - checksAt - i * 8, fps, config: { damping: 12 } })
                const first = i === 0
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 28px 14px 16px',
                      borderRadius: 999,
                      background: first ? LIME : '#FFFFFF',
                      boxShadow: first ? 'none' : '0 10px 26px rgba(30,52,112,0.10)',
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: wide ? 34 : 38,
                      color: NAVY,
                      transform: `scale(${s})`,
                    }}
                  >
                    <span style={{ width: 46, height: 46, borderRadius: '50%', background: NAVY, display: 'grid', placeItems: 'center' }}>
                      <Icon name="Check" size={26} color="#FFFFFF" stroke={3} />
                    </span>
                    {clean(c)}
                  </div>
                )
              })}
            </div>
          )}
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

export function gridScenes() {
  return { tasks: makeTasks(), fanout: makeFanout() }
}
