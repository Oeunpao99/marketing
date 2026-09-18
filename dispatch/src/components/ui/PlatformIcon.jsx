export const PLAT_ICONS = {
  Facebook: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
      <path d="M11.5 3.5h2V1h-2a3 3 0 00-3 3v2H7v2.5h1.5V14H11V8.5h1.8l.3-2.5H11V4.6a1.1 1.1 0 01.5-1.1z" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
      <path d="M14 3a4.5 4.5 0 003.5 4.4v2.6a7 7 0 01-3.5-1v5.5a5.5 5.5 0 11-5.5-5.5h.6v2.7a2.8 2.8 0 101.6 2.6V3H14z" />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M17.9 6.2a2.2 2.2 0 00-1.5-1.6C15 4.1 10 4.1 10 4.1s-5 0-6.4.5A2.2 2.2 0 002.1 6.2 23 23 0 001.7 10a23 23 0 00.4 3.8 2.2 2.2 0 001.5 1.6c1.4.5 6.4.5 6.4.5s5 0 6.4-.5a2.2 2.2 0 001.5-1.6A23 23 0 0018.3 10a23 23 0 00-.4-3.8zM8.4 12.3V7.7l4.2 2.3-4.2 2.3z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
      <rect x="3" y="3" width="14" height="14" rx="4" />
      <circle cx="10" cy="10" r="3.2" />
      <circle cx="14.2" cy="5.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Telegram: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
      <path d="M17.5 3.2L1.6 9.2c-.8.3-.7 1.4.1 1.6l3.9 1.2 1.6 4.6c.2.6.9.8 1.4.4l2-1.9 3.6 2.6c.6.4 1.4 0 1.5-.7l2-13c.2-.8-.6-1.5-1.2-1.2zM7.5 12.6l7-4.9-5 4.9-.3 2.3-1.7-2.3z" />
    </svg>
  ),
}

export default function PlatformIcon({ name, className }) {
  const Icon = PLAT_ICONS[name]
  if (!Icon) return null
  return <span className={className}>{Icon}</span>
}
