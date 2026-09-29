import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiExternalLink,
  FiGlobe,
  FiInfo,
  FiMonitor,
  FiRefreshCw,
  FiShare2,
  FiSmartphone,
  FiXCircle,
  FiZap,
} from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import Select from '../components/ui/Select'

// Website check (backend app/website.py): is the brand's site working, can
// Google find it, does it look good when shared, how fast is it, and is the
// domain / email safe — with the AI's top fixes. Re-checked weekly.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const input =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'

// Score bands, each with a word so colour is never the only signal.
const band = (s) =>
  s == null
    ? { word: '—', color: 'rgb(var(--ink-300))', text: 'text-ink-500' }
    : s >= 80
      ? { word: 'Good', color: '#0ca30c', text: 'text-emerald-700' }
      : s >= 50
        ? { word: 'Needs work', color: '#e59b00', text: 'text-amber-700' }
        : { word: 'Poor', color: '#d03b3b', text: 'text-red-600' }

const STATUS = {
  fail: { icon: FiXCircle, cls: 'text-red-600', word: 'Fix' },
  warn: { icon: FiAlertTriangle, cls: 'text-amber-600', word: 'Improve' },
  pass: { icon: FiCheckCircle, cls: 'text-emerald-600', word: 'Good' },
  info: { icon: FiInfo, cls: 'text-ink-400', word: 'Note' },
}
const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 }

const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' }) : ''

function Ring({ value, size = 120, stroke = 11, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const b = band(value)
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label || 'Score'}: ${value ?? 'none'}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--ink-100))' }} />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * c} ${c}`}
            style={{ stroke: b.color, transition: 'stroke-dasharray .6s ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-bold leading-none tabular-nums text-ink-900" style={{ fontSize: size * 0.3 }}>
            {value ?? '—'}
          </div>
          {size >= 90 && <div className={`mt-1 text-[11px] font-semibold ${b.text}`}>{b.word}</div>}
        </div>
      </div>
    </div>
  )
}

function Trend({ history }) {
  const pts = (history || []).filter((h) => h.score != null).slice(-12)
  if (pts.length < 2) return null
  const W = 120
  const H = 32
  const x = (i) => (i / (pts.length - 1)) * W
  const y = (v) => H - (v / 100) * H
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-500" title="Score over the last checks">
      <svg width={W} height={H} className="overflow-visible">
        <path d={d} fill="none" strokeWidth="2" style={{ stroke: 'rgb(var(--brand))' }} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].score)} r="3" style={{ fill: 'rgb(var(--brand))' }} />
      </svg>
      last {pts.length} checks
    </div>
  )
}

/** What a posted link looks like on Facebook / Telegram. */
function SharePreview({ preview }) {
  const [broken, setBroken] = useState(false)
  if (!preview?.site) return null
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50/60">
      {preview.image && !broken ? (
        <img src={preview.image} alt="" onError={() => setBroken(true)} className="aspect-[1.91/1] w-full bg-ink-100 object-cover" />
      ) : (
        <div className="grid aspect-[1.91/1] w-full place-items-center bg-ink-100 text-[12px] text-ink-400">No share image</div>
      )}
      <div className="px-3.5 py-2.5">
        <div className="text-[10.5px] uppercase tracking-wide text-ink-400">{preview.site}</div>
        <div className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-900">{preview.title || 'No title'}</div>
        {preview.description && <div className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">{preview.description}</div>}
      </div>
    </div>
  )
}

