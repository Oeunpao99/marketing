/**
 * Low-poly 3D things for the 3D templates (street3d.jsx): a coffee cup, a book,
 * a pen, a phone, a scooter, a noodle bowl… each about 1 unit tall, standing
 * on y = 0, facing +z. The AI picks them by name (app/motion.py STREET_PROPS —
 * keep the two lists the same); an unknown name draws nothing.
 * Built only from basic shapes and flat colours — no model files to load.
 */
import * as THREE from 'three'

const M = ({ color, emissive, glow = 0, opacity = 1 }) => (
  <meshStandardMaterial color={color} emissive={emissive || '#000000'} emissiveIntensity={glow} flatShading roughness={0.7} transparent={opacity < 1} opacity={opacity} />
)

function B({ s, p = [0, 0, 0], r, c, e, g }) {
  return (
    <mesh position={p} rotation={r}>
      <boxGeometry args={s} />
      <M color={c} emissive={e} glow={g} />
    </mesh>
  )
}

function Cyl({ rt, rb, h, p = [0, 0, 0], r, c, seg = 12, o }) {
  return (
    <mesh position={p} rotation={r}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
      <M color={c} opacity={o} />
    </mesh>
  )
}

function Ball({ rad, p = [0, 0, 0], c, sc, seg = 10 }) {
  return (
    <mesh position={p} scale={sc}>
      <sphereGeometry args={[rad, seg, Math.max(6, seg - 2)]} />
      <M color={c} />
    </mesh>
  )
}

function Ring({ rad, tube, p = [0, 0, 0], r, c, arc = Math.PI * 2 }) {
  return (
    <mesh position={p} rotation={r}>
      <torusGeometry args={[rad, tube, 8, 24, arc]} />
      <M color={c} />
    </mesh>
  )
}

const WOOD = '#8A5A3B'

