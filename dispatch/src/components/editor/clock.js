import { useSyncExternalStore } from 'react'

// The video editor's playhead time, outside React state: the player moves it
// every frame, and only the few things that show it (the red line, the time,
// the player) re-draw — not the whole timeline.
export function createClock() {
  let time = 0
  let playing = false
  const subs = new Set()
  const emit = () => subs.forEach((f) => f())
  return {
    get: () => time,
    isPlaying: () => playing,
    set(t) {
      if (t !== time) {
        time = t
        emit()
      }
    },
    setPlaying(p) {
      if (p !== playing) {
        playing = p
        emit()
      }
    },
    subscribe(f) {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

export const useTime = (clock) => useSyncExternalStore(clock.subscribe, clock.get)
export const usePlaying = (clock) => useSyncExternalStore(clock.subscribe, clock.isPlaying)
