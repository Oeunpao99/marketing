/**
 * "Presenter · Brand host" — the brand's own presenter: a friendly robot host
 * (a white shell, a black visor face with glowing eyes, a headset) in a T-shirt
 * in the brand's colour with the brand's logo on the chest and on the laptop,
 * at a desk in a studio. She greets ("Hi! I'm Kalyan, BCIE's personal
 * assistant…"), brings today's topic and talks it through: her mouth moves
 * with the voice (word timings when there are some), she waves, presents with
 * an open hand, points at the panel beside her, gives a thumbs-up. Drawn in
 * code — no AI pictures — so she is the same host in every video.
 * Scene types: hook · speak · list · stat · qa · cta (app/motion.py PRESENTER_TYPES).
 * props.host = {name, role, hello, kicker, female, print} (build_props).
 */
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, srcOf } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const EYE = '#5CCBFF' // the visor's glow — the same on every brand (a red glow looks angry)
const SHELL = '#F4F6FA'
const LINE = '#B9C3D6'
const DARK = '#1E2433'

// ── colours from the brand's one colour ────────────────────────────────────
const rgb = (hex) => {
  const h = String(hex || '#2563EB').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, k) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * k))
const lum = (c) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The same hue, saturated and light — mixing in white only greyed it. */
function vivid(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  const sat = d ? Math.max(0.7, d / (1 - Math.abs(max + min - 1))) : 0 // a grey brand stays grey
  const l = 0.62
  const k = (1 - Math.abs(2 * l - 1)) * sat
  const x = k * (1 - Math.abs(((h / 60) % 2) - 1))
  const [r1, g1, b1] = h < 60 ? [k, x, 0] : h < 120 ? [x, k, 0] : h < 180 ? [0, k, x] : h < 240 ? [0, x, k] : h < 300 ? [x, 0, k] : [k, 0, x]
  const m = l - k / 2
  return hex([r1 + m, g1 + m, b1 + m].map((v) => v * 255))
}

/** The studio in the brand's colour: a deep stage, the shirt, an accent that reads on the stage. */
export function palette(color) {
  const c = color || '#2563EB'
  const accent = lum(c) < 0.22 ? vivid(c) : c // a deep brand colour: the same hue, bright enough for the stage
  const stage = mix(c, '#050914', 0.84)
  return {
    stage,
    shirt: lum(c) > 0.5 ? mix(c, '#0B1020', 0.45) : c, // a pale brand colour: a deeper shirt so the white print reads
    accent,
    onAccent: lum(accent) > 0.45 ? '#0B1020' : '#FFFFFF',
    desk: mix(stage, c, 0.35),
    deskTop: mix(mix(stage, c, 0.35), '#FFFFFF', 0.14),
    card: 'rgba(255,255,255,0.075)',
    edge: 'rgba(255,255,255,0.16)',
    soft: 'rgba(255,255,255,0.72)',
  }
}

/** Where things sit: the host's middle, the desk line, the panel — 9:16 and 16:9. */
function useSet() {
  const { width: W, height: H, fps } = useVideoConfig()
  const wide = W > H
  return wide
    ? { W, H, fps, wide, ground: 885, x: 560, s: 1.55, panel: { x: 1040, y: 120, w: 810, h: 690 }, bubble: { x: 790, y: 190, w: 230 } }
    : { W, H, fps, wide, ground: 1500, x: 560, s: 1.35, panel: { x: 60, y: 255, w: 960, h: 690 }, bubble: { x: 56, y: 990, w: 300 } }
}

// ── the voice: how open the mouth is at this frame (0 shut … 1 wide) ───────
/** ``voiceAt`` = the frame of the scene its voice starts on (MotionPost). With
 * word timings (Azure) the mouth moves on the words and rests between them;
 * without (Gemini) it flaps over the line's length with a breath now and then. */
