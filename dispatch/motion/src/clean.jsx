/**
 * The clean goal templates (2026-10-14, user: "these last three are neat and
 * clean — make more like that, 5 templates per goal"). Light pages, a neat
 * grid or thin rings, words sharpening in, white cards with soft shadows —
 * the look of showcase.jsx / launch.jsx / clarity.jsx. Each template is a
 * saas.jsx palette plus a few of these scenes:
 *
 *   countdown (Top 5)   { type: "rank", n, title, text?, icon }            a big number slams in, its card slides in
 *   thisorthat          { type: "choice", question, left: { name, icon }, right: { name, icon }, percent?, prompt? }
 *   reviews (Review wall) { type: "reviews", title?, rating?, count?, cards: [{ name, text, stars }] }
 *                       { type: "logos", title?, names: [] }                 "Trusted by" — names sliding past
 *   tips (Tip cards)    { type: "tip", n, of, title, text?, icon }          a numbered card flips onto the stack
 *                       { type: "save", text, button? }                     the bookmark fills, the hand taps Save
 *
 * build_props numbers rank (5 → 1) and tip (1 of N). Every scene lays itself
 * out for 9:16 and 16:9.
 */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Sharpen } from './clarity'
import { Hand } from './launch'
import { FONT, Icon, clean, fitSize, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
export const INK = '#141A24'
export const SUB = '#5F6B7A'
export const SHADOW = '0 22px 50px rgba(20,26,36,0.10), 0 2px 6px rgba(20,26,36,0.05)'
export const card = (r = 30) => ({ background: '#FFFFFF', borderRadius: r, boxShadow: SHADOW, border: '2px solid rgba(20,26,36,0.05)' })

export function IconTile({ P, name, size }) {
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', boxShadow: `0 10px 24px ${tint(P.a, 0.3)}` }}>
      <Icon name={name || 'Sparkles'} size={size * 0.52} color="#FFFFFF" stroke={2.2} />
    </div>
  )
}

function Stars({ value = 5, size = 40, fill = 1, color = '#F5B301' }) {
  return (
    <div style={{ display: 'flex', gap: size * 0.12 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const on = Math.max(0, Math.min(1, value * fill - i))
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`st${i}-${Math.round(on * 100)}`}>
                <stop offset={on} stopColor={color} />
                <stop offset={on} stopColor="#E3E7ED" />
              </linearGradient>
            </defs>
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill={`url(#st${i}-${Math.round(on * 100)})`} />
          </svg>
        )
      })}
    </div>
  )
}

