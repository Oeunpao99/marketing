/**
 * Testimonial (Trust): a customer's story — who they are, life before, life
 * after, the result in a number, and (only with their real words in the
 * brief) their review. Warm cream and gold. Script fields come from
 * app/motion.py TESTIMONIAL_PROMPT.
 *
 *   { type: "hook",        text, icon? }
 *   { type: "customer",    name, business, text, mood? }   who they are
 *   { type: "beforeafter", title?, before, after }          the change
 *   { type: "result",      value, prefix?, suffix?, label } the number
 *   { type: "review",      text, name, stars? }             their real words
 *   { type: "cta",         text, button }
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf } from './shared'
import { StickFigure } from './explainer'

const T = { bg: '#FBF6EE', card: '#FFFFFF', ink: '#1F1A14', sub: '#6B6258', gold: '#E9A93A', goldSoft: '#FBEBCB', green: '#2E9E6A', greenSoft: '#DDF1E5', grey: '#ECE6DC' }

function Warm() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ backgroundColor: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -160, top: 260 + Math.sin(frame / 40) * 12, width: 520, height: 520, borderRadius: 260, background: T.goldSoft }} />
      <div style={{ position: 'absolute', left: -200, bottom: 160, width: 560, height: 560, borderRadius: 280, background: T.greenSoft, opacity: 0.7 }} />
      <NeatGrid color="rgba(31,26,20,0.055)" />
    </AbsoluteFill>
  )
}

function Stars({ n = 5, delay = 0, size = 64 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const s = spring({ frame: frame - delay - i * 5, fps, config: { damping: 9 } })
        return (
          <div key={i} style={{ transform: `scale(${s})` }}>
            <svg width={size} height={size} viewBox="0 0 24 24">
              <path
                d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"
                fill={i < n ? T.gold : 'none'}
                stroke={T.gold}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )
      })}
    </div>
  )
}

function TsHook({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Warm />
      <div style={{ position: 'absolute', top: 360, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${s})`, width: 200, height: 200, borderRadius: 100, background: T.gold, display: 'grid', placeItems: 'center' }}>
          <Icon name={scene.icon || 'Heart'} size={110} color="white" stroke={2.2} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 660, left: 70, right: 70 }}>
        <Words text={scene.text} delay={4} align="center" color={T.ink} style={{ fontSize: fitSize(scene.text, 92), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
      </div>
    </AbsoluteFill>
  )
}

/** Who they are: the person, a name tag, their situation. */
function TsCustomer({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tag = spring({ frame: frame - 12, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill>
      <Warm />
      <StickFigure mood={scene.mood || 'thinking'} x={540} y={760} scale={1.05} color={T.ink} />
      <div style={{ position: 'absolute', top: 800, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${tag})`, background: T.card, border: `5px solid ${T.ink}`, borderRadius: 30, padding: '16px 34px', textAlign: 'center' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, letterSpacing: '-0.012em', fontSize: 56, color: T.ink }}>{clean(scene.name)}</div>
          {scene.business && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: T.sub }}>{clean(scene.business)}</div>}
        </div>
      </div>
      {scene.text && (
        <div style={{ position: 'absolute', top: 1030, left: 80, right: 80 }}>
          <Words text={scene.text} delay={18} align="center" color={T.ink} style={{ fontSize: fitSize(scene.text, 58), fontWeight: 600, textAlign: 'center', lineHeight: 1.35 }} />
        </div>
      )}
    </AbsoluteFill>
  )
}

/** Before (grey, ✗) — an arrow — after (green, ✓). */
function TsBeforeAfter({ scene }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const before = spring({ frame: frame - 2, fps, config: { damping: 13 } })
  const afterAt = Math.min(40, Math.round(durationInFrames * 0.35))
  const arrow = interpolate(frame, [afterAt - 12, afterAt], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const after = spring({ frame: frame - afterAt, fps, config: { damping: 11 } })
  const box = (label, text, s, good) => (
    <div
      style={{
        margin: '0 70px',
        background: good ? T.greenSoft : T.grey,
        border: `5px solid ${good ? T.green : '#B9AE9E'}`,
        borderRadius: 36,
        padding: '26px 36px 32px',
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px) scale(${good ? 0.96 + 0.04 * s : 1})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <Icon name={good ? 'CircleCheck' : 'CircleX'} size={46} color={good ? T.green : '#8C8172'} stroke={2.6} />
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 38, color: good ? T.green : '#8C8172', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(text, 58), color: T.ink, lineHeight: 1.35 }}>{clean(text)}</div>
    </div>
  )
  return (
    <AbsoluteFill>
      <Warm />
      {scene.title && (
        <div style={{ position: 'absolute', top: 210, left: 70, right: 70 }}>
          <Words text={scene.title} align="center" color={T.ink} style={{ fontSize: fitSize(scene.title, 64), fontWeight: 700, textAlign: 'center' }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: 380, left: 0, right: 0 }}>
        {box('BEFORE', scene.before, before, false)}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0', opacity: arrow, transform: `translateY(${(1 - arrow) * -20}px)` }}>
          <Icon name="ArrowDown" size={84} color={T.gold} stroke={3} />
        </div>
        {box('AFTER', scene.after, after, true)}
      </div>
    </AbsoluteFill>
  )
}

/** The result: a number counting up on a gold badge. */
function TsResult({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 11 } })
  const value = Number(scene.value) || 0
  const shown = interpolate(frame, [8, 50], [0, value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const digits = Number.isInteger(value) ? Math.round(shown).toLocaleString('en-US') : shown.toFixed(1)
  return (
    <AbsoluteFill>
      <Warm />
      <div style={{ position: 'absolute', top: 420, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${s})`, width: 560, height: 560, borderRadius: 280, background: T.gold, display: 'grid', placeItems: 'center', boxShadow: '0 30px 70px rgba(233,169,58,0.35)' }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 170, color: 'white', letterSpacing: -2 }}>
            {scene.prefix || ''}
            {digits}
            {scene.suffix || ''}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1050, left: 80, right: 80 }}>
        <Words text={scene.label} delay={14} align="center" color={T.ink} style={{ fontSize: fitSize(scene.label, 68), fontWeight: 700, textAlign: 'center' }} />
      </div>
    </AbsoluteFill>
  )
}

