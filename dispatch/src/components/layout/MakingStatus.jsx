import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../auth'
import { canOpen } from '../../lib/access'

export default function MakingStatus() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const allowed = canOpen(user, '/making')
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!allowed) return
    let alive = true
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const result = await api.get('/views/making')
        if (alive) setData(result)
      } catch {
        if (alive) setData(null)
      }
    }
    load()
    const timer = setInterval(load, 15000)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load) }
  }, [allowed, pathname])
  if (!allowed) return null
  const running = data?.running || 0
  const queued = data?.queued || 0
  const count = running + queued
  const label = data ? count ? `Making now: ${running} in progress, ${queued} queued` : 'Making now: no active jobs' : 'Making now: view generation progress'
  return (
    <Link to="/making" aria-label={label} title={label} aria-current={pathname === '/making' ? 'page' : undefined}
      className={`relative grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${count || pathname === '/making' ? 'bg-brand-soft text-brand hover:bg-brand-soft' : 'text-ink-600 hover:bg-ink-100'}`}>
      <Hourglass size={18} strokeWidth={1.8} aria-hidden="true" />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white ring-2 ring-white">{count > 9 ? '9+' : count}</span>}
    </Link>
  )
}