export function mouthAt(scene, frame, fps, voiceAt = 6) {
  if (!scene.audio) return 0
  const t = (frame - voiceAt) / fps
  if (t < 0) return 0
  const words = scene.voiceWords
  if (words?.length) {
    const w = words.find((x) => t >= x.t - 0.03 && t <= x.e + 0.03)
    return w ? 0.3 + 0.7 * Math.abs(Math.sin((t - w.t) * 13)) : 0
  }
  if (t > (scene.voiceSeconds || 0)) return 0
  const breath = Math.sin(t * 1.9 + 1) > 0.94 ? 0 : 1
  return breath * (0.3 + 0.7 * Math.abs(Math.sin(t * 12.5)))
}

// ── the host ───────────────────────────────────────────────────────────────
const rad = (d) => (d * Math.PI) / 180
const step = (p, deg, len) => ({ x: p.x + Math.cos(rad(deg)) * len, y: p.y + Math.sin(rad(deg)) * len })

/** A white limb with a soft grey edge (drawn twice: the edge, then the white). */
function Seg({ a, b, w, color = SHELL, edge = LINE }) {
  return (
    <g strokeLinecap="round">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edge} strokeWidth={w + 4} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} />
    </g>
  )
}

/** A hand at the wrist ``w`` facing ``dir`` (degrees): open | point | thumb | type. */
function Hand({ w, dir, kind }) {
  const palm = step(w, dir, 15)
  const finger = (deg, len, from = 9) => <Seg key={deg} a={step(palm, deg, from)} b={step(palm, deg, len)} w={9} />
  const wrist = <circle cx={w.x} cy={w.y} r={12} fill={DARK} />
  if (kind === 'thumb') {
    return (
      <g>
        {wrist}
        <Seg a={step(palm, -90, 6)} b={step(palm, -90, 36)} w={12} />
        <circle cx={palm.x} cy={palm.y} r={19} fill={SHELL} stroke={LINE} strokeWidth={2} />
        {[-30, 0, 30].map((d) => <circle key={d} cx={step(palm, dir + d, 14).x} cy={step(palm, dir + d, 14).y} r={7} fill={SHELL} stroke={LINE} strokeWidth={1.5} />)}
      </g>
    )
  }
  if (kind === 'point') {
    return (
      <g>
        {wrist}
        {finger(dir, 40, 10)}
        {finger(dir - 65, 24)}
        <circle cx={palm.x} cy={palm.y} r={17} fill={SHELL} stroke={LINE} strokeWidth={2} />
        {[25, 50].map((d) => <circle key={d} cx={step(palm, dir + d, 13).x} cy={step(palm, dir + d, 13).y} r={6.5} fill={SHELL} stroke={LINE} strokeWidth={1.5} />)}
      </g>
    )
  }
  if (kind === 'type') {
    return (
      <g>
        {wrist}
        {[-20, 0, 20].map((d) => finger(dir + d, 24))}
        <circle cx={palm.x} cy={palm.y} r={16} fill={SHELL} stroke={LINE} strokeWidth={2} />
      </g>
    )
  }
  // open: four fingers fanned, the thumb off to the side
  return (
    <g>
      {wrist}
      {[-34, -11, 12, 35].map((d) => finger(dir + d, 34))}
      {finger(dir - 82, 26)}
      <circle cx={palm.x} cy={palm.y} r={18} fill={SHELL} stroke={LINE} strokeWidth={2} />
    </g>
  )
}

/** One arm from the shoulder: the upper arm at ``a1``, the forearm at ``a2``, a sleeve over the top. */
function Arm({ s, a1, a2, hand, shirt }) {
  const e = step(s, a1, 70)
  const w = step(e, a2, 64)
  return (
    <g>
      <Seg a={s} b={e} w={30} />
      <Seg a={e} b={w} w={28} />
      <circle cx={e.x} cy={e.y} r={14} fill={DARK} />
      <Hand w={w} dir={a2} kind={hand} />
      {/* the T-shirt's short sleeve, along the upper arm */}
      <line x1={s.x} y1={s.y} x2={step(s, a1, 30).x} y2={step(s, a1, 30).y} stroke={shirt} strokeWidth={52} strokeLinecap="round" />
    </g>
  )
}