/** The customer's real words: stars, the quote on a card, who said it. */
function TsReview({ scene }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const card = spring({ frame: frame - 4, fps, config: { damping: 13 } })
  const who = interpolate(frame, [40, 58], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Warm />
      <div style={{ position: 'absolute', top: 330, left: 0, right: 0 }}>
        <Stars n={Math.max(1, Math.min(5, Number(scene.stars) || 5))} delay={6} size={86} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 500,
          left: 70,
          right: 70,
          background: T.card,
          borderRadius: 40,
          padding: '50px 46px 44px',
          boxShadow: '0 20px 60px rgba(31,26,20,0.12)',
          opacity: card,
          transform: `translateY(${(1 - card) * 50}px)`,
        }}
      >
        <div style={{ position: 'absolute', top: -40, left: 40, fontFamily: 'Georgia, serif', fontSize: 200, lineHeight: 1, color: T.gold }}>“</div>
        <Words text={scene.text} delay={14} stagger={2} color={T.ink} style={{ fontSize: fitSize(scene.text, 62), fontWeight: 600, lineHeight: 1.45 }} />
        {scene.name && (
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 16, opacity: who }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, background: T.goldSoft, border: `4px solid ${T.gold}`, display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 30, color: T.ink }}>
              {clean(scene.name).slice(0, 1)}
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: T.sub }}>{clean(scene.name)}</div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

function TsCta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = spring({ frame: frame - 22, fps, config: { damping: 11 } })
  return (
    <AbsoluteFill>
      <Warm />
      {brand.logo && (
        <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'white', border: `5px solid ${T.ink}`, borderRadius: 5, padding: '22px 36px' }}>
            <Img src={srcOf(brand.logo)} style={{ height: 110, objectFit: 'contain' }} />
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', top: brand.logo ? 610 : 520, left: 70, right: 70 }}>
        <Words text={scene.text} delay={2} align="center" color={T.ink} style={{ fontSize: fitSize(scene.text, 90), fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }} />
        {/* the button follows the text, however many lines it wraps to */}
        {scene.button && (
          <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: T.green, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: 54, padding: '24px 58px', borderRadius: 999, transform: `scale(${b})`, opacity: b }}>
              <Icon name="MessageCircle" size={48} color="white" stroke={2.4} />
              {clean(scene.button)}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

export const TESTIMONIAL = {
  scenes: { hook: TsHook, customer: TsCustomer, beforeafter: TsBeforeAfter, result: TsResult, review: TsReview, cta: TsCta },
  root: { backgroundColor: T.bg, '--hl-bg': T.gold, '--hl-text': T.ink },
  light: true,
  captionTop: 1430,
  noCaption: ['review'], // the review's words are on screen already
}
