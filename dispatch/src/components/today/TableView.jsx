import { useNavigate } from 'react-router-dom'
import { colorForBrand } from '../../lib/brandColor'
import { useStore } from '../../store'
import { phnomPenhDay, dayLabel } from '../../lib/tz'
import PlatformIcon from '../ui/PlatformIcon'
import StatusBadge from './StatusBadge'

const isKhmer = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s)

export default function TableView({ queue, match = () => true }) {
  const navigate = useNavigate()
  // The post page looks posts up by their place in the store's queue — this
  // list is sorted differently (by date and time), so link by that place,
  // not by the row's position here.
  const { queue: storeQueue } = useStore()
  const openPost = (q) => navigate(`/post/${storeQueue.indexOf(q)}`)
  const visible = queue.map((q, i) => ({ q, i })).filter(({ q }) => match(q))

  if (!visible.length) {
    return (
      <div className="px-7 py-16 text-center text-[12px] text-ink-400">
        Nothing on this day. Pick another date above.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11.5px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60 text-[10px] uppercase tracking-wide text-ink-400">
            <th className="px-7 py-2.5 font-bold">Day</th>
            <th className="px-3 py-2.5 font-bold">Time</th>
            <th className="px-3 py-2.5 font-bold">Brand</th>
            <th className="px-3 py-2.5 font-bold">Post</th>
            <th className="px-3 py-2.5 font-bold">Channels</th>
            <th className="px-7 py-2.5 font-bold text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {visible.map(({ q, i }) => {
            const name = q.brandName || q.b
            const day = phnomPenhDay(q.scheduledFor)
            return (
              <tr
                key={q.postId ?? q.targetId ?? i}
                onClick={() => openPost(q)}
                className="cursor-pointer transition-colors duration-100 hover:bg-brand/[0.04]"
              >
                <td className="px-7 py-2.5 whitespace-nowrap font-semibold text-ink-600">
                  {day ? dayLabel(day) : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-ink-500 tabular-nums">
                  {q.t}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink-800">
                    <span
                      className="h-1.5 w-1.5 rounded-full flex-none"
                      style={{ background: colorForBrand(q.b) }}
                    />
                    {name}
                  </span>
                </td>
                <td className="px-3 py-2.5 min-w-[220px] max-w-[340px]">
                  <div className="truncate font-semibold text-ink-800">{q.ttl}</div>
                  {q.cap && (
                    <div className={`truncate text-[10.5px] text-ink-500 ${isKhmer(q.cap) ? 'font-khmer' : ''}`}>
                      {q.cap}
                    </div>
                  )}
                  {q.st === 'failed' && q.error && (
                    <div className="truncate text-[10px] text-red-600">{q.error}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {q.c.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold text-ink-500 bg-ink-50 border border-ink-200"
                      >
                        <PlatformIcon name={ch} className="text-ink-400" />
                        {ch}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-7 py-2.5 whitespace-nowrap text-right">
                  <StatusBadge status={q.st} compact />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}