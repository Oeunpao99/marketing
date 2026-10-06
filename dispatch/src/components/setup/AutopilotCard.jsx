import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useStore } from '../../store'
import Select from '../ui/Select'

// "Autopilot by task" — what the AI may do by itself, per brand. Every row maps
// to a real Automation field; tasks that aren't built yet say so instead of
// pretending to be on.
const DAILY = [
  { value: 'off', label: 'Off', hint: 'Nothing is written or posted' },
  { value: 'ask', label: 'Ask me', hint: 'Written daily, waits for your OK' },
  { value: 'auto', label: 'Auto', hint: 'Written and posted by itself' },
]
const IMAGES = [
  { value: 'off', label: 'Ask me', hint: 'You add the image' },
  { value: 'auto', label: 'Auto', hint: 'Made automatically for each post' },
]
const LEARN = [
  { value: 'on', label: 'Auto', hint: 'Uses what worked on past posts' },
  { value: 'off', label: 'Off', hint: 'Ignores past results' },
]

const dailyOf = (a) => (!a.enabled ? 'off' : a.require_approval ? 'ask' : 'auto')

export default function AutopilotCard({ brandSlug }) {
  const { auto, setAuto, refreshAuto, brands, showToast } = useStore()
  const brand = brands.find((b) => b.slug === brandSlug)
  const a = (auto || []).find((x) => x.brand_id === brand?.id)
  if (!brand || !a) return null

  const update = async (patch) => {
    setAuto((list) => (list || []).map((x) => (x.id === a.id ? { ...x, ...patch } : x)))
    try {
      await api.patch(`/automations/${a.id}`, patch)
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
      refreshAuto()
    }
  }

  const setDaily = (v) =>
    update({ enabled: v !== 'off', ...(v === 'off' ? {} : { require_approval: v === 'ask' }) })

  const rows = [
    { label: 'Daily posts', value: dailyOf(a), options: DAILY, onChange: setDaily },
    { label: 'Images', value: a.auto_media ? 'auto' : 'off', options: IMAGES, onChange: (v) => update({ auto_media: v === 'auto' }) },
    { label: 'Learn from results', value: a.learn_from_results ? 'on' : 'off', options: LEARN, onChange: (v) => update({ learn_from_results: v === 'on' }) },
  ]
  const soon = ['Comment replies', 'Lead hand-off', 'Paid boosts']

  return (
    <section className="mb-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-900">Autopilot by task · {brand.name}</h2>
        <span className="flex items-center gap-3 text-[11.5px] text-ink-400">
          Weekly plans always wait for you
          <Link to="/auto" className="font-semibold text-brand hover:underline">
            More settings →
          </Link>
        </span>
      </div>
      <ul className="divide-y divide-ink-100">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13px] text-ink-800">{r.label}</span>
            <Select size="sm" align="right" value={r.value} options={r.options} onChange={r.onChange} aria-label={r.label} />
          </li>
        ))}
        {soon.map((s) => (
          <li key={s} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13px] text-ink-500">{s}</span>
            <span className="text-[11.5px] text-ink-400">Coming soon</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
