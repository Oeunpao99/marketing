/**
 * The clean goal templates, batch 2 (see clean.jsx for the look):
 *
 *   hottake     { type: "take", before?, text }                          the common belief struck out, the take slams in
 *               + clean.jsx's choice (agree / disagree)
 *   casestudy   { type: "client", name, field?, text, example? }          who, and the problem they had
 *               { type: "metrics", title?, rows: [{ label, before, after, prefix?, suffix? }] }   before → after, counting
 *               { type: "timeline", title?, steps: [{ when, text }] }    the line draws, step by step
 *               { type: "quote", text, author?, role? }                  one quote card
 *   faq         { type: "qa", n, of, q, a }                              the question pops in, the answer types itself
 *   report      { type: "bars", title?, data: [{ label, value }], prefix?, suffix?, source? }  bars grow, the top one lit
 *               { type: "donut", value, label, source? }                 a ring fills to a percent
 *
 * build_props numbers qa (Q1 of 3). Every scene lays itself out for 9:16 and 16:9.
 */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Sharpen } from './clarity'
import { INK, IconTile, SHADOW, SUB, card } from './clean'
import { FONT, Icon, clean, fitSize, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
// whole numbers stay whole while they count up (the target decides, not the frame)
const fmt = (n, prefix = '', suffix = '', whole = Number.isInteger(n)) => `${prefix}${whole ? Math.round(n).toLocaleString('en-US') : n.toFixed(1)}${suffix}`
const letters = (text) => {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean(text))].map((s) => s.segment)
  } catch {
    return [...clean(text)]
  }
}

// ── Hot take: the belief everyone has, struck out — then the take ──────────
function makeTake(P, Bg) {
  return function Take({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const pill = spring({ frame, fps, config: { damping: 12 } })
    const has = Boolean(scene.before)
    const strike = interpolate(frame, [16, 28], [0, 1], { ...clamp, easing: ease })
    const drop = interpolate(frame, [34, 46], [0, 1], clamp)
    const start = has ? 40 : 8
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ paddingTop: wide ? 160 : 300, paddingBottom: wide ? 220 : 470, paddingLeft: wide ? 200 : 64, paddingRight: wide ? 200 : 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: wide ? 34 : 44 }}>
          <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 26px', borderRadius: 999, background: P.a, color: '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 30 : 34, letterSpacing: 3, transform: `scale(${pill}) rotate(${(1 - pill) * -8}deg)`, transformOrigin: 'left center' }}>
            <Icon name="Flame" size={wide ? 32 : 36} color="#FFFFFF" stroke={2.4} />
            {clean(scene.kicker) || 'HOT TAKE'}
          </div>
          {has && (
            <div style={{ position: 'relative', alignSelf: 'flex-start', fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.before, wide ? 60 : 62), color: 'rgba(20,26,36,0.45)', lineHeight: 1.3, opacity: 1 - drop, transform: `translateY(${drop * 30}px)`, maxHeight: (1 - drop) * 400, overflow: 'hidden' }}>
              {clean(scene.before)}
              <span style={{ position: 'absolute', left: -6, right: -6, top: '52%', height: 8, borderRadius: 4, background: P.a, transform: `scaleX(${strike})`, transformOrigin: 'left center' }} />
            </div>
          )}
          {frame >= start - 2 && <Sharpen text={scene.text} P={P} size={fitSize(scene.text, wide ? 120 : 116)} delay={start} align="left" />}
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

