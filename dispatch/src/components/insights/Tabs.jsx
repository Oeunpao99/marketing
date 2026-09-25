// Building blocks for the Analytics tabs (Overview · Performance · Content ·
// Insights & Actions). Same chart rules as Overview.jsx: platform colours from
// platformHue (fixed order, validated), accent = slot-1 blue, hairline axes,
// text in ink tokens, every number also printed as text.
import { Link } from 'react-router-dom'
import {
  FiArrowRight,
  FiArrowUpRight,
  FiArrowDownRight,
  FiClock,
  FiGrid,
  FiHash,
  FiImage,
  FiLayers,
  FiMessageCircle,
  FiPlay,
  FiRepeat,
  FiTarget,
} from 'react-icons/fi'
import { fmtNum, platformHue } from './Overview'

const ACCENT = '#2a78d6'
export const cardCls = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

// ── Tabs ──────────────────────────────────────────────────────────────────
export function TabBar({ tabs, value, onChange }) {
  return (
    <div className="mb-6 border-b border-ink-200/80" role="tablist" aria-label="Analytics sections">
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
              value === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600">{t.badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
            value === o.id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70'
          }`}
        >
          {o.dot && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Stat tile: value, % change, 12-bucket mini bars ───────────────────────
export function PctChange({ current, previous }) {
  if (current == null || previous == null || !(previous > 0)) {
    return <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">no prior data</span>
  }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">±0%</span>
  const up = pct > 0
  const Arrow = up ? FiArrowUpRight : FiArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${up ? 'bg-emerald-50 text-[#006300]' : 'bg-red-50 text-red-700'}`}>
      <Arrow size={12} aria-hidden="true" />
      {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MiniBars({ values }) {
  const max = Math.max(...values, 0)
  if (!(max > 0)) return <span className="text-[10.5px] text-ink-300">no trend yet</span>
  return (
    <div className="flex h-8 items-end gap-[2px]" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[4px] rounded-t-[2px]"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === values.length - 1 ? ACCENT : '#c9d6e8' }}
        />
      ))}
    </div>
  )
}

/** Sum a daily array into `n` equal buckets for the mini bars. */
export function bucket(values, n = 12) {
  if (!values?.length) return []
  const size = Math.max(1, Math.ceil(values.length / n))
  const out = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size).reduce((a, b) => a + b, 0))
  return out
}

export function StatTile({ label, value, current, previous, bars, hint }) {
  return (
    <div className={`${cardCls} min-w-0 p-4`}>
      <div className="truncate text-[12.5px] text-ink-600">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-ink-900">{value}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <PctChange current={current} previous={previous} />
          {hint && <div className="mt-1 truncate text-[10.5px] text-ink-400">{hint}</div>}
        </div>
        <MiniBars values={bars || []} />
      </div>
    </div>
  )
}

