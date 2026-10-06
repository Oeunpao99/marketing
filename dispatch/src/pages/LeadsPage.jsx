import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiPlus, FiUsers, FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { TEMP, slaLine, statusChip } from '../lib/leads'
import { useStore } from '../store'
import Select from '../components/ui/Select'
import LeadDialog from '../components/leads/LeadDialog'
import SalesTeamTab from '../components/leads/SalesTeamTab'
import CustomersTab from '../components/leads/CustomersTab'
import { useAuth } from '../auth'

// Leads & hand-off (backend app/leads.py): qualified chatbot leads, the rep
// the hand-off rules pick for each, and the sales team's load. Leads arrive by
// hand, by import, or from POST /leads (what a chatbot integration calls).

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const khmer = (text) => (/[ក-៿]/.test(text || '') ? 'font-khmer' : '')

export default function LeadsPage() {
  const { brands, showToast } = useStore()
  const [brandId, setBrandId] = useState(0) // 0 = all brands
  const [data, setData] = useState(null)
  const [reps, setReps] = useState([])
  const [accounts, setAccounts] = useState([])
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState(() => Number(params.get('lead')) || null) // ?lead= from a sales alert
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [now, setNow] = useState(Date.now())
  const [dialog, setDialog] = useState(null) // 'new' | 'edit' | 'close'
  const [tab, setTab] = useState('leads') // 'leads' | 'team' | 'customers'
  const [mine, setMine] = useState(null) // null = not decided yet (on for a rep with a login)
  const { user } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [reassign, setReassign] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, r, a] = await Promise.all([
        api.get(`/leads?${new URLSearchParams({ ...(brandId ? { brand_id: brandId } : {}), ...(mine ? { mine: 'true' } : {}) })}`),
        api.get('/leads/reps'),
        api.get('/leads/accounts'),
      ])
      setData(list)
      // A rep with a portal login starts on their own leads.
      if (mine === null && list.my_rep_id) setMine(true)
      setReps(r)
      setAccounts(a)
      setError('')
      setSelected((cur) => (list.leads.some((l) => l.id === cur) ? cur : null))
      if (params.get('lead')) setParams({}, { replace: true })
    } catch (e) {
      setError(e.message)
    }
  }, [brandId, mine])

  useEffect(() => {
    setData(null)
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // The selected lead in full: chat and the rep the rules would pick.
  const loadDetail = useCallback(async () => {
    if (selected == null) return setDetail(null)
    try {
      setDetail(await api.get(`/leads/${selected}`))
    } catch (e) {
      setDetail(null)
      showToast(e.message)
    }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReassign(false)
    setConfirmDelete(false)
    loadDetail()
  }, [loadDetail])

  const refresh = async () => {
    await Promise.all([load(), loadDetail()])
  }

  const act = async (key, fn, done) => {
    setBusy(key)
    try {
      await fn()
      if (done) showToast(done)
      setReassign(false)
      setDialog(null)
      await refresh()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const handOver = (repId) =>
    act('handoff', () => api.post(`/leads/${detail.id}/handoff`, repId ? { rep_id: repId } : {}), 'Handed over')
  const reassignTo = (repId) =>
    detail.status === 'handed_off'
      ? act('handoff', () => api.post(`/leads/${detail.id}/reassign`, { rep_id: repId }), 'Reassigned')
      : handOver(repId)

  const saveLead = (body) =>
    act(
      'save',
      async () => {
        if (dialog === 'edit') await api.patch(`/leads/${detail.id}`, body)
        else {
          const made = await api.post('/leads', body)
          setSelected(made.id)
        }
      },
      dialog === 'edit' ? 'Saved' : 'Lead added',
    )

  const leads = data?.leads || []
  const counts = data?.counts || {}
  const activeReps = reps.filter((r) => r.active)

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink-900">Leads &amp; hand-off</h1>
          <p className="mt-1 text-[13px] text-ink-600">Chatbot leads, qualified and routed to the right sales rep by account and industry</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {brands.length > 1 && (
            <Select
              align="right"
              value={brandId}
              onChange={setBrandId}
              buttonClassName="font-medium"
              options={[
                { value: 0, label: 'All brands', hint: brands.map((b) => b.name).join(' · ') },
                ...brands.map((b) => ({ value: b.id, label: b.name, color: colorForBrand(b.slug) })),
              ]}
            />
          )}
          {tab === 'leads' && (
            <button type="button" onClick={() => setDialog('new')} className="btn-primary px-4 py-2">
              <FiPlus size={15} /> Add lead
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-ink-100/70 p-1" role="tablist">
          {[
            ['leads', `Leads${data ? ` · ${data.leads.length}` : ''}`],
            ['team', `Sales team · ${reps.length}`],
            ['customers', `Customers · ${accounts.length}`],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                tab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'leads' && data?.my_rep_id && (
          <div className="inline-flex rounded-xl bg-ink-100/70 p-1" role="group" aria-label="Show">
            {[
              [true, 'My leads'],
              [false, 'All leads'],
            ].map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={!!mine === v}
                onClick={() => setMine(v)}
                className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold ${!!mine === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700">{error}</p>}

      {data && !data.has_reps && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[12.5px] text-amber-900">
          <span>
            <b className="font-semibold">Add your sales team first.</b> Leads can’t be handed over until there are reps to hand them to.
          </span>
          <button type="button" onClick={() => setTab('team')} className="btn-outline px-3 py-1.5">
            Add reps
          </button>
        </div>
      )}

      {tab === 'team' && <SalesTeamTab reps={reps} canManage={canManage} onChanged={refresh} showToast={showToast} />}
      {tab === 'customers' && <CustomersTab reps={reps} accounts={accounts} canManage={canManage} onChanged={refresh} showToast={showToast} />}

      {tab === 'leads' && (!data ? (
        <div className={`${card} h-72 skeleton`} />
      ) : leads.length === 0 ? (
        <section className={`${card} mx-auto max-w-2xl p-8 text-center`}>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <FiUsers size={22} />
          </span>
          <h2 className="mt-3 text-[16px] font-bold text-ink-900">No leads yet</h2>
          <p className="mx-auto mt-1.5 max-w-[56ch] text-[12.5px] leading-relaxed text-ink-500">
            Leads show up here by themselves once your chatbot is connected (Setup → Chatbots → leads). Until then, add them
            by hand: they are scored, matched to the customer list, and routed to a rep the same way.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/channels" className="btn-primary">
              Connect your chatbot
            </Link>
            <button type="button" onClick={() => setDialog('new')} className="btn-outline">
              <FiPlus size={15} /> Add a lead by hand
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className={`${card} min-w-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3 text-[12px] text-ink-500">
              <span>From your chatbots and channels · scored and qualified by the bot</span>
              <b className="font-semibold text-ink-800">
                {counts.ready || 0} ready · {counts.handed_off || 0} handed off
              </b>
            </div>
            <ul>
              {leads.map((l) => (
                <LeadRow key={l.id} lead={l} active={l.id === selected} showBrand={!brandId && brands.length > 1} onPick={() => setSelected(l.id)} />
              ))}
            </ul>
          </section>

          {selected != null && (
            <LeadDrawer onClose={() => setSelected(null)} loading={!detail || detail.id !== selected}>
              {detail && detail.id === selected && (
              <Detail
                lead={detail}
                reps={reps}
                now={now}
                busy={busy}
                reassign={reassign}
                confirmDelete={confirmDelete}
                onHandOver={() => handOver()}
                onReassignToggle={() => setReassign((v) => !v)}
                onReassign={reassignTo}
                onContacted={() => act('contacted', () => api.post(`/leads/${detail.id}/contacted`), 'Marked as contacted')}
                onClose={() => setDialog('close')}
                onReopen={() => act('reopen', () => api.patch(`/leads/${detail.id}`, { status: 'qualifying' }), 'Reopened')}
                onEdit={() => setDialog('edit')}
                onDelete={() => (confirmDelete ? act('delete', async () => { await api.del(`/leads/${detail.id}`); setSelected(null) }, 'Deleted') : setConfirmDelete(true))}
                onTeam={() => setTab('team')}
              />
              )}
            </LeadDrawer>
          )}
        </>
      ))}

      {tab === 'leads' && data && (
        <div className="mt-5">
          <section className={`${card} p-5`}>
            <h2 className="text-[15px] font-semibold text-ink-900">Hand-off rules · checked in order</h2>
            <ol className="mt-3 divide-y divide-ink-100">
              {(data.rules || []).map((r, i) => (
                <li key={r.title} className="flex gap-3 py-2.5 text-[13px] text-ink-700">
                  <span className="w-4 flex-none text-ink-400 tabular-nums">{i + 1}</span>
                  <span>
                    <b className="font-semibold text-ink-900">{r.title}</b> {r.text}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {(dialog === 'new' || dialog === 'edit') && (
        <LeadDialog
          lead={dialog === 'edit' ? detail : null}
          brands={brands}
          defaultBrandId={brandId}
          saving={busy === 'save'}
          onSave={saveLead}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'close' && detail && (
        <CloseDialog
          lead={detail}
          busy={busy === 'close'}
          onCancel={() => setDialog(null)}
          onConfirm={(body) => act('close', () => api.post(`/leads/${detail.id}/close`, body), 'Lead closed')}
        />
      )}
    </div>
  )
}

function LeadRow({ lead, active, showBrand, onPick }) {
  const t = TEMP[lead.temperature]
  const s = statusChip(lead)
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`grid w-full grid-cols-[minmax(0,1.1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-l-[3px] border-b-ink-100 px-5 py-3.5 text-left transition-colors sm:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.4fr)_auto] ${
          active ? 'border-l-brand bg-brand-soft/60' : 'border-l-transparent hover:bg-ink-50/70'
        }`}
      >
        <span className="min-w-0">
          <span className={`block truncate text-[13.5px] font-semibold text-ink-900 ${khmer(lead.name)}`}>{lead.name}</span>
          <span className="block truncate text-[11.5px] text-ink-500">
            {[lead.industry, lead.source, showBrand && lead.brand_name].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={`justify-self-end rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tabular-nums sm:justify-self-start ${t.cls}`}>
          {t.label} · {lead.score}
        </span>
        <span className={`col-span-2 truncate text-[12.5px] text-ink-600 sm:col-span-1 ${khmer(lead.summary)}`}>{lead.summary}</span>
        <span className={`col-span-2 justify-self-start rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold sm:col-span-1 sm:justify-self-end ${s.cls}`}>{s.label}</span>
      </button>
    </li>
  )
}

function Detail({ lead, reps, now, busy, reassign, confirmDelete, onHandOver, onReassignToggle, onReassign, onContacted, onClose, onReopen, onEdit, onDelete, onTeam }) {
  const t = TEMP[lead.temperature]
  const sug = lead.suggestion
  const waiting = lead.status === 'ready' || lead.status === 'qualifying'
  const sla = slaLine(lead, now)
  const sugRep = sug?.rep_id ? reps.find((r) => r.id === sug.rep_id) : null
  const shown = (lead.messages || []).slice(-3)
  const contact = [lead.contact_name, lead.phone || lead.email].filter(Boolean).join(' · ')
  const options = reps.filter((r) => r.active && r.id !== lead.rep?.id).map((r) => ({ value: r.id, label: r.name, hint: `${(r.industries || []).join(', ') || 'no industry'} · ${r.open}/${r.capacity} open` }))

  return (
    <section className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-[18px] font-bold leading-tight tracking-tight text-ink-900 ${khmer(lead.name)}`}>{lead.name}</h2>
          <p className="mt-1 text-[12px] leading-snug text-ink-500">
            {[lead.industry, lead.source && `via ${lead.source}`].filter(Boolean).join(' · ')}
            {lead.post_title && ` · from “${lead.post_title}”`}
          </p>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums ${t.cls}`}>
          {t.label} · {lead.score}
        </span>
      </div>

      <div className="mt-4 rounded-2xl bg-ink-50 p-3.5">
        <p className="mb-2 text-[11.5px] font-semibold text-ink-500">Chatbot conversation · last {shown.length || 3} messages</p>
        {shown.length === 0 ? (
          <p className="py-2 text-[12px] text-ink-400">No chat saved for this lead.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
                <p
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${khmer(m.text)} ${
                    m.from === 'customer' ? 'border border-ink-200/70 bg-white text-ink-800' : m.from === 'bot' ? 'bg-brand text-white' : 'bg-ink-200 text-ink-900'
                  }`}
                >
                  {m.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[
          ['Need', lead.need],
          ['Volume', lead.volume],
          ['Timeline', lead.timeline],
          ['Contact', contact],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-ink-200/70 px-3 py-2">
            <p className="text-[11px] text-ink-500">{label}</p>
            <p className={`text-[12.5px] font-semibold leading-snug text-ink-900 ${khmer(value)}`}>{value || '—'}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-ink-200/70 p-3.5">
        <p className="text-[11.5px] font-semibold text-brand">Routing decision</p>
        {waiting && sug ? (
          sug.rep_id ? (
            <>
              <p className="mt-1.5 text-[14px] font-bold text-ink-900">
                → {sug.rep_name}
                {sugRep?.industries?.length > 0 && <span className="font-semibold text-ink-600"> · {sugRep.industries.join(' & ')}</span>}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-ink-600">{sug.reason}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-600">{sug.detail}</p>
              {sug.compliance && <p className="mt-1 text-[12px] font-semibold text-amber-800">Add a compliance note when handing this over.</p>}
              <p className="mt-1.5 text-[11.5px] text-ink-400">
                {lead.sla_minutes ? `SLA: call within ${lead.sla_minutes >= 60 ? `${lead.sla_minutes / 60} h` : `${lead.sla_minutes} minutes`} (${lead.temperature})` : 'No call deadline for a cold lead'}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[12.5px] text-ink-600">
              {sug.reason}{' '}
              <button type="button" onClick={onTeam} className="font-semibold text-brand hover:underline">
                Add reps
              </button>
            </p>
          )
        ) : lead.status === 'handed_off' ? (
          <>
            <p className="mt-1.5 text-[14px] font-bold text-ink-900">→ {lead.rep?.name || 'Rep removed'}</p>
            {lead.route?.reason && <p className="mt-1 text-[12px] leading-snug text-ink-600">{lead.route.reason}</p>}
            {lead.route?.compliance && <p className="mt-1 text-[12px] font-semibold text-amber-800">Regulated industry — compliance note applies.</p>}
            {sla && (
              <p className={`mt-1.5 text-[12px] font-semibold ${sla.tone === 'late' ? 'text-red-600' : sla.tone === 'ok' ? 'text-emerald-700' : 'text-ink-700'}`}>{sla.text}</p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-ink-600">
            {lead.outcome === 'won' ? 'Won' : lead.outcome === 'lost' ? 'Lost' : 'Closed — not worth a rep'}
            {lead.rep ? ` · ${lead.rep.name}` : ''}
            {lead.value_usd ? ` · $${lead.value_usd.toLocaleString('en-US')}` : ''}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {waiting && (
          <button type="button" disabled={!!busy || !sug?.rep_id} onClick={onHandOver} className="btn-primary min-w-0 flex-1 px-4 py-2.5">
            {busy === 'handoff' ? 'Handing over…' : sug?.rep_name ? `Hand over to ${sug.rep_name.split(' ')[0]}` : 'Hand over'}
          </button>
        )}
        {lead.status === 'handed_off' && !lead.first_contact_at && (
          <button type="button" disabled={!!busy} onClick={onContacted} className="btn-primary min-w-0 flex-1 px-4 py-2.5">
            Mark as contacted
          </button>
        )}
        {(waiting || lead.status === 'handed_off') && (
          <button type="button" disabled={!!busy} onClick={onReassignToggle} className="btn-outline px-4 py-2.5">
            {waiting ? 'Choose rep' : 'Reassign'}
          </button>
        )}
        {lead.status === 'closed' && (
          <button type="button" disabled={!!busy} onClick={onReopen} className="btn-outline px-4 py-2.5">
            Reopen
          </button>
        )}
      </div>

      {reassign && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select value={0} placeholder="Pick a rep…" onChange={onReassign} options={options.length ? options : [{ value: 0, label: 'No other active rep' }]} />
          </div>
          <button type="button" onClick={onReassignToggle} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100" aria-label="Cancel">
            <FiX size={14} />
          </button>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-[12px]">
        <button type="button" onClick={onEdit} className="font-semibold text-brand hover:underline">
          Edit lead
        </button>
        {lead.status !== 'closed' && (
          <button type="button" onClick={onClose} className="font-semibold text-ink-600 hover:underline">
            Close lead
          </button>
        )}
        <button type="button" onClick={onDelete} className={`ml-auto font-semibold hover:underline ${confirmDelete ? 'text-red-600' : 'text-ink-400'}`}>
          {confirmDelete ? 'Click again to delete' : 'Delete'}
        </button>
      </div>
    </section>
  )
}

function CloseDialog({ lead, busy, onCancel, onConfirm }) {
  const [outcome, setOutcome] = useState(lead.status === 'handed_off' ? 'won' : '')
  const [value, setValue] = useState('')
  const choices = [
    ['won', 'Won', 'They became a customer'],
    ['lost', 'Lost', 'They chose someone else or went quiet'],
    ['', 'Not a fit', 'Closed without a sale'],
  ]
  return createPortal(
    <div className="fixed inset-0 z-[110] glass-overlay flex items-center justify-center p-4 animate-fadein" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="glass-panel w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[15.5px] font-bold text-ink-900">Close “{lead.name}”</h2>
        <div className="mt-4 space-y-2">
          {choices.map(([key, label, hint]) => (
            <button
              key={label}
              type="button"
              onClick={() => setOutcome(key)}
              className={`block w-full rounded-xl border px-3.5 py-2.5 text-left ${outcome === key ? 'border-brand bg-brand-soft' : 'border-ink-200 hover:bg-ink-50'}`}
            >
              <span className="block text-[13px] font-semibold text-ink-900">{label}</span>
              <span className="block text-[11.5px] text-ink-500">{hint}</span>
            </button>
          ))}
        </div>
        {outcome === 'won' && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">Deal value (USD, optional)</span>
            <input
              className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="4400"
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-outline">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ outcome, ...(outcome === 'won' && value.trim() ? { value_usd: Number(value) || 0 } : {}) })}
            className="btn-primary"
          >
            {busy ? 'Closing…' : 'Close lead'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// A lead's details slide in from the right when its row is clicked.
function LeadDrawer({ children, loading, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <aside role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-[.06em] text-ink-400">Lead</span>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-6">
              <div className="h-8 w-2/3 rounded-lg skeleton" />
              <div className="h-40 rounded-2xl skeleton" />
              <div className="h-24 rounded-2xl skeleton" />
            </div>
          ) : (
            children
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
