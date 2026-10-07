import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiRefreshCw } from 'react-icons/fi'
import AutoTextarea from '../ui/AutoTextarea'
import StoryEditor from '../story/StoryEditor'
import { useStore } from '../../store'
import { GOALS, STAGES, ctaOf, goalOfItem, ruleAction, stageOf } from '../../lib/goals'

// The plan's posts (next week's, or one day's), one card each: when, which goal, the idea, why, the call
// to action and the KPI — with Approve & schedule / Skip per post. Each post is
// an image, text-only or a video; a video shows its storyboard to edit and
// approve, renders in the background, then is approved again once finished
// (backend app/weekly.py). The right column says why the plan looks like this
// and the rules it follows.

// Plans written before formats existed only marked videos.
export const formatOf = (item) => item.format || (item.video ? 'video' : 'image')
const FORMATS = [
  { v: 'image', l: 'Image' },
  { v: 'text', l: 'Text' },
  { v: 'video', l: 'Video · 24 s' },
]

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')
const dayParts = (iso) => {
  const d = new Date(`${iso}T00:00`)
  return { wd: d.toLocaleDateString('en-GB', { weekday: 'short' }), n: d.getDate() }
}

export default function PlanBoard({
  plan,
  brandName,
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
}) {
  const items = plan.items
  const shown = filter ? items.filter((i) => goalOfItem(i) === filter) : items
  const approved = items.filter((i) => i.state === 'approved').length
  const waiting = items.filter((i) => !i.state)
  const flagged = waiting.filter((i) => i.fact_issues?.length).length
  const rules = (report?.rules || []).slice(0, 5)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="mb-3 text-[13px] text-ink-700">
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
                brandName={brandName}
                makingMedia={makingMedia}
                busy={busy}
                onApprove={() => onApprove({ keys: [item.key] })}
                onSkip={() => onSkip(item.key)}
                onUnskip={() => onUnskip(item.key)}
                onSaveCaption={(c) => onSaveCaption(item.key, c)}
                onMakeImage={onMakeImage}
                onFormat={(format) => onFormat(item.key, format)}
              />
            ))}
          </ul>
        )}

        {waiting.length > 0 && (
          <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
            Approve &amp; schedule: a text post is scheduled right away, an image post once its picture is made — on its
            day, at the time shown. A video post: approve its storyboard, the video is made in the background, then
            approve &amp; schedule the finished video.
            {flagged > 0 && (
              <span className="ml-1 font-semibold text-amber-700">
                {flagged} flagged post{flagged === 1 ? '' : 's'} need a person’s OK first — “Approve all unflagged” leaves them.
              </span>
            )}
          </p>
        )}
      </div>

      <aside className="space-y-4">
        <section className={`${card} p-5`}>
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

        <section className={`${card} p-5`}>
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
      </aside>
    </div>
  )
}