// ── Case study: the client, the numbers before → after, the road, the quote ─
function makeClient(P, Bg) {
  return function Client({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const s = spring({ frame, fps, config: { damping: 14 } })
    const body = interpolate(frame, [18, 32], [0, 1], clamp)
    const A = wide ? 150 : 170
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', ...(wide ? { left: 260, right: 260, top: 200 } : { left: 60, right: 60, top: 470 }), ...card(40), padding: wide ? '50px 60px' : '60px 54px', opacity: s, transform: `translateY(${(1 - s) * 80}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            <div style={{ flex: 'none', width: A, height: A, borderRadius: A * 0.3, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 800, fontSize: A * 0.46, color: '#FFFFFF' }}>{letters(scene.name)[0] || '•'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ padding: '6px 18px', borderRadius: 999, background: tint(P.a, 0.12), color: P.a, fontFamily: FONT, fontWeight: 800, fontSize: 24, letterSpacing: 2 }}>CASE STUDY</span>
                {scene.example && <span style={{ padding: '6px 18px', borderRadius: 999, background: 'rgba(20,26,36,0.07)', color: SUB, fontFamily: FONT, fontWeight: 700, fontSize: 24, letterSpacing: 2 }}>EXAMPLE</span>}
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.name, wide ? 64 : 62), color: INK, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{clean(scene.name)}</div>
              {scene.field && <div style={{ marginTop: 6, fontFamily: FONT, fontWeight: 600, fontSize: wide ? 30 : 32, color: SUB }}>{clean(scene.field)}</div>}
            </div>
          </div>
          <div style={{ marginTop: 40, paddingTop: 34, borderTop: '2px solid rgba(20,26,36,0.07)', opacity: body, transform: `translateY(${(1 - body) * 20}px)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontWeight: 800, fontSize: 26, letterSpacing: 3, color: '#E5533D', marginBottom: 14 }}>
              <Icon name="TriangleAlert" size={30} color="#E5533D" stroke={2.4} />
              THE CHALLENGE
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: fitSize(scene.text, wide ? 50 : 56), color: INK, lineHeight: 1.45 }}>{clean(scene.text)}</div>
          </div>
        </div>
      </AbsoluteFill>
    )
  }
}

function makeMetrics(P, Bg) {
  return function Metrics({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const items = (scene.rows || []).slice(0, 3)
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 150 : 280 }}>
            <Sharpen text={scene.title} P={P} size={fitSize(scene.title, wide ? 70 : 72)} />
          </div>
        )}
        <div style={{ position: 'absolute', ...(wide ? { left: 160, right: 160, top: 320 } : { left: 60, right: 60, top: 500 }), display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 30 : 30 }}>
          {items.map((m, i) => {
            const s = spring({ frame: frame - 8 - i * 8, fps, config: { damping: 14 } })
            const grow = interpolate(frame, [18 + i * 8, 52 + i * 8], [0, 1], { ...clamp, easing: ease })
            const b = Number(m.before) || 0
            const a = Number(m.after) || 0
            const top = Math.max(Math.abs(a), Math.abs(b), 1)
            const up = a >= b
            const delta = b ? Math.round(((a - b) / Math.abs(b)) * 100) : null
            return (
              <div key={i} style={{ flex: 1, ...card(32), padding: wide ? '30px 32px' : '30px 36px', opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 30 : 34, color: SUB }}>{clean(m.label)}</div>
                  {delta !== null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 999, background: tint(up ? '#10B981' : '#E5533D', 0.12), color: up ? '#059669' : '#C2410C', fontFamily: FONT, fontWeight: 800, fontSize: 26, opacity: grow }}>
                      <Icon name={up ? 'TrendingUp' : 'TrendingDown'} size={24} color={up ? '#059669' : '#C2410C'} stroke={2.6} />
                      {delta > 0 ? '+' : ''}
                      {delta}%
                    </span>
                  )}
                </div>
                {[
                  ['Before', b, 'rgba(20,26,36,0.18)', SUB],
                  ['After', a, P.a, INK],
                ].map(([tag, v, color, ink], k) => (
                  <div key={tag} style={{ marginTop: k ? 14 : 22, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ width: wide ? 90 : 100, fontFamily: FONT, fontWeight: 700, fontSize: 24, color: SUB, letterSpacing: 1 }}>{tag.toUpperCase()}</span>
                    <div style={{ flex: 1, height: wide ? 26 : 30, borderRadius: 15, background: 'rgba(20,26,36,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${(Math.abs(v) / top) * 100 * (k ? grow : Math.min(1, grow * 2))}%`, height: '100%', borderRadius: 15, background: color }} />
                    </div>
                    <span style={{ minWidth: wide ? 150 : 170, textAlign: 'right', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 38 : 42, color: ink }}>{fmt(v * (k ? grow : 1), m.prefix, m.suffix, Number.isInteger(v))}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    )
  }
}

