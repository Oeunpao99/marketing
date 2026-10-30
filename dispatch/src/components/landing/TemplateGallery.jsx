import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowRight, FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiPlay, FiUsers, FiX } from 'react-icons/fi'
import { previewSrc } from '../../lib/motionTemplates'

// The website's template gallery — every template, the 3 most used first, then newest to oldest: the clips themselves (no
// phone frame) in a masonry (tall 9:16 and wide 16:9, each its clip's own shape), playing while on screen. A row of category
// buttons filters them; hover shows "Preview" and how many videos were made with it; a click
// opens a preview (the clip big, what it's for, its scenes) with "Use this template".

const FOLDED = 1040 // px of the gallery shown before "See more templates"
const WIDE = new Set(['cartoon', 'lesson', 'neural']) // public/templates/<id>-wide.mp4

// the website's categories — a template can be in more than one
const CATEGORIES = [
  ['all', ['All', 'ទាំងអស់']],
  ['saas', ['SaaS & apps', 'SaaS និងកម្មវិធី'], ['skylaunch', 'saashub', 'clarity', 'aiteam', 'appdemo', 'custom', 'techflow', 'gridcards', 'fintech', 'launch']],
  ['product', ['Product demo', 'បង្ហាញផលិតផល'], ['logodraw', 'productfx', 'demo', 'sell', 'offer', 'launch', 'unveil', 'showcase', 'spotlight', 'appdemo', 'studio']],
  ['3d', ['3D animation', 'ចលនា 3D'], ['spotlight', 'appdemo', 'street3d', 'fintech', 'skylaunch']],
  ['story', ['Stories & characters', 'រឿង និងតួអង្គ'], ['cartoon', 'parable', 'dialogue', 'podcast', 'picture', 'stickman', 'illustrated', 'presenter', 'rise']],
  ['teach', ['Teach & explain', 'បង្រៀន និងពន្យល់'], ['teach', 'training', 'lesson', 'neural', 'paper', 'doodle', 'deck', 'faq', 'tips', 'techflow', 'stickman']],
  ['social', ['Social & trends', 'សង្គម និងនិន្នាការ'], ['reaction', 'pov', 'trend', 'hottake', 'poll', 'thisorthat', 'countdown', 'quote', 'studio']],
  ['proof', ['Reviews & results', 'មតិ និងលទ្ធផល'], ['report', 'casestudy', 'reviews', 'testimonial', 'versus']],
]

/** A card the shape of its own clip — 9:16, or 16:9 for a wide one (the owner's choice, 2026-10-29:
 *  two shapes, each video filling its frame exactly; no cropping, no blurred sides). */
const RATIOS = { tall: 9 / 16, wide: 16 / 9 }
const clipIsWide = (id) => WIDE.has(id) || id === 'deck' // these clips are 16:9

function Frame({ shape, className = '', children }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: RATIOS[shape] }}>
      {children}
    </div>
  )
}

function Clip({ src, poster, autoPlay = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const v = ref.current
    if (!v || autoPlay) return undefined
    // plays only while on screen — the gallery has every template
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.2 })
    io.observe(v)
    return () => io.disconnect()
  }, [autoPlay])
  return <video ref={ref} src={src} poster={poster} preload={autoPlay ? 'auto' : 'none'} autoPlay={autoPlay} muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
}

