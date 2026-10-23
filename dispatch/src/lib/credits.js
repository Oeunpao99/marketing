// The workspace's AI credits this month (app/billing.py — GET /billing/summary),
// shared by the top bar's chip and account menu, the bell's "claim" card and
// Settings → Billing, so claiming in one place updates them all. Monthly
// credits aren't added by themselves: someone claims them (POST /billing/claim).
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

let current = null
let inflight = null
const listeners = new Set()
const tell = () => listeners.forEach((fn) => fn(current))

export function loadCredits() {
  if (!inflight) {
    inflight = api
      .get('/billing/summary')
      .then((b) => {
        current = b
        tell()
        return b
      })
      .catch(() => current)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Claim this month's credits; resolves with how many were added (0 if already claimed). */
export async function claimCredits() {
  const b = await api.post('/billing/claim', {})
  current = b
  tell()
  // { amount } — the piggy-bank scene plays wherever the claim came from (CreditClaimFx)
  window.dispatchEvent(new CustomEvent('dispatch:credits-claimed', { detail: { amount: b.claimed_now || 0 } }))
  return b.claimed_now || 0
}

/** { credits, reload, claim } — kept fresh: every minute and when the window comes back. */
export function useCredits() {
  const [credits, setCredits] = useState(current)
  useEffect(() => {
    listeners.add(setCredits)
    if (!current) loadCredits()
    return () => listeners.delete(setCredits)
  }, [])
  return { credits, reload: useCallback(loadCredits, []), claim: claimCredits }
}

/** Mount once (the top bar): refreshes the shared credits every minute and on focus. */
export function useCreditsRefresh() {
  useEffect(() => {
    loadCredits()
    const timer = setInterval(loadCredits, 60_000)
    window.addEventListener('focus', loadCredits)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', loadCredits)
    }
  }, [])
}
