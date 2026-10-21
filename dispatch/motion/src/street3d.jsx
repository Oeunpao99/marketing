/**
 * "3D · Street" — a low-poly Cambodian street at dusk in real 3D (three.js via
 * @remotion/three): two shophouses side by side — a rival one, shutter half
 * down, and the brand's, lit up under a striped awning in its colour with its
 * name on the sign. People walk to the brand's shop, a board on its front
 * counts what matters, customers' messages float up in front of it, and the
 * camera cranes up to the sign for the close.
 *
 * Built by the rules of a deterministic 3D Remotion video: every move comes
 * from the frame (never useFrame / Math.random / clocks), randomness from
 * remotion's random(seed), the camera set from keyframes in a CameraRig, text
 * IN the world (signs, the board, chat bubbles) drawn on canvases once the
 * fonts are in, and titles / captions as page text over the canvas.
 *
 * Scenes (app/motion.py STREET_TYPES): hook · shops (sides: the two shops) ·
 * crowd (a number counting on the board) · chatter (messages) · cta.
 * 9:16 and 16:9. Rendered with --gl=swangle on the server (no graphics card).
 */
import { useEffect, useMemo, useState } from 'react'
import { ThreeCanvas } from '@remotion/three'
import { useThree } from '@react-three/fiber'
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import * as THREE from 'three'
import { FONT, clean, fitSize, fontsReady } from './shared'
import { Pop } from './cartoon'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ease = Easing.inOut(Easing.cubic)
const SHOP_X = 2.3 // the brand's shop at +x, the rival at -x
const SKY = { top: '#2B2458', mid: '#7A4F8F', low: '#F2A36B' }
const RIVAL = '#8E9AA8'
const CLOTHES = ['#3B7DD8', '#E0533D', '#3FA36B', '#F2B830', '#8A5CD0', '#1E9AA0', '#E2588E', '#F28C28']
const SKINS = ['#F2CBA4', '#E2AD82', '#C68A5E', '#9C6644']

// sound cue frames (sfx.jsx streetCues) — the animations below use the same
const TITLE_AT = 6
const LABEL_AT = 18
const COUNT_AT = 20
const COUNT_LEN = 60
const MSG_AT = (i) => 14 + i * 22
const BUTTON_AT = 30

export function streetCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[TITLE_AT + 4, 'pop']]
    case 'shops':
      return [[LABEL_AT, 'pop'], [LABEL_AT + 8, 'pop']]
    case 'crowd': {
      if (!scene.value) return [] // no number: no board, no ticks
      const out = []
      for (let f = COUNT_AT; f < COUNT_AT + COUNT_LEN - 6; f += 8) out.push([f, 'tick'])
      return [...out, [COUNT_AT + COUNT_LEN, 'ding']]
    }
    case 'chatter':
      return (scene.messages || []).slice(0, 3).map((_, i) => [MSG_AT(i), 'blop'])
    case 'cta':
      return scene.button ? [[8, 'pop'], [BUTTON_AT, 'pop']] : [[8, 'pop']]
    default:
      return []
  }
}

function useStage() {
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  // a tall frame is narrow: the camera stands further back to keep both shops in
  return { W, H, fps, durationInFrames, wide, u, far: wide ? 0.86 : 1.14, fov: wide ? 38 : 50 }
}

// ── the camera ─────────────────────────────────────────────────────────────
/** The camera at a scene's frame: [{at: 0..1 of the scene, pos, look}] eased between keys. */
function cameraAt(keys, t) {
  const i = keys.findIndex((k) => k.at > t)
  if (i === 0) return keys[0]
  if (i < 0) return keys[keys.length - 1]
  const a = keys[i - 1]
  const b = keys[i]
  const k = ease(interpolate(t, [a.at, b.at], [0, 1], clamp))
  const mix = (p, q) => p.map((v, n) => v + (q[n] - v) * k)
  return { pos: mix(a.pos, b.pos), look: mix(a.look, b.look) }
}

function CameraRig({ pos, look, fov }) {
  const camera = useThree((s) => s.camera)
  camera.position.set(...pos)
  camera.fov = fov
  camera.updateProjectionMatrix()
  camera.lookAt(...look)
  return null
}

/** A world point → where it is on the page (for the page text pinned over the 3D). */
function project(p, cam, W, H, fov) {
  const c = new THREE.PerspectiveCamera(fov, W / H, 0.1, 200)
  c.position.set(...cam.pos)
  c.lookAt(...cam.look)
  c.updateMatrixWorld()
  const v = new THREE.Vector3(...p).project(c)
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]
}

