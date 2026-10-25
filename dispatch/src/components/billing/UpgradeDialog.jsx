// Upgrade / renew a plan, paid with KHQR (Bakong) — app/payments.py.
//   1. pick USD or KHR and a plan
//   2. a KHQR card (any Cambodian bank app scans it) with the amount and a
//      countdown; the page asks every few seconds whether it's paid
//   3. paid → the robot says thank you, the plan's end date, done
// Also "Top up credits": a credit pack (admin portal) paid the same way, for a paid plan.
// Expired → make a new code; "mismatch" (paid, but not what we asked) → the
// team checks it. Closing while unpaid cancels the code (the server checks once
// more first, so a payment made just before closing still counts).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowLeft, FiBriefcase, FiCheck, FiDownload, FiStar, FiX, FiZap } from 'react-icons/fi'
import CreditCoin from '../layout/CreditCoin'

// each plan's mark on its card
const PLAN_ICONS = { starter: FiZap, pro: FiStar, business: FiBriefcase }
const PAY_SECONDS = 10 * 60 // a KHQR is good for 10 minutes (app/payments.py PAY_MINUTES)

// INV-2026-000012 — as app/invoice.py numbers it
const invoiceName = (p) => `INV-${new Date(p.paid_at || Date.now()).getUTCFullYear()}-${String(p.id).padStart(6, '0')}`

/** The paid payment's invoice as a PDF file (POST /billing/payments/{id}/invoice). */
async function saveInvoice(p) {
  const file = await api.blob(`/billing/payments/${p.id}/invoice`)
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = `${invoiceName(p)}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** A sand timer: the top bulb empties and the bottom fills as the code's time runs out,
 * with a thin stream falling while there's time left. Colours follow the text (currentColor). */
function Hourglass({ left, total, urgent }) {
  const f = Math.max(0, Math.min(1, left / total)) // sand still on top
  const top = 20 * f // the top sand's height (of 20)
  const bottom = 20 * (1 - f)
  return (
    <svg width="34" height="48" viewBox="0 0 34 48" aria-hidden="true" className={left > 0 ? 'cf-hourglass' : ''}>
      <defs>
        <clipPath id="hg-top">
          <path d="M6 4 H28 L17 24 Z" />
        </clipPath>
        <clipPath id="hg-bottom">
          <path d="M17 24 L28 44 H6 Z" />
        </clipPath>
      </defs>
      {/* the sand: top bulb (its surface sinks), bottom bulb (a heap rising) */}
      <rect x="0" y={24 - top} width="34" height={top} fill={urgent ? '#ef4444' : 'rgb(var(--brand))'} opacity="0.85" clipPath="url(#hg-top)" />
      <rect x="0" y={44 - bottom} width="34" height={bottom} fill={urgent ? '#ef4444' : 'rgb(var(--brand))'} opacity="0.85" clipPath="url(#hg-bottom)" />
      {left > 0 && <line x1="17" y1="23" x2="17" y2={44 - bottom} stroke={urgent ? '#ef4444' : 'rgb(var(--brand))'} strokeWidth="1.4" strokeDasharray="2 2" className="cf-hourglass-stream" />}
      {/* the glass and its two caps */}
      <path d="M6 4 H28 L17 24 L28 44 H6 L17 24 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="3" y="1.5" width="28" height="3" rx="1.5" fill="currentColor" />
      <rect x="3" y="43.5" width="28" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}
import { api } from '../../api/client'
import { loadCredits } from '../../lib/credits'
import LiveAvatar from '../ui/LiveAvatar'
import { PLANS } from '../../lib/plans'

const POLL_MS = 3000
const money = (amount, currency) =>
  currency === 'KHR' ? `${Math.round(amount).toLocaleString('en-US')} ៛` : `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
// bought credits: period_end is when the month resets (the 1st, midnight) — the day before it
const lastDay = (iso) => (iso ? day(new Date(Date.parse(iso) - 1000).toISOString()) : '')

/** "Your own amount": type the credits (in steps), see the price, Buy. The price is worked
 * out as the server does (app/payments.py custom_price) — the server's is the one charged. */
function CustomAmount({ custom, currency, disabled, going, onBuy }) {
  const { min, max, step } = custom
  const [text, setText] = useState(String(Math.max(min, 1000)))
  const n = Number(text) || 0
  const valid = n >= min && n <= max && n % step === 0
  const per100 = custom.per_100[currency]
  const price = !per100 || !valid ? null : currency === 'USD' ? Math.round(per100 * n) / 100 : Math.max(100, Math.round((per100 * n) / 100 / 100) * 100)
  const nudge = (d) => setText(String(Math.min(max, Math.max(min, Math.round((n || 0) / step) * step + d))))
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-ink-200 p-4">
      <div className="min-w-[160px] flex-1">
        <div className="text-[13.5px] font-bold text-ink-900">Your own amount</div>
        <div className="text-[11.5px] text-ink-500">
          {min.toLocaleString('en-US')}–{max.toLocaleString('en-US')} credits, in hundreds
          {per100 ? ` · ${money(per100, currency)} per 100` : ''}
        </div>
      </div>
      <div className="flex items-center rounded-xl border border-ink-200 bg-white">
        <button type="button" onClick={() => nudge(-step)} aria-label="Fewer credits" className="h-10 w-10 text-[18px] font-bold text-ink-500 hover:text-ink-900">
          −
        </button>
        <input
          inputMode="numeric"
          aria-label="Credits"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          className="h-10 w-24 bg-transparent text-center text-[15px] font-bold tabular-nums text-ink-900 focus:outline-none"
        />
        <button type="button" onClick={() => nudge(step)} aria-label="More credits" className="h-10 w-10 text-[18px] font-bold text-ink-500 hover:text-ink-900">
          +
        </button>
      </div>
      <div className="w-24 text-right text-[17px] font-bold tabular-nums text-brand">{price ? money(price, currency) : '—'}</div>
      <button type="button" disabled={disabled || !price} onClick={() => onBuy(n)} className="h-10 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:bg-brand-dark disabled:opacity-50">
        {going ? 'Making your code…' : 'Buy'}
      </button>
      {!valid && text !== '' && (
        <div className="w-full text-[11.5px] text-red-600">
          Choose {min.toLocaleString('en-US')} to {max.toLocaleString('en-US')} credits, in hundreds.
        </div>
      )}
      {valid && !per100 && <div className="w-full text-[11.5px] text-ink-500">Not sold in {currency === 'KHR' ? 'riel' : 'dollars'} — switch the currency above.</div>}
    </div>
  )
}

