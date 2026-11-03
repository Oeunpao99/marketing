import { useCallback, useEffect, useState } from 'react'
import { FiCheck, FiExternalLink, FiSend, FiTrash2, FiUser, FiUserPlus, FiUsers } from 'react-icons/fi'

// Team alerts (backend app/team_alerts.py, routes /admin-mkt/team-alerts): who on our
// team gets a Telegram message for every new sign-up. The bot is added once (its
// token from @BotFather); each person or group then connects with a one-time link —
// a bot can't message anyone by @username until they've opened it.

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const input =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-brand hover:text-brand disabled:opacity-50'
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function TeamAlerts({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [token, setToken] = useState('')
  const [editBot, setEditBot] = useState(false)
  const [connect, setConnect] = useState(null) // {code, bot_username, links} while adding someone

  const load = useCallback(async () => {
    try {
      setData(await api('GET', '/team-alerts'))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [api])
  useEffect(() => {
    load()
  }, [load])

  const run = async (name, fn) => {
    setBusy(name)
    setError('')
    setNote('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const check = useCallback(
    async (quiet = false) => {
      try {
        const out = await api('POST', '/team-alerts/check')
        if (out.added?.length) {
          setData(out)
          setConnect(null)
          setNote(`Added ${out.added.map((r) => r.name).join(', ')} — they got a “team alerts are on” message.`)
        } else if (!quiet) setNote('Not yet — open the link, press Start in Telegram, then check again.')
      } catch (e) {
        if (!quiet) setError(e.message)
      }
    },
    [api],
  )

  // while a link is open, look every few seconds (for 3 minutes)
  useEffect(() => {
    if (!connect) return
    const started = Date.now()
    const t = setInterval(() => (Date.now() - started > 180000 ? clearInterval(t) : check(true)), 4000)
    return () => clearInterval(t)
  }, [connect, check])

  if (!data) return <div className={`text-[13px] ${error ? 'text-red-600' : 'text-ink-500'}`}>{error || 'Loading…'}</div>
  const bot = data.bot
  const showBotForm = !bot.set || editBot

  return (
    <div className="max-w-[760px] space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink-900">Team alerts</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Every new sign-up is sent to these people or groups on Telegram — name, email, device and place — so someone can say hello and help them start.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">{error}</p>}
      {note && <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-700">{note}</p>}

      {/* 1 · the bot */}
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">1 · The bot</h2>
            {bot.set ? (
              <p className="mt-1 text-[13px] text-ink-600">
                {bot.username ? (
                  <>
                    <b className="text-ink-900">@{bot.username}</b> sends the alerts
                  </>
                ) : (
                  <span className="text-red-600">The bot’s token doesn’t work any more — add it again.</span>
                )}
                <span className="text-ink-400"> · {bot.from === 'portal' ? 'added here' : 'from the server settings'}</span>
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-ink-500">The Telegram bot that sends the alerts.</p>
            )}
          </div>
          {bot.set && !editBot && (
            <div className="flex gap-2">
              <button type="button" className={ghost} onClick={() => setEditBot(true)}>
                {bot.from === 'portal' ? 'Change' : 'Use another bot'}
              </button>
              {bot.from === 'portal' && (
                <button
                  type="button"
                  className={ghost}
                  disabled={busy === 'clear'}
                  onClick={() => run('clear', async () => setData(await api('DELETE', '/team-alerts/bot')))}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
        {showBotForm && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              run('bot', async () => {
                setData(await api('PUT', '/team-alerts/bot', { token }))
                setToken('')
                setEditBot(false)
                setConnect(null)
                setNote('Bot saved.')
              })
            }}
          >
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-ink-600">
              <li>
                In Telegram, open{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                  @BotFather
                </a>{' '}
                and send <code className="rounded bg-ink-50 px-1">/newbot</code>.
              </li>
              <li>Give it a name (e.g. “Smart Marketing Team”) and a username ending in “bot”.</li>
              <li>BotFather replies with a token — paste it here.</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAH…"
                autoComplete="off"
                spellCheck={false}
                className={`${input} font-mono`}
              />
              <button type="submit" disabled={busy === 'bot' || token.trim().length < 20} className="btn-primary justify-center whitespace-nowrap px-4">
                {busy === 'bot' ? 'Checking…' : 'Save bot'}
              </button>
              {editBot && (
                <button type="button" className={ghost} onClick={() => (setEditBot(false), setToken(''))}>
                  Cancel
                </button>
              )}
            </div>
            <p className="text-[11.5px] text-ink-400">The token is kept encrypted and never shown again.</p>
          </form>
        )}
      </section>

      {/* 2 · who gets them */}
      <section className={`${card} p-5 ${bot.username ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">2 · Who gets the alerts</h2>
            <p className="mt-1 text-[13px] text-ink-500">Add a team group, or each person on their own.</p>
          </div>
          <div className="flex gap-2">
            {(data.recipients.length > 0 || data.server_chat) && (
              <button
                type="button"
                className={ghost}
                disabled={busy === 'test'}
                onClick={() =>
                  run('test', async () => {
                    const out = await api('POST', '/team-alerts/test')
                    setNote(`Test sent to ${out.sent} of ${out.total}.`)
                  })
                }
              >
                <FiSend size={13} /> {busy === 'test' ? 'Sending…' : 'Send a test'}
              </button>
            )}
            <button
              type="button"
              className="btn-primary px-3.5 py-1.5 text-[12.5px]"
              disabled={busy === 'connect'}
              onClick={() => run('connect', async () => setConnect(await api('POST', '/team-alerts/connect')))}
            >
              <FiUserPlus size={14} /> Add someone
            </button>
          </div>
        </div>

        {connect && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
            <p className="text-[13px] font-semibold text-ink-900">Open one of these on the phone or computer that has Telegram:</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <a href={connect.links.person} target="_blank" rel="noreferrer" className={`${card} flex items-start gap-3 p-3 hover:border-brand`}>
                <FiUser className="mt-0.5 flex-none text-brand" size={16} />
                <span>
                  <span className="flex items-center gap-1 text-[13px] font-bold text-ink-900">
                    A person <FiExternalLink size={12} />
                  </span>
                  <span className="block text-[12px] text-ink-500">Opens @{connect.bot_username} — press Start.</span>
                </span>
              </a>
              <a href={connect.links.group} target="_blank" rel="noreferrer" className={`${card} flex items-start gap-3 p-3 hover:border-brand`}>
                <FiUsers className="mt-0.5 flex-none text-brand" size={16} />
                <span>
                  <span className="flex items-center gap-1 text-[13px] font-bold text-ink-900">
                    A group <FiExternalLink size={12} />
                  </span>
                  <span className="block text-[12px] text-ink-500">Pick your team group — the bot joins it.</span>
                </span>
              </a>
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              Sending it someone else? Share the link, or have them send <code className="rounded bg-white px-1">/start {connect.code}</code> to @{connect.bot_username}.
              This page notices by itself.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className={ghost} onClick={() => run('check', () => check(false))} disabled={busy === 'check'}>
                <FiCheck size={13} /> {busy === 'check' ? 'Checking…' : 'Check now'}
              </button>
              <button type="button" className={ghost} onClick={() => setConnect(null)}>
                Done
              </button>
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y divide-ink-100">
          {data.recipients.map((r) => (
            <li key={r.chat_id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-soft text-brand">
                {r.kind === 'group' ? <FiUsers size={15} /> : <FiUser size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink-900">{r.name}</span>
                <span className="block text-[11.5px] text-ink-400">
                  {r.kind === 'group' ? 'Group' : 'Person'}
                  {r.username ? ` · @${r.username}` : ''}
                  {r.added_at ? ` · added ${day(r.added_at)}` : ''}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => run('remove', async () => setData(await api('DELETE', `/team-alerts/recipients/${encodeURIComponent(r.chat_id)}`)))}
              >
                <FiTrash2 size={14} />
              </button>
            </li>
          ))}
          {data.server_chat && (
            <li className="flex items-center gap-3 py-3 text-[12.5px] text-ink-500">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink-50 text-ink-400">
                <FiUsers size={15} />
              </span>
              The chat set on the server (TEAM_TELEGRAM_CHAT_ID) also gets them.
            </li>
          )}
          {!data.recipients.length && !data.server_chat && <li className="py-3 text-[12.5px] text-ink-400">Nobody yet — press “Add someone”.</li>}
        </ul>
      </section>
    </div>
  )
}