// ── Top 5 countdown: a big number slams in, its card slides in ──────────────
function makeRank(P, Bg) {
  return function Rank({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const n = scene.n || 1
    const of = Math.max(n, scene.of || 5)
    const slam = spring({ frame, fps, config: { damping: 11, mass: 0.8 } })
    const cardIn = spring({ frame: frame - 10, fps, config: { damping: 15 } })
    const T = wide ? 380 : 420
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* where we are in the countdown */}
        <div style={{ position: 'absolute', top: wide ? 150 : 250, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
          {[...Array(of)].map((_, i) => {
            const k = of - i // 5 4 3 2 1
            return <span key={i} style={{ width: k === n ? 46 : 14, height: 14, borderRadius: 7, background: k === n ? P.a : k > n ? tint(P.a, 0.35) : 'rgba(20,26,36,0.12)' }} />
          })}
        </div>
        <div style={{ position: 'absolute', ...(wide ? { left: 140, width: 560, top: 260, height: 620 } : { left: 0, right: 0, top: 300, height: 480 }), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: T, lineHeight: 1, letterSpacing: '-0.05em', color: 'transparent', WebkitTextStroke: `6px ${P.a}`, background: `linear-gradient(180deg, ${tint(P.a, 0.25)}, ${tint(P.b, 0.05)})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', transform: `scale(${2.2 - 1.2 * slam})`, opacity: Math.min(1, slam * 1.6), filter: `blur(${(1 - slam) * 12}px)` }}>
            <span style={{ fontSize: T * 0.42, verticalAlign: 'top', marginRight: 6 }}>#</span>
            {n}
          </div>
        </div>
        <div style={{ position: 'absolute', ...(wide ? { left: 760, right: 140, top: 380 } : { left: 60, right: 60, top: 830 }), ...card(34), padding: wide ? '40px 44px' : '44px 46px', display: 'flex', gap: 30, alignItems: 'flex-start', opacity: cardIn, transform: `translateX(${(1 - cardIn) * 160}px)` }}>
          <IconTile P={P} name={scene.icon} size={wide ? 110 : 120} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Sharpen text={scene.title} P={P} size={fitSize(scene.title, wide ? 62 : 64)} delay={14} align="left" />
            {scene.text && (
              <div style={{ marginTop: 16, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, wide ? 36 : 40), color: SUB, lineHeight: 1.45, opacity: interpolate(frame, [26, 40], [0, 1], clamp) }}>{clean(scene.text)}</div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

// ── This or that: two cards, a VS, votes filling (when there are real ones) ──
function makeChoice(P, Bg) {
  return function Choice({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pct = Number.isFinite(scene.percent) && scene.percent > 0 && scene.percent < 100 ? scene.percent : null
    const L = spring({ frame: frame - 6, fps, config: { damping: 14 } })
    const R = spring({ frame: frame - 12, fps, config: { damping: 14 } })
    const vs = spring({ frame: frame - 20, fps, config: { damping: 9 } })
    const fill = interpolate(frame, [34, 70], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const W = wide ? 600 : 450
    const H = wide ? 470 : 560
    const top = wide ? 290 : 560
    const gap = wide ? 140 : 60
    const sides = [
      { s: scene.left || {}, k: L, x: width / 2 - gap / 2 - W, color: P.a, share: pct, from: -1 },
      { s: scene.right || {}, k: R, x: width / 2 + gap / 2, color: P.b, share: pct === null ? null : 100 - pct, from: 1 },
    ]
    const winner = pct === null ? -1 : pct >= 50 ? 0 : 1
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 140 : 280 }}>
          <Sharpen text={scene.question} P={P} size={fitSize(scene.question, wide ? 76 : 78)} delay={0} />
        </div>
        {sides.map(({ s, k, x, color, share, from }, i) => {
          const lift = i === winner ? interpolate(frame, [64, 76], [0, 1], clamp) : 0
          return (
            <div key={i} style={{ position: 'absolute', left: x, top, width: W, height: H, ...card(36), border: `3px solid ${i === winner ? color : 'rgba(20,26,36,0.06)'}`, boxShadow: i === winner ? `${SHADOW}, 0 0 0 ${8 * lift}px ${tint(color, 0.15)}` : SHADOW, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: 30, opacity: k, transform: `translateX(${(1 - k) * from * 200}px) translateY(${-14 * lift}px) rotate(${(1 - k) * from * 8}deg)` }}>
              <div style={{ position: 'absolute', top: 22, left: 26, fontFamily: FONT, fontWeight: 800, fontSize: 34, color }}>{i ? 'B' : 'A'}</div>
              <div style={{ width: wide ? 150 : 160, height: wide ? 150 : 160, borderRadius: '50%', background: tint(color, 0.12), display: 'grid', placeItems: 'center' }}>
                <Icon name={s.icon || (i ? 'Moon' : 'Sun')} size={wide ? 80 : 86} color={color} stroke={2} />
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(s.name, wide ? 52 : 50), color: INK, textAlign: 'center', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{clean(s.name)}</div>
              {share !== null && (
                <div style={{ width: '82%' }}>
                  <div style={{ height: 18, borderRadius: 9, background: 'rgba(20,26,36,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${share * fill}%`, height: '100%', borderRadius: 9, background: color }} />
                  </div>
                  <div style={{ marginTop: 10, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 44, color }}>{Math.round(share * fill)}%</div>
                </div>
              )}
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: width / 2 - 55, top: top + H / 2 - 55, width: 110, height: 110, borderRadius: 55, background: INK, color: '#FFFFFF', display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 40, transform: `scale(${vs}) rotate(${(1 - vs) * -90}deg)`, boxShadow: SHADOW }}>VS</div>
        {pct === null && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: top + H + (wide ? 36 : 50), display: 'flex', justifyContent: 'center', opacity: interpolate(frame, [36, 48], [0, 1], clamp) }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '16px 32px', borderRadius: 999, ...card(999), fontFamily: FONT, fontWeight: 700, fontSize: wide ? 34 : 38, color: INK }}>
              <Icon name="MessageCircle" size={wide ? 36 : 40} color={P.a} stroke={2.4} />
              {clean(scene.prompt) || 'Comment A or B'}
            </div>
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

// ── Review wall: the rating counts up, real reviews fly in round it ─────────
const REVIEW_SPOTS_TALL = [[0.5, 0.17], [0.27, 0.62], [0.73, 0.68], [0.5, 0.7]]
const REVIEW_SPOTS_WIDE = [[0.22, 0.27], [0.78, 0.25], [0.2, 0.68], [0.8, 0.67]]

