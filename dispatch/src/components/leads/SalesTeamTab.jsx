import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCopy, FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import Select from '../ui/Select'

// Leads → Sales team: the people leads are handed to, full width. Each rep can
// be invited into the portal (Sales access: Leads only), so they see their own
// leads and mark them contacted / won themselves.

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const FIELD = 'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'
const emptyRep = { name: '', email: '', phone: '', telegram: '', industries: '', senior: false, capacity: 12, active: true, member_id: null }

const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const usd = (n) => `$${Number(n || 0).toLocaleString()}`

export default function SalesTeamTab({ reps, canManage, onChanged, showToast }) {
  const [editing, setEditing] = useState(null) // a rep (or emptyRep) in the drawer
  const [invite, setInvite] = useState(null) // { rep, link }
  const [busy, setBusy] = useState('')
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (canManage) api.get('/auth/members').then((m) => setMembers(m || [])).catch(() => {})
  }, [canManage])

  const run = async (name, fn, done) => {
    setBusy(name)
    try {
      await fn()
      if (done) showToast(done)
      await onChanged()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const makeInvite = (rep) =>
    run(`invite:${rep.id}`, async () => {
      const r = await api.post(`/leads/reps/${rep.id}/invite`)
      setInvite({ rep, link: r.link })
    })

  const active = reps.filter((r) => r.active)
  const totals = {
    open: active.reduce((s, r) => s + r.open, 0),
    capacity: active.reduce((s, r) => s + r.capacity, 0),
    won: reps.reduce((s, r) => s + (r.won_90d || 0), 0),
    value: reps.reduce((s, r) => s + (r.won_value_90d || 0), 0),
    inPortal: reps.filter((r) => r.member).length,
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Reps', `${active.length}`, `${reps.length - active.length ? `${reps.length - active.length} inactive · ` : ''}${totals.inPortal} in the portal`],
          ['Open leads', `${totals.open}`, `of ${totals.capacity} the team can carry`],
          ['Won · 90 days', `${totals.won}`, usd(totals.value)],
          ['Hand-off rule order', 'Account → regulated → industry', 'then the next rep with room'],
        ].map(([label, value, sub]) => (
          <div key={label} className={`${card} p-4`}>
            <div className="text-[12px] font-medium text-ink-500">{label}</div>
            <div className="mt-1 truncate text-[22px] font-bold tracking-tight text-ink-900">{value}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-ink-400">{sub}</div>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink-900">Sales team</h2>
          {canManage && (
            <button type="button" onClick={() => setEditing(emptyRep)} className="btn-primary px-3.5 py-2">
              <FiPlus size={14} /> Add a rep
            </button>
          )}
        </div>

        {reps.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-ink-500">
            No reps yet. Add the people leads go to — with the industries each one owns — and the hand-off rules start picking.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] font-bold uppercase tracking-[.06em] text-ink-400">
                  <th className="px-5 py-2.5">Rep</th>
                  <th className="px-3 py-2.5">Industries</th>
                  <th className="px-3 py-2.5">Open leads</th>
                  <th className="px-3 py-2.5 text-right">Called on time</th>
                  <th className="px-3 py-2.5 text-right">Won · 90 d</th>
                  <th className="px-3 py-2.5">Telegram</th>
                  <th className="px-3 py-2.5">Portal</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {reps.map((r) => {
                  const full = r.open >= r.capacity
                  const pct = Math.min(100, Math.round((r.open / Math.max(1, r.capacity)) * 100))
                  return (
                    <tr key={r.id} className={`hover:bg-ink-50/60 ${r.active ? '' : 'opacity-50'}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="relative grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                            {initials(r.name)}
                            {r.member && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" title="Has a portal login" />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-ink-900">{r.name}</span>
                              {r.senior && <span className="rounded-full bg-violet-50 px-2 py-px text-[10.5px] font-semibold text-violet-700">Senior</span>}
                              {!r.active && <span className="rounded-full bg-ink-100 px-2 py-px text-[10.5px] font-semibold text-ink-600">Inactive</span>}
                            </div>
                            <div className="truncate text-[11.5px] text-ink-500">{[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact details'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{(r.industries || []).join(', ') || <span className="text-ink-400">Any (no industry set)</span>}</td>
                      <td className="px-3 py-3">
                        <div className={`tabular-nums ${full ? 'font-semibold text-red-600' : 'text-ink-800'}`}>
                          {r.open} <span className="text-ink-400">of {r.capacity}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-28 rounded-full bg-ink-100">
                          <div className={`h-1.5 rounded-full ${full ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-800">{r.sla_met_pct != null ? `${r.sla_met_pct}%` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="font-semibold text-ink-900">{r.won_90d || 0}</span>
                        {r.won_value_90d > 0 && <span className="text-ink-500"> · {usd(r.won_value_90d)}</span>}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] text-ink-700">{r.telegram ? `@${r.telegram}` : <span className="font-sans text-ink-400">—</span>}</td>
                      <td className="px-3 py-3">
                        {r.member ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700" title={r.member.email}>
                            ✓ {r.member.name}
                          </span>
                        ) : canManage ? (
                          <button
                            type="button"
                            onClick={() => makeInvite(r)}
                            disabled={!!busy}
                            className="rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand-soft"
                          >
                            {busy === `invite:${r.id}` ? 'Making link…' : r.invited ? 'Invited · new link' : 'Invite to portal'}
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-ink-400">{r.invited ? 'Invited' : 'No login'}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing({ ...r, industries: (r.industries || []).join(', ') })}
                              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                              aria-label={`Edit ${r.name}`}
                            >
                              <FiEdit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => run(`del:${r.id}`, () => api.del(`/leads/reps/${r.id}`), 'Removed')}
                              className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove ${r.name}`}
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <RepDrawer
          rep={editing}
          reps={reps}
          members={members}
          busy={busy === 'save'}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            run(
              'save',
              async () => {
                if (editing.id) await api.patch(`/leads/reps/${editing.id}`, body)
                else await api.post('/leads/reps', body)
                setEditing(null)
              },
              'Saved',
            )
          }
        />
      )}

      {invite && <InviteLink invite={invite} onClose={() => setInvite(null)} showToast={showToast} />}
    </div>
  )
}

function RepDrawer({ rep, reps, members, busy, onClose, onSave }) {
  const [f, setF] = useState(rep)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))
  // Logins not already linked to another rep.
  const taken = new Set(reps.filter((r) => r.member_id && r.id !== rep.id).map((r) => r.member_id))
  const loginOptions = [
    { value: 0, label: 'No portal login' },
    ...members.filter((m) => !taken.has(m.id)).map((m) => ({ value: m.id, label: m.name, hint: m.email })),
  ]

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    onSave({
      name: f.name,
      email: f.email,
      phone: f.phone,
      telegram: f.telegram || '',
      industries: String(f.industries || '').split(',').map((s) => s.trim()).filter(Boolean),
      senior: !!f.senior,
      capacity: Math.max(1, Number(f.capacity) || 12),
      active: !!f.active,
      member_id: f.member_id || null,
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <form onSubmit={submit} role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in">
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 pb-4 pt-6">
          <div>
            <h2 className="text-[16px] font-bold text-ink-900">{rep.id ? `Edit ${rep.name}` : 'Add a rep'}</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Who they are, what they own, and how to reach them.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <FiX size={16} />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="label">Name *</span>
            <input autoFocus required className={FIELD} value={f.name} onChange={set('name')} placeholder="Dara Kim" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Email</span>
              <input className={FIELD} value={f.email} onChange={set('email')} placeholder="dara@company.com" type="email" />
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input className={FIELD} value={f.phone} onChange={set('phone')} placeholder="012 345 678" />
            </label>
          </div>
          <label className="block">
            <span className="label">Telegram username</span>
            <input className={FIELD} value={f.telegram || ''} onChange={set('telegram')} placeholder="@dara_kim — mentioned in sales alerts" />
          </label>
          <label className="block">
            <span className="label">Industries they own</span>
            <input className={FIELD} value={f.industries} onChange={set('industries')} placeholder="Retail, E-commerce" />
            <span className="mt-1 block text-[11px] text-ink-400">Comma separated. Leads in these industries go to them first.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Open-lead limit</span>
              <input type="number" min="1" className={FIELD} value={f.capacity} onChange={set('capacity')} />
            </label>
            <div className="space-y-2 pt-5 text-[12.5px] text-ink-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!f.senior} onChange={(e) => setF((v) => ({ ...v, senior: e.target.checked }))} />
                Senior (gets regulated industries)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!f.active} onChange={(e) => setF((v) => ({ ...v, active: e.target.checked }))} />
                Active (can get new leads)
              </label>
            </div>
          </div>
          <div>
            <span className="label">Portal login</span>
            <Select value={f.member_id || 0} onChange={(v) => setF((x) => ({ ...x, member_id: v || null }))} options={loginOptions} />
            <span className="mt-1 block text-[11px] text-ink-400">
              Already in the team? Link their login here. Otherwise save, then use “Invite to portal”.
            </span>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={busy || !f.name.trim()} className="btn-primary">
            {busy ? 'Saving…' : rep.id ? 'Save' : 'Add rep'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

function InviteLink({ invite, onClose, showToast }) {
  const copy = () => {
    try {
      navigator.clipboard.writeText(invite.link)
      showToast('Invite link copied')
    } catch {
      showToast('Select the link and copy it')
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-6 shadow-pop">
        <h2 className="text-[16px] font-bold text-ink-900">Invite {invite.rep.name}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
          Send this link to {invite.rep.name} on Telegram or email. It works once, for 7 days. They set their own password and get
          <b className="text-ink-700"> Sales access</b> — the Leads page only, with their own leads.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-3 py-2.5 font-mono text-[12px] text-ink-800 ring-1 ring-ink-200">{invite.link}</code>
          <button type="button" onClick={copy} className="btn-primary px-3">
            <FiCopy size={13} /> Copy
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
