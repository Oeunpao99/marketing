/**
 * "3D · Spotlight" — a product on a real 3D stage (three.js via @remotion/three):
 * a dark studio, a beam of light from above, and the brand kit's product photo
 * on a box that turns under it — it flies in, shows its sides, lands for the
 * price and spins once for the close. The words are page text over the 3D
 * (never drawn into it), so Khmer always renders right.
 *
 * Same scenes as Offer (app/motion.py SPOTLIGHT_PROMPT / OFFER_TYPES):
 *   { type: "hook",  text, icon, image? }                     the box flies in under the light
 *   { type: "list",  title, items: [{ icon, text }] }        the box turns at the side, 3 cards land
 *   { type: "offer", plan, price, period, was, badge, features, image? }   the price card beside the box
 *   { type: "stat",  value, prefix, suffix, label, icon }     the number counts up inside two orbiting rings
 *   { type: "cta",   text, button, image? }                    one full spin, the logo and the button
 * No photo in the brand kit → the logo goes on the box; no logo → a plain brand-colour box.
 * 9:16 and 16:9. Rendered with --gl=swangle on the server (no graphics card).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ThreeCanvas } from '@remotion/three'
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import * as THREE from 'three'
import { FONT, Icon, clean, fitSize, srcOf, tint } from './shared'
import { Pop } from './cartoon'

const BG = '#06080F'
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const easeOut = (t) => 1 - (1 - t) ** 3

function useStage() {
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig()
  const wide = W > H
  const u = Math.min(W, H) / 1080
  // what the camera sees at z = 0 (fov 35°, 6 units away)
  const visH = 2 * 6 * Math.tan((35 / 2) * (Math.PI / 180))
  const visW = visH * (W / H)
  // a point on the screen (0..1 across, 0..1 down) → the world at z = 0
  const at = (fx, fy) => [(fx - 0.5) * visW, (0.5 - fy) * visH, 0]
  return { W, H, fps, durationInFrames, wide, u, visH, visW, at }
}

/** The picture for the product box — the photo, else the brand's logo — loaded as
 * a three.js texture BEFORE the 3D canvas is made. (A canvas draws its first
 * frame and doesn't redraw when a picture arrives later, so a box built first
 * and textured after stays plain.) The render is held until the picture is here
 * and the canvas has drawn its first frame (`shown`, two animation frames after
 * the canvas exists). A picture that won't load gives a plain brand-colour box. */
function useFace(image, logo) {
  const src = srcOf(image) || (logo ? srcOf(logo) : null)
  const isPhoto = !!image
  const [state, setState] = useState({ ready: !src, tex: null })
  const hold = useRef(null)
  const release = () => {
    if (hold.current != null) {
      continueRender(hold.current)
      hold.current = null
    }
  }
  useEffect(() => {
    if (!src) return undefined
    hold.current = delayRender(`texture ${String(src).slice(0, 40)}`)
    let cancelled = false
    new THREE.TextureLoader().load(
      src,
      (t) => {
        if (cancelled) return
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        setState({ ready: true, tex: t })
      },
      undefined,
      (err) => {
        console.warn('spotlight: texture failed to load', String(src).slice(0, 60), err?.message || err)
        if (!cancelled) setState({ ready: true, tex: null })
        release()
      },
    )
    return () => {
      cancelled = true
      release()
    }
  }, [src])
  // the canvas is up: let the first frame be drawn, then let the render go on
  const shown = () => requestAnimationFrame(() => requestAnimationFrame(release))
  return { ready: state.ready, shown, face: state.tex ? { tex: state.tex, photo: isPhoto } : null }
}

