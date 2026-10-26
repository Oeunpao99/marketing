import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiActivity, FiAlertTriangle, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiCopy, FiKey, FiPlay, FiPlus, FiRefreshCw, FiSearch, FiTrash2 } from 'react-icons/fi'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { useStore } from '../store'
import AutoTextarea from '../components/ui/AutoTextarea'
import Select from '../components/ui/Select'

// API & MCP (/developer): the workspace's own API keys (app/api_keys.py), a
// Playground to try every connector tool signed in, the Request Logs and the
// numbers above them (GET /api-keys/usage), and the Quick Start to connect an AI
// assistant or code (app/mcp_server.py). The public docs: /developers.

const BASE = `${window.location.origin}/api/mcp`
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

function Code({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed text-ink-800">{children}</code>
      <Copy text={children} />
    </div>
  )
}

function Stat({ icon: Icon, value, label, extra }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-3.5 py-1.5 text-[12.5px] text-ink-600">
      <Icon size={13} className="text-ink-500" />
      <b className="tabular-nums text-ink-900">{value}</b> {label} {extra}
    </span>
  )
}

// ── API Keys ──────────────────────────────────────────────────────────────

function KeysTab({ canManage, showToast, onFresh, fresh, onQuickStart }) {
  const [keys, setKeys] = useState(null)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
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
      const k = await api.post('/api-keys', { name: name.trim() || 'API key' })
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
  const shown = (keys || []).filter((k) => !q.trim() || k.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-600">Manage your API keys. A key acts as the person who made it and spends this workspace’s credits.</p>
        {canManage && (
          <button type="button" onClick={openNew} className="btn-primary">
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
                    className="mt-3 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand"
                  />
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

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-ink-100 px-3.5 py-2.5">
        <FiSearch size={14} className="text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keys…" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400" />
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-[13px]">
          <thead className="border-b border-ink-200 bg-ink-50 text-[12px] text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Key</th>
              <th className="px-4 py-2.5 font-semibold">Made by</th>
              <th className="px-4 py-2.5 font-semibold">Last used</th>
              <th className="px-4 py-2.5 font-semibold">Created</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {keys === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-ink-400">Loading…</td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-400">{keys.length ? 'No key matches.' : 'No keys yet — create one to connect an AI assistant or your app.'}</td>
              </tr>
            ) : (
              shown.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-semibold text-ink-900">{k.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-ink-100 px-2.5 py-1 font-mono text-[12px] text-ink-700">sm_••••••••{k.hint}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-600">{k.created_by || '—'}</td>
                  <td className="px-4 py-3 text-ink-600" title={when(k.last_used_at)}>{ago(k.last_used_at)}</td>
                  <td className="px-4 py-3 text-ink-600">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <span className="flex justify-end gap-0.5">
                        <button type="button" onClick={() => rotate(k)} title="Rotate — a new secret, the old one stops" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
                          <FiRefreshCw size={14} />
                        </button>
                        <button type="button" onClick={() => revoke(k)} title="Revoke this key" className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600">
                          <FiTrash2 size={14} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Playground ────────────────────────────────────────────────────────────

const EXAMPLES = {
  list_templates: {},
  list_brands: {},
  my_credits: {},
  make_storyboard: { story: 'ហាងកាហ្វេរបស់យើងមានកាហ្វេទឹកកកថ្មី សូមមកសាកល្បងសប្តាហ៍នេះ', language: 'Khmer', template: 'picture', shape: '9:16' },
  get_storyboard: { storyboard_id: 'from make_storyboard' },
  make_video: { idea: 'Our new iced coffee — try it this week', template: 'auto', language: 'Khmer', shape: '9:16' },
  make_image: { prompt: 'Poster for our new iced coffee, with the words "កាហ្វេទឹកកក $2.5"', shape: '4:5', logo: true },
  check_job: { job_id: 0 },
}
const SPENDS = ['make_storyboard', 'make_video', 'make_image']

function PlaygroundTab({ canManage, onRan }) {
  const [tool, setTool] = useState('list_templates')
  const [args, setArgs] = useState('{}')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const pick = (t) => {
    setTool(t)
    setArgs(JSON.stringify(EXAMPLES[t], null, 2))
    setOut(null)
  }
  const run = async () => {
    let parsed
    try {
      parsed = JSON.parse(args || '{}')
    } catch {
      return setOut({ isError: true, content: [{ text: 'The arguments aren’t valid JSON.' }] })
    }
    setBusy(true)
    setOut(null)
    try {
      setOut(await api.post('/api-keys/playground', { tool, arguments: parsed }))
      onRan()
    } catch (e) {
      setOut({ isError: true, content: [{ text: e.message || 'It couldn’t run — try again.' }] })
    } finally {
      setBusy(false)
    }
  }
  if (!canManage) return <p className="rounded-xl bg-ink-50 px-3 py-2 text-[12.5px] text-ink-600">Only an owner or admin can use the Playground.</p>
  const result = out && (out.isError ? out.content?.[0]?.text : JSON.stringify(out.structuredContent, null, 2))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-[13px] text-ink-600">Try any tool exactly as your app or AI assistant would — signed in, no key needed. It runs for real in this workspace.</p>
        <Select value={tool} onChange={pick} options={Object.keys(EXAMPLES).map((t) => ({ value: t, label: t, hint: SPENDS.includes(t) ? 'uses credits' : 'free' }))} />
        <div>
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-500">Arguments (JSON)</span>
          <AutoTextarea value={args} onChange={(e) => setArgs(e.target.value)} minRows={6} maxRows={18} spellCheck={false} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-900 outline-none focus:border-brand" />
        </div>
        {SPENDS.includes(tool) && <p className="text-[12px] text-amber-700">This makes something real and uses credits, like the app does.</p>}
        <button type="button" onClick={run} disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <FiPlay size={13} />} {busy ? 'Running…' : 'Run'}
        </button>
      </div>
      <div className="min-w-0">
        <span className="mb-1 block text-[11.5px] font-semibold text-ink-500">Result</span>
        <pre className={`min-h-[220px] overflow-auto rounded-2xl px-4 py-3 font-mono text-[12px] leading-relaxed ${out?.isError ? 'bg-red-50 text-red-700' : 'bg-night-950 text-white/90'}`}>
          {busy ? 'Running…' : result || 'Press Run to see what the tool answers.'}
        </pre>
      </div>
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

function QuickStartTab({ fresh }) {
  const key = fresh?.key || 'YOUR_API_KEY'
  const [app, setApp] = useState('claude')
  const APPS = {
    claude: { label: 'Claude', steps: ['In Claude (claude.ai or the desktop app) open Settings → Connectors → Add custom connector.', 'Name it “Smart Marketing” and paste this link as the URL:'], code: `${BASE}/${key}` },
    chatgpt: { label: 'ChatGPT', steps: ['In ChatGPT open Settings → Apps & Connectors → Advanced, turn on Developer mode, then Create.', 'Paste this link as the MCP server URL (no sign-in needed — the key is in it):'], code: `${BASE}/${key}` },
    code: { label: 'Claude Code', steps: ['In a terminal:'], code: `claude mcp add --transport http smart-marketing ${BASE} --header "Authorization: Bearer ${key}"` },
    other: { label: 'Cursor · others', steps: ['Add an MCP server (Streamable HTTP):'], code: `{ "mcpServers": { "smart-marketing": { "url": "${BASE}", "headers": { "Authorization": "Bearer ${key}" } } } }` },
    curl: { label: 'Your code', steps: ['Any language: POST JSON-RPC to one endpoint with the key as a Bearer token.'], code: `curl ${BASE} -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_templates","arguments":{}}}'` },
  }
  const a = APPS[app]
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex">
        {Object.entries(APPS).map(([id, x]) => (
          <button key={id} type="button" onClick={() => setApp(id)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${app === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <ol className="mt-4 space-y-2">
        {a.steps.map((s, n) => (
          <li key={s} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-700">
            <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-soft text-[10.5px] font-bold text-brand">{n + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-3">
        <Code>{a.code}</Code>
      </div>
      {!fresh && <p className="mt-2 text-[12px] text-ink-500">Put your key where it says YOUR_API_KEY — or create a key on the API Keys tab and it’s filled in here.</p>}
      <p className="mt-4 text-[13px] text-ink-600">
        Then just ask: “Make a 1-minute Khmer Picture story video about our new iced coffee.” Examples in Python, Next.js, Java, PHP and the full tool reference are in the{' '}
        <a href="/developers" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          developer docs
        </a>
        .
      </p>
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
  const delta = usage && usage.yesterday ? Math.round(((usage.today - usage.yesterday) / usage.yesterday) * 100) : null

  return (
    <div className="w-full px-5 pt-6 pb-16 lg:px-10 animate-fadein">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">API & MCP</h1>
          <p className="page-sub mt-0.5">Let your app, chatbot or AI assistant make videos and pictures in this workspace.</p>
        </div>
        <a href="/developers" target="_blank" rel="noreferrer" className="btn-outline">
          <FiBookOpen size={13} /> Developer docs
        </a>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Stat icon={FiActivity} value={usage?.today ?? '—'} label="today" extra={delta != null && <span className={delta >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{delta >= 0 ? '↗' : '↘'} {Math.abs(delta)}%</span>} />
        <Stat icon={FiCalendar} value={usage?.month ?? '—'} label="this month" />
        <Stat icon={FiCheckCircle} value={usage?.success_30d != null ? `${usage.success_30d}%` : '—'} label="success" extra={<span className="text-ink-400">({usage?.calls_30d ?? 0} calls / 30d)</span>} />
      </div>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex">
        {[
          ['keys', 'API Keys'],
          ['playground', 'Playground'],
          ['logs', 'Request Logs'],
          ['start', 'Quick Start'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id)
              if (id === 'logs') loadUsage()
            }}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${tab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'keys' && <KeysTab canManage={canManage} showToast={showToast} fresh={fresh} onFresh={setFresh} onQuickStart={() => setTab('start')} />}
        {tab === 'playground' && <PlaygroundTab canManage={canManage} onRan={loadUsage} />}
        {tab === 'logs' && <LogsTab usage={usage} />}
        {tab === 'start' && <QuickStartTab fresh={fresh} />}
      </div>
    </div>
  )
}
