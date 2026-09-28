import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FiAlertTriangle, FiTrash2, FiX } from 'react-icons/fi'
import { api } from '../../api/client'
import { PLAT } from '../../data/brands'
import { useStore } from '../../store'

// Platforms whose API can't delete a post (backend publishers._NO_DELETE).
const MANUAL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }

/** Delete a published post — on its platform first, then from ContentFlow
 * (DELETE /views/post-targets/{id}). It only disappears here once the
 * platform confirmed; otherwise the reason is shown, with "remove from
 * ContentFlow only" for when the person deleted it on the platform themselves. */
export default function DeletePostDialog({ post, onClose, onDeleted }) {
  const { showToast, refreshQueue } = useStore()
  const name = PLAT[post.platform_slug]?.name || post.platform_slug || 'the platform'
  const manual = MANUAL[post.platform_slug]
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(manual ? `${manual} doesn’t let apps delete posts. Delete it in the ${manual} app first, then remove it here.` : '')

  const remove = async (force) => {
    setBusy(true)
    try {
      const res = await api.del(`/views/post-targets/${post.target_id}${force ? '?force=true' : ''}`)
      const left = res?.remaining?.[0]
      if (left) {
        setProblem(left.detail || 'The platform didn’t confirm the delete.')
        setBusy(false)
        return
      }
      const r = res?.channels?.[0]?.result
      showToast(r === 'removed' ? `Deleted from ${name} and ContentFlow` : 'Removed from ContentFlow')
      refreshQueue?.()
      onDeleted()
    } catch (e) {
      setProblem(e.message)
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-4 animate-fadein" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-[440px] rounded-3xl glass-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FiTrash2 size={15} className="text-red-600" />
          <div className="flex-1 text-[14px] font-bold text-ink-900">Delete post</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <FiX size={18} />
          </button>
        </div>

        {!manual && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
            This deletes the post from <b className="text-ink-900">{name}</b> first, then removes it and its numbers from
            ContentFlow. It can’t be undone.
          </p>
        )}

        {problem && (
          <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
            <FiAlertTriangle size={14} className="mt-0.5 flex-none" />
            <div>
              {problem}
              <div className="mt-1 text-amber-800">
                Still showing here, so nothing is hidden while it may be live. If it’s already gone from {name}, remove it
                from ContentFlow only.
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-3.5 py-1.5">
            Cancel
          </button>
          {problem && (
            <button type="button" onClick={() => remove(true)} disabled={busy} className="btn-outline">
              {manual ? `I deleted it on ${manual} — remove here` : 'Remove from ContentFlow only'}
            </button>
          )}
          {!manual && (
            <button
              type="button"
              onClick={() => remove(false)}
              disabled={busy}
              className="btn-primary bg-red-600 hover:bg-red-700 border-red-600"
            >
              {busy ? 'Deleting…' : problem ? 'Try again' : `Delete from ${name}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
