import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  FiArrowRight,
  FiBriefcase,
  FiBarChart2,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiCpu,
  FiGlobe,
  FiImage,
  FiKey,
  FiMessageCircle,
  FiMic,
  FiMoon,
  FiPenTool,
  FiMousePointer,
  FiPlay,
  FiPlayCircle,
  FiShield,
  FiSun,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { applyTheme, isDark } from '../lib/theme'
import { FaLinkedin } from 'react-icons/fa'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { MOTION_TEMPLATES, previewSrc } from '../lib/motionTemplates'
import { Course } from './TutorialsPage'
import CreditCoin from '../components/layout/CreditCoin'

// The public page at "/" for people who aren't signed in (search engines,
// visitors from ads): what Smart Marketing does, shown with the product's
// own template videos. "Log in" / "Start free" open the sign-in screen.
// Only true claims — no made-up ratings, customers or logos. The prices
// (Pricing) are the owner's own plans.

const KHMER_FONT = 'https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;500;700&display=swap'
const km = { fontFamily: '"Kantumruy Pro", "Khmer OS Siemreap", sans-serif' }

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

const SHOWCASE = ['studio', 'reaction', 'doodle', 'cartoon', 'lesson', 'rise', 'neural', 'countdown', 'tips', 'pov']

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
      <div className="relative overflow-hidden rounded-[2.2rem] border-[6px] border-night-950 bg-night-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]" style={{ transform: `rotate(${tilt}deg)` }}>
        <div className="flex h-6 items-center justify-center">
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
      <div className="relative mx-auto w-[92%] rounded-t-[1.4rem] border-[10px] border-b-[14px] border-night-800 bg-night-950 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
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
  const locked = MOTION_TEMPLATES.filter((t) => !SHOWCASE.includes(t.id))
  const shown = locked.slice(0, 12)
  return (
    <div className="mt-16 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
      <div className="relative">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {shown.map((tp, i) => (
            <button
              key={tp.id}
              type="button"
              onClick={onStart}
              title={`${tp.name} — ${t('sign up to unlock', 'ចុះឈ្មោះដើម្បីដោះសោ')}`}
              className={`group relative overflow-hidden rounded-2xl border border-ink-200 bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 ${i >= 6 ? 'hidden sm:block' : ''}`}
            >
              <div className="relative aspect-[9/16] overflow-hidden">
                <img src={previewSrc(tp.id)} alt="" loading="lazy" className="h-full w-full scale-105 object-cover opacity-70 blur-[3px] transition-all duration-300 group-hover:opacity-90 group-hover:blur-[1px]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-night-950/75 text-white shadow-pop ring-1 ring-white/20">
                    <FiKey size={13} />
                  </span>
                  {/* the button on the card itself — the whole card opens the sign-up */}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand px-2 py-[3px] text-[9.5px] font-semibold tracking-tight text-white shadow-glow transition-transform group-hover:-translate-y-0.5">
                    <span className="hidden lg:inline">{t('Get started to unlock', 'ចាប់ផ្តើមដើម្បីដោះសោ')}</span>
                    <span className="lg:hidden">{t('Unlock', 'ដោះសោ')}</span>
                  </span>
                </div>
              </div>
              <div className="truncate px-2.5 py-2 text-[12px] font-semibold text-ink-700">{tp.name}</div>
            </button>
          ))}
        </div>
        {/* what unlocks them — under the cards, so every card and its button stays clear */}
        <div className="mt-8 flex justify-center">
          <div className="flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-ink-200 bg-white px-6 py-5 text-center shadow-pop">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <FiKey size={18} />
            </span>
            <div className="text-[16px] font-bold text-ink-900">
              {t(`Get started to unlock ${locked.length} more templates`, `ចាប់ផ្តើមដើម្បីដោះសោគំរូ ${locked.length} ទៀត`)}
            </div>
            <p className="text-[13.5px] text-ink-500">
              {t(
                'Sign up free — every template, the AI design, your logo and colours, Khmer voices.',
                'ចុះឈ្មោះឥតគិតថ្លៃ — គ្រប់គំរូ ការរចនាដោយ AI ឡូហ្គោ និងពណ៌របស់បង សំឡេងខ្មែរ។',
              )}
            </p>
            <button type="button" onClick={onStart} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-0.5">
              {t('Get started free', 'ចាប់ផ្តើមឥតគិតថ្លៃ')} <FiArrowRight />
            </button>
          </div>
        </div>
      </div>
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
  // in Khmer the title already says it — the Khmer tagline under it is only for the English page
  if (useT().lang === 'km') khmer = null
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[38px]">{title}</h2>
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
      <img src={src} alt={alt} loading="lazy" className="relative w-[min(300px,70vw)] drop-shadow-[0_30px_40px_rgba(15,23,42,0.25)]" />
      {tags.map((tag, i) => (
        <FloatTag key={tag.text} {...tag} delay={i * 1.2} />
      ))}
    </div>
  )
}

