// An AI model's icon in the menus: our own logo (customers never see the
// maker's) with a small brand badge on its top-right corner — "+", "++" or
// "+++" for how much it uses (tier "$" cheapest … "$$$" priciest — backend
// ai_models_api.py model_rows). No tier: the logo alone.
export default function CostTier({ tier = '', size = 'sm', className = '' }) {
  const n = Math.max(0, Math.min(3, (tier || '').length))
  const box = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <span
      className={`relative inline-flex flex-none ${n ? (n === 3 ? 'mr-3' : n === 2 ? 'mr-2' : 'mr-1') : ''} ${className}`}
      title={n ? ['', 'Uses the least', 'Uses a medium amount', 'Uses the most'][n] : undefined}
    >
      <img src="/brand/logo-mark.png" alt="" className={`${box} object-contain`} />
      {n > 0 && (
        <span
          className="absolute -top-1.5 left-[70%] rounded-full bg-brand px-[3px] text-[8.5px] font-bold leading-[11px] text-white"
          style={{ boxShadow: '0 0 0 1.5px rgb(var(--surface))' }}
          aria-label={`Cost ${n} of 3`}
        >
          {'+'.repeat(n)}
        </span>
      )}
    </span>
  )
}
