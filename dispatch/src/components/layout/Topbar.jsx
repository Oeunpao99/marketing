import { Link, useLocation } from 'react-router-dom'

const LABELS = {
  '/': 'Today',
  '/new': 'New post',
  '/review': 'Waiting for you',
  '/channels': 'Channels',
  '/channels/add': 'Add Platform',
  '/auto': 'Auto-generate',
  '/ai': 'AI agent',
  '/library': 'Library',
  '/post': 'Post',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const label = LABELS[pathname] || 'Today'

  return (
    <header className="sticky top-0 z-20 h-14 flex items-center gap-3.5 px-5 lg:px-8 bg-white/70 backdrop-blur-xl border-b border-ink-100">
      <span className="text-[13px] text-ink-400">
        Ti P'sa <span className="text-ink-200">/</span>{' '}
        <span className="text-ink-800 font-semibold">{label}</span>
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse-glow shadow-glow" />
          Scheduler running
        </span>
        <Link
          to="/new"
          className="px-4 py-1.5 rounded-xl gradient-brand text-white text-[13.5px] font-semibold hover:shadow-glow-lg transition-all duration-200"
        >
          + New post
        </Link>
      </div>
    </header>
  )
}
