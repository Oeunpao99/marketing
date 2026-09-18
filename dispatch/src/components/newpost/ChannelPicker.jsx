import { BRANDS, PLAT } from '../../data/brands'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }

export default function ChannelPicker({ channels, selectedChannels, toggle }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[11px] font-bold tracking-[.08em] uppercase text-ink-400">Where it goes</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        {BRANDS.map((b) => {
          const channelRows = channels.filter((c) => c.b === b.id)
          const color = BRAND_COLORS[b.id] || '#166432'
          return (
            <div key={b.id} className="bg-white border border-ink-100 rounded-2xl px-4 py-3.5 shadow-card hover:shadow-card-hover transition-all duration-150">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}30` }} />
                <span className="text-sm font-bold text-ink-800">{b.name}</span>
              </div>
              <div className="text-[12px] text-ink-400 mb-2">{b.lang}</div>
              {channelRows.map((c) => (
                <CheckRow
                  key={c.id}
                  label={PLAT[c.p].name}
                  off={c.s === 'off'}
                  checked={selectedChannels.some((x) => x.id === c.id)}
                  onChange={(v) => toggle(c.id, v)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CheckRow({ label, off, checked, onChange }) {
  return (
    <label
      className={`flex items-center gap-2 py-1.5 text-[13.5px] font-semibold ${off ? 'text-ink-400 cursor-not-allowed' : 'cursor-pointer text-ink-700 hover:text-ink-900 transition-all duration-150'}`}
    >
      <input
        type="checkbox"
        className="w-[15px] h-[15px] accent-brand flex-none"
        disabled={off}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
      {off && <span className="text-[11.5px] text-ink-400">— not connected</span>}
    </label>
  )
}
