import { useEffect, useState } from 'react'
import { api } from '../api/client'

// Can this server render Remotion videos (backend app/motion.py — needs Node
// and the motion project)? Asked once per page load and shared.
let cached = null
let pending = null

export const MOTION_OFF_TIP = 'Remotion videos aren’t set up on this server yet'

/** true / false — or null while the first check is still on its way. */
export function useMotionReady() {
  const [ready, setReady] = useState(cached)
  useEffect(() => {
    if (cached !== null) return undefined
    pending ||= api
      .get('/ai/motion/status')
      .then((r) => (cached = !!r.ready))
      .catch(() => (cached = false))
    let live = true
    pending.then((v) => live && setReady(v))
    return () => {
      live = false
    }
  }, [])
  return ready
}
