// New devices that signed in to your account and wait for "Was this you?"
// (app/sessions.py — GET /auth/security/alerts). Shared by the bell's list and
// its count; checked every minute and when the window comes back.
import { useEffect, useState } from 'react'
import { api } from '../api/client'

let current = []
let inflight = null
let timer = null
const listeners = new Set()
const tell = () => listeners.forEach((fn) => fn(current))

export function loadSecurityAlerts() {
  if (!inflight) {
    inflight = api
      .get('/auth/security/alerts')
      .then((rows) => {
        current = Array.isArray(rows) ? rows : []
        tell()
        return current
      })
      .catch(() => current)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

const drop = (sid) => {
  current = current.filter((a) => a.id !== sid)
  tell()
}

/** "Yes, it was me" — the device stays signed in, the alert goes. */
export async function confirmDevice(sid) {
  await api.post(`/auth/security/sessions/${sid}/confirm`, {})
  drop(sid)
}

/** "No — sign it out": that device is signed out right away. */
export async function signOutDevice(sid) {
  await api.del(`/auth/security/sessions/${sid}`)
  drop(sid)
}

export function useSecurityAlerts() {
  const [alerts, setAlerts] = useState(current)
  useEffect(() => {
    listeners.add(setAlerts)
    if (listeners.size === 1) {
      loadSecurityAlerts()
      timer = setInterval(loadSecurityAlerts, 60_000)
      window.addEventListener('focus', loadSecurityAlerts)
    }
    return () => {
      listeners.delete(setAlerts)
      if (!listeners.size) {
        clearInterval(timer)
        window.removeEventListener('focus', loadSecurityAlerts)
      }
    }
  }, [])
  return alerts
}

// People who joined the workspace this week (GET /auth/security/joined — an
// owner's / admin's bell: "Dara joined your workspace"). Loaded with the device
// alerts, every minute and when the window comes back.
let joined = []
let joinedTimer = null
const joinedListeners = new Set()

function loadJoined() {
  return api
    .get('/auth/security/joined')
    .then((rows) => {
      joined = Array.isArray(rows) ? rows : []
      joinedListeners.forEach((fn) => fn(joined))
    })
    .catch(() => {})
}

export function useJoinedAlerts() {
  const [rows, setRows] = useState(joined)
  useEffect(() => {
    joinedListeners.add(setRows)
    if (joinedListeners.size === 1) {
      loadJoined()
      joinedTimer = setInterval(loadJoined, 60_000)
      window.addEventListener('focus', loadJoined)
    }
    return () => {
      joinedListeners.delete(setRows)
      if (!joinedListeners.size) {
        clearInterval(joinedTimer)
        window.removeEventListener('focus', loadJoined)
      }
    }
  }, [])
  return rows
}