// ── text on canvases (made once per text, after the fonts are in) ─────────
function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** ``text`` as large as fits ``maxW`` (from ``size`` down). */
function fitFont(ctx, text, size, maxW, weight = 800) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px ${FONT}`
    s -= 4
  } while (ctx.measureText(text).width > maxW && s > 16)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const signTexture = (text, bg, fg) =>
  canvasTexture(1024, 200, (ctx, w, h) => {
    ctx.fillStyle = bg
    roundRect(ctx, 6, 6, w - 12, h - 12, 28)
    ctx.fill()
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.stroke()
    const t = clean(text)
    if (!t) return
    fitFont(ctx, t, 110, w - 120)
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, w / 2, h / 2 + 6)
  })

const stripeTexture = (color) =>
  canvasTexture(256, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#FFF6E6' : color
      ctx.fillRect((i * w) / 8, 0, w / 8 + 1, h)
    }
  })

/** A customer's message: a white bubble, up to three lines. */
const bubbleTexture = (text) =>
  canvasTexture(1024, 420, (ctx, w, h) => {
    const t = clean(text)
    ctx.font = `700 78px ${FONT}`
    // break between words (spaces, and the zero-width spaces between Khmer words)
    const words = String(text || '').replace(/[⟦⟧]/g, '').split(/(?<=[\s​])/)
    const lines = []
    let cur = ''
    for (const wd of words) {
      if (ctx.measureText((cur + wd).trim()).width > w - 140 && cur) {
        lines.push(cur.trim())
        cur = wd
      } else cur += wd
    }
    if (cur.trim()) lines.push(cur.trim())
    const shown = lines.slice(0, 3)
    const boxH = 56 + shown.length * 92
    ctx.fillStyle = 'white'
    roundRect(ctx, 10, 10, w - 20, boxH, 50)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(110, boxH)
    ctx.lineTo(90, boxH + 60)
    ctx.lineTo(190, boxH)
    ctx.fill()
    ctx.fillStyle = '#1F1A2E'
    ctx.textBaseline = 'middle'
    shown.forEach((ln, i) => ctx.fillText(ln.replace(/​/g, ''), 56, 38 + 46 + i * 92))
    if (!t) ctx.clearRect(0, 0, w, h)
  })

/** The board on the shop's front: a small label and a big number, redrawn each frame. */
function useBoard(label) {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 640
    cv.height = 260
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const draw = (value) => {
      const ctx = cv.getContext('2d')
      ctx.fillStyle = '#14121F'
      roundRect(ctx, 0, 0, 640, 260, 30)
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      fitFont(ctx, clean(label).toUpperCase(), 44, 580, 700)
      ctx.fillText(clean(label).toUpperCase(), 320, 62)
      ctx.fillStyle = '#FFD866'
      fitFont(ctx, value, 140, 580)
      ctx.fillText(value, 320, 168)
      tex.needsUpdate = true
    }
    return { tex, draw }
  }, [label])
}

// ── the world ──────────────────────────────────────────────────────────────
function Box({ size, position, color, emissive, glow = 0, rotation, map }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive || '#000000'} emissiveIntensity={glow} flatShading roughness={0.85} map={map || null} />
    </mesh>
  )
}

/** A two-storey shophouse; its front faces +z at z = 0. */
function Shophouse({ x, color, lit, shutter = 0, sign, stripes, glow = 1 }) {
  const warm = '#FFC277'
  return (
    <group position={[x, 0, 0]}>
      <Box size={[4, 5.4, 3]} position={[0, 2.7, -1.5]} color={color} />
      <Box size={[4.3, 0.45, 3.3]} position={[0, 5.5, -1.5]} color={new THREE.Color(color).multiplyScalar(0.75)} />
      {/* the shop on the ground floor: lit inside, or dark behind its shutter */}
      <Box size={[3.1, 2.2, 0.2]} position={[0, 1.15, 0.02]} color={lit ? warm : '#1C1A26'} emissive={lit ? warm : '#000000'} glow={lit ? 0.9 * glow : 0} />
      {shutter > 0 && <Box size={[3.15, 2.2 * shutter, 0.08]} position={[0, 2.25 - 1.1 * shutter, 0.14]} color="#9AA3AD" />}
      {lit &&
        [-0.9, 0, 0.9].map((dx, i) => <Box key={i} size={[0.6, 0.45, 0.4]} position={[dx, 0.32, 0.4]} color={['#F2B830', '#E0533D', '#3FA36B'][i]} />)}
      {stripes && (
        <mesh position={[0, 2.38, 0.5]} rotation={[0.42, 0, 0]}>
          <boxGeometry args={[3.5, 0.06, 1.0]} />
          <meshStandardMaterial map={stripes} flatShading />
        </mesh>
      )}
      {/* the balcony, its railing carrying the sign */}
      <Box size={[4.1, 0.16, 0.9]} position={[0, 2.62, 0.45]} color="#E9E1D3" />
      {sign && (
        <mesh position={[0, 3.02, 0.91]}>
          <planeGeometry args={[3.4, 0.66]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      )}
      {[-0.95, 0.95].map((dx) => (
        <Box key={dx} size={[1.0, 1.15, 0.06]} position={[dx, 4.25, 0.01]} color={lit ? warm : '#2A2838'} emissive={lit ? warm : '#000000'} glow={lit ? 0.7 * glow : 0} />
      ))}
    </group>
  )
}

function Palm({ x, z, h = 4.2, lean = 0.08 }) {
  return (
    <group position={[x, 0, z]} rotation={[0, 0, lean]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.07, 0.12, h, 6]} />
        <meshStandardMaterial color="#7A5A3E" flatShading />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[0, h, 0]} rotation={[0.9, (i / 7) * Math.PI * 2, 0]}>
          <coneGeometry args={[0.22, 1.5, 4]} />
          <meshStandardMaterial color="#2E7D4F" flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Lamp({ x, z, on }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.9, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 3.8, 6]} />
        <meshStandardMaterial color="#3B3A48" flatShading />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color={on ? [2.2, 1.9, 1.4] : '#bbbbbb'} toneMapped={false} />
      </mesh>
      {on && <pointLight position={[0, 3.6, 0.2]} intensity={6} distance={9} decay={2} color="#FFCF8A" />}
    </group>
  )
}

/** A low-poly person: feet on the ground at (x, z), walking while ``phase`` is a number. */
function Walker({ x, z, phase, turn = 0, seed }) {
  const shirt = CLOTHES[Math.floor(random(`shirt-${seed}`) * CLOTHES.length)]
  const skin = SKINS[Math.floor(random(`skin-${seed}`) * SKINS.length)]
  const pants = random(`pants-${seed}`) > 0.5 ? '#2F3A52' : '#5B4A3A'
  const tall = 0.92 + random(`tall-${seed}`) * 0.16
  const swing = phase == null ? 0 : Math.sin(phase) * 0.55
  const bob = phase == null ? 0 : Math.abs(Math.sin(phase)) * 0.04
  return (
    <group position={[x, bob, z]} rotation={[0, turn, 0]} scale={tall}>
      {[-0.11, 0.11].map((dx, i) => (
        <group key={dx} position={[dx, 0.72, 0]} rotation={[i ? -swing : swing, 0, 0]}>
          <Box size={[0.17, 0.72, 0.2]} position={[0, -0.36, 0]} color={pants} />
        </group>
      ))}
      <Box size={[0.5, 0.62, 0.3]} position={[0, 1.04, 0]} color={shirt} />
      {[-0.32, 0.32].map((dx, i) => (
        <group key={dx} position={[dx, 1.3, 0]} rotation={[i ? swing : -swing, 0, 0]}>
          <Box size={[0.13, 0.55, 0.14]} position={[0, -0.27, 0]} color={shirt} />
        </group>
      ))}
      <Box size={[0.32, 0.34, 0.32]} position={[0, 1.55, 0]} color={skin} />
      <Box size={[0.34, 0.12, 0.34]} position={[0, 1.76, -0.01]} color="#231C18" />
    </group>
  )
}

/** People strolling along the street (the hook's life). */
function Strollers({ frame, n = 4 }) {
  return Array.from({ length: n }, (_, i) => {
    const dir = random(`dir-${i}`) > 0.5 ? 1 : -1
    const speed = 0.018 + random(`sp-${i}`) * 0.012
    const span = 16
    const x = ((((random(`x-${i}`) * span + frame * speed * dir) % span) + span) % span) - span / 2
    return <Walker key={i} x={x} z={1.9 + random(`z-${i}`) * 0.9} phase={frame * 0.35 + i} turn={dir > 0 ? Math.PI / 2 : -Math.PI / 2} seed={`s${i}`} />
  })
}

/** Customers walking up to the brand's shop and waiting in front of it. */
function Customers({ frame, n = 6, delay = 0 }) {
  return Array.from({ length: n }, (_, i) => {
    const start = delay + i * 9
    const walk = 1.6 * 30
    const t = interpolate(frame, [start, start + walk], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) })
    const fromX = -7 - random(`cx-${i}`) * 2
    const toX = SHOP_X - 1.3 + (i % 3) * 1.3 + (random(`jx-${i}`) - 0.5) * 0.3
    const toZ = 1.1 + Math.floor(i / 3) * 0.75
    const moving = t < 1
    const arrived = spring({ frame: frame - start - walk, fps: 30, config: { damping: 14 } })
    return (
      <Walker key={i} x={fromX + (toX - fromX) * t} z={2.6 + (toZ - 2.6) * t} phase={moving ? frame * 0.35 + i : null} turn={(1 - arrived) * (Math.PI / 2) + arrived * Math.PI} seed={`c${i}`} />
    )
  })
}

/** Everything the street has: the two shops, palms, a lamp, the road. */
function Street({ brand, frame, rivalOff = false, glow = 1, children }) {
  const textures = useMemo(
    () => ({ sign: signTexture(brand?.name || '', brand?.color || '#E0533D', '#FFFFFF'), rival: signTexture('', '#C9CDD3', '#333'), stripes: stripeTexture(brand?.color || '#E0533D') }),
    [brand?.name, brand?.color],
  )
  return (
    <>
      <ambientLight intensity={0.55} color="#9A93D6" />
      <hemisphereLight args={['#8C86D8', '#3A2418', 0.6]} />
      <directionalLight position={[-8, 7, 8]} intensity={1.1} color="#FFB98C" />
      <pointLight position={[SHOP_X, 1.4, 1.6]} intensity={12 * glow} distance={8} decay={2} color="#FFC277" />
      {/* far buildings, darker, for depth */}
      {[-9, -5.5, 6, 9.5, 13].map((x, i) => (
        <Box key={x} size={[3.2, 4 + (i % 3) * 1.6, 2]} position={[x, (4 + (i % 3) * 1.6) / 2, -4.5]} color="#4A3E6B" />
      ))}
      <Shophouse x={-SHOP_X} color={RIVAL} lit={!rivalOff} shutter={rivalOff ? 0.6 : 0} sign={textures.rival} glow={0.35} />
      <Shophouse x={SHOP_X} color="#F2D9B5" lit sign={textures.sign} stripes={textures.stripes} glow={glow} />
      {/* the pavement and the road */}
      <Box size={[40, 0.18, 2.4]} position={[0, 0.09, 1.2]} color="#C9BBA6" />
      <Box size={[40, 0.06, 14]} position={[0, 0.0, 9.4]} color="#3E3B4C" />
      {Array.from({ length: 10 }, (_, i) => (
        <Box key={i} size={[1.1, 0.02, 0.12]} position={[-18 + i * 4, 0.05, 5.6]} color="#E8E2D2" />
      ))}
      <Palm x={-5.2} z={1.3} />
      <Palm x={5.4} z={1.4} lean={-0.1} h={4.6} />
      <Lamp x={0} z={2.25} on />
      {children}
      <Strollers frame={frame} n={3} />
    </>
  )
}

/** The 3D layer: made once the fonts are in (its signs are drawn with them). */
function World({ cam, children }) {
  const { W, H, fov } = useStage()
  const [ready, setReady] = useState(false)
  const [hold] = useState(() => delayRender('3D · Street: fonts for the signs'))
  useEffect(() => {
    fontsReady.then(() => setReady(true))
  }, [])
  const shown = () => requestAnimationFrame(() => requestAnimationFrame(() => continueRender(hold)))
  if (!ready) return null
  return (
    <AbsoluteFill>
      <ThreeCanvas linear width={W} height={H} camera={{ fov, near: 0.1, far: 120, position: cam.pos }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }} onCreated={shown}>
        <CameraRig pos={cam.pos} look={cam.look} fov={fov} />
        {children}
      </ThreeCanvas>
    </AbsoluteFill>
  )
}

/** The dusk sky behind the world (page, not 3D), and a soft vignette over it all. */
function Sky({ children }) {
  const frame = useCurrentFrame()
  const { W, H, u } = useStage()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${SKY.top} 0%, ${SKY.mid} 42%, ${SKY.low} 62%, #3E3B4C 62.2%)`, overflow: 'hidden' }}>
      {Array.from({ length: 22 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: random(`star-x-${i}`) * W, top: random(`star-y-${i}`) * H * 0.3, width: 4 * u, height: 4 * u, borderRadius: 9, background: 'white', opacity: 0.35 + 0.45 * Math.abs(Math.sin(frame / 15 + i)) }} />
      ))}
      {children}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 45%, transparent 55%, rgba(10,8,30,0.55) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  )
}