// ── the 3D pieces ──────────────────────────────────────────────────────────
/** The product box: its photo on the front and back, the brand colour round the sides. */
function ProductBox({ face, color, size = 1.6, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }) {
  const tex = face?.tex || null
  const photo = !!face?.photo
  const side = useMemo(() => new THREE.Color(color || '#E5452F'), [color])
  const aspect = tex?.image ? tex.image.width / tex.image.height : 0.8
  const w = aspect >= 1 ? size : size * aspect
  const h = aspect >= 1 ? size / aspect : size
  const d = Math.min(w, h) * 0.32
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        {[0, 1, 2, 3].map((n) => (
          <meshStandardMaterial key={n} attach={`material-${n}`} color={side} emissive={side} emissiveIntensity={0.35} roughness={0.4} metalness={0.15} />
        ))}
        {tex ? (
          <meshStandardMaterial attach="material-4" map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={photo ? 0.45 : 0.15} roughness={0.4} />
        ) : (
          <meshStandardMaterial attach="material-4" color={side} emissive={side} emissiveIntensity={0.35} roughness={0.3} metalness={0.15} />
        )}
        {tex ? (
          <meshStandardMaterial attach="material-5" map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.3} roughness={0.5} />
        ) : (
          <meshStandardMaterial attach="material-5" color={side} roughness={0.3} metalness={0.2} />
        )}
      </mesh>
    </group>
  )
}

/** A thin glowing ring in the brand colour. */
function Ring({ radius = 1.2, color, position = [0, 0, 0], rotation = [0, 0, 0], opacity = 1 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <torusGeometry args={[radius, 0.018, 16, 120]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

/** The lights every scene shares: soft fill, a key light from above-front, a brand-colour rim from behind. */
function Lights({ color }) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2.5, 4, 5]} intensity={3.2} />
      <directionalLight position={[-3, 1, 4]} intensity={1.4} color="#FFE9D0" />
      <pointLight position={[-3, 1.5, -2.5]} intensity={30} color={color} distance={12} />
      <pointLight position={[3, -1, -2]} intensity={14} color="#7FB4FF" distance={10} />
    </>
  )
}

/** The 3D layer, full frame. Give it `image` / `logo` and its children as a
 * function of the product's face: {(face) => <ProductBox face={face} …/>}. */
function Stage3D({ children, color, image, logo }) {
  const { W, H } = useStage()
  const f = useFace(image, logo)
  if (!f.ready) return null // the canvas is made once the picture is here
  return (
    <AbsoluteFill>
      <ThreeCanvas linear width={W} height={H} camera={{ fov: 35, position: [0, 0, 6] }} gl={{ antialias: true, alpha: true }} onCreated={f.shown}>
        <Lights color={color} />
        {typeof children === 'function' ? children(f.face) : children}
      </ThreeCanvas>
    </AbsoluteFill>
  )
}

