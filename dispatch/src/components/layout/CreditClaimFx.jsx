// Claiming the monthly credits, as a little scene: our robot taps a piggy bank,
// it wobbles, cracks in two and credit coins burst out; then a big coin rises
// with the amount and a "Get it" button — the coins fly into the credits chip
// in the top bar (AccountMenu, data-credit-chip), which pops.
// Every claim goes through lib/credits.js claimCredits(), which fires
// `dispatch:credits-claimed` with { amount } — so the bell, the account menu
// and Settings → Billing all get it. Reduced motion: straight to the coin.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LiveAvatar from '../ui/LiveAvatar'
import CreditCoin from './CreditCoin'
import { rectOf } from '../../lib/zoom'

const fmt = (n) => Number(n || 0).toLocaleString('en-US')
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// the times (ms) the scene moves on: lean in → crack → burst → the coin rises
const AT = { tap: 450, crack: 1250, burst: 1650, coin: 2500 }

// the coins that burst out: where they land (px from the pig's middle) and when
const BURST = Array.from({ length: 12 }, (_, i) => {
  const a = -Math.PI / 2 + (i - 5.5) * 0.24
  const r = 70 + ((i * 37) % 50)
  return { dx: Math.round(Math.cos(a) * r * 1.5), up: Math.round(60 + ((i * 53) % 70)), delay: (i % 4) * 40, size: 16 + ((i * 7) % 10) }
})

