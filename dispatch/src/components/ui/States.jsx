export function Loading({ label = 'Loading…' }) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl2 p-8 text-center text-ink-400 shadow-card">
      {label}
    </div>
  )
}

export function ErrorNote({ error, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl2 p-4 text-[12px] text-red-700 shadow-card">
      <div className="font-semibold mb-1">Couldn’t reach the API</div>
      <div className="text-red-600">{error}</div>
      <div className="mt-2 text-[11px] text-red-500">
        Is the backend running? <code>uv run python -m uvicorn app.main:app --port 8000</code>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 text-[11.5px] font-medium hover:bg-red-100 transition-default"
        >
          Retry
        </button>
      )}
    </div>
  )
}