function makeTimeline(P, Bg) {
  return function Timeline({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const steps = (scene.steps || []).slice(0, 4)
    const n = Math.max(1, steps.length)
    const draw = interpolate(frame, [8, 8 + n * 14], [0, 1], clamp)
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 150 : 280 }}>
            <Sharpen text={scene.title} P={P} size={fitSize(scene.title, wide ? 70 : 72)} />
          </div>
        )}
        {wide ? (
          <div style={{ position: 'absolute', left: 180, right: 180, top: 420 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 6, borderRadius: 3, background: 'rgba(20,26,36,0.08)' }}>
              <div style={{ width: `${draw * 100}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${P.a}, ${P.b})` }} />
            </div>
            <div style={{ display: 'flex' }}>
              {steps.map((st, i) => {
                const s = spring({ frame: frame - 8 - i * 14, fps, config: { damping: 12 } })
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 16px', opacity: s }}>
                    <span style={{ width: 66, height: 66, borderRadius: 33, background: '#FFFFFF', border: `6px solid ${P.a}`, transform: `scale(${s})`, boxShadow: SHADOW }} />
                    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 30, color: P.a, letterSpacing: 1 }}>{clean(st.when)}</div>
                    <div style={{ ...card(24), padding: '20px 22px', fontFamily: FONT, fontWeight: 600, fontSize: fitSize(st.text, 32), color: INK, lineHeight: 1.35, textAlign: 'center', transform: `translateY(${(1 - s) * 30}px)` }}>{clean(st.text)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 90, right: 60, top: 470 }}>
            <div style={{ position: 'absolute', left: 30, top: 30, width: 6, height: (n - 1) * 230 * draw, borderRadius: 3, background: `linear-gradient(180deg, ${P.a}, ${P.b})` }} />
            {steps.map((st, i) => {
              const s = spring({ frame: frame - 8 - i * 14, fps, config: { damping: 12 } })
              return (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 230, display: 'flex', gap: 30, alignItems: 'flex-start', opacity: s }}>
                  <span style={{ flex: 'none', width: 66, height: 66, borderRadius: 33, background: '#FFFFFF', border: `6px solid ${P.a}`, transform: `scale(${s})`, boxShadow: SHADOW }} />
                  <div style={{ flex: 1, transform: `translateX(${(1 - s) * 60}px)` }}>
                    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 32, color: P.a, letterSpacing: 1 }}>{clean(st.when)}</div>
                    <div style={{ marginTop: 6, fontFamily: FONT, fontWeight: 600, fontSize: fitSize(st.text, 42), color: INK, lineHeight: 1.35 }}>{clean(st.text)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </AbsoluteFill>
    )
  }
}

function makeQuoteCard(P, Bg) {
  return function QuoteCard({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const s = spring({ frame, fps, config: { damping: 14 } })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', ...(wide ? { left: 280, right: 280, top: 200 } : { left: 60, right: 60, top: 440 }), ...card(40), padding: wide ? '60px 70px' : '64px 56px', opacity: s, transform: `scale(${0.94 + 0.06 * s})` }}>
          <Icon name="Quote" size={wide ? 80 : 90} color={tint(P.a, 0.85)} stroke={2} />
          <div style={{ marginTop: 18 }}>
            <Sharpen text={`“${clean(scene.text)}”`} P={P} size={fitSize(scene.text, wide ? 60 : 68)} delay={6} align="left" />
          </div>
          {scene.author && (
            <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', gap: 18, opacity: interpolate(frame, [24, 36], [0, 1], clamp) }}>
              <span style={{ width: 70, height: 70, borderRadius: 35, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', color: '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: 32 }}>{letters(scene.author)[0]}</span>
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, color: INK }}>{clean(scene.author)}</div>
                {scene.role && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 26, color: SUB }}>{clean(scene.role)}</div>}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    )
  }
}