export default function CreditClaimFx() {
  const [amount, setAmount] = useState(0)
  const [stage, setStage] = useState('') // '' | 'start' | 'tap' | 'crack' | 'burst' | 'coin' | 'fly'
  const [shown, setShown] = useState(0) // the counting number
  const [fly, setFly] = useState(null) // { x, y, tx, ty } — the coins' trip to the chip
  const coinRef = useRef(null)
  const timers = useRef([])

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    const onClaim = (e) => {
      const n = Number(e.detail?.amount) || 0
      if (n <= 0) return
      clear()
      setAmount(n)
      setShown(0)
      setFly(null)
      if (reduced()) return setStage('coin')
      setStage('start')
      later(() => setStage('tap'), AT.tap)
      later(() => setStage('crack'), AT.crack)
      later(() => setStage('burst'), AT.burst)
      later(() => setStage('coin'), AT.coin)
    }
    window.addEventListener('dispatch:credits-claimed', onClaim)
    return () => {
      window.removeEventListener('dispatch:credits-claimed', onClaim)
      clear()
    }
  }, [])

  // the amount counts up as the coin rises
  useEffect(() => {
    if (stage !== 'coin') return undefined
    if (reduced()) return setShown(amount)
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 900)
      setShown(Math.round(amount * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage, amount])

  const done = () => {
    clear()
    setStage('')
    setFly(null)
  }

  const getIt = () => {
    const from = coinRef.current && rectOf(coinRef.current)
    const chip = [...document.querySelectorAll('[data-credit-chip]')].find((el) => el.getBoundingClientRect().width > 0)
    const to = chip && rectOf(chip)
    if (!from || !to || reduced()) return done()
    setShown(amount)
    setFly({ x: from.left + from.width / 2, y: from.top + from.height / 2, tx: to.left + 18, ty: to.top + to.height / 2 })
    setStage('fly')
    later(() => {
      chip.classList.remove('cf-chip-pop')
      void chip.offsetWidth // restart the pop
      chip.classList.add('cf-chip-pop')
    }, 760)
    later(done, 1050)
  }

  useEffect(() => {
    if (stage !== 'coin') return undefined
    const onKey = (e) => (e.key === 'Enter' || e.key === 'Escape') && getIt()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!stage) return null
  const after = (s) => ['start', 'tap', 'crack', 'burst', 'coin', 'fly'].indexOf(stage) >= ['start', 'tap', 'crack', 'burst', 'coin', 'fly'].indexOf(s)
  const broken = after('burst')

  return createPortal(
    <div
      className={`fixed inset-0 z-[175] grid place-items-center bg-ink-900/30 p-4 backdrop-blur-[6px] transition-opacity duration-300 ${stage === 'fly' ? 'opacity-0 delay-500' : 'animate-fade'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${fmt(amount)} credits claimed`}
    >
      <style>{`
        @keyframes pig-wobble { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-7deg) } 40% { transform: rotate(6deg) } 60% { transform: rotate(-5deg) } 80% { transform: rotate(3deg) } }
        @keyframes pig-left { to { transform: translate(-34px, 10px) rotate(-18deg); opacity: .0 } }
        @keyframes pig-right { to { transform: translate(34px, 12px) rotate(16deg); opacity: .0 } }
        @keyframes pig-crack { from { stroke-dashoffset: 120 } to { stroke-dashoffset: 0 } }
        @keyframes coin-burst {
          0% { transform: translate(0, 0) scale(.3); opacity: 0 }
          12% { opacity: 1 }
          45% { transform: translate(calc(var(--dx) * .6), calc(var(--up) * -1)) scale(1) rotate(200deg) }
          100% { transform: translate(var(--dx), 70px) scale(.9) rotate(400deg); opacity: 0 }
        }
        @keyframes coin-rise { from { transform: translateY(50px) scale(.4); opacity: 0 } 60% { transform: translateY(-8px) scale(1.08); opacity: 1 } to { transform: none; opacity: 1 } }
        @keyframes coin-spin { 0%,100% { transform: perspective(300px) rotateY(-22deg) translateY(0) } 50% { transform: perspective(300px) rotateY(22deg) translateY(-6px) } }
        @keyframes fx-flash { from { opacity: .9; transform: scale(.4) } to { opacity: 0; transform: scale(1.6) } }
        @keyframes fx-up { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .pig-wobble { animation: pig-wobble .5s ease-in-out 2 }
        .pig-left { animation: pig-left .7s cubic-bezier(.3,.7,.4,1) forwards; transform-origin: 40% 80% }
        .pig-right { animation: pig-right .7s cubic-bezier(.3,.7,.4,1) forwards; transform-origin: 60% 80% }
        .pig-crack { stroke-dasharray: 120; animation: pig-crack .35s ease-out forwards }
        .coin-burst { animation: coin-burst 1.1s cubic-bezier(.25,.6,.4,1) both }
        .coin-rise { animation: coin-rise .6s cubic-bezier(.2,1.2,.4,1) both }
        .coin-spin { animation: coin-spin 2.4s ease-in-out .6s infinite; transform-style: preserve-3d }
        .fx-flash { animation: fx-flash .5s ease-out forwards }
        .fx-up { animation: fx-up .4s ease-out both }
      `}</style>

      <div className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-ink-200/70 bg-white px-6 pb-6 pt-5 text-center shadow-pop">
        {/* the stage */}
        <div className="relative mx-auto h-[200px] w-full max-w-[340px]">
          {/* the robot: leans in to tap the pig, waves when the coin is up */}
          <div
            className="absolute bottom-0 left-0 transition-transform duration-300 ease-out"
            style={{ transform: stage === 'tap' ? 'translateX(26px) rotate(8deg)' : stage === 'crack' ? 'translateX(8px) rotate(-3deg)' : 'none' }}
          >
            <LiveAvatar size={150} wave={after('coin')} />
          </div>

          {/* the piggy bank — two halves of one drawing, so it can break in two */}
          {!after('coin') && (
            <div className="absolute bottom-2 right-0 h-[130px] w-[160px]">
              <div className={`absolute inset-0 ${stage === 'tap' || stage === 'crack' ? 'pig-wobble' : ''}`}>
                <Pig half="left" className={broken ? 'pig-left' : ''} />
                <Pig half="right" className={broken ? 'pig-right' : ''} />
                {(stage === 'crack' || broken) && (
                  <svg viewBox="0 0 200 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <path d={CRACK} fill="none" stroke="#7A2E4A" strokeWidth="3" strokeLinejoin="round" className="pig-crack" />
                  </svg>
                )}
              </div>
              {broken && <span className="fx-flash absolute left-1/2 top-1/2 -ml-12 -mt-12 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.95),rgb(var(--brand-light)/.5)_45%,transparent_70%)]" />}
              {broken &&
                BURST.map((c, i) => (
                  <span
                    key={i}
                    className="coin-burst absolute left-1/2 top-[45%]"
                    style={{ '--dx': `${c.dx}px`, '--up': `${c.up}px`, animationDelay: `${c.delay}ms`, marginLeft: -c.size / 2, marginTop: -c.size / 2 }}
                  >
                    <CreditCoin size={c.size} />
                  </span>
                ))}
            </div>
          )}

          {/* the big coin rises in front of the robot */}
          {after('coin') && (
            <div ref={coinRef} className="coin-rise absolute bottom-6 right-6 grid place-items-center" style={{ visibility: fly ? 'hidden' : undefined }}>
              <span className="absolute h-28 w-28 rounded-full bg-brand/20 blur-2xl" aria-hidden="true" />
              <span className="coin-spin relative block">
                <CreditCoin size={92} />
              </span>
            </div>
          )}
        </div>

        {after('coin') ? (
          <div className="fx-up">
            <div className="text-[30px] font-extrabold tabular-nums tracking-tight text-brand">+{fmt(shown)} credits</div>
            <p className="mt-1 text-[13.5px] text-ink-500">Your credits for this month — ready to use.</p>
            <button type="button" onClick={getIt} disabled={stage === 'fly'} className="btn-primary mx-auto mt-5 h-11 px-7 text-[14px]" autoFocus>
              <CreditCoin size={18} /> Get it
            </button>
          </div>
        ) : (
          <p className="mt-3 h-[94px] text-[14px] font-semibold text-ink-700">Breaking the piggy bank…</p>
        )}
      </div>

      {/* Get it: the coins fly to the credits chip, one after another */}
      {fly &&
        Array.from({ length: 8 }, (_, i) => (
          <FlyCoin key={i} fly={fly} delay={i * 45} big={i === 0} />
        ))}
    </div>,
    document.body,
  )
}

/** One coin on its way from the big coin to the chip (fixed, so it leaves the card). */
function FlyCoin({ fly, delay, big }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    return () => cancelAnimationFrame(t)
  }, [])
  const size = big ? 56 : 26
  const jx = ((delay * 7) % 40) - 20
  return (
    <span
      className="pointer-events-none fixed left-0 top-0 z-[176]"
      style={{
        transform: go ? `translate(${fly.tx - 11}px, ${fly.ty - 11}px) scale(${22 / size})` : `translate(${fly.x - size / 2 + jx}px, ${fly.y - size / 2}px)`,
        transition: `transform .75s cubic-bezier(.5,-0.35,.35,1) ${delay}ms, opacity .2s ease ${delay + 700}ms`,
        opacity: go ? 0 : 1,
      }}
    >
      <CreditCoin size={size} />
    </span>
  )
}

