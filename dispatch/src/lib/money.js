// USD for AI credit (app/billing.py). Tiny spends (a caption is a fraction of
// a cent) keep 4 decimals so they don't all read "$0.00".
export function fmtUSD(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs === 0) return '$0.00'
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`
  return `${sign}$${abs.toFixed(2)}`
}
