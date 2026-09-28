// On-screen keyboard awareness for phones.
//
// iOS doesn't shrink the page when the keyboard opens — it slides the visible
// area over it, so anything pinned to the bottom ends up behind the keyboard
// and the browser scrolls the typing box to the middle of the screen. This
// measures the keyboard from window.visualViewport and exposes it to CSS:
//   <html class="kb-open">  while a keyboard is up
//   --kb                    how far to lift bottom-pinned things (px; 0 on
//                           Android, where the page itself shrinks —
//                           index.html's interactive-widget=resizes-content)
// index.css hides the phone tab bar and docks `.composer-dock` on the keyboard.

const isTyping = () => {
  const el = document.activeElement
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  return tag === 'INPUT' && !/^(checkbox|radio|button|submit|range|file|color|image|reset)$/i.test(el.type)
}

export function watchKeyboard() {
  const vv = window.visualViewport
  if (!vv || typeof document === 'undefined') return
  const root = document.documentElement
  // Tallest height seen for this orientation = the screen with no keyboard.
  let full = { portrait: 0, landscape: 0 }

  const update = () => {
    const orient = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
    full[orient] = Math.max(full[orient], window.innerHeight, vv.height)
    const covered = full[orient] - vv.height
    const open = isTyping() && covered > 120
    const lift = open ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0
    root.classList.toggle('kb-open', open)
    root.style.setProperty('--kb', `${lift}px`)
  }

  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  window.addEventListener('orientationchange', () => {
    full = { portrait: 0, landscape: 0 }
    setTimeout(update, 300)
  })
  // Focus changes before the keyboard animates; check again once it has.
  document.addEventListener('focusin', () => setTimeout(update, 50))
  document.addEventListener('focusout', () => setTimeout(update, 50))
  update()
}
