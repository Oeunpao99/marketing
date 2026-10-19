import { useEffect, useRef, useState } from 'react'
import {
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiCpu,
  FiGlobe,
  FiImage,
  FiMessageCircle,
  FiMic,
  FiPenTool,
  FiPlay,
  FiShield,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { FaLinkedin } from 'react-icons/fa'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { MOTION_TEMPLATES, previewSrc } from '../lib/motionTemplates'

// The public page at "/" for people who aren't signed in (search engines,
// visitors from ads): what Smart Marketing does, shown with the product's
// own template videos. "Log in" / "Start free" open the sign-in screen.
// Only true claims — no made-up ratings, customers, logos or prices.

const KHMER_FONT = 'https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;500;700&display=swap'
const km = { fontFamily: '"Kantumruy Pro", "Khmer OS Siemreap", sans-serif' }

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
  return (
    // the tilt goes on the inner frame: on the figure it overrode the position classes (-translate-x-1/2)
    <figure className={className || 'relative'}>
      <div className="relative aspect-[9/19] overflow-hidden rounded-[2.2rem] border-[6px] border-night-950 bg-night-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]" style={{ transform: `rotate(${tilt}deg)` }}>
        <video
          src={previewSrc(id, 'mp4')}
          poster={previewSrc(id)}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-night-950" />
      </div>
      {label && <figcaption className="mt-3 text-center text-[12.5px] font-semibold text-ink-700">{label}</figcaption>}
    </figure>
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

function Eyebrow({ children }) {
  return <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">{children}</div>
}

function SectionTitle({ eyebrow, title, khmer, sub }) {
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
const WEEK = [
  { d: 'Mon', t: '08:00', kind: 'Video', title: 'ហេតុអ្វីអតិថិជនចាកចេញ?', ch: [SiFacebook, SiTiktok] },
  { d: 'Tue', t: '12:00', kind: 'Image', title: 'ការផ្តល់ជូនពិសេស', ch: [SiFacebook, SiInstagram] },
  { d: 'Wed', t: '08:00', kind: 'Text', title: '៣ គន្លឹះឆ្លើយសារលឿន', ch: [SiFacebook, SiTelegram] },
  { d: 'Thu', t: '19:00', kind: 'Video', title: 'ពីមុន និង ឥឡូវ', ch: [SiTiktok, SiInstagram] },
  { d: 'Fri', t: '08:00', kind: 'Image', title: 'ផលិតផលថ្មី', ch: [SiFacebook] },
]

function WeekMock() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-pop sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-bold text-ink-900">Next week’s plan</div>
          <div className="text-[11.5px] text-ink-500">Written by AI · Sunday 6 PM</div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">5 of 7 approved</span>
      </div>
      <div className="mt-4 space-y-2">
        {WEEK.map((w, i) => (
          <div key={w.d} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-canvas-soft px-3 py-2.5">
            <div className="w-9 flex-none text-center">
              <div className="text-[11px] font-bold text-ink-900">{w.d}</div>
              <div className="font-mono text-[10px] text-ink-400">{w.t}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink-800" style={km}>
                {w.title}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-500">
                <span className="rounded bg-brand-soft px-1.5 py-px font-semibold text-brand">{w.kind}</span>
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
              <span className="flex-none rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">Approve</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CaptionMock() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-pop">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">M</div>
        <div>
          <div className="text-[13px] font-bold text-ink-900">Your shop</div>
          <div className="text-[11px] text-ink-400">Scheduled · Facebook · 08:00</div>
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
        <span className="flex-none text-[11px] font-semibold text-ink-500">Khmer voice</span>
      </div>
    </div>
  )
}

function InsightMock() {
  const bars = [32, 44, 38, 61, 55, 82, 74]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-pop">
      <div className="text-[13px] font-bold text-ink-900">Engagement · last 7 weeks</div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-lg bg-brand/80" style={{ height: `${h}%`, opacity: 0.45 + i * 0.08 }} />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[
          ['Morning posts do best for you', 'Auto-posts now go out at 08:00'],
          ['Short videos get the most shares', 'More videos in next week’s plan'],
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
      <div className="mt-3 text-[10.5px] text-ink-400">Example of what the AI learns from your own posts</div>
    </div>
  )
}

function Feature({ eyebrow, title, khmer, text, points, visual, flip = false }) {
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
  { Icon: FiMessageCircle, title: 'Leads & hand-off', text: 'Messages from your pages and chatbot land in one list, routed to the right person on your team.' },
  { Icon: FiGlobe, title: 'Website check', text: 'Health, SEO, speed, share previews and domain email — with AI fixes and a weekly alert.' },
  { Icon: FiPenTool, title: 'Brand kit', text: 'Your logo, products and screenshots. Your colours are read from your logo and used in every design.' },
  { Icon: FiImage, title: 'Posters & memes in Khmer', text: 'Pictures with real Khmer text drawn correctly — never the scrambled letters image AI makes.' },
  { Icon: FiCpu, title: 'Pick your AI', text: 'Choose the model that writes for you — Claude, GPT or Gemini — and see what each costs.' },
  { Icon: FiUsers, title: 'Team & workspaces', text: 'Invite your team with their own access. Each business has its own private workspace.' },
]

const FAQ = [
  ['Does it write in Khmer?', 'Yes — captions, video scripts, subtitles and the voice are made for Khmer first, and English when you want it. You can also post Khmer first, then English, in one post.'],
  ['Do I have to post everything myself?', 'No. Connect your pages once; the AI plans the week, designs and writes the posts, and posts them at your best time. You choose whether to approve each post first.'],
  ['Which platforms can it post to?', 'Facebook Pages, Instagram, TikTok, Telegram channels and LinkedIn — several pages per platform for each brand.'],
  ['How do the AI costs work?', 'Every workspace has AI credit for writing, pictures, voices and videos. You see what each thing costs, and nothing runs once the credit is used up.'],
  ['Can I use my own voice for videos?', 'Yes — pick one of the Khmer voices, or set up your brand’s own voice, so your videos sound like you.'],
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <div className="mx-auto max-w-3xl divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
      {FAQ.map(([q, a], i) => (
        <div key={q}>
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
      ))}
    </div>
  )
}

export default function LandingPage({ onLogin, onStart }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!document.querySelector(`link[href="${KHMER_FONT}"]`)) {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = KHMER_FONT
      document.head.appendChild(l)
    }
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const byId = Object.fromEntries(MOTION_TEMPLATES.map((t) => [t.id, t]))
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink-900">
      {/* ── nav ── */}
      <header className={`fixed inset-x-0 top-0 z-30 transition-all duration-300 ${scrolled ? 'bg-white/95 shadow-card' : 'bg-transparent'}`}>
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="" className="h-8 w-8 flex-none rounded-lg" />
            <span className={`truncate text-[16px] font-bold ${scrolled ? 'text-ink-900' : 'text-white'}`}>
              Smart Marketing
            </span>
          </a>
          <div className={`hidden items-center gap-7 text-[14px] font-medium md:flex ${scrolled ? 'text-ink-600' : 'text-white/80'}`}>
            {[
              ['how', 'How it works'],
              ['features', 'Features'],
              ['videos', 'Videos'],
              ['faq', 'FAQ'],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => go(id)} className="transition-colors hover:text-brand">
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-none items-center gap-2">
            <button type="button" onClick={onLogin} className={`rounded-xl px-3.5 py-2 text-[14px] font-semibold transition-colors ${scrolled ? 'text-ink-700 hover:bg-ink-50' : 'text-white hover:bg-white/10'}`}>
              Log in
            </button>
            <button type="button" onClick={onStart} className="rounded-xl bg-brand px-4 py-2 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-px">
              Start free
            </button>
          </div>
        </nav>
      </header>

      {/* ── hero ── */}
      <section className="relative overflow-hidden bg-night-950 pb-20 pt-32 sm:pb-28 sm:pt-40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-brand/25 blur-[120px]" />
          <div className="absolute -right-32 bottom-0 h-[460px] w-[460px] rounded-full bg-violet-500/20 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }}
          />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12.5px] font-medium text-white/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Your AI marketing team — made for Khmer businesses
            </div>
            <h1 className="mt-6 text-[38px] font-bold leading-[1.25] text-white sm:text-[54px]" style={km}>
              ទីផ្សារ​ឆ្លាតវៃ <span className="text-brand-light">ធ្វើការជំនួសបង</span> រាល់ថ្ងៃ
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/70 lg:mx-0">
              Connect your pages once. The AI plans your week, designs the videos and pictures, writes the captions in Khmer — and posts at your best time. You just approve.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button type="button" onClick={onStart} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-0.5 sm:w-auto">
                Start free <FiArrowRight />
              </button>
              <button type="button" onClick={() => go('videos')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto">
                <FiPlay /> See the videos
              </button>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
              <span className="text-[12.5px] text-white/50">Posts to</span>
              {CHANNELS.map(({ Icon, name }) => (
                <Icon key={name} size={20} className="text-white/70" title={name} />
              ))}
            </div>
          </div>

          {/* three phones, each playing a real template */}
          <div className="relative mx-auto h-[460px] w-full max-w-[460px] sm:h-[540px]">
            <Phone id="reaction" className="absolute left-0 top-12 w-[38%]" tilt={-8} />
            <Phone id="studio" className="absolute left-1/2 top-0 z-10 w-[44%] -translate-x-1/2" />
            <Phone id="doodle" className="absolute right-0 top-12 w-[38%]" tilt={8} />
            <div className="absolute -left-2 bottom-6 z-20 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop sm:-left-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white">
                <FiCheck strokeWidth={3} />
              </span>
              <div className="text-left">
                <div className="text-[12.5px] font-bold text-ink-900">Posted to 3 pages</div>
                <div className="text-[11px] text-ink-500">Today · 08:00</div>
              </div>
            </div>
            <div className="absolute -right-1 bottom-24 z-20 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop sm:-right-4">
              <FiCalendar className="text-brand" />
              <div className="text-[12.5px] font-bold text-ink-900">Next week: planned</div>
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
        <SectionTitle eyebrow="How it works" title="From empty page to a full week — on autopilot" khmer="ភ្ជាប់ម្តង ហើយ AI ធ្វើការងារនៅសល់" />
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [FiGlobe, 'Connect your pages', 'Facebook, Instagram, TikTok, Telegram, LinkedIn — several pages per brand.'],
            [FiCalendar, 'AI plans your week', 'A mix of tips, stories and offers, from what your audience likes.'],
            [FiPenTool, 'AI designs & writes', 'Videos, pictures and Khmer captions in your brand’s colours.'],
            [FiCheck, 'You approve — it posts', 'One tap to approve. It goes out at your best time.'],
          ].map(([Icon, t, d], i) => (
            <Reveal key={t} delay={i * 100}>
              <div className="relative h-full rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition-shadow hover:shadow-card-hover">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon size={20} />
                  </span>
                  <span className="font-mono text-[13px] font-bold text-ink-300">0{i + 1}</span>
                </div>
                <div className="mt-5 text-[16px] font-bold text-ink-900">{t}</div>
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
            eyebrow="Autopilot"
            title="A whole week of posts, planned for you"
            khmer="ផែនការប្រកាសមួយសប្តាហ៍ ដោយ AI"
            text="Every Sunday the AI writes next week’s posts — the topics your audience likes, the formats that work, at the times they’re online. Check them on one page, or let daily posts go out on their own."
            points={['Your topics, taking turns — not just promotions', 'Approve first, or let it post by itself', 'Best posting time learned from your own results']}
            visual={<WeekMock />}
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            flip
            eyebrow="Khmer first"
            title="Captions and voices that sound like you"
            khmer="សរសេរ និងនិយាយភាសាខ្មែរ ដូចបងផ្ទាល់"
            text="The AI learns your style from captions you liked, writes in Khmer, English, or both, and reads your videos with a natural Khmer voice — or your brand’s own voice."
            points={['Khmer, English, or Khmer then English', 'Natural Khmer voices with word-by-word subtitles', 'Brand names said the way you say them']}
            visual={<CaptionMock />}
          />
        </div>
        <div className="mx-auto max-w-6xl">
          <Feature
            eyebrow="Learns from results"
            title="Gets better every week"
            khmer="រៀនពីលទ្ធផលរបស់បង"
            text="Every post reports its numbers — even the ones you posted yourself. The AI reads what your audience likes and does more of it: the best time, the best format, the best topics."
            points={['Numbers for every post, on every page', 'Plain-language lessons, not dashboards to decode', 'The next plan follows what worked']}
            visual={<InsightMock />}
          />
        </div>
      </section>

      {/* ── videos ── */}
      <section id="videos" className="scroll-mt-20 overflow-hidden bg-night-950 py-20 sm:py-28">
        <div className="px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-light">Video studio</div>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[38px]">Videos people stop scrolling for</h2>
            <p className="mt-2 text-[17px] font-medium text-white/70" style={km}>
              វីដេអូខ្មែរ ដែលមនុស្សឈប់មើល
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-white/55">
              {MOTION_TEMPLATES.length}+ animated templates — memes, stories, lessons, product launches — or let the AI design every scene for your brief. Your colours, your logo, a Khmer voice and subtitles.
            </p>
          </div>
        </div>
        <div className="mt-14 flex gap-5 overflow-x-auto px-4 pb-4 sm:gap-7 sm:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SHOWCASE.filter((id) => byId[id]).map((id) => (
            <div key={id} className="w-[170px] flex-none sm:w-[210px]">
              <Phone id={id} />
              <div className="mt-3 text-center text-[13px] font-semibold text-white">{byId[id].name}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <button type="button" onClick={onStart} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-night-950 transition-transform hover:-translate-y-0.5">
            Make your first video <FiArrowRight />
          </button>
        </div>
      </section>

      {/* ── everything else ── */}
      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle eyebrow="And more" title="Everything your marketing needs, in one place" khmer="គ្រប់យ៉ាងនៅកន្លែងតែមួយ" />
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MORE.map(({ Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 100}>
              <div className="group h-full rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <Icon size={20} />
                </span>
                <div className="mt-5 text-[16px] font-bold text-ink-900">{title}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13.5px] text-ink-500">
          <span className="inline-flex items-center gap-2">
            <FiShield className="text-brand" /> Your workspace is private to your team
          </span>
          <span className="inline-flex items-center gap-2">
            <FiBarChart2 className="text-brand" /> See what every AI task costs
          </span>
          <span className="inline-flex items-center gap-2">
            <FiCheck className="text-brand" /> Nothing posts without your rules
          </span>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 sm:py-28">
        <SectionTitle eyebrow="FAQ" title="Questions people ask" />
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
          <p className="relative mx-auto mt-3 max-w-lg text-[16px] text-white/85">Set up your brand in minutes. Your first week of posts is one click away.</p>
          <button type="button" onClick={onStart} className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-brand transition-transform hover:-translate-y-0.5">
            Start free <FiArrowRight />
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
              Privacy
            </a>
            <a href="/terms" className="hover:text-brand">
              Terms
            </a>
            <button type="button" onClick={onLogin} className="hover:text-brand">
              Log in
            </button>
          </div>
          <div className="text-[12.5px] text-ink-400">© {new Date().getFullYear()} Smart Marketing</div>
        </div>
      </footer>
    </div>
  )
}
