import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  FiArrowRight,
  FiAward,
  FiBriefcase,
  FiBarChart2,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiCode,
  FiCpu,
  FiCreditCard,
  FiDownload,
  FiEdit3,
  FiEye,
  FiFilm,
  FiGift,
  FiGlobe,
  FiImage,
  FiKey,
  FiLayers,
  FiMessageCircle,
  FiMic,
  FiMoon,
  FiPenTool,
  FiMousePointer,
  FiPlay,
  FiPlayCircle,
  FiRepeat,
  FiSend,
  FiShield,
  FiSun,
  FiTrendingUp,
  FiType,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { applyTheme, isDark } from '../lib/theme'
import { FaLinkedin } from 'react-icons/fa'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { MOTION_TEMPLATES, previewSrc } from '../lib/motionTemplates'
import { NEW_DAYS } from '../lib/announce'
import { Course } from './TutorialsPage'
import Developers from './DevelopersPage'
import { PhoneFrame, RENDER } from '../components/preview/SocialPreview'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../components/ui/PlatformIcon'
import LiveAvatar from '../components/ui/LiveAvatar'
import { PLANS } from '../lib/plans'
import SkyGuide from '../components/landing/SkyGuide'
import AvatarPublish from '../components/landing/AvatarPublish'
import TemplateGallery from '../components/landing/TemplateGallery'
import { api, tokenStore } from '../api/client'

// The public page at "/" for people who aren't signed in (search engines,
// visitors from ads): what Smart Marketing does, shown with the product's
// own template videos. "Log in" / "Start free" open the sign-in screen.
// Only true claims — no made-up ratings, customers or logos. The prices
// (Pricing) are the owner's own plans.

// Khmer in Google Sans's own Khmer letters, like the app (Google Fonts serves a Khmer part of it)
const km = { fontFamily: '"Google Sans", "Khmer OS Siemreap", sans-serif' }

// English / Khmer — the switch in the header, remembered on this device.
// t('English', 'ខ្មែរ') or t(['English', 'ខ្មែរ']) gives the text for the language picked.
const LANG_KEY = 'smartmkt.lang'
const LangCtx = createContext('en')
function useT() {
  const lang = useContext(LangCtx)
  const t = (en, kh) => (Array.isArray(en) ? en[lang === 'km' ? 1 : 0] : lang === 'km' ? kh : en)
  t.lang = lang
  return t
}
function startLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'km') return saved
  } catch {
    // private window: fall back to the browser's language
  }
  return (navigator.language || '').toLowerCase().startsWith('km') ? 'km' : 'en'
}

