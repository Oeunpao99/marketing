import { useCallback, useRef, useState } from 'react'

const DEFAULT_ACCEPT = 'image/*,video/*'

export function fileMeta(file) {
  const kind = file.type.startsWith('video') ? 'video' : 'image'
  return {
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    kind,
    url: URL.createObjectURL(file),
    isLocal: true,
  }
}

export function humanSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

/**
 * Real HTML5 drag-and-drop + click-to-choose for an image or video file.
 * Calls onFile(meta) where meta comes from fileMeta().
 */
export default function DropZone({
  onFile,
  accept = DEFAULT_ACCEPT,
  maxMB = 200,
  title = 'Drop a file here, or click to choose',
  hint = 'Image or video · drag it straight from your downloads',
  compact = false,
}) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState(null)

  const take = useCallback(
    (file) => {
      setErr(null)
      if (!file) return
      const okType =
        accept === DEFAULT_ACCEPT
          ? /^(image|video)\//.test(file.type)
          : true
      if (!okType) {
        setErr('That file type is not supported.')
        return
      }
      if (file.size > maxMB * 1024 * 1024) {
        setErr(`Too big — max ${maxMB} MB.`)
        return
      }
      onFile(fileMeta(file))
    },
    [accept, maxMB, onFile],
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          take(e.dataTransfer.files?.[0])
        }}
        className={`w-full block border-2 border-dashed rounded-2xl bg-white text-center transition-all duration-200 ${
          compact ? 'px-4 py-5' : 'px-6 py-9'
        } ${
          drag
            ? 'border-brand bg-brand/5 shadow-glow'
            : 'border-ink-200 hover:border-brand/40 hover:bg-brand/3'
        }`}
      >
        <span className={`block font-semibold text-ink-800 ${compact ? 'text-[13.5px]' : 'text-[15px]'}`}>
          {drag ? 'Drop to attach' : title}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ink-500">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {err && <div className="mt-1.5 text-[12px] text-red-600">{err}</div>}
    </div>
  )
}