// the gesturing arm (screen right): [upper arm, forearm, hand]
const POSES = {
  present: (f) => [66, -14 + Math.sin(f / 22) * 5, 'open'],
  wave: (f) => [-16, -86 + Math.sin(f / 4) * 20, 'open'],
  point: (f, wide) => (wide ? [22, -18 + Math.sin(f / 16) * 3, 'point'] : [-34, -68 + Math.sin(f / 16) * 3, 'point']),
  thumb: (f) => [76, -66 + Math.sin(f / 14) * 3, 'thumb'],
}

/**
 * The host, the middle of her shoulders at (x, ground) on the desk line, drawn
 * ``s`` px per unit (she is ~400 units tall above the desk). ``mouth`` 0-1,
 * ``pose`` one of POSES, ``smile`` = happy closed eyes.
 */
function Host({ pal, host, brand, pose = 'present', mouth = 0, smile = false, enter = 1 }) {
  const frame = useCurrentFrame()
  const set = useSet()
  const { x, ground, s, wide } = set
  const blink = frame % 104 > 99
  const breathe = Math.sin(frame / 32) * 3
  const tilt = Math.sin(frame / 46) * 2.4 + mouth * 1.2
  const [a1, a2, hand] = (POSES[pose] || POSES.present)(frame, wide)
  const typing = 188 + Math.sin(frame / 3) * 4 // nearly level: the hand stays behind the laptop's lid
  const female = host?.female !== false
  const logo = brand.logo
  const print = !!host?.print // a logo on a transparent ground: printed in white on the shirt, else a white patch
  // the SVG box: x -230…230, y -410…40 (0 = the desk line)
  const box = { l: -230, t: -410, w: 460, h: 450 }
  const px = (X) => (X - box.l) * s
  const py = (Y) => (Y - box.t) * s
  return (
    <div style={{ position: 'absolute', left: x - (0 - box.l) * s, top: ground - (0 - box.t) * s, width: box.w * s, height: box.h * s, transform: `translateY(${breathe * s + (1 - enter) * 260 * s}px)` }}>
      <svg width={box.w * s} height={box.h * s} viewBox={`${box.l} ${box.t} ${box.w} ${box.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <radialGradient id="pr-shell" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#E9EDF4" />
            <stop offset="100%" stopColor="#C9D1DF" />
          </radialGradient>
          <linearGradient id="pr-visor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2133" />
            <stop offset="100%" stopColor="#05080F" />
          </linearGradient>
          <linearGradient id="pr-shirt" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0.28" />
            <stop offset="35%" stopColor="#000" stopOpacity="0" />
            <stop offset="70%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        {/* the typing arm (screen left) — its hand goes behind the laptop */}
        <Arm s={{ x: -112, y: -90 }} a1={116} a2={typing} hand="type" shirt={pal.shirt} />
        {/* the neck */}
        <rect x={-26} y={-158} width={52} height={40} rx={10} fill="#CBD3E1" />
        <rect x={-30} y={-132} width={60} height={10} rx={5} fill={DARK} />
        {/* the T-shirt */}
        <path d="M -118 -112 Q -130 -60 -134 40 L 134 40 Q 130 -60 118 -112 Q 70 -134 34 -128 Q 0 -104 -34 -128 Q -70 -134 -118 -112 Z" fill={pal.shirt} />
        <path d="M -118 -112 Q -130 -60 -134 40 L 134 40 Q 130 -60 118 -112 Q 70 -134 34 -128 Q 0 -104 -34 -128 Q -70 -134 -118 -112 Z" fill="url(#pr-shirt)" />
        <path d="M -36 -128 Q 0 -100 36 -128" fill="none" stroke={mix(pal.shirt, '#000000', 0.3)} strokeWidth={8} strokeLinecap="round" />
        {/* the gesturing arm (screen right) */}
        <Arm s={{ x: 112, y: -90 }} a1={a1} a2={a2} hand={hand} shirt={pal.shirt} />
        {/* the head, tilting a little as she talks */}
        <g transform={`rotate(${tilt} 0 -150)`}>
          {/* antenna */}
          <line x1={0} y1={-330} x2={0} y2={-382} stroke="#E4E9F1" strokeWidth={7} strokeLinecap="round" />
          <ellipse cx={0} cy={-333} rx={18} ry={7} fill="#CBD3E1" />
          <circle cx={0} cy={-392 + Math.sin(frame / 9) * 2} r={15} fill={mix(pal.accent, '#2F6FE0', 0.5)} />
          <circle cx={-5} cy={-397 + Math.sin(frame / 9) * 2} r={4.5} fill="rgba(255,255,255,0.75)" />
          {/* the shell */}
          <ellipse cx={0} cy={-235} rx={118} ry={102} fill="url(#pr-shell)" />
          {/* the visor */}
          <rect x={-92} y={-292} width={184} height={116} rx={54} fill="url(#pr-visor)" />
          <path d="M -70 -280 Q -20 -290 30 -284" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={7} strokeLinecap="round" />
          {/* eyes: a soft glow, then the eye — happy arcs, a blink, or open */}
          {[-40, 40].map((ex) => (
            <g key={ex}>
              {smile ? (
                <path d={`M ${ex - 16} -230 Q ${ex} -256 ${ex + 16} -230`} fill="none" stroke={EYE} strokeWidth={9} strokeLinecap="round" />
              ) : (
                <>
                  <ellipse cx={ex} cy={-238} rx={22} ry={blink ? 6 : 30} fill={EYE} opacity={0.18} />
                  <rect x={ex - 15} y={blink ? -241 : -262} width={30} height={blink ? 6 : 48} rx={blink ? 3 : 15} fill={EYE} />
                  <ellipse cx={ex - 4} cy={-250} rx={4} ry={6} fill="rgba(255,255,255,0.7)" opacity={blink ? 0 : 1} />
                </>
              )}
              {female && !blink && (
                // lashes at the outer corner
                <g stroke={EYE} strokeWidth={4} strokeLinecap="round">
                  <line x1={ex + Math.sign(ex) * 14} y1={smile ? -238 : -258} x2={ex + Math.sign(ex) * 24} y2={smile ? -246 : -266} />
                  <line x1={ex + Math.sign(ex) * 17} y1={smile ? -232 : -250} x2={ex + Math.sign(ex) * 28} y2={smile ? -236 : -254} />
                </g>
              )}
            </g>
          ))}
          {female && [-66, 66].map((bx) => <ellipse key={bx} cx={bx} cy={-206} rx={13} ry={7} fill="rgba(255,120,170,0.5)" />)}
          {/* the mouth: a smile that opens with the voice */}
          <path d={`M -20 -207 Q 0 -199 20 -207 Q 0 ${-202 + 8 + 16 * mouth} -20 -207 Z`} fill={EYE} stroke={EYE} strokeWidth={4} strokeLinejoin="round" />
          {/* the headset: the band, the ear cups, the mic */}
          <path d="M -126 -238 A 127 120 0 0 1 126 -238" fill="none" stroke={DARK} strokeWidth={13} strokeLinecap="round" />
          {[-1, 1].map((k) => (
            <g key={k}>
              <rect x={k < 0 ? -146 : 112} y={-278} width={34} height={80} rx={15} fill="#2A3142" />
              <rect x={k < 0 ? -140 : 118} y={-268} width={22} height={60} rx={10} fill="#3A4256" />
            </g>
          ))}
          <path d="M 128 -212 Q 124 -168 66 -170" fill="none" stroke="#2A3142" strokeWidth={7} strokeLinecap="round" />
          <ellipse cx={58} cy={-170} rx={15} ry={10} fill={DARK} />
        </g>
      </svg>
      {/* the logo on the chest — printed in white, or on a white patch */}
      {logo && (
        <div style={{ position: 'absolute', left: px(-58), top: py(-92), width: 116 * s, height: 66 * s, display: 'grid', placeItems: 'center', ...(print ? {} : { background: '#FFFFFF', borderRadius: 10 * s, padding: 7 * s, boxSizing: 'border-box' }) }}>
          <Img src={srcOf(logo)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: print ? 'brightness(0) invert(1)' : 'none', opacity: print ? 0.96 : 1 }} />
        </div>
      )}
    </div>
  )
}

/** The desk across the bottom, and the laptop on it (lid towards us, the logo on the lid). */
function Desk({ pal, brand }) {
  const { ground, x, s } = useSet()
  const lid = { x: x - 340 * s, w: 205 * s, h: 140 * s }
  return (
    <>
      <div style={{ position: 'absolute', left: -40, right: -40, top: ground, bottom: 0, background: pal.desk, borderRadius: `50% 50% 0 0 / ${46 * s}px ${46 * s}px 0 0`, boxShadow: `inset 0 ${7 * s}px 0 ${pal.deskTop}` }} />
      <div style={{ position: 'absolute', left: lid.x, top: ground - lid.h - 6 * s, width: lid.w, height: lid.h, transform: 'perspective(900px) rotateY(24deg)', transformOrigin: '100% 100%' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 12 * s, background: '#7B8497', boxShadow: `inset 0 0 0 ${2.5 * s}px #9AA3B5, inset ${-10 * s}px 0 ${18 * s}px rgba(0,0,0,0.18)` }} />
        {brand.logo && (
          <div style={{ position: 'absolute', left: '22%', right: '22%', top: '26%', bottom: '26%', display: 'grid', placeItems: 'center', background: '#FFFFFF', borderRadius: 8 * s, padding: 6 * s }}>
            <Img src={srcOf(brand.logo)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', left: lid.x - 8 * s, top: ground - 8 * s, width: lid.w + 70 * s, height: 12 * s, borderRadius: 6 * s, background: '#9AA3B5' }} />
    </>
  )
}

/** The stage: a flat deep colour with the neat grid, the host, the desk. */
function Stage({ brand, host, scene, voiceAt, pose, smile, enter, children, bubble }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pal = palette(brand.color)
  const mouth = mouthAt(scene, frame, fps, voiceAt)
  return (
    <AbsoluteFill style={{ backgroundColor: pal.stage, overflow: 'hidden', '--hl-bg': pal.accent, '--hl-text': pal.onAccent }}>
      <NeatGrid color="rgba(255,255,255,0.05)" size={72} />
      <Host pal={pal} host={host} brand={brand} pose={pose} mouth={mouth} smile={smile} enter={enter} />
      <Desk pal={pal} brand={brand} />
      {bubble}
      {children}
    </AbsoluteFill>
  )
}

/** The panel beside / above the host where the topic's words go. */
function Panel({ children, delay = 4, pad = 56 }) {
  const frame = useCurrentFrame()
  const { panel: p } = useSet()
  const k = spring({ frame: frame - delay, fps: 30, config: { damping: 15 } })
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h, borderRadius: 40, background: 'rgba(255,255,255,0.075)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.16)', opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * 40}px) scale(${0.96 + 0.04 * k})`, padding: pad, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
      {children}
    </div>
  )
}

/** The icon drawn by hand, like Doodle notes: a white pen circle sketched
 * twice, a little off, the icon's own lines drawing themselves in, an accent
 * swash under it and two sparkle ticks. */
function IconTile({ name, size, pal, delay = 8 }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [delay, delay + 34], [0, 1], clamp)
  const r = size / 2
  const w = size * 0.022
  const draw = (from, to) => 1 - interpolate(p, [from, to], [0, 1], clamp)
  const ring = (rx, ry, rot, k, from, to) => (
    <ellipse cx={r} cy={r} rx={rx} ry={ry} transform={`rotate(${rot} ${r} ${r})`} fill="none" stroke="#FFFFFF" strokeWidth={w * k} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(from, to)} />
  )
  const tick = (x1, y1, x2, y2, at) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={pal.accent} strokeWidth={w * 1.3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(at, at + 0.15)} />
  const wobble = Math.sin(frame / 5) * 0.8 // a hand-drawn line never sits quite still
  return (
    <div style={{ flex: 'none', position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center', transform: `rotate(${wobble}deg)` }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <circle cx={r} cy={r} r={r * 0.84} fill={pal.accent} opacity={interpolate(p, [0, 0.3], [0, 0.22], clamp)} />
        {ring(r * 0.88, r * 0.84, -8, 1, 0, 0.6)}
        {ring(r * 0.84, r * 0.9, 14, 0.55, 0.25, 0.85)}
        <path d={`M ${r * 0.5} ${size * 0.98} Q ${r} ${size * 1.05} ${r * 1.5} ${size * 0.96}`} fill="none" stroke={pal.accent} strokeWidth={w * 1.7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(0.6, 0.85)} />
        {tick(size * 0.92, size * 0.12, size * 1.02, size * 0.02, 0.75)}
        {tick(size * 0.98, size * 0.25, size * 1.1, size * 0.2, 0.82)}
      </svg>
      {/* stroke-dash props inherit into the icon's paths: they draw themselves */}
      <div style={{ position: 'relative', strokeDasharray: 140, strokeDashoffset: 140 * (1 - interpolate(p, [0.15, 1], [0, 1], clamp)) }}>
        <Icon name={name || 'Sparkles'} size={size * 0.44} color="#FFFFFF" stroke={1.8} />
      </div>
    </div>
  )
}

/** The scene's picture (an illustration drawn for it, or the product's photo)
 * in a white frame like a printed card, a strip of tape on top, tilted a touch
 * — it drops in, then sways slowly. */
function PictureCard({ src, pal, width, delay = 6 }) {
  const frame = useCurrentFrame()
  const k = spring({ frame: frame - delay, fps: 30, config: { damping: 12 } })
  const h = Math.round(width / 1.5)
  return (
    <div style={{ flex: 'none', alignSelf: 'center', position: 'relative', width, height: h, padding: 12, boxSizing: 'border-box', background: '#FFFFFF', borderRadius: 26, boxShadow: '0 22px 50px rgba(0,0,0,0.35)', opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * -50}px) rotate(${-1.6 + (1 - k) * -5 + Math.sin(frame / 40) * 0.5}deg) scale(${0.9 + 0.1 * k})` }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: '#EEF1F6' }}>
        <Img src={srcOf(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.03 + frame * 0.0007})` }} />
      </div>
      <div style={{ position: 'absolute', left: '50%', top: -16, width: 130, height: 34, marginLeft: -65, background: pal.accent, opacity: 0.85, transform: 'rotate(-3deg)', borderRadius: 4 }} />
    </div>
  )
}

const text = (size, extra) => ({ fontFamily: FONT, color: '#FFFFFF', fontSize: size, fontWeight: 700, lineHeight: 1.4, ...extra })

// ── the scenes ─────────────────────────────────────────────────────────────
/** Hello + who she is (the name strap) + today's topic on the panel. */
function Hook({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide, ground, bubble: b } = useSet()
  const pal = palette(brand.color)
  const e = spring({ frame, fps: 30, config: { damping: 14 } })
  const pop = spring({ frame: frame - 10, fps: 30, config: { damping: 9 } })
  const strap = spring({ frame: frame - 20, fps: 30, config: { damping: 16 } })
  const dots = [0, 1, 2].map((i) => 0.4 + 0.6 * Math.abs(Math.sin(frame / 6 - i * 0.7)))
  const hello = (
    <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, transform: `scale(${pop})`, transformOrigin: wide ? '0% 100%' : '100% 100%' }}>
      <div style={{ position: 'relative', borderRadius: 30, padding: '22px 26px', background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.2)' }}>
        <div style={text(fitSize(host?.hello, 58), { fontWeight: 800 })}>{clean(host?.hello || 'Hi!')} 👋</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          {dots.map((o, i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: EYE, opacity: o }} />)}
        </div>
        {/* the tail, towards her head */}
        <div style={{ position: 'absolute', [wide ? 'left' : 'right']: -14, bottom: 26, width: 30, height: 30, background: 'rgba(255,255,255,0.1)', transform: 'rotate(45deg)', clipPath: wide ? 'polygon(0 100%, 0 0, 100% 100%)' : 'polygon(0 0, 100% 0, 100% 100%)' }} />
      </div>
    </div>
  )
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="wave" smile={frame < 40} enter={e} bubble={hello}>
      <Panel delay={14} pad={scene.image ? 44 : 56}>
        {scene.image && <PictureCard src={scene.image} pal={pal} width={wide ? 500 : 540} delay={18} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {!scene.image && <IconTile name={scene.icon} size={wide ? 120 : 136} pal={pal} delay={20} />}
          <div style={{ padding: '8px 24px', borderRadius: 999, background: pal.accent, color: pal.onAccent, fontFamily: FONT, fontWeight: 700, fontSize: 36, lineHeight: 1.5 }}>{clean(host?.kicker || 'New topic')}</div>
        </div>
        <Words text={scene.text} delay={22} color="#FFFFFF" style={{ fontSize: fitSize(scene.text, wide ? 70 : 78), fontWeight: 800, lineHeight: 1.4 }} />
      </Panel>
      {/* the name strap: who she is — on a tall video it sits on the desk line, above the subtitles
          (they stay inside the Facebook feed's 4:5 crop now, where the strap used to be) */}
      {host?.name && (
        <div style={{ position: 'absolute', left: wide ? 70 : 60, top: wide ? ground + 22 : ground - 150, opacity: strap, transform: `translateX(${(1 - strap) * -60}px)`, display: 'flex', alignItems: 'stretch', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ width: 12, background: pal.accent }} />
          <div style={{ background: '#FFFFFF', padding: '10px 26px 12px' }}>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 40 : 46, color: '#0B1020', lineHeight: 1.35 }}>{clean(host.name)}</div>
            {host.role && <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: wide ? 26 : 30, color: '#4B5568', lineHeight: 1.4 }}>{clean(host.role)}</div>}
          </div>
        </div>
      )}
    </Stage>
  )
}

/** She explains one point: the line on the panel with an icon, or a photo of the product. */
function Speak({ scene, brand, host, voiceAt }) {
  const { wide } = useSet()
  const pal = palette(brand.color)
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose={POSES[scene.gesture] ? scene.gesture : 'present'}>
      <Panel pad={scene.image ? 44 : 56}>
        {scene.image ? <PictureCard src={scene.image} pal={pal} width={wide ? 560 : 580} /> : <IconTile name={scene.icon} size={wide ? 210 : 240} pal={pal} />}
        <Words text={scene.text} delay={12} color="#FFFFFF" style={{ fontSize: fitSize(scene.text, scene.image ? (wide ? 50 : 56) : wide ? 62 : 70), fontWeight: 800, lineHeight: 1.4 }} />
      </Panel>
    </Stage>
  )
}

const LIST_AT = (i) => 22 + i * 26 // sfx.jsx presenterCues pops on these
/** 2-4 points, one after another, while she points at them. */
function List({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const pal = palette(brand.color)
  const items = (scene.items || []).slice(0, 4)
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="point">
      <Panel pad={50}>
        {scene.title && <Words text={scene.title} delay={6} color="#FFFFFF" style={{ fontSize: fitSize(scene.title, wide ? 56 : 62), fontWeight: 800, lineHeight: 1.4 }} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: wide ? 20 : 24 }}>
          {items.map((it, i) => {
            const k = spring({ frame: frame - LIST_AT(i), fps: 30, config: { damping: 13 } })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: Math.min(1, k * 1.5), transform: `translateX(${(1 - k) * 50}px)` }}>
                <div style={{ flex: 'none', width: wide ? 76 : 88, height: wide ? 76 : 88, borderRadius: 24, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={it.icon || 'CircleCheck'} size={wide ? 42 : 48} color={pal.accent} stroke={2.4} />
                </div>
                <div style={text(fitSize(it.text, wide ? 42 : 46), { fontWeight: 600 })}>{clean(it.text)}</div>
              </div>
            )
          })}
        </div>
      </Panel>
    </Stage>
  )
}

const STAT_DONE = 54 // the number has counted up — sfx.jsx dings here
/** A true number counting up on the panel. */
function Stat({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const pal = palette(brand.color)
  const v = Number(scene.value) || 0
  const n = interpolate(frame, [8, STAT_DONE], [0, v], { ...clamp, easing: Easing.out(Easing.cubic) })
  const shown = Number.isInteger(v) ? Math.round(n).toLocaleString('en-US') : n.toFixed(1)
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="thumb">
      <Panel>
        <IconTile name={scene.icon} size={wide ? 100 : 116} pal={pal} />
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: wide ? 150 : 170, color: pal.accent, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {clean(scene.prefix)}
          {shown}
          <span style={{ fontSize: '0.5em' }}>{clean(scene.suffix)}</span>
        </div>
        <Words text={scene.label} delay={14} color="#FFFFFF" style={{ fontSize: fitSize(scene.label, wide ? 52 : 58), fontWeight: 700, lineHeight: 1.4 }} />
      </Panel>
    </Stage>
  )
}

const QA_ANSWER = 30 // the answer card comes in — sfx.jsx blops at 6 and here
/** "People often ask…" — the question in a chat bubble, her answer under it. */
function Qa({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const pal = palette(brand.color)
  const q = spring({ frame: frame - 6, fps: 30, config: { damping: 12 } })
  const a = spring({ frame: frame - QA_ANSWER, fps: 30, config: { damping: 13 } })
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="present">
      <Panel pad={50}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
          <div style={{ flex: 'none', width: 74, height: 74, borderRadius: 37, background: 'rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center' }}>
            <Icon name="MessageCircleQuestion" size={42} color="#FFFFFF" stroke={2.2} />
          </div>
          <div style={{ borderRadius: '8px 30px 30px 30px', background: '#FFFFFF', padding: '18px 28px', ...text(fitSize(scene.q, wide ? 44 : 48), { color: '#0B1020' }) }}>{clean(scene.q)}</div>
        </div>
        <div style={{ alignSelf: 'flex-end', maxWidth: '92%', borderRadius: '30px 8px 30px 30px', background: pal.accent, padding: '20px 30px', opacity: a, transform: `translateY(${(1 - a) * 30}px)`, ...text(fitSize(scene.a, wide ? 42 : 46), { color: pal.onAccent, fontWeight: 600 }) }}>{clean(scene.a)}</div>
      </Panel>
    </Stage>
  )
}

const CTA_BUTTON = 30 // sfx.jsx pops here
/** Bye: the logo, the line, the button — she waves. */
function Cta({ scene, brand, host, voiceAt }) {
  const frame = useCurrentFrame()
  const { wide } = useSet()
  const pal = palette(brand.color)
  const l = spring({ frame: frame - 4, fps: 30, config: { damping: 12 } })
  const b = spring({ frame: frame - CTA_BUTTON, fps: 30, config: { damping: 10 } })
  return (
    <Stage brand={brand} host={host} scene={scene} voiceAt={voiceAt} pose="wave" smile>
      <Panel>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: wide ? 34 : 42 }}>
          {brand.logo && (
            <div style={{ background: '#FFFFFF', borderRadius: 10, padding: '20px 34px', transform: `scale(${l})` }}>
              <Img src={srcOf(brand.logo)} style={{ height: wide ? 92 : 110, maxWidth: 420, objectFit: 'contain' }} />
            </div>
          )}
          <Words text={scene.text} delay={10} align="center" color="#FFFFFF" style={{ fontSize: fitSize(scene.text, wide ? 60 : 68), fontWeight: 800, lineHeight: 1.4, justifyContent: 'center', textAlign: 'center' }} />
          {scene.button && (
            <div style={{ padding: '22px 58px', borderRadius: 999, background: pal.accent, color: pal.onAccent, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 44 : 50, opacity: Math.min(1, b * 1.5), transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.025)})` }}>{clean(scene.button)}</div>
          )}
        </div>
      </Panel>
    </Stage>
  )
}

/** [frame, sound] cues for a scene — the frames the scenes above animate on (sfx.jsx). */
export function presenterCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[10, 'blop'], [16, 'pop'], [22, 'pop']]
    case 'list':
      return (scene.items || []).slice(0, 4).map((_, i) => [LIST_AT(i), 'pop'])
    case 'stat':
      return [[6, 'pop'], [STAT_DONE, 'ding']]
    case 'qa':
      return [[6, 'blop'], [QA_ANSWER, 'blop']]
    case 'cta':
      return scene.button ? [[4, 'pop'], [CTA_BUTTON, 'pop']] : [[4, 'pop']]
    default: // speak
      return [[6, 'pop']]
  }
}

export const PRESENTER = {
  scenes: { hook: Hook, speak: Speak, list: List, stat: Stat, qa: Qa, cta: Cta },
  root: { backgroundColor: '#070B16' },
  light: false, // the white logo chip top-left (Chrome)
  captionTop: (h) => (h < 1200 ? h - 160 : 1665),
}
