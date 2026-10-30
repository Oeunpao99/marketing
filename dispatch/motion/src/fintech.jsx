/**
 * Fintech · Wallet & Card — after a crypto-app product film the user liked
 * (2026-10-29): a dark 3D wallet on a white stage with the balances rising out
 * of it and gold coins spinning in the air; a black card with the brand's mark
 * floating in a burst of orange, pink and purple light, coins and sparkles
 * round it; the balances as tilted white cards over a stage split white and
 * black. Pure CSS 3D (perspective / rotate / translateZ) — an original design
 * in the brand's colour.
 *
 * No scene types of its own — the ones the story AI already writes
 * (app/motion.py FINTECH_PROMPT):
 *   hook       the card in the burst of light, the promise      {text, badge?}
 *   dashboard  the wallet, its balances rising out              {title?, metrics: [{label, value, prefix, suffix, delta}]}
 *   list       the features as tilted cards, white over black   {title?, items: [{icon, text}]}
 *   stat       one true number, coins raining                   {value, prefix?, suffix?, label}
 *   reveal     one line in the burst (a story's line, no number) {text, icon?}
 *   cta        the card, the logo, the button                   {text, button}
 * 9:16 and 16:9; nothing in the subtitle band (captionTop).
 */
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { fade } from '@remotion/transitions/fade'
import { FONT, Icon, KHMER_RE, Words, clean, fitSize, srcOf, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = (t) => 1 - (1 - t) ** 3
const INK = '#0B0F19'
const SUB = '#7A8194'
const GOLD = ['#FFE7A0', '#F5B83D', '#B9771B'] // light, face, edge

const accent = (brand) => (/^#[0-9a-f]{6}$/i.test(brand?.color || '') ? brand.color : '#7C5CFF')
const khmer = (t) => KHMER_RE.test(t || '')

/** A gold coin turning in 3D: a face, an edge, a glint; ``mark`` on the face (₿, $…). */
function Coin({ size, x, y, spin = 0, tilt = 0, mark = '', color }) {
  const face = color || GOLD[1]
  // it rocks to and fro (never edge-on for long), so its gold face reads
  const turn = 55 * Math.sin((spin * Math.PI) / 180)
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, perspective: size * 6 }}>
      <div style={{ width: size, height: size, position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${tilt}deg) rotateY(${turn}deg)` }}>
        {/* the edge: a few discs stacked behind the face */}
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GOLD[2], transform: `translateZ(${-k * size * 0.025}px)` }} />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle at 32% 28%, ${GOLD[0]}, ${face} 48%, ${GOLD[2]} 100%)`,
            boxShadow: `inset 0 0 0 ${size * 0.06}px ${tint(GOLD[2], 0.55)}`,
            display: 'grid',
            placeItems: 'center',
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: size * 0.52,
            color: 'rgba(255,255,255,0.92)',
            textShadow: `0 ${size * 0.02}px 0 ${tint(GOLD[2], 0.6)}`,
            backfaceVisibility: 'hidden',
          }}
        >
          {mark}
        </div>
      </div>
      {/* a soft shadow under it */}
      <div style={{ position: 'absolute', left: size * 0.15, right: size * 0.15, top: size * 1.05, height: size * 0.14, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', filter: `blur(${size * 0.08}px)` }} />
    </div>
  )
}

/** The dark stage: a burst of orange, pink and purple light turning slowly behind the middle. */
function Burst({ brand, children }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const a = accent(brand)
  const big = Math.max(width, height) * 1.6
  return (
    <AbsoluteFill style={{ background: '#08060F', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: width / 2 - big / 2,
          top: height * 0.4 - big / 2,
          width: big,
          height: big,
          borderRadius: '50%',
          background: `conic-gradient(from ${frame * 0.35}deg, ${tint('#FF8A3D', 0.85)}, transparent 9%, ${tint('#FF3DA8', 0.7)} 17%, transparent 27%, ${tint(a, 0.8)} 36%, transparent 46%, ${tint('#FFC14D', 0.75)} 55%, transparent 64%, ${tint('#8B5CFF', 0.8)} 73%, transparent 83%, ${tint('#FF8A3D', 0.85)})`,
          WebkitMaskImage: 'radial-gradient(circle, #000 4%, rgba(0,0,0,0.85) 22%, transparent 62%)',
          maskImage: 'radial-gradient(circle, #000 4%, rgba(0,0,0,0.85) 22%, transparent 62%)',
          filter: 'blur(6px)',
        }}
      />
      {/* a glow in the middle */}
      <div style={{ position: 'absolute', left: width / 2 - width * 0.4, top: height * 0.4 - width * 0.4, width: width * 0.8, height: width * 0.8, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,236,200,0.55), transparent 65%)' }} />
      {children}
    </AbsoluteFill>
  )
}