const PS_LABELS = [
  ['performance', 'Speed'],
  ['seo', 'SEO'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best practices'],
]

function GoogleScores({ pagespeed }) {
  const any = ['mobile', 'desktop'].some((k) => pagespeed?.[k]?.scores)
  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink-900">Google’s scores</h2>
        <span className="text-[11.5px] text-ink-400">Google PageSpeed Insights · 0–100</span>
      </div>
      {any ? (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {[
            ['mobile', 'Phone', FiSmartphone],
            ['desktop', 'Computer', FiMonitor],
          ].map(([k, label, Icon]) => {
            const r = pagespeed?.[k]
            return (
              <div key={k} className="rounded-xl bg-ink-50/60 p-4">
                <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
                  <Icon size={14} /> {label}
                </div>
                {r?.scores ? (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {PS_LABELS.map(([key, name]) => (
                        <div key={key} className="flex flex-col items-center gap-1">
                          <Ring value={r.scores[key]} size={62} stroke={6} label={name} />
                          <span className="text-center text-[10.5px] leading-tight text-ink-500">{name}</span>
                        </div>
                      ))}
                    </div>
                    {r.metrics && Object.keys(r.metrics).length > 0 && (
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-[11.5px]">
                        {Object.entries(r.metrics).map(([m, v]) => (
                          <div key={m} className="flex justify-between gap-2">
                            <dt className="text-ink-500">{m}</dt>
                            <dd className="font-semibold tabular-nums text-ink-800">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-ink-500">{r?.error || 'Google didn’t answer this time.'}</p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
          Google’s scores didn’t come back this time
          {pagespeed?.mobile?.error ? ` (${pagespeed.mobile.error.slice(0, 90)})` : ''}. Ask your admin to add a free Google
          PageSpeed API key — then every check includes them.
        </p>
      )}
    </section>
  )
}

function Section({ s }) {
  const [showPassed, setShowPassed] = useState(false)
  const items = [...s.items].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const problems = items.filter((i) => i.status === 'fail' || i.status === 'warn').length
  const visible = showPassed ? items : items.filter((i) => i.status !== 'pass')
  const b = band(s.score)
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <Ring value={s.score} size={46} stroke={5} label={s.title} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold text-ink-900">{s.title}</h3>
          <p className={`text-[12px] ${problems ? b.text : 'text-emerald-700'}`}>
            {problems ? `${problems} thing${problems === 1 ? '' : 's'} to improve` : 'All good'}
          </p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-ink-100">
        {visible.map((i) => {
          const st = STATUS[i.status] || STATUS.info
          return (
            <li key={i.key} className="flex gap-2.5 py-2.5">
              <st.icon size={15} className={`mt-0.5 flex-none ${st.cls}`} aria-label={st.word} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-ink-800">{i.label}</div>
                <div className="break-words text-[12px] leading-snug text-ink-500">{i.detail}</div>
                {i.fix && i.status !== 'pass' && <div className="mt-1 text-[12px] leading-snug text-ink-700">→ {i.fix}</div>}
              </div>
            </li>
          )
        })}
        {visible.length === 0 && <li className="py-2.5 text-[12px] text-ink-500">Everything here passed.</li>}
      </ul>
      {items.some((i) => i.status === 'pass') && (
        <button type="button" onClick={() => setShowPassed((v) => !v)} className="mt-1 text-[12px] font-semibold text-brand hover:underline">
          {showPassed ? 'Hide passed checks' : `Show ${items.filter((i) => i.status === 'pass').length} passed checks`}
        </button>
      )}
    </section>
  )
}

function JobBar({ job }) {
  return (
    <div className={`${card} px-5 py-4`}>
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="truncate font-medium text-brand">{job.step || 'Checking…'}</span>
        <span className="font-semibold tabular-nums text-ink-700">{job.progress || 0}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-soft">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${job.progress || 0}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">Takes about a minute — you can leave this page.</p>
    </div>
  )
}

export default function WebsitePage() {
  const { brands, activeBrand, switchBrand, showToast } = useStore()
  const brand = brands.find((b) => b.slug === activeBrand) || brands[0]
  const [data, setData] = useState(null)
  const [domain, setDomain] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const poll = useRef(null)

  const load = useCallback(async () => {
    if (!brand) return
    try {
      const d = await api.get(`/website?brand_id=${brand.id}`)
      setData(d)
      setDomain(d.website?.domain || '')
    } catch (e) {
      showToast(e.message)
    }
  }, [brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null)
    setEditing(false)
    load()
  }, [load])

  const job = data?.job
  useEffect(() => {
    clearInterval(poll.current)
    if (job?.status !== 'running' || !brand) return
    poll.current = setInterval(async () => {
      try {
        const next = await api.get(`/website/job?brand_id=${brand.id}`)
        if (next.status === 'running') return setData((d) => (d ? { ...d, job: next } : d))
        clearInterval(poll.current)
        if (next.status === 'failed') showToast(next.error || 'The check failed')
        load()
      } catch {
        /* try again next tick */
      }
    }, 2000)
    return () => clearInterval(poll.current)
  }, [job?.status, brand?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!domain.trim() || busy) return
    setBusy(true)
    try {
      const d = await api.put('/website', { brand_id: brand.id, domain: domain.trim() })
      setData(d)
      setEditing(false)
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const recheck = async () => {
    try {
      const j = await api.post(`/website/check?brand_id=${brand.id}`)
      setData((d) => ({ ...d, job: j }))
    } catch (e) {
      showToast(e.message)
    }
  }

  if (!brand) return <div className="w-full px-5 lg:px-8 py-7 text-[13px] text-ink-500">Create a brand first.</div>

  const site = data?.website
  const r = site?.result
  const running = job?.status === 'running'
  const ai = r?.ai
  const sections = (r?.sections || []).filter((s) => s.key !== 'speed')

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">Website check</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            Is your website working, can Google find it, and does it look good when you share it — checked every week.
          </p>
        </div>
        {brands.length > 1 && (
          <Select
            align="right"
            value={brand.slug}
            onChange={switchBrand}
            buttonClassName="font-medium"
            options={brands.map((b) => ({ value: b.slug, label: b.name, color: colorForBrand(b.slug) }))}
          />
        )}
      </div>

      {data === null ? (
        <div className={`${card} h-48 skeleton`} />
      ) : !site || editing ? (
        /* set the website */
        <section className={`${card} mx-auto max-w-2xl p-7 text-center`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <FiGlobe size={24} />
          </div>
          <h2 className="text-[17px] font-bold text-ink-900">{site ? 'Change the website' : `Check ${brand.name}’s website`}</h2>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-500">
            Enter the address. We check it’s online and secure, how Google sees it, how it looks when shared on Facebook
            and Telegram, its speed, and the domain and email — then the AI lists what to fix first.
          </p>
          <div className="mx-auto mt-5 flex max-w-md gap-2">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="example.com"
              className={input}
              autoFocus
            />
            <button type="button" onClick={save} disabled={busy || !domain.trim()} className="btn-primary flex-none px-4">
              {busy ? 'Starting…' : 'Check'}
            </button>
          </div>
          {site && (
            <button type="button" onClick={() => setEditing(false)} className="mt-3 text-[12px] font-semibold text-ink-500 hover:text-ink-800">
              Cancel
            </button>
          )}
        </section>
      ) : (
        <div className="space-y-4">
          {running && <JobBar job={job} />}

          {!r && !running && (
            <section className={`${card} p-6 text-center text-[13px] text-ink-500`}>
              No results yet.{' '}
              <button type="button" onClick={recheck} className="font-semibold text-brand hover:underline">
                Check now
              </button>
            </section>
          )}

          {r && (
            <>
              {/* score + summary + share preview */}
              <section className={`${card} grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]`}>
                <div className="flex flex-col gap-5 sm:flex-row">
                  <Ring value={r.score} size={132} stroke={12} label="Website score" />
                  <div className="min-w-0 flex-1">
                    <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[16px] font-bold text-ink-900 hover:text-brand">
                      {site.domain} <FiExternalLink size={13} />
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                      <span>Checked {when(site.checked_at)}</span>
                      <span>· next check in about a week</span>
                    </div>
                    {ai?.summary && <p className="mt-3 text-[13.5px] leading-relaxed text-ink-800">{ai.summary}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={recheck} disabled={running} className="btn-outline px-3 py-1.5">
                        <FiRefreshCw size={13} /> {running ? 'Checking…' : 'Check again'}
                      </button>
                      <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-3 py-1.5">
                        Change website
                      </button>
                      <Trend history={site.history} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-600">
                    <FiShare2 size={13} /> How your link looks when shared
                  </div>
                  <SharePreview preview={r.preview} />
                </div>
              </section>

              {/* the AI's top fixes */}
              {ai?.fixes?.length > 0 && (
                <section className={`${card} p-5`}>
                  <h2 className="text-[15px] font-bold text-ink-900">Fix these first</h2>
                  <ol className="mt-3 grid gap-3 md:grid-cols-3">
                    {ai.fixes.map((f, n) => (
                      <li key={n} className="rounded-xl bg-ink-50/70 p-4">
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-ink-900 text-[12px] font-bold text-ink-50">{n + 1}</span>
                          <span className="text-[13px] font-semibold text-ink-900">{f.title}</span>
                        </div>
                        {f.why && <p className="mt-2 text-[12px] leading-snug text-ink-600">{f.why}</p>}
                        {f.how && <p className="mt-1.5 text-[12px] leading-snug text-ink-800">→ {f.how}</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <GoogleScores pagespeed={r.pagespeed} />

              <div className="grid gap-4 lg:grid-cols-2">
                {sections.map((s) => (
                  <Section key={s.key} s={s} />
                ))}
              </div>

              {ai?.post_ideas?.length > 0 && (
                <section className={`${card} p-5`}>
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
                    <FiZap size={15} className="text-brand" /> Post ideas from your website
                  </h2>
                  <ul className="mt-3 grid gap-2 md:grid-cols-3">
                    {ai.post_ideas.map((idea, n) => (
                      <li key={n}>
                        <Link
                          to="/ai"
                          state={{ brandSlug: brand.slug, topic: idea }}
                          className="flex h-full items-start justify-between gap-2 rounded-xl border border-ink-100 p-3.5 text-[12.5px] leading-snug text-ink-800 hover:border-brand/40 hover:bg-brand-soft/40"
                        >
                          {idea}
                          <FiChevronDown size={14} className="mt-0.5 flex-none -rotate-90 text-brand" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="text-[11px] leading-relaxed text-ink-400">
                SEO checks read the page’s HTML. Sites built entirely with JavaScript may show fewer headings or links here —
                Google’s scores above load the page like a browser, so trust those for speed.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