// ── the 2D studio round it ────────────────────────────────────────────────
/** Dark studio, a beam of light from above onto (fx, fy), a glow on the floor. */
function Studio({ color, fx = 0.5, fy = 0.55, children }) {
  const frame = useCurrentFrame()
  const { W, H, u } = useStage()
  const flicker = 0.92 + Math.sin(frame / 9) * 0.04
  const beamW = Math.min(W, H) * 0.9
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 40%, #121829 0%, ${BG} 70%)`, overflow: 'hidden' }}>
      {/* the beam: a soft trapezoid of light from the top */}
      <div
        style={{
          position: 'absolute',
          left: W * fx - beamW / 2,
          top: 0,
          width: beamW,
          height: H * fy + 120 * u,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.20), rgba(255,255,255,0.05) 70%, transparent)',
          clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)',
          filter: `blur(${18 * u}px)`,
          opacity: flicker,
        }}
      />
      {/* the floor glow under the product */}
      <div
        style={{
          position: 'absolute',
          left: W * fx - 380 * u,
          top: H * fy + 150 * u,
          width: 760 * u,
          height: 140 * u,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${tint(color, 0.55)} 0%, ${tint(color, 0.12)} 45%, transparent 70%)`,
          filter: `blur(${10 * u}px)`,
        }}
      />
      {/* dust in the light */}
      {Array.from({ length: 14 }, (_, i) => {
        const x = W * fx + Math.sin(i * 12.9) * beamW * 0.35
        const y = ((i * 97 + frame * (0.6 + (i % 4) * 0.25)) % (H * fy)) + 20 * u
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 4 * u, height: 4 * u, borderRadius: 9, background: 'white', opacity: 0.25 + (i % 3) * 0.12 }} />
      })}
      {children}
    </AbsoluteFill>
  )
}

/** The words: white, key words in the brand colour, popping in. */
function Title({ text, top, size, width, delay = 0.2, color }) {
  const { W } = useStage()
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: (W - width) / 2, top, width, display: 'flex', justifyContent: 'center', textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
      <Pop text={text} size={size} width={width} delay={delay} color="#FFFFFF" accent={color} step={2} />
    </div>
  )
}

// ── the scenes ─────────────────────────────────────────────────────────────
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, wide, u, W, at } = useStage()
  const t = easeOut(interpolate(frame, [0, 1.4 * fps], [0, 1], clamp))
  const spin = interpolate(frame, [0, 1.4 * fps], [-Math.PI * 2.4, 0.42], { ...clamp, easing: easeOut }) + Math.sin(frame / 22) * 0.12
  const fy = wide ? 0.6 : 0.6
  const [x, y] = at(0.5, fy)
  return (
    <Studio color={brand.color} fy={fy}>
      <Stage3D color={brand.color} image={scene.image} logo={brand.logo}>
        {(face) => (
          <>
        <ProductBox face={face} color={brand.color} size={wide ? 1.5 : 1.25} position={[x, y - (1 - t) * 3 + Math.sin(frame / 18) * 0.04, 0]} rotation={[0.08, spin, -0.04]} scale={0.6 + 0.4 * t} />
        <Ring radius={wide ? 1.3 : 1.05} color={brand.color} position={[x, y - (wide ? 0.78 : 0.72), 0]} rotation={[Math.PI / 2.2, 0, frame / 40]} opacity={0.8 * t} />
      </>
        )}
      </Stage3D>
      <Title text={scene.text} top={(wide ? 60 : 230) * u} size={(wide ? 84 : 96) * u} width={W * (wide ? 0.8 : 0.9)} color={brand.color} />
    </Studio>
  )
}

function List({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, wide, u, W, H, at } = useStage()
  const items = (scene.items || []).slice(0, 4)
  const fx = wide ? 0.27 : 0.5
  const fy = wide ? 0.55 : 0.36
  const [x, y] = at(fx, fy)
  const turn = interpolate(frame, [0, 3 * fps], [-0.9, 0.9], { ...clamp, easing: (q) => q * q * (3 - 2 * q) })
  const cardsLeft = wide ? W * 0.48 : W * 0.08
  const cardsTop = wide ? H * 0.28 : H * 0.55
  const cardW = wide ? W * 0.46 : W * 0.84
  return (
    <Studio color={brand.color} fx={fx} fy={fy}>
      <Stage3D color={brand.color} image={scene.image} logo={brand.logo}>
        {(face) => (
          <>
        <ProductBox face={face} color={brand.color} size={wide ? 1.4 : 1.0} position={[x, y + Math.sin(frame / 18) * 0.05, 0]} rotation={[0.1, turn, 0]} />
      </>
        )}
      </Stage3D>
      <Title text={scene.title} top={(wide ? 50 : 150) * u} size={(wide ? 64 : 72) * u} width={W * 0.86} color={brand.color} />
      <div style={{ position: 'absolute', left: cardsLeft, top: cardsTop, width: cardW, display: 'flex', flexDirection: 'column', gap: 22 * u }}>
        {items.map((it, i) => {
          const s = spring({ frame: frame - Math.round((0.5 + i * 0.35) * fps), fps, config: { damping: 14, mass: 0.6 } })
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24 * u,
                padding: `${22 * u}px ${28 * u}px`,
                borderRadius: 28 * u,
                background: 'rgba(255,255,255,0.07)',
                border: `${2 * u}px solid rgba(255,255,255,0.14)`,
                boxShadow: `0 ${16 * u}px ${40 * u}px rgba(0,0,0,0.35)`,
                transform: `perspective(${1200 * u}px) translateX(${(1 - s) * 140 * u}px) rotateY(${(1 - s) * -35}deg)`,
                opacity: Math.min(1, s * 1.4),
              }}
            >
              <span style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 76 * u, height: 76 * u, borderRadius: 22 * u, background: tint(brand.color, 0.22), border: `${2 * u}px solid ${tint(brand.color, 0.6)}` }}>
                <Icon name={it.icon || 'Check'} size={40 * u} color="#FFFFFF" stroke={2.2} />
              </span>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: fitSize(it.text, (wide ? 42 : 46) * u), color: 'white', lineHeight: 1.45 }}>{clean(it.text)}</span>
            </div>
          )
        })}
      </div>
    </Studio>
  )
}

function Offer({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, wide, u, W, H, at } = useStage()
  const fx = wide ? 0.3 : 0.5
  const fy = wide ? 0.55 : 0.3
  const [x, y] = at(fx, fy)
  const land = spring({ frame, fps, config: { damping: 12, mass: 0.8 } })
  const card = spring({ frame: frame - Math.round(0.45 * fps), fps, config: { damping: 13 } })
  const spin = 0.5 + Math.sin(frame / 26) * 0.35
  const cardW = wide ? W * 0.4 : W * 0.84
  const cardLeft = wide ? W * 0.55 : (W - cardW) / 2
  const cardTop = wide ? H * 0.16 : H * 0.495 // tall: the card ends by ~1480 — clear of the subtitles in the Facebook feed's crop
  return (
    <Studio color={brand.color} fx={fx} fy={fy}>
      <Stage3D color={brand.color} image={scene.image} logo={brand.logo}>
        {(face) => (
          <>
        <ProductBox face={face} color={brand.color} size={wide ? 1.5 : 1.05} position={[x, y + (1 - land) * 2.5, 0]} rotation={[0.08, spin, 0.03]} />
        <Ring radius={wide ? 1.25 : 0.95} color={brand.color} position={[x, y - (wide ? 0.78 : 0.62), 0]} rotation={[Math.PI / 2.15, 0, -frame / 50]} />
      </>
        )}
      </Stage3D>
      <div
        style={{
          position: 'absolute',
          left: cardLeft,
          top: cardTop,
          width: cardW,
          padding: wide ? `${40 * u}px ${44 * u}px` : `${30 * u}px ${44 * u}px`,
          borderRadius: 40 * u,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
          border: `${2 * u}px solid rgba(255,255,255,0.18)`,
          boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.5), 0 0 ${60 * u}px ${tint(brand.color, 0.25)}`,
          fontFamily: FONT,
          color: 'white',
          transform: `perspective(${1400 * u}px) rotateY(${(1 - card) * 30 + (wide ? -6 : 0)}deg) translateY(${(1 - card) * 80 * u}px)`,
          opacity: Math.min(1, card * 1.4),
        }}
      >
        {scene.badge && (
          <div style={{ display: 'inline-block', padding: `${6 * u}px ${20 * u}px`, borderRadius: 999, background: brand.color, fontWeight: 800, fontSize: fitSize(scene.badge, 30 * u), lineHeight: 1.5 }}>{clean(scene.badge)}</div>
        )}
        {scene.plan && <div style={{ marginTop: 18 * u, fontWeight: 700, fontSize: fitSize(scene.plan, 46 * u), lineHeight: 1.45, opacity: 0.9 }}>{clean(scene.plan)}</div>}
        {scene.price && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * u, marginTop: 6 * u }}>
            <span style={{ fontWeight: 900, fontSize: (wide ? 120 : 112) * u, lineHeight: 1.1, letterSpacing: '-0.03em', textShadow: `0 0 ${30 * u}px ${tint(brand.color, 0.7)}` }}>{clean(scene.price)}</span>
            {scene.period && <span style={{ fontSize: 38 * u, opacity: 0.7 }}>{clean(scene.period)}</span>}
            {scene.was && <span style={{ fontSize: 40 * u, opacity: 0.55, textDecoration: 'line-through' }}>{clean(scene.was)}</span>}
          </div>
        )}
        <div style={{ marginTop: 20 * u, display: 'flex', flexDirection: 'column', gap: 12 * u }}>
          {(scene.features || []).slice(0, 4).map((f, i) => {
            const s = interpolate(frame, [(0.9 + i * 0.25) * fps, (1.1 + i * 0.25) * fps], [0, 1], clamp)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 * u, opacity: s, transform: `translateX(${(1 - s) * 30 * u}px)` }}>
                <Icon name="CircleCheck" size={36 * u} color={brand.color} stroke={2.4} />
                <span style={{ fontWeight: 600, fontSize: fitSize(f, 36 * u), lineHeight: 1.45 }}>{clean(f)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Studio>
  )
}