// page: shown as its own page (/upgrade, UpgradePage) instead of a pop-up — always open
export default function UpgradeDialog({ open: shown, onClose, onPaid, page = false }) {
  const open = page || shown
  const [info, setInfo] = useState(null) // GET /billing/plans
  const [currency, setCurrency] = useState('USD')
  const [pick, setPick] = useState(null)
  const [pay, setPay] = useState(null) // the payment (status, qr, amount, expires_at…)
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const payRef = useRef(null)
  // invoices: the paid payments (on the page), and a download's error
  const [paid, setPaid] = useState([])
  const [invoiceError, setInvoiceError] = useState('')
  const downloadInvoice = async (p) => {
    setInvoiceError('')
    try {
      await saveInvoice(p)
    } catch (e) {
      setInvoiceError(e.message || 'Couldn’t download the invoice — try again.')
    }
  }
  useEffect(() => {
    if (!page) return
    api.get('/billing/payments').then(setPaid).catch(() => {})
  }, [page, pay?.status])
  payRef.current = pay

  useEffect(() => {
    if (!open) return
    setPay(null)
    setError('')
    setPick(null)
    api
      .get('/billing/plans')
      .then((d) => {
        setInfo(d)
        const first = d.plans.find((p) => p.plan !== d.current && Object.keys(p.prices).length) || d.plans.find((p) => Object.keys(p.prices).length)
        setPick(first?.plan || null)
        if (first && !first.prices.USD && first.prices.KHR) setCurrency('KHR')
      })
      .catch((e) => setError(e.message))
  }, [open])

  // the KHQR picture
  useEffect(() => {
    if (!pay?.qr) return setSvg('')
    let live = true
    import('qrcode')
      .then((QR) => QR.toString(pay.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }))
      .then((s) => live && setSvg(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pay?.qr])

  // waiting: ask every few seconds, and tick the countdown
  useEffect(() => {
    if (pay?.status !== 'pending') return undefined
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => {
      api
        .get(`/billing/pay/${pay.id}`)
        .then((p) => {
          setPay((cur) => (cur && cur.id === p.id ? { ...p, qr: p.qr || cur.qr } : cur))
          if (p.status === 'paid') {
            receive(p) // "Receiving your payment…", then the credits fly in
            onPaid?.(p)
          }
        })
        .catch(() => {})
    }, POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [pay?.id, pay?.status, onPaid])

  // a plan card's Choose: its KHQR straight away
  // Paid: a short "Receiving your payment…" with its steps ticking in, then the credits
  // scene (CreditClaimFx — the piggy bank, the coins flying into the chip) with the credits
  // the payment really added (the balance now − the balance when the code was made)
  const [receiving, setReceiving] = useState(0) // 0 = no · 1-3 = steps done · 4 = finished
  const [added, setAdded] = useState(0)
  const before = useRef(null)
  const received = useRef(new Set())
  const receive = async (p) => {
    if (received.current.has(p.id)) return
    received.current.add(p.id)
    setReceiving(1)
    let got = 0
    try {
      const now = await loadCredits()
      got = Math.max(0, Math.round((now?.available_credits ?? 0) - (before.current ?? 0)))
    } catch {
      /* the plan's credits below */
    }
    if (!got) got = p.credits || info?.plans.find((x) => x.plan === p.plan)?.monthly_credits || 0
    setAdded(got)
    setTimeout(() => setReceiving(2), 700)
    setTimeout(() => setReceiving(3), 1400)
    setTimeout(() => {
      setReceiving(4)
      if (got > 0 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        window.dispatchEvent(new CustomEvent('dispatch:credits-claimed', { detail: { amount: got } }))
      }
    }, 2300)
  }

  // a plan ("starter") or a credit pack ({ pack: id })
  const start = async (what) => {
    if (!what) return
    const pack = what.pack ?? null
    const own = what.credits ?? null // the customer's own amount
    setPick(pack ? `pack:${pack}` : own ? 'custom' : what)
    setBusy(true)
    setError('')
    setReceiving(0)
    try {
      before.current = (await loadCredits())?.available_credits ?? 0 // to tell what the payment adds
      setPay(await api.post('/billing/pay', pack ? { pack, currency } : own ? { credits: own, currency } : { plan: what, currency }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // the page's QR pop-up: closed → the code is cancelled if unpaid, the plans stay; after a
  // payment the plans are read again (the new plan shows as "Your plan")
  const closePay = () => {
    const p = payRef.current
    if (p?.status === 'pending') api.post(`/billing/pay/${p.id}/cancel`).catch(() => {})
    setPay(null)
    if (p?.status === 'paid') api.get('/billing/plans').then(setInfo).catch(() => {})
  }

  const close = () => {
    const p = payRef.current
    if (p?.status === 'pending') api.post(`/billing/pay/${p.id}/cancel`).catch(() => {})
    onClose()
  }

  useEffect(() => {
    if (!open || page) return undefined // a page has no Escape-to-close
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null
  const left = pay ? Math.max(0, Math.round((Date.parse(pay.expires_at) - now) / 1000)) : 0
  const has = (p) => Object.keys(p.prices || {}).length > 0
  const currencies = ['USD', 'KHR'].filter((c) => [...(info?.plans || []), ...(info?.packs || [])].some((p) => p.prices?.[c]))
  const topUp = pay?.plan === 'credits' // the payment is for extra credits, not a plan

  // part: 'all' (the pop-up from elsewhere) · 'plans' (the /upgrade page itself) · 'pay' (the
  // page's KHQR pop-up: the code, then paid / expired)
  const renderPanel = (part) => (
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          part === 'plans'
            ? 'relative w-full' // the page: its full width, no box round the plans
            : `relative max-h-[calc(92vh/var(--z,1))] w-full overflow-y-auto rounded-3xl border border-ink-200 bg-white p-5 shadow-pop sm:p-7 ${pay ? 'max-w-[460px]' : 'max-w-[1040px]'}`
        }
      >
        {part !== 'plans' && (
          <button type="button" onClick={part === 'pay' ? closePay : close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
            <FiX size={16} />
          </button>
        )}

        {/* 1 · pick a plan */}
        {(part === 'plans' || (part === 'all' && !pay)) && (
          <>
            {page ? (
              // the page's welcome: our robot waving beside the headline, on the brand colour
              <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-7 text-white sm:px-10 sm:py-9">
                <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" aria-hidden="true" />
                <span className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
                <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/70">Plans</div>
                    <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
                      {info?.current && info.current !== 'free' ? 'Renew or grow your plan' : 'Grow faster with more AI'}
                    </h1>
                    <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/80">
                      More credits for posts, posters and videos every month. Pay once with KHQR from any Cambodian bank app — no card, no automatic charges.
                    </p>
                  </div>
                  <div className="relative flex-none">
                    <div className="absolute -left-3 top-1 z-10 w-max -translate-x-full rounded-2xl rounded-tr-sm bg-white px-3.5 py-2 text-[12.5px] font-bold text-ink-900 shadow-pop max-md:hidden">
                      Pick a plan — I&apos;ll do the rest!
                    </div>
                    <LiveAvatar size={150} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h2 className="pr-8 text-[18px] font-bold text-ink-900">{info?.current && info.current !== 'free' ? 'Upgrade or renew' : 'Upgrade your plan'}</h2>
                <p className="mt-1 text-[12.5px] text-ink-500">One month, paid with KHQR from any Cambodian bank app.</p>
              </>
            )}
            {!info && !error && <div className="mt-6 text-[13px] text-ink-500">Loading…</div>}
            {info && !info.on_sale && (
              <div className="mt-5 rounded-2xl bg-canvas p-4 text-[13px] text-ink-700">
                <b>Coming soon.</b> Paid plans open shortly — contact us if you need more credits now.
              </div>
            )}
            {info?.on_sale && (
              <>
                {currencies.length > 1 && (
                  <div className={`mt-6 inline-flex rounded-xl bg-canvas p-1 ${page ? 'relative left-1/2 -translate-x-1/2' : ''}`}>
                    {currencies.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${currency === c ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
                      >
                        {c === 'KHR' ? '៛ Riel' : '$ Dollar'}
                      </button>
                    ))}
                  </div>
                )}
                {info.paid_until && (
                  <p className="mt-3 text-[12px] text-ink-500">
                    Your <b>{info.plans.find((p) => p.plan === info.current)?.label || ''}</b> plan is paid until <b>{day(info.paid_until)}</b>. Renewing it adds a month to that; a different plan starts today.
                  </p>
                )}
                {/* the plans as on the website (lib/plans.js): price, what's in it, Choose */}
                <div className={`grid gap-4 md:grid-cols-3 ${page ? 'mt-8 md:items-center' : 'mt-5'}`}>
                  {info.plans.filter(has).map((p) => {
                    const card = PLANS.find((x) => x.id === p.plan)
                    const price = p.prices[currency]
                    const current = p.plan === info.current
                    const popular = !!card?.popular
                    const going = busy && pick === p.plan
                    return (
                      <div
                        key={p.plan}
                        className={`relative flex flex-col rounded-3xl border bg-white p-5 transition-transform ${popular ? `border-brand shadow-[0_18px_40px_-18px_rgb(var(--brand)/0.45)] ring-1 ring-brand ${page ? 'md:-translate-y-3 md:py-7' : ''}` : 'border-ink-200 hover:-translate-y-0.5'}`}
                      >
                        {(popular || current) && (
                          <span className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${current ? 'bg-ink-900 text-canvas' : 'bg-brand text-white'}`}>
                            {current ? 'Your plan' : 'Most popular'}
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          {(() => {
                            const PlanIcon = PLAN_ICONS[p.plan] || FiZap
                            return (
                              <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${popular ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>
                                <PlanIcon size={20} />
                              </span>
                            )
                          })()}
                          <div className="min-w-0">
                            <div className="text-[18px] font-bold leading-tight text-ink-900">{card ? card.name[0] : p.label}</div>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                              <CreditCoin size={13} /> {p.monthly_credits.toLocaleString('en-US')} credits / mo
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 min-h-[34px] text-[12.5px] leading-snug text-ink-500">{card?.for[0]}</div>
                        <div className="mt-3 flex items-end gap-1">
                          <span className="text-[30px] font-extrabold leading-none tabular-nums tracking-tight text-ink-900">{price ? money(price, currency) : '—'}</span>
                          <span className="pb-1 text-[12px] text-ink-400">/ month</span>
                        </div>
                        <button
                          type="button"
                          disabled={!price || busy}
                          onClick={() => start(p.plan)}
                          className={`mt-4 h-10 w-full rounded-xl text-[13.5px] font-bold transition-colors disabled:opacity-50 ${popular ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-canvas text-ink-900 hover:bg-ink-100'}`}
                        >
                          {going ? 'Making your code…' : !price ? `Not sold in ${currency === 'KHR' ? 'riel' : 'dollars'}` : current ? 'Renew for a month' : `Choose ${card ? card.name[0] : p.label}`}
                        </button>
                        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Includes</div>
                        <ul className="mt-2 space-y-2">
                          {(card?.points || [[`${p.monthly_credits.toLocaleString('en-US')} AI credits a month`]]).map((pt) => (
                            <li key={pt[0]} className="flex gap-2 text-[12.5px] leading-snug text-ink-700">
                              <FiCheck size={14} className="mt-0.5 flex-none text-brand" strokeWidth={3} />
                              {pt[0]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-4 text-[11.5px] text-ink-400">Pay once with KHQR from any Cambodian bank app · the plan runs 30 days · no automatic charges.</p>
                {/* extra credits on top of the plan's (packs set in the admin portal) */}
                {(info.packs?.length > 0 || info.custom) && (
                  <section id="top-up" className="mt-8 scroll-mt-6 rounded-3xl border border-ink-200 bg-white p-5 sm:p-6">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink-900">
                          <CreditCoin size={22} /> Top up credits
                        </h2>
                        <p className="mt-1 text-[12.5px] text-ink-500">
                          Ran short this month? Add credits on top of your plan&apos;s — they&apos;re yours until the month ends.
                        </p>
                      </div>
                      {!info.can_top_up && (
                        <span className="rounded-full bg-canvas px-3 py-1 text-[11.5px] font-semibold text-ink-600">For paid plans — choose a plan above first</span>
                      )}
                    </div>
                    <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                      {info.packs.map((pk, i) => {
                        const price = pk.prices[currency]
                        const going = busy && pick === `pack:${pk.id}`
                        const best = info.packs.length > 1 && i === info.packs.length - 1
                        return (
                          <div key={pk.id} className={`relative flex flex-col items-center rounded-2xl border p-4 text-center ${best ? 'border-brand bg-brand-soft' : 'border-ink-200'}`}>
                            {best && <span className="absolute -top-2.5 whitespace-nowrap rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-bold text-white">Best value</span>}
                            {/* a stack of coins: taller for a bigger pack */}
                            <div className="relative h-10 w-12">
                              {Array.from({ length: Math.min(4, i + 1) }).map((_, k) => (
                                <span key={k} className="absolute left-1/2" style={{ bottom: k * 7, transform: `translateX(calc(-50% + ${k % 2 ? 5 : -3}px))` }}>
                                  <CreditCoin size={28} />
                                </span>
                              ))}
                            </div>
                            <div className="mt-2 text-[22px] font-extrabold leading-none tabular-nums text-ink-900">{pk.credits.toLocaleString('en-US')}</div>
                            <div className="text-[11.5px] text-ink-500">credits</div>
                            <div className="mt-2 text-[17px] font-bold text-brand">{price ? money(price, currency) : '—'}</div>
                            {price && currency === 'USD' && <div className="text-[11px] text-ink-400">{((price / pk.credits) * 100).toFixed(1)}¢ a credit</div>}
                            <button
                              type="button"
                              disabled={!price || busy || !info.can_top_up}
                              onClick={() => start({ pack: pk.id })}
                              className={`mt-3 h-9 w-full rounded-xl text-[12.5px] font-bold transition-colors disabled:opacity-50 ${best ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-canvas text-ink-900 hover:bg-ink-100'}`}
                            >
                              {going ? 'Making your code…' : !price ? `Not sold in ${currency === 'KHR' ? 'riel' : 'dollars'}` : 'Buy'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {info.custom && <CustomAmount custom={info.custom} currency={currency} disabled={busy || !info.can_top_up} going={busy && pick === 'custom'} onBuy={(n) => start({ credits: n })} />}
                  </section>
                )}
                {/* the page: every paid month, its invoice a click away */}
                {page && paid.length > 0 && (
                  <section className="mt-8 rounded-3xl border border-ink-200 bg-white p-5">
                    <h2 className="text-[15px] font-bold text-ink-900">Payments &amp; invoices</h2>
                    <div className="mt-3 divide-y divide-ink-100">
                      {paid.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-ink-900">
                              {p.plan === 'credits' ? p.plan_label : `${p.plan_label} plan`} · {money(p.amount, p.currency)}
                            </div>
                            <div className="text-[11.5px] text-ink-500">
                              {invoiceName(p)} · paid {day(p.paid_at)}
                              {p.period_end ? (p.plan === 'credits' ? ` · use by ${lastDay(p.period_end)}` : ` · until ${day(p.period_end)}`) : ''}
                            </div>
                          </div>
                          <button type="button" onClick={() => downloadInvoice(p)} className="btn-ghost h-9 px-3 text-[12.5px]">
                            <FiDownload size={14} /> Invoice (PDF)
                          </button>
                        </div>
                      ))}
                    </div>
                    {invoiceError && <p className="mt-2 text-[11.5px] text-red-600">{invoiceError}</p>}
                  </section>
                )}
              </>
            )}
            {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
          </>
        )}

        {/* 2 · the KHQR card, waiting */}
        {part !== 'plans' && pay?.status === 'pending' && (
          <div className="text-center">
            <button type="button" onClick={() => { api.post(`/billing/pay/${pay.id}/cancel`).catch(() => {}); setPay(null) }} className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Back">
              <FiArrowLeft size={16} />
            </button>
            <h2 className="text-[16px] font-bold text-ink-900">Scan to pay</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Open ABA, ACLEDA, Wing or any bank app and scan.</p>
            {/* the KHQR card — the national red header, then who and how much */}
            <div className="mx-auto mt-4 w-[268px] overflow-hidden rounded-2xl bg-white text-left shadow-[0_12px_40px_rgba(0,0,0,0.14)] ring-1 ring-black/5">
              <div className="relative flex h-12 items-center justify-center bg-[#E1232E]">
                <span className="text-[18px] font-extrabold tracking-[0.2em] text-white">KHQR</span>
                <span className="absolute bottom-0 right-0 h-0 w-0 border-b-[18px] border-l-[18px] border-b-white border-l-transparent" />
              </div>
              <div className="px-5 pt-3 text-[#111]">
                <div className="truncate text-[12px] font-medium text-[#555]">{pay.merchant_name}</div>
                <div className="text-[24px] font-bold tabular-nums leading-tight">
                  {pay.currency === 'KHR' ? Math.round(pay.amount).toLocaleString('en-US') : pay.amount_text}{' '}
                  <span className="text-[13px] font-semibold">{pay.currency}</span>
                </div>
              </div>
              <div className="mx-5 mt-3 border-t border-dashed border-[#ccc]" />
              <div className="p-5">
                {svg ? <div className="mx-auto aspect-square w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square w-full animate-pulse rounded-lg bg-[#eee]" />}
              </div>
            </div>
            {/* the sand timer: the code is good for 10 minutes — the sand runs down with it */}
            <div className={`mx-auto mt-4 flex w-fit items-center gap-3 rounded-2xl px-4 py-2.5 ${left < 60 ? 'bg-red-50 text-red-600' : 'bg-canvas text-ink-800'}`}>
              <Hourglass left={left} total={PAY_SECONDS} urgent={left < 60} />
              <div className="text-left">
                <div className="text-[22px] font-extrabold leading-none tabular-nums tracking-tight">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                </div>
                <div className={`mt-1 text-[11px] font-medium ${left < 60 ? 'text-red-500' : 'text-ink-500'}`}>left to pay this code</div>
              </div>
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-ink-600">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              Waiting for your payment… · {topUp ? `${pay.plan_label} for this month` : `${pay.plan_label} plan, one month`}
            </div>
          </div>
        )}

        {/* 3a · receiving: a spinner, the steps ticking in one by one */}
        {part !== 'plans' && pay?.status === 'paid' && receiving > 0 && receiving < 4 && (
          <div className="py-4 text-center">
            <div className="relative mx-auto h-20 w-20">
              <span className="absolute inset-0 animate-spin rounded-full border-[5px] border-brand-soft border-t-brand" />
              <span className="absolute inset-0 grid place-items-center">
                <CreditCoin size={34} />
              </span>
            </div>
            <h2 className="mt-4 text-[18px] font-bold text-ink-900">Receiving your payment…</h2>
            <ul className="mx-auto mt-4 w-fit space-y-2.5 text-left text-[13.5px]">
              {(topUp
                ? [
                    `Payment received from your bank · ${money(pay.amount, pay.currency)}`,
                    `${added.toLocaleString('en-US')} credits added to your balance`,
                    `Yours to use until ${lastDay(pay.period_end)}`,
                  ]
                : [
                    `Payment received from your bank · ${money(pay.amount, pay.currency)}`,
                    `${pay.plan_label} plan activated`,
                    `${added.toLocaleString('en-US')} credits added to your balance`,
                  ]
              ).map((label, i) => {
                const done = receiving > i
                return (
                  <li key={label} className={`flex items-center gap-2.5 transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-40'}`}>
                    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${done ? 'bg-brand text-white' : 'border-2 border-ink-200'}`}>
                      {done && <FiCheck size={13} strokeWidth={3} />}
                    </span>
                    <span className={done ? 'font-semibold text-ink-900' : 'text-ink-500'}>{label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* 3 · paid */}
        {part !== 'plans' && pay?.status === 'paid' && (receiving === 0 || receiving === 4) && (
          <div className="pt-2 text-center">
            <LiveAvatar size={120} className="mx-auto" />
            <h2 className="mt-2 text-[20px] font-bold text-ink-900">Payment received — thank you!</h2>
            <p className="mt-1.5 text-[13px] text-ink-600">
              {topUp ? (
                <>
                  <b>{pay.plan_label}</b> are in your balance — use them by <b>{lastDay(pay.period_end)}</b>.
                </>
              ) : (
                <>
                  Your <b>{pay.plan_label}</b> plan is on until <b>{day(pay.period_end)}</b>, and this month&apos;s credits are in your balance.
                </>
              )}
            </p>
            <p className="mt-1 text-[11.5px] text-ink-400">Invoice {invoiceName(pay)} · {money(pay.amount, pay.currency)}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => downloadInvoice(pay)} className="btn-ghost h-10 px-4">
                <FiDownload size={15} /> Download invoice (PDF)
              </button>
              <button type="button" onClick={page ? closePay : onClose} className="btn-primary h-10 px-6">
                Done
              </button>
            </div>
            {invoiceError && <p className="mt-2 text-[11.5px] text-red-600">{invoiceError}</p>}
          </div>
        )}

        {/* expired / cancelled / mismatch */}
        {part !== 'plans' && pay && !['pending', 'paid'].includes(pay.status) && (
          <div className="pt-2 text-center">
            <h2 className="text-[17px] font-bold text-ink-900">{pay.status === 'mismatch' ? 'We need to check this payment' : 'This code has expired'}</h2>
            <p className="mt-1.5 text-[13px] text-ink-600">
              {pay.status === 'mismatch'
                ? `A payment arrived that doesn't match ${money(pay.amount, pay.currency)} for ${pay.plan_label}. Our team will check it and contact you — reference ${pay.bill_number}.`
                : 'No payment came in time. Make a new code to try again.'}
            </p>
            {pay.status !== 'mismatch' && (
              <button type="button" onClick={() => setPay(null)} className="btn-primary mx-auto mt-5 h-10 px-6">
                Make a new code
              </button>
            )}
          </div>
        )}
      </div>
  )
  const popup = (part, onBackdrop) =>
    createPortal(
      <div className="fixed inset-0 z-[160] grid place-items-center bg-night-950/50 p-4 animate-fadein" role="dialog" aria-modal="true" aria-label={part === 'pay' ? 'Pay with KHQR' : 'Upgrade your plan'} onClick={onBackdrop}>
        {renderPanel(part)}
      </div>,
      document.body,
    )
  // its own page (/upgrade): the plans on the page, the KHQR in a pop-up over them
  if (page)
    return (
      // the app's page margins (as Content studio: px-5 / lg:px-10)
      <div className="w-full animate-fadein px-5 py-7 lg:px-10">
        {renderPanel('plans')}
        {pay && popup('pay', closePay)}
      </div>
    )
  return popup('all', close)
}
