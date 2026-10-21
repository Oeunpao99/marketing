import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiArrowRight, FiBriefcase, FiCheck, FiMapPin, FiPackage, FiSend, FiShare2, FiZap } from 'react-icons/fi'
import { api } from '../../api/client'
import { PLAT } from '../../data/brands'
import { colorForBrand } from '../../lib/brandColor'
import { useStore } from '../../store'
import { PLAT_BRAND_CLASS, PLAT_ICONS } from '../ui/PlatformIcon'
import { openCreateBrand } from '../layout/CreateBrandDrawer'

// The launch path — the one road every new person follows:
//
//   ① Brand  →  ② Platforms  →  ③ Products  →  🚀 Publish
//
// A brand with one connected platform can already publish; products are
// recommended (the AI writes truer posts about what you sell) but lock nothing.
//
// Always about the ACTIVE brand — the sidebar's brand switcher is the only one,
// so the road never has a picker of its own.
//
//   full    — the Command center: the big card with the milestones, gone once done
//   compact — Products and Channels: one slim line (steps · what's next), gone once done

// ── products: a small shared cache, so the road is right on every page ───────
let cache = null // { at, items }
const listeners = new Set()
const tell = () => listeners.forEach((fn) => fn(cache?.items ?? null))

function loadProducts() {
  return api
    .get('/products')
    .then((items) => {
      cache = { at: Date.now(), items }
      tell()
    })
    .catch(() => {})
}

/** Call after a product is added or deleted, so every road updates. */
export const refreshProducts = () => loadProducts()

function useProducts() {
  const [items, setItems] = useState(cache?.items ?? null)
  useEffect(() => {
    listeners.add(setItems)
    if (!cache || Date.now() - cache.at > 30_000) loadProducts()
    return () => listeners.delete(setItems)
  }, [])
  return items
}

const ORDER = ['brand', 'platforms', 'products']

/** Where a brand stands: its steps, what's next, and the numbers. */
export function useBrandJourney(slug) {
  const { brands, channels, activeBrand } = useStore()
  const products = useProducts()
  const brand = brands.find((b) => b.slug === (slug || activeBrand)) || brands[0] || null
  const own = brand && products ? products.filter((p) => p.brand_id === brand.id) : null
  const live = brand ? channels.filter((c) => c.b === brand.slug && c.s !== 'off') : []
  const platformNames = [...new Set(live.map((c) => PLAT[c.p]?.name || c.p))]
  // products still loading: don't call them missing (no flash of "add a product")
  const done = { brand: !!brand, platforms: live.length > 0, products: own == null ? true : own.length > 0 }
  const next = ORDER.find((id) => !done[id]) || null
  return {
    brand,
    productCount: own ? own.length : null,
    productNames: own ? own.map((p) => p.name) : [],
    platformNames,
    done,
    next,
    canPublish: done.brand && done.platforms,
  }
}

// each milestone has its own colour, so the road reads at a glance
const TONES = {
  brand: 'from-violet-500 to-indigo-500',
  platforms: 'from-sky-400 to-blue-600',
  products: 'from-amber-400 to-orange-500',
  publish: 'from-rose-400 to-pink-500',
}
const LOGOS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Telegram']
const SHORT = { brand: 'Brand', platforms: 'Platform', products: 'Products' }

/** What each step is, and where its button goes. */
function useSteps(j) {
  const navigate = useNavigate()
  const { brand, done } = j
  const name = brand?.name || 'your brand'
  return {
    brand: {
      icon: FiBriefcase,
      title: 'Your brand',
      text: done.brand ? 'The business you post for. Add its logo, colours and voice in the Brand kit.' : 'Name the business you post for — accounts, products and posts all belong to a brand.',
      action: done.brand ? 'Open brand kit' : 'Create your brand',
      go: () => (done.brand ? navigate('/products', { state: { view: 'kit' } }) : openCreateBrand()),
    },
    platforms: {
      icon: FiShare2,
      title: 'Where to publish',
      text: done.platforms ? `${name} can publish to ${j.platformNames.join(', ')}.` : `Connect a Facebook Page, TikTok or another account so ${name} can publish.`,
      action: done.platforms ? 'Connect another' : 'Connect a platform',
      go: () => navigate('/channels/add', { state: { brandSlug: brand?.slug } }),
    },
    products: {
      icon: FiPackage,
      title: 'What it sells',
      text: done.products ? 'What the AI writes about — it only uses these facts.' : `Recommended — tell the AI what ${name} sells, so posts about it stay true.`,
      action: done.products ? 'Manage products' : 'Add a product',
      go: () => navigate('/products', { state: done.products ? undefined : { add: true } }),
    },
  }
}