function Stat({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, wide, u, W, H } = useStage()
  const value = Number(String(scene.value ?? '').replace(/[^\d.]/g, '')) || 0
  const decimals = (String(scene.value).split('.')[1] || '').length
  const n = interpolate(frame, [0.3 * fps, 1.8 * fps], [0, value], { ...clamp, easing: easeOut })
  const shown = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const fy = wide ? 0.5 : 0.42
  return (
    <Studio color={brand.color} fy={fy}>
      <Stage3D color={brand.color}>
        <Ring radius={wide ? 1.7 : 1.05} color={brand.color} position={[0, (0.5 - fy) * 3.78, -0.2]} rotation={[1.1 + Math.sin(frame / 30) * 0.15, frame / 35, 0]} />
        <Ring radius={wide ? 1.45 : 0.9} color="#7FB4FF" position={[0, (0.5 - fy) * 3.78, -0.2]} rotation={[0.4, -frame / 28, 0.6]} opacity={0.8} />
      </Stage3D>
      <div style={{ position: 'absolute', left: 0, right: 0, top: H * fy - 120 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT, color: 'white' }}>
        <div style={{ fontWeight: 900, fontSize: (wide ? 170 : 180) * u, lineHeight: 1.1, letterSpacing: '-0.03em', textShadow: `0 0 ${40 * u}px ${tint(brand.color, 0.8)}` }}>
          {clean(scene.prefix)}
          {shown}
          {clean(scene.suffix)}
        </div>
      </div>
      <Title text={scene.label} top={H * fy + (wide ? 120 : 150) * u} size={(wide ? 56 : 62) * u} width={W * 0.84} color={brand.color} delay={0.6} />
    </Studio>
  )
}

