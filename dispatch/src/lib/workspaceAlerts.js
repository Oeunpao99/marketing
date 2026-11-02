import { useCallback, useSyncExternalStore } from 'react'
import { api } from '../api/client'
const states = new Map()
const EMPTY = { needs: [], health: null }
function entry(scope) {
  if (!states.has(scope)) states.set(scope, { value: EMPTY, listeners: new Set(), stop: null })
  return states.get(scope)
}
export function useWorkspaceAlerts(scope) {
  const subscribe = useCallback((listener) => {
    const state = entry(scope)
    state.listeners.add(listener)
    if (!state.stop) {
      let alive = true
      const load = async () => {
        if (document.visibilityState === 'hidden') return
        const [command, health] = await Promise.allSettled([api.get('/command'), api.get('/views/dashboard/health')])
        if (!alive) return
        state.value = { needs: command.status === 'fulfilled' ? command.value.needs || [] : state.value.needs, health: health.status === 'fulfilled' ? health.value : state.value.health }
        state.listeners.forEach((fn) => fn())
      }
      load()
      const timer = setInterval(load, 60000)
      document.addEventListener('visibilitychange', load)
      state.stop = () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load) }
    }
    return () => { state.listeners.delete(listener); if (!state.listeners.size) { state.stop?.(); state.stop = null } }
  }, [scope])
  return useSyncExternalStore(subscribe, () => entry(scope).value)
}
