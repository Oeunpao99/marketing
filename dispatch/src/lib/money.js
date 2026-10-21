// Customers see CREDITS (app/billing.py CREDITS_PER_USD says the same): the
// API sends dollars of AI charge, and fmtCredits turns them into credits.
export const CREDITS_PER_USD = 200

/** Dollars of AI charge → "1.3 credits" / "1,240 credits" (``unit`` false: just the number). */
export function fmtCredits(usd, unit = true) {
  const c = (Number(usd) || 0) * CREDITS_PER_USD
  const abs = Math.abs(c)
  const num = abs > 0 && abs < 10 ? abs.toFixed(1).replace(/\.0$/, '') : Math.round(abs).toLocaleString('en-US')
  const text = `${c < 0 ? '-' : ''}${num}`
  return unit ? `${text} ${abs === 1 ? 'credit' : 'credits'}` : text
}

// USD for AI credit (app/billing.py) — the admin portal's real money. Tiny spends (a caption is a fraction of
// a cent) keep 4 decimals so they don't all read "$0.00".
export function fmtUSD(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs === 0) return '$0.00'
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`
  return `${sign}$${abs.toFixed(2)}`
}