// each: ({ color }) → a group, ``color`` = the brand's colour where a thing has one
const THINGS = {
  coffee: () => (
    <group>
      <Cyl rt={0.5} h={0.05} p={[0, 0.025, 0]} c="#F4F1EA" seg={20} />
      <Cyl rt={0.36} rb={0.27} h={0.55} p={[0, 0.33, 0]} c="#FFFFFF" seg={18} />
      <Cyl rt={0.32} h={0.02} p={[0, 0.6, 0]} c="#6B3E26" seg={18} />
      <Ring rad={0.13} tube={0.035} p={[0.36, 0.36, 0]} r={[0, 0, Math.PI / 2]} c="#FFFFFF" />
    </group>
  ),
  iced: ({ color }) => (
    <group>
      <Cyl rt={0.3} rb={0.24} h={0.85} p={[0, 0.43, 0]} c="#B9824F" o={0.92} seg={16} />
      <Cyl rt={0.31} h={0.06} p={[0, 0.88, 0]} c="#F4F1EA" seg={16} />
      <Cyl rt={0.03} h={0.5} p={[0.08, 1.1, 0]} r={[0, 0, -0.18]} c={color} seg={6} />
    </group>
  ),
  book: ({ color }) => (
    <group rotation={[0, 0, 0.12]}>
      <B s={[0.75, 1.0, 0.18]} p={[0, 0.5, 0]} c={color} />
      <B s={[0.68, 0.94, 0.19]} p={[0.04, 0.5, 0]} c="#FFF8E8" />
      <B s={[0.5, 0.08, 0.01]} p={[0, 0.7, 0.1]} c="#FFFFFF" />
    </group>
  ),
  books: ({ color }) => (
    <group>
      <B s={[0.9, 0.16, 0.65]} p={[0, 0.08, 0]} c={color} />
      <B s={[0.82, 0.15, 0.6]} p={[0.04, 0.24, 0]} r={[0, 0.15, 0]} c="#3B7DD8" />
      <B s={[0.86, 0.14, 0.62]} p={[-0.02, 0.38, 0]} r={[0, -0.1, 0]} c="#F2B830" />
      <B s={[0.8, 0.15, 0.58]} p={[0.02, 0.53, 0]} r={[0, 0.2, 0]} c="#3FA36B" />
    </group>
  ),
  pen: ({ color }) => (
    <group position={[0, 0.5, 0]} rotation={[0, 0, -0.9]}>
      <Cyl rt={0.07} h={1.0} c={color} seg={8} />
      <mesh position={[0, -0.58, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.07, 0.16, 8]} />
        <M color="#E9E1D3" />
      </mesh>
      <B s={[0.03, 0.3, 0.05]} p={[0.08, 0.3, 0]} c="#C9CDD3" />
    </group>
  ),
  phone: () => (
    <group position={[0, 0.55, 0]} rotation={[0, 0, 0.08]}>
      <B s={[0.55, 1.05, 0.08]} c="#22222B" />
      <B s={[0.48, 0.92, 0.01]} p={[0, 0, 0.045]} c="#6FB7F0" e="#6FB7F0" g={0.8} />
    </group>
  ),
  laptop: () => (
    <group>
      <B s={[1.2, 0.06, 0.8]} p={[0, 0.03, 0]} c="#9AA3AD" />
      <group position={[0, 0.06, -0.38]} rotation={[-0.3, 0, 0]}>
        <B s={[1.2, 0.8, 0.05]} p={[0, 0.4, 0]} c="#9AA3AD" />
        <B s={[1.08, 0.68, 0.01]} p={[0, 0.4, 0.03]} c="#7FC1F2" e="#7FC1F2" g={0.8} />
      </group>
    </group>
  ),
  bag: ({ color }) => (
    <group>
      <B s={[0.8, 0.85, 0.36]} p={[0, 0.43, 0]} c={color} />
      <Ring rad={0.18} tube={0.03} p={[0, 0.86, 0]} c="#FFFFFF" arc={Math.PI} />
    </group>
  ),
  box: () => (
    <group>
      <B s={[0.9, 0.7, 0.7]} p={[0, 0.35, 0]} c="#C89A5E" />
      <B s={[0.16, 0.72, 0.72]} p={[0, 0.35, 0]} c="#E8C48A" />
    </group>
  ),
  noodles: () => (
    <group>
      <Cyl rt={0.48} rb={0.24} h={0.42} p={[0, 0.21, 0]} c="#F4F1EA" seg={18} />
      <Cyl rt={0.44} h={0.04} p={[0, 0.42, 0]} c="#E8B85A" seg={18} />
      <Ball rad={0.08} p={[0.15, 0.46, 0.1]} c="#3FA36B" />
      <Ball rad={0.09} p={[-0.12, 0.46, -0.05]} c="#E0533D" />
      {[0.06, -0.06].map((dz) => <Cyl key={dz} rt={0.02} h={0.9} p={[0.25, 0.65, dz]} r={[0, 0, -0.6]} c={WOOD} seg={5} />)}
    </group>
  ),
  rice: () => (
    <group>
      <Cyl rt={0.45} rb={0.24} h={0.4} p={[0, 0.2, 0]} c="#3B7DD8" seg={18} />
      <Ball rad={0.42} p={[0, 0.4, 0]} sc={[1, 0.5, 1]} c="#FFFFFF" />
    </group>
  ),
  cake: () => (
    <group>
      <Cyl rt={0.5} h={0.3} p={[0, 0.15, 0]} c="#F6C7D6" seg={20} />
      <Cyl rt={0.5} h={0.06} p={[0, 0.33, 0]} c="#FFFFFF" seg={20} />
      <Cyl rt={0.38} h={0.26} p={[0, 0.49, 0]} c="#F6C7D6" seg={20} />
      <Ball rad={0.08} p={[0, 0.68, 0]} c="#D8423A" />
    </group>
  ),
  bread: () => (
    <group>
      <Ball rad={0.45} p={[0, 0.25, 0]} sc={[1.3, 0.6, 0.75]} c="#D99A55" />
      {[-0.25, 0, 0.25].map((x) => <B key={x} s={[0.05, 0.03, 0.4]} p={[x, 0.5, 0]} r={[0, 0.4, 0]} c="#B8763A" />)}
    </group>
  ),
  fruit: () => (
    <group>
      <Ball rad={0.28} p={[-0.25, 0.28, 0]} c="#F28C28" />
      <Ball rad={0.26} p={[0.27, 0.27, 0.05]} sc={[1, 1.25, 1]} c="#F2C230" />
      <Ball rad={0.24} p={[0, 0.62, 0]} c="#7BC043" />
    </group>
  ),
  flower: ({ color }) => (
    <group>
      <Cyl rt={0.3} rb={0.22} h={0.4} p={[0, 0.2, 0]} c="#C8693E" seg={10} />
      {[[-0.12, 0.85], [0.1, 0.95], [0.02, 0.75]].map(([x, y], i) => (
        <group key={i}>
          <Cyl rt={0.02} h={y - 0.35} p={[x, (y + 0.4) / 2, 0]} c="#3FA36B" seg={5} />
          <Ball rad={0.13} p={[x, y, 0]} c={i === 1 ? color : i ? '#F2B830' : '#E2588E'} />
        </group>
      ))}
    </group>
  ),
  plant: () => (
    <group>
      <Cyl rt={0.3} rb={0.22} h={0.4} p={[0, 0.2, 0]} c="#C8693E" seg={10} />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin(i * 1.3) * 0.12, 0.7, Math.cos(i * 1.3) * 0.12]} rotation={[Math.cos(i * 1.3) * 0.5, 0, -Math.sin(i * 1.3) * 0.5]}>
          <coneGeometry args={[0.12, 0.7, 4]} />
          <M color={i % 2 ? '#2E7D4F' : '#3FA36B'} />
        </mesh>
      ))}
    </group>
  ),
  shirt: ({ color }) => (
    <group position={[0, 0.5, 0]}>
      <B s={[0.6, 0.75, 0.08]} c={color} />
      <B s={[0.32, 0.22, 0.08]} p={[-0.4, 0.22, 0]} r={[0, 0, 0.5]} c={color} />
      <B s={[0.32, 0.22, 0.08]} p={[0.4, 0.22, 0]} r={[0, 0, -0.5]} c={color} />
      <B s={[0.2, 0.06, 0.09]} p={[0, 0.36, 0.01]} c="#FFFFFF" />
    </group>
  ),
  shoe: ({ color }) => (
    <group>
      <B s={[0.36, 0.1, 0.9]} p={[0, 0.05, 0]} c="#FFFFFF" />
      <B s={[0.34, 0.3, 0.6]} p={[0, 0.25, -0.12]} c={color} />
      <B s={[0.34, 0.16, 0.32]} p={[0, 0.17, 0.3]} c={color} />
    </group>
  ),
  money: () => (
    <group>
      {[0, 1, 2, 3].map((i) => <B key={i} s={[0.9, 0.08, 0.45]} p={[0, 0.04 + i * 0.09, 0]} r={[0, i * 0.12, 0]} c={i % 2 ? '#4FB06D' : '#3E9A5B'} />)}
    </group>
  ),
  coins: () => (
    <group>
      {[0, 1, 2, 3, 4].map((i) => <Cyl key={i} rt={0.32} h={0.08} p={[(i % 2) * 0.03, 0.04 + i * 0.09, 0]} c="#F2C230" seg={16} />)}
      <Cyl rt={0.32} h={0.08} p={[0.5, 0.04, 0.1]} c="#F2C230" seg={16} />
    </group>
  ),
  gift: ({ color }) => (
    <group>
      <B s={[0.8, 0.7, 0.8]} p={[0, 0.35, 0]} c={color} />
      <B s={[0.14, 0.72, 0.82]} p={[0, 0.35, 0]} c="#FFD866" />
      <B s={[0.82, 0.72, 0.14]} p={[0, 0.35, 0]} c="#FFD866" />
      <Ring rad={0.12} tube={0.04} p={[-0.1, 0.78, 0]} r={[0, 0, 0.6]} c="#FFD866" />
      <Ring rad={0.12} tube={0.04} p={[0.1, 0.78, 0]} r={[0, 0, -0.6]} c="#FFD866" />
    </group>
  ),
  bottle: ({ color }) => (
    <group>
      <Cyl rt={0.22} h={0.75} p={[0, 0.375, 0]} c="#9FD3F5" o={0.85} seg={14} />
      <Cyl rt={0.23} h={0.3} p={[0, 0.4, 0]} c={color} seg={14} />
      <Cyl rt={0.08} rb={0.2} h={0.18} p={[0, 0.84, 0]} c="#9FD3F5" o={0.85} seg={12} />
      <Cyl rt={0.09} h={0.1} p={[0, 0.97, 0]} c={color} seg={12} />
    </group>
  ),
  medicine: () => (
    <group>
      <Cyl rt={0.26} h={0.6} p={[0, 0.3, 0]} c="#F28C28" o={0.9} seg={14} />
      <Cyl rt={0.28} h={0.16} p={[0, 0.68, 0]} c="#FFFFFF" seg={14} />
      <B s={[0.46, 0.25, 0.02]} p={[0, 0.3, 0.26]} c="#FFFFFF" />
      <Ball rad={0.07} p={[0.45, 0.07, 0.1]} sc={[1.6, 1, 1]} c="#FFFFFF" />
    </group>
  ),
  house: ({ color }) => (
    <group>
      <B s={[0.9, 0.6, 0.8]} p={[0, 0.3, 0]} c="#F2D9B5" />
      <mesh position={[0, 0.82, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.78, 0.45, 4]} />
        <M color={color} />
      </mesh>
      <B s={[0.2, 0.32, 0.02]} p={[0, 0.16, 0.41]} c={WOOD} />
    </group>
  ),
  car: ({ color }) => (
    <group>
      <B s={[1.4, 0.36, 0.7]} p={[0, 0.32, 0]} c={color} />
      <B s={[0.8, 0.3, 0.64]} p={[-0.05, 0.63, 0]} c="#BFE3F5" />
      {[[-0.45, 0.36], [0.45, 0.36], [-0.45, -0.36], [0.45, -0.36]].map(([x, z]) => <Cyl key={`${x}${z}`} rt={0.16} h={0.12} p={[x, 0.16, z]} r={[Math.PI / 2, 0, 0]} c="#22222B" seg={10} />)}
    </group>
  ),
  scooter: ({ color }) => (
    <group>
      {[-0.45, 0.45].map((x) => <Ring key={x} rad={0.2} tube={0.06} p={[x, 0.22, 0]} c="#22222B" />)}
      <B s={[0.7, 0.12, 0.3]} p={[0, 0.3, 0]} c={color} />
      <B s={[0.4, 0.35, 0.32]} p={[-0.25, 0.48, 0]} c={color} />
      <B s={[0.35, 0.08, 0.3]} p={[-0.25, 0.7, 0]} c="#22222B" />
      <Cyl rt={0.03} h={0.7} p={[0.42, 0.6, 0]} r={[0, 0, 0.3]} c="#9AA3AD" seg={6} />
      <B s={[0.05, 0.05, 0.5]} p={[0.32, 0.95, 0]} c="#22222B" />
    </group>
  ),
  bicycle: ({ color }) => (
    <group>
      {[-0.45, 0.45].map((x) => <Ring key={x} rad={0.3} tube={0.03} p={[x, 0.32, 0]} c="#22222B" />)}
      <Cyl rt={0.025} h={0.75} p={[0, 0.45, 0]} r={[0, 0, Math.PI / 2.6]} c={color} seg={6} />
      <Cyl rt={0.025} h={0.55} p={[-0.18, 0.5, 0]} r={[0, 0, -0.5]} c={color} seg={6} />
      <B s={[0.2, 0.05, 0.1]} p={[-0.1, 0.78, 0]} c="#22222B" />
      <B s={[0.04, 0.04, 0.4]} p={[0.32, 0.8, 0]} c="#22222B" />
    </group>
  ),
  camera: () => (
    <group position={[0, 0.35, 0]}>
      <B s={[0.9, 0.55, 0.4]} c="#2A2838" />
      <Cyl rt={0.22} h={0.3} p={[0, 0, 0.3]} r={[Math.PI / 2, 0, 0]} c="#4A4858" seg={16} />
      <Cyl rt={0.15} h={0.02} p={[0, 0, 0.46]} r={[Math.PI / 2, 0, 0]} c="#7FC1F2" seg={16} />
      <B s={[0.2, 0.1, 0.12]} p={[-0.3, 0.32, 0]} c="#E0533D" />
    </group>
  ),
  clock: ({ color }) => (
    <group position={[0, 0.5, 0]}>
      <Cyl rt={0.5} h={0.12} r={[Math.PI / 2, 0, 0]} c={color} seg={24} />
      <Cyl rt={0.42} h={0.02} p={[0, 0, 0.07]} r={[Math.PI / 2, 0, 0]} c="#FFFFFF" seg={24} />
      <B s={[0.04, 0.3, 0.02]} p={[0, 0.12, 0.09]} c="#22222B" />
      <B s={[0.22, 0.04, 0.02]} p={[0.1, 0, 0.09]} c="#22222B" />
    </group>
  ),
  headphones: ({ color }) => (
    <group position={[0, 0.1, 0]}>
      <Ring rad={0.4} tube={0.05} p={[0, 0.4, 0]} c="#22222B" arc={Math.PI} />
      {[-0.4, 0.4].map((x) => <Cyl key={x} rt={0.16} h={0.14} p={[x, 0.3, 0]} r={[0, 0, Math.PI / 2]} c={color} seg={14} />)}
    </group>
  ),
  cart: ({ color }) => (
    <group>
      <B s={[0.9, 0.5, 0.6]} p={[0, 0.55, 0]} c="#C9CDD3" />
      <B s={[0.86, 0.46, 0.56]} p={[0, 0.58, 0]} c={color} />
      {[[-0.35, 0.25], [0.35, 0.25], [-0.35, -0.25], [0.35, -0.25]].map(([x, z]) => <Ball key={`${x}${z}`} rad={0.07} p={[x, 0.08, z]} c="#22222B" />)}
      <Cyl rt={0.025} h={0.5} p={[-0.55, 0.85, 0]} r={[Math.PI / 2, 0, 0]} c="#9AA3AD" seg={6} />
    </group>
  ),
  ball: () => (
    <group>
      <Ball rad={0.45} p={[0, 0.45, 0]} c="#FFFFFF" seg={14} />
      <Ring rad={0.455} tube={0.03} p={[0, 0.45, 0]} c="#22222B" />
      <Ring rad={0.455} tube={0.03} p={[0, 0.45, 0]} r={[Math.PI / 2, 0, 0]} c="#22222B" />
    </group>
  ),
  key: ({ color }) => (
    <group position={[0, 0.5, 0]} rotation={[0, 0, -0.6]}>
      <Ring rad={0.2} tube={0.06} p={[0, 0.3, 0]} c={color} />
      <B s={[0.08, 0.6, 0.06]} p={[0, -0.1, 0]} c="#F2C230" />
      <B s={[0.16, 0.06, 0.06]} p={[0.08, -0.32, 0]} c="#F2C230" />
    </group>
  ),
}