function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { fps, wide, u, W, H, at } = useStage()
  const fy = wide ? 0.6 : 0.36
  const [x, y] = at(wide ? 0.3 : 0.5, fy)
  const spin = interpolate(frame, [0, 1.6 * fps], [0, Math.PI * 2 + 0.35], { ...clamp, easing: easeOut })
  const b = spring({ frame: frame - Math.round(0.9 * fps), fps, config: { damping: 11 } })
  const textLeft = wide ? W * 0.52 : W * 0.06
  const textW = wide ? W * 0.44 : W * 0.88
  return (
    <Studio color={brand.color} fx={wide ? 0.3 : 0.5} fy={fy}>
      <Stage3D color={brand.color} image={scene.image} logo={brand.logo}>
        {(face) => (
          <>
        <ProductBox face={face} color={brand.color} size={wide ? 1.5 : 1.1} position={[x, y + Math.sin(frame / 18) * 0.04, 0]} rotation={[0.06, spin, 0]} />
        <Ring radius={wide ? 1.25 : 1.0} color={brand.color} position={[x, y - (wide ? 0.78 : 0.68), 0]} rotation={[Math.PI / 2.2, 0, frame / 40]} />
      </>
        )}
      </Stage3D>
      <div style={{ position: 'absolute', left: textLeft, width: textW, top: wide ? H * 0.22 : H * 0.6, display: 'flex', flexDirection: 'column', alignItems: wide ? 'flex-start' : 'center', gap: 28 * u }}>
        {brand.logo && <Img src={srcOf(brand.logo)} style={{ height: 96 * u, maxWidth: 380 * u, objectFit: 'contain', background: 'white', borderRadius: 20 * u, padding: 14 * u, opacity: Math.min(1, b * 1.5) }} />}
        <Pop text={scene.text} size={(wide ? 70 : 78) * u} width={textW} color="#FFFFFF" accent={brand.color} align={wide ? 'left' : 'center'} delay={0.3} />
        {scene.button && (
          <div style={{ padding: `${22 * u}px ${60 * u}px`, borderRadius: 999, background: brand.color, color: 'white', fontFamily: FONT, fontWeight: 800, fontSize: 46 * u, lineHeight: 1.45, boxShadow: `0 0 ${50 * u}px ${tint(brand.color, 0.7)}`, transform: `scale(${b * (1 + Math.sin(frame / 8) * 0.025)})` }}>{clean(scene.button)}</div>
        )}
      </div>
    </Studio>
  )
}

export const SPOTLIGHT = {
  scenes: { hook: Hook, list: List, offer: Offer, stat: Stat, cta: Cta },
  root: { backgroundColor: BG },
  light: false, // the dark logo chip
  captionTop: (h) => (h < 1200 ? h - 150 : 1660),
}
