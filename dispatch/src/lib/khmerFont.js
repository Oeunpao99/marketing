import { useEffect } from 'react'

// The full Kantumruy Pro (Khmer) font, for pages that set their Khmer in it
// (the landing page, the video tutorials). index.html only loads the few
// letters of ឆ្លាតវៃ for the launch screen — without this, those letters come
// out bold in Kantumruy and every other letter in the fallback font.
export const KHMER_FONT = 'https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;500;700&display=swap'

export const km = { fontFamily: '"Kantumruy Pro", "Khmer OS Siemreap", sans-serif' }

export function useKhmerFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${KHMER_FONT}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = KHMER_FONT
    document.head.appendChild(l)
  }, [])
}