/** Sparkles that twinkle (four-point stars) and lightning outlines, scattered by seed. */
function Sparkles({ n = 7, color = '#FFE27A', seed = 'fx', bolts = 0 }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const top = height > width ? 0.12 : 0.08
  const bottom = height > width ? 0.74 : 0.8 // never in the subtitle band
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const x = random(`${seed}x${i}`) * width
        const y = (top + random(`${seed}y${i}`) * (bottom - top)) * height
        const s = (0.6 + random(`${seed}s${i}`)) * (width > height ? 26 : 32)
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(frame / 9 + i * 1.7))
        return (
          <svg key={`s${i}`} viewBox="0 0 40 40" width={s} height={s} style={{ position: 'absolute', left: x, top: y, opacity: tw, transform: `scale(${0.7 + 0.3 * tw})` }}>
            <path d="M20 0 C21 13 27 19 40 20 C27 21 21 27 20 40 C19 27 13 21 0 20 C13 19 19 13 20 0 Z" fill={color} />
          </svg>
        )
      })}
      {Array.from({ length: bolts }).map((_, i) => {
        const x = random(`${seed}bx${i}`) * width * 0.9
        const y = (top + random(`${seed}by${i}`) * (bottom - top)) * height
        const s = (width > height ? 70 : 90) * (0.8 + random(`${seed}bs${i}`) * 0.5)
        return (
          <svg key={`b${i}`} viewBox="0 0 40 60" width={s} height={s * 1.5} style={{ position: 'absolute', left: x, top: y, transform: `rotate(${(random(`${seed}br${i}`) - 0.5) * 50}deg)`, opacity: 0.7 }}>
            <path d="M24 2 L6 34 L19 34 L13 58 L34 22 L21 22 Z" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
        )
      })}
    </>
  )
}