/** The things' names (app/motion.py STREET_PROPS says the same). */
export const THING_NAMES = Object.keys(THINGS)

/** One thing by name, ``size`` units tall-ish, standing at ``position``. */
export function Thing({ name, color = '#E0533D', position = [0, 0, 0], rotation = [0, 0, 0], size = 1 }) {
  const Make = THINGS[name]
  if (!Make) return null
  return (
    <group position={position} rotation={rotation} scale={size}>
      <Make color={color} />
    </group>
  )
}

/** The brand's own product photo as a 3D thing: the picture on a box with brand-colour sides. */
export function PhotoThing({ tex, color = '#E0533D', position = [0, 0, 0], rotation = [0, 0, 0], size = 1 }) {
  const side = new THREE.Color(color)
  const aspect = tex?.image ? tex.image.width / tex.image.height : 0.8
  const w = aspect >= 1 ? 1 : aspect
  const h = aspect >= 1 ? 1 / aspect : 1
  return (
    <group position={position} rotation={rotation} scale={size}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, 0.18]} />
        {[0, 1, 2, 3].map((n) => <meshStandardMaterial key={n} attach={`material-${n}`} color={side} roughness={0.5} />)}
        <meshStandardMaterial attach="material-4" map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} roughness={0.5} />
        <meshStandardMaterial attach="material-5" color={side} roughness={0.5} />
      </mesh>
    </group>
  )
}
