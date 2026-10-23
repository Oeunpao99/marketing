// Upgrade / renew a plan, paid with KHQR (Bakong) — app/payments.py.
//   1. pick USD or KHR and a plan
//   2. a KHQR card (any Cambodian bank app scans it) with the amount and a
//      countdown; the page asks every few seconds whether it's paid
//   3. paid → the robot says thank you, the plan's end date, done
// Expired → make a new code; "mismatch" (paid, but not what we asked) → the
// team checks it. Closing while unpaid cancels the code (the server checks once
// more first, so a payment made just before closing still counts).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowLeft, FiCheck, FiClock, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import { loadCredits } from '../../lib/credits'
import LiveAvatar from '../ui/LiveAvatar'

const POLL_MS = 3000
const money = (amount, currency) =>
  currency === 'KHR' ? `${Math.round(amount).toLocaleString('en-US')} ៛` : `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function UpgradeDialog({ open, onClose, onPaid }) {
  const [info, setInfo] = useState(null) // GET /billing/plans
  const [currency, setCurrency] = useState('USD')
  const [pick, setPick] = useState(null)
  const [pay, setPay] = useState(null) // the payment (status, qr, amount, expires_at…)
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const payRef = useRef(null)
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
            loadCredits()
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

  const start = async () => {
    if (!pick) return
    setBusy(true)
    setError('')
    try {
      setPay(await api.post('/billing/pay', { plan: pick, currency }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    const p = payRef.current
    if (p?.status === 'pending') api.post(`/billing/pay/${p.id}/cancel`).catch(() => {})
    onClose()
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null
  const plan = info?.plans.find((p) => p.plan === pick)
  const left = pay ? Math.max(0, Math.round((Date.parse(pay.expires_at) - now) / 1000)) : 0
  const has = (p) => Object.keys(p.prices || {}).length > 0
  const currencies = ['USD', 'KHR'].filter((c) => info?.plans.some((p) => p.prices?.[c]))

  return createPortal(
    <div className="fixed inset-0 z-[160] grid place-items-center bg-night-950/50 p-4 animate-fadein" role="dialog" aria-modal="true" aria-label="Upgrade your plan" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-3xl border border-ink-200 bg-white p-5 shadow-pop">
        <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
          <FiX size={16} />
        </button>

        {/* 1 · pick a plan */}
        {!pay && (
          <>
            <h2 className="pr-8 text-[18px] font-bold text-ink-900">{info?.current && info.current !== 'free' ? 'Upgrade or renew' : 'Upgrade your plan'}</h2>
            <p className="mt-1 text-[12.5px] text-ink-500">One month, paid with KHQR from any Cambodian bank app.</p>
            {!info && !error && <div className="mt-6 text-[13px] text-ink-500">Loading…</div>}
            {info && !info.on_sale && (
              <div className="mt-5 rounded-2xl bg-canvas p-4 text-[13px] text-ink-700">
                <b>Coming soon.</b> Paid plans open shortly — contact us if you need more credits now.
              </div>
            )}
            {info?.on_sale && (
              <>
                {currencies.length > 1 && (
                  <div className="mt-4 inline-flex rounded-xl bg-canvas p-1">
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
                <div className="mt-4 space-y-2.5">
                  {info.plans.filter(has).map((p) => {
                    const price = p.prices[currency]
                    const current = p.plan === info.current
                    return (
                      <button
                        key={p.plan}
                        type="button"
                        disabled={!price}
                        onClick={() => setPick(p.plan)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors disabled:opacity-50 ${pick === p.plan ? 'border-brand bg-brand-soft' : 'border-ink-200 hover:border-ink-300'}`}
                      >
                        <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${pick === p.plan ? 'border-brand bg-brand text-white' : 'border-ink-300'}`}>
                          {pick === p.plan && <FiCheck size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
                            {p.label}
                            {current && <span className="rounded-full bg-ink-100 px-2 py-px text-[10px] font-semibold text-ink-600">Your plan</span>}
                          </span>
                          <span className="block text-[12px] text-ink-500">{p.monthly_credits.toLocaleString('en-US')} AI credits a month</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[16px] font-bold tabular-nums text-ink-900">{price ? money(price, currency) : '—'}</span>
                          <span className="block text-[10.5px] text-ink-400">a month</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {info.paid_until && (
                  <p className="mt-3 text-[11.5px] text-ink-500">
                    Your plan is paid until <b>{day(info.paid_until)}</b>. Renewing the same plan adds a month to that; a different plan starts today.
                  </p>
                )}
                <button type="button" onClick={start} disabled={!pick || !plan?.prices[currency] || busy} className="btn-primary mt-5 h-11 w-full text-[14px]">
                  {busy ? 'Making your code…' : plan?.prices[currency] ? `Pay ${money(plan.prices[currency], currency)} with KHQR` : 'Pick a plan'}
                </button>
              </>
            )}
            {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
          </>
        )}

        {/* 2 · the KHQR card, waiting */}
        {pay?.status === 'pending' && (
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
            <div className="mt-4 inline-flex items-center gap-2 text-[12.5px] text-ink-600">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              Waiting for your payment…
            </div>
            <div className={`mt-1 inline-flex items-center gap-1 text-[11.5px] tabular-nums ${left < 60 ? 'text-red-600' : 'text-ink-400'}`}>
              <FiClock size={11} /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left · {pay.plan_label} plan, one month
            </div>
          </div>
        )}

        {/* 3 · paid */}
        {pay?.status === 'paid' && (
          <div className="pt-2 text-center">
            <LiveAvatar size={120} className="mx-auto" />
            <h2 className="mt-2 text-[20px] font-bold text-ink-900">Payment received — thank you!</h2>
            <p className="mt-1.5 text-[13px] text-ink-600">
              Your <b>{pay.plan_label}</b> plan is on until <b>{day(pay.period_end)}</b>, and this month&apos;s credits are in your balance.
            </p>
            <p className="mt-1 text-[11.5px] text-ink-400">Receipt {pay.bill_number} · {money(pay.amount, pay.currency)}</p>
            <button type="button" onClick={onClose} className="btn-primary mx-auto mt-5 h-10 px-6">
              Done
            </button>
          </div>
        )}

        {/* expired / cancelled / mismatch */}
        {pay && !['pending', 'paid'].includes(pay.status) && (
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
    </div>,
    document.body,
  )
}
