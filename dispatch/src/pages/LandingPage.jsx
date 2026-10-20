import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  FiArrowRight,
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
  FiPlay,
  FiShield,
  FiSun,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { applyTheme, isDark } from '../lib/theme'
import { FaLinkedin } from 'react-icons/fa'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { MOTION_TEMPLATES, previewSrc } from '../lib/motionTemplates'

// The public page at "/" for people who aren't signed in (search engines,
// visitors from ads): what Smart Marketing does, shown with the product's
// own template videos. "Log in" / "Start free" open the sign-in screen.
// Only true claims — no made-up ratings, customers, logos or prices.

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

/** The two-flag switch in the header. */
function LangSwitch({ lang, setLang }) {
  return (
    <div className="flex items-center rounded-full border border-ink-200 p-0.5" role="group" aria-label="Language">
      {[
        ['km', FlagKH, 'ខ្មែរ'],
        ['en', FlagGB, 'EN'],
      ].map(([id, Flag, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setLang(id)}
          aria-pressed={lang === id}
          title={id === 'km' ? 'ភាសាខ្មែរ' : 'English'}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold transition-colors ${lang === id ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-900'}`}
        >
          <Flag className="h-3.5 w-5 flex-none overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
          <span className="hidden lg:inline" style={id === 'km' ? km : undefined}>
            {label}
          </span>
        </button>
      ))}
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
    <div className="mx-auto w-full max-w-4xl">
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
    <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
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

// ── the product mocks (drawn here, not screenshots) ──────────────────────
const KIND = { Video: ['Video', 'វីដេអូ'], Image: ['Image', 'រូបភាព'], Text: ['Text', 'អត្ថបទ'] }
const WEEK = [
  { d: ['Mon', 'ច័ន្ទ'], t: '08:00', kind: 'Video', title: 'ហេតុអ្វីអតិថិជនចាកចេញ?', ch: [SiFacebook, SiTiktok] },
  { d: ['Tue', 'អង្គារ'], t: '12:00', kind: 'Image', title: 'ការផ្តល់ជូនពិសេស', ch: [SiFacebook, SiInstagram] },
  { d: ['Wed', 'ពុធ'], t: '08:00', kind: 'Text', title: '៣ គន្លឹះឆ្លើយសារលឿន', ch: [SiFacebook, SiTelegram] },
  { d: ['Thu', 'ព្រហ'], t: '19:00', kind: 'Video', title: 'ពីមុន និង ឥឡូវ', ch: [SiTiktok, SiInstagram] },
  { d: ['Fri', 'សុក្រ'], t: '08:00', kind: 'Image', title: 'ផលិតផលថ្មី', ch: [SiFacebook] },
]

function WeekMock() {
  const t = useT()
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-pop sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-bold text-ink-900">{t('Next week’s plan', 'ផែនការសប្តាហ៍ក្រោយ')}</div>
          <div className="text-[11.5px] text-ink-500">{t('Written by AI · Sunday 6 PM', 'សរសេរដោយ AI · ថ្ងៃអាទិត្យ ម៉ោង ៦ ល្ងាច')}</div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{t('5 of 7 approved', 'យល់ព្រម ៥ ក្នុង ៧')}</span>
      </div>
      <div className="mt-4 space-y-2">
        {WEEK.map((w, i) => (
          <div key={w.d[0]} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-canvas-soft px-3 py-2.5">
            <div className="w-10 flex-none text-center">
              <div className="text-[11px] font-bold text-ink-900">{t(w.d)}</div>
              <div className="font-mono text-[10px] text-ink-400">{w.t}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink-800" style={km}>
                {w.title}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-500">
                <span className="rounded bg-brand-soft px-1.5 py-px font-semibold text-brand">{t(KIND[w.kind])}</span>
                {w.ch.map((C, k) => (
                  <C key={k} size={11} className="text-ink-400" />
                ))}
              </div>
            </div>
            {i < 4 ? (
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-500 text-white">
                <FiCheck size={13} strokeWidth={3} />
              </span>
            ) : (
              <span className="flex-none rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">{t('Approve', 'យល់ព្រម')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CaptionMock() {
  const t = useT()
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-pop">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">M</div>
        <div>
          <div className="text-[13px] font-bold text-ink-900">{t('Your shop', 'ហាងរបស់បង')}</div>
          <div className="text-[11px] text-ink-400">{t('Scheduled', 'កំណត់ពេល')} · Facebook · 08:00</div>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-[1.9] text-ink-800" style={km}>
        ☕ ព្រឹកនេះ ញ៉ាំកាហ្វេជាមួយយើង!
        <br />
        ✅ កាហ្វេដុតថ្មីរាល់ថ្ងៃ
        <br />
        ✅ ទិញ ២ ថែម ១ ដល់ថ្ងៃសុក្រ
        <br />
        📍 ផ្ទះលេខ ១២ ផ្លូវ ២៧១
      </p>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-canvas-soft px-3 py-2.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-brand-soft text-brand">
          <FiMic size={15} />
        </span>
        <div className="flex h-6 flex-1 items-center gap-[3px]">
          {Array.from({ length: 34 }, (_, i) => (
            <span key={i} className="w-[3px] rounded-full bg-brand/70" style={{ height: `${25 + Math.abs(Math.sin(i * 1.7)) * 75}%` }} />
          ))}
        </div>
        <span className="flex-none text-[11px] font-semibold text-ink-500">{t('Khmer voice', 'សំឡេងខ្មែរ')}</span>
      </div>
    </div>
  )
}

function InsightMock() {
  const t = useT()
  const bars = [32, 44, 38, 61, 55, 82, 74]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-pop">
      <div className="text-[13px] font-bold text-ink-900">{t('Engagement · last 7 weeks', 'អន្តរកម្ម · ៧ សប្តាហ៍ចុងក្រោយ')}</div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-lg bg-brand/80" style={{ height: `${h}%`, opacity: 0.45 + i * 0.08 }} />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[
          [t('Morning posts do best for you', 'ប្រកាសពេលព្រឹក ដំណើរការល្អបំផុតសម្រាប់បង'), t('Auto-posts now go out at 08:00', 'ប្រកាសស្វ័យប្រវត្តិ ឥឡូវបង្ហោះម៉ោង 08:00')],
          [t('Short videos get the most shares', 'វីដេអូខ្លី ទទួលបានការចែករំលែកច្រើនជាងគេ'), t('More videos in next week’s plan', 'វីដេអូច្រើនជាងមុន ក្នុងផែនការសប្តាហ៍ក្រោយ')],
        ].map(([a, b]) => (
          <div key={a} className="flex items-start gap-2.5 rounded-xl bg-canvas-soft px-3 py-2.5">
            <FiZap className="mt-0.5 flex-none text-brand" size={14} />
            <div>
              <div className="text-[12.5px] font-semibold text-ink-800">{a}</div>
              <div className="text-[11.5px] text-ink-500">{b}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10.5px] text-ink-400">{t('Example of what the AI learns from your own posts', 'ឧទាហរណ៍នៃអ្វីដែល AI រៀនពីប្រកាសផ្ទាល់របស់បង')}</div>
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

const NAV = [
  ['how', ['How it works', 'របៀបដំណើរការ']],
  ['features', ['Product', 'ផលិតផល']],
  ['videos', ['Videos', 'វីដេអូ']],
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

export default function LandingPage({ onLogin, onStart }) {
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
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
        {/* wide at the top; as the page scrolls it narrows into a compact pill (and back) */}
        {/* frosted glass: the page shows through, softly blurred. The Product panel opens inside it */}
        <nav
          onMouseLeave={() => setMenu(false)}
          className={`mx-auto border border-ink-200/60 px-3 backdrop-blur-xl backdrop-saturate-150 transition-all duration-500 ease-out sm:px-4 ${
            menu ? 'bg-white/90' : 'bg-white/55'
          } ${scrolled && !menu ? 'max-w-[940px] rounded-[1.1rem] shadow-pop' : `max-w-6xl rounded-2xl ${menu ? 'shadow-pop' : 'shadow-card'}`}`}
        >
          <div className={`flex items-center justify-between gap-2 ${scrolled ? 'h-12' : 'h-12 sm:h-[52px]'}`}>
          <a href="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="" className="h-7 w-7 flex-none rounded-lg" />
            {/* narrow phones: the mark alone — the name was cut off next to the buttons */}
            <span className="truncate text-[16px] font-bold text-ink-900 max-[420px]:hidden">Smart Marketing</span>
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
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${menu || section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
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
                  className={`rounded-lg px-3 py-1.5 transition-colors ${section === id ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
                >
                  {t(label)}
                </button>
              ),
            )}
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
          title={t('From empty page to a full week — on autopilot', 'ពីទំព័រទទេ ដល់ប្រកាសពេញមួយសប្តាហ៍ — ដោយស្វ័យប្រវត្តិ')}
          khmer="ភ្ជាប់ម្តង ហើយ AI ធ្វើការងារនៅសល់"
        />
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [FiGlobe, t('Connect your pages', 'ភ្ជាប់ទំព័ររបស់បង'), t('Facebook, Instagram, TikTok, Telegram, LinkedIn — several pages per brand.', 'Facebook, Instagram, TikTok, Telegram, LinkedIn — ច្រើនទំព័រក្នុងមួយម៉ាក។')],
            [FiCalendar, t('AI plans your week', 'AI រៀបចំផែនការសប្តាហ៍'), t('A mix of tips, stories and offers, from what your audience likes.', 'លាយគន្លឹះ រឿង និងការផ្តល់ជូន តាមអ្វីដែលអ្នកមើលចូលចិត្ត។')],
            [FiPenTool, t('AI designs & writes', 'AI រចនា និងសរសេរ'), t('Videos, pictures and Khmer captions in your brand’s colours.', 'វីដេអូ រូបភាព និងចំណងជើងខ្មែរ តាមពណ៌ម៉ាករបស់បង។')],
            [FiCheck, t('You approve — it posts', 'បងយល់ព្រម — វាបង្ហោះ'), t('One tap to approve. It goes out at your best time.', 'ចុចម្តងដើម្បីយល់ព្រម។ វាបង្ហោះនៅម៉ោងល្អបំផុតរបស់បង។')],
          ].map(([Icon, title, d], i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="relative h-full rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition-shadow hover:shadow-card-hover">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon size={20} />
                  </span>
                  <span className="font-mono text-[13px] font-bold text-ink-300">0{i + 1}</span>
                </div>
                <div className="mt-5 text-[16px] font-bold text-ink-900">{title}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{d}</p>
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
            title={t('A whole week of posts, planned for you', 'ប្រកាសពេញមួយសប្តាហ៍ រៀបចំជូនបង')}
            khmer="ផែនការប្រកាសមួយសប្តាហ៍ ដោយ AI"
            text={t(
              'Every Sunday the AI writes next week’s posts — the topics your audience likes, the formats that work, at the times they’re online. Check them on one page, or let daily posts go out on their own.',
              'រៀងរាល់ថ្ងៃអាទិត្យ AI សរសេរប្រកាសសម្រាប់សប្តាហ៍ក្រោយ — ប្រធានបទដែលអ្នកមើលចូលចិត្ត ទម្រង់ដែលដំណើរការ នៅម៉ោងដែលពួកគេអនឡាញ។ ពិនិត្យនៅទំព័រតែមួយ ឬទុកឲ្យប្រកាសប្រចាំថ្ងៃបង្ហោះដោយខ្លួនឯង។',
            )}
            points={[
              t('Your topics, taking turns — not just promotions', 'ប្រធានបទរបស់បង ផ្លាស់វេនគ្នា — មិនមែនតែការផ្សព្វផ្សាយលក់'),
              t('Approve first, or let it post by itself', 'យល់ព្រមមុន ឬទុកឲ្យវាបង្ហោះដោយខ្លួនឯង'),
              t('Best posting time learned from your own results', 'ម៉ោងបង្ហោះល្អបំផុត រៀនពីលទ្ធផលផ្ទាល់របស់បង'),
            ]}
            visual={<WeekMock />}
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            flip
            eyebrow={t('Khmer first', 'ខ្មែរជាមុន')}
            title={t('Captions and voices that sound like you', 'ចំណងជើង និងសំឡេង ដូចបងផ្ទាល់')}
            khmer="សរសេរ និងនិយាយភាសាខ្មែរ ដូចបងផ្ទាល់"
            text={t(
              'The AI learns your style from captions you liked, writes in Khmer, English, or both, and reads your videos with a natural Khmer voice — or your brand’s own voice.',
              'AI រៀនរចនាប័ទ្មរបស់បង ពីចំណងជើងដែលបងចូលចិត្ត សរសេរជាខ្មែរ អង់គ្លេស ឬទាំងពីរ ហើយអានវីដេអូដោយសំឡេងខ្មែរធម្មជាតិ — ឬសំឡេងផ្ទាល់របស់ម៉ាកបង។',
            )}
            points={[
              t('Khmer, English, or Khmer then English', 'ខ្មែរ អង់គ្លេស ឬខ្មែររួចអង់គ្លេស'),
              t('Natural Khmer voices with word-by-word subtitles', 'សំឡេងខ្មែរធម្មជាតិ មានអក្សររត់តាមពាក្យនីមួយៗ'),
              t('Brand names said the way you say them', 'ឈ្មោះម៉ាក អានតាមរបៀបដែលបងនិយាយ'),
            ]}
            visual={<CaptionMock />}
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            eyebrow={t('Learns from results', 'រៀនពីលទ្ធផល')}
            title={t('Gets better every week', 'កាន់តែប្រសើររៀងរាល់សប្តាហ៍')}
            khmer="រៀនពីលទ្ធផលរបស់បង"
            text={t(
              'Every post reports its numbers — even the ones you posted yourself. The AI reads what your audience likes and does more of it: the best time, the best format, the best topics.',
              'គ្រប់ប្រកាសរាយការណ៍លេខរបស់វា — សូម្បីតែប្រកាសដែលបងបង្ហោះដោយខ្លួនឯង។ AI អានអ្វីដែលអ្នកមើលចូលចិត្ត ហើយធ្វើវាឲ្យកាន់តែច្រើន៖ ម៉ោងល្អបំផុត ទម្រង់ល្អបំផុត ប្រធានបទល្អបំផុត។',
            )}
            points={[
              t('Numbers for every post, on every page', 'លេខសម្រាប់គ្រប់ប្រកាស លើគ្រប់ទំព័រ'),
              t('Plain-language lessons, not dashboards to decode', 'មេរៀនជាភាសាងាយយល់ មិនមែនផ្ទាំងទិន្នន័យពិបាកអាន'),
              t('The next plan follows what worked', 'ផែនការបន្ទាប់ធ្វើតាមអ្វីដែលដំណើរការ'),
            ]}
            visual={<InsightMock />}
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
          className="lp-strip mt-14 overflow-hidden pb-4"
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

      {/* ── everything else ── */}
      <section id="more" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle
          eyebrow={t('And more', 'និងច្រើនទៀត')}
          title={t('Everything your marketing needs, in one place', 'អ្វីៗដែលទីផ្សាររបស់បងត្រូវការ នៅកន្លែងតែមួយ')}
          khmer="គ្រប់យ៉ាងនៅកន្លែងតែមួយ"
        />
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MORE.map(({ Icon, title, text }, i) => (
            <Reveal key={title[0]} delay={(i % 3) * 100}>
              <div className="group h-full rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <Icon size={20} />
                </span>
                <div className="mt-5 text-[16px] font-bold text-ink-900">{t(title)}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{t(text)}</p>
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

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle eyebrow={t('FAQ', 'សំណួរញឹកញាប់')} title={t('Questions people ask', 'សំណួរដែលគេតែងសួរ')} />
        <div className="mt-12">
          <Faq />
        </div>
      </section>

      {/* ── final call ── */}
      <section className="px-4 py-20 sm:px-6">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10" />
          <h2 className="relative text-[30px] font-bold leading-snug text-white sm:text-[40px]" style={km}>
            <span className="whitespace-nowrap">ចាប់ផ្តើមថ្ងៃនេះ</span> — <span className="whitespace-nowrap">AI ធ្វើការ</span> <span className="whitespace-nowrap">បងសម្រាក</span>
          </h2>
          <p className="relative mx-auto mt-3 max-w-lg text-[16px] text-white/85">
            {t('Set up your brand in minutes. Your first week of posts is one click away.', 'រៀបចំម៉ាករបស់បងក្នុងប៉ុន្មាននាទី។ ប្រកាសសប្តាហ៍ដំបូង នៅសល់តែមួយចុចប៉ុណ្ណោះ។')}
          </p>
          <button type="button" onClick={onStart} className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-brand transition-transform hover:-translate-y-0.5">
            {t('Start free', 'ចាប់ផ្តើមឥតគិតថ្លៃ')} <FiArrowRight />
          </button>
        </div>
      </section>

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
