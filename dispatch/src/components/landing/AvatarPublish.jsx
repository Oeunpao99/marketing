import { useEffect, useState } from 'react'
import { FaLinkedin } from 'react-icons/fa'
import { FiCheck, FiZap } from 'react-icons/fi'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'
import { previewSrc } from '../../lib/motionTemplates'
import LiveAvatar from '../ui/LiveAvatar'

// How Smart Marketing works, acted out by our robot at a laptop — the real flow:
//   ① your brand and products  ② the AI prepares the plan  ③ "Make for me": the AI reads your
//   settings and writes the story → the voice-over → the animation & drawings → done
//   ④ pick your pages and post (the logos pop out of the robot's phone)  ⑤ the real insights.
// A loop of ~16 s on a small timeline; with reduced motion it rests on the insights.

const T = { brand: 0, plan: 2600, make: 4800, steps: 5600, pages: 9400, post: 10600, insights: 12600, end: 16000 }
const VIDEO = 'productfx' // the clip the laptop "makes"
const STEPS = [
  ['Writing the story', 'កំពុងសរសេររឿង'],
  ['Voice-over', 'បញ្ចូលសំឡេង'],
  ['Animation & drawings', 'ចលនា និងគំនូរ'],
  ['Done', 'រួចរាល់'],
]
const PAGES = [
  { Icon: SiFacebook, color: '#1877F2', name: 'Facebook', x: -232, y: -40 },
  { Icon: SiTiktok, color: '#111827', name: 'TikTok', x: -204, y: -108 },
  { Icon: SiYoutube, color: '#FF0000', name: 'YouTube', x: -150, y: -158 },
  { Icon: SiInstagram, color: '#E4405F', name: 'Instagram', x: -80, y: -186 },
  { Icon: SiTelegram, color: '#229ED9', name: 'Telegram', x: -2, y: -194 },
  { Icon: FaLinkedin, color: '#0A66C2', name: 'LinkedIn', x: 70, y: -168 },
]
const DAYS = [['Mon', 'ច'], ['Tue', 'អ'], ['Wed', 'ពុ'], ['Thu', 'ព្រ'], ['Fri', 'សុ'], ['Sat', 'ស'], ['Sun', 'អា']]
const KINDS = ['video', 'image', 'video', 'text', 'video', 'image', 'video']