/** A milestone: a coloured badge — a check when done, a pulsing ring when it's next. */
function Badge({ tone, icon: Icon, state, here }) {
  return (
    <div className="relative flex-none self-start sm:self-center">
      {state === 'next' && <span className="absolute -inset-1.5 animate-pulse-glow rounded-full ring-4 ring-brand/30" aria-hidden="true" />}
      <span
        className={`relative grid h-14 w-14 place-items-center rounded-full text-white shadow-lg ring-4 ring-white ${
          state === 'wait' ? 'bg-gradient-to-br from-ink-300 to-ink-400' : `bg-gradient-to-br ${TONES[tone]}`
        }`}
      >
        <Icon size={24} strokeWidth={2.2} />
      </span>
      {state === 'done' && (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
          <FiCheck size={13} strokeWidth={3.4} />
        </span>
      )}
      {here && (
        <span className="absolute -top-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-ink-900 px-2 py-0.5 text-[9.5px] font-bold text-white shadow">
          <FiMapPin size={9} /> You are here
        </span>
      )}
    </div>
  )
}

/** The progress ring in the header. */
function Ring({ n }) {
  const r = 21
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid h-[54px] w-[54px] flex-none place-items-center" aria-label={`${n} of 3 steps done`}>
      <svg viewBox="0 0 54 54" className="absolute inset-0 -rotate-90">
        <circle cx="27" cy="27" r={r} fill="none" strokeWidth="5" className="stroke-ink-100" />
        <circle cx="27" cy="27" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-emerald-500 transition-[stroke-dashoffset] duration-700" strokeDasharray={c} strokeDashoffset={c * (1 - n / 3)} />
      </svg>
      <span className="text-[13px] font-extrabold tabular-nums text-ink-900">
        {n}<span className="text-ink-400">/3</span>
      </span>
    </div>
  )
}

/** Products and Channels: one slim line — the three steps, and the one next thing. */
function Strip({ j, steps, here, className }) {
  const { done, next } = j
  const nDone = ORDER.filter((id) => done[id]).length
  const todo = next && next !== here ? steps[next] : null // on that step's own page, the page says what to do
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ink-200 bg-white px-4 py-2.5 ${className}`} aria-label="Set up your brand">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand">
        <FiZap size={11} /> Setup {nDone}/3
      </span>
      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {ORDER.map((id, i) => {
          const on = here === id
          return (
            <li key={id} className="flex items-center gap-1">
              {i > 0 && <span className={`h-px w-4 ${done[ORDER[i - 1]] ? 'bg-emerald-400' : 'bg-ink-200'}`} aria-hidden="true" />}
              <button
                type="button"
                onClick={steps[id].go}
                aria-current={on ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-semibold transition-colors ${on ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
              >
                <span
                  className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold ${
                    done[id] ? 'bg-emerald-500 text-white' : next === id ? 'bg-brand text-white' : 'bg-ink-200 text-ink-600'
                  }`}
                >
                  {done[id] ? <FiCheck size={11} strokeWidth={3.4} /> : i + 1}
                </span>
                {SHORT[id]}
              </button>
            </li>
          )
        })}
      </ol>
      {todo && (
        <button type="button" onClick={todo.go} className="btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-[12px]">
          {todo.action} <FiArrowRight size={13} />
        </button>
      )}
    </div>
  )
}

/**
 * here    — which step the current page is about: "brand" | "platforms" | "products"
 * compact — the slim line (Products, Channels); otherwise the big card (Command center)
 * Both render nothing once all three steps are done.
 */
