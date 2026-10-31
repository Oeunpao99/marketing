import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheck, FiExternalLink, FiPlay } from 'react-icons/fi'
import { Donut, MIX, fmtNum } from './Overview'

// a file under /media is served by the API (port 8000 in local dev)
export const mediaSrc = (url) => (!url ? null : /^https?:\/\//i.test(url) ? url : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${url}`)

/** The post itself at the top of its card — its whole picture (never cropped), a
 *  video's first frame with a ▶, or a text post's caption — with the card's badge on
 *  it, so it's clear which post this is. Facebook's picture links expire: one that no
 *  longer loads shows the caption instead of a broken image. */
function PostPreview({ it, chip }) {
  const [broken, setBroken] = useState(false)
  const src = broken ? null : mediaSrc(it.media_url)
  const still = src && (it.media_kind === 'image' || it.media_thumb)
  const body = still ? (
    <img src={src} alt="" onError={() => setBroken(true)} className="h-full w-full object-contain" />
  ) : src ? (
    <>
      <video src={`${src}#t=0.1`} preload="metadata" muted playsInline disablePictureInPicture onError={() => setBroken(true)} className="pointer-events-none h-full w-full object-contain" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-night-950/55 text-white">
          <FiPlay size={16} className="ml-0.5" />
        </span>
      </span>
    </>
  ) : (
    <p className="line-clamp-5 h-full whitespace-pre-line px-5 pb-4 pt-11 text-[12.5px] leading-relaxed text-ink-700">{it.caption || it.title}</p>
  )
  const Box = it.link ? 'a' : 'div'
  return (
    <Box
      {...(it.link ? { href: it.link, target: '_blank', rel: 'noreferrer', title: 'Open the post on ' + it.channel } : {})}
      className="group relative isolate block h-52 overflow-hidden border-b border-ink-100 bg-canvas"
    >
      {body}
      <span className={`absolute left-3 top-3 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-xs ${chip.cls}`}>{chip.text}</span>
      {/* the headline number, on the post itself */}
      <span className="absolute bottom-2.5 left-2.5 inline-flex items-baseline gap-1 rounded-xl bg-white px-2.5 py-1 shadow-card">
        <b className="text-[17px] font-extrabold leading-none tracking-tight text-ink-900">{it.ratio}×</b>
        <span className="text-[10.5px] font-semibold text-ink-500">your usual</span>
      </span>
      {it.link && (
        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-night-950/60 px-2 py-0.5 text-[10.5px] font-semibold text-white opacity-90 group-hover:opacity-100">
          View on {it.channel === 'facebook' ? 'Facebook' : it.channel} <FiExternalLink size={10} />
        </span>
      )}
    </Box>
  )
}

/** One boost pick, read at a glance by a business owner: what the attention is
 *  made of (a donut: reactions / comments / shares), how far above the usual
 *  post it is, and where it stands on the road to a boost (beat the average →
 *  brought leads → boost). The budget and the approve button only show once
 *  leads came from it. */
export default function BoostCard({ it, amount, skipped, boosting, onAmount, onApprove, onSkip }) {
  const parts = MIX.map((m) => ({ slug: m.id, label: m.label, color: m.color, value: it.mix?.[m.id] || 0 }))
  const total = parts.reduce((s, p) => s + p.value, 0)
  const talk = total ? Math.round(((parts[1].value + parts[2].value) / total) * 100) : 0
  const chip =
    it.kind === 'boost'
      ? { text: `Boost · suggested $${it.budget}`, cls: 'bg-emerald-50 border-emerald-200/60 text-emerald-700' }
      : it.kind === 'skip'
        ? { text: "Don't boost", cls: 'bg-ink-100 border-ink-200/60 text-ink-600' }
        : { text: 'Link leads to decide', cls: 'bg-amber-50 border-amber-200/60 text-amber-800' }
  const steps = [
    { label: 'Beat your average', done: true },
    { label: it.leads ? `${it.leads} lead${it.leads > 1 ? 's' : ''}` : 'Brought leads', done: it.leads > 0, now: !it.leads },
    { label: 'Boost', done: false, now: it.kind === 'boost' },
  ]
  const channel = it.channel.charAt(0).toUpperCase() + it.channel.slice(1)

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <PostPreview it={it} chip={chip} />
      <div className="flex flex-1 flex-col p-5">
      <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900" title={it.summary || it.title}>
        {it.title}
      </h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-400">
        <span>
          {channel} · {new Date(it.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
        {/* what the AI says it's about, as labels */}
        {[it.tags?.topic, it.tags?.audience].filter(Boolean).map((t) => (
          <span key={t} className="rounded-full bg-ink-100 px-2 py-px text-[10.5px] font-medium text-ink-600">
            {t.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* the value at a glance */}
      <dl className="mt-4 grid grid-cols-3 divide-x divide-ink-100 rounded-xl bg-canvas py-2.5 text-center">
        {[
          ['Reached', fmtNum(it.reach)],
          ['Engaged', fmtNum(total)],
          ['Leads', it.leads],
        ].map(([k, v]) => (
          <div key={k}>
            <dd className={`text-[17px] font-bold leading-tight tabular-nums ${k === 'Leads' && !it.leads ? 'text-ink-400' : 'text-ink-900'}`}>{v}</dd>
            <dt className="text-[10.5px] font-medium uppercase tracking-wider text-ink-400">{k}</dt>
          </div>
        ))}
      </dl>

      {/* what the attention is made of */}
      <div className="mt-4 flex items-center gap-3.5">
        <Donut segments={parts} size={68} stroke={10} label="Engagement" of="by kind">
          <span className="text-[11px] font-bold text-ink-700">{talk}%</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-snug text-ink-800">
            {!total ? 'No reactions yet' : talk >= 20 ? 'People are talking about it' : 'Mostly likes'}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{talk}% comments and shares</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-600">
            {parts.map((p) => (
              <span key={p.slug} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                {p.label} <b className="font-semibold tabular-nums text-ink-800">{fmtNum(p.value)}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* where it stands on the road to a boost */}
      <ol className="mt-4 flex items-center gap-1.5 text-[11px]">
        {steps.map((s, i) => (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                s.done ? 'bg-emerald-600 text-white' : s.now ? 'border-2 border-amber-400 text-amber-700' : 'border border-ink-200 text-ink-400'
              }`}
            >
              {s.done ? <FiCheck className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate ${s.done ? 'font-medium text-ink-800' : s.now ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="h-px min-w-[8px] flex-1 bg-ink-200" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {it.kind !== 'check' && <p className="mt-2.5 text-[12px] leading-relaxed text-ink-700">{it.reason}</p>}
      {it.kind === 'check' && it.channel === 'facebook' && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-600">
          <b className="text-ink-800">Suggested test: $10.</b> No lead is linked to this post yet, so start small — link leads to see if it pays before spending more.
        </p>
      )}

      {it.kind === 'boost' && (
        <div className="mt-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Budget</div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {it.tiers.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onAmount(amt)}
                className={`relative rounded-xl border p-2 text-left transition-all ${
                  amount === amt ? 'border-brand bg-brand-soft/30 shadow-xs' : 'border-ink-200 hover:bg-ink-50/70'
                }`}
              >
                {amt === it.budget && (
                  <span className="absolute -top-2 right-1.5 rounded-full bg-brand px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-white">
                    Suggested
                  </span>
                )}
                <div className="text-[13px] font-bold text-ink-900">${amt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 border-t border-ink-100 pt-3">
          {boosting ? (
            <span className="text-[12px] font-semibold text-emerald-700">Boosting now — see Your boosts below</span>
          ) : it.kind === 'boost' ? (
            skipped ? (
              <span className="text-[12px] italic text-ink-400">Skipped</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark"
                >
                  Approve boost · ${amount}
                </button>
                <button type="button" onClick={onSkip} className="text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800">
                  Skip
                </button>
              </>
            )
          ) : (
            <>
              {it.kind === 'check' ? (
                <Link to="/leads" className="btn-outline">
                  Link leads from this post
                </Link>
              ) : (
                <span className="text-[12px] text-ink-500">Likes, not buyers.</span>
              )}
              {/* the owner's call: boost it without leads to judge by — a small test, not a proven spend */}
              {it.channel === 'facebook' && (
                <button type="button" onClick={onApprove} className="ml-auto rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark">
                  Test boost · $10
                </button>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