function useLoop(still) {
  const [ms, setMs] = useState(still ? T.end - 1 : 0)
  useEffect(() => {
    if (still) return undefined
    const start = performance.now()
    let raf
    const tick = (now) => {
      setMs((now - start) % T.end)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [still])
  return ms
}

const typed = (text, from, ms, per = 45) => [...text].slice(0, Math.max(0, Math.floor((ms - from) / per))).join('')

export default function AvatarPublish({ t }) {
  const [still] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const ms = useLoop(still)
  const stage = ms >= T.insights ? 5 : ms >= T.pages ? 4 : ms >= T.make ? 3 : ms >= T.plan ? 2 : 1
  const stepDone = (i) => ms >= T.steps + (i + 1) * 900 // each making step ticks in turn
  const pageOn = (i) => ms >= T.pages + 250 + i * 160
  const popped = (i) => ms >= T.post + i * 260
  const bar = (i) => Math.min(1, Math.max(0, (ms - T.insights - i * 120) / 700))

  const flow = [
    t('Add your brand and products — once.', 'បញ្ចូលម៉ាក និងផលិតផលរបស់បង — តែម្តង។'),
    t('The AI prepares your plan for the week.', 'AI រៀបចំផែនការប្រចាំសប្តាហ៍ជូនបង។'),
    t('Or press “Make for me”: it reads your settings and writes the story, the voice-over, the animation — done.', 'ឬចុច “ធ្វើឲ្យខ្ញុំ”៖ វាអានការកំណត់របស់បង ហើយសរសេររឿង បញ្ចូលសំឡេង ធ្វើចលនា — រួចរាល់។'),
    t('Pick your pages and post — Facebook, TikTok, YouTube, Telegram and more.', 'ជ្រើសទំព័រ ហើយបង្ហោះ — Facebook, TikTok, YouTube, Telegram និងច្រើនទៀត។'),
    t('See the real results: views, likes and the leads each post brought.', 'មើលលទ្ធផលពិត៖ ចំនួនមើល ចូលចិត្ត និងអតិថិជនដែលប្រកាសនីមួយៗនាំមក។'),
  ]

  return (
    <div className="relative mx-auto mt-10 max-w-6xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">{t('From your brand to real results', 'ពីម៉ាករបស់បង ដល់លទ្ធផលពិត')}</div>
          <h3 className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]">
            {t('Your brand in. Videos made. Posted. Results back.', 'បញ្ចូលម៉ាក។ វីដេអូរួច។ បង្ហោះ។ ឃើញលទ្ធផល។')}
          </h3>
          <ol className="mt-5 space-y-3 text-[14.5px] text-ink-600">
            {flow.map((text, i) => {
              const on = stage === i + 1
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-bold transition-colors duration-300 ${on ? 'bg-brand text-white' : stage > i + 1 ? 'bg-emerald-500 text-white' : 'bg-brand-soft text-brand'}`}>
                    {stage > i + 1 ? <FiCheck size={13} /> : i + 1}
                  </span>
                  <span className={`pt-0.5 transition-colors duration-300 ${on ? 'font-semibold text-ink-900' : ''}`}>{text}</span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* the scene: the laptop, the robot, its phone and the logos */}
        <div className="relative mx-auto h-[380px] w-full max-w-[560px]" aria-hidden="true">
          <div className="absolute bottom-6 left-0 w-[66%]">
            <div className="rounded-t-xl border-[6px] border-night-900 bg-white dark:border-night-700">
              <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-1.5">
                <img src="/brand/logo-mark.png" alt="" className="h-3.5 w-3.5 object-contain" />
                <span className="text-[9.5px] font-bold text-ink-800">Smart Marketing</span>
                <span data-stage className="ml-auto text-[8.5px] font-semibold text-ink-400">
                  {[t('Brand', 'ម៉ាក'), t('Plan', 'ផែនការ'), t('Make', 'ធ្វើ'), t('Post', 'បង្ហោះ'), t('Insights', 'លទ្ធផល')][stage - 1]}
                </span>
              </div>
              <div className="relative aspect-[16/10] overflow-hidden p-2.5 text-[9.5px]">
                {stage === 1 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 rounded-lg border border-ink-200 px-2 py-1.5">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-100 text-[11px]">☕</span>
                      <span>
                        <span className="block text-[8px] text-ink-400">{t('Brand', 'ម៉ាក')}</span>
                        <b className="text-ink-900">{typed('Kofi House', 200, ms)}</b>
                      </span>
                    </div>
                    <div className="rounded-lg border border-ink-200 px-2 py-1.5">
                      <span className="block text-[8px] text-ink-400">{t('Product', 'ផលិតផល')}</span>
                      <b className="text-ink-900">{typed('Iced latte · $2.50', 900, ms)}</b>
                    </div>
                    <div className="rounded-lg border border-ink-200 px-2 py-1.5 text-ink-600">{typed(t('Mondulkiri beans, fresh milk, less sugar', 'គ្រាប់កាហ្វេមណ្ឌលគិរី ទឹកដោះគោស្រស់ ស្ករតិច'), 1700, ms, 22)}</div>
                  </div>
                )}
                {stage === 2 && (
                  <div>
                    <div className="mb-1.5 font-bold text-ink-900">{t('This week’s plan — by AI', 'ផែនការសប្តាហ៍នេះ — ដោយ AI')}</div>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((d, i) => (
                        <div key={i} className="text-center">
                          <div className="text-[7.5px] font-semibold text-ink-400">{t(d)}</div>
                          <div
                            className={`mt-0.5 rounded-md px-0.5 py-2 text-[7px] font-bold transition-all duration-300 ${KINDS[i] === 'video' ? 'bg-brand-soft text-brand' : KINDS[i] === 'image' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600'}`}
                            style={{ opacity: ms >= T.plan + 150 + i * 180 ? 1 : 0, transform: `translateY(${ms >= T.plan + 150 + i * 180 ? 0 : 6}px)` }}
                          >
                            {KINDS[i] === 'video' ? '▶' : KINDS[i] === 'image' ? '▣' : 'Aa'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-md bg-canvas px-2 py-1 text-ink-600">{t('7 posts · best time 7:30 PM', 'ប្រកាស ៧ · ម៉ោងល្អបំផុត ៧:៣០ យប់')}</div>
                  </div>
                )}
                {stage === 3 && (
                  <div className="flex h-full gap-2.5">
                    <div className="min-w-0 flex-1">
                      {/* the one button */}
                      <div className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold text-white transition-all duration-200 ${ms < T.steps ? 'bg-brand' : 'bg-brand/70'}`} style={{ transform: ms >= T.make + 500 && ms < T.make + 700 ? 'scale(0.92)' : 'scale(1)' }}>
                        <FiZap size={9} /> {t('Make for me', 'ធ្វើឲ្យខ្ញុំ')}
                      </div>
                      {ms >= T.steps && (
                        <ul className="mt-2 space-y-1">
                          {STEPS.map((s, i) => {
                            const done = stepDone(i)
                            const now = !done && (i === 0 || stepDone(i - 1))
                            return (
                              <li key={i} className={`flex items-center gap-1.5 ${done ? 'text-ink-800' : now ? 'font-semibold text-brand' : 'text-ink-300'}`}>
                                <span className={`grid h-3.5 w-3.5 place-items-center rounded-full ${done ? 'bg-emerald-500 text-white' : now ? 'animate-spin border-2 border-brand border-t-transparent' : 'border border-ink-200'}`}>
                                  {done && <FiCheck size={8} strokeWidth={4} />}
                                </span>
                                {t(s)}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                    {stepDone(2) && (
                      <div className="relative h-full aspect-[9/16] overflow-hidden rounded-md bg-night-900">
                        <video src={previewSrc(VIDEO, 'mp4')} poster={previewSrc(VIDEO)} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                )}
                {stage === 4 && (
                  <div>
                    <div className="mb-1.5 font-bold text-ink-900">{t('Post to', 'បង្ហោះទៅ')}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {PAGES.map(({ Icon, color, name }, i) => (
                        <div key={name} className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors ${pageOn(i) ? 'border-brand-line bg-brand-soft' : 'border-ink-200'}`}>
                          <span className={`grid h-3 w-3 place-items-center rounded-[3px] ${pageOn(i) ? 'bg-brand text-white' : 'border border-ink-300'}`}>{pageOn(i) && <FiCheck size={7} strokeWidth={4} />}</span>
                          <Icon size={10} style={{ color }} />
                          <span className="truncate text-ink-700">{name}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-2 inline-block rounded-md px-2 py-1 font-bold text-white transition-colors ${ms >= T.post ? 'bg-emerald-600' : 'bg-brand'}`}>
                      {ms >= T.post ? t('Posted to 6 pages ✓', 'បានបង្ហោះ ៦ ទំព័រ ✓') : t('Post now', 'បង្ហោះឥឡូវ')}
                    </div>
                  </div>
                )}
                {stage === 5 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between font-bold text-ink-900">
                      {t('Insights · this week', 'លទ្ធផល · សប្តាហ៍នេះ')}
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700">▲ 38%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        [t('Views', 'ចំនួនមើល'), '12.4K'],
                        [t('Likes', 'ចូលចិត្ត'), '1,280'],
                        [t('Leads', 'អតិថិជន'), '18'],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-md bg-canvas px-1.5 py-1">
                          <div className="text-[7.5px] text-ink-400">{k}</div>
                          <div className="text-[11px] font-bold tabular-nums text-ink-900">{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex h-[46px] items-end gap-1">
                      {[0.35, 0.5, 0.42, 0.7, 0.62, 0.86, 1].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t-[3px] bg-brand" style={{ height: `${h * bar(i) * 100}%` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mx-auto h-2.5 w-[112%] -translate-x-[5%] rounded-b-xl bg-night-800 dark:bg-night-600" />
          </div>

          {/* the robot: working while it makes, its phone up when it posts — the logos come out of the phone */}
          <div className="absolute bottom-4 right-[4%] z-20 flex flex-col items-center">
            <div className="relative">
              <div
                className="absolute -top-2 left-1/2 z-10 h-[58px] w-[32px] rounded-[8px] border-[3px] border-night-900 bg-night-800 shadow-lg transition-all duration-500"
                style={{ opacity: stage === 4 ? 1 : 0, transform: `translate(-50%, ${stage === 4 ? -30 : 10}px)` }}
              >
                {stage === 4 && <video src={previewSrc(VIDEO, 'mp4')} autoPlay muted loop playsInline className="h-full w-full rounded-[4px] object-cover" />}
                {PAGES.map(({ Icon, color, name, x, y }, i) => (
                  <span
                    key={name}
                    className="absolute left-1/2 top-1/2 grid h-10 w-10 place-items-center rounded-full bg-white shadow-card ring-1 ring-black/5"
                    style={{
                      color,
                      opacity: stage === 4 && popped(i) ? 1 : 0,
                      transform: stage === 4 && popped(i) ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)` : 'translate(-50%, -50%) scale(0.2)',
                      transition: 'transform 520ms cubic-bezier(.34,1.56,.64,1), opacity 300ms',
                    }}
                  >
                    <Icon size={19} />
                    <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white" style={{ opacity: ms >= T.post + 400 + i * 260 ? 1 : 0, transition: 'opacity 200ms' }}>
                      <FiCheck size={9} strokeWidth={4} />
                    </span>
                  </span>
                ))}
              </div>
              <LiveAvatar size={150} wave={stage === 4 || stage === 5} thinking={stage === 2 || stage === 3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
