// "Just signed in" — so the app says hello once (components/layout/WelcomeHello.jsx).
// auth.jsx marks it on every sign-in / sign-up (password, Google, invite link);
// a reload or a later visit with a saved sign-in doesn't. The first-run tour
// waits for the hello to close (helloPending / dispatch:hello-done).
const KEY = 'cf-hello'

const store = () => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function markHello() {
  try { store()?.setItem(KEY, '1') } catch { /* no storage — no hello */ }
}

export function helloPending() {
  try { return store()?.getItem(KEY) === '1' } catch { return false }
}

// read and clear — only the first caller gets it
export function takeHello() {
  const yes = helloPending()
  if (yes) {
    try { store()?.removeItem(KEY) } catch { /* fine */ }
    window.__cfHelloOpen = true
  }
  return yes
}

export function helloDone() {
  window.__cfHelloOpen = false
  window.dispatchEvent(new Event('dispatch:hello-done'))
}

export const helloOpen = () => helloPending() || !!window.__cfHelloOpen
