export const BRAND_COLOR = '#166432'

export const isKhmer = (s) => /[ក-៿᧠-᧿]/.test(s || '')

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
