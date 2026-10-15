import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { FiImage, FiInfo, FiMessageCircle, FiRefreshCw, FiTarget, FiX } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import StoryEditor from '../story/StoryEditor'
import GeneratingCanvas from '../ui/GeneratingCanvas'
import SocialPreview, { formatCaption, longListLines, tidyCaption } from '../preview/SocialPreview'
import { kitSrc } from '../brandkit/BrandKit'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../ui/PlatformIcon'
import { useStore } from '../../store'
import { GOALS, STAGES, ctaOf, goalOfItem, ruleAction, stageOf } from '../../lib/goals'
import { MOTION_OFF_TIP, useMotionReady } from '../../lib/motionStatus'

// The plan's posts (next week's, or one day's), one card each: when, which goal, the idea, why, the call
// to action and the KPI — with Approve & schedule / Skip per post. Each post is
// an image, text-only or a video; a video shows its storyboard to edit and
// approve, renders in the background, then is approved again once finished
// (backend app/weekly.py). Why the plan looks like this and the rules it
// follows open in a drawer from the "Why this plan" button, so the posts get
// the whole width.

// Plans written before formats existed only marked videos.
export const formatOf = (item) => item.format || (item.video ? 'video' : 'image')
const FORMATS = [
  { v: 'image', l: 'Image' },
  { v: 'text', l: 'Text' },
  // animated words + photos + voice, made with the plan (backend app/motion.py)
  { v: 'motion', l: 'Remotion' },
  // people on camera — storyboard first, filmed once approved
  { v: 'video', l: 'AI video · 24 s' },
]
const FORMAT_TIPS = {
  motion: 'An animated video with your photos, logo and a Khmer voice — made now, about a minute',
  video: 'Writes a 3-scene storyboard — the video is only filmed once you approve it',
}

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')
const dayParts = (iso) => {
  const d = new Date(`${iso}T00:00`)
  return { wd: d.toLocaleDateString('en-GB', { weekday: 'short' }), n: d.getDate() }
}

