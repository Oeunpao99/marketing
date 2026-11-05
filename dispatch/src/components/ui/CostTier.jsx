// An AI model's icon in the menus: our own logo (customers never see the
// maker's) tinted in the model family's colour, with a small badge on its
// top-right corner — "+" GPT-5, "++" GPT-6 (black — the app's ink, so it turns
// light in dark mode), "+++" Claude (orange) (the user, 2026-11-05). A model
// outside these families: the badge counts its cost tier ("$" cheapest … "$$$"
// priciest — backend ai_models_api.py model_rows) on our brand logo. No model
// and no tier: the logo alone.
const INK = 'rgb(var(--ink-900))'
const FAMILIES = [
  [/^claude/, 3, '#D97757'],
  [/^gpt-6/, 2, INK],
  [/^gpt-5/, 1, INK],
]

export function modelMark(model = '', tier = '') {
  const hit = FAMILIES.find(([re]) => re.test(model || ''))
  if (hit) return { n: hit[1], color: hit[2] }
  return { n: Math.max(0, Math.min(3, (tier || '').length)), color: '' }
}

export default function CostTier({ tier = '', model = '', size = 'sm', className = '' }) {
  const { n, color } = modelMark(model, tier)
  const box = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <span
      className={`relative inline-flex flex-none ${n ? (n === 3 ? 'mr-3' : n === 2 ? 'mr-2' : 'mr-1') : ''} ${className}`}
      title={n ? ['', 'Uses the least', 'Uses a medium amount', 'Uses the most'][n] : undefined}
    >
      {color ? (
        // the logo's shape, filled with the family colour (a light-to-deep shade keeps it from looking flat)
        <span
          aria-hidden="true"
          className={box}
          style={{
            background: `linear-gradient(160deg, color-mix(in srgb, ${color} 70%, white), ${color} 55%, color-mix(in srgb, ${color} 75%, black))`,
            WebkitMask: 'url(/brand/logo-mark.png) center / contain no-repeat',
            mask: 'url(/brand/logo-mark.png) center / contain no-repeat',
          }}
        />
      ) : (
        <img src="/brand/logo-mark.png" alt="" className={`${box} object-contain`} />
      )}
      {n > 0 && (
        <span
          className={`absolute -top-1.5 left-[70%] rounded-full px-[3px] text-[8.5px] font-bold leading-[11px] text-white ${color ? '' : 'bg-brand'}`}
          // on the ink badge the "+" takes the surface colour (white in light mode, dark in dark mode)
          style={{ boxShadow: '0 0 0 1.5px rgb(var(--surface))', ...(color ? { background: color } : {}), ...(color === INK ? { color: 'rgb(var(--surface))' } : {}) }}
          aria-label={`Level ${n} of 3`}
        >
          {'+'.repeat(n)}
        </span>
      )}
    </span>
  )
}
