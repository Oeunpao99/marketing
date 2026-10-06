// Shared bits of the Leads & hand-off screens (backend app/leads.py).

export const TEMP = {
  hot: { label: 'Hot', cls: 'bg-orange-600 text-white' },
  warm: { label: 'Warm', cls: 'bg-amber-100 text-amber-900' },
  cold: { label: 'Cold', cls: 'bg-ink-100 text-ink-600' },
}

/** What the status chip says for a lead. */
export function statusChip(lead) {
  if (lead.status === 'ready') return { label: 'Ready for hand-off', cls: 'bg-amber-50 text-amber-800' }
  if (lead.status === 'qualifying') return { label: 'Bot qualifying', cls: 'bg-brand-soft text-brand' }
  if (lead.status === 'handed_off') {
    if (lead.sla_missed) return { label: `Late · ${lead.rep?.name || 'rep'}`, cls: 'bg-red-50 text-red-700' }
    return { label: lead.first_contact_at ? `Contacted · ${lead.rep?.name || ''}` : `With ${lead.rep?.name || 'a rep'}`, cls: 'bg-emerald-50 text-emerald-700' }
  }
  if (lead.outcome === 'won') return { label: lead.value_usd ? `Won · $${lead.value_usd.toLocaleString('en-US')}` : 'Won', cls: 'bg-emerald-50 text-emerald-700' }
  if (lead.outcome === 'lost') return { label: 'Lost', cls: 'bg-ink-100 text-ink-600' }
  return { label: 'Closed by bot', cls: 'bg-ink-100 text-ink-600' }
}

/** "9 min", "2 h 5 min", "3 d" — a length of time. */
export function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d`
}

/** The first-contact clock of a handed-over lead, as one sentence + a tone. */
export function slaLine(lead, now) {
  if (!lead.sla_minutes || lead.status !== 'handed_off') return null
  const due = new Date(lead.sla_due_at).getTime()
  if (lead.first_contact_at) {
    const took = new Date(lead.first_contact_at).getTime() - new Date(lead.handed_off_at).getTime()
    const met = new Date(lead.first_contact_at).getTime() <= due
    return { text: `Contacted after ${span(took)}${met ? ' · on time' : ' · late'}`, tone: met ? 'ok' : 'late' }
  }
  return now > due
    ? { text: `Overdue by ${span(now - due)} — call now`, tone: 'late' }
    : { text: `Call within ${span(due - now)}`, tone: 'due' }
}

/** "Customer: …" / "Bot: …" lines → [{from, text}] (a line with no prefix is the customer's). */
export function parseChat(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(customer|bot|rep)\s*:\s*(.*)$/i.exec(l)
      return m ? { from: m[1].toLowerCase(), text: m[2] } : { from: 'customer', text: l }
    })
    .filter((m) => m.text)
}

export const chatText = (messages) =>
  (messages || []).map((m) => `${m.from === 'bot' ? 'Bot' : m.from === 'rep' ? 'Rep' : 'Customer'}: ${m.text}`).join('\n')