// Drawn flags — Windows shows flag emoji as two letters, so these are SVG.
function FlagKH({ className = '' }) {
  return (
    <svg viewBox="0 0 60 40" className={className} aria-hidden="true">
      <rect width="60" height="40" fill="#032EA1" />
      <rect y="10" width="60" height="20" fill="#E00025" />
      {/* Angkor Wat */}
      <g fill="#fff">
        <rect x="16" y="26" width="28" height="2.5" />
        <rect x="19" y="21" width="22" height="5" />
        <path d="M30 11 L32.6 21 H27.4 Z" />
        <path d="M23.5 14.5 L25.6 21 H21.4 Z" />
        <path d="M36.5 14.5 L38.6 21 H34.4 Z" />
        <path d="M19 17.5 L20.6 21 H17.4 Z" />
        <path d="M41 17.5 L42.6 21 H39.4 Z" />
      </g>
    </svg>
  )
}
function FlagGB({ className = '' }) {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <clipPath id="lp-gb-t">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#lp-gb-t)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

const LANGS = [
  ['km', FlagKH, 'ខ្មែរ', 'Khmer'],
  ['en', FlagGB, 'English', 'អង់គ្លេស'],
]

/** The language menu in the header: the current flag, and a dropdown with both. */
function LangSwitch({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  const [, Flag, label] = LANGS.find(([id]) => id === lang) || LANGS[1]
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Language"
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-200 px-2.5 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 ${open ? 'bg-ink-50' : ''}`}
      >
        <Flag className="h-3.5 w-5 flex-none overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
        <span className="hidden xl:inline" style={lang === 'km' ? km : undefined}>
          {label}
        </span>
        <FiChevronDown size={13} className={`text-ink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-48 rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop animate-fadein">
          {LANGS.map(([id, F, name, other]) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={lang === id}
              onClick={() => {
                setLang(id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${lang === id ? 'bg-brand-soft' : 'hover:bg-ink-50'}`}
            >
              <F className="h-4 w-6 flex-none overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink-900" style={id === 'km' ? km : undefined}>
                  {name}
                </span>
                <span className="block text-[11px] text-ink-500" style={id === 'en' ? km : undefined}>
                  {other}
                </span>
              </span>
              {lang === id && <FiCheck size={15} className="flex-none text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const CHANNELS = [
  { Icon: SiFacebook, name: 'Facebook', color: '#1877F2' },
  { Icon: SiInstagram, name: 'Instagram', color: '#E4405F' },
  { Icon: SiTiktok, name: 'TikTok', color: 'currentColor' },
  { Icon: SiTelegram, name: 'Telegram', color: '#26A5E4' },
  { Icon: FaLinkedin, name: 'LinkedIn', color: '#0A66C2' },
  { Icon: SiYoutube, name: 'YouTube', color: '#FF0000' },
]

// the strip: the 10 newest templates (their `added` date, lib/motionTemplates.js) — so a template
// we just made is on the website the day it ships — then the long-time favourites
const FAVOURITES = ['studio', 'reaction', 'doodle', 'cartoon', 'lesson', 'rise', 'neural', 'countdown', 'tips', 'pov']
const SHOWCASE = [
  ...MOTION_TEMPLATES.filter((x) => x.added)
    .sort((a, b) => Date.parse(b.added) - Date.parse(a.added))
    .slice(0, 10)
    .map((x) => x.id),
  ...FAVOURITES,
  ...MOTION_TEMPLATES.map((x) => x.id),
].filter((id, i, all) => all.indexOf(id) === i)
const isNew = (tp) => !!tp?.added && Date.now() - Date.parse(tp.added) < NEW_DAYS * 86400000
// a template's id → the style its videos are recorded under (app/motion.py STYLES)
const STYLE_OF = { sell: 'tech', teach: 'explainer', stickman: 'picture' }

/** How many businesses made a video with each template (GET /api/public/template-usage). */
function useTemplateUsage() {
  const [use, setUse] = useState({})
  useEffect(() => {
    let live = true
    fetch('/api/public/template-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.templates && setUse(d.templates))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return (id) => use[STYLE_OF[id] || id]?.businesses || 0
}

/** A phone playing one of our template preview clips (public/templates/<id>.mp4). */
function Phone({ id, className = '', tilt = 0, label }) {
  // plays only while on screen — the page has 20+ of these
  const video = useRef(null)
  useEffect(() => {
    const v = video.current
    if (!v) return undefined
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.2 })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  return (
    // the tilt goes on the inner frame: on the figure it overrode the position classes (-translate-x-1/2)
    <figure className={className || 'relative'}>
      {/* the screen is exactly 9:16 — the clips' own shape, so nothing is cropped — with
          the notch on its own black strip above it, not over the video */}
      <div className="relative overflow-hidden rounded-[2.2rem] border-[6px] border-night-950 bg-night-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:border-night-800 dark:ring-white/20" style={{ transform: `rotate(${tilt}deg)` }}>
        {/* the phone's top strip: our logo on the left (like the app on its screen), the notch in the middle */}
        <div className="relative flex h-6 items-center justify-center">
          <img src="/brand/logo-mark.png" alt="" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded-[5px] bg-white object-contain p-[1.5px]" />
          <div className="h-3.5 w-14 rounded-full bg-black" />
        </div>
        <div className="relative aspect-[9/16] overflow-hidden rounded-b-[1.6rem] bg-night-900">
          <video
            ref={video}
            src={previewSrc(id, 'mp4')}
            poster={previewSrc(id)}
            preload="metadata"
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      </div>
      {label && <figcaption className="mt-3 text-center text-[12.5px] font-semibold text-ink-700">{label}</figcaption>}
    </figure>
  )
}

/** The page's background texture: a fine grid that fades out toward the edges (it was
 * blurred colour glows — the owner asked for the grid instead). Light or dark with the theme. */
function GridBackdrop({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage: 'linear-gradient(rgb(var(--ink-900) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--ink-900) / 0.06) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        backgroundPosition: 'center top',
        maskImage: 'radial-gradient(ellipse 85% 75% at 50% 40%, black 35%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at 50% 40%, black 35%, transparent 100%)',
      }}
    />
  )
}

// The templates that also come wide (16:9) — public/templates/<id>-wide.mp4
const WIDE = [
  { id: 'cartoon', name: 'Story · Characters' },
  { id: 'lesson', name: 'Lesson · Teacher' },
  { id: 'neural', name: 'AI explainer · Neural' },
]

/** A laptop playing the wide versions in turn — or the one picked below it. */
function Laptop() {
  const [n, setN] = useState(0)
  const clip = WIDE[n]
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative mx-auto w-[92%] rounded-t-[1.4rem] border-[10px] border-b-[14px] border-night-800 bg-night-950 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] dark:ring-1 dark:ring-white/15">
        <div className="absolute left-1/2 top-[-7px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-night-950" />
        <div className="relative aspect-video overflow-hidden rounded-md bg-night-950">
          <video
            key={clip.id}
            src={previewSrc(`${clip.id}-wide`, 'mp4')}
            autoPlay
            muted
            playsInline
            onEnded={() => setN((n + 1) % WIDE.length)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>
      {/* the base */}
      <div className="relative mx-auto h-3.5 w-full rounded-b-2xl bg-gradient-to-b from-night-800 to-night-950">
        <div className="absolute left-1/2 top-0 h-1.5 w-24 -translate-x-1/2 rounded-b-lg bg-night-950/80" />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {WIDE.map((w, i) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setN(i)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${i === n ? 'bg-brand text-white' : 'border border-ink-200 bg-white text-ink-600 hover:bg-ink-50'}`}
          >
            {w.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The templates past the 10 that play: dimmed and locked, a key on each — signing
 * up unlocks them (every one opens the sign-up). */
function LockedTemplates({ onStart }) {
  const t = useT()
  const locked = MOTION_TEMPLATES.filter((x) => !SHOWCASE.includes(x.id))
  const deck = locked.slice(0, 5)
  const names = locked.slice(0, 8)
  // the fan: each card's turn and offset, closed and (on hover) spread open
  const fan = [
    { r: -16, x: -118, open: -170 },
    { r: -8, x: -58, open: -86 },
    { r: 0, x: 0, open: 0 },
    { r: 8, x: 58, open: 86 },
    { r: 16, x: 118, open: 170 },
  ]
  return (
    <div className="mt-14 px-4 sm:px-6">
      {/* one banner: what's locked and how to open it, the deck beside it */}
      <div className="group mx-auto grid max-w-6xl items-center gap-8 overflow-hidden rounded-3xl border border-ink-200 bg-white p-7 shadow-card sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[12px] font-bold text-brand">
            <FiKey size={13} /> {t('Members only', 'សម្រាប់សមាជិក')}
          </span>
          <h3 className="mt-4 text-[26px] font-bold leading-tight text-ink-900 sm:text-[30px]">
            {t(`${locked.length} more templates inside`, `គំរូ ${locked.length} ទៀត នៅខាងក្នុង`)}
          </h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">
            {t(
              'Sign up free to use every template, the AI design, your logo and colours, and the Khmer voices.',
              'ចុះឈ្មោះឥតគិតថ្លៃ ដើម្បីប្រើគ្រប់គំរូ ការរចនាដោយ AI ឡូហ្គោ និងពណ៌របស់បង និងសំឡេងខ្មែរ។',
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {names.map((x) => (
              <span key={x.id} className="rounded-full border border-ink-200 px-2.5 py-1 text-[12px] font-medium text-ink-600">
                {x.name}
              </span>
            ))}
            <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[12px] font-semibold text-ink-50">
              +{locked.length - names.length} {t('more', 'ទៀត')}
            </span>
          </div>
          <button type="button" onClick={onStart} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-[14px] font-semibold text-white shadow-glow-lg transition-all hover:gap-3">
            {t('Get started free', 'ចាប់ផ្តើមឥតគិតថ្លៃ')} <FiArrowRight />
          </button>
        </div>
        {/* the deck */}
        <button type="button" onClick={onStart} className="relative mx-auto h-[280px] w-full max-w-[460px] sm:h-[320px]" aria-label={t('Sign up to unlock the templates', 'ចុះឈ្មោះដើម្បីដោះសោគំរូ')}>
          {deck.map((tp, i) => {
            const f = fan[i]
            const front = i === 2
            return (
              <div
                key={tp.id}
                className="absolute left-1/2 top-1/2 w-[132px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_18px_40px_-14px_rgba(15,23,42,0.35)] transition-transform duration-500 ease-out sm:w-[150px] [--x:var(--closed)] group-hover:[--x:var(--open)]"
                style={{
                  '--closed': `${f.x}px`,
                  '--open': `${f.open}px`,
                  zIndex: front ? 5 : 4 - Math.abs(i - 2),
                  transform: `translate(calc(-50% + var(--x)), calc(-50% + ${Math.abs(f.r) * 1.1}px)) rotate(${f.r}deg)`,
                }}
              >
                <div className="relative aspect-[9/16]">
                  <img src={previewSrc(tp.id)} alt="" loading="lazy" className={`h-full w-full object-cover ${front ? 'blur-[2px]' : 'blur-[3px] opacity-80'}`} />
                  {front && (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-night-950/80 text-white ring-1 ring-white/25">
                        <FiKey size={17} />
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </button>
      </div>
    </div>
  )
}

/** Fades a block up as it scrolls into view. */
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// letter spacing pulls Khmer letters apart — only the English label is spaced out
const eyebrowCls = (lang) => `text-[12px] font-bold text-brand ${lang === 'km' ? 'text-[13px]' : 'uppercase tracking-[0.14em]'}`
function Eyebrow({ children }) {
  return <div className={eyebrowCls(useT().lang)}>{children}</div>
}

function SectionTitle({ eyebrow, title, khmer, sub }) {
  // the Khmer tagline under an English title is off (too much text — the owner, 2026-10-29);
  // the Khmer page has its own titles. ``khmer`` stays on the sections, unused, to bring back.
  const en = useT().lang !== 'km'
  khmer = null
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        className={`mt-3 font-bold leading-tight tracking-tight text-ink-900 ${en ? 'text-[30px] sm:text-[40px]' : 'text-[28px] sm:text-[38px]'}`}
      >
        {title}
      </h2>
      {khmer && (
        <p className="mt-2 text-[17px] font-medium text-ink-600 sm:text-[19px]" style={km}>
          {khmer}
        </p>
      )}
      {sub && <p className="mt-4 text-[15.5px] leading-relaxed text-ink-500">{sub}</p>}
    </div>
  )
}

// ── the product, as it really looks ───────────────────────────────────────
// Real screenshots of the app (public/landing/*.jpg — cut from the video
// tutorials' captures of the demo brand), in a browser frame or as the phone
// preview, with a few labels floating over them.

/** A label floating over a screenshot: an icon tile and one line. ``at`` places it. */
function FloatTag({ icon: Icon, text, at, delay = 0 }) {
  return (
    <div
      className={`absolute z-10 hidden items-center gap-2.5 rounded-2xl border border-ink-200 bg-white px-3 py-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)] sm:flex ${at}`}
      style={{ animation: `lp-float 6s ease-in-out ${delay}s infinite` }}
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon size={15} />
      </span>
      <span className="whitespace-nowrap text-[13px] font-semibold text-ink-900">{text}</span>
    </div>
  )
}

/** A screenshot of the app in a plain browser frame. */
function AppShot({ src, alt, tags = [] }) {
  return (
    <div className="relative px-2 py-6 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_24px_64px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-ink-100 bg-canvas px-4 py-2.5">
          {['bg-red-400', 'bg-amber-400', 'bg-emerald-400'].map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-full ${c}`} />
          ))}
          <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-ink-400">mkt.chlart.org</span>
        </div>
        <img src={src} alt={alt} loading="lazy" className="block w-full" />
      </div>
      {tags.map((tag, i) => (
        <FloatTag key={tag.text} {...tag} delay={i * 1.2} />
      ))}
    </div>
  )
}

/** The phone preview of a post (the app's own Preview), standing on a soft brand tile. */
function PhoneShot({ src, alt, tags = [] }) {
  return (
    <div className="relative flex justify-center px-2 py-6">
      <div className="absolute inset-x-8 inset-y-16 rounded-[40px] bg-brand-soft" />
      <img src={src} alt={alt} loading="lazy" className="relative w-[min(300px,70vw)] rounded-[40px] drop-shadow-[0_30px_40px_rgba(15,23,42,0.25)]" />
      {tags.map((tag, i) => (
        <FloatTag key={tag.text} {...tag} delay={i * 1.2} />
      ))}
    </div>
  )
}

function Feature({ eyebrow, title, khmer, text, points, visual, flip = false }) {
  const en = useT().lang !== 'km'
  if (!en) khmer = null
  return (
    <div className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3
          className={`mt-3 font-bold leading-tight tracking-tight text-ink-900 ${en ? 'text-[28px] sm:text-[34px]' : 'text-[26px] sm:text-[32px]'}`}
        >
          {title}
        </h3>
        {khmer && (
          <p className="mt-2 text-[16px] font-medium text-ink-600" style={km}>
            {khmer}
          </p>
        )}
        <p className="mt-4 text-[15.5px] leading-relaxed text-ink-500">{text}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[14.5px] text-ink-700">
              <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-soft text-brand">
                <FiCheck size={12} strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={150}>{visual}</Reveal>
    </div>
  )
}

// ── one post, live everywhere ───────────────────────────────────────────
// The same post as each platform shows it — the app's own previews
// (components/preview/SocialPreview.jsx: PhoneFrame + RENDER, as in Compose),
// scaled down, side by side — and the one button that sends it to all of them.
const LIVE_APPS = ['TikTok', 'Instagram', 'Facebook', 'LinkedIn', 'Telegram']
const LIVE_SCALE = 0.56 // the previews are drawn at a real phone's size (360 × 702)
const LIVE_CAPTION = 'AI ជួយអាជីវកម្មតូចបានយ៉ាងម៉េច? 🤖\nកល្យាណ ជំនួយការរបស់យើង ពន្យល់ជូនក្នុងមួយនាទី។\n✅ សរសេរការផុស ✅ ឆ្លើយសារ ✅ មើលលទ្ធផល\n#SmartMarketing #AI'

function LiveEverywhere({ onStart }) {
  const t = useT()
  const brand = { name: 'Smart Marketing', slug: 'smart-marketing', logo: '/brand/logo-mark.png' }
  // a real template video (the Presenter), playing by itself, silent; a full URL — the
  // previews resolve other paths against the media server
  const media = typeof window === 'undefined' ? null : { kind: 'video', url: `${window.location.origin}${previewSrc('presenter', 'mp4')}`, autoPlay: true }
  return (
    <section id="everywhere" className="relative isolate scroll-mt-20 overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
      <GridBackdrop className="-z-10 opacity-60" />
      <SectionTitle
        eyebrow={t('Post everywhere', 'បង្ហោះគ្រប់កន្លែង')}
        title={t('One click — live on all your socials', 'ចុចម្តង — ចេញលើគ្រប់បណ្តាញសង្គម')}
        sub={t('One post, the right size for each platform.', 'ប្រកាសមួយ ទំហំត្រឹមត្រូវសម្រាប់វេទិកានីមួយៗ។')}
      />

      {/* the one button */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={onStart}
          className="relative inline-flex items-center gap-2.5 rounded-full bg-brand px-6 py-3 text-[14.5px] font-bold text-white shadow-[0_14px_30px_-10px_rgb(var(--brand)/0.7)] transition-all hover:gap-3.5"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:2.4s]" aria-hidden="true" />
          <FiZap size={16} className="relative" />
          <span className="relative">{t('Post to 5 places', 'បង្ហោះទៅ ៥ កន្លែង')}</span>
        </button>
      </div>

      {/* the five phones, in one straight row */}
      <div className="mx-auto mt-12 flex max-w-6xl items-start justify-center gap-3 sm:gap-5">
        {LIVE_APPS.map((app, i) => {
          const Post = RENDER[app]
          return (
            <Reveal key={app} delay={i * 90} className={i === 0 || i === 4 ? 'hidden lg:block' : i === 1 || i === 3 ? 'hidden sm:block' : ''}>
              <div className="flex flex-col items-center">
                <div className="relative overflow-hidden" style={{ width: 360 * LIVE_SCALE, height: 702 * LIVE_SCALE }}>
                  <div className="absolute left-0 top-0 origin-top-left" style={{ width: 360, transform: `scale(${LIVE_SCALE})` }} aria-hidden="true">
                    <PhoneFrame app={app} brand={brand}>
                      <Post brand={brand} caption={LIVE_CAPTION} media={media} />
                    </PhoneFrame>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pl-1.5 pr-3 shadow-card">
                  <span className={`grid h-6 w-6 place-items-center rounded-full bg-canvas ${PLAT_BRAND_CLASS[app] || ''}`}>
                    <PlatformIcon name={app} />
                  </span>
                  <span className="text-[12.5px] font-semibold text-ink-800">{app}</span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-px text-[10.5px] font-bold text-white">
                    <FiCheck size={10} strokeWidth={3.5} /> {t('Live', 'ចេញហើយ')}
                  </span>
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

/** The how-to videos, shown off: a plain card (no glow — the user asked), a
 * badge, the lesson video behind a big play button (it plays here, with
 * controls) and three short points — a link goes to all of them (/mkt-tutorial). */
function TutorialShowcase() {
  const t = useT()
  const [playing, setPlaying] = useState(false)
  const video = useRef(null)
  const play = () => {
    setPlaying(true)
    video.current?.play().catch(() => {})
  }
  return (
    <section id="tutorials" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-ink-200 bg-white px-5 pb-10 pt-12 shadow-card sm:px-10 sm:pb-12">

          <div className="relative mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-xl border border-violet-300/60 bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-ink-800 shadow-[0_0_24px_-6px_rgb(139_92_246/0.6)] dark:border-violet-400/40 dark:bg-white/5">
              <FiPlayCircle className="text-violet-500" size={16} />
              {t('Video tutorials', 'មេរៀនជាវីដេអូ')}
            </span>
            <h2 className="mt-5 text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[38px]">
              {t('Learn it in a few minutes', 'រៀនប្រើបាន ក្នុងប៉ុន្មាននាទី')}
            </h2>
            <p className="mt-3 text-[15.5px] font-medium leading-relaxed text-ink-600">
              {t(
                'Short videos in Khmer walk through every step on the real screens — connect your pages, plan your week, make your first video.',
                'វីដេអូខ្លីៗជាភាសាខ្មែរ បង្ហាញគ្រប់ជំហាន លើអេក្រង់ពិត — ភ្ជាប់ទំព័រ រៀបចំផែនការសប្តាហ៍ បង្កើតវីដេអូដំបូងរបស់បង។',
              )}
            </p>
            <a href="/mkt-tutorial" className="mt-5 inline-flex items-center gap-1 text-[14px] font-semibold text-ink-900 hover:text-brand">
              {t('See all tutorials', 'មើលមេរៀនទាំងអស់')} <FiArrowRight size={14} />
            </a>
          </div>

          {/* the lesson itself */}
          <div className="relative mx-auto mt-9 aspect-video w-full max-w-5xl overflow-hidden rounded-2xl border border-ink-200 bg-night-950 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
            <video
              ref={video}
              src="/tutorials/connect.mp4"
              poster="/tutorials/connect-thumb.jpg"
              preload="none"
              playsInline
              controls={playing}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {!playing && (
              <button type="button" onClick={play} aria-label={t('Play the lesson', 'ចាក់មេរៀន')} className="group absolute inset-0 grid place-items-center bg-black/10">
                <span className="grid h-[72px] w-[92px] place-items-center rounded-2xl border border-white/30 bg-white/20 text-white shadow-2xl backdrop-blur-md transition-transform group-hover:scale-105">
                  <FiPlay size={34} className="ml-1 fill-white" />
                </span>
              </button>
            )}
          </div>

          <div className="relative mx-auto mt-10 grid max-w-5xl gap-7 sm:grid-cols-3">
            {[
              [FiMic, t('Narrated in Khmer', 'និយាយជាភាសាខ្មែរ'), t('Every step explained out loud, with subtitles you can follow.', 'គ្រប់ជំហានពន្យល់ជាសំឡេង មានអក្សររត់ងាយតាម។')],
              [FiMousePointer, t('Click by click', 'ចុចម្តងមួយៗ'), t('The screen zooms in and a box shows exactly where to click.', 'អេក្រង់ពង្រីក ហើយប្រអប់បង្ហាញច្បាស់ថាត្រូវចុចកន្លែងណា។')],
              [FiUsers, t('Ready to train your team', 'ងាយបង្ហាត់ក្រុមការងារ'), t('Send one link to new staff — no account needed to watch.', 'ផ្ញើតំណភ្ជាប់មួយទៅបុគ្គលិកថ្មី — មើលបានដោយមិនចាំបាច់មានគណនី។')],
            ].map(([Icon, title, text]) => (
              <div key={title}>
                <div className="flex items-center gap-2.5 text-[15px] font-bold text-ink-900">
                  <Icon className="flex-none text-violet-500" size={18} />
                  {title}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

const MORE = [
  {
    Icon: FiMessageCircle,
    title: ['Leads & hand-off', 'អតិថិជនសក្តានុពល និងការបញ្ជូនបន្ត'],
    text: [
      'Messages from your pages and chatbot land in one list, routed to the right person on your team.',
      'សារពីទំព័រ និង chatbot របស់បង ចូលមកក្នុងបញ្ជីតែមួយ ហើយបញ្ជូនទៅអ្នកត្រឹមត្រូវក្នុងក្រុម។',
    ],
  },
  {
    Icon: FiGlobe,
    title: ['Website check', 'ពិនិត្យគេហទំព័រ'],
    text: [
      'Health, SEO, speed, share previews and domain email — with AI fixes and a weekly alert.',
      'សុខភាព SEO ល្បឿន រូបភាពពេលចែករំលែក និងអ៊ីមែលដូមេន — មាន AI ជួយកែ និងការជូនដំណឹងប្រចាំសប្តាហ៍។',
    ],
  },
  {
    Icon: FiPenTool,
    title: ['Brand kit', 'កញ្ចប់ម៉ាក'],
    text: [
      'Your logo, products and screenshots. Your colours are read from your logo and used in every design.',
      'ឡូហ្គោ ផលិតផល និងរូបថតអេក្រង់របស់បង។ ពណ៌ត្រូវបានអានពីឡូហ្គោ ហើយប្រើក្នុងគ្រប់ការរចនា។',
    ],
  },
  {
    Icon: FiImage,
    title: ['Posters & memes in Khmer', 'ប៉ូស្ទ័រ និងមីមជាភាសាខ្មែរ'],
    text: [
      'Pictures with real Khmer text drawn correctly — never the scrambled letters image AI makes.',
      'រូបភាពមានអក្សរខ្មែរពិតប្រាកដ គូរត្រឹមត្រូវ — មិនមែនអក្សរច្របូកច្របល់ ដែល AI រូបភាពបង្កើតនោះទេ។',
    ],
  },
  {
    Icon: FiCpu,
    title: ['Pick your AI', 'ជ្រើស AI របស់បង'],
    text: [
      'Choose the model that writes for you — Claude, GPT or Gemini — and see what each costs.',
      'ជ្រើសម៉ូដែលដែលសរសេរឲ្យបង — Claude, GPT ឬ Gemini — ហើយមើលតម្លៃនីមួយៗ។',
    ],
  },
  {
    Icon: FiUsers,
    title: ['Team & workspaces', 'ក្រុម និងកន្លែងធ្វើការ'],
    text: [
      'Invite your team with their own access. Each business has its own private workspace.',
      'អញ្ជើញក្រុមរបស់បង ជាមួយសិទ្ធិផ្ទាល់ខ្លួន។ អាជីវកម្មនីមួយៗមានកន្លែងធ្វើការឯកជនរបស់ខ្លួន។',
    ],
  },
]

const FAQ = [
  [
    ['Does it write in Khmer?', 'តើវាសរសេរជាភាសាខ្មែរបានទេ?'],
    [
      'Yes — captions, video scripts, subtitles and the voice are made for Khmer first, and English when you want it. You can also post Khmer first, then English, in one post.',
      'បាន — ចំណងជើង ស្គ្រីបវីដេអូ អក្សររត់ និងសំឡេង ធ្វើឡើងសម្រាប់ភាសាខ្មែរជាមុន និងអង់គ្លេសពេលបងចង់បាន។ បងក៏អាចបង្ហោះខ្មែរមុន រួចអង់គ្លេស ក្នុងប្រកាសតែមួយ។',
    ],
  ],
  [
    ['Do I have to post everything myself?', 'តើខ្ញុំត្រូវបង្ហោះអ្វីៗទាំងអស់ដោយខ្លួនឯងទេ?'],
    [
      'No. Connect your pages once; the AI plans the week, designs and writes the posts, and posts them at your best time. You choose whether to approve each post first.',
      'ទេ។ ភ្ជាប់ទំព័ររបស់បងម្តង — AI រៀបចំផែនការសប្តាហ៍ រចនា និងសរសេរប្រកាស ហើយបង្ហោះនៅម៉ោងល្អបំផុតរបស់បង។ បងជ្រើសថាចង់យល់ព្រមប្រកាសនីមួយៗជាមុន ឬអត់។',
    ],
  ],
  [
    ['Which platforms can it post to?', 'តើវាអាចបង្ហោះទៅវេទិកាណាខ្លះ?'],
    [
      'Facebook Pages, Instagram, TikTok, Telegram channels and LinkedIn — several pages per platform for each brand.',
      'Facebook Pages, Instagram, TikTok, ឆានែល Telegram និង LinkedIn — ច្រើនទំព័រក្នុងមួយវេទិកា សម្រាប់ម៉ាកនីមួយៗ។',
    ],
  ],
  [
    ['What does each plan include?', 'តើគម្រោងនីមួយៗមានអ្វីខ្លះ?'],
    [
      'Each plan has a number of AI videos (24–40 seconds each) a month, and AI images with no limit. Growth and Business can also make longer videos — up to 3 and 10 minutes — and a longer one counts as more than one video. AI posts, the weekly plan, scheduling and the website check are included. You always see how many are left; they refill every month, and you can add more.',
      'គម្រោងនីមួយៗមានចំនួនវីដេអូ AI (២៤–៤០ វិនាទី) ក្នុងមួយខែ និងរូបភាព AI មិនកំណត់។ Growth និង Business អាចធ្វើវីដេអូវែងជាងនេះផងដែរ — រហូតដល់ ៣ និង ១០ នាទី — ហើយវីដេអូវែងរាប់លើសពីមួយ។ ប្រកាស AI ផែនការប្រចាំសប្តាហ៍ ការកំណត់ពេល និងការពិនិត្យគេហទំព័រ មានរួចជាស្រេច។ បងឃើញចំនួនដែលនៅសល់ជានិច្ច វាបន្ថែមឡើងវិញរៀងរាល់ខែ ហើយបងអាចទិញបន្ថែមបាន។',
    ],
  ],
  [
    ['Can I use my own voice for videos?', 'តើខ្ញុំអាចប្រើសំឡេងផ្ទាល់ខ្លួនសម្រាប់វីដេអូបានទេ?'],
    [
      'Yes — pick one of the Khmer voices, or set up your brand’s own voice, so your videos sound like you.',
      'បាន — ជ្រើសសំឡេងខ្មែរមួយ ឬរៀបចំសំឡេងផ្ទាល់របស់ម៉ាកបង ដើម្បីឲ្យវីដេអូស្តាប់ទៅដូចបង។',
    ],
  ],
]

function Faq() {
  const t = useT()
  const [open, setOpen] = useState(0)
  return (
    <div className="mx-auto max-w-3xl divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
      {FAQ.map(([qq, aa], i) => {
        const q = t(qq)
        const a = t(aa)
        return (
        <div key={qq[0]}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? -1 : i)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-ink-900 sm:px-6"
            aria-expanded={open === i}
          >
            {q}
            <FiChevronDown className={`flex-none text-ink-400 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
          </button>
          <div className={`grid transition-all duration-300 ${open === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <p className="overflow-hidden px-5 text-[14.5px] leading-relaxed text-ink-500 sm:px-6">
              <span className="block pb-5">{a}</span>
            </p>
          </div>
        </div>
        )
      })}
    </div>
  )
}

// ── pricing ──────────────────────────────────────────────────────────────
// The plans (the owner's decision, 2026-10-21). usd / khr = a month; a year =
// 10 months (2 free). Free is the wide card on top; the paid plans under it,
// the popular one dark; then the full comparison. Visitors never see the word credit
// (the owner, 2026-10-28): plans say videos and images; credits stay in the app's ledger.
// Monthly plan prices are confirmed (2026-10-23, the pricing proposal) and paid
// in the app with KHQR (Settings → Billing → Upgrade; app/payments.py PLAN_PRICES
// — keep the two in step). true = paid prices show "Coming soon"; false since 2026-10-28 (the packages are out).
const PRICES_SOON = false
// What the app can't sell yet: yearly billing (the Yearly switch is hidden) until
// checkout supports it. Add-ons are added by our team (AddonShop).
const YEARLY_ON = false


// The full comparison — the packages of 2026-10-28. A value per plan (Free, Starter,
// Growth, Business): true ✓, false —, or text; a feature not built yet = "Coming soon".
const SOON = ['Coming soon', 'ឆាប់ៗនេះ']
const COMPARE = [
  [['AI posts', 'ប្រកាស AI'], [['~10 a month', '~១០ ក្នុងមួយខែ'], ['1 a day', '១ ក្នុងមួយថ្ងៃ'], ['Up to 2 a day', 'រហូតដល់ ២ ក្នុងមួយថ្ងៃ'], ['Up to 3 a day per brand', 'រហូតដល់ ៣ ក្នុងមួយថ្ងៃ ក្នុងមួយម៉ាក']]],
  [['AI videos (24–40 s)', 'វីដេអូ AI (២៤–៤០ វិនាទី)'], [['1 to try', '១ សាកល្បង'], ['2 / month', '២ / ខែ'], ['8 / month', '៨ / ខែ'], ['20 / month', '២០ / ខែ']]],
  // a longer video is allowed up to the plan's longest, and counts as more than one
  [['Longest video', 'វីដេអូវែងបំផុត'], [['40 s', '៤០ វិនាទី'], ['1 min', '១ នាទី'], ['3 min (counts as 2)', '៣ នាទី (រាប់ជា ២)'], ['10 min (1 per 3 min)', '១០ នាទី (១ ក្នុង ៣ នាទី)']]],
  [['AI images', 'រូបភាព AI'], [['To try', 'សាកល្បង'], ['Unlimited', 'មិនកំណត់'], ['Unlimited', 'មិនកំណត់'], ['Unlimited', 'មិនកំណត់']]],
  [['Brands / channels', 'ម៉ាក / ឆានែល'], [['1 / 2', '១ / ២'], ['1 / 3', '១ / ៣'], ['1 / all 5', '១ / ទាំង ៥'], ['3 / all 5 each', '៣ / ទាំង ៥ ក្នុងមួយ']]],
  [['Khmer + English captions, images, memes', 'ចំណងជើង រូបភាព មីម ខ្មែរ និងអង់គ្លេស'], [true, true, true, true]],
  [['Scheduling & auto-posting', 'កំណត់ពេល និងបង្ហោះស្វ័យប្រវត្តិ'], [true, true, true, true]],
  [['Motion video templates', 'គំរូវីដេអូចលនា'], [['3 basic', '៣ មូលដ្ឋាន'], ['All', 'ទាំងអស់'], ['All', 'ទាំងអស់'], ['All', 'ទាំងអស់']]],
  [['Weekly AI plan + best time', 'ផែនការ AI ប្រចាំសប្តាហ៍ + ម៉ោងល្អបំផុត'], [false, true, true, true]],
  [['Weekly website check', 'ពិនិត្យគេហទំព័រ ប្រចាំសប្តាហ៍'], [false, true, true, true]],
  [['Mode', 'របៀប'], [['Review first', 'ពិនិត្យមុន'], ['Review first', 'ពិនិត្យមុន'], ['Review or Auto', 'ពិនិត្យ ឬស្វ័យប្រវត្តិ'], ['Review or Auto', 'ពិនិត្យ ឬស្វ័យប្រវត្តិ']]],
  [['Leads & hand-off', 'អតិថិជនសក្តានុពល និងបញ្ជូន'], [false, false, ['3 reps', 'អ្នកលក់ ៣'], ['10 reps', 'អ្នកលក់ ១០']]],
  [['Telegram lead alerts', 'ជូនដំណឹងអតិថិជនតាម Telegram'], [false, false, SOON, SOON]],
  [['Insights', 'ស្ថិតិ'], [['7 days', '៧ ថ្ងៃ'], ['Basic', 'មូលដ្ឋាន'], ['Leads, deals, revenue', 'អតិថិជន ការលក់ ចំណូល'], ['+ Excel / CSV export', '+ នាំចេញ Excel / CSV']]],
  [['Boost / ROI planner', 'ផែនការ Boost / ROI'], [false, false, ['Suggestions', 'ការណែនាំ'], ['Full planner — coming soon', 'ផែនការពេញ — ឆាប់ៗនេះ']]],
  [['CRM link (Dynamics 365)', 'ភ្ជាប់ CRM (Dynamics 365)'], [false, false, false, SOON]],
  [['Your own voice (clone)', 'សំឡេងផ្ទាល់ខ្លួន'], [false, false, false, true]],
  [['API & MCP (Claude, ChatGPT)', 'API និង MCP (Claude, ChatGPT)'], [false, false, false, true]],
  [['Support', 'ជំនួយ'], [['Help center', 'មជ្ឈមណ្ឌលជំនួយ'], ['Telegram group', 'ក្រុម Telegram'], ['+ monthly review', '+ ពិនិត្យប្រចាំខែ'], ['Success manager', 'អ្នកគ្រប់គ្រងភាពជោគជ័យ']]],
]

const KH_DIGITS = '០១២៣៤៥៦៧៨៩'
const khDigits = (s) => String(s).replace(/\d/g, (d) => KH_DIGITS[d])

/** A plan's price as shown: the month's price, or a year's price per month (10 months for 12). */
function priceOf(plan, yearly, riel) {
  const month = riel ? plan.khr : plan.usd
  const shown = yearly ? Math.round((month * 10) / 12 / (riel ? 1000 : 1)) * (riel ? 1000 : 1) : month
  const fmt = (n) => (riel ? `${n.toLocaleString('en-US')}៛` : `$${n.toLocaleString('en-US')}`)
  return { main: fmt(shown), year: fmt(month * 10) }
}

function Toggle({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-full border border-ink-200 bg-white p-1">
      {options.map(([v, label, tag]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${value === v ? 'bg-ink-900 text-ink-50' : 'text-ink-600 hover:text-ink-900'}`}
        >
          {label}
          {tag && <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${value === v ? 'bg-white/20 text-ink-50' : 'bg-brand-soft text-brand'}`}>{tag}</span>}
        </button>
      ))}
    </div>
  )
}

// A plan card's point icons, by the name in lib/plans.js (a point's third item).
const POINT_ICONS = {
  gift: FiGift, clock: FiClock, type: FiType, film: FiFilm, card: FiCreditCard, edit: FiEdit3, image: FiImage,
  layers: FiLayers, calendar: FiCalendar, eye: FiEye, globe: FiGlobe, chart: FiBarChart2, send: FiSend,
  check: FiCheckCircle, repeat: FiRepeat, users: FiUsers, trend: FiTrendingUp, chat: FiMessageCircle,
  download: FiDownload, mic: FiMic, code: FiCode, award: FiAward,
}

/** A plan point's icon in a small round badge — the brand colour, white on the dark (popular) card. */
function PointIcon({ name, dark = false }) {
  const Icon = POINT_ICONS[name] || FiCheck
  return (
    <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full ${dark ? 'bg-white/15 text-white' : 'bg-brand-soft text-brand'}`}>
      <Icon size={12} strokeWidth={2.4} />
    </span>
  )
}

/** The small round tick of the lists and the table — filled dark on the popular plan. */
function Tick({ dark = false, filled = false }) {
  return (
    <span className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full ${dark ? 'bg-white/15 text-white' : filled ? 'bg-ink-900 text-ink-50' : 'bg-ink-100 text-ink-600'}`}>
      <FiCheck size={11} strokeWidth={3} />
    </span>
  )
}

/** "$49 /mo" and, on yearly, the year's bill under it. */
function Price({ plan, yearly, riel, dark = false }) {
  const t = useT()
  const price = priceOf(plan, yearly, riel)
  if (PRICES_SOON && plan.usd) {
    return (
      <>
        <div className="mt-6 flex h-[44px] items-end">
          <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold ${dark ? 'bg-white/15 text-white' : 'bg-brand-soft text-brand'}`}>
            <FiClock size={15} /> {t('Coming soon', 'ឆាប់ៗនេះ')}
          </span>
        </div>
        <div className={`mt-2 h-4 text-[12px] ${dark ? 'text-white/60' : 'text-ink-400'}`}>{t('Prices announced soon', 'នឹងប្រកាសតម្លៃឆាប់ៗនេះ')}</div>
      </>
    )
  }
  return (
    <>
      <div className="mt-6 flex items-baseline gap-1.5">
        <span className={`text-[44px] font-bold leading-none tracking-tight ${dark ? 'text-white' : 'text-ink-900'}`}>{plan.usd ? price.main : riel ? '0៛' : '$0'}</span>
        <span className={`text-[16px] ${dark ? 'text-white/70' : 'text-ink-500'}`}>/{t('mo', 'ខែ')}</span>
      </div>
      <div className={`mt-2 h-4 text-[12px] ${dark ? 'text-white/60' : 'text-ink-400'}`}>{plan.usd > 0 && yearly ? t(`${price.year} billed yearly`, `${price.year} បង់ម្តងក្នុងមួយឆ្នាំ`) : ''}</div>
    </>
  )
}

/** Add-ons — the sales sheet of 2026-10-28. Added by our team for now (no checkout
 * for them yet). The payment terms are in Terms of Service and at the payment step. */
const ADDONS = [
  [FiBriefcase, ['Extra brand', 'ម៉ាកបន្ថែម'], ['$25 / month on Growth · $49 / month on Business (5 channels)', '$25 / ខែ លើ Growth · $49 / ខែ លើ Business (ឆានែល ៥)'], ['Another business with its own logo, pages and posts', 'អាជីវកម្មមួយទៀត មានឡូហ្គោ ទំព័រ និងប្រកាសផ្ទាល់']],
  [FiFilm, ['Extra AI video pack', 'កញ្ចប់វីដេអូ AI បន្ថែម'], ['10 videos for $30', 'វីដេអូ ១០ ក្នុងតម្លៃ $30'], ['On top of your plan’s videos, for the month you buy it', 'បន្ថែមលើវីដេអូក្នុងគម្រោង សម្រាប់ខែដែលបងទិញ']],
  [FiUsers, ['Extra sales rep seat', 'អ្នកលក់បន្ថែម'], ['$5 / rep / month', '$5 / អ្នកលក់ / ខែ'], ['One more rep who gets leads handed over', 'អ្នកលក់ម្នាក់ទៀត ដែលទទួលអតិថិជនសក្តានុពល']],
  [FiPenTool, ['Setup & onboarding', 'រៀបចំ និងណែនាំការប្រើ'], ['$99 one-time — free on yearly plans', '$99 តែម្តង — ឥតគិតថ្លៃ លើគម្រោងប្រចាំឆ្នាំ'], ['Brand kit, channels and your first plan, set up by our team', 'កញ្ចប់ម៉ាក ឆានែល និងផែនការដំបូង រៀបចំដោយក្រុមយើង']],
  [FiCheckCircle, ['Done-for-you approval', 'យើងពិនិត្យ និងអនុម័តជូន'], ['$150 / month per brand', '$150 / ខែ ក្នុងមួយម៉ាក'], ['Our team checks and approves every post for you', 'ក្រុមយើងពិនិត្យ និងអនុម័តរាល់ប្រកាសជូនបង']],
  [FiGift, ['Bundle with Chumnouykar AI', 'ទិញរួមជាមួយ Chumnouykar AI'], ['20% off both', 'បញ្ចុះ ២០% ទាំងពីរ'], ['Our AI chatbot answers your customers 24/7', 'Chatbot AI របស់យើង ឆ្លើយអតិថិជនបង ២៤/៧']],
]
function AddonShop() {
  const t = useT()
  return (
    <div className="mx-auto mt-16 max-w-6xl">
      <div className="text-center">
        <div className="text-[20px] font-bold text-ink-900">{t('Add-ons', 'សេវាបន្ថែម')}</div>
        <p className="mt-1 text-[13.5px] text-ink-500">{t('For any paid plan — ask us and our team adds them.', 'សម្រាប់គ្រប់គម្រោងបង់ប្រាក់ — ប្រាប់យើង ក្រុមយើងបន្ថែមជូន។')}</p>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADDONS.map(([Icon, name, price, text]) => (
          <div key={name[0]} className="flex gap-4 rounded-3xl bg-white p-5 shadow-card">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-brand-soft text-brand">
              <Icon size={19} />
            </span>
            <div className="min-w-0">
              <div className="text-[14.5px] font-bold text-ink-900">{t(name)}</div>
              <div className="mt-0.5 text-[13.5px] font-semibold text-brand">{t(price)}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-ink-500">{t(text)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Smart Marketing + Chumnouykar AI (our AI sales chatbot — chumnouykar.bcietech.com) at 20% off
 * both — the bundle sheet's fixed prices (2026-10-29), so a test price in the admin portal never
 * changes them. Bundles are set up by our team for now (no checkout yet). */
const CHUMNOUYKAR_URL = 'https://chumnouykar.bcietech.com/'
// [plan, Smart Marketing $, Chumnouykar AI $, recommended, "and up"]
const BUNDLES = [
  [['Starter', 'Starter'], 29, 19],
  [['Growth', 'Growth'], 79, 59, true],
  [['Business', 'Business'], 199, 149],
  [['Enterprise', 'Enterprise'], 499, 299, false, true],
]
const BUNDLE_OFF = 0.8
const BUNDLE_GAINS = [
  [FiMessageCircle, ['Replies to every customer, 24/7', 'ឆ្លើយអតិថិជនគ្រប់គ្នា ២៤/៧']],
  [FiTrendingUp, ['Turns chats into orders', 'ប្តូរការជជែក ទៅជាការកម្ម៉ង់']],
  [FiBarChart2, ['Shows which post brought each sale', 'បង្ហាញថាប្រកាសណានាំការលក់']],
]
function ChumnouykarBundle({ onStart }) {
  const t = useT()
  const money = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`
  const rows = BUNDLES.map(([name, smart, ai, popular, plus]) => ({ id: name[0], name: t(name), smart, ai, popular, plus }))
  return (
    <Reveal className="mx-auto mt-10 max-w-6xl">
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div>
            <div className="flex items-center gap-3">
              <img src="/brand/logo-mark.png" alt="Smart Marketing" className="h-11 w-11 object-contain" />
              <span className="text-[22px] font-bold text-ink-300" aria-hidden="true">
                +
              </span>
              <a href={CHUMNOUYKAR_URL} target="_blank" rel="noreferrer" title="Chumnouykar AI">
                <img src="/partners/chumnouykar.webp" alt="Chumnouykar AI" className="h-14 w-14 object-contain" />
              </a>
              <span className="ml-1 rounded-full bg-brand-soft px-3 py-1 text-[12px] font-bold text-brand">{t('20% off both', 'បញ្ចុះ ២០% ទាំងពីរ')}</span>
            </div>
            <h3 className="mt-5 text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">
              {t('Add Chumnouykar, your AI sales assistant', 'បន្ថែម Chumnouykar ជំនួយការលក់ AI')}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
              {t('Smart Marketing brings the customers. Chumnouykar answers them.', 'Smart Marketing នាំអតិថិជនមក។ Chumnouykar ឆ្លើយគាត់។')}
            </p>
            <ul className="mt-6 space-y-3">
              {BUNDLE_GAINS.map(([Icon, title]) => (
                <li key={title[0]} className="flex items-center gap-3 text-[15px] font-semibold text-ink-900">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  {t(title)}
                </li>
              ))}
            </ul>
          </div>

          {/* the four bundles: both plans' price, then 20% off */}
          <div>
            <div className="text-[13px] font-semibold text-ink-500">{t('Bundle prices · USD / month', 'តម្លៃរួម · USD / ខែ')}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {rows.map((r) => {
                const list = r.smart + r.ai
                const price = Math.round(list * BUNDLE_OFF * 100) / 100
                return (
                  <div key={r.id} className={`relative rounded-2xl p-4 ${r.popular ? 'bg-night-900 text-white ring-1 ring-white/10 dark:bg-night-800 dark:ring-2 dark:ring-brand/70' : 'bg-canvas'}`}>
                    {r.popular && (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">{t('Recommended', 'ណែនាំ')}</span>
                    )}
                    <div className={`text-[15px] font-bold ${r.popular ? 'text-white' : 'text-ink-900'}`}>{r.name}</div>
                    <div className={`mt-0.5 text-[11.5px] ${r.popular ? 'text-white/60' : 'text-ink-500'}`}>
                      Smart {money(r.smart)}
                      {r.plus ? '+' : ''} + AI {money(r.ai)}
                      {r.plus ? '+' : ''}
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className={`text-[26px] font-bold tabular-nums ${r.popular ? 'text-white' : 'text-ink-900'}`}>
                        {money(price)}
                        {r.plus ? '+' : ''}
                      </span>
                      <span className={`text-[13px] tabular-nums line-through ${r.popular ? 'text-white/50' : 'text-ink-400'}`}>
                        {money(list)}
                        {r.plus ? '+' : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={onStart} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand/90">
                {t('Get the bundle', 'ទិញកញ្ចប់រួម')} <FiArrowRight size={15} />
              </button>
              <a href={CHUMNOUYKAR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-5 py-2.5 text-[14px] font-semibold text-ink-900 transition-colors hover:bg-ink-200">
                {t('See Chumnouykar', 'មើល Chumnouykar')}
              </a>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
              {t(
                'Chumnouykar has a 14-day free trial.',
                'Chumnouykar មានសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃ។',
              )}
            </p>
          </div>
        </div>
      </div>
    </Reveal>
  )
}

/** The plans with the prices set in the admin portal (GET /api/public/prices — the
 * same ones KHQR checkout charges); the built-in numbers above until they arrive,
 * or if the server can't be reached. */
function useLivePlans() {
  const [plans, setPlans] = useState(PLANS)
  useEffect(() => {
    let live = true
    fetch('/api/public/prices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d?.prices) return
        setPlans(PLANS.map((p) => (d.prices[p.id] ? { ...p, usd: d.prices[p.id].USD ?? p.usd, khr: d.prices[p.id].KHR ?? p.khr } : p)))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return plans
}

function Pricing({ onStart }) {
  const t = useT()
  const [yearly, setYearly] = useState(false)
  const [riel, setRiel] = useState(t.lang === 'km')
  const n = (s) => (t.lang === 'km' ? khDigits(s) : s)
  const PLANS = useLivePlans() // shadows the built-in list: the live prices
  const [free, ...paid] = PLANS
  const cell = (v, popular) =>
    v === true ? (
      <span className="inline-flex" aria-label={t('Included', 'មាន')}>
        <Tick filled={popular} />
      </span>
    ) : v === false ? (
      <span className="text-ink-300" aria-label={t('Not included', 'គ្មាន')}>—</span>
    ) : (
      <span className={popular ? 'font-semibold text-ink-900' : 'text-ink-800'}>{Array.isArray(v) ? t(v) : n(v)}</span>
    )
  const pill = 'inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-[14.5px] font-semibold transition-colors'
  return (
    <section id="pricing" className="relative isolate scroll-mt-20 overflow-hidden bg-canvas px-4 py-20 sm:px-6 sm:py-28">
      <GridBackdrop className="-z-10 opacity-70" />
      <SectionTitle
        eyebrow={t('Pricing', 'តម្លៃ')}
        title={t('Simple plans that grow with you', 'គម្រោងសាមញ្ញ រីកចម្រើនជាមួយបង')}
        khmer="ចាប់ផ្តើមឥតគិតថ្លៃ ដំឡើងពេលបងត្រៀមរួច"
        sub={t('Start free. Every plan comes with its AI videos and images each month — posting and scheduling are always included.', 'ចាប់ផ្តើមឥតគិតថ្លៃ។ គ្រប់គម្រោងមានវីដេអូ និងរូបភាព AI រៀងរាល់ខែ — ការបង្ហោះ និងកំណត់ពេល រួមបញ្ចូលជានិច្ច។')}
      />

      <div className={`mt-10 flex flex-wrap items-center justify-center gap-3 ${PRICES_SOON ? 'hidden' : ''}`}>
        {YEARLY_ON && <Toggle value={yearly} onChange={setYearly} options={[[false, t('Monthly', 'ប្រចាំខែ')], [true, t('Yearly', 'ប្រចាំឆ្នាំ'), t('2 months free', 'ឥតគិតថ្លៃ ២ ខែ')]]} />}
        <Toggle value={riel} onChange={setRiel} options={[[false, 'USD $'], [true, 'KHR ៛']]} />
      </div>

      {/* Free: one wide card — the plan on the left, what's in it on the right */}
      <Reveal className="mx-auto mt-12 max-w-6xl">
        <div className="grid gap-8 rounded-3xl bg-white p-7 shadow-card sm:p-8 md:grid-cols-[minmax(0,300px)_1fr] md:gap-10">
          <div className="md:border-r md:border-ink-200 md:pr-10">
            <div className="text-[24px] font-bold text-ink-900">{t(free.name)}</div>
            <div className="mt-1.5 text-[14.5px] text-ink-500">{t(free.for)}</div>
            <Price plan={free} yearly={yearly} riel={riel} />
            <button type="button" onClick={onStart} className={`${pill} mt-4 bg-ink-100 text-ink-900 hover:bg-ink-200`}>
              {t(free.cta)}
            </button>
          </div>
          <div>
            <div className="text-[13px] text-ink-500">{t('Includes', 'រួមមាន')}</div>
            <ul className="mt-4 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {free.points.map((pt) => (
                <li key={pt[0]} className="flex items-start gap-3 text-[14.5px] text-ink-700">
                  <span className="mt-px">
                    <PointIcon name={pt[2]} />
                  </span>
                  {t(pt)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      {/* the paid plans — the popular one dark and a little taller */}
      <div className="mx-auto mt-14 grid max-w-6xl items-start gap-5 md:grid-cols-3">
        {paid.map((p, i) => {
          const dark = !!p.popular
          return (
            <Reveal key={p.id} delay={i * 90} className={dark ? 'md:-mt-4' : ''}>
              {/* dark theme: the other cards are near-black too, so the popular one gets the brand's
                  ring and a lighter ground; "white" (the badge, the button) is dark there — brand instead */}
              <div className={`relative flex flex-col rounded-3xl p-7 sm:p-8 ${dark ? 'bg-night-900 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] ring-1 ring-white/10 dark:bg-night-800 dark:ring-2 dark:ring-brand/70' : 'bg-white shadow-card'}`}>
                {dark && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3.5 py-1 text-[12px] font-semibold text-night-900 shadow-sm ring-1 ring-black/5 dark:bg-brand dark:text-white dark:ring-0">
                    {t('Most popular', 'ពេញនិយមបំផុត')}
                  </span>
                )}
                <div className={`text-[24px] font-bold ${dark ? 'text-white' : 'text-ink-900'}`}>{t(p.name)}</div>
                <div className={`mt-1.5 min-h-[42px] text-[14.5px] leading-snug ${dark ? 'text-white/70' : 'text-ink-500'}`}>{t(p.for)}</div>
                <Price plan={p} yearly={yearly} riel={riel} dark={dark} />
                <button type="button" onClick={onStart} className={`${pill} mt-4 ${dark ? 'bg-white text-night-900 hover:bg-white/90 dark:bg-brand dark:text-white dark:hover:bg-brand/90' : 'bg-ink-100 text-ink-900 hover:bg-ink-200'}`}>
                  {t(p.cta)}
                </button>
                <div className={`mt-8 text-[13px] ${dark ? 'text-white/60' : 'text-ink-500'}`}>{t('Includes', 'រួមមាន')}</div>
                <ul className="mt-4 space-y-3.5">
                  {p.points.map((pt) => (
                    <li key={pt[0]} className={`flex items-start gap-3 text-[14.5px] leading-snug ${dark ? 'text-white/90' : 'text-ink-700'}`}>
                      <span className="mt-px">
                        <PointIcon name={pt[2]} dark={dark} />
                      </span>
                      {t(pt)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )
        })}
      </div>

      {/* Enterprise: no public price */}
      <Reveal className="mx-auto mt-8 max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-white p-7 shadow-card sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-bold text-ink-900">
              Enterprise / Agency{' '}
              <span className="ml-1 text-[14px] font-medium text-ink-500">· {t('banks, groups and agencies', 'ធនាគារ ក្រុមហ៊ុន និងភ្នាក់ងារ')}</span>
              {/* "from $499" once the prices are out of "Coming soon" */}
              {!PRICES_SOON && <span className="ml-2 text-[14px] font-semibold text-ink-900">{t('from $499 / month', 'ចាប់ពី $499 / ខែ')}</span>}
            </div>
            <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-ink-500">
              {t(
                '10+ brands, unlimited channels and sales reps, AI posts and 50+ videos a month (up to 10 min each) as you need, approval steps, custom reports and a CRM link (coming soon), an SLA and on-site training.',
                'ម៉ាក ១០+ ឆានែល និងអ្នកលក់ គ្មានដែនកំណត់ ប្រកាស AI និងវីដេអូ ៥០+ ក្នុងមួយខែ (រហូតដល់ ១០ នាទី) តាមតម្រូវការ ជំហានអនុម័ត របាយការណ៍តាមតម្រូវការ និងភ្ជាប់ CRM (ឆាប់ៗនេះ) កិច្ចព្រមព្រៀងសេវាកម្ម និងការបណ្តុះបណ្តាលនៅទីតាំង។',
              )}
            </p>
          </div>
          <button type="button" onClick={onStart} className="inline-flex flex-none items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-[14.5px] font-semibold text-ink-50 transition-colors hover:bg-ink-800">
            {t('Contact us', 'ទាក់ទងយើង')}
          </button>
        </div>
      </Reveal>

      {/* with Chumnouykar, our AI sales chatbot — 20% off both */}
      {!PRICES_SOON && <ChumnouykarBundle onStart={onStart} />}

      {/* Compare plans */}
      <div className="mx-auto mt-20 max-w-6xl">
        <h3 className="text-center text-[24px] font-bold text-ink-900 sm:text-[28px]">{t('Compare plans', 'ប្រៀបធៀបគម្រោង')}</h3>
        <div className="mt-8 overflow-x-auto rounded-3xl bg-white shadow-card">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="px-6 py-4 text-left text-[13px] font-medium text-ink-500">{t('Feature', 'មុខងារ')}</th>
                {PLANS.map((p) => (
                  <th key={p.id} className="px-3 py-4 text-center font-semibold text-ink-900">
                    {t(p.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {COMPARE.map(([label, vals]) => (
                <tr key={label[0]}>
                  <td className="px-6 py-3.5 text-ink-600">{t(label)}</td>
                  {vals.map((v, k) => (
                    <td key={k} className="px-3 py-3.5 text-center">
                      {cell(v, PLANS[k].popular)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-6 py-4 text-ink-600">{t('Price / month', 'តម្លៃ / ខែ')}</td>
                {PLANS.map((p) => (
                  <td key={p.id} className="px-3 py-4 text-center font-semibold text-ink-900">
                    {p.usd ? (PRICES_SOON ? <span className="text-[12.5px] font-semibold text-brand">{t('Coming soon', 'ឆាប់ៗនេះ')}</span> : priceOf(p, yearly, riel).main) : riel ? '0៛' : '$0'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <AddonShop />
    </section>
  )
}

const NAV = [
  ['how', ['How it works', 'របៀបដំណើរការ']],
  ['features', ['Product', 'ផលិតផល']],
  ['videos', ['Videos', 'វីដេអូ']],
  ['pricing', ['Pricing', 'តម្លៃ']],
  ['faq', ['FAQ', 'សំណួរ']],
]

// "Product ▾" in the header opens this panel (columns of what it does, each
// jumping to its section) — the header grows to hold it, like respond.io's.
const PRODUCT_MENU = [
  {
    head: ['Plan & post', 'គម្រោង និងបង្ហោះ'],
    items: [
      [FiCalendar, ['Autopilot', 'ស្វ័យប្រវត្តិ'], ['A whole week of posts, planned and posted for you', 'ប្រកាសពេញមួយសប្តាហ៍ រៀបចំ និងបង្ហោះជូនបង'], 'features'],
      [FiMic, ['Khmer captions & voice', 'ចំណងជើង និងសំឡេងខ្មែរ'], ['Writes and speaks Khmer the way you do', 'សរសេរ និងនិយាយខ្មែរ ដូចបងផ្ទាល់'], 'features'],
      [FiBarChart2, ['Learns from results', 'រៀនពីលទ្ធផល'], ['Numbers for every post — the next plan follows what worked', 'មានលេខគ្រប់ប្រកាស — ផែនការបន្ទាប់ធ្វើតាមអ្វីដែលដំណើរការ'], 'features'],
    ],
  },
  {
    head: ['Create', 'បង្កើត'],
    items: [
      [FiPlay, ['Video studio', 'ស្ទូឌីយោវីដេអូ'], ['Motion videos with Khmer voice and subtitles', 'វីដេអូចលនា មានសំឡេង និងអក្សររត់ខ្មែរ'], 'videos'],
      [FiImage, ['Posters & memes', 'ប៉ូស្ទ័រ និងមីម'], ['Real Khmer text drawn correctly on every picture', 'អក្សរខ្មែរត្រឹមត្រូវ លើគ្រប់រូបភាព'], 'more'],
      [FiPenTool, ['Brand kit', 'កញ្ចប់ម៉ាក'], ['Your logo and colours in every design', 'ឡូហ្គោ និងពណ៌របស់បង ក្នុងគ្រប់ការរចនា'], 'more'],
    ],
  },
  {
    head: ['Grow', 'រីកចម្រើន'],
    items: [
      [FiMessageCircle, ['Leads & hand-off', 'អតិថិជនសក្តានុពល'], ['Messages from your pages, routed to your team', 'សារពីទំព័ររបស់បង បញ្ជូនទៅក្រុមការងារ'], 'more'],
      [FiGlobe, ['Website check', 'ពិនិត្យគេហទំព័រ'], ['Health, SEO and speed — with AI fixes', 'សុខភាព SEO និងល្បឿន — AI ជួយកែ'], 'more'],
      [FiCpu, ['Pick your AI', 'ជ្រើស AI'], ['Claude, GPT or Gemini — you choose who writes', 'Claude, GPT ឬ Gemini — បងជ្រើសអ្នកសរសេរ'], 'more'],
    ],
  },
]

// The hero headline: one calm ink line with a single brand-coloured phrase.
// Under the mouse a small black hole follows the cursor — a dark disc with a
// glowing ring, and the letters inside it turn to starlight (a second copy of
// the headline, cut to that circle, so it works letter by letter). Phones
// (no mouse) just see the headline.
const LENS = 36
function HeroTitle() {
  const lens = useRef(null)
  const place = (e, r) => {
    const el = lens.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const x = `${e.clientX - box.left}px`
    const y = `${e.clientY - box.top}px`
    el.style.setProperty('--mx', x)
    el.style.setProperty('--my', y)
    el.style.clipPath = `circle(${r}px at ${x} ${y})`
  }
  const words = (cls) => (
    <>
      <span className={cls.plain}>ទីផ្សារ​ឆ្លាតវៃ</span> <span className={cls.hot}>ធ្វើការជំនួសបង</span> <span className={cls.plain}>រាល់ថ្ងៃ</span>
    </>
  )
  const h1 = 'text-[38px] font-bold leading-[1.25] sm:text-[54px]'
  return (
    <div
      className="relative cursor-default"
      onMouseEnter={(e) => place(e, LENS)}
      onMouseMove={(e) => place(e, LENS)}
      onMouseLeave={(e) => place(e, 0)}
    >
      <h1 className={`${h1} text-ink-900`} style={km}>
        {words({ plain: '', hot: 'lp-hot' })}
      </h1>
      <div
        ref={lens}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[clip-path] duration-150 ease-out motion-reduce:hidden"
        style={{ clipPath: 'circle(0px at 50% 50%)' }}
      >
        {/* reaches 60px past the headline so the disc stays round at its edges */}
        <div className="lp-lens-disc absolute -inset-[60px]" />
        <div className={`relative ${h1}`} style={km}>
          {words({ plain: 'lp-lens-text', hot: 'lp-lens-text' })}
        </div>
      </div>
    </div>
  )
}

// page "tutorials" = /mkt-tutorial: the same header and footer around the course
// (TutorialsPage.jsx Course) instead of the landing sections.
/** Someone who already has an account and is signed in on this browser (the tutorials page,
 * which anyone can open): their plan, so the header offers Dashboard instead of
 * Log in / Start free. null while unknown or signed out — an expired sign-in shows the usual buttons. */
function useSignedIn() {
  const [me, setMe] = useState(null)
  useEffect(() => {
    if (!tokenStore.get()) return undefined
    let live = true
    api
      .get('/billing/summary')
      .then((b) => live && setMe({ plan: b.plan_label || '' }))
      .catch(() => {}) // signed out or offline: the usual buttons
    return () => {
      live = false
    }
  }, [])
  return me
}

export default function LandingPage({ onLogin, onStart, page = 'home' }) {
  const [lang, setLangState] = useState(startLang)
  const setLang = (l) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      // private window: it just isn't remembered
    }
  }
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  // this component sits above the language provider, so it reads `lang` itself
  const t = (en, kh) => (Array.isArray(en) ? en[lang === 'km' ? 1 : 0] : lang === 'km' ? kh : en)
  const n = (v) => (lang === 'km' ? khDigits(v) : v)
  const me = useSignedIn() // already has an account: their plan + Dashboard in the header
  const [scrolled, setScrolled] = useState(false)
  // the menu item for the section in view gets the soft "selected" highlight
  const [section, setSection] = useState('')
  useEffect(() => {
    const seen = new Map()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0))
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]
        setSection(best && best[1] > 0 ? best[0] : '')
      },
      { threshold: [0, 0.15, 0.35, 0.6], rootMargin: '-80px 0px -35% 0px' },
    )
    NAV.forEach(([id]) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])
  // light / dark — the app's own setting (lib/theme.js), remembered on this device
  const [dark, setDark] = useState(isDark)
  const toggleTheme = () => {
    const next = isDark() ? 'light' : 'dark'
    applyTheme(next)
    setDark(next === 'dark')
    try {
      const saved = JSON.parse(localStorage.getItem('contentflow.appearance') || '{}')
      localStorage.setItem('contentflow.appearance', JSON.stringify({ ...saved, theme: next }))
    } catch {
      // private window: it just isn't remembered
    }
  }
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const byId = Object.fromEntries(MOTION_TEMPLATES.map((tp) => [tp.id, tp]))
  const usedBy = useTemplateUsage()
  const go = (id) => {
    setMenu(false)
    // from the tutorials page, the sections are on the landing page
    if (page !== 'home') return window.location.assign(`/#${id}`)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // arriving from the tutorials page's menu (/#features): open at that section
  useEffect(() => {
    const id = page === 'home' && window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 300)
  }, [page])
  // the "Product" panel: opens on hover or tap, closes on leave / Escape / a pick
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const esc = (e) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [menu])

  return (
    <LangCtx.Provider value={lang}>
    {/* in Khmer the whole page uses the Khmer font */}
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink-900" style={lang === 'km' ? km : undefined}>
      {/* ── nav ── */}
      {/* a floating bar, inset from the edges — light or dark with the theme */}
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
        {/* always the page content's width (max-w-6xl, like every section) — scrolling only lowers it a little and deepens the shadow */}
        {/* frosted glass: the page shows through, softly blurred. The Product panel opens inside it */}
        <nav
          onMouseLeave={() => setMenu(false)}
          className={`mx-auto border border-ink-200/60 px-3 backdrop-blur-xl backdrop-saturate-150 transition-all duration-500 ease-out sm:px-4 ${
            menu ? 'bg-white/90' : 'bg-white/55'
          } ${scrolled && !menu ? 'max-w-6xl rounded-2xl shadow-pop' : `max-w-6xl rounded-2xl ${menu ? 'shadow-pop' : 'shadow-card'}`}`}
        >
          <div className={`flex items-center justify-between gap-2 ${scrolled ? 'h-12' : 'h-12 sm:h-[52px]'}`}>
          <a href="/" className="mr-3 flex min-w-0 flex-none items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="" className="h-7 w-7 flex-none rounded-lg" />
            {/* narrow phones: the mark alone — the name was cut off next to the buttons */}
            <span className="whitespace-nowrap text-[16px] font-bold text-ink-900 max-[420px]:hidden">Smart Marketing</span>
          </a>
          <div className="hidden items-center gap-0.5 text-[14px] font-medium lg:flex xl:gap-1">
            {NAV.map(([id, label]) =>
              id === 'features' ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMenu((m) => !m)}
                  onMouseEnter={() => setMenu(true)}
                  aria-expanded={menu}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 xl:px-3 transition-colors ${menu || section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
                >
                  {t(label)}
                  <FiChevronDown size={14} className={`transition-transform duration-200 ${menu ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  onMouseEnter={() => setMenu(false)}
                  className={`whitespace-nowrap rounded-lg px-2 py-1.5 xl:px-3 transition-colors ${section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
                >
                  {t(label)}
                </button>
              ),
            )}
            {/* the how-to videos — their own public page (/mkt-tutorial, TutorialsPage.jsx) */}
            <a
              href="/mkt-tutorial"
              onMouseEnter={() => setMenu(false)}
              className={`whitespace-nowrap rounded-lg px-2 py-1.5 xl:px-3 transition-colors ${page === 'tutorials' ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
            >
              {t('Tutorials', 'មេរៀន')}
            </a>
            {/* the developer docs (/developers, DevelopersPage.jsx) — the API, and connecting an AI
                assistant (MCP). One link: two (API, MCP) made the bar wider than the page */}
            <a
              href="/developers"
              onMouseEnter={() => setMenu(false)}
              className={`whitespace-nowrap rounded-lg px-2 py-1.5 xl:px-3 transition-colors ${page === 'developers' ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
            >
              API
            </a>
          </div>
          <div className="flex flex-none items-center gap-1.5 sm:gap-2">
            <LangSwitch lang={lang} setLang={setLang} />
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? t('Light mode', 'ពន្លឺ') : t('Dark mode', 'ងងឹត')}
              aria-label={dark ? t('Light mode', 'ពន្លឺ') : t('Dark mode', 'ងងឹត')}
              className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              {dark ? <FiSun size={16} /> : <FiMoon size={16} />}
            </button>
            {me ? (
              <>
                {/* already has an account: their plan, and the way back in — kept as narrow as
                    Log in / Start free so the bar never grows past the page width */}
                {me.plan && (
                  <a
                    href="/upgrade"
                    title={t('Your plan — see what’s left, or upgrade', 'គម្រោងរបស់បង — មើលចំនួននៅសល់ ឬដំឡើង')}
                    className="hidden items-center whitespace-nowrap rounded-full border border-ink-200 px-3 py-1 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-50 sm:inline-flex"
                  >
                    {me.plan}
                  </a>
                )}
                <a href="/command" className="whitespace-nowrap rounded-xl bg-brand px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-px">
                  {t('Dashboard', 'ផ្ទាំងគ្រប់គ្រង')}
                </a>
              </>
            ) : (
              <>
                <button type="button" onClick={onLogin} className="rounded-xl border border-ink-200 px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 sm:px-3.5 sm:text-[14px]">
                  {t('Log in', 'ចូល')}
                </button>
                <button type="button" onClick={onStart} className="whitespace-nowrap rounded-xl bg-brand px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-px sm:px-4">
                  {t('Start free', 'ចាប់ផ្តើម')}
                </button>
              </>
            )}
          </div>
          </div>
          {/* the Product panel — three columns + a get-started card, desktop only */}
          <div className={`hidden overflow-hidden transition-all duration-300 ease-out md:grid ${menu ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}>
            <div className="min-h-0">
              <div className="grid grid-cols-[1fr_1fr_1fr_minmax(0,0.9fr)] gap-6 border-t border-ink-200/70 pb-4 pt-5">
                {PRODUCT_MENU.map(({ head, items }) => (
                  <div key={head[0]}>
                    <div className="px-2 text-[12.5px] font-medium text-ink-400">{t(head)}</div>
                    <div className="mt-2 space-y-1">
                      {items.map(([Icon, title, text, to]) => (
                        <button
                          key={title[0]}
                          type="button"
                          onClick={() => go(to)}
                          className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-ink-50"
                        >
                          <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg border border-ink-200 text-ink-700">
                            <Icon size={15} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold text-ink-900">{t(title)}</span>
                            <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-500">{t(text)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-col rounded-2xl bg-ink-50 p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
                    <FiZap size={18} />
                  </span>
                  <div className="mt-4 text-[15px] font-bold text-ink-900">{t('Start free', 'ចាប់ផ្តើមឥតគិតថ្លៃ')}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                    {t('Connect your pages and get your first week of posts planned today.', 'ភ្ជាប់ទំព័ររបស់បង ហើយទទួលបានផែនការប្រកាសសប្តាហ៍ដំបូង ថ្ងៃនេះ។')}
                  </p>
                  <button type="button" onClick={onStart} className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13.5px] font-semibold text-ink-900 hover:text-brand">
                    {t('Get started', 'ចាប់ផ្តើម')} <FiArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </header>

      {page === 'tutorials' ? (
        // the header bar's width exactly: max-w-6xl inside the same side gap (px-3 / sm:px-5)
        <div className="mx-auto max-w-6xl px-3 pt-20 sm:px-5 sm:pt-24 box-content">
          <Course bare openLabel={t('Log in to try it', 'ចូលដើម្បីសាកល្បង')} onOpen={onLogin} />
        </div>
      ) : page === 'developers' ? (
        <Developers t={t} me={me} onStart={onStart} />
      ) : (
      <>
      {/* ── hero ── */}
      {/* light or dark with the theme: the page's own surface and a fine grid */}
      <section className="relative overflow-hidden bg-white pb-20 pt-32 sm:pb-28 sm:pt-40">
        <div className="pointer-events-none absolute inset-0">
          <GridBackdrop />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-center lg:text-left">
            {/* the one flourish: under the mouse, a small black hole travels the
                headline and the letters inside turn to starlight */}
            <style>{`
              .lp-hot { color: rgb(var(--brand)); }
              .dark .lp-hot { color: #9cc0ea; }
              @keyframes lp-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
              @media (prefers-reduced-motion: reduce) { [style*='lp-float'] { animation: none !important } }
              @keyframes lp-galaxy {
                0% { background-position: 0 0, 0 0, 0% 50% }
                100% { background-position: 90px 50px, -130px 70px, 100% 50% }
              }
              /* inside the black-hole lens: warm starlight letters on the dark disc */
              .lp-lens-text {
                background-image:
                  radial-gradient(1.2px 1.2px at 20% 30%, #fff 60%, transparent 100%),
                  radial-gradient(1px 1px at 70% 65%, #fff 60%, transparent 100%),
                  linear-gradient(110deg, #fde68a, #ffffff 25%, #d8e5f5 50%, #ffffff 75%, #fde68a);
                background-size: 90px 50px, 130px 70px, 300% 100%;
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                -webkit-text-fill-color: transparent;
                animation: lp-galaxy 14s ease-in-out infinite alternate;
              }
              .lp-lens-disc {
                background: radial-gradient(circle at calc(var(--mx) + 60px) calc(var(--my) + 60px),#0e2138 0, #05030f 20px, #0b0820 27px, #f59e0b 31px, #fde68a 32.5px, rgb(var(--brand-light)) 35px, transparent 36px);
              }
              @media (prefers-reduced-motion: reduce) { .lp-lens-text { animation: none } }
            `}</style>
            <HeroTitle />
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-ink-500 lg:mx-0">
              {t(
                'Connect your pages once. The AI plans your week, designs the videos and pictures, writes the captions in Khmer — and posts at your best time. You just approve.',
                'ភ្ជាប់ទំព័ររបស់បងម្តង។ AI រៀបចំផែនការប្រចាំសប្តាហ៍ រចនាវីដេអូ និងរូបភាព សរសេរចំណងជើងជាភាសាខ្មែរ — ហើយបង្ហោះនៅម៉ោងល្អបំផុត។ បងគ្រាន់តែយល់ព្រម។',
              )}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button type="button" onClick={onStart} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-0.5 sm:w-auto">
                {t('Start free', 'ចាប់ផ្តើមឥតគិតថ្លៃ')} <FiArrowRight />
              </button>
              <button type="button" onClick={() => go('videos')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 sm:w-auto">
                <FiPlay /> {t('See the videos', 'មើលវីដេអូ')}
              </button>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
              <span className="text-[12.5px] text-ink-400">{t('Posts to', 'បង្ហោះទៅ')}</span>
              {CHANNELS.map(({ Icon, name }) => (
                <Icon key={name} size={20} className="text-ink-500" title={name} />
              ))}
            </div>
          </div>

          {/* three phones, each playing a real template */}
          <div className="relative isolate mx-auto h-[400px] w-full max-w-[460px] sm:h-[470px]">
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-[90px] dark:bg-brand/30" />
            <Phone id="reaction" className="absolute left-0 top-12 w-[38%]" tilt={-8} />
            <Phone id="studio" className="absolute left-1/2 top-0 z-10 w-[44%] -translate-x-1/2" />
            <Phone id="doodle" className="absolute right-0 top-12 w-[38%]" tilt={8} />
            {/* our robot says hello from the corner */}
            <div className="absolute -right-3 -top-12 z-30 flex items-start sm:-right-10 sm:-top-14">
              <div className="mr-1 mt-4 rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-[12.5px] font-bold text-ink-900 shadow-pop">
                {t('Hi! I’m your AI marketer', 'សួស្តី! ខ្ញុំជាអ្នកទីផ្សារ AI របស់បង')}
              </div>
              <LiveAvatar size={118} className="sm:h-[136px] sm:w-[136px]" />
            </div>
            <div className="absolute -left-2 bottom-2 z-20 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop sm:-left-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
                <FiCheck strokeWidth={3} />
              </span>
              <div className="text-left">
                <div className="text-[12.5px] font-bold text-ink-900">{t('Posted to 3 pages', 'បានបង្ហោះទៅ ៣ ទំព័រ')}</div>
                <div className="text-[11px] text-ink-500">{t('Today', 'ថ្ងៃនេះ')} · 08:00</div>
              </div>
            </div>
            <div className="absolute -right-1 bottom-20 z-20 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop sm:-right-4">
              <FiCalendar className="text-brand" />
              <div className="text-[12.5px] font-bold text-ink-900">{t('Next week: planned', 'សប្តាហ៍ក្រោយ៖ រៀបចំរួច')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* past the hero, the robot flies along beside each section */}
      <SkyGuide t={t} />

      {/* ── channels strip ── */}
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-7 sm:px-6">
          {CHANNELS.map(({ Icon, name, color }) => (
            <div key={name} className="flex items-center gap-2 text-[14px] font-semibold text-ink-600">
              <Icon size={20} style={{ color }} />
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works: second, right under the top — the robot acts out the whole flow ── */}
      <section id="how" className="relative isolate scroll-mt-20 overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
        <GridBackdrop className="-z-10 opacity-70" />
        <SectionTitle
          eyebrow={t('How it works', 'របៀបដំណើរការ')}
          title={t('Sunday night, your whole week is ready', 'ល្ងាចថ្ងៃអាទិត្យ ប្រកាសពេញមួយសប្តាហ៍ត្រៀមរួច')}
          khmer="ភ្ជាប់ម្តង — បន្ទាប់មក AI ចាប់ផ្តើមធ្វើការជំនួសបង"
        />
        {/* the flow, acted out by our robot: brand → plan → Make for me → post → insights */}
        <AvatarPublish t={t} />
      </section>

      {/* ── videos: third, after How it works — every template, filtered, previewed ── */}
      <section id="videos" className="relative isolate scroll-mt-20 overflow-hidden bg-canvas py-20 sm:py-28">
        <GridBackdrop className="-z-10 opacity-60" />
        <div className="px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className={eyebrowCls(lang)}>{t('Video studio', 'ស្ទូឌីយោវីដេអូ')}</div>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[38px]">
              {t('Videos people stop scrolling for', 'វីដេអូដែលធ្វើឲ្យមនុស្សឈប់អូស')}
            </h2>
            <p className="mt-3 text-[15.5px] text-ink-500">
              {t(`${MOTION_TEMPLATES.length}+ templates in Khmer, with your logo — click one to preview.`, `គំរូជាង ${khDigits(MOTION_TEMPLATES.length)} ជាភាសាខ្មែរ មានឡូហ្គោរបស់បង — ចុចមួយ ដើម្បីមើល។`)}
            </p>
          </div>
        </div>
        <div className="px-4 sm:px-6">
          <TemplateGallery items={SHOWCASE.filter((id) => byId[id]).map((id) => byId[id])} usedBy={usedBy} isNew={isNew} t={t} num={(n) => (lang === 'km' ? khDigits(n) : String(n))} onStart={onStart} />
        </div>
        <div className="mt-20 px-4 sm:px-6">
          <Laptop />
          <p className="mt-5 text-center text-[13px] text-ink-400">
            {t(
              'Wide 16:9 for YouTube, Facebook and your website — tall 9:16 for Reels and TikTok',
              'ទទឹង 16:9 សម្រាប់ YouTube, Facebook និងគេហទំព័រ — បញ្ឈរ 9:16 សម្រាប់ Reels និង TikTok',
            )}
          </p>
        </div>
      </section>

      {/* ── features ── */}
      <section id="features" className="relative isolate scroll-mt-20 space-y-24 overflow-hidden bg-white px-4 py-20 sm:space-y-32 sm:px-6 sm:py-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] overflow-hidden">
          <GridBackdrop className="opacity-60" />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            eyebrow={t('Autopilot', 'ស្វ័យប្រវត្តិ')}
            title={t('Wake up Monday with the week already planned', 'ព្រឹកថ្ងៃច័ន្ទ ផែនការសប្តាហ៍ត្រៀមរួចជាស្រេច')}
            khmer="ផែនការប្រកាសមួយសប្តាហ៍ ដោយ AI"
            text={t(
              'Every Sunday evening the AI lines up next week — topics your audience loves, formats that win, each at its best hour. Skim it on one page and approve, or let the daily posts run themselves.',
              'រៀងរាល់ល្ងាចថ្ងៃអាទិត្យ AI រៀបចំសប្តាហ៍ក្រោយរួចជាស្រេច — ប្រធានបទដែលអ្នកមើលស្រឡាញ់ ទម្រង់ដែលឈ្នះ ហើយនីមួយៗនៅម៉ោងល្អបំផុត។ មើលលើទំព័រតែមួយ ហើយចុចយល់ព្រម ឬទុកឲ្យប្រកាសប្រចាំថ្ងៃដំណើរការដោយខ្លួនឯង។',
            )}
            points={[
              t('A real mix — tips, stories, fun, offers — never just selling', 'លាយគ្នាពិតៗ — គន្លឹះ រឿង ភាពសប្បាយ ការផ្តល់ជូន — មិនមែនតែលក់'),
              t('Approve each one, or put it fully on autopilot', 'យល់ព្រមម្តងមួយៗ ឬទុកឲ្យវាដំណើរការស្វ័យប្រវត្តិទាំងស្រុង'),
              t('Post times learned from your own audience — not a guess', 'ម៉ោងបង្ហោះ រៀនពីអ្នកមើលផ្ទាល់របស់បង — មិនមែនទាយ'),
            ]}
            visual={
              <AppShot
                src="/landing/plan.jpg"
                alt={t('The weekly plan in Smart Marketing — goals, and a post ready to approve', 'ផែនការប្រចាំសប្តាហ៍ក្នុង Smart Marketing')}
                tags={[
                  { icon: FiCalendar, text: t('7 posts ready for next week', '៧ ប្រកាសត្រៀមសម្រាប់សប្តាហ៍ក្រោយ'), at: '-left-2 top-0 lg:-left-8' },
                  { icon: FiZap, text: t('Best time · 08:00', 'ម៉ោងល្អបំផុត · ០៨:០០'), at: '-right-2 bottom-0 lg:-right-6' },
                ]}
              />
            }
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            flip
            eyebrow={t('Khmer first', 'ខ្មែរជាមុន')}
            title={t('Sounds like you — real Khmer, not a translation', 'និយាយដូចបង — ភាសាខ្មែរពិតៗ មិនមែនបកប្រែ')}
            khmer="សរសេរ និងនិយាយភាសាខ្មែរ ដូចបងផ្ទាល់"
            text={t(
              'It picks up your tone from the captions you love, writes in Khmer, English or both, and gives your videos a natural Khmer voice — even your brand’s very own.',
              'វារៀនរបៀបនិយាយរបស់បង ពីចំណងជើងដែលបងចូលចិត្ត សរសេរជាខ្មែរ អង់គ្លេស ឬទាំងពីរ ហើយផ្តល់សំឡេងខ្មែរធម្មជាតិដល់វីដេអូ — សូម្បីតែសំឡេងផ្ទាល់របស់ម៉ាកបង។',
            )}
            points={[
              t('Khmer, English, or Khmer first then English', 'ខ្មែរ អង់គ្លេស ឬខ្មែរមុន រួចអង់គ្លេស'),
              t('A natural Khmer voice, subtitles in sync word by word', 'សំឡេងខ្មែរធម្មជាតិ អក្សររត់ត្រូវគ្នាគ្រប់ពាក្យ'),
              t('Your brand and product names, said your way', 'ឈ្មោះម៉ាក និងផលិតផល អានតាមរបៀបរបស់បង'),
            ]}
            visual={
              <PhoneShot
                src="/landing/phone.jpg"
                alt={t('A Khmer caption in the Facebook preview', 'ចំណងជើងខ្មែរ ក្នុងការមើលជាមុនលើ Facebook')}
                tags={[
                  { icon: FiMessageCircle, text: t('Written in Khmer', 'សរសេរជាភាសាខ្មែរ'), at: 'left-0 top-16 lg:-left-2' },
                  { icon: FiMic, text: t('Natural Khmer voice', 'សំឡេងខ្មែរធម្មជាតិ'), at: 'right-0 bottom-20 lg:-right-2' },
                ]}
              />
            }
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            eyebrow={t('Learns from results', 'រៀនពីលទ្ធផល')}
            title={t('Smarter every single week', 'ឆ្លាតជាងមុន រៀងរាល់សប្តាហ៍')}
            khmer="រៀនពីលទ្ធផលរបស់បង"
            text={t(
              'Every post reports back — even the ones you posted by hand. The AI spots what your audience loves and leans into it: the hour, the format, the topic.',
              'គ្រប់ប្រកាសរាយការណ៍លទ្ធផលមកវិញ — សូម្បីតែប្រកាសដែលបងបង្ហោះដោយដៃ។ AI មើលឃើញអ្វីដែលអ្នកមើលស្រឡាញ់ ហើយធ្វើវាកាន់តែច្រើន៖ ម៉ោង ទម្រង់ និងប្រធានបទ។',
            )}
            points={[
              t('Numbers for every post, on every page', 'លេខសម្រាប់គ្រប់ប្រកាស លើគ្រប់ទំព័រ'),
              t('Lessons in plain words — no dashboards to decode', 'មេរៀនជាពាក្យងាយៗ — មិនចាំបាច់អានផ្ទាំងទិន្នន័យស្មុគស្មាញ'),
              t('Next week’s plan doubles down on what worked', 'ផែនការសប្តាហ៍ក្រោយ បង្កើនអ្វីដែលបានផល'),
            ]}
            visual={
              <AppShot
                src="/landing/insights.jpg"
                alt={t('The dashboard: posts per day and what stands out', 'ផ្ទាំងទិន្នន័យ៖ ប្រកាសប្រចាំថ្ងៃ និងអ្វីដែលលេចធ្លោ')}
                tags={[
                  { icon: FiBarChart2, text: t('Best day: Friday midday', 'ថ្ងៃល្អបំផុត៖ ថ្ងៃសុក្រ ថ្ងៃត្រង់'), at: '-left-2 top-0 lg:-left-8' },
                  { icon: FiCheck, text: t('Next plan follows what worked', 'ផែនការបន្ទាប់ធ្វើតាមអ្វីដែលបានផល'), at: '-right-2 bottom-0 lg:-right-6' },
                ]}
              />
            }
          />
        </div>
      </section>

      {/* ── one post, live everywhere ── */}
      <LiveEverywhere onStart={onStart} />

      {/* ── tutorials ── */}
      <TutorialShowcase />

      {/* ── everything else ── */}
      <section id="more" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle
          eyebrow={t('And more', 'និងច្រើនទៀត')}
          title={t('Everything your marketing needs, in one place', 'អ្វីៗដែលទីផ្សាររបស់បងត្រូវការ នៅកន្លែងតែមួយ')}
          khmer="គ្រប់យ៉ាងនៅកន្លែងតែមួយ"
        />
        <div className="mx-auto mt-14 grid max-w-5xl gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {MORE.map(({ Icon, title, text }, i) => (
            <Reveal key={title[0]} delay={(i % 3) * 100}>
              <div className="group flex items-start gap-4">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <Icon size={20} />
                </span>
                <div>
                  <div className="text-[15.5px] font-bold text-ink-900">{t(title)}</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-500">{t(text)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13.5px] text-ink-500">
          <span className="inline-flex items-center gap-2">
            <FiShield className="text-brand" /> {t('Your workspace is private to your team', 'កន្លែងធ្វើការរបស់បង ជាឯកជនសម្រាប់ក្រុមបង')}
          </span>
          <span className="inline-flex items-center gap-2">
            <FiBarChart2 className="text-brand" /> {t('See what every AI task costs', 'មើលតម្លៃនៃការងារ AI នីមួយៗ')}
          </span>
          <span className="inline-flex items-center gap-2">
            <FiCheck className="text-brand" /> {t('Nothing posts without your rules', 'គ្មានអ្វីបង្ហោះ ក្រៅពីច្បាប់របស់បង')}
          </span>
        </div>
      </section>

      {/* ── pricing ── */}
      <Pricing onStart={onStart} />

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle eyebrow={t('FAQ', 'សំណួរញឹកញាប់')} title={t('Questions people ask', 'សំណួរដែលគេតែងសួរ')} />
        <div className="mt-12">
          <Faq />
        </div>
      </section>

      </>
      )}

      {/* ── footer ── */}
      <footer className="border-t border-ink-200 bg-white px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="" className="h-7 w-7 rounded-lg" />
            <span className="text-[14px] font-bold text-ink-900">
              Smart Marketing
            </span>
          </div>
          <div className="flex items-center gap-6 text-[13.5px] text-ink-500">
            <a href="/mkt-tutorial" className="hover:text-brand">
              {t('Tutorials', 'មេរៀន')}
            </a>
            <a href="/developers" className="hover:text-brand">
              {t('Developers', 'អ្នកអភិវឌ្ឍន៍')}
            </a>
            <a href="/privacy" className="hover:text-brand">
              {t('Privacy', 'ឯកជនភាព')}
            </a>
            <a href="/terms" className="hover:text-brand">
              {t('Terms', 'លក្ខខណ្ឌ')}
            </a>
            <button type="button" onClick={onLogin} className="hover:text-brand">
              {t('Log in', 'ចូល')}
            </button>
          </div>
          <div className="text-center text-[12.5px] text-ink-400 sm:text-right">
            <div>© {new Date().getFullYear()} Smart Marketing</div>
            <div className="mt-0.5">
              {t('Powered by', 'ដំណើរការដោយ')} <span className="font-semibold text-ink-600">Proseth Solutions</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </LangCtx.Provider>
  )
}