/** The scene's words at the top: white, key words in the brand colour. */
function Title({ text, brand, big = false }) {
  const { W, u, wide } = useStage()
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 56 : 240) * u, display: 'flex', justifyContent: 'center', textShadow: '0 4px 24px rgba(0,0,0,0.85)' }}>
      <Pop text={text} size={(big ? (wide ? 80 : 100) : wide ? 62 : 76) * u} width={W * (wide ? 0.62 : 0.88)} delay={TITLE_AT / 30} color="#FFFFFF" accent={shadeUp(brand?.color)} step={2} />
    </div>
  )
}

/** A brand colour bright enough to read on the dusk sky. */
function shadeUp(hex) {
  const c = new THREE.Color(hex || '#FFD866')
  const hsl = {}
  c.getHSL(hsl)
  return `#${c.setHSL(hsl.h, Math.max(0.6, hsl.s), Math.max(0.62, hsl.l)).getHexString()}`
}

// ── the scenes ─────────────────────────────────────────────────────────────
function useCam(keys) {
  const frame = useCurrentFrame()
  const { durationInFrames, far } = useStage()
  const t = frame / Math.max(1, durationInFrames - 1)
  const c = cameraAt(keys, t)
  // the camera's distance from the street: further back in a tall frame
  return { pos: [c.pos[0], c.pos[1], c.pos[2] * far], look: c.look }
}