export default function PlanBoard({
  plan,
  brandName,
  brandId,
  brandSlug,
  report,
  mix,
  makingMedia,
  filter,
  busy,
  onApprove,
  onSkip,
  onUnskip,
  onSaveCaption,
  onMakeImage,
  onFormat,
  onNewPicture,
}) {
  const items = plan.items
  const shown = filter ? items.filter((i) => goalOfItem(i) === filter) : items
  const approved = items.filter((i) => i.state === 'approved').length
  const waiting = items.filter((i) => !i.state)
  const flagged = waiting.filter((i) => i.fact_issues?.length).length
  const rules = (report?.rules || []).slice(0, 5)
  const [whyOpen, setWhyOpen] = useState(false)

  return (
    <div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-700">
          <b className="font-semibold text-ink-900">
            {plan.starts_on === plan.ends_on
              ? `Daily plan · ${dayLabel(plan.starts_on)}`
              : `Next week · ${dayLabel(plan.starts_on)} – ${dayLabel(plan.ends_on)}`}
          </b>{' '}
          · {approved} approved, {waiting.length} to go · {items.length} posts
          {filter && (
            <>
              {' · '}
              <span className="font-semibold text-brand">showing {GOALS[filter].label}</span>
            </>
          )}
        </p>
          <button
            type="button"
            onClick={() => setWhyOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            <FiInfo size={13} aria-hidden="true" /> Why this plan
            {rules.length > 0 && <span className="rounded-full bg-brand-soft px-1.5 text-[10.5px] font-bold text-brand tabular-nums">{rules.length}</span>}
          </button>
        </div>

        {shown.length === 0 ? (
          <div className={`${card} p-8 text-center text-[12.5px] text-ink-500`}>
            {items.length === 0 ? 'Every post was skipped — rewrite the plan or skip it.' : `No ${GOALS[filter]?.label || ''} posts in this plan.`}
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((item) => (
              <PostCard
                key={item.key}
                item={item}
                brand={{ id: brandId, name: brandName, slug: brandSlug }}
                makingMedia={makingMedia}
                busy={busy}
                onApprove={() => onApprove({ keys: [item.key] })}
                onSkip={() => onSkip(item.key)}
                onUnskip={() => onUnskip(item.key)}
                onSaveCaption={(c) => onSaveCaption(item.key, c)}
                onMakeImage={onMakeImage}
                onFormat={(format) => onFormat(item.key, format)}
                onNewPicture={() => onNewPicture(item.key)}
              />
            ))}
          </ul>
        )}

        {waiting.length > 0 && (
          <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
            Approved posts go out on their day and time. Videos are approved twice: the storyboard, then the video.
            {flagged > 0 && (
              <span className="ml-1 font-semibold text-amber-700">
                {flagged} flagged post{flagged === 1 ? ' needs' : 's need'} your own OK.
              </span>
            )}
          </p>
        )}
      </div>

      {whyOpen && <WhyDrawer onClose={() => setWhyOpen(false)}>
        <section className="px-6 py-5">
          <h3 className="text-[15px] font-semibold text-ink-900">Why this plan</h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">What the AI read in your own posts and results</p>
          {rules.length === 0 ? (
            <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
              Not enough results yet to learn from — this week’s plan follows your goal mix. Lessons appear here as your
              posts collect likes and comments.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {rules.map((r) => (
                <li key={r.id} className="py-3 first:pt-1 last:pb-0">
                  <p className="text-[13px] font-semibold leading-snug text-ink-900">{r.text}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">→ {ruleAction(r)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-6 py-5">
          <h3 className="text-[15px] font-semibold text-ink-900">Rules the plan follows</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
            At least 2 value days before every selling post · follows the content-goal mix (
            {Object.entries(STAGES)
              .map(([k, s]) => {
                const pct = Object.keys(GOALS)
                  .filter((g) => GOALS[g].stage === k)
                  .reduce((sum, g) => sum + (mix?.[g] || 0), 0)
                return `${s.label} ${pct}`
              })
              .join(' · ')}
            ) · the same topic isn’t repeated close together · prices, offers and customer names that aren’t in your
            product info are flagged and always wait for a human yes.
          </p>
        </section>
      </WhyDrawer>}
    </div>
  )
}

// "Why this plan" and the rules, in a drawer from the right on a plain dim
// backdrop (no blur) — opened only when someone wants to know.
function WhyDrawer({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Why this plan"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in"
      >
        <div className="flex justify-end px-4 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </div>
        <div className="-mt-6 flex-1 divide-y divide-ink-100 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

// Below Tailwind's `sm` (640px) the plan card switches to its phone layout.
// Only one layout is rendered at a time, so the storyboard editor mounts once.
const PHONE = '(max-width: 639px)'
function useIsPhone() {
  const [phone, setPhone] = useState(() => !!window.matchMedia?.(PHONE).matches)
  useEffect(() => {
    const m = window.matchMedia?.(PHONE)
    if (!m) return undefined
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

const dayLabel = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// A new picture being made for a post (backend PICTURE_STALE: older = lost).
export const pictureBusy = (item) =>
  !!item.picture_started && Date.now() - Date.parse(item.picture_started) < 10 * 60 * 1000

function PostCard({ item, brand, makingMedia, busy, onApprove, onSkip, onUnskip, onSaveCaption, onMakeImage, onFormat, onNewPicture }) {
  const [editing, setEditing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [text, setText] = useState(item.caption)
  const [story, setStory] = useState(null) // a video post's storyboard, as StoryEditor has it
  useEffect(() => setText(item.caption), [item.caption])

  const { wd, n } = dayParts(item.day)
  const goal = GOALS[goalOfItem(item)]
  const stage = stageOf(goalOfItem(item))
  const cta = ctaOf(item.caption)
  const fmt = formatOf(item)
  const imageKind = item.poster ? 'Poster' : item.meme ? 'Meme poster' : 'Image'
  const flagged = item.fact_issues?.length > 0
  const skipped = item.state === 'skipped'
  const approved = item.state === 'approved'
  const undecided = !item.state
  const switching = busy === `format:${item.key}`
  const filmReady = story?.status === 'done' && !!story.final_video
  const { showToast } = useStore()
  // Already in the clean phone layout? Then Format has nothing to do.
  const formatted = tidyCaption(item.caption) === (item.caption || '').trim() && !longListLines(item.caption).length
  // One button: format the caption for phones (if it isn't yet), then show it
  // in the phone preview. A decided post is only previewed.
  const previewAndFormat = async () => {
    if (formatted || item.state) return setPreviewing(true)
    setFormatting(true)
    try {
      const clean = await formatCaption(item.caption, brand?.id)
      if (clean !== item.caption) {
        onSaveCaption(clean)
        setText(clean)
        showToast('Caption formatted for phones')
      }
    } catch (e) {
      showToast(`Couldn’t format — ${e.message}. Showing it as it is.`)
    } finally {
      setFormatting(false)
      setPreviewing(true)
    }
  }
  const picBusy = pictureBusy(item)
  const motionReady = useMotionReady() // false: this server can't render Remotion videos
  const motion = fmt === 'motion'
  const hasMedia = fmt === 'image' || motion // a picture or a motion video, made with the plan
  const phone = useIsPhone()
  // phones: the details are cut short with a fade until "See more"
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const detailsRef = useRef(null)
  useLayoutEffect(() => {
    const el = detailsRef.current
    setClipped(!!el && el.scrollHeight > el.clientHeight + 2)
  }, [phone, open, item.insight, item.caption])

  // the picture / video made with the plan — `box` sizes it per layout
  const media = (box, errW) => (
    <div className="flex-none">
      <div className={`relative overflow-hidden rounded-xl border border-ink-100 bg-ink-50 ${box}`}>
        {item.media_url ? (
          // the current picture — faded underneath while a new one is made
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            disabled={picBusy}
            className="block h-full w-full"
            title={picBusy ? `A new ${motion ? 'video' : 'picture'} is being made` : 'See it in the feed'}
          >
            {motion ? (
              <video
                src={kitSrc(item.media_url)}
                muted
                loop
                autoPlay
                playsInline
                className={`h-full w-full object-cover transition-opacity duration-500 ${picBusy ? 'opacity-75' : ''}`}
              />
            ) : (
              <img
                src={kitSrc(item.media_url)}
                alt=""
                loading="lazy"
                className={`h-full w-full object-cover transition-opacity duration-500 ${picBusy ? 'opacity-75' : ''}`}
              />
            )}
          </button>
        ) : (
          !picBusy && (
            <div className="grid h-full w-full place-items-center rounded-xl border-2 border-dashed border-ink-200 px-3 text-center text-[11.5px] leading-snug text-ink-400">
              <span>
                <FiImage size={20} className="mx-auto mb-1.5" aria-hidden="true" />
                {motion ? 'No video yet' : 'No picture yet'}
              </span>
            </div>
          )
        )}
        {picBusy && (
          // the app's "being made" smoke (as in the Calendar and Studio), see-through
          // when there's an old picture so it shows behind
          <div className="absolute inset-0">
            <GeneratingCanvas
              small
              icon={motion ? '✺' : '✦'}
              stage={motion ? 'Making the video…' : 'New picture…'}
              seeThrough={!!item.media_url}
            />
          </div>
        )}
      </div>
      {item.picture_error && !picBusy && <p className={`mt-1.5 text-[11px] leading-snug text-red-600 ${errW}`}>{item.picture_error}</p>}
    </div>
  )

  const goalTag = goal && <span className={`rounded-full px-2.5 py-0.5 font-semibold ${stage.tile}`}>{goal.label}</span>
  const spinner = switching && <FiRefreshCw size={12} className="animate-spin text-brand" aria-label="Changing format" />
  const formatPill = (
    <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-semibold text-ink-700">
      {fmt === 'image' ? imageKind : FORMATS.find((o) => o.v === fmt)?.l}
    </span>
  )
  // Image · Text · Remotion · AI video, while the post is still undecided
  const formatSwitch = (wide) => (
    <span className={`rounded-full border border-ink-200 bg-white p-0.5 ${wide ? 'flex w-full' : 'inline-flex'}`} role="group" aria-label="Post format">
      {FORMATS.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={!!busy || (o.v === 'motion' && motionReady === false && fmt !== o.v)}
          aria-pressed={fmt === o.v}
          onClick={() => onFormat(o.v)}
          title={o.v === 'motion' && motionReady === false ? MOTION_OFF_TIP : fmt !== o.v ? FORMAT_TIPS[o.v] : undefined}
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold transition-colors disabled:cursor-not-allowed ${wide ? 'flex-1' : ''} ${
            fmt === o.v
              ? 'bg-brand-soft text-brand'
              : o.v === 'motion' && motionReady === false
                ? 'text-ink-300'
                : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          {o.v === 'image' && fmt === 'image' ? imageKind : o.l}
        </button>
      ))}
    </span>
  )
  const channels = item.channels?.length > 0 && (
    <span className="ml-auto flex flex-none items-center gap-1" aria-label={`Posts to ${item.channels.join(', ')}`}>
      {item.channels.map((c) => (
        <span
          key={c}
          title={c}
          className={`grid h-6 w-6 place-items-center rounded-full bg-ink-50 ring-1 ring-ink-100 ${PLAT_BRAND_CLASS[c] || 'text-ink-500'}`}
        >
          <PlatformIcon name={c} />
        </span>
      ))}
    </span>
  )
  const title = <h3 className={`text-[15px] font-semibold leading-snug text-ink-900 ${khmer(item.title)}`}>{item.title}</h3>

  // the idea, its call to action and how it's measured
  const details = (
    <>
      {item.insight && <p className={`text-[13px] leading-relaxed text-ink-600 ${khmer(item.insight)}`}>{item.insight}</p>}
      {(cta || goal) && (
        <dl className="mt-3 space-y-1.5 rounded-xl bg-ink-50 px-3.5 py-2.5 text-[12px]">
          {cta && (
            <div className={phone ? 'flex flex-col gap-0.5' : 'flex items-start gap-2'}>
              <dt className="flex flex-none items-center gap-1.5 font-medium text-ink-500">
                <FiMessageCircle size={13} aria-hidden="true" /> Call to action
              </dt>
              <dd className={`min-w-0 text-ink-800 ${khmer(cta)}`}>{cta}</dd>
            </div>
          )}
          {goal && (
            <div className="flex items-start gap-2">
              <dt className="flex flex-none items-center gap-1.5 font-medium text-ink-500">
                <FiTarget size={13} aria-hidden="true" /> Measured by
              </dt>
              <dd className="font-semibold text-ink-800">{goal.kpi}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  )

  // the fact check, the caption editor and a video post's storyboard
  const extras = (
    <>
      {flagged && !item.state && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium leading-snug text-amber-900">
          Check before approving: {item.fact_issues[0]}
          {item.fact_issues.length > 1 && ` (+${item.fact_issues.length - 1} more)`}
        </p>
      )}

      {editing && (
        <div className="mt-3">
          <AutoTextarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text.trim() && text !== item.caption) onSaveCaption(text)
            }}
            className={`w-full rounded-xl border border-brand bg-white px-3 py-2 text-[12.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/15 ${khmer(text)}`}
          />
          {flagged && (
            <ul className="mt-2 space-y-0.5">
              {item.fact_issues.map((issue, i) => (
                <li key={i} className="text-[11.5px] leading-snug text-amber-800">
                  • {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {fmt === 'video' && undecided && (
        <div className="mt-3">
          {item.story_id ? (
            <StoryEditor key={item.story_id} storyId={item.story_id} compact onStory={setStory} />
          ) : (
            <button type="button" disabled={!!busy} onClick={() => onFormat('video')} className="btn-outline px-3 py-1.5 text-[12.5px]">
              Write the storyboard
            </button>
          )}
        </div>
      )}
    </>
  )

  const preview = previewing && (
    <SocialPreview
      brand={brand}
      caption={text}
      media={
        fmt === 'video' && story?.final_video
          ? { kind: 'video', url: story.final_video.url }
          : motion && item.media_url
            ? { kind: 'video', url: item.media_url }
            : fmt === 'image' && item.media_url
            ? { kind: 'image', url: item.media_url }
            : null
      }
      note={
        fmt === 'image'
          ? `The ${item.poster || item.meme ? 'poster' : 'picture'} is made when you approve`
          : fmt === 'video'
            ? 'The video shows here once it’s made from the storyboard'
            : motion
              ? 'The Remotion video shows here once it’s made'
              : null
      }
      platforms={item.channels}
      onFix={undecided ? (c) => onSaveCaption(c) : undefined}
      onClose={() => setPreviewing(false)}
    />
  )

  // Approve on its own; the rest stacked under it — on a phone a 2×2 grid
  const secondary = phone ? 'justify-center px-2 py-1.5 text-[12.5px]' : 'px-4 py-1.5 text-[12.5px]'
  const quiet = phone ? `${secondary} bg-ink-50` : 'px-3 py-1.5 text-[12.5px]'
  const actions = approved ? (
    <ApprovedState item={item} fmt={fmt} makingMedia={makingMedia} onMakeImage={onMakeImage} />
  ) : skipped ? (
    <>
      <span className="text-center text-[12px] font-semibold text-ink-500">Skipped</span>
      <button type="button" onClick={onUnskip} className="btn-outline justify-center px-4 py-1.5 text-[12.5px]">
        Undo
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        disabled={!!busy || picBusy || (fmt === 'video' && !filmReady) || (motion && !item.media_url)}
        onClick={onApprove}
        className={`btn-primary justify-center px-4 py-2 text-[13px] ${phone ? 'col-span-2' : ''}`}
        title={
          fmt === 'video' && !filmReady
            ? 'Approve the storyboard first — once the video is finished you can schedule it'
            : picBusy
              ? `Wait for the new ${motion ? 'video' : 'picture'}`
              : motion && !item.media_url
                ? 'Make the Remotion video first'
                : undefined
        }
      >
        Approve &amp; schedule
      </button>
      {fmt === 'video' && !filmReady && (
        <p className={`text-center text-[11px] leading-snug text-ink-400 ${phone ? 'col-span-2' : ''}`}>
          {story?.status === 'draft' ? 'Approve the storyboard first' : 'When the video is finished'}
        </p>
      )}
      {hasMedia && (
        <button
          type="button"
          onClick={onNewPicture}
          disabled={picBusy || !!busy}
          className={`btn-outline ${secondary}`}
          title={
            motion
              ? 'Make another Remotion video for this post — a new script, photos and voice. The old one stays in the Media Library.'
              : 'Make another picture for this post — same brand kit and style. The old one stays in the Media Library.'
          }
        >
          {picBusy ? 'Making…' : item.media_url ? (motion ? 'New video' : 'New picture') : motion ? 'Make video' : 'Make picture'}
        </button>
      )}
      <button
        type="button"
        onClick={previewAndFormat}
        disabled={formatting}
        className={`btn-outline ${secondary}`}
        title={
          formatted
            ? 'See the post the way it shows in the feed'
            : 'Formats the caption for phones (long list lines shortened by the AI), then shows it in the feed'
        }
      >
        {formatting ? 'Formatting…' : formatted ? 'Preview' : 'Format & preview'}
      </button>
      <button type="button" onClick={() => setEditing((e) => !e)} className={`btn-ghost text-ink-600 ${quiet}`}>
        {editing ? 'Done' : 'Edit caption'}
      </button>
      <button type="button" disabled={!!busy} onClick={onSkip} className={`btn-ghost text-ink-500 ${quiet}`}>
        Skip
      </button>
    </>
  )

  const cardCls = `${card} ${flagged && !item.state ? 'border-amber-300' : ''} ${skipped ? 'opacity-60' : ''}`

  if (phone) {
    // Phones: the picture on the left, when + what on the right; the details
    // under it, cut short with a fade and "See more"; the buttons at the bottom.
    return (
      <li className={`${cardCls} p-4`}>
        <div className="flex gap-3">
          {hasMedia && media('h-40 w-[120px]', 'w-[120px]')}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[11.5px]">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wide text-ink-400">{wd}</span>
              <span className="text-[18px] font-bold leading-none tabular-nums text-ink-900">{n}</span>
              <span className="font-mono text-[12px] font-medium tabular-nums text-brand">{item.time || '—'}</span>
              {channels}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {goalTag}
              {!undecided && formatPill}
              {spinner}
            </div>
            {title}
          </div>
        </div>

        {undecided && <div className="mt-3 text-[11.5px]">{formatSwitch(true)}</div>}

        {(item.insight || cta || goal) && (
          <div className="relative mt-3">
            <div ref={detailsRef} className={open ? '' : 'max-h-[132px] overflow-hidden'}>
              {details}
            </div>
            {clipped && !open && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
            )}
          </div>
        )}
        {(clipped || open) && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] font-semibold text-brand">
            {open ? 'See less' : 'See more'}
          </button>
        )}

        {extras}

        <div className={`mt-3 border-t border-ink-100 pt-3 ${approved || skipped ? 'flex flex-col items-stretch gap-2' : 'grid grid-cols-2 gap-2'}`}>
          {actions}
        </div>
        {preview}
      </li>
    )
  }

  return (
    <li className={`${cardCls} flex gap-5 p-5`}>
      {/* when */}
      <div className="w-14 flex-none text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{wd}</div>
        <div className="text-[26px] font-bold leading-tight tabular-nums text-ink-900">{n}</div>
        <div className="mt-0.5 font-mono text-[12px] font-medium tabular-nums text-brand">{item.time || '—'}</div>
      </div>

      <div className="min-w-0 flex-1">
        {/* goal · format ·········· where it goes */}
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          {goalTag}
          {undecided ? formatSwitch(false) : formatPill}
          {spinner}
          {channels}
        </div>

        <div className="mt-2">{title}</div>

        {/* picture | the idea, its call to action and how it's measured */}
        <div className={`mt-3 ${hasMedia ? 'grid grid-cols-[160px_minmax(0,1fr)] gap-4' : ''}`}>
          {hasMedia && media('h-48 w-40', 'w-40')}
          <div className="min-w-0">{details}</div>
        </div>

        {extras}
      </div>

      <div className="flex w-[164px] flex-none flex-col items-stretch gap-2">
        {preview}
        {actions}
      </div>
    </li>
  )
}

function ApprovedState({ item, fmt, makingMedia, onMakeImage }) {
  const d = item.draft
  const pill = (cls, label) => <span className={`rounded-full px-2.5 py-1 text-center text-[11.5px] font-semibold ${cls}`}>{label}</span>
  if (!d) return pill('bg-emerald-50 text-emerald-700', 'Approved')
  if (d.status === 'scheduled') return pill('bg-emerald-50 text-emerald-700', 'Scheduled')
  if (fmt !== 'image')
    // a text or video post is scheduled on approve — this one had no channel to go to
    return (
      <>
        {pill('bg-amber-50 text-amber-800', 'Couldn’t schedule')}
        <Link to="/calendar" className="text-center text-[12px] font-semibold text-brand hover:underline">
          Open in Calendar
        </Link>
      </>
    )
  if (!d.has_media && (d.media_pending || makingMedia))
    return (
      <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand">
        <FiRefreshCw size={11} className="animate-spin" aria-hidden="true" /> Making image…
      </span>
    )
  if (!d.has_media)
    return (
      <>
        {pill('bg-amber-50 text-amber-800', 'Not scheduled yet')}
        <button
          type="button"
          onClick={() => onMakeImage(d.id)}
          className="rounded-lg bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand hover:text-white"
          title="No image yet, so it won’t post — make one and it’s scheduled automatically"
        >
          Make image
        </button>
      </>
    )
  return (
    <>
      {pill('bg-amber-50 text-amber-800', 'Couldn’t schedule')}
      <Link to="/calendar" className="text-center text-[12px] font-semibold text-brand hover:underline">
        Open in Calendar
      </Link>
    </>
  )
}
