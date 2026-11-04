// The "Open & use code" button in our code emails (backend app/notify/mailer.py) opens
//   /?verify=123456                     — confirm a new account's email
//   /?reset=you%40mail.com&code=123456  — "Forgot password", straight to the new password
// Read once when the app loads and taken off the address bar (the code
// shouldn't linger in history); each screen takes its own once.

let verify = null
let reset = null

try {
  const q = new URLSearchParams(window.location.search)
  const v = (q.get('verify') || '').replace(/\D/g, '')
  const r = (q.get('reset') || '').trim()
  const c = (q.get('code') || '').replace(/\D/g, '')
  if (v.length === 6) verify = v
  if (r && c.length === 6) reset = { email: r, code: c }
  if (q.has('verify') || q.has('reset')) {
    ;['verify', 'reset', 'code'].forEach((k) => q.delete(k))
    const rest = q.toString()
    window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  }
} catch {
  /* no URL API: the person types the code */
}

/** Is there a link code waiting (without taking it)? */
export const hasVerifyLink = () => !!verify
export const hasResetLink = () => !!reset

/** The confirm-email code from the link, once. */
export function takeVerifyCode() {
  const v = verify
  verify = null
  return v
}

/** {email, code} from a reset link, once. */
export function takeResetLink() {
  const r = reset
  reset = null
  return r
}
