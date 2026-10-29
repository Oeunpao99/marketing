import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaLinkedin } from 'react-icons/fa'
import { FiArrowLeft, FiArrowRight, FiCheck, FiImage, FiX } from 'react-icons/fi'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth'
import AddChannelPage from '../../pages/AddChannelPage'
import { useStore } from '../../store'
import { helloOpen } from '../../lib/hello'
import { kitSrc, uploadKitAsset } from '../brandkit/BrandKit'
import AutoTextarea from '../ui/AutoTextarea'
import Select from '../ui/Select'
import { refreshProducts, useBrandJourney } from './BrandJourney'

// The first-run setup (the boss's flow, 2026-10-29): a new account is asked, step by step —
//   ① Your company: its name, language, logo  →  ② Connect your platforms  →  ③ Your first product
// → "You're ready". About the sidebar's brand (useBrandJourney). Step 1 is required; 2 and 3 have
// "Do this later" — the window comes back on the next visit (a new tab / sign-in) until all three
// are done. Owners and admins only (they're the ones who can create brands and connect accounts).
//
// Settles once it knows whether it opens, and again when it closes — the spotlight tour
// (OnboardingTour) waits for that, so the two never stack.

const LATER_KEY = 'setup_later' // sessionStorage: "Do this later" for this visit
export const SETUP_SETTLED = 'dispatch:setup-settled'

let settled = false
function settle() {
  window.__cfSetupOpen = false
  if (settled) return
  settled = true
  window.dispatchEvent(new Event(SETUP_SETTLED))
}
/** The tour's question: has the setup window decided (and closed, if it opened)? */
export const setupSettled = () => settled

const later = () => {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}
const setLater = () => {
  try {
    sessionStorage.setItem(LATER_KEY, '1')
  } catch {
    /* private mode — it just asks again */
  }
}

const LANGS = [
  { value: 'Khmer + English', label: 'Khmer + English' },
  { value: 'Khmer', label: 'Khmer' },
  { value: 'English', label: 'English' },
]

const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', Icon: SiFacebook, color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', Icon: SiInstagram, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', Icon: SiTiktok, color: '#111827' },
  { id: 'youtube', name: 'YouTube', Icon: SiYoutube, color: '#FF0000' },
  { id: 'telegram', name: 'Telegram', Icon: SiTelegram, color: '#229ED9' },
  { id: 'linkedin', name: 'LinkedIn', Icon: FaLinkedin, color: '#0A66C2' },
]