function Feature({ eyebrow, title, khmer, text, points, visual, flip = false }) {
  if (useT().lang === 'km') khmer = null
  return (
    <div className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[32px]">{title}</h3>
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
    ['How do the AI costs work?', 'តើថ្លៃ AI គិតយ៉ាងដូចម្តេច?'],
    [
      'Every workspace has AI credit for writing, pictures, voices and videos. You see what each thing costs, and nothing runs once the credit is used up.',
      'កន្លែងធ្វើការនីមួយៗមានឥណទាន AI សម្រាប់ការសរសេរ រូបភាព សំឡេង និងវីដេអូ។ បងឃើញតម្លៃនៃការងារនីមួយៗ ហើយគ្មានអ្វីដំណើរការទេ ពេលឥណទានអស់។',
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
// the popular one dark; then the full comparison. Credits: CREDIT_USES.
const PLANS = [
  {
    id: 'free',
    name: ['Free', 'ឥតគិតថ្លៃ'],
    for: ['Perfect to get started', 'ល្អសម្រាប់ចាប់ផ្តើម'],
    usd: 0,
    khr: 0,
    cta: ['Get started free', 'ចាប់ផ្តើមឥតគិតថ្លៃ'],
    points: [
      ['100 AI credits / month (~10 posts or 1 video)', 'ក្រេឌីត AI ១០០ / ខែ (~១០ ប្រកាស ឬវីដេអូ ១)'],
      ['1 brand · 2 connected pages', 'ម៉ាក ១ · ទំព័រ ២'],
      ['Scheduling & auto-posting', 'កំណត់ពេល និងបង្ហោះស្វ័យប្រវត្តិ'],
      ['3 motion video templates', 'គំរូវីដេអូចលនា ៣'],
      ['7 days of analytics', 'ស្ថិតិ ៧ ថ្ងៃ'],
      ['No credit card required', 'មិនចាំបាច់កាតឥណទាន'],
    ],
  },
  {
    id: 'starter',
    name: ['Starter', 'Starter'],
    for: ['For one shop and its owner', 'សម្រាប់ហាងមួយ និងម្ចាស់ហាង'],
    usd: 19,
    khr: 79000,
    cta: ['Get started', 'ចាប់ផ្តើម'],
    points: [
      ['1,000 AI credits / month (~30 posts + 15 images + 8 videos)', 'ក្រេឌីត AI ១.០០០ / ខែ (~៣០ ប្រកាស + ១៥ រូបភាព + ៨ វីដេអូ)'],
      ['1 brand · 5 connected pages', 'ម៉ាក ១ · ទំព័រ ៥'],
      ['Everything in Free', 'គ្រប់យ៉ាងក្នុង Free'],
      ['Weekly AI plan, posted for you', 'ផែនការ AI ប្រចាំសប្តាហ៍ បង្ហោះជូនបង'],
      ['All motion video templates', 'គំរូវីដេអូចលនាទាំងអស់'],
      ['Your logo on every video', 'ឡូហ្គោរបស់បង លើគ្រប់វីដេអូ'],
      ['30 days of analytics', 'ស្ថិតិ ៣០ ថ្ងៃ'],
      ['Monthly website check', 'ពិនិត្យគេហទំព័រ ប្រចាំខែ'],
      ['Chat support', 'ជំនួយតាមឆាត'],
    ],
  },
  {
    id: 'pro',
    name: ['Pro', 'Pro'],
    for: ['For growing businesses and small agencies', 'សម្រាប់អាជីវកម្មកំពុងរីក និងភ្នាក់ងារតូច'],
    usd: 49,
    khr: 199000,
    popular: true,
    cta: ['Get started', 'ចាប់ផ្តើម'],
    points: [
      ['3,000 AI credits / month (~90 posts + 45 images + 25 videos)', 'ក្រេឌីត AI ៣.០០០ / ខែ (~៩០ ប្រកាស + ៤៥ រូបភាព + ២៥ វីដេអូ)'],
      ['3 brands · 15 pages · 3 team seats', 'ម៉ាក ៣ · ទំព័រ ១៥ · អ្នកប្រើ ៣'],
      ['Everything in Starter', 'គ្រប់យ៉ាងក្នុង Starter'],
      ['Your own voice for videos', 'សំឡេងផ្ទាល់របស់បង សម្រាប់វីដេអូ'],
      ['Leads & hand-off to your team', 'អតិថិជនសក្តានុពល និងបញ្ជូនទៅក្រុម'],
      ['12 months of analytics', 'ស្ថិតិ ១២ ខែ'],
      ['Weekly website check', 'ពិនិត្យគេហទំព័រ ប្រចាំសប្តាហ៍'],
      ['API (read-only)', 'API (អានប៉ុណ្ណោះ)'],
      ['Priority chat support', 'ជំនួយតាមឆាត អាទិភាព'],
    ],
  },
  {
    id: 'business',
    name: ['Business', 'Business'],
    for: ['For agencies and businesses with many branches', 'សម្រាប់ភ្នាក់ងារ និងអាជីវកម្មមានសាខាច្រើន'],
    usd: 129,
    khr: 529000,
    cta: ['Get started', 'ចាប់ផ្តើម'],
    points: [
      ['9,000 AI credits / month (~270 posts + 135 images + 75 videos)', 'ក្រេឌីត AI ៩.០០០ / ខែ (~២៧០ ប្រកាស + ១៣៥ រូបភាព + ៧៥ វីដេអូ)'],
      ['10 brands · unlimited pages · 10 seats', 'ម៉ាក ១០ · ទំព័រគ្មានដែនកំណត់ · អ្នកប្រើ ១០'],
      ['Everything in Pro', 'គ្រប់យ៉ាងក្នុង Pro'],
      ['Full API & webhooks', 'API ពេញលេញ និង webhooks'],
      ['MCP — use it from Claude or ChatGPT', 'MCP — ប្រើពី Claude ឬ ChatGPT'],
      ['Onboarding with our team', 'ណែនាំការប្រើប្រាស់ជាមួយក្រុមយើង'],
      ['Telegram support group', 'ក្រុមជំនួយលើ Telegram'],
    ],
  },
]

// What a credit buys — the same on every plan.
const CREDIT_USES = [
  [FiMessageCircle, ['Caption or post text', 'ចំណងជើង ឬអត្ថបទប្រកាស'], 2],
  [FiImage, ['AI image or poster', 'រូបភាព ឬប៉ូស្ទ័រ AI'], 10],
  [FiCalendar, ['Weekly plan (7 posts)', 'ផែនការសប្តាហ៍ (៧ ប្រកាស)'], 40],
  [FiPlay, ['Motion video with voice', 'វីដេអូចលនា មានសំឡេង'], 60],
  [FiPlayCircle, ['AI film clip, 8 s', 'ឈុតវីដេអូ AI ៨ វិនាទី'], 160],
]

// The full comparison. A value per plan (Free, Starter, Pro, Business): true ✓, false —, or text.
const COMPARE = [
  [['Monthly AI credits', 'ក្រេឌីត AI ប្រចាំខែ'], ['100', '1,000', '3,000', '9,000']],
  [['Brands', 'ម៉ាក'], ['1', '1', '3', '10']],
  [['Connected pages', 'ទំព័រដែលភ្ជាប់'], ['2', '5', '15', ['No limit', 'គ្មានដែនកំណត់']]],
  [['Team seats', 'អ្នកប្រើក្នុងក្រុម'], ['1', '1', '3', '10']],
  [['Scheduling & auto-posting', 'កំណត់ពេល និងបង្ហោះស្វ័យប្រវត្តិ'], [true, true, true, true]],
  [['Khmer captions & voice', 'ចំណងជើង និងសំឡេងខ្មែរ'], [true, true, true, true]],
  [['Posters with real Khmer text', 'ប៉ូស្ទ័រមានអក្សរខ្មែរត្រឹមត្រូវ'], [true, true, true, true]],
  [['Motion video templates', 'គំរូវីដេអូចលនា'], [['3 basic', '៣ មូលដ្ឋាន'], ['All', 'ទាំងអស់'], ['All', 'ទាំងអស់'], ['All', 'ទាំងអស់']]],
  [['Weekly AI plan', 'ផែនការ AI ប្រចាំសប្តាហ៍'], [false, true, true, true]],
  [['Your logo on videos', 'ឡូហ្គោរបស់បងលើវីដេអូ'], [false, true, true, true]],
  [['Analytics history', 'ប្រវត្តិស្ថិតិ'], [['7 days', '៧ ថ្ងៃ'], ['30 days', '៣០ ថ្ងៃ'], ['12 months', '១២ ខែ'], ['12 months', '១២ ខែ']]],
  [['Website check', 'ពិនិត្យគេហទំព័រ'], [false, ['Monthly', 'ប្រចាំខែ'], ['Weekly', 'ប្រចាំសប្តាហ៍'], ['Weekly', 'ប្រចាំសប្តាហ៍']]],
  [['Your own voice (clone)', 'សំឡេងផ្ទាល់ខ្លួន'], [false, false, true, true]],
  [['Leads & hand-off', 'អតិថិជនសក្តានុពល'], [false, false, true, true]],
  [['API access', 'API'], [false, false, ['Read-only', 'អានប៉ុណ្ណោះ'], ['Full', 'ពេញលេញ']]],
  [['Webhooks', 'Webhooks'], [false, false, false, true]],
  [['MCP (Claude, ChatGPT)', 'MCP (Claude, ChatGPT)'], [false, false, false, true]],
  [['Onboarding with our team', 'ណែនាំការប្រើប្រាស់'], [false, false, false, true]],
  [['Support', 'ជំនួយ'], [['Help center', 'មជ្ឈមណ្ឌលជំនួយ'], ['Chat', 'ឆាត'], ['Priority chat', 'ឆាតអាទិភាព'], ['Telegram group', 'ក្រុម Telegram']]],
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

// ── what credits make: a planner and the add-on shop ─────────────────────
// A sample month per plan — the counts the plan cards promise, plus weekly
// plans and film clips — in credits (CREDIT_USES). Colours are the bar's
// segments (saturated, so the same in both themes).
const CREDIT_MIX = [
  { key: 'posts', Icon: FiMessageCircle, label: ['posts', 'ប្រកាស'], each: 2, color: 'bg-sky-500' },
  { key: 'images', Icon: FiImage, label: ['images', 'រូបភាព'], each: 10, color: 'bg-violet-500' },
  { key: 'plans', Icon: FiCalendar, label: ['weekly plans', 'ផែនការសប្តាហ៍'], each: 40, color: 'bg-amber-400' },
  { key: 'videos', Icon: FiPlay, label: ['motion videos', 'វីដេអូចលនា'], each: 60, color: 'bg-brand' },
  { key: 'films', Icon: FiPlayCircle, label: ['film clips', 'ឈុតវីដេអូ AI'], each: 160, color: 'bg-emerald-500' },
]
const SAMPLE_MONTH = {
  free: { posts: 10, images: 2, videos: 1 },
  starter: { posts: 30, images: 15, plans: 4, videos: 8 },
  pro: { posts: 90, images: 45, plans: 4, videos: 25, films: 4 },
  business: { posts: 270, images: 135, plans: 16, videos: 75, films: 12 },
}

/** Pick a plan; a bar fills with a sample month of what its credits make. */
function CreditPlanner() {
  const t = useT()
  const n = (v) => (t.lang === 'km' ? khDigits(v) : v)
  const [pick, setPick] = useState('pro')
  const plan = PLANS.find((p) => p.id === pick)
  const total = { free: 100, starter: 1000, pro: 3000, business: 9000 }[pick]
  const mix = CREDIT_MIX.map((m) => ({ ...m, count: SAMPLE_MONTH[pick][m.key] || 0 })).filter((m) => m.count)
  const used = mix.reduce((sum, m) => sum + m.count * m.each, 0)
  return (
    <div className="mx-auto mt-16 max-w-6xl overflow-hidden rounded-3xl bg-white shadow-card">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* the question and the picker */}
        <div className="border-b border-ink-100 p-7 sm:p-9 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-brand">
            <CreditCoin size={18} /> {t('Credit planner', 'គណនាក្រេឌីត')}
          </div>
          <h3 className="mt-3 text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">{t('What can a month of credits make?', 'ក្រេឌីតមួយខែ បង្កើតបានអ្វីខ្លះ?')}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
            {t('Pick a plan to see a typical month. Posting and scheduling never use credits.', 'ជ្រើសគម្រោង ដើម្បីមើលខែធម្មតាមួយ។ ការបង្ហោះ និងកំណត់ពេល មិនប្រើក្រេឌីតទេ។')}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPick(p.id)}
                aria-pressed={pick === p.id}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${pick === p.id ? 'border-brand bg-brand text-white shadow-[0_10px_24px_-10px_rgb(var(--brand)/0.7)]' : 'border-ink-200 text-ink-800 hover:border-brand/50'}`}
              >
                <div className="text-[14px] font-bold">{t(p.name)}</div>
                <div className={`text-[12px] ${pick === p.id ? 'text-white/80' : 'text-ink-500'}`}>
                  {n({ free: '100', starter: '1,000', pro: '3,000', business: '9,000' }[p.id])} {t('credits', 'ក្រេឌីត')}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* the month */}
        <div className="p-7 sm:p-9">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[15px] font-bold text-ink-900">{t(`A month on ${plan.name[0]}`, `មួយខែលើ ${plan.name[1]}`)}</div>
            <div className="text-[13px] text-ink-500">
              <span className="font-bold text-ink-900">{n(used.toLocaleString('en-US'))}</span> / {n(total.toLocaleString('en-US'))} {t('credits', 'ក្រេឌីត')}
            </div>
          </div>
          {/* the bar: one segment per kind, sized by the credits it uses */}
          <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-ink-100">
            {mix.map((m) => (
              <div key={m.key} className={`${m.color} h-full transition-all duration-700 first:rounded-l-full`} style={{ width: `${((m.count * m.each) / total) * 100}%` }} title={`${m.count} ${m.label[0]}`} />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mix.map((m) => (
              <div key={m.key} className="rounded-2xl bg-canvas p-3.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${m.color}`} />
                  <m.Icon size={14} className="text-ink-500" />
                </div>
                <div className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-ink-900">{n(m.count)}</div>
                <div className="mt-1 text-[12.5px] text-ink-500">{t(m.label)}</div>
              </div>
            ))}
            {total - used > 0 && (
              <div className="grid place-items-center rounded-2xl border-2 border-dashed border-ink-200 p-3.5 text-center text-[12.5px] text-ink-500">
                <span>
                  <span className="block text-[18px] font-bold text-ink-700">+{n((total - used).toLocaleString('en-US'))}</span>
                  {t('to spare', 'នៅសល់')}
                </span>
              </div>
            )}
          </div>
          {/* what each thing costs */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CREDIT_USES.map(([Icon, label, credits]) => (
              <span key={label[0]} className="inline-flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-3 text-[12px] text-ink-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-[11.5px] font-bold text-ink-50">
                  <CreditCoin size={13} /> {n(credits)}
                </span>
                <Icon size={13} className="text-ink-400" />
                {t(label)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Add-ons as a little shop: the credit packs as stacks of tokens, then brand, seat, setup. */
function AddonShop() {
  const t = useT()
  const n = (v) => (t.lang === 'km' ? khDigits(v) : v)
  const packs = [
    { credits: 500, usd: 6, coins: 1 },
    { credits: 2000, usd: 20, coins: 2 },
    { credits: 5000, usd: 45, coins: 3, best: true },
  ]
  const extras = [
    [FiBriefcase, ['Extra brand', 'ម៉ាកបន្ថែម'], '$10', ['/ month each', '/ ខែ ក្នុងមួយ'], ['Another business, its own logo and pages', 'អាជីវកម្មមួយទៀត មានឡូហ្គោ និងទំព័រផ្ទាល់']],
    [FiUsers, ['Extra seat', 'អ្នកប្រើបន្ថែម'], '$5', ['/ month each', '/ ខែ ក្នុងម្នាក់']  , ['One more teammate with their own login', 'សមាជិកក្រុមម្នាក់ទៀត មានគណនីផ្ទាល់']],
    [FiPenTool, ['Done-for-you setup', 'រៀបចំជូនទាំងអស់'], '$99', ['once', 'តែម្តង'], ['Brand kit, voice and your first month of posts — by our team', 'កញ្ចប់ម៉ាក សំឡេង និងប្រកាសខែដំបូង — ដោយក្រុមយើង']],
  ]
  return (
    <div className="mx-auto mt-16 max-w-6xl">
      <div className="text-center">
        <div className="text-[20px] font-bold text-ink-900">{t('Need a little more?', 'ត្រូវការបន្ថែមបន្តិច?')}</div>
        <p className="mt-1 text-[13.5px] text-ink-500">{t('Add-ons for any paid plan.', 'សម្រាប់គ្រប់គម្រោងបង់ប្រាក់។')}</p>
      </div>
      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* credit packs */}
        <div className="rounded-3xl bg-white p-6 shadow-card">
          <div className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
            <CreditCoin size={20} /> {t('Top up credits', 'បញ្ចូលក្រេឌីតបន្ថែម')}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-500">{t('They stay for the month you buy them, on top of your plan’s.', 'ប្រើបានក្នុងខែដែលបងទិញ បន្ថែមលើក្រេឌីតគម្រោង។')}</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {packs.map((pk) => (
              <div key={pk.credits} className={`relative rounded-2xl border p-4 text-center ${pk.best ? 'border-brand bg-brand-soft' : 'border-ink-200'}`}>
                {pk.best && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-bold text-white">{t('Best value', 'តម្លៃល្អបំផុត')}</span>}
                {/* a stack of tokens: more for a bigger pack */}
                <div className="relative mx-auto h-10 w-12">
                  {Array.from({ length: pk.coins }).map((_, k) => (
                    <span key={k} className="absolute left-1/2" style={{ bottom: k * 7, transform: `translateX(calc(-50% + ${(k % 2 ? 5 : -3)}px))` }}>
                      <CreditCoin size={28} />
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[20px] font-extrabold tabular-nums text-ink-900">{n(pk.credits.toLocaleString('en-US'))}</div>
                <div className="text-[11.5px] text-ink-500">{t('credits', 'ក្រេឌីត')}</div>
                <div className="mt-2 text-[18px] font-bold text-brand">${pk.usd}</div>
                <div className="text-[11px] text-ink-400">{t(`${((pk.usd / pk.credits) * 100).toFixed(1)}¢ a credit`, `${((pk.usd / pk.credits) * 100).toFixed(1)}¢ ក្នុងមួយក្រេឌីត`)}</div>
              </div>
            ))}
          </div>
        </div>
        {/* brand, seat, setup */}
        <div className="grid gap-3">
          {extras.map(([Icon, name, price, per, text]) => (
            <div key={name[0]} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-soft text-brand">
                <Icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink-900">{t(name)}</div>
                <div className="text-[12.5px] leading-snug text-ink-500">{t(text)}</div>
              </div>
              <div className="flex-none text-right">
                <div className="text-[20px] font-extrabold text-ink-900">{price}</div>
                <div className="text-[11px] text-ink-500">{t(per)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pricing({ onStart }) {
  const t = useT()
  const [yearly, setYearly] = useState(false)
  const [riel, setRiel] = useState(t.lang === 'km')
  const n = (s) => (t.lang === 'km' ? khDigits(s) : s)
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
    <section id="pricing" className="scroll-mt-20 bg-canvas px-4 py-20 sm:px-6 sm:py-28">
      <SectionTitle
        eyebrow={t('Pricing', 'តម្លៃ')}
        title={t('Simple plans that grow with you', 'គម្រោងសាមញ្ញ រីកចម្រើនជាមួយបង')}
        khmer="ចាប់ផ្តើមឥតគិតថ្លៃ ដំឡើងពេលបងត្រៀមរួច"
        sub={t('Start free. Every plan includes AI credits each month — posting and scheduling never use them.', 'ចាប់ផ្តើមឥតគិតថ្លៃ។ គ្រប់គម្រោងមានក្រេឌីត AI រៀងរាល់ខែ — ការបង្ហោះ និងកំណត់ពេល មិនប្រើក្រេឌីតទេ។')}
      />

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Toggle value={yearly} onChange={setYearly} options={[[false, t('Monthly', 'ប្រចាំខែ')], [true, t('Yearly', 'ប្រចាំឆ្នាំ'), t('2 months free', 'ឥតគិតថ្លៃ ២ ខែ')]]} />
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
                  <span className="mt-0.5">
                    <Tick />
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
              <div className={`relative flex flex-col rounded-3xl p-7 sm:p-8 ${dark ? 'bg-night-900 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] ring-1 ring-white/10' : 'bg-white shadow-card'}`}>
                {dark && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3.5 py-1 text-[12px] font-semibold text-night-900 shadow-sm ring-1 ring-black/5">
                    {t('Most popular', 'ពេញនិយមបំផុត')}
                  </span>
                )}
                <div className={`text-[24px] font-bold ${dark ? 'text-white' : 'text-ink-900'}`}>{t(p.name)}</div>
                <div className={`mt-1.5 min-h-[42px] text-[14.5px] leading-snug ${dark ? 'text-white/70' : 'text-ink-500'}`}>{t(p.for)}</div>
                <Price plan={p} yearly={yearly} riel={riel} dark={dark} />
                <button type="button" onClick={onStart} className={`${pill} mt-4 ${dark ? 'bg-white text-night-900 hover:bg-white/90' : 'bg-ink-100 text-ink-900 hover:bg-ink-200'}`}>
                  {t(p.cta)}
                </button>
                <div className={`mt-8 text-[13px] ${dark ? 'text-white/60' : 'text-ink-500'}`}>{t('Includes', 'រួមមាន')}</div>
                <ul className="mt-4 space-y-3.5">
                  {p.points.map((pt) => (
                    <li key={pt[0]} className={`flex items-start gap-3 text-[14.5px] leading-snug ${dark ? 'text-white/90' : 'text-ink-700'}`}>
                      <span className="mt-0.5">
                        <Tick dark={dark} />
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
              Enterprise <span className="ml-1 text-[14px] font-medium text-ink-500">· {t('big brands, resellers and partners', 'ម៉ាកធំ អ្នកលក់បន្ត និងដៃគូ')}</span>
            </div>
            <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-ink-500">
              {t(
                'Unlimited brands, pages and seats, the credits you need, a video template made for your brand, CRM connection, an account manager and a service agreement.',
                'ម៉ាក ទំព័រ និងអ្នកប្រើ គ្មានដែនកំណត់ ក្រេឌីតតាមតម្រូវការ គំរូវីដេអូធ្វើសម្រាប់ម៉ាកបង ភ្ជាប់ CRM អ្នកគ្រប់គ្រងគណនី និងកិច្ចព្រមព្រៀងសេវាកម្ម។',
              )}
            </p>
          </div>
          <button type="button" onClick={onStart} className="inline-flex flex-none items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-[14.5px] font-semibold text-ink-50 transition-colors hover:bg-ink-800">
            {t('Contact us', 'ទាក់ទងយើង')}
          </button>
        </div>
      </Reveal>

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
                    {p.usd ? priceOf(p, yearly, riel).main : riel ? '0៛' : '$0'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <CreditPlanner />
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

// The hero headline. Under the mouse a small black hole follows the cursor:
// a dark disc with a glowing ring, and the letters inside it turn to
// starlight — a second copy of the headline, cut to that circle, so it works
// letter by letter. Phones (no mouse) just see the headline.
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
        {words({ plain: '', hot: 'lp-galaxy' })}
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
    if (!document.querySelector(`link[href="${KHMER_FONT}"]`)) {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = KHMER_FONT
      document.head.appendChild(l)
    }
    const on = () => setScrolled(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const byId = Object.fromEntries(MOTION_TEMPLATES.map((tp) => [tp.id, tp]))
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
          <div className="hidden items-center gap-1 text-[14px] font-medium md:flex">
            {NAV.map(([id, label]) =>
              id === 'features' ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMenu((m) => !m)}
                  onMouseEnter={() => setMenu(true)}
                  aria-expanded={menu}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${menu || section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
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
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
                >
                  {t(label)}
                </button>
              ),
            )}
            {/* the how-to videos — their own public page (/mkt-tutorial, TutorialsPage.jsx) */}
            <a
              href="/mkt-tutorial"
              onMouseEnter={() => setMenu(false)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${page === 'tutorials' ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
            >
              {t('Tutorials', 'មេរៀន')}
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
            <button type="button" onClick={onLogin} className="rounded-xl border border-ink-200 px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 sm:px-3.5 sm:text-[14px]">
              {t('Log in', 'ចូល')}
            </button>
            <button type="button" onClick={onStart} className="whitespace-nowrap rounded-xl bg-brand px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-px sm:px-4">
              {t('Start free', 'ចាប់ផ្តើម')}
            </button>
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
        <div className="pt-20 sm:pt-24">
          <Course openLabel={t('Log in to try it', 'ចូលដើម្បីសាកល្បង')} onOpen={onLogin} />
        </div>
      ) : (
      <>
      {/* ── hero ── */}
      {/* light or dark with the theme: the page's own surface, a soft brand glow and a faint grid */}
      <section className="relative overflow-hidden bg-white pb-20 pt-32 sm:pb-28 sm:pt-40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-brand/15 blur-[120px] dark:bg-brand/25" />
          <div className="absolute -right-32 bottom-0 h-[460px] w-[460px] rounded-full bg-violet-500/10 blur-[120px] dark:bg-violet-500/20" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgb(var(--ink-900) / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--ink-900) / 0.05) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 40%, transparent 100%)',
            }}
          />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-center lg:text-left">
            {/* the highlighted words are filled with a slowly turning galaxy: nebula
                colours swirling round a dark core, with tiny stars drifting through */}
            <style>{`
              .lp-galaxy {
                background-image:
                  radial-gradient(1.2px 1.2px at 12% 30%, #fff 60%, transparent 100%),
                  radial-gradient(1px 1px at 38% 70%, #fff 60%, transparent 100%),
                  radial-gradient(1.4px 1.4px at 63% 22%, #fff 60%, transparent 100%),
                  radial-gradient(1px 1px at 82% 64%, #fff 60%, transparent 100%),
                  radial-gradient(1.2px 1.2px at 92% 18%, #fff 60%, transparent 100%),
                  radial-gradient(circle at 50% 50%, var(--lp-core) 0 7%, #f59e0b 9%, #fde68a 10.5%, #c084fc 13%, transparent 19%),
                  radial-gradient(ellipse at 30% 40%, rgb(236 72 153 / 0.75), transparent 45%),
                  linear-gradient(110deg, #7c3aed, #2563eb 18%, #06b6d4 32%, #a855f7 48%, #ec4899 62%, #4f46e5 78%, #0ea5e9 90%, #7c3aed);
                background-size: 140px 70px, 180px 90px, 160px 80px, 210px 100px, 120px 60px, 260% 180%, 220% 160%, 320% 100%;
                --lp-core: #0b0820;
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                -webkit-text-fill-color: transparent;
                animation: lp-galaxy 14s ease-in-out infinite alternate;
                filter: drop-shadow(0 6px 22px rgb(124 58 237 / 0.25));
              }
              @keyframes lp-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
              @media (prefers-reduced-motion: reduce) { [style*='lp-float'] { animation: none !important } }
              @keyframes lp-galaxy {
                0% { background-position: 0 0, 0 0, 0 0, 0 0, 0 0, 0% 40%, 100% 0%, 0% 50% }
                100% { background-position: 140px 70px, -180px 90px, 160px -80px, -210px 100px, 120px 60px, 100% 60%, 0% 100%, 100% 50% }
              }
              /* on the dark page the black hole's core is a deep violet, not black, so the letters stay readable */
              .dark .lp-galaxy { --lp-core: #3b0764 }
              /* inside the black-hole lens: bright starlight letters on the dark disc */
              .lp-lens-text {
                background-image:
                  radial-gradient(1.2px 1.2px at 20% 30%, #fff 60%, transparent 100%),
                  radial-gradient(1px 1px at 70% 65%, #fff 60%, transparent 100%),
                  linear-gradient(110deg, #fde68a, #f9a8d4 25%, #c4b5fd 50%, #67e8f9 75%, #fde68a);
                background-size: 90px 50px, 130px 70px, 300% 100%;
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                -webkit-text-fill-color: transparent;
                animation: lp-galaxy 14s ease-in-out infinite alternate;
              }
              .lp-lens-disc {
                background: radial-gradient(circle at calc(var(--mx) + 60px) calc(var(--my) + 60px),#1e1145 0, #05030f 20px, #0b0820 27px, #f59e0b 31px, #fde68a 32.5px, #c084fc 35px, transparent 36px);
              }
              @media (prefers-reduced-motion: reduce) { .lp-galaxy, .lp-lens-text { animation: none } }
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
          <div className="relative mx-auto h-[400px] w-full max-w-[460px] sm:h-[470px]">
            <Phone id="reaction" className="absolute left-0 top-12 w-[38%]" tilt={-8} />
            <Phone id="studio" className="absolute left-1/2 top-0 z-10 w-[44%] -translate-x-1/2" />
            <Phone id="doodle" className="absolute right-0 top-12 w-[38%]" tilt={8} />
            <div className="absolute -left-2 bottom-2 z-20 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop sm:-left-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white">
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

      {/* ── how it works ── */}
      <section id="how" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle
          eyebrow={t('How it works', 'របៀបដំណើរការ')}
          title={t('Sunday night, your whole week is ready', 'ល្ងាចថ្ងៃអាទិត្យ ប្រកាសពេញមួយសប្តាហ៍ត្រៀមរួច')}
          khmer="ភ្ជាប់ម្តង — បន្ទាប់មក AI ចាប់ផ្តើមធ្វើការជំនួសបង"
        />
        <div className="mx-auto mt-14 grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {[
            [FiGlobe, t('Plug in your pages', 'ភ្ជាប់ទំព័ររបស់បង'), t('Facebook, Instagram, TikTok, Telegram, LinkedIn — one brand, as many pages as you run.', 'Facebook, Instagram, TikTok, Telegram, LinkedIn — ម៉ាកមួយ ភ្ជាប់ទំព័របានច្រើនតាមចិត្ត។')],
            [FiCalendar, t('The AI drafts your week', 'AI រៀបចំសប្តាហ៍ជូនបង'), t('Tips, stories, offers — mixed the way your followers actually react.', 'គន្លឹះ រឿង ការផ្តល់ជូន — លាយគ្នាតាមអ្វីដែលអ្នកតាមដានចូលចិត្តពិតៗ។')],
            [FiPenTool, t('It designs and writes', 'វារចនា និងសរសេរ'), t('Scroll-stopping videos, pictures and Khmer captions — in your colours, with your logo.', 'វីដេអូ រូបភាព និងចំណងជើងខ្មែរ ដែលធ្វើឲ្យគេឈប់អូស — ពណ៌ និងឡូហ្គោរបស់បង។')],
            [FiCheck, t('You tap Approve. Done.', 'បងចុចយល់ព្រម។ រួចរាល់។'), t('It posts itself at the hour your audience is online.', 'វាបង្ហោះដោយខ្លួនឯង នៅម៉ោងដែលអ្នកមើលកំពុងអនឡាញ។')],
          ].map(([Icon, title, d], i) => (
            <Reveal key={i} delay={i * 120}>
              <div className="relative text-center lg:px-3">
                {/* the line joining the steps */}
                {i < 3 && <div className="absolute left-[calc(50%+36px)] right-[calc(-50%+36px)] top-7 hidden h-[2px] bg-gradient-to-r from-brand/40 to-brand/10 lg:block" />}
                <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-8px_rgb(var(--brand)/0.6)]">
                  <Icon size={22} />
                  <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-bold text-brand ring-2 ring-brand-soft">{i + 1}</span>
                </span>
                <div className="mt-5 text-[16px] font-bold text-ink-900">{title}</div>
                <p className="mx-auto mt-1.5 max-w-[240px] text-[14px] leading-relaxed text-ink-500">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── features ── */}
      <section id="features" className="scroll-mt-20 space-y-24 bg-white px-4 py-20 sm:space-y-32 sm:px-6 sm:py-28">
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

      {/* ── videos ── */}
      <section id="videos" className="scroll-mt-20 overflow-hidden bg-canvas py-20 sm:py-28">
        <div className="px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className={eyebrowCls(lang)}>{t('Video studio', 'ស្ទូឌីយោវីដេអូ')}</div>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[38px]">
              {t('Videos people stop scrolling for', 'វីដេអូដែលធ្វើឲ្យមនុស្សឈប់អូស')}
            </h2>
            {lang !== 'km' && (
              <p className="mt-2 text-[17px] font-medium text-ink-600" style={km}>
                វីដេអូខ្មែរ ដែលមនុស្សឈប់មើល
              </p>
            )}
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-500">
              {t(
                `${MOTION_TEMPLATES.length}+ animated templates — memes, stories, lessons, product launches — or let the AI design every scene for your brief. Your colours, your logo, a Khmer voice and subtitles.`,
                `គំរូវីដេអូចលនាជាង ${MOTION_TEMPLATES.length} — មីម រឿង មេរៀន ការដាក់លក់ផលិតផលថ្មី — ឬទុកឲ្យ AI រចនាគ្រប់ឈុតតាមការណែនាំរបស់បង។ ពណ៌ ឡូហ្គោ សំឡេងខ្មែរ និងអក្សររត់ របស់បង។`,
              )}
            </p>
          </div>
        </div>
        <div className="mt-14 px-4 sm:px-6">
          <Laptop />
          <p className="mt-5 text-center text-[13px] text-ink-400">
            {t(
              'Wide 16:9 for YouTube, Facebook and your website — tall 9:16 for Reels and TikTok',
              'ទទឹង 16:9 សម្រាប់ YouTube, Facebook និងគេហទំព័រ — បញ្ឈរ 9:16 សម្រាប់ Reels និង TikTok',
            )}
          </p>
        </div>
        {/* the phones drift past in a loop (the list twice, moved by half), faded at both
            edges — a strip cut off at the screen's edge looked like a mistake; still on hover
            and for people who turn motion off */}
        <style>{`
          @keyframes lp-drift { from { transform: translateX(0) } to { transform: translateX(-50%) } }
          .lp-drift { animation: lp-drift 60s linear infinite }
          .lp-strip:hover .lp-drift { animation-play-state: paused }
          @media (prefers-reduced-motion: reduce) { .lp-drift { animation: none } }
        `}</style>
        <div
          className="lp-strip mx-auto mt-14 max-w-6xl overflow-hidden pb-4"
          style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}
        >
          <div className="lp-drift flex w-max">
            {[0, 1].map((copy) =>
              SHOWCASE.filter((id) => byId[id]).map((id) => (
                <div key={`${copy}-${id}`} className="mr-5 w-[170px] flex-none sm:mr-7 sm:w-[210px]" aria-hidden={copy === 1 || undefined}>
                  <Phone id={id} />
                  <div className="mt-3 text-center text-[13px] font-semibold text-ink-700">{byId[id].name}</div>
                </div>
              )),
            )}
          </div>
        </div>
        <LockedTemplates onStart={onStart} />
      </section>

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