/** 2 columns on a phone, 3 on a tablet, 4 on a laptop — the gallery's columns. */
function useCols() {
  const get = () => (typeof window === 'undefined' ? 4 : window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2)
  const [n, setN] = useState(get)
  useEffect(() => {
    const on = () => setN(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}

function UsedBy({ n, fresh, t, num }) {
  return n > 0
    ? t(`${n.toLocaleString('en-US')} video${n === 1 ? '' : 's'} made`, `វីដេអូ ${num(n)} ត្រូវបានធ្វើ`)
    : fresh
      ? t('Just released — be the first', 'ទើបចេញ — ក្លាយជាអ្នកដំបូង')
      : t('Ready to use', 'ត្រៀមប្រើ')
}

/** One template, big: the clip, what it's for, its scenes, and "Use this template". A plain
 *  dim backdrop and a solid panel; ← → step through the filtered list, Esc closes. */
function Preview({ list, at, setAt, usedBy, isNew, t, num, onUse }) {
  const tp = list[at]
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') setAt(null)
      if (e.key === 'ArrowRight') setAt((i) => (i + 1) % list.length)
      if (e.key === 'ArrowLeft') setAt((i) => (i - 1 + list.length) % list.length)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [list.length, setAt])
  if (!tp) return null
  const wide = WIDE.has(tp.id)
  const id = wide ? `${tp.id}-wide` : tp.id
  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-night-950/70 p-4 animate-fadein" onMouseDown={(e) => e.target === e.currentTarget && setAt(null)}>
      <div role="dialog" aria-modal="true" aria-label={tp.name} className="relative my-6 grid w-full max-w-[920px] gap-6 rounded-3xl bg-white p-5 shadow-pop sm:p-7 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
        <button type="button" onClick={() => setAt(null)} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100" aria-label={t('Close', 'បិទ')}>
          <FiX size={18} />
        </button>
        <Frame key={id} shape={clipIsWide(tp.id) ? 'wide' : 'tall'} className={`mx-auto rounded-2xl bg-night-900 ${clipIsWide(tp.id) ? 'w-full md:w-[480px]' : 'w-[260px] sm:w-[300px]'}`}>
          <Clip src={previewSrc(id, 'mp4')} poster={previewSrc(id)} autoPlay />
        </Frame>
        <div className="flex min-w-0 flex-col">
          {isNew(tp) && <span className="mb-2 w-fit rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">{t('New', 'ថ្មី')}</span>}
          <h3 className="pr-8 text-[24px] font-bold leading-tight text-ink-900">{tp.name}</h3>
          <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-[12px] font-semibold text-ink-600">
            <FiUsers size={12} /> <UsedBy n={usedBy(tp.id)} fresh={isNew(tp)} t={t} num={num} />
          </div>
          {tp.bestFor && (
            <p className="mt-4 text-[13.5px] text-ink-700">
              <b className="text-ink-900">{t('Best for', 'ល្អសម្រាប់')}:</b> {tp.bestFor}
            </p>
          )}
          <p className="mt-3 text-[14px] leading-relaxed text-ink-600">{tp.look}</p>
          {tp.steps?.length > 0 && (
            <>
              <div className="mt-5 text-[12px] font-bold uppercase tracking-wide text-ink-400">{t('The scenes', 'ឈុតនីមួយៗ')}</div>
              <ol className="mt-2 flex flex-wrap gap-1.5">
                {tp.steps.map((s, i) => (
                  <li key={i} className="rounded-full border border-ink-200 px-2.5 py-1 text-[12px] text-ink-700">
                    <span className="mr-1 font-bold text-brand">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </>
          )}
          <p className="mt-4 text-[12.5px] text-ink-500">{t('Speaks Khmer or English, with your logo, your colours and your products.', 'និយាយខ្មែរ ឬអង់គ្លេស ជាមួយឡូហ្គោ ពណ៌ និងផលិតផលរបស់បង។')}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
            <button type="button" onClick={onUse} className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-brand/90">
              {t('Use this template', 'ប្រើគំរូនេះ')} <FiArrowRight size={15} />
            </button>
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setAt((i) => (i - 1 + list.length) % list.length)} className="grid h-10 w-10 place-items-center rounded-full bg-ink-100 text-ink-700 hover:bg-ink-200" aria-label={t('Previous', 'មុន')}>
                <FiChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => setAt((i) => (i + 1) % list.length)} className="grid h-10 w-10 place-items-center rounded-full bg-ink-100 text-ink-700 hover:bg-ink-200" aria-label={t('Next', 'បន្ទាប់')}>
                <FiChevronRight size={18} />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** ``items``: every template, in the order to show · ``usedBy(id)`` → videos made with it ·
 *  ``isNew(item)`` · ``t`` the page's i18n · ``num`` a number in the page's digits. */
export default function TemplateGallery({ items, usedBy, isNew, t, num = String, onStart }) {
  const [cat, setCat] = useState('all')
  const [open, setOpen] = useState(null) // index in ``shown``
  const [all, setAll] = useState(false) // the whole gallery, or its first rows under a fade
  const top = useRef(null)
  const ids = CATEGORIES.find(([k]) => k === cat)?.[2]
  const cols = useCols()
  // "Most used": the 3 templates with the most videos made (real counts, none with 0; a tie keeps the newer first)
  const ranked = [...items].filter((tp) => usedBy(tp.id) > 0).sort((a, b) => usedBy(b.id) - usedBy(a.id)).slice(0, 3)
  const top3 = new Set(ranked.map((tp) => tp.id))
  // the order: the most used first (the owner, 2026-10-29), then the rest newest to oldest; a filter keeps that order
  const ordered = [...ranked, ...items.filter((tp) => !top3.has(tp.id))]
  const shown = ids ? ordered.filter((tp) => ids.includes(tp.id)) : ordered
  const card = (tp, i) => {
    const wide = WIDE.has(tp.id)
    const id = wide ? `${tp.id}-wide` : tp.id
    const shape = clipIsWide(tp.id) ? 'wide' : 'tall'
    return (
      <button key={tp.id} type="button" onClick={() => setOpen(i)} className="group block w-full text-left" aria-label={`${tp.name} — ${t('Preview', 'មើល')}`}>
        <Frame shape={shape} className="rounded-2xl bg-night-900 shadow-card ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1 dark:ring-white/10">
          <Clip src={previewSrc(id, 'mp4')} poster={previewSrc(id)} />
          {(isNew(tp) || top3.has(tp.id)) && (
            <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {top3.has(tp.id) && (
                <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-900 shadow-sm">
                  🔥 {t('Most used', 'ប្រើច្រើនបំផុត')}
                </span>
              )}
              {isNew(tp) && <span className="rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white shadow-sm">{t('New', 'ថ្មី')}</span>}
            </span>
          )}
          {/* hover: a dim, "Preview", and how many use it now — the clip keeps playing under it */}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-night-950/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-night-900 shadow-sm">
              <FiPlay size={13} /> {t('Preview', 'មើល')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-night-950/70 px-3 py-1 text-[11.5px] font-semibold text-white ring-1 ring-white/15">
              <FiUsers size={12} /> <UsedBy n={usedBy(tp.id)} fresh={isNew(tp)} t={t} num={num} />
            </span>
          </span>
        </Frame>
        <div className="mt-2.5 text-[14px] font-bold text-ink-900">{tp.name}</div>
      </button>
    )
  }
  const count = (k) => {
    const list = CATEGORIES.find(([c]) => c === k)?.[2]
    return list ? items.filter((tp) => list.includes(tp.id)).length : items.length
  }

  return (
    <>
      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-center gap-2" role="group" aria-label={t('Filter templates', 'ច្រោះគំរូ')}>
        {CATEGORIES.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={cat === k}
            onClick={() => (setCat(k), setOpen(null), setAll(false))}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
              cat === k ? 'bg-ink-900 text-ink-50' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50'
            }`}
          >
            {t(label)}
            <span className={cat === k ? 'text-ink-50/60' : 'text-ink-400'}>{num(count(k))}</span>
          </button>
        ))}
      </div>

      {/* folded: the first rows, fading into the page, and "See more templates" over the fade */}
      <div ref={top} className="relative mx-auto mt-8 max-w-6xl scroll-mt-28">
      {/* the cards go into the columns in turn — the newest across the top row, each column packed tight */}
      <div className={all ? '' : 'overflow-hidden'} style={all ? undefined : { maxHeight: FOLDED }}>
      <div className="flex items-start gap-4">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex min-w-0 flex-1 flex-col gap-6">
            {shown.map((tp, i) => (i % cols === c ? card(tp, i) : null))}
          </div>
        ))}
      </div>
      </div>
      {!all && shown.length > 8 && (
        <div className="absolute inset-x-0 bottom-0 flex h-56 items-end justify-center bg-gradient-to-b from-transparent via-canvas/85 to-canvas pb-2">
          <button type="button" onClick={() => setAll(true)} className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-[14px] font-semibold text-ink-50 shadow-card transition-colors hover:bg-ink-800">
            {t(`See more templates (${shown.length})`, `មើលគំរូបន្ថែម (${num(shown.length)})`)} <FiChevronDown size={16} />
          </button>
        </div>
      )}
      {all && shown.length > 8 && (
        <div className="mt-2 flex justify-center">
          <button type="button" onClick={() => (setAll(false), top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
            {t('Show less', 'បង្ហាញតិច')} <FiChevronUp size={15} />
          </button>
        </div>
      )}
      </div>

      {open != null && <Preview list={shown} at={open} setAt={setOpen} usedBy={usedBy} isNew={isNew} t={t} num={num} onUse={onStart} />}
    </>
  )
}