// the break: a zigzag down the middle of the pig (viewBox 0 0 200 160)
const CRACK = 'M100 34 L92 52 L106 66 L94 82 L108 98 L96 114 L104 136'
const LEFT_CLIP = 'M0 0 H100 L92 52 L106 66 L94 82 L108 98 L96 114 L104 136 L104 160 H0 Z'
const RIGHT_CLIP = 'M100 0 H200 V160 H104 L104 136 L96 114 L108 98 L94 82 L106 66 L92 52 Z'

/** The piggy bank, drawn flat: body, snout, ear, eye, legs, tail and the coin slot. */
function Pig({ half, className = '' }) {
  const id = `pig-${half}`
  return (
    <svg viewBox="0 0 200 160" className={`absolute inset-0 h-full w-full ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={half === 'left' ? LEFT_CLIP : RIGHT_CLIP} />
        </clipPath>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBC4DA" />
          <stop offset="1" stopColor="#F28DB6" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        {/* tail */}
        <path d="M32 84 C18 80 18 66 28 68 C36 70 30 80 22 78" fill="none" stroke="#E57AA6" strokeWidth="4" strokeLinecap="round" />
        {/* legs */}
        <rect x="52" y="118" width="20" height="26" rx="7" fill="#E984AE" />
        <rect x="80" y="122" width="20" height="24" rx="7" fill="#E07BA5" />
        <rect x="112" y="122" width="20" height="24" rx="7" fill="#E984AE" />
        <rect x="138" y="118" width="20" height="26" rx="7" fill="#E07BA5" />
        {/* body */}
        <ellipse cx="100" cy="88" rx="72" ry="50" fill={`url(#${id}-body)`} />
        <ellipse cx="82" cy="66" rx="34" ry="14" fill="#FFFFFF" opacity=".35" />
        {/* ear */}
        <path d="M128 46 L146 26 L152 54 Z" fill="#F28DB6" />
        <path d="M134 46 L145 33 L148 50 Z" fill="#FBC4DA" />
        {/* coin slot */}
        <rect x="80" y="40" width="36" height="7" rx="3.5" fill="#B4467A" />
        {/* eye */}
        <circle cx="146" cy="74" r="5" fill="#3B1A2A" />
        <circle cx="147.6" cy="72.4" r="1.6" fill="#FFFFFF" />
        {/* cheek */}
        <ellipse cx="140" cy="94" rx="9" ry="5" fill="#F06B9E" opacity=".45" />
        {/* snout */}
        <ellipse cx="170" cy="88" rx="17" ry="14" fill="#F48FB1" />
        <ellipse cx="165" cy="88" rx="3" ry="4.5" fill="#B4467A" />
        <ellipse cx="175" cy="88" rx="3" ry="4.5" fill="#B4467A" />
      </g>
    </svg>
  )
}