export default function BrandJourney({ here, compact = false, className = '' }) {
  const navigate = useNavigate()
  const j = useBrandJourney()
  const steps = useSteps(j)
  const { brand, done, next, canPublish } = j
  if (!next) return null
  if (compact) return <Strip j={j} steps={steps} here={here} className={className} />

  const nDone = ORDER.filter((id) => done[id]).length
  const name = brand?.name || 'your brand'
  const stateOf = (id) => (done[id] ? 'done' : next === id ? 'next' : 'wait')
  const road = [
    ...ORDER.map((id) => ({ id, ...steps[id], locked: id !== 'brand' && !brand })),
    {
      id: 'publish',
      icon: FiSend,
      title: 'Publish!',
      text: canPublish ? 'The AI writes it, you approve it, it goes out.' : 'Connect a platform — then the AI writes posts, you approve, and they go out.',
      action: canPublish ? 'Create content' : 'Locked',
      go: () => navigate('/ai?tab=images'),
      locked: !canPublish,
    },
  ]

  return (
    <section className={`relative rounded-3xl border border-ink-200 bg-white p-5 sm:p-6 ${className}`} aria-label="Set up your brand">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Ring n={nDone} />
        <div className="min-w-[190px] flex-1">
          <div className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-brand">
            <FiZap size={10} /> Launch path
          </div>
          <h2 className="mt-1 text-[18px] font-extrabold leading-tight tracking-tight text-ink-900">
            {brand ? `Let’s get ${name} ready to publish` : 'Start here — let’s launch your first brand'}
          </h2>
          <p className="text-[12.5px] text-ink-500">Brand first, then where it publishes, then what it sells.</p>
        </div>
      </div>

      <ol className="relative mt-7 grid gap-6 sm:grid-cols-4 sm:gap-3">
        {road.map((s, i) => {
          const state = s.id === 'publish' ? (canPublish ? 'next' : 'wait') : stateOf(s.id)
          // the path to the next milestone: solid when this one is done, moving dashes when it's next
          const seg = s.id === 'publish' ? null : done[s.id] ? 'done' : state === 'next' ? 'next' : 'wait'
          return (
            <li key={s.id} className={`relative flex gap-4 sm:flex-col sm:items-center sm:gap-0 sm:text-center ${s.locked ? 'opacity-70' : ''}`}>
              {seg && (
                <>
                  {/* desktop: along the top, to the next badge */}
                  <span
                    className={`absolute left-1/2 top-[27px] hidden h-[3px] w-full sm:block ${seg === 'done' ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : seg === 'next' ? 'cf-dash' : 'border-t-[3px] border-dotted border-ink-200'}`}
                    aria-hidden="true"
                  />
                  {/* phone: down the side */}
                  <span
                    className={`absolute left-[27px] top-14 -bottom-6 w-[3px] sm:hidden ${seg === 'done' ? 'bg-emerald-500' : seg === 'next' ? 'cf-dash cf-dash-v' : 'border-l-[3px] border-dotted border-ink-200'}`}
                    aria-hidden="true"
                  />
                </>
              )}
              <Badge tone={s.id} icon={s.icon} state={state} here={here === s.id} />
              <div className="flex min-w-0 flex-1 flex-col sm:mt-3 sm:w-full sm:items-center">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{s.id === 'publish' ? 'Go!' : `Step ${i + 1}`}</div>
                <div className="text-[15px] font-extrabold leading-tight text-ink-900">{s.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600 sm:max-w-[230px]">{s.text}</p>
                {s.id === 'brand' && done.brand && (
                  <span className="mt-2 inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-800 ring-1 ring-ink-200 sm:self-center">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: colorForBrand(brand.slug) }} />
                    <span className="truncate">{brand.name}</span>
                  </span>
                )}
                {s.id === 'platforms' && (
                  <div className="mt-3 flex gap-1.5 sm:justify-center">
                    {LOGOS.map((p) => {
                      const on = j.platformNames.includes(p)
                      return (
                        <span
                          key={p}
                          title={on ? `${p} — connected` : p}
                          className={`relative grid h-8 w-8 place-items-center rounded-full bg-white transition-all ${
                            on ? `shadow-md ring-2 ring-emerald-400 ${PLAT_BRAND_CLASS[p] || ''}` : 'text-ink-400 ring-1 ring-ink-200'
                          }`}
                        >
                          <span className="scale-[1.45]">{PLAT_ICONS[p]}</span>
                          {on && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
                        </span>
                      )
                    })}
                  </div>
                )}
                {s.id === 'products' && done.products && j.productNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 sm:justify-center">
                    {j.productNames.slice(0, 3).map((n) => (
                      <span key={n} className="max-w-[120px] truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700 ring-1 ring-ink-200">
                        {n}
                      </span>
                    ))}
                    {j.productNames.length > 3 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">+{j.productNames.length - 3}</span>}
                  </div>
                )}
                <span className="min-h-3 flex-1" />
                {/* the page you're on is that step — its own buttons do it, no second one here */}
                {here !== s.id && (
                  <button
                    type="button"
                    onClick={s.go}
                    disabled={s.locked}
                    className={`mt-3 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-full px-4 text-[12.5px] font-bold transition-all disabled:cursor-not-allowed sm:self-center ${
                      state === 'next'
                        ? 'btn-primary shadow-md hover:-translate-y-0.5'
                        : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:text-brand hover:ring-brand/40 disabled:hover:text-ink-700 disabled:hover:ring-ink-200'
                    }`}
                  >
                    {s.action} {state === 'next' && <FiArrowRight size={13} />}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
