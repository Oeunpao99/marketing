import { useLayoutEffect } from 'react'

// Pinned header blocks stacked under the top bar: each one publishes its
// height as a CSS variable on <html> (e.g. --tabs-h), so the next pinned block
// below it can use `top: calc(3.5rem + var(--tabs-h, 0px))`. Gone = 0px.
export default function usePinnedHeight(ref, name) {
  useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el) {
      root.style.setProperty(name, '0px')
      return undefined
    }
    const set = () => root.style.setProperty(name, `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.setProperty(name, '0px')
    }
  })
}