function makeReviews(P, Bg) {
  return function Reviews({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const cards = (scene.cards || []).slice(0, wide ? 4 : 3)
    const rating = Number(scene.rating) > 0 ? Math.min(5, Number(scene.rating)) : null
    const count = interpolate(frame, [6, 40], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const hub = spring({ frame, fps, config: { damping: 13 } })
    const spots = wide ? REVIEW_SPOTS_WIDE : REVIEW_SPOTS_TALL
    const cw = wide ? 520 : 600
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {/* the score in the middle */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: wide ? 330 : 640, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, transform: `scale(${hub})` }}>
          {scene.title && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 34 : 38, letterSpacing: 3, color: SUB, textTransform: 'uppercase' }}>{clean(scene.title)}</div>}
          {rating !== null && <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 170 : 190, lineHeight: 1, letterSpacing: '-0.04em', color: INK }}>{(rating * count).toFixed(1)}</div>}
          <Stars value={rating ?? 5} size={wide ? 58 : 64} fill={count} />
          {scene.count && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 30 : 34, color: SUB }}>{clean(scene.count)}</div>}
        </div>
        {cards.map((c, i) => {
          const [fx, fy] = spots[i]
          const s = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 14 } })
          const tilt = [-3, 2.5, -2, 3][i]
          return (
            <div key={i} style={{ position: 'absolute', left: fx * width, top: fy * height, width: cw, ...card(28), padding: '26px 30px', transform: `translate(-50%, -50%) translateY(${(1 - s) * 80}px) rotate(${tilt}deg) scale(${0.9 + 0.1 * s})`, opacity: s }}>
              <Stars value={c.stars || 5} size={30} />
              <div style={{ marginTop: 12, fontFamily: FONT, fontWeight: 600, fontSize: fitSize(c.text, wide ? 30 : 32), color: INK, lineHeight: 1.4 }}>“{clean(c.text)}”</div>
              {c.name && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontWeight: 600, fontSize: 24, color: SUB }}>
                  <span style={{ width: 40, height: 40, borderRadius: 20, background: tint(P.a, 0.18), display: 'grid', placeItems: 'center', color: P.a, fontWeight: 800, fontSize: 20 }}>{[...clean(c.name)][0]}</span>
                  {clean(c.name)}
                  <Icon name="BadgeCheck" size={24} color={P.b} stroke={2.4} />
                </div>
              )}
            </div>
          )
        })}
      </AbsoluteFill>
    )
  }
}

/** "Trusted by": the names sliding past in two rows, the title above. */
function makeLogos(P, Bg) {
  return function Logos({ scene }) {
    const frame = useCurrentFrame()
    const { width, height } = useVideoConfig()
    const wide = width > height
    const names = (scene.names || []).map(clean).filter(Boolean)
    const rows = [names.filter((_, i) => i % 2 === 0), names.filter((_, i) => i % 2 === 1)].filter((r) => r.length)
    const fade = 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)'
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 210 : 420 }}>
          <Sharpen text={scene.title || 'Trusted by'} P={P} size={fitSize(scene.title || 'Trusted by', wide ? 80 : 84)} />
        </div>
        {rows.map((row, r) => {
          const loop = [...row, ...row, ...row, ...row]
          const shift = ((frame * (r ? -3 : 3)) % 1200) - (r ? 0 : 1200)
          return (
            <div key={r} style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 460 : 760) + r * (wide ? 150 : 180), height: wide ? 110 : 130, overflow: 'hidden', maskImage: fade, WebkitMaskImage: fade }}>
              <div style={{ position: 'absolute', top: 0, left: shift, display: 'flex', gap: 24, whiteSpace: 'nowrap' }}>
                {loop.map((nm, i) => (
                  <div key={i} style={{ ...card(24), height: wide ? 104 : 124, padding: '0 40px', display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 38 : 44, letterSpacing: '-0.01em', color: '#3A4554' }}>
                    <span style={{ width: wide ? 36 : 42, height: wide ? 36 : 42, borderRadius: 10, background: `linear-gradient(135deg, ${tint(P.a, 0.85)}, ${tint(P.b, 0.85)})` }} />
                    {nm}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 460 : 760) + rows.length * (wide ? 150 : 180) + 10, height: 2 }} />
      </AbsoluteFill>
    )
  }
}

