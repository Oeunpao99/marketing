import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiActivity, FiAlertTriangle, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiChevronDown, FiClock, FiCopy, FiCpu, FiFolder, FiKey, FiList, FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiUser, FiZap } from 'react-icons/fi'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { useStore } from '../store'
import Select from '../components/ui/Select'
import CodeBlock from '../components/ui/CodeBlock'

// API & MCP (/developer): the workspace's own API keys (app/api_keys.py), the
// Request Logs and the
// numbers above them (GET /api-keys/usage), and the Quick Start to connect an AI
// assistant or code (app/mcp_server.py). The public docs: /developers.

const BASE = `${window.location.origin}/api/mcp`
const MAX_KEYS = 10 // per workspace — app/api_keys.py MAX_KEYS
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
function ago(iso) {
  if (!iso) return 'Never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Copy({ text, label = 'Copy', icon = false }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={label}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
      className={icon ? 'rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700' : 'inline-flex flex-none items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50'}
    >
      {done ? <FiCheck size={icon ? 14 : 12} /> : <FiCopy size={icon ? 14 : 12} />} {!icon && (done ? 'Copied' : label)}
    </button>
  )
}

// The hero's decoration: how an app calls us, in light editor colours —
// [colour, text] pieces per line ('' = plain).
const HERO_LINES = [
  [['text-ink-400 italic', '// make a Khmer video from your own app']],
  [['text-brand', 'const '], ['', 'job = '], ['text-brand', 'await '], ['text-sky-600', 'smartMarketing'], ['', '.call('], ['text-emerald-600', '"make_video"'], ['', ', {']],
  [['', '  idea: '], ['text-emerald-600', '"Our new iced coffee"'], ['', ',']],
  [['', '  template: '], ['text-emerald-600', '"picture"'], ['', ', language: '], ['text-emerald-600', '"Khmer"']],
  [['', '})']],
  [['text-brand', 'await '], ['text-sky-600', 'smartMarketing'], ['', '.call('], ['text-emerald-600', '"check_job"'], ['', ', { job_id: job.'], ['text-amber-600', 'id'], ['', ' })']],
  [['text-ink-400 italic', '// → { status: "succeeded", url: "…/video.mp4" }']],
]

function HeroCode() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-8 top-[4.75rem] hidden select-none font-mono text-[12px] leading-[1.6] text-ink-600 opacity-60 xl:block"
      style={{ maskImage: 'linear-gradient(to right, transparent, black 30%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 30%)' }}
    >
      {HERO_LINES.map((line, n) => (
        <div key={n} className="flex whitespace-pre">
          <span className="mr-4 w-4 text-right text-ink-300">{n + 1}</span>
          {line.map(([cls, text], i) => (
            <span key={i} className={cls}>
              {text}
            </span>
          ))}
          {n === HERO_LINES.length - 1 && <span className="ml-0.5 inline-block w-[7px] animate-pulse bg-brand/70">&nbsp;</span>}
        </div>
      ))}
    </div>
  )
}

