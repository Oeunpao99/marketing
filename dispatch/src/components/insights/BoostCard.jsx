import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiExternalLink, FiPlay } from 'react-icons/fi'
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

/** One boost pick, read at a glance by a business owner: the post itself with how far
 *  above the usual it is, its numbers beside what the attention is made of (a donut),
 *  one line saying what to do about it, and one button. The budget tiers only show
 *  once leads came from it. */
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

      {/* the numbers, beside what the attention is made of */}
      <div className="mt-4 flex items-center gap-4">
        <Donut segments={parts} size={84} stroke={11} label="Engagement" of="by kind">
          <span className="text-[12px] font-bold text-ink-800">{talk}%</span>
        </Donut>
        <dl className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
          {[
            ['Reached', fmtNum(it.reach), ''],
            ['Engaged', fmtNum(total), parts.map((p) => `${p.label} ${fmtNum(p.value)}`).join(' · ')],
            ['Leads', it.leads, ''],
          ].map(([k, v, tip]) => (
            <div key={k} className="flex items-baseline justify-between gap-3" title={tip || undefined}>
              <dt className="text-ink-500">{k}</dt>
              <dd className={`text-[15px] font-bold tabular-nums ${k === 'Leads' && !it.leads ? 'text-ink-400' : 'text-ink-900'}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-ink-500">
        {!total ? 'No reactions yet.' : talk >= 20 ? `${talk}% comments and shares — people are talking about it.` : `Mostly likes — ${talk}% comments and shares.`}
      </p>

      {/* one line: what to do about it */}
      <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[12px] leading-snug text-ink-700">
        {it.kind === 'boost' ? it.reason : it.kind === 'skip' ? 'Likes, not buyers — keep it organic.' : 'No lead linked yet — start with a small test, then link leads to see if it pays.'}
      </p>

      {it.kind === 'boost' && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-2">
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
            <span className="text-[12px] font-semibold text-emerald-700">Boosting now — see Your boosts</span>
          ) : it.kind === 'boost' ? (
            skipped ? (
              <span className="text-[12px] italic text-ink-400">Skipped</span>
            ) : (
              <>
                <button type="button" onClick={onApprove} className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark">
                  Approve boost · ${amount}
                </button>
                <button type="button" onClick={onSkip} className="ml-auto text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800">
                  Skip
                </button>
              </>
            )
          ) : (
            <>
              {it.channel === 'facebook' && (
                <button type="button" onClick={onApprove} className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark">
                  Test boost · $10
                </button>
              )}
              {it.kind === 'check' && (
                <Link to="/leads" className="ml-auto text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800">
                  Link leads
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
