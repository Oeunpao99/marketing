import { useRef, useState } from 'react'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileAsset(file) {
  const kind = file.type.startsWith('image') ? 'image' : 'video'
  return {
    name: file.name,
    size: formatSize(file.size),
    dur: kind === 'image' ? 'image' : '—',
    tag: 'Local file',
    file,
    kind,
    previewUrl: URL.createObjectURL(file),
  }
}

export default function VideoStep({ onSetVideo, hasVideo, video }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const pick = (v) => onSetVideo(v)

  const handleFiles = (fileList) => {
    const file = fileList && fileList[0]
    if (!file) return
    if (!/^(image|video)\//.test(file.type)) return
    pick(fileAsset(file))
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
  }

  const previewUrl = video?.previewUrl || video?.url
  const isImage = video?.kind === 'image'

  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[10px] font-bold tracking-[.08em] uppercase text-ink-400">Video / image</h2>

      {!hasVideo ? (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`w-full block border-2 border-dashed rounded-2xl bg-white px-6 py-9 text-center transition-all duration-200 cursor-pointer ${
              drag ? 'border-brand bg-brand/5 shadow-glow' : 'border-ink-200 hover:border-brand/40 hover:bg-brand/3'
            }`}
          >
            <span className="block text-[14px] font-semibold text-ink-800">
              {drag ? 'Drop to attach' : 'Drop a video or image here, or click to choose'}
            </span>
            <span className="mt-0.5 block text-[12px] text-ink-500">
              MP4 / MOV / JPG / PNG · drag it straight from your downloads
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*,.mp4,.mov"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </>
      ) : (
        <div className="bg-white border border-ink-100 rounded-2xl px-4 py-3.5 flex gap-4 items-center shadow-card">
          <div className="w-16 h-24 rounded-lg flex-none overflow-hidden bg-ink-900 grid place-items-center text-ink-500 font-mono text-[10px]">
            {previewUrl ? (
              isImage ? (
                <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={previewUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              )
            ) : (
              '9:16'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-800 truncate">{video?.name}</div>
            <div className="text-[11.5px] text-ink-500">
              {video?.file ? `${video.tag || 'Local file'} · ` : ''}
              {video?.dur}
              {video?.size ? ` · ${video.size}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl)
              onSetVideo(null)
            }}
            className="px-2.5 py-1.5 rounded-xl text-[12px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-all duration-150"
          >
            Remove
          </button>
        </div>
      )}
    </section>
  )
}