/** The black card: the chip, the brand's mark, a sheen sweeping across. */
function Card({ brand, w, frame }) {
  const h = w / 1.586
  const sheen = ((frame % 90) / 90) * 2 - 0.5
  const name = clean(brand?.name || '')
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.06, background: 'linear-gradient(135deg, #2A2A33 0%, #0E0E13 55%, #1C1C24 100%)', boxShadow: `0 ${w * 0.08}px ${w * 0.16}px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.08)`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(110deg, transparent ${sheen * 100 - 12}%, rgba(255,255,255,0.18) ${sheen * 100}%, transparent ${sheen * 100 + 12}%)` }} />
      {/* the chip */}
      <div style={{ position: 'absolute', left: w * 0.1, top: h * 0.36, width: w * 0.13, height: w * 0.1, borderRadius: w * 0.018, background: `linear-gradient(135deg, ${GOLD[0]}, ${GOLD[1]} 60%, ${GOLD[2]})` }} />
      {/* the brand's mark: its logo in white, else its name */}
      <div style={{ position: 'absolute', right: w * 0.09, top: h * 0.3, height: h * 0.4, maxWidth: w * 0.5, display: 'flex', alignItems: 'center' }}>
        {brand?.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: '100%', maxWidth: w * 0.5, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        ) : (
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: h * 0.2, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{name}</span>
        )}
      </div>
      <div style={{ position: 'absolute', left: w * 0.1, bottom: h * 0.12, fontFamily: FONT, fontWeight: 600, fontSize: h * 0.075, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)' }}>•••• 2048</div>
    </div>
  )
}

/** A headline, word by word: white on the dark stage, ink on the light; ⟦marked⟧ words in the brand's colour. */
function Headline({ text, size, dark = false, brand, delay = 8 }) {
  return (
    <Words
      text={text}
      delay={delay}
      align="center"
      color={dark ? '#FFD66B' : accent(brand)}
      style={{ fontFamily: FONT, fontWeight: khmer(text) ? 700 : 800, fontSize: size, lineHeight: khmer(text) ? 1.45 : 1.08, letterSpacing: khmer(text) ? 0 : '-0.025em', color: dark ? '#FFFFFF' : INK, textShadow: dark ? '0 6px 30px rgba(0,0,0,0.5)' : 'none' }}
    />
  )
}

/** The symbol of a balance's currency (₿, Ξ, $, ៛…) and its colour, else the label's first letter. */
function currency(label, a) {
  const t = String(label || '').toUpperCase()
  if (/BTC|BITCOIN/.test(t)) return ['₿', '#F7931A']
  if (/ETH/.test(t)) return ['Ξ', '#627EEA']
  if (/USDT|TETHER/.test(t)) return ['₮', '#26A17B']
  if (/KHR|RIEL|៛/.test(t)) return ['៛', '#E11D48']
  if (/USD|\$|DOLLAR/.test(t)) return ['$', '#16A34A']
  return [clean(label).slice(0, 1) || '•', a]
}

const money = (m, shown) => `${clean(m.prefix)}${Number(shown).toLocaleString('en-US', { maximumFractionDigits: 4 })}${m.suffix ? ` ${clean(m.suffix)}` : ''}`

/** One balance as a white card: the currency mark, its name, the amount (counting up). */
function Balance({ m, w, a, t, tilt = 0 }) {
  const [mark, col] = currency(m.label, a)
  const unit = w / 11
  const value = Number(m.value) || 0
  const places = Math.min(4, (String(m.value).split('.')[1] || '').length) // 0.154 BTC ends on 0.154
  const shown = places ? (value * t).toFixed(places) : Math.round(value * t)
  return (
    <div style={{ width: w, display: 'flex', alignItems: 'center', gap: unit * 0.5, padding: `${unit * 0.55}px ${unit * 0.7}px`, borderRadius: unit * 0.55, background: '#FFFFFF', boxShadow: '0 18px 40px rgba(11,15,25,0.16), 0 0 0 1px rgba(11,15,25,0.05)', transform: `rotate(${tilt}deg)`, fontFamily: FONT }}>
      <span style={{ width: unit * 1.3, height: unit * 1.3, borderRadius: '50%', background: col, color: '#FFFFFF', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: unit * 0.75, flex: 'none' }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: unit * 0.62, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(m.label)}</span>
        {m.delta && <span style={{ display: 'block', fontWeight: 600, fontSize: unit * 0.44, color: String(m.delta).trim().startsWith('-') ? '#E11D48' : '#16A34A' }}>{clean(m.delta)}</span>}
      </span>
      <span style={{ fontWeight: 800, fontSize: unit * 0.68, color: INK, whiteSpace: 'nowrap' }}>{money(m, shown)}</span>
    </div>
  )
}

// ── hook: the card floating in the burst of light, coins round it, the promise ──
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.9 } })
  const cw = wide ? 640 : 760
  const cy = wide ? height * 0.4 : height * 0.36
  const float = Math.sin(frame / 18) * 14
  return (
    <Burst brand={brand}>
      <Sparkles n={wide ? 9 : 8} seed="hook" bolts={2} />
      {/* coins and money marks orbiting the card */}
      <Coin size={wide ? 120 : 150} x={width / 2 - cw * 0.42} y={cy - cw * 0.42 + Math.sin(frame / 14) * 16} spin={frame * 4} tilt={12} mark="₿" />
      <Coin size={wide ? 80 : 96} x={width / 2 + cw * 0.5} y={cy + cw * 0.38 + Math.cos(frame / 16) * 14} spin={frame * 5 + 90} tilt={-14} mark="$" color="#7FD85B" />
      <Coin size={wide ? 70 : 84} x={width / 2 - cw * 0.55} y={cy + cw * 0.3} spin={frame * 3 + 40} tilt={20} mark="" color="#FF5FB0" />
      <div style={{ position: 'absolute', left: width / 2 - cw / 2, top: cy - cw / 1.586 / 2 + float, perspective: 1800, transform: `scale(${0.6 + 0.4 * enter})`, opacity: enter }}>
        <div style={{ transform: `rotateX(${18 - 6 * Math.sin(frame / 30)}deg) rotateY(${-22 + 10 * Math.sin(frame / 40)}deg) rotateZ(${-8 + (1 - enter) * 30}deg)`, transformStyle: 'preserve-3d' }}>
          <Card brand={brand} w={cw} frame={frame} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: wide ? 140 : 60, right: wide ? 140 : 60, top: wide ? height * 0.6 : height * 0.58 }}>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 84 : 92)} dark brand={brand} delay={18} />
        {scene.badge && (
          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', opacity: interpolate(frame, [36, 48], [0, 1], clamp) }}>
            <span style={{ padding: '12px 28px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)', fontFamily: FONT, fontWeight: 700, fontSize: wide ? 30 : 36, color: '#FFFFFF' }}>{clean(scene.badge)}</span>
          </div>
        )}
      </div>
    </Burst>
  )
}

// ── dashboard: the dark wallet on the white stage, the balances rising out of it ──
function Wallet({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const rows = scene.metrics || []
  const ww = wide ? 620 : 700 // the wallet
  const wx = width / 2 - ww / 2
  const wy = wide ? height * 0.6 : height * 0.56
  const open = spring({ frame: frame - 6, fps, config: { damping: 16 } })
  const count = interpolate(frame, [30, 80], [0, 1], { ...clamp, easing: ease })
  const rw = wide ? 560 : 820 // a balance card
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F8 100%)' }}>
      <Sparkles n={5} color={tint(a, 0.55)} seed="wallet" />
      {/* gold coins tossed in the air */}
      {/* (below the title, either side) */}
      <Coin size={wide ? 110 : 130} x={width * (wide ? 0.14 : 0.12)} y={height * (wide ? 0.32 : 0.25) + Math.sin(frame / 15) * 18} spin={frame * 4} tilt={18} />
      <Coin size={wide ? 80 : 96} x={width * (wide ? 0.86 : 0.88)} y={height * (wide ? 0.26 : 0.22) + Math.cos(frame / 17) * 14} spin={frame * 5 + 60} tilt={-20} />
      {scene.title && (
        <div style={{ position: 'absolute', left: wide ? 140 : 60, right: wide ? 140 : 60, top: wide ? 60 : 250 }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 66 : 80)} brand={brand} delay={4} />
        </div>
      )}
      {/* the balances rise out of the wallet, one after another, fanning a little */}
      {rows.map((m, i) => {
        const s = spring({ frame: frame - 18 - i * 9, fps, config: { damping: 15 } })
        const n = rows.length
        const gap = wide ? 118 : 150
        const y = wy - 40 - (n - i) * gap * s
        const x = width / 2 - rw / 2 + (wide ? (i - (n - 1) / 2) * 120 : (i % 2 ? 40 : -40)) * s
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, opacity: Math.min(1, s * 1.6), zIndex: 2 }}>
            <Balance m={m} w={rw} a={a} t={count} tilt={(i % 2 ? 1.5 : -1.5) * s} />
          </div>
        )
      })}
      {/* the wallet: a back panel, the front pocket tilted toward us */}
      <div style={{ position: 'absolute', left: wx, top: wy, width: ww, perspective: 1600, zIndex: 3 }}>
        <div style={{ position: 'relative', height: ww * 0.62, transformStyle: 'preserve-3d', transform: `rotateX(${22 - 8 * open}deg) rotateZ(${-6 + 3 * Math.sin(frame / 40)}deg)` }}>
          <div style={{ position: 'absolute', left: ww * 0.04, right: ww * 0.04, top: -ww * 0.06, bottom: 0, borderRadius: ww * 0.07, background: '#1B1D24' }} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              top: ww * 0.08,
              borderRadius: ww * 0.07,
              background: 'linear-gradient(160deg, #3A3D47 0%, #16171C 60%, #24262E 100%)',
              boxShadow: '0 40px 70px rgba(11,15,25,0.35), inset 0 1.5px 0 rgba(255,255,255,0.12)',
              transformOrigin: '50% 100%',
              transform: `rotateX(${-26 * open}deg)`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <div style={{ position: 'absolute', left: ww * 0.12, right: ww * 0.12, top: ww * 0.12, height: ww * 0.03, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: ww * 0.07, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>{clean(brand?.name || 'Wallet')}</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ── list: the stage split white over black, the points as tilted white cards ──
function Points({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const items = (scene.items || []).slice(0, 4)
  const split = wide ? height * 0.5 : height * 0.46
  const cw = wide ? 640 : 860
  return (
    <AbsoluteFill style={{ background: '#08090D' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: split, background: 'linear-gradient(180deg, #FFFFFF, #F1F2F6)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: split - 30, height: 60, background: 'linear-gradient(180deg, transparent, rgba(8,9,13,0.6))' }} />
      <Sparkles n={6} seed="points" />
      {scene.title && (
        <div style={{ position: 'absolute', left: wide ? 140 : 60, right: wide ? 140 : 60, top: wide ? 60 : 250 }}>
          <Headline text={scene.title} size={fitSize(scene.title, wide ? 64 : 78)} brand={brand} delay={2} />
        </div>
      )}
      {items.map((it, i) => {
        const s = spring({ frame: frame - 10 - i * 10, fps, config: { damping: 14 } })
        const left = i % 2 === 0
        const y = wide ? height * 0.3 + i * height * 0.15 : height * 0.26 + i * height * 0.12
        // wide: each card as long as its words (a 640 px card held one short word and a lot of white), in a
        // zig-zag down the middle — the left ones end just left of centre, the right ones start just right of it
        const x = wide ? width / 2 + 24 : (width - cw) / 2 + (left ? -30 : 30)
        const unit = wide ? 42 : 44
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...(wide ? (left ? { right: x + (1 - s) * 400 } : { left: x + (1 - s) * 400 }) : { left: x + (left ? -1 : 1) * (1 - s) * 400 }),
              top: y,
              ...(wide ? { maxWidth: cw + 200 } : { width: cw }),
              opacity: s,
              transform: `perspective(1400px) rotateY(${(left ? 14 : -14) * (1 - 0.4 * s)}deg) rotateZ(${left ? -3 : 3}deg)`,
              display: 'flex',
              alignItems: 'center',
              gap: unit * 0.55,
              padding: `${unit * 0.6}px ${unit * 0.8}px`,
              borderRadius: unit * 0.55,
              background: '#FFFFFF',
              boxShadow: '0 22px 50px rgba(0,0,0,0.35)',
              fontFamily: FONT,
            }}
          >
            <span style={{ width: unit * 1.4, height: unit * 1.4, borderRadius: '50%', background: tint(a, 0.14), display: 'grid', placeItems: 'center', flex: 'none' }}>
              <Icon name={it.icon || 'Check'} size={unit * 0.8} color={a} stroke={2.4} />
            </span>
            <span style={{ fontWeight: 700, fontSize: unit * 0.9, lineHeight: khmer(it.text) ? 1.5 : 1.2, color: INK }}>{clean(it.text)}</span>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

// ── stat: one true number in the burst, gold coins raining ─────────────────
function Stat({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const value = Number(scene.value) || 0
  const t = interpolate(frame, [8, 50], [0, 1], { ...clamp, easing: ease })
  const shown = value % 1 ? (value * t).toFixed(1) : Math.round(value * t).toLocaleString('en-US')
  const pop = spring({ frame, fps, config: { damping: 12 } })
  const bottom = wide ? height * 0.78 : height * 0.74
  return (
    <Burst brand={brand}>
      {Array.from({ length: wide ? 9 : 8 }).map((_, i) => {
        const x = (0.08 + 0.84 * random(`rain${i}`)) * width
        const fall = ((frame * (5 + random(`v${i}`) * 4) + random(`o${i}`) * bottom) % (bottom + 200)) - 160
        return <Coin key={i} size={(wide ? 60 : 72) * (0.8 + random(`z${i}`) * 0.6)} x={x} y={fall} spin={frame * 6 + i * 40} tilt={20} />
      })}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${wide ? -30 : -150}px) scale(${0.7 + 0.3 * pop})`, textAlign: 'center', padding: wide ? '0 160px' : '0 70px' }}>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 200 : 210, lineHeight: 1, letterSpacing: '-0.04em', color: '#FFFFFF', textShadow: '0 10px 40px rgba(0,0,0,0.45)' }}>
            {clean(scene.prefix)}
            {shown}
            {clean(scene.suffix)}
          </div>
          <div style={{ marginTop: 24, fontFamily: FONT, fontWeight: 700, fontSize: fitSize(scene.label, wide ? 50 : 56), lineHeight: khmer(scene.label) ? 1.5 : 1.2, color: '#FFE3A3' }}>{clean(scene.label)}</div>
        </div>
      </AbsoluteFill>
    </Burst>
  )
}

