import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import AutoTextarea from '../ui/AutoTextarea'
import Select from '../ui/Select'

// Leads → Customers: companies you already sell to, and the rep who owns each.
// A new lead whose phone, email or company matches goes straight to that owner.

const card = 'rounded-2xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const FIELD = 'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'
const emptyCustomer = { name: '', phone: '', email: '', owner_rep_id: 0, note: '' }

export default function CustomersTab({ reps, accounts, canManage, onChanged, showToast }) {
  const [cust, setCust] = useState(emptyCustomer)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false) // the add panel

  const run = async (fn, done) => {
    setBusy(true)
    try {
      await fn()
      if (done) showToast(done)
      await onChanged()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    run(async () => {
      await api.post('/leads/accounts', { ...cust, owner_rep_id: cust.owner_rep_id || null })
      setCust(emptyCustomer)
      setOpen(false)
    }, 'Customer added')

  // "company, phone, email, owner name" per line — the owner is matched to a rep by name.
  const importBulk = () =>
    run(async () => {
      const byName = Object.fromEntries(reps.map((r) => [r.name.trim().toLowerCase(), r.id]))
      const rows = bulk
        .split('\n')
        .map((l) => l.split(/[,\t]/).map((s) => s.trim()))
        .filter((c) => c[0])
        .map(([name, phone = '', email = '', owner = '']) => ({ name, phone, email, owner_rep_id: byName[owner.toLowerCase()] || null }))
      const out = await api.post('/leads/accounts/import', { accounts: rows })
      setBulk('')
      setOpen(false)
      showToast(`${out.added} added${out.skipped ? `, ${out.skipped} skipped (already on the list)` : ''}`)
    })

  const owners = [{ value: 0, label: 'No owner' }, ...reps.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]

  return (
    <>
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">Customers · {accounts.length}</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">
              Companies already buying from you. When one of them chats with your bot, the lead goes straight back to its owner.
            </p>
          </div>
          {canManage && (
            <button type="button" onClick={() => setOpen(true)} className="btn-primary px-3.5 py-2">
              <FiPlus size={14} /> Add customer
            </button>
          )}
        </div>
        {accounts.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-ink-500">
            No customers yet. This list is optional — add your existing customers (or paste them from Dynamics 365 / Excel) so their chats go back to the rep who owns them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] font-bold uppercase tracking-[.06em] text-ink-400">
                  <th className="px-5 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Account owner</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-ink-50/60">
                    <td className="px-5 py-3 font-semibold text-ink-900">{a.name}</td>
                    <td className="px-3 py-3 text-ink-700">{a.phone || '—'}</td>
                    <td className="px-3 py-3 text-ink-700">{a.email || '—'}</td>
                    <td className="px-3 py-3 text-ink-700">{a.owner?.name || <span className="text-ink-400">Not set</span>}</td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => run(() => api.del(`/leads/accounts/${a.id}`), 'Removed')}
                          className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${a.name}`}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[110]">
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-night-950/30 animate-fadein" />
            <div role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-ink-200 bg-white shadow-drawer animate-drawer-in">
              <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 pb-4 pt-6">
                <div>
                  <h2 className="text-[16px] font-bold text-ink-900">Add a customer</h2>
                  <p className="mt-0.5 text-[12px] text-ink-500">One company, or paste a whole list.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
                  <FiX size={16} />
                </button>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                <input autoFocus className={FIELD} placeholder="Company *" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
                <input className={FIELD} placeholder="Phone" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
                <input className={FIELD} placeholder="Email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
                <Select value={cust.owner_rep_id} onChange={(v) => setCust({ ...cust, owner_rep_id: v })} options={owners} placeholder="Account owner" />
                <button type="button" disabled={busy || !cust.name.trim()} onClick={add} className="btn-primary w-full justify-center">
                  Add customer
                </button>
                <details className="border-t border-ink-100 pt-4">
                  <summary className="cursor-pointer text-[12.5px] font-semibold text-brand">Paste a list (e.g. exported from Dynamics 365)</summary>
                  <AutoTextarea
                    minRows={5}
                    maxRows={14}
                    className={`${FIELD} mt-2 font-mono text-[12px]`}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    placeholder={'One per line: company, phone, email, owner name\nGolden Rice Co., 012 345 678, , Sokha Lim'}
                  />
                  <button type="button" disabled={busy || !bulk.trim()} onClick={importBulk} className="btn-outline mt-2">
                    Import list
                  </button>
                </details>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
