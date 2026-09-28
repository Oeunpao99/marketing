export const BRAND_COLOR = 'rgb(var(--brand))'

export const isKhmer = (s) => /[ក-៿᧠-᧿]/.test(s || '')

/** A post's title, or — when it's only an uploaded file's name
 *  ("ai-23.png", "90b433aa-….jpg") — the first line of its caption. */
export function postTitle(title, caption) {
  const t = (title || '').trim()
  if (t && !/\.(jpe?g|png|webp|gif|mp4|mov|webm|m4v)$/i.test(t) && t !== 'Untitled video') return t
  const first = (caption || '').split('\n').find((l) => l.trim())
  return first ? first.trim() : t || 'Untitled post'
}

export function timeOf(iso) {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16) || '--:--'
  return d.toISOString().slice(11, 16)
}

export function dateTimeShort(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function humanBytes(n) {
  if (!n) return '—'
  const mb = n / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(n / 1024).toFixed(0)} KB`
}

export function mmss(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