const STEPS = [
  { id: 'brand', label: 'Your company' },
  { id: 'platforms', label: 'Your platforms' },
  { id: 'products', label: 'Your product' },
]

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export default function SetupWizard() {
  const { user } = useAuth()
  const { brands, channels, channelsReady } = useStore()
  const j = useBrandJourney()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0) // 0-2 the steps, 3 = ready
  const decided = useRef(false)

  const manager = user?.role === 'owner' || user?.role === 'admin'
  // products still loading for a brand: wait (the journey counts them as done until they load)
  const known = channelsReady && (!j.brand || j.productCount !== null)
  // the journey counts products "done" while they load or when there is no brand yet — here only a real product counts
  const done = { ...j.done, products: !!j.brand && j.productCount > 0 }
  const unfinished = !done.brand || !done.platforms || !done.products

  useEffect(() => {
    if (decided.current || !user) return
    if (!manager) return (decided.current = true), settle()
    if (!known) return
    // the Facebook Page picker after its sign-in lives on /channels/add — don't cover it
    if (location.pathname.startsWith('/channels/add')) return
    decided.current = true
    if (!unfinished || later()) return settle()
    const start = () => {
      window.__cfSetupOpen = true
      setStep(Math.max(0, STEPS.findIndex((s) => !done[s.id])))
      setOpen(true)
    }
    // just signed up: the hello first, then this
    if (helloOpen()) {
      window.addEventListener('dispatch:hello-done', () => setTimeout(start, 300), { once: true })
      return
    }
    start()
  }, [user, manager, known, unfinished, location.pathname, done.brand, done.platforms, done.products])

  if (!open) return null

  const close = (asLater) => {
    if (asLater) setLater()
    setOpen(false)
    settle()
  }
  const brand = j.brand

  return createPortal(
    <div className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-night-950/40 p-4 animate-fadein">
      <div role="dialog" aria-modal="true" aria-labelledby="setup-title" className="relative my-6 w-full max-w-[640px] rounded-3xl glass-panel">
        {step < 3 && (
          <header className="border-b border-ink-100 px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-brand">Let's set you up · step {step + 1} of 3</div>
                <h2 id="setup-title" className="mt-1 text-[20px] font-bold tracking-tight text-ink-900">
                  {step === 0 ? 'Tell us about your company' : step === 1 ? 'Connect where you post' : 'Add what you sell'}
                </h2>
              </div>
              {/* step 1 is required — nothing works without a brand */}
              {done.brand && (
                <button type="button" onClick={() => close(true)} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Do this later">
                  <FiX size={18} />
                </button>
              )}
            </div>
            <ol className="mt-4 flex items-center gap-2">
              {STEPS.map((s, i) => {
                const ok = done[s.id]
                const here = i === step
                return (
                  <li key={s.id} className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold ${
                        ok ? 'bg-emerald-500 text-white' : here ? 'bg-brand text-white' : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {ok ? <FiCheck size={13} /> : i + 1}
                    </span>
                    <span className={`truncate text-[12px] font-semibold ${here ? 'text-ink-900' : 'text-ink-500'}`}>{s.label}</span>
                    {i < STEPS.length - 1 && <span className="h-px flex-1 bg-ink-200" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </header>
        )}
        {step === 0 && <CompanyStep brand={brand} brands={brands} onNext={() => setStep(1)} />}
        {step === 1 && brand && (
          <PlatformsStep brand={brand} channels={channels} onBack={() => setStep(0)} onNext={() => setStep(2)} onLater={() => close(true)} />
        )}
        {step === 2 && brand && <ProductStep brand={brand} hasProduct={done.products} onBack={() => setStep(1)} onNext={() => setStep(3)} onLater={() => close(true)} />}
        {step === 3 && <Ready brand={brand} done={done} onClose={() => close(!(done.platforms && done.products))} />}
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-800">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Footer({ onBack, onLater, children }) {
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-6 py-4">
      {onBack && (
        <button type="button" onClick={onBack} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5">
          <FiArrowLeft size={14} /> Back
        </button>
      )}
      {onLater && (
        <button type="button" onClick={onLater} className="px-2 py-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">
          Do this later
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </footer>
  )
}

/** ① The company: its name, the language it posts in, a line about it, and its logo. */
function CompanyStep({ brand, brands, onNext }) {
  const { setBrands, switchBrand, refreshChannels, refreshAuto } = useStore()
  const [name, setName] = useState(brand?.name || '')
  const [lang, setLang] = useState(brand?.lang || 'Khmer + English')
  const [note, setNote] = useState(brand?.note || '')
  const [logo, setLogo] = useState(null) // a picked File
  const [preview, setPreview] = useState(brand?.logoUrl ? kitSrc(brand.logoUrl) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pick = useRef(null)

  useEffect(() => () => logo && URL.revokeObjectURL(preview), [logo, preview])

  const save = async () => {
    const clean = name.trim()
    if (!clean) return setError('Enter your company or shop name.')
    setBusy(true)
    setError(null)
    try {
      let saved = brand
      if (!brand) {
        const slug = slugify(clean) || `brand-${Date.now().toString(36)}`
        if (brands.some((b) => b.slug === slug)) throw new Error('A brand with that name already exists.')
        saved = await api.post('/brands', { name: clean, slug, lang, note: note.trim() })
        setBrands((cur) => [...cur, saved].sort((a, b) => a.name.localeCompare(b.name)))
        switchBrand?.(saved.slug)
        refreshAuto?.()
      } else if (clean !== brand.name || lang !== (brand.lang || '') || note.trim() !== (brand.note || '')) {
        await api.patch(`/brands/${brand.id}`, { name: clean, lang, note: note.trim() })
      }
      if (logo) await uploadKitAsset(logo, { brandId: saved.id, kind: 'logo' })
      await refreshChannels?.() // the brand's logo and name, everywhere
      onNext()
    } catch (e) {
      setError(e.message || 'Could not save — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => pick.current?.click()}
            className="group grid h-[88px] w-[88px] flex-none place-items-center overflow-hidden rounded-2xl border border-dashed border-ink-300 bg-canvas text-ink-400 hover:border-brand-line hover:text-brand"
            title="Upload your logo"
          >
            {preview ? (
              <img src={preview} alt="" className="h-[84%] w-[84%] object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                <FiImage size={20} />
                Your logo
              </span>
            )}
          </button>
          <input
            ref={pick}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setLogo(f)
              setPreview(URL.createObjectURL(f))
              e.target.value = ''
            }}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <Field label="What is your company or shop called?">
              <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kofi House" className="input" />
            </Field>
            <p className="text-[11.5px] text-ink-500">
              {preview ? 'Click the logo to change it.' : 'Upload your logo (PNG or JPG) — it goes on your posters and videos.'}
            </p>
          </div>
        </div>
        <Field label="Which language do you post in?">
          <Select value={lang} options={LANGS} onChange={setLang} />
        </Field>
        <Field label="What does your business do?" hint="One or two lines — the AI writes your posts from this.">
          <AutoTextarea minRows={2} maxRows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. A coffee shop in Phnom Penh — Cambodian beans, roasted every morning." className="input" />
        </Field>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
      </div>
      <Footer>
        <button type="button" disabled={busy} onClick={save} className="btn-primary inline-flex items-center gap-1.5">
          {busy ? 'Saving…' : 'Next'} {!busy && <FiArrowRight size={14} />}
        </button>
      </Footer>
    </>
  )
}

/** ② Platforms: a tile each — connected ones ticked; one opens the connect flow right here. */
function PlatformsStep({ brand, channels, onBack, onNext, onLater }) {
  const { refreshChannels } = useStore()
  const [connecting, setConnecting] = useState(null) // platform id
  const live = (id) => channels.filter((c) => c.b === brand.slug && c.p === id && c.s !== 'off')
  const any = channels.some((c) => c.b === brand.slug && c.s !== 'off')

  if (connecting) {
    return (
      <div>
        <button type="button" onClick={() => setConnecting(null)} className="mx-6 mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">
          <FiArrowLeft size={14} /> All platforms
        </button>
        <AddChannelPage
          embedded
          initial={{ brandSlug: brand.slug, platformSlug: connecting }}
          onClose={() => (setConnecting(null), refreshChannels?.())}
        />
      </div>
    )
  }
  return (
    <>
      <div className="px-6 py-5">
        <p className="text-[13px] leading-relaxed text-ink-600">
          Where should <b className="text-ink-900">{brand.name}</b> post? Connect at least one — you can add more any time. Facebook, TikTok and YouTube open
          their own sign-in and bring you back here.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLATFORMS.map(({ id, name, Icon, color }) => {
            const on = live(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => setConnecting(id)}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all duration-150 ${
                  on.length ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-200 bg-white hover:border-brand-line hover:shadow-card'
                }`}
              >
                {on.length > 0 && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                    <FiCheck size={12} />
                  </span>
                )}
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ color, background: `${color}14` }}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="text-[13px] font-semibold text-ink-900">{name}</span>
                <span className={`text-[11px] ${on.length ? 'font-semibold text-emerald-700' : 'text-brand'}`}>
                  {on.length ? (on.length > 1 ? `${on.length} connected` : 'Connected') : 'Connect'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <Footer onBack={onBack} onLater={any ? null : onLater}>
        <button type="button" disabled={!any} onClick={onNext} title={any ? '' : 'Connect one platform first'} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
          Next <FiArrowRight size={14} />
        </button>
      </Footer>
    </>
  )
}

/** ③ The first product: its name, what it is, the facts the AI may use. */
function ProductStep({ brand, hasProduct, onBack, onNext, onLater }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [highlights, setHighlights] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    if (hasProduct && !name.trim()) return onNext()
    if (!name.trim()) return setError('Enter the name of a product or service.')
    setBusy(true)
    setError(null)
    try {
      await api.post('/products', { brand_id: brand.id, name: name.trim(), description: description.trim(), highlights: highlights.trim() })
      await refreshProducts()
      onNext()
    } catch (e) {
      setError(e.message || 'Could not save — try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-4 px-6 py-5">
        <p className="text-[13px] leading-relaxed text-ink-600">
          {hasProduct
            ? `${brand.name} already has a product — add another, or go on.`
            : `What does ${brand.name} sell? The AI only uses these facts, so your posts stay true.`}
        </p>
        <Field label="Product or service name">
          <input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Iced latte" className="input" />
        </Field>
        <Field label="What is it?" hint="A line or two, like you'd tell a customer.">
          <AutoTextarea minRows={2} maxRows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Our best seller — Mondulkiri beans, fresh milk, less sugar." className="input" />
        </Field>
        <Field label="Price and key facts" hint="Optional — price, sizes, opening hours, delivery…">
          <AutoTextarea minRows={2} maxRows={6} value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="e.g. $2.50 · M and L · delivery in Phnom Penh" className="input" />
        </Field>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">{error}</div>}
      </div>
      <Footer onBack={onBack} onLater={hasProduct ? null : onLater}>
        <button type="button" disabled={busy} onClick={save} className="btn-primary inline-flex items-center gap-1.5">
          {busy ? 'Saving…' : hasProduct && !name.trim() ? 'Next' : 'Save and finish'} {!busy && <FiArrowRight size={14} />}
        </button>
      </Footer>
    </>
  )
}

/** All set: what's ready, and the first thing to do. */
function Ready({ brand, done, onClose }) {
  const navigate = useNavigate()
  const go = (to) => (onClose(), navigate(to))
  return (
    <div className="px-6 py-8 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500 text-white shadow-card">
        <FiCheck size={30} />
      </div>
      <h2 id="setup-title" className="mt-4 text-[22px] font-bold tracking-tight text-ink-900">
        {brand?.name} is ready to go
      </h2>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-ink-500">
        Your company, your platforms and your products are set. Now let the AI make your first post — you approve it before it goes out.
      </p>
      {!(done.platforms && done.products) && (
        <p className="mx-auto mt-2 max-w-[420px] text-[12px] text-amber-700">Something is still missing — we'll remind you next time.</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => go('/command')} className="btn-outline">
          Go to Command center
        </button>
        <button type="button" onClick={() => go('/new')} className="btn-primary">
          Make my first post
        </button>
      </div>
    </div>
  )
}