function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const cam = useCam([
    { at: 0, pos: [SHOP_X * 0.8, 3.2, 6.5], look: [SHOP_X, 3, 0] },
    { at: 0.75, pos: [0, 4.2, 17.5], look: [0, 2.7, 0] },
    { at: 1, pos: [0, 4.3, 18], look: [0, 2.7, 0] },
  ])
  return (
    <Sky>
      <World cam={cam}>
        <Street brand={brand} frame={frame} />
      </World>
      <Title text={scene.text} brand={brand} big />
    </Sky>
  )
}

function Shops({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, H, u, fov, fps, wide } = useStage()
  const cam = useCam([
    { at: 0, pos: [0, 4.4, 18], look: [0, 2.6, 0] },
    { at: 1, pos: [0, 3.6, 15.5], look: [0, 2.5, 0] },
  ])
  const sides = (scene.sides || []).slice(0, 2)
  return (
    <Sky>
      <World cam={cam}>
        <Street brand={brand} frame={frame} rivalOff glow={1.2} />
      </World>
      {/* each shop's label, pinned over it */}
      {sides.map((side, i) => {
        const [x, y] = project([i ? SHOP_X : -SHOP_X, 6.3, 0], cam, W, H, fov)
        const s = spring({ frame: frame - LABEL_AT - i * 8, fps, config: { damping: 11 } })
        const good = side.tone === 'good'
        return (
          <div key={i} style={{ position: 'absolute', left: x - 260 * u, width: 520 * u, top: Math.max((wide ? 150 : 360) * u, y - 90 * u), display: 'flex', justifyContent: 'center', transform: `scale(${Math.max(0.001, s)})` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${10 * u}px ${26 * u}px`, borderRadius: 999, background: good ? '#2F9E5B' : '#D2483A', color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(side.label, 46 * u), lineHeight: 1.45, boxShadow: `0 ${8 * u}px ${30 * u}px rgba(0,0,0,0.45)`, whiteSpace: 'nowrap' }}>
              <span>{good ? '✓' : '✕'}</span>
              {clean(side.label)}
            </div>
          </div>
        )
      })}
      <Title text={scene.title} brand={brand} />
    </Sky>
  )
}

/** The board: counts from ``start`` to ``value`` on the brand shop's front. */
function Board({ scene, frame }) {
  const board = useBoard(scene.label || '')
  const k = interpolate(frame, [COUNT_AT, COUNT_AT + COUNT_LEN], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const start = Number(scene.start) || 0
  const n = start + ((Number(scene.value) || 0) - start) * k
  board.draw(`${scene.prefix || ''}${Math.round(n).toLocaleString('en-US')}${scene.suffix || ''}`)
  const pop = spring({ frame: frame - 6, fps: 30, config: { damping: 12 } })
  return (
    <mesh position={[SHOP_X, 4.25, 0.3]} scale={Math.max(0.001, pop)}>
      <planeGeometry args={[2.6, 1.05]} />
      <meshBasicMaterial map={board.tex} toneMapped={false} />
    </mesh>
  )
}

function Crowd({ scene, brand }) {
  const frame = useCurrentFrame()
  const cam = useCam([
    { at: 0, pos: [-3, 3.6, 14], look: [0.6, 2.4, 0] },
    { at: 1, pos: [3.4, 3.4, 12.5], look: [SHOP_X - 0.4, 2.6, 0] },
  ])
  return (
    <Sky>
      <World cam={cam}>
        <Street brand={brand} frame={frame} rivalOff glow={1.3}>
          <Customers frame={frame} n={6} delay={4} />
          {scene.value ? <Board scene={scene} frame={frame} /> : null}
        </Street>
      </World>
      <Title text={scene.title} brand={brand} />
    </Sky>
  )
}

/** A message floating up in front of the shop. */
function Message({ text, i, frame }) {
  const tex = useMemo(() => bubbleTexture(text), [text])
  const s = spring({ frame: frame - MSG_AT(i), fps: 30, config: { damping: 11 } })
  const rise = interpolate(frame, [MSG_AT(i), MSG_AT(i) + 120], [0, 0.35], clamp)
  return (
    <mesh position={[SHOP_X + (i % 2 ? 0.3 : -0.3), 6.25 - i * 0.92 + rise, 1.1 + i * 0.1]} scale={Math.max(0.001, s)}>
      <planeGeometry args={[2.5, 1.03]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
}

function Chatter({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide } = useStage()
  const up = wide ? 0.9 : 0
  const cam = useCam([
    { at: 0, pos: [SHOP_X, 4.3 + up, 12], look: [SHOP_X, 4.1 + up, 0] },
    { at: 1, pos: [SHOP_X, 4.4 + up, 10.6], look: [SHOP_X, 4.2 + up, 0] },
  ])
  const msgs = (scene.messages || []).slice(0, 3)
  return (
    <Sky>
      <World cam={cam}>
        <Street brand={brand} frame={frame} rivalOff glow={1.2}>
          <Customers frame={frame + 200} n={6} />
          {msgs.map((m, i) => <Message key={i} text={m.text} i={i} frame={frame} />)}
        </Street>
      </World>
      <Title text={scene.title} brand={brand} />
    </Sky>
  )
}

function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { W, u, wide, fps } = useStage()
  const cam = useCam([
    { at: 0, pos: [SHOP_X, 1.6, 9.5], look: [SHOP_X, 1.8, 0] },
    { at: 0.8, pos: [SHOP_X, 3.4, 8.2], look: [SHOP_X, 3.0, 0] },
    { at: 1, pos: [SHOP_X, 3.45, 8.0], look: [SHOP_X, 3.0, 0] },
  ])
  const b = spring({ frame: frame - BUTTON_AT, fps, config: { damping: 10 } })
  return (
    <Sky>
      <World cam={cam}>
        <Street brand={brand} frame={frame} rivalOff glow={1.4}>
          <Customers frame={frame + 200} n={6} />
        </Street>
      </World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: (wide ? 70 : 250) * u, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 * u, textShadow: '0 4px 24px rgba(0,0,0,0.85)' }}>
        <Pop text={scene.text} size={(wide ? 80 : 92) * u} width={W * (wide ? 0.7 : 0.86)} delay={0.25} color="#FFFFFF" accent={shadeUp(brand?.color)} />
        {scene.button && (
          <div style={{ padding: `${20 * u}px ${60 * u}px`, borderRadius: 999, background: brand?.color || '#E0533D', color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: fitSize(scene.button, 52 * u), boxShadow: `0 ${10 * u}px ${40 * u}px rgba(0,0,0,0.5)`, transform: `scale(${Math.max(0.001, b) * (1 + Math.sin(frame / 7) * 0.02)})`, textShadow: 'none', whiteSpace: 'nowrap' }}>
            {clean(scene.button)}
          </div>
        )}
      </div>
    </Sky>
  )
}

export const STREET = {
  scenes: { hook: Hook, shops: Shops, crowd: Crowd, chatter: Chatter, cta: Cta },
  root: { backgroundColor: SKY.top },
  light: false, // the white logo chip (Chrome)
  captionTop: (h) => (h < 1200 ? h - 150 : 1580),
}
