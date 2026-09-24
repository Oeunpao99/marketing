// Live progress for Auto-generate's "Generate now" / "Regenerate" runs.
//
// The backend runs those in a background thread (they take minutes — AI
// writing plus one image per idea) and exposes GET /views/auto/:id/run. This
// module is the app-wide tracker: it polls every running run, the Auto-generate
// page reads it to draw the progress bars, and Shell mounts the watcher so the
// "done" toast still fires after the person has moved to another page.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../api/client'

let runs = {} // automation id → latest status from the server
const subscribers = new Set()
let timer = null
let polling = false
let onFinish = null

function emit() {
  runs = { ...runs }
  subscribers.forEach((fn) => fn())
}

function subscribe(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

function ensurePolling() {
  if (timer || !Object.values(runs).some((r) => r.status === 'running')) return
  timer = setInterval(poll, 1500)
}

async function poll() {
  const active = Object.values(runs).filter((r) => r.status === 'running')
  if (!active.length) {
    clearInterval(timer)
    timer = null
    return
  }
  if (polling) return
  polling = true
  try {
    await Promise.all(
      active.map(async (r) => {
        try {
          const next = await api.get(`/views/auto/${r.automation_id}/run`)
          if (next.status === 'running') {
            runs[r.automation_id] = next
            return
          }
          // Finished (or "idle" — the server restarted and forgot the run).
          delete runs[r.automation_id]
          onFinish?.(next)
        } catch {
          /* transient — try again next tick */
        }
      }),
    )
    emit()
  } finally {
    polling = false
  }
}

export async function startRun(automationId, force = false) {
  const status = await api.post(`/views/auto/${automationId}/run-now${force ? '?force=true' : ''}`)
  runs[automationId] = status
  emit()
  ensurePolling()
  return status
}

// Pick up runs already in progress (e.g. after a page reload) from /views/auto.
export function seedRuns(automations) {
  let changed = false
  for (const a of automations || []) {
    if (a.run?.status === 'running' && !runs[a.id]) {
      runs[a.id] = a.run
      changed = true
    }
  }
  if (changed) {
    emit()
    ensurePolling()
  }
}

export function useAutoRuns() {
  return useSyncExternalStore(subscribe, () => runs)
}

export function useAutoRunWatcher(callback) {
  useEffect(() => {
    onFinish = callback
    return () => {
      if (onFinish === callback) onFinish = null
    }
  }, [callback])
}

// The server reports progress in steps (e.g. 55% → 59% per image); between
// steps this eases the bar forward toward the next checkpoint so a long step
// still visibly moves instead of sitting frozen.
export function useSmoothProgress(run) {
  const [shown, setShown] = useState(run?.progress || 0)
  const progress = run?.progress ?? 0
  const upto = run?.upto ?? progress
  useEffect(() => {
    setShown((s) => Math.max(s, progress))
    const t = setInterval(() => {
      setShown((s) => {
        const cap = Math.max(progress, upto - 1)
        if (s >= cap) return Math.max(s, progress)
        return Math.min(cap, s + Math.max(0.05, (cap - s) * 0.012))
      })
    }, 250)
    return () => clearInterval(t)
  }, [progress, upto])
  return Math.floor(shown)
}
