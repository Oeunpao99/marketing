// This month's videos and images — made, left, the plan's longest video (app/usage.py —
// GET /usage). What customers see instead of credits: the top bar's chip and account
// menu, the Plans page and the storyboard's estimate share it, so one refresh updates
// them all. Fresh every minute, when the window comes back, and on
// "dispatch:usage-changed" (a payment, a video started).
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

let current = null
let inflight = null
const listeners = new Set()
const tell = () => listeners.forEach((fn) => fn(current))

export function loadUsage() {
  if (!inflight) {
    inflight = api
      .get('/usage')
      .then((u) => {
        current = u
        tell()
        return u
      })
      .catch(() => current)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Tell every page the month's numbers moved (a video started, a pack paid). */
export const usageChanged = () => window.dispatchEvent(new Event('dispatch:usage-changed'))

/** { usage, reload } — { plan_label, videos: {used, limit, left, extra}, images: {…}, longest_seconds, refills_at } */
export function useUsage() {
  const [usage, setUsage] = useState(current)
  useEffect(() => {
    listeners.add(setUsage)
    if (!current) loadUsage()
    return () => listeners.delete(setUsage)
  }, [])
  return { usage, reload: useCallback(loadUsage, []) }
}

/** Mount once (the top bar): refreshes every minute, on focus and on dispatch:usage-changed. */
export function useUsageRefresh() {
  useEffect(() => {
    loadUsage()
    const timer = setInterval(loadUsage, 60_000)
    window.addEventListener('focus', loadUsage)
    window.addEventListener('dispatch:usage-changed', loadUsage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', loadUsage)
      window.removeEventListener('dispatch:usage-changed', loadUsage)
    }
  }, [])
}

/** "1 min", "3 min", "40 s" — the plan's longest video. */
export const lengthText = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)
