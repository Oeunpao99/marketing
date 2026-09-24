import { useLayoutEffect, useRef } from 'react'

/** A textarea that grows with what's typed (up to maxRows, then scrolls)
 * instead of showing a drag-to-resize corner. */
export default function AutoTextarea({ value, minRows = 2, maxRows = 8, className = '', ...props }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    const pad = el.offsetHeight - el.clientHeight + parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom)
    el.style.height = 'auto'
    const min = minRows * line + pad
    const max = maxRows * line + pad
    const next = Math.min(max, Math.max(min, el.scrollHeight + (el.offsetHeight - el.clientHeight)))
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight + (el.offsetHeight - el.clientHeight) > max ? 'auto' : 'hidden'
  }, [value, minRows, maxRows])

  return <textarea ref={ref} value={value} rows={minRows} className={`resize-none ${className}`} {...props} />
}
