import { useCallback, useEffect, useState } from 'react'
import { FiCopy } from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'

// Setup → "Sales alerts": the sales team's Telegram group that every lead
// hand-off is posted to, mentioning the rep (app/sales_alerts.py). Linked with
// a one-time "/connect CODE" sent in the group.

export default function SalesAlertsCard({ canManage }) {
  const { showToast } = useStore()
  const [tg, setTg] = useState(null)
  const [busy, setBusy] = useState('')
  const [confirmOff, setConfirmOff] = useState(false)

  const load = useCallback(() => api.get('/sales-alerts').then((r) => setTg(r.telegram)).catch(() => setTg(null)), [])
  useEffect(() => {
    load()
  }, [load])

  const act = async (name, fn) => {
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy('')
    }
  }

  const start = () =>
    act('start', async () => {
      const r = await api.post('/sales-alerts/telegram/start')
      setTg((t) => ({ ...t, code: r.code, bot_username: r.bot_username }))
    })
  const check = () =>
    act('check', async () => {
      const r = await api.post('/sales-alerts/telegram/check')
      if (r.connected) {
        showToast(`Connected to ${r.title}`)
        await load()
      } else {
        showToast('Not found yet — send the /connect message in the group, wait a few seconds, then check again')
      }
    })
  const test = () =>
    act('test', async () => {
      await api.post('/sales-alerts/telegram/test')
      showToast('Test message sent — look in the group')
    })
  const off = () =>
    act('off', async () => {
      await api.del('/sales-alerts/telegram')
      setConfirmOff(false)
      await load()
    })

  const copy = (text) => {
    try {
      navigator.clipboard.writeText(text)
      showToast('Copied')
    } catch {
      showToast(text)
    }
  }

  if (!tg) return null
  const command = tg.code ? `/connect ${tg.code}` : ''

  return (
    <section className="mb-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">Sales alerts · Telegram</h2>
          <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
            Every lead handed to a rep is posted in your sales team’s Telegram group, mentioning the rep by @username — with the
            lead’s needs, contact, call deadline and a link. Add each rep’s @username under Leads → Sales team.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            tg.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600'
          }`}
        >
          {tg.connected ? `Connected · ${tg.title}` : 'Not connected'}
        </span>
      </div>

      {!tg.has_bot ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
          There’s no Telegram bot yet. Connect a Telegram channel (it brings its bot), then come back here.
        </p>
      ) : tg.code ? (
        <ol className="mt-4 space-y-2.5 text-[12.5px] text-ink-700">
          <li>
            <b>1.</b> Add {tg.bot_username ? <b className="font-mono">@{tg.bot_username}</b> : 'your bot'} to your sales group.
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span>
              <b>2.</b> Send this message in the group:
            </span>
            <code className="rounded-lg bg-ink-100 px-2.5 py-1 font-mono text-[12.5px] font-semibold text-ink-900">{command}</code>
            <button type="button" onClick={() => copy(command)} className="text-ink-400 hover:text-brand" aria-label="Copy">
              <FiCopy size={13} />
            </button>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span>
              <b>3.</b> Then press
            </span>
            <button type="button" onClick={check} disabled={!!busy} className="btn-primary px-3 py-1.5">
              {busy === 'check' ? 'Checking…' : 'Check'}
            </button>
          </li>
        </ol>
      ) : null}

      {canManage && tg.has_bot ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
          {tg.connected ? (
            <>
              <button type="button" onClick={test} disabled={!!busy} className="btn-outline">
                {busy === 'test' ? 'Sending…' : 'Send a test'}
              </button>
              <button type="button" onClick={start} disabled={!!busy} className="btn-ghost text-ink-600">
                Use another group
              </button>
              {confirmOff ? (
                <>
                  <span className="text-[12px] text-ink-600">Stop posting hand-offs?</span>
                  <button type="button" onClick={off} disabled={!!busy} className="btn-danger px-3">
                    Turn off
                  </button>
                  <button type="button" onClick={() => setConfirmOff(false)} className="btn-ghost px-3">
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmOff(true)} className="btn-ghost text-ink-600">
                  Turn off
                </button>
              )}
            </>
          ) : (
            !tg.code && (
              <button type="button" onClick={start} disabled={!!busy} className="btn-primary">
                Connect a Telegram group
              </button>
            )
          )}
        </div>
      ) : (
        !canManage && <p className="mt-4 border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">Only an owner or admin can change this.</p>
      )}
    </section>
  )
}
