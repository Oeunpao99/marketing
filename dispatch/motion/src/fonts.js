import { useEffect, useState } from 'react'
import { continueRender, delayRender, staticFile } from 'remotion'

// The two fonts every template uses — English in Plus Jakarta Sans, Khmer in
// Kantumruy Pro — for files that also run inside the app (Slides' presenter,
// the video editor's player): nothing here runs at import, so the app can load
// them safely. (shared.jsx loads the same fonts for the video templates.)

let loading = null

export function loadFonts() {
  if (!loading) {
    loading = Promise.all([
      new FontFace('CFLatin', `url(${staticFile('fonts/PlusJakartaSans.ttf')})`, { weight: '200 800' }).load(),
      new FontFace('Kantumruy', `url(${staticFile('fonts/KantumruyPro.ttf')})`, { weight: '100 700' }).load(),
    ])
      .then((faces) => faces.forEach((f) => document.fonts.add(f)))
      .catch(() => {}) // a missing font falls back to the system's — the slide still draws
  }
  return loading
}

/** Hold the frame until the fonts are in (a render waits; the app's player shows it when ready). */
export function useFonts() {
  const [wait] = useState(() => delayRender('Loading the fonts'))
  useEffect(() => {
    loadFonts().then(() => continueRender(wait))
  }, [wait])
}

export const FONT = 'CFLatin, Kantumruy, sans-serif'