// ── Platform performance bars ─────────────────────────────────────────────
export function PlatformBars({ rows, icons }) {
  if (!rows.length) return <p className="py-8 text-center text-[12.5px] text-ink-400">No published posts in this period.</p>
  const max = Math.max(...rows.map((r) => r.engagement || 0), 1)
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => {
        const Icon = icons[r.slug] || FiGrid
        const facts = [
          r.views != null && `${fmtNum(r.views)} views`,
          r.rate != null && `${r.rate.toFixed(1)}% eng.`,
          r.clicks != null && `${fmtNum(r.clicks)} clicks`,
          `${r.posts} post${r.posts === 1 ? '' : 's'}`,
        ].filter(Boolean)
        return (
          <li key={r.slug} className="py-3.5 first:pt-0 last:pb-0">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: platformHue(r.slug) }}>
                <Icon size={13} aria-hidden="true" />
              </span>
              <span className="text-[13px] font-semibold text-ink-900">{r.label}</span>
              <span className="ml-auto truncate text-[11.5px] text-ink-500">{facts.join(' · ')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-ink-100">
                {r.reported ? (
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((r.engagement || 0) / max) * 100)}%`, background: platformHue(r.slug) }} />
                ) : null}
              </div>
              <span className="w-24 text-right text-[12px] tabular-nums text-ink-700">
                {r.reported ? `${fmtNum(r.engagement)} eng.` : <span className="text-ink-400">not reported</span>}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Content: top posts as cards ───────────────────────────────────────────
export function TopContentGrid({ rows, icons, mediaSrc, onOpen, engagementOf }) {
  if (!rows.length) {
    return (
      <div className={`${cardCls} py-12 text-center text-[12.5px] text-ink-400`}>
        No posts with likes, comments or views in this period yet.
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((it, i) => {
        const m = it.metrics || {}
        const Icon = icons[it.platform_slug] || FiGrid
        const src = mediaSrc(it.media_url)
        const e = engagementOf(m)
        const rate = m.views ? (e / m.views) * 100 : null
        const extra = [
          ['comments', m.comments],
          ['shares', m.shares],
          ['clicks', m.clicks],
        ]
          .filter(([, v]) => v != null)
          .sort((a, b) => b[1] - a[1])[0]
        const title = (it.caption || it.title || '').replace(/#[\p{L}\p{N}_]+/gu, '').trim() || 'Untitled'
        return (
          <button
            key={it.target_id}
            type="button"
            onClick={() => onOpen(it)}
            className={`${cardCls} group flex flex-col items-stretch justify-start overflow-hidden text-left transition-shadow hover:shadow-card-hover`}
          >
            <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-ink-100">
              {src && it.media_kind === 'image' ? (
                <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : src && it.media_kind === 'video' ? (
                <video src={src} className="absolute inset-0 h-full w-full object-cover" muted />
              ) : (
                <FiImage size={22} className="text-ink-300" />
              )}
              <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-ink-800 shadow-sm">#{i + 1}</span>
              <span
                className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full text-white ring-2 ring-white"
                style={{ background: platformHue(it.platform_slug) }}
              >
                <Icon size={11} aria-hidden="true" />
              </span>
              {it.media_kind === 'video' && (
                <span className="absolute bottom-2.5 left-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
                  <FiPlay size={12} aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="p-3.5">
              <div className="line-clamp-2 min-h-[36px] text-[13px] font-semibold leading-snug text-ink-900">{title}</div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                <span>
                  <b className="font-semibold text-ink-900">{fmtNum(e)}</b> eng.
                </span>
                {m.views != null && (
                  <span>
                    <b className="font-semibold text-ink-900">{fmtNum(m.views)}</b> views
                  </span>
                )}
                {rate != null && (
                  <span>
                    <b className="font-semibold text-ink-900">{rate.toFixed(1)}%</b> rate
                  </span>
                )}
                {extra && extra[1] > 0 && (
                  <span>
                    <b className="font-semibold text-ink-900">{fmtNum(extra[1])}</b> {extra[0]}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Insights & Actions ────────────────────────────────────────────────────
const KIND_ICON = { format: FiPlay, timing: FiClock, platform: FiLayers, questions: FiMessageCircle, hashtags: FiHash, rhythm: FiRepeat }

export function InsightCards({ items }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind] || FiTarget
        const max = Math.max(...it.evidence.map((e) => e.value), 1)
        return (
          <article key={it.id} className="flex flex-col rounded-xl border border-ink-200/70 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-semibold leading-snug text-ink-900">{it.title}</h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{it.detail}</p>
              </div>
            </div>
            {it.evidence.length > 0 && (
              <ul className="mt-3 space-y-1.5 pl-12">
                {it.evidence.map((e, i) => (
                  <li key={e.label} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-24 flex-none truncate text-ink-600">{e.label}</span>
                    <span className="h-1.5 flex-1 rounded-full bg-ink-100">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(3, (e.value / max) * 100)}%`, background: i === 0 ? ACCENT : '#c3c2b7' }}
                      />
                    </span>
                    <span className="w-28 flex-none text-right tabular-nums text-ink-700">
                      {e.share != null ? `${Math.round(e.share * 100)}%` : e.value.toFixed(1)}
                      {e.count != null && <span className="text-ink-400"> · {e.count} post{e.count === 1 ? '' : 's'}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to={it.action.to} className="mt-3 inline-flex items-center gap-1 self-start pl-12 text-[12px] font-semibold text-brand hover:underline">
              {it.action.label} <FiArrowRight size={12} aria-hidden="true" />
            </Link>
          </article>
        )
      })}
    </div>
  )
}

export function Funnel({ steps }) {
  const views = steps.find((s) => s.id === 'views')?.value || 0
  return (
    <div className="grid grid-cols-2 gap-x-10 gap-y-6 lg:grid-cols-4">
      {steps.map((s, i) => {
        const pct = s.id === 'posts' ? null : s.id === 'views' ? (views > 0 ? 100 : null) : views > 0 ? (s.value / views) * 100 : null
        // True share of views — no stretching, so a 5% step looks like 5%.
        const width = s.id === 'posts' ? 100 : pct == null ? 0 : Math.max(2, Math.min(100, pct))
        return (
          <div key={s.id} className="relative min-w-0">
            {i > 0 && <FiArrowRight className="absolute -left-7 top-2 hidden text-ink-300 lg:block" size={14} aria-hidden="true" />}
            <div className="text-[24px] font-bold leading-none tracking-tight text-ink-900">{fmtNum(s.value)}</div>
            <div className="mt-1 text-[12px] text-ink-600">{s.label}</div>
            <div className="mt-3 h-2 rounded-full bg-ink-100">
              <div className="h-full rounded-full" style={{ width: `${width}%`, background: s.id === 'posts' ? '#c3c2b7' : ACCENT, opacity: 1 - i * 0.15 }} />
            </div>
            <div className="mt-1.5 text-[11px] text-ink-500">
              {s.id === 'posts'
                ? 'posts in this period'
                : pct == null
                  ? 'not reported yet'
                  : s.id === 'views'
                    ? `from ${s.covers} post${s.covers === 1 ? '' : 's'}`
                    : `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of views`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ActionCards({ items }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((a) => (
        <div key={a.id} className={`${cardCls} flex flex-col p-4`}>
          <div className="text-[14px] font-semibold text-ink-900">{a.title}</div>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-600">{a.why}</p>
          <Link to={a.to} className="btn-primary mt-4 self-start">
            {a.label}
          </Link>
        </div>
      ))}
    </div>
  )
}

export function WeekCompare({ rows }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <div className="text-[22px] font-bold leading-tight tracking-tight text-ink-900">{r.value == null ? '—' : fmtNum(r.value)}</div>
          <div className="text-[12px] text-ink-600">{r.label}</div>
          <div className="mt-1.5">
            <PctChange current={r.value} previous={r.previous} />
          </div>
        </div>
      ))}
    </div>
  )
}