// ── Tip cards: a numbered card flips onto the stack ─────────────────────────
function makeTip(P, Bg) {
  return function Tip({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const n = scene.n || 1
    const of = Math.max(n, scene.of || n)
    const flip = spring({ frame, fps, config: { damping: 16 } })
    const W = wide ? 1100 : 940
    const H = wide ? 600 : 900
    const left = (width - W) / 2
    const top = wide ? 200 : 430
    return (
      <AbsoluteFill style={{ perspective: 2400 }}>
        <Bg P={P} />
        {/* the tips already given, stacked behind */}
        {[...Array(Math.min(3, n - 1))].map((_, k) => (
          <div key={k} style={{ position: 'absolute', left, top, width: W, height: H, ...card(40), transform: `translate(${(k + 1) * 16}px, ${-(k + 1) * 22}px) rotate(${(k + 1) * 1.6}deg)`, opacity: 0.9 - k * 0.2 }} />
        ))}
        <div style={{ position: 'absolute', left, top, width: W, height: H, ...card(40), padding: wide ? '50px 60px' : '64px 60px', display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 50 : 40, alignItems: wide ? 'center' : 'flex-start', transformOrigin: 'left center', transform: `rotateY(${(1 - flip) * -70}deg) translateX(${(1 - flip) * 200}px)`, opacity: Math.min(1, flip * 1.5) }}>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 30 : 34, letterSpacing: 4, color: P.a }}>
              TIP {String(n).padStart(2, '0')}
              <span style={{ color: 'rgba(20,26,36,0.3)' }}> / {String(of).padStart(2, '0')}</span>
            </div>
            <IconTile P={P} name={scene.icon} size={wide ? 150 : 140} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Sharpen text={scene.title} P={P} size={fitSize(scene.title, wide ? 70 : 74)} delay={8} align="left" />
            {scene.text && (
              <div style={{ marginTop: 22, fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, wide ? 40 : 44), color: SUB, lineHeight: 1.5, opacity: interpolate(frame, [22, 36], [0, 1], clamp) }}>{clean(scene.text)}</div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

/** "Save this": the bookmark fills, the hand taps the Save button, a toast. */
function makeSave(P, Bg) {
  return function Save({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const B = wide ? 260 : 300
    const tapAt = 40
    const pop = spring({ frame, fps, config: { damping: 12 } })
    const handIn = interpolate(frame, [tapAt - 20, tapAt - 3], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const press = interpolate(frame, [tapAt - 3, tapAt, tapAt + 6], [1, 0.9, 1], clamp)
    const fill = interpolate(frame, [tapAt, tapAt + 14], [0, 1], clamp)
    const toast = spring({ frame: frame - tapAt - 8, fps, config: { damping: 12 } })
    const btnW = wide ? 380 : 420
    const btnH = wide ? 100 : 112
    const btnTop = wide ? 700 : 1060
    const bx = width / 2
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', left: width / 2 - B / 2, top: wide ? 150 : 330, width: B, height: B, transform: `scale(${pop * (1 + 0.12 * Math.sin(fill * Math.PI))})` }}>
          <svg width={B} height={B} viewBox="0 0 24 24">
            <defs>
              <linearGradient id="bm-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset={fill} stopColor={P.a} />
                <stop offset={fill} stopColor="#FFFFFF" />
              </linearGradient>
            </defs>
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" fill="url(#bm-fill)" stroke={P.a} strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ position: 'absolute', left: wide ? 240 : 60, right: wide ? 240 : 60, top: wide ? 450 : 740 }}>
          <Sharpen text={scene.text} P={P} size={fitSize(scene.text, wide ? 76 : 80)} delay={6} />
        </div>
        <div style={{ position: 'absolute', left: bx - btnW / 2, top: btnTop, width: btnW, height: btnH, borderRadius: 999, background: frame >= tapAt ? `linear-gradient(135deg, ${P.a}, ${P.b})` : '#FFFFFF', boxShadow: SHADOW, border: `3px solid ${P.a}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 42 : 46, color: frame >= tapAt ? '#FFFFFF' : P.a, transform: `scale(${press})`, opacity: pop }}>
          <Icon name="Bookmark" size={wide ? 40 : 44} color={frame >= tapAt ? '#FFFFFF' : P.a} stroke={2.6} />
          {clean(scene.button) || 'Save'}
        </div>
        <Hand x={interpolate(handIn, [0, 1], [bx + 360, bx + 40])} y={interpolate(handIn, [0, 1], [btnTop + 420, btnTop + btnH / 2])} press={press} opacity={handIn > 0 ? 1 : 0} size={wide ? 120 : 140} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: btnTop - (wide ? 90 : 110), display: 'flex', justifyContent: 'center', opacity: toast, transform: `translateY(${(1 - toast) * 20}px)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 26px', borderRadius: 999, background: INK, color: '#FFFFFF', fontFamily: FONT, fontWeight: 700, fontSize: wide ? 28 : 30 }}>
            <Icon name="CircleCheck" size={30} color="#34D399" stroke={2.6} />
            Saved
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

export function countdownScenes(P, Bg) {
  return { rank: makeRank(P, Bg) }
}
export function choiceScenes(P, Bg) {
  return { choice: makeChoice(P, Bg) }
}
export function reviewScenes(P, Bg) {
  return { reviews: makeReviews(P, Bg), logos: makeLogos(P, Bg) }
}
export function tipScenes(P, Bg) {
  return { tip: makeTip(P, Bg), save: makeSave(P, Bg) }
}