// ── FAQ: the question pops in, the answer types itself ─────────────────────
function makeQA(P, Bg) {
  return function QA({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const q = spring({ frame, fps, config: { damping: 13 } })
    const typeFrom = 22
    const ch = letters(scene.a)
    const per = Math.max(0.35, Math.min(1.2, (durationInFrames * 0.55) / Math.max(1, ch.length)))
    const shown = Math.max(0, Math.min(ch.length, Math.floor((frame - typeFrom) / per)))
    const typing = frame >= 12 && frame < typeFrom
    const W = wide ? 1300 : 960
    const left = (width - W) / 2
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', left, width: W, top: wide ? 150 : 300, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 30 : 32, letterSpacing: 4, color: P.a }}>
            QUESTION {scene.n || 1}
            <span style={{ color: 'rgba(20,26,36,0.3)' }}> / {scene.of || 1}</span>
          </div>
          {/* the question: a chat bubble from the viewer */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '86%', display: 'flex', gap: 18, alignItems: 'flex-end', opacity: q, transform: `translateY(${(1 - q) * 40}px) scale(${0.9 + 0.1 * q})`, transformOrigin: 'left bottom' }}>
            <span style={{ flex: 'none', width: 70, height: 70, borderRadius: 35, background: 'rgba(20,26,36,0.08)', display: 'grid', placeItems: 'center' }}>
              <Icon name="CircleHelp" size={40} color={SUB} stroke={2.2} />
            </span>
            <div style={{ ...card(34), borderBottomLeftRadius: 8, padding: wide ? '26px 34px' : '28px 34px', fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.q, wide ? 54 : 60), color: INK, lineHeight: 1.35 }}>{clean(scene.q)}</div>
          </div>
          {/* the answer: the brand's bubble, typed in */}
          {frame >= 12 && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '88%', display: 'flex', gap: 18, alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
              <span style={{ flex: 'none', width: 70, height: 70, borderRadius: 35, background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', color: '#FFFFFF', fontFamily: FONT, fontWeight: 800, fontSize: 30 }}>{letters(brand.name)[0]}</span>
              <div style={{ borderRadius: 34, borderBottomRightRadius: 8, padding: wide ? '26px 34px' : '28px 34px', background: P.a, color: '#FFFFFF', fontFamily: FONT, fontWeight: 600, fontSize: fitSize(scene.a, wide ? 46 : 54), lineHeight: 1.45, boxShadow: `0 20px 40px ${tint(P.a, 0.25)}`, minWidth: 140 }}>
                {typing ? (
                  <span style={{ display: 'inline-flex', gap: 10, padding: '10px 4px' }}>
                    {[0, 1, 2].map((k) => (
                      <span key={k} style={{ width: 14, height: 14, borderRadius: 7, background: '#FFFFFF', opacity: 0.4 + 0.6 * Math.abs(Math.sin((frame + k * 5) / 5)) }} />
                    ))}
                  </span>
                ) : (
                  <>
                    {ch.slice(0, shown).join('')}
                    {shown < ch.length && <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0.2 : 1 }}>▍</span>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    )
  }
}

// ── Data report: bars grow and count, a ring fills ─────────────────────────
function makeBars(P, Bg) {
  return function Bars({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const items = (scene.data || []).slice(0, 6)
    const max = Math.max(...items.map((x) => Math.abs(Number(x.value) || 0)), 1)
    const best = items.reduce((k, x, i) => (Number(x.value) > Number(items[k]?.value) ? i : k), 0)
    const rowH = wide ? 84 : 112
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {scene.title && (
          <div style={{ position: 'absolute', left: wide ? 200 : 60, right: wide ? 200 : 60, top: wide ? 150 : 280 }}>
            <Sharpen text={scene.title} P={P} size={fitSize(scene.title, wide ? 70 : 72)} />
          </div>
        )}
        <div style={{ position: 'absolute', ...(wide ? { left: 220, right: 220, top: 300 } : { left: 60, right: 60, top: 500 }), ...card(36), padding: wide ? '34px 44px' : '40px 40px' }}>
          {items.map((x, i) => {
            const grow = interpolate(frame, [10 + i * 6, 44 + i * 6], [0, 1], { ...clamp, easing: ease })
            const v = Number(x.value) || 0
            const lit = i === best
            return (
              <div key={i} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 22 }}>
                <span style={{ width: wide ? 260 : 230, fontFamily: FONT, fontWeight: lit ? 800 : 600, fontSize: wide ? 30 : 32, color: lit ? INK : SUB, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(x.label)}</span>
                <div style={{ flex: 1, height: rowH * 0.46, borderRadius: 14, background: 'rgba(20,26,36,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${(Math.abs(v) / max) * 100 * grow}%`, height: '100%', borderRadius: 14, background: lit ? `linear-gradient(90deg, ${P.a}, ${P.b})` : tint(P.a, 0.3) }} />
                </div>
                <span style={{ minWidth: wide ? 150 : 160, textAlign: 'right', fontFamily: FONT, fontWeight: 800, fontSize: wide ? 36 : 40, color: lit ? P.a : INK }}>{fmt(v * grow, scene.prefix, scene.suffix, Number.isInteger(v))}</span>
              </div>
            )
          })}
          {scene.source && <div style={{ marginTop: 16, fontFamily: FONT, fontWeight: 500, fontSize: 22, color: SUB, opacity: interpolate(frame, [40, 52], [0, 1], clamp) }}>Source: {clean(scene.source)}</div>}
        </div>
      </AbsoluteFill>
    )
  }
}

function makeDonut(P, Bg) {
  return function Donut({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const value = Math.max(0, Math.min(100, Number(scene.value) || 0))
    const fill = interpolate(frame, [8, 48], [0, 1], { ...clamp, easing: ease })
    const s = spring({ frame, fps, config: { damping: 14 } })
    const D = wide ? 520 : 600
    const R = D / 2 - 30
    const C = 2 * Math.PI * R
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <div style={{ position: 'absolute', ...(wide ? { left: 220, top: 230 } : { left: (width - D) / 2, top: 340 }), width: D, height: D, transform: `scale(${0.9 + 0.1 * s})`, opacity: s }}>
          <svg width={D} height={D} style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              <linearGradient id="donut" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={P.a} />
                <stop offset="1" stopColor={P.b} />
              </linearGradient>
            </defs>
            <circle cx={D / 2} cy={D / 2} r={R} fill="none" stroke="rgba(20,26,36,0.07)" strokeWidth="44" />
            <circle cx={D / 2} cy={D / 2} r={R} fill="none" stroke="url(#donut)" strokeWidth="44" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (value / 100) * fill)} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 800, fontSize: D * 0.26, letterSpacing: '-0.04em', color: INK }}>
            {Math.round(value * fill)}%
          </div>
        </div>
        <div style={{ position: 'absolute', ...(wide ? { left: 860, right: 160, top: 300, height: 380 } : { left: 60, right: 60, top: 1000 }), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          <Sharpen text={scene.label} P={P} size={fitSize(scene.label, wide ? 70 : 68)} delay={14} align={wide ? 'left' : 'center'} />
          {scene.source && <div style={{ textAlign: wide ? 'left' : 'center', fontFamily: FONT, fontWeight: 500, fontSize: 24, color: SUB, opacity: interpolate(frame, [36, 48], [0, 1], clamp) }}>Source: {clean(scene.source)}</div>}
        </div>
      </AbsoluteFill>
    )
  }
}

export function takeScenes(P, Bg) {
  return { take: makeTake(P, Bg) }
}
export function caseScenes(P, Bg) {
  return { client: makeClient(P, Bg), metrics: makeMetrics(P, Bg), timeline: makeTimeline(P, Bg), quote: makeQuoteCard(P, Bg) }
}
export function faqScenes(P, Bg) {
  return { qa: makeQA(P, Bg) }
}
export function reportScenes(P, Bg) {
  return { bars: makeBars(P, Bg), donut: makeDonut(P, Bg) }
}
