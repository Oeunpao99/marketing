// Our robot, alive: it floats, blinks now and then, and waves hello.
// The picture is cut into layers on one square canvas (public/brand/avatar/):
// the body (eyes and raised hand taken out), the hand, and each eye, so the
// hand can rock round its wrist and the eyes can squash shut. The pivots are
// % of the picture (measured when it was cut). Motion: index.css .cf-avatar-*.

const SRC = '/brand/avatar'

// thinking: the head tilts side to side (no wave) — while Ask writes its answer.
// No dots over its head: the "Writing your advice…" line beside it has them.
export default function LiveAvatar({ size = 120, wave = true, thinking = false, className = '' }) {
  if (thinking) wave = false
  return (
    <div className={`cf-avatar relative flex-none select-none ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <div className={`${thinking ? 'cf-avatar-think' : 'cf-avatar-float'} absolute inset-0`}>
        <img src={`${SRC}/body.webp`} alt="" draggable="false" className="absolute inset-0 h-full w-full" />
        <img src={`${SRC}/eye-l.webp`} alt="" draggable="false" className="cf-avatar-blink absolute inset-0 h-full w-full" style={{ transformOrigin: '35.5% 38%' }} />
        <img src={`${SRC}/eye-r.webp`} alt="" draggable="false" className="cf-avatar-blink absolute inset-0 h-full w-full" style={{ transformOrigin: '60.7% 35.4%' }} />
        <img src={`${SRC}/hand.webp`} alt="" draggable="false" className={`absolute inset-0 h-full w-full ${wave ? 'cf-avatar-wave' : ''}`} style={{ transformOrigin: '85.2% 69.9%' }} />
      </div>
    </div>
  )
}
