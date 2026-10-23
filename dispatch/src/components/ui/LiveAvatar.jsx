// Our robot, alive: it floats, blinks now and then, and waves hello.
// The picture is cut into layers on one square canvas (public/brand/avatar/):
// the body (eyes and raised hand taken out), the hand, and each eye, so the
// hand can rock round its wrist and the eyes can squash shut. The pivots are
// % of the picture (measured when it was cut). Motion: index.css .cf-avatar-*.

const SRC = '/brand/avatar'

// thinking: the head tilts side to side and three dots pulse over it (no wave) —
// while Ask writes its answer
export default function LiveAvatar({ size = 120, wave = true, thinking = false, className = '' }) {
  if (thinking) wave = false
  return (
    <div className={`cf-avatar relative flex-none select-none ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {thinking && (
        <span className="cf-avatar-dots absolute -right-[18%] -top-[14%] z-10 flex items-center gap-[2px] rounded-full bg-white px-[3px] py-[2px] shadow-sm ring-1 ring-ink-200/80">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block rounded-full bg-brand" style={{ width: Math.max(3, size * 0.09), height: Math.max(3, size * 0.09), animationDelay: `${i * 0.18}s` }} />
          ))}
        </span>
      )}
      <div className={`${thinking ? 'cf-avatar-think' : 'cf-avatar-float'} absolute inset-0`}>
        <img src={`${SRC}/body.webp`} alt="" draggable="false" className="absolute inset-0 h-full w-full" />
        <img src={`${SRC}/eye-l.webp`} alt="" draggable="false" className="cf-avatar-blink absolute inset-0 h-full w-full" style={{ transformOrigin: '35.5% 38%' }} />
        <img src={`${SRC}/eye-r.webp`} alt="" draggable="false" className="cf-avatar-blink absolute inset-0 h-full w-full" style={{ transformOrigin: '60.7% 35.4%' }} />
        <img src={`${SRC}/hand.webp`} alt="" draggable="false" className={`absolute inset-0 h-full w-full ${wave ? 'cf-avatar-wave' : ''}`} style={{ transformOrigin: '85.2% 69.9%' }} />
      </div>
    </div>
  )
}