function HeroCopy({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
      className="inline-flex flex-none items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
    >
      {done ? <FiCheck size={12} /> : <FiCopy size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function Code({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed text-ink-800">{children}</code>
      <Copy text={children} />
    </div>
  )
}

/** One number on the dark hero. */
function Stat({ icon: Icon, value, label, extra }) {
  return (
    <div className="min-w-0 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-500">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <b className="text-[24px] font-bold leading-none tabular-nums text-ink-900">{value}</b>
        {extra}
      </div>
    </div>
  )
}

// ── API Keys ──────────────────────────────────────────────────────────────

/** Days until a key stops working (null = never). */
const daysLeft = (k) => (k.expires_at ? Math.ceil((new Date(k.expires_at).getTime() - Date.now()) / 86400000) : null)

/** When a key stops working: Never / a date / "in 5 days" (soon) / Expired — and
 * a bar of the time it has left. */
function Expires({ k }) {
  const days = daysLeft(k)
  if (days == null)
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
        <FiClock size={12} /> Never expires
      </div>
    )
  const span = Math.max(1, (new Date(k.expires_at) - new Date(k.created_at)) / 86400000)
  const left = Math.max(0, Math.min(1, days / span))
  const tone = days <= 0 ? 'bg-red-500' : days <= 7 ? 'bg-amber-500' : 'bg-brand'
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 text-ink-500">
          <FiClock size={12} /> {days <= 0 ? 'Expired' : 'Expires'}
        </span>
        {days <= 0 ? (
          <span className="font-semibold text-red-600">rotate to renew</span>
        ) : days <= 7 ? (
          <span className="font-semibold text-amber-700">in {days} day{days === 1 ? '' : 's'}</span>
        ) : (
          <span className="text-ink-600" title={when(k.expires_at)}>
            {new Date(k.expires_at).toLocaleDateString()} · {days}d left
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${days <= 0 ? 100 : Math.max(4, left * 100)}%` }} />
      </div>
    </div>
  )
}

function KeysTab({ canManage, showToast, onFresh, fresh, onQuickStart }) {
  const [keys, setKeys] = useState(null)
  const [name, setName] = useState('')
  const [project, setProject] = useState('')
  const [expiry, setExpiry] = useState('90') // days, or 'never'
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState('') // '' = every project
  const load = () =>
    api
      .get('/api-keys')
      .then(setKeys)
      .catch(() => setKeys([]))
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const k = await api.post('/api-keys', { name: name.trim() || 'API key', project: project.trim(), expires_days: expiry === 'never' ? null : Number(expiry) })
      onFresh(k) // the pop-up now shows it, once
      setName('')
      load()
    } catch (e) {
      showToast(e.message || 'Could not make the key — try again')
    } finally {
      setBusy(false)
    }
  }
  const rotate = async (k) => {
    if (!window.confirm(`Make a new secret for “${k.name}”? The old one stops working right away — update it wherever it's used.`)) return
    try {
      onFresh(await api.post(`/api-keys/${k.id}/rotate`))
      setAdding(true) // the pop-up shows the new secret
      load()
    } catch (e) {
      showToast(e.message || 'Could not rotate the key')
    }
  }
  const openNew = () => {
    onFresh(null)
    setName('')
    setProject('')
    setExpiry('90')
    setAdding(true)
  }
  const revoke = async (k) => {
    if (!window.confirm(`Revoke “${k.name}”? Anything using it stops working right away.`)) return
    try {
      await api.del(`/api-keys/${k.id}`)
      if (fresh?.id === k.id) onFresh(null)
      load()
      showToast('Key revoked')
    } catch (e) {
      showToast(e.message || 'Could not revoke the key')
    }
  }
  const projects = [...new Set((keys || []).map((k) => k.project).filter(Boolean))] // the filter + the pop-up offer these
  const shown = (keys || []).filter(
    (k) => (!folder || k.project === folder) && (!q.trim() || `${k.name} ${k.project || ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const room = (keys?.length ?? 0) < MAX_KEYS

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-ink-900">
            Your keys <span className="ml-1 text-[13px] font-medium text-ink-400">{keys ? `${keys.length} of ${MAX_KEYS}` : ''}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">A key acts as the person who made it and spends this workspace’s credits.</p>
        </div>
        {canManage && (
          <button type="button" onClick={openNew} disabled={!room} title={room ? '' : `A workspace can have ${MAX_KEYS} keys — revoke one first`} className="btn-primary disabled:opacity-50">
            <FiPlus size={14} /> Create new key
          </button>
        )}
      </div>

      {/* the pop-up: name the key — then the key itself, shown this once */}
      {adding &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !fresh && setAdding(false)}>
            <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-pop animate-fadein">
              {fresh ? (
                <>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <FiCheck size={18} />
                  </span>
                  <h3 className="mt-3 text-[16px] font-bold text-ink-900">“{fresh.name}” is ready</h3>
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                    <FiAlertTriangle size={14} className="mt-0.5 flex-none" /> Copy it now — it won’t be shown again. Keep it on your server, never in a web page.
                  </div>
                  <div className="mt-3">
                    <Code>{fresh.key}</Code>
                  </div>
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => { setAdding(false); onQuickStart() }} className="btn-outline">
                      Connect it — Quick Start
                    </button>
                    <button type="button" onClick={() => setAdding(false)} className="btn-primary">
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand">
                    <FiKey size={17} />
                  </span>
                  <h3 className="mt-3 text-[16px] font-bold text-ink-900">Create new key</h3>
                  <p className="mt-1 text-[12.5px] text-ink-500">Name it after where it’s used, so you know which to revoke later.</p>
                  <span className="mt-4 block text-[12px] font-semibold text-ink-700">Name</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !busy) create()
                      if (e.key === 'Escape') setAdding(false)
                    }}
                    placeholder="e.g. Claude, Our website, POS"
                    maxLength={60}
                    className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand"
                  />
                  <span className="mt-4 block text-[12px] font-semibold text-ink-700">
                    Project <span className="font-normal text-ink-400">— optional, groups your keys</span>
                  </span>
                  <input
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !busy && create()}
                    placeholder="e.g. Shop website, Telegram bot"
                    maxLength={60}
                    className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand"
                  />
                  {projects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {projects.map((p) => (
                        <button key={p} type="button" onClick={() => setProject(p)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${project === p ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
                          <FiFolder size={11} /> {p}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="mt-4 block text-[12px] font-semibold text-ink-700">Expires</span>
                  <div className="mt-1.5">
                    <Select
                      value={expiry}
                      onChange={setExpiry}
                      options={[
                        { value: '7', label: 'In 7 days', hint: 'for a quick test' },
                        { value: '30', label: 'In 30 days' },
                        { value: '90', label: 'In 90 days', hint: 'recommended' },
                        { value: '180', label: 'In 6 months' },
                        { value: '365', label: 'In 1 year' },
                        { value: 'never', label: 'Never', hint: 'revoke it yourself when done' },
                      ]}
                    />
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => setAdding(false)} className="btn-outline">
                      Cancel
                    </button>
                    <button type="button" onClick={create} disabled={busy} className="btn-primary disabled:opacity-50">
                      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <FiKey size={13} />} Create key
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {!canManage && <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">Only an owner or admin can make, rotate or revoke keys.</p>}

      {keys?.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2">
            <FiSearch size={14} className="text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keys or projects…" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400" />
          </div>
          {projects.length > 0 &&
            ['', ...projects].map((p) => (
              <button
                key={p || 'all'}
                type="button"
                onClick={() => setFolder(p)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${folder === p ? 'bg-brand text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
              >
                {p ? <FiFolder size={12} /> : null} {p || 'All projects'}
                <span className={folder === p ? 'text-white/60' : 'text-ink-400'}>{p ? keys.filter((k) => k.project === p).length : keys.length}</span>
              </button>
            ))}
        </div>
      )}

      {keys === null ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-[212px] animate-pulse rounded-2xl bg-ink-100" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-3xl border-2 border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <FiKey size={24} />
          </span>
          <h3 className="mt-4 text-[16px] font-bold text-ink-900">No keys yet</h3>
          <p className="mt-1 max-w-sm text-[13px] text-ink-500">Make a key to connect Claude, ChatGPT, your website or your own code — they can then make videos and pictures here.</p>
          {canManage && (
            <button type="button" onClick={openNew} className="btn-primary mt-5">
              <FiPlus size={14} /> Create your first key
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-8 text-center text-[13px] text-ink-400">No key matches.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((k) => {
            const days = daysLeft(k)
            const live = days == null || days > 0
            return (
              <div key={k.id} className={`group flex flex-col rounded-2xl border bg-white p-4 shadow-card transition hover:-translate-y-0.5 ${live ? 'border-ink-200 hover:border-brand-line' : 'border-red-200'}`}>
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${live ? 'bg-brand-soft text-brand' : 'bg-red-50 text-red-500'}`}>
                    <FiKey size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-ink-900">{k.name}</span>
                      <span className={`inline-flex flex-none items-center gap-1 text-[11px] font-semibold ${live ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-red-500'}`} /> {live ? 'Active' : 'Expired'}
                      </span>
                    </div>
                    {k.project ? (
                      <button type="button" onClick={() => setFolder(k.project)} className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-600 hover:bg-ink-200">
                        <FiFolder size={11} /> <span className="truncate">{k.project}</span>
                      </button>
                    ) : (
                      <span className="mt-1 block text-[11.5px] text-ink-400">No project</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-[12px] tracking-wide">
                  <span className="font-semibold text-brand">sm_</span>
                  <span className="text-ink-300">••••••••••••</span>
                  <span className="font-semibold text-ink-900">{k.hint}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                  <div className="min-w-0">
                    <div className="text-ink-400">Made by</div>
                    <div className="flex items-center gap-1 truncate font-semibold text-ink-700">
                      <FiUser size={11} className="flex-none" /> <span className="truncate">{k.created_by || '—'}</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-ink-400">Last used</div>
                    <div className="truncate font-semibold text-ink-700" title={when(k.last_used_at)}>
                      {ago(k.last_used_at)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-ink-400">Created</div>
                    <div className="truncate font-semibold text-ink-700">{new Date(k.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <Expires k={k} />
                </div>

                {canManage && (
                  <div className="mt-4 flex gap-2 border-t border-ink-100 pt-3">
                    <button type="button" onClick={() => rotate(k)} title="A new secret — the old one stops" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-200">
                      <FiRefreshCw size={12} /> {live ? 'Rotate' : 'Renew'}
                    </button>
                    <button type="button" onClick={() => revoke(k)} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-500 hover:bg-red-50 hover:text-red-600">
                      <FiTrash2 size={12} /> Revoke
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {canManage && room && !q && !folder && (
            <button type="button" onClick={openNew} className="flex min-h-[212px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 text-ink-400 transition hover:border-brand hover:text-brand">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-100">
                <FiPlus size={18} />
              </span>
              <span className="text-[13px] font-semibold">New key</span>
              <span className="text-[11.5px]">for another app or project</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Request Logs ──────────────────────────────────────────────────────────

function LogsTab({ usage }) {
  const logs = usage?.logs || []
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="border-b border-ink-200 bg-ink-50 text-[12px] text-ink-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Time</th>
            <th className="px-4 py-2.5 font-semibold">Tool</th>
            <th className="px-4 py-2.5 font-semibold">Key</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {usage === null ? (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-ink-400">Loading…</td>
            </tr>
          ) : logs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-400">No calls yet.</td>
            </tr>
          ) : (
            logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{when(l.at)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-ink-900">
                  {l.tool}
                  {l.job_id ? <span className="ml-1.5 font-sans font-normal text-ink-400">job {l.job_id}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-ink-600">{l.key}</td>
                <td className="px-4 py-2.5">
                  {l.ok ? (
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">OK</span>
                  ) : (
                    <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-red-700" title={l.error}>
                      Error
                    </span>
                  )}
                  {!l.ok && l.error && <span className="ml-2 text-[12px] text-ink-500">{l.error}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-600">{l.ms < 1000 ? `${l.ms} ms` : `${(l.ms / 1000).toFixed(1)} s`}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Quick Start ───────────────────────────────────────────────────────────

// What to ask once it's connected — copied in one tap.
const ASK_IDEAS = [
  'Make a 1-minute Khmer Picture story video about our new iced coffee.',
  'Show me the video templates, then make a Top 5 countdown of tips for our customers.',
  'Make a 4:5 poster for our weekend promotion, with our logo.',
  'How many credits do I have left?',
]

function QuickStartTab({ fresh }) {
  const key = fresh?.key || 'YOUR_API_KEY'
  const [app, setApp] = useState('claude')
  const [ask, setAsk] = useState(false) // the "Then just ask" examples, folded
  const APPS = {
    claude: {
      label: 'Claude',
      steps: ['In Claude (claude.ai or the desktop app) open Settings → Connectors → Add custom connector.', 'Name it “Smart Marketing” and paste this link as the URL.'],
      file: 'Connector URL',
      code: `${BASE}/${key}`,
    },
    chatgpt: {
      label: 'ChatGPT',
      steps: ['In ChatGPT open Settings → Apps & Connectors → Advanced, turn on Developer mode, then Create.', 'Paste this link as the MCP server URL — no sign-in needed, the key is in it.'],
      file: 'MCP server URL',
      code: `${BASE}/${key}`,
    },
    code: {
      label: 'Claude Code',
      steps: ['Run this in a terminal, in your project folder.', 'Start Claude Code — “smart-marketing” is in its tools.'],
      file: 'Terminal',
      code: `claude mcp add --transport http smart-marketing \\n  ${BASE} \\n  --header "Authorization: Bearer ${key}"`,
    },
    other: {
      label: 'Cursor · others',
      steps: ['Open the app’s MCP settings (Cursor: Settings → MCP → Add new server, or .cursor/mcp.json).', 'Add this server — it speaks Streamable HTTP.'],
      file: 'mcp.json',
      code: JSON.stringify({ mcpServers: { 'smart-marketing': { url: BASE, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    },
    curl: {
      label: 'Your code',
      steps: ['Any language: POST JSON-RPC to one link, with the key as a Bearer token.', 'This asks for the templates — swap the tool name and arguments for the rest.'],
      file: 'cURL',
      code: `curl ${BASE} \\n  -H "Authorization: Bearer ${key}" \\n  -H "Content-Type: application/json" \\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",\n       "params":{"name":"list_templates","arguments":{}}}'`,
    },
  }
  const a = APPS[app]
  return (
    <div className="w-full">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex">
          {Object.entries(APPS).map(([id, x]) => (
            <button key={id} type="button" onClick={() => setApp(id)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${app === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
              {x.label}
            </button>
          ))}
        </div>
        <ol className="mt-5 space-y-3">
          {a.steps.map((s, n) => (
            <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-ink-700">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{n + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <CodeBlock code={a.code} label={a.file} wrap={app === 'claude' || app === 'chatgpt'} />
        </div>
        {fresh ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-emerald-700">
            <FiCheckCircle size={13} /> Your new key is already filled in.
          </p>
        ) : (
          <p className="mt-2.5 flex items-start gap-1.5 text-[12px] text-ink-500">
            <FiKey size={13} className="mt-0.5 flex-none" /> Put your key where it says <code className="rounded bg-ink-100 px-1 font-mono text-[11px] text-ink-800">YOUR_API_KEY</code> — or create one on the API Keys tab and it’s filled in here.
          </p>
        )}
        {/* what to ask once it's connected — one button until it's opened */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setAsk((v) => !v)}
            aria-expanded={ask}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition ${ask ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'}`}
          >
            <FiZap size={13} /> Then just ask — see examples
            <FiChevronDown size={14} className={`transition-transform ${ask ? 'rotate-180' : ''}`} />
          </button>
          {ask && (
            <div className="mt-2 rounded-2xl border border-ink-200 bg-white p-4 animate-fadein">
              <p className="text-[12.5px] text-ink-500">Once it’s connected, talk to it in your own words:</p>
              <ul className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
          {ASK_IDEAS.map((q) => (
            <li key={q} className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-800">
              <span className="min-w-0 flex-1">“{q}”</span>
              <Copy text={q} icon />
            </li>
          ))}
              </ul>
              <a href="/developers" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline">
                <FiBookOpen size={13} /> Examples in Python, Next.js, Java, PHP · all tools
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── the page ──────────────────────────────────────────────────────────────

export default function ApiPage() {
  const { user } = useAuth()
  const { showToast } = useStore()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [tab, setTab] = useState('keys')
  const [fresh, setFresh] = useState(null) // a key just made or rotated — shown this once
  const [usage, setUsage] = useState(null)
  const loadUsage = () =>
    api
      .get('/api-keys/usage')
      .then(setUsage)
      .catch(() => setUsage({ logs: [] }))
  useEffect(() => {
    loadUsage()
  }, [])
  // vs yesterday — only once today has calls (a red "↘100%" on a quiet morning read as an error)
  const delta = usage && usage.yesterday && usage.today ? Math.round(((usage.today - usage.yesterday) / usage.yesterday) * 100) : null

  return (
    <div className="w-full px-5 pt-6 pb-16 lg:px-10 animate-fadein">
      <section className="relative overflow-hidden rounded-3xl border border-ink-200 bg-white px-6 py-6 text-ink-900 shadow-card sm:px-8 sm:py-7">
        {/* a faint call to the API on the right, behind everything (wide screens) */}
        <HeroCode />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand">
              <FiCpu size={12} /> For developers
            </span>
            <h1 className="mt-3 text-[28px] font-bold leading-tight sm:text-[32px]">API & MCP</h1>
            <p className="mt-1 max-w-xl text-[13.5px] text-ink-500">Let your app, chatbot or AI assistant make videos and pictures in this workspace — with your templates, brand and credits.</p>
          </div>
          <a href="/developers" target="_blank" rel="noreferrer" className="btn-outline">
            <FiBookOpen size={13} /> Developer docs
          </a>
        </div>

        <div className="relative mt-5 flex max-w-2xl items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 py-1.5 pl-3 pr-1.5">
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-brand">POST</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-800">{BASE}</code>
          <HeroCopy text={BASE} />
        </div>

        <div className="relative mt-5 grid gap-2.5 sm:grid-cols-3">
          <Stat
            icon={FiActivity}
            value={usage?.today ?? '—'}
            label="Calls today"
            extra={delta != null && <span className={`text-[12px] font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{delta >= 0 ? '↗' : '↘'} {Math.abs(delta)}% vs yesterday</span>}
          />
          <Stat icon={FiCalendar} value={usage?.month ?? '—'} label="This month" />
          <Stat
            icon={FiCheckCircle}
            value={usage?.success_30d != null ? `${usage.success_30d}%` : '—'}
            label="Success · 30 days"
            extra={<span className="text-[12px] text-ink-400">{usage?.calls_30d ?? 0} calls</span>}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-1 rounded-2xl bg-ink-100 p-1 sm:inline-flex">
        {[
          ['keys', 'API Keys', FiKey],
          ['logs', 'Request Logs', FiList],
          ['start', 'Quick Start', FiZap],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id)
              if (id === 'logs') loadUsage()
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${tab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
          >
            <Icon size={13} className={tab === id ? 'text-brand' : ''} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'keys' && <KeysTab canManage={canManage} showToast={showToast} fresh={fresh} onFresh={setFresh} onQuickStart={() => setTab('start')} />}
        {tab === 'logs' && <LogsTab usage={usage} />}
        {tab === 'start' && <QuickStartTab fresh={fresh} />}
      </div>
    </div>
  )
}