const dayLabel = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function PostCard({ item, brandName, makingMedia, busy, onApprove, onSkip, onUnskip, onSaveCaption, onMakeImage, onFormat }) {
  const [editing, setEditing] = useState(false)
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
  const channels = item.channels?.length ? item.channels.join(' · ') : ''
  const { brands } = useStore()
  const navigate = useNavigate()
  // Open the Content studio with this post as the brief (it reads location.state).
  const makeContent = () =>
    navigate('/ai?tab=images', {
      state: {
        brandSlug: brands.find((b) => b.name === brandName)?.slug,
        topic: item.title,
        extra: [
          goal && `Goal: ${goal.label} — success measured by ${goal.kpi}`,
          `Posts ${wd} ${n}${item.time ? ` at ${item.time}` : ''}${channels ? ` on ${channels}` : ''}`,
          item.caption && `Caption: ${item.caption}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    })

  return (
    <li className={`${card} flex gap-4 p-4 sm:gap-5 sm:p-5 ${flagged && !item.state ? 'border-amber-300' : ''} ${skipped ? 'opacity-60' : ''}`}>
      <div className="w-12 flex-none text-center">
        <div className="text-[11.5px] font-medium text-ink-500">{wd}</div>
        <div className="text-[24px] font-bold leading-tight tabular-nums text-ink-900">{n}</div>
        <div className="font-mono text-[11.5px] tabular-nums text-ink-500">{item.time || '—'}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {goal && <span className={`rounded-full px-2.5 py-0.5 font-semibold ${stage.chip}`}>{goal.label}</span>}
          {undecided ? (
            <span className="inline-flex rounded-full border border-ink-200 bg-white p-0.5" role="group" aria-label="Post format">
              {FORMATS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  disabled={!!busy}
                  aria-pressed={fmt === o.v}
                  onClick={() => onFormat(o.v)}
                  title={o.v === 'video' && fmt !== 'video' ? 'Writes a 3-scene storyboard — the video is only made once you approve it' : undefined}
                  className={`rounded-full px-2.5 py-0.5 font-semibold transition-colors ${
                    fmt === o.v ? 'bg-brand-soft text-brand' : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  {o.v === 'image' && fmt === 'image' ? imageKind : o.l}
                </button>
              ))}
            </span>
          ) : (
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-semibold text-ink-700">
              {fmt === 'image' ? imageKind : FORMATS.find((o) => o.v === fmt)?.l}
            </span>
          )}
          {switching && <FiRefreshCw size={12} className="animate-spin text-brand" aria-label="Changing format" />}
          <span className="text-ink-500">{[brandName, channels].filter(Boolean).join(' · ')}</span>
        </div>
        <h3 className={`mt-1.5 text-[14.5px] font-semibold leading-snug text-ink-900 ${khmer(item.title)}`}>{item.title}</h3>
        {item.insight && <p className={`mt-1 text-[12.5px] leading-snug text-ink-600 ${khmer(item.insight)}`}>{item.insight}</p>}
        {cta && <p className={`mt-1.5 text-[12px] text-ink-500 ${khmer(cta)}`}>Call to action: {cta}</p>}
        {goal && (
          <p className="mt-0.5 text-[12px] text-ink-500">
            Success measured by · <b className="font-semibold text-ink-700">{goal.kpi}</b>
          </p>
        )}
        {flagged && !item.state && (
          <p className="mt-2 inline-block rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-900">
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
      </div>

      <div className="flex w-[132px] flex-none flex-col items-stretch gap-2">
        {approved ? (
          <ApprovedState item={item} fmt={fmt} makingMedia={makingMedia} onMakeImage={onMakeImage} />
        ) : skipped ? (
          <>
            <span className="text-center text-[12px] font-semibold text-ink-500">Skipped</span>
            <button type="button" onClick={onUnskip} className="btn-outline px-3 py-1.5 text-[12.5px]">
              Undo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!!busy || (fmt === 'video' && !filmReady)}
              onClick={onApprove}
              className="btn-primary px-3 py-2 text-[13px]"
              title={fmt === 'video' && !filmReady ? 'Approve the storyboard first — once the video is finished you can schedule it' : undefined}
            >
              Approve &amp; schedule
            </button>
            {fmt === 'video' && !filmReady && (
              <p className="text-center text-[11px] leading-snug text-ink-400">
                {story?.status === 'draft' ? 'Approve the storyboard first' : 'When the video is finished'}
              </p>
            )}
            {fmt === 'image' && (
              <button type="button" onClick={makeContent} className="btn-outline px-3 py-1.5 text-[12.5px]" title="Make the picture for this post in the Content studio">
                Open in studio
              </button>
            )}
            <button type="button" onClick={() => setEditing((e) => !e)} className="btn-ghost px-3 py-1.5 text-[12.5px] text-ink-600">
              {editing ? 'Done' : 'Edit caption'}
            </button>
            <button type="button" disabled={!!busy} onClick={onSkip} className="btn-ghost px-3 py-1.5 text-[12.5px] text-ink-500">
              Skip
            </button>
          </>
        )}
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
