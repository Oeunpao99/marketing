import { useEffect, useState } from 'react'
import { api } from '../api/client'

// Is the Gemini voice reading Khmer right now? (GET /ai/motion/voice-status)
// When its daily limit is used up, Sreymom (female) / Piseth (male) read the
// videos instead — the composer and the Voice tab say so before anything is
// made. Asked at most once a minute.
let cached = null
let at = 0

export function useVoiceStatus() {
  const [status, setStatus] = useState(cached)
  useEffect(() => {
    if (cached && Date.now() - at < 60_000) return undefined
    let alive = true
    api
      .get('/ai/motion/voice-status')
      .then((s) => {
        cached = s
        at = Date.now()
        if (alive) setStatus(s)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return status
}

/** "Sreymom" / "Piseth" — who reads instead of Gemini for this voice. */
export const backupName = (status, voice) => status?.backup?.[voice === 'male' ? 'male' : 'female'] || ''