// ── reveal: one line in the burst, a coin turning above it ────────────────
function Reveal({ scene, brand }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const wide = width > height
  return (
    <Burst brand={brand}>
      <Sparkles n={7} seed="reveal" bolts={1} />
      <Coin size={wide ? 150 : 190} x={width / 2} y={wide ? height * 0.3 : height * 0.3} spin={frame * 4} tilt={14} mark="₿" />
      <div style={{ position: 'absolute', left: wide ? 160 : 70, right: wide ? 160 : 70, top: wide ? height * 0.5 : height * 0.46 }}>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 84 : 92)} dark brand={brand} delay={10} />
      </div>
    </Burst>
  )
}

// ── cta: the card, the logo and the button ────────────────────────────────
function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const wide = width > height
  const a = accent(brand)
  const enter = spring({ frame, fps, config: { damping: 16 } })
  const cw = wide ? 520 : 620
  return (
    <Burst brand={brand}>
      <Sparkles n={7} seed="cta" />
      <div style={{ position: 'absolute', left: width / 2 - cw / 2, top: (wide ? height * 0.12 : height * 0.17) + Math.sin(frame / 18) * 10, perspective: 1600, opacity: enter }}>
        <div style={{ transform: `rotateX(14deg) rotateY(${-18 + 36 * (1 - enter) + 6 * Math.sin(frame / 35)}deg) rotateZ(-5deg)` }}>
          <Card brand={brand} w={cw} frame={frame} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: wide ? 160 : 70, right: wide ? 160 : 70, top: wide ? height * 0.56 : height * 0.47, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wide ? 34 : 46 }}>
        <Headline text={scene.text} size={fitSize(scene.text, wide ? 76 : 84)} dark brand={brand} delay={10} />
        {scene.button && (
          <span style={{ padding: wide ? '24px 60px' : '28px 70px', borderRadius: 999, background: `linear-gradient(135deg, ${GOLD[0]}, ${GOLD[1]})`, color: INK, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 44 : 50, boxShadow: '0 18px 44px rgba(245,184,61,0.4)', opacity: interpolate(frame, [22, 34], [0, 1], clamp), transform: `scale(${0.9 + 0.1 * Math.min(1, Math.max(0, (frame - 22) / 12))})`, whiteSpace: 'nowrap' }}>
            {clean(scene.button)}
          </span>
        )}
      </div>
      {/* a hint of the brand's own colour under the button, so it's theirs */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: a, opacity: 0.8 }} />
    </Burst>
  )
}

export const FINTECH = {
  scenes: { hook: Hook, dashboard: Wallet, list: Points, stat: Stat, reveal: Reveal, cta: Cta },
  root: { backgroundColor: '#08060F' },
  transitions: [() => fade()],
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}
