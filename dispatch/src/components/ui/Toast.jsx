export default function Toast({ message }) {
  return (
    <div
      className={`fixed left-1/2 bottom-7 -translate-x-1/2 z-50 toast-enter ${
        message ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
    >
      {message && (
        <div className="bg-ink-900 text-white text-[13.5px] font-medium px-5 py-2.5 rounded-xl shadow-dock border border-white/10">
          {message}
        </div>
      )}
    </div>
  )
}
