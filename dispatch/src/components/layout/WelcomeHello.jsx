// Right after signing in or creating an account: a light blur over the app and
// our robot waving hello — "Welcome back, Sokha!" or, for a new account,
// "Welcome, Sokha!" with a button that starts the first-run tour (which waits
// for this to close: lib/hello.js). A returning person's hello closes itself.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowRight } from 'react-icons/fi'
import { useAuth } from '../../auth'
import { helloDone, takeHello } from '../../lib/hello'
import LiveAvatar from '../ui/LiveAvatar'

const NEW_ACCOUNT_MS = 15 * 60 * 1000 // made this recently → it's their first visit
const BACK_CLOSE_MS = 3600

export default function WelcomeHello() {
  const { user } = useAuth()
  const [kind, setKind] = useState(null) // 'new' | 'back' | null
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!user || kind || !takeHello()) return
    const made = Date.parse(user.created_at || '')
    setKind(!Number.isNaN(made) && Date.now() - made < NEW_ACCOUNT_MS ? 'new' : 'back')
  }, [user, kind])

  const close = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => {
      setKind(null)
      setLeaving(false)
      helloDone()
    }, 260)
  }

  useEffect(() => {
    if (kind !== 'back') return undefined
    const t = setTimeout(close, BACK_CLOSE_MS)
    return () => clearTimeout(t)
  })

  useEffect(() => {
    if (!kind) return undefined
    const onKey = (e) => (e.key === 'Escape' || e.key === 'Enter') && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!kind) return null
  const first = String(user?.name || '').trim().split(/\s+/)[0] || ''
  const isNew = kind === 'new'

  return createPortal(
    <div
      className={`fixed inset-0 z-[170] grid place-items-center bg-ink-900/30 p-4 backdrop-blur-[6px] transition-opacity duration-300 ${leaving ? 'opacity-0' : 'animate-fade'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hello-title"
      onClick={close}
    >
      <style>{`
        @keyframes hello-in { from { opacity: 0; transform: translateY(18px) scale(.94) } to { opacity: 1; transform: none } }
        .hello-in { animation: hello-in .5s cubic-bezier(.2,1.3,.4,1) both }
        @media (prefers-reduced-motion: reduce) { .hello-in { animation: none } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="hello-in relative w-full max-w-[360px] rounded-3xl border border-ink-200/70 bg-white px-6 pb-6 pt-2 text-center shadow-pop"
      >
        <LiveAvatar size={150} className="mx-auto -mt-[86px]" />
        <h2 id="hello-title" className="mt-1 text-[22px] font-bold tracking-tight text-ink-900">
          {isNew ? `Welcome${first ? `, ${first}` : ''}!` : `Welcome back${first ? `, ${first}` : ''}!`}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
          {isNew
            ? 'I’m your AI marketer. Let me show you around — it takes about thirty seconds.'
            : 'Good to see you again. Let’s make something great today.'}
        </p>
        {isNew ? (
          <button type="button" onClick={close} className="btn-primary mx-auto mt-5 h-10 px-5" autoFocus>
            Show me around <FiArrowRight size={15} />
          </button>
        ) : (
          <button type="button" onClick={close} className="btn-ghost mx-auto mt-4 h-9 px-4 text-[13px]" autoFocus>
            Let’s go
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
