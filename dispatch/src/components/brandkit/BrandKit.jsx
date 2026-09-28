// Brand kit — the logo, product photos and poster templates the image AI
// builds on (backend app/brand_kit.py). Managed on the Products page; picked
// from in the AI Agent's image composer and Auto-generate's image settings.
import { useRef, useState } from 'react'
import { FiCamera, FiCheck, FiImage, FiPlus, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import { api } from '../../api/client'
import AutoTextarea from '../ui/AutoTextarea'

export const kitSrc = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${window.location.port === '5173' ? 'http://localhost:8000' : ''}${url}`)

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp'

/** Upload one brand-kit file; returns the saved asset. */
export async function uploadKitAsset(file, { brandId, kind, productId, name = '', note = '' }) {
  const fd = new FormData()
  fd.append('file', file, file.name || 'image.png')
  fd.append('brand_id', String(brandId))
  fd.append('kind', kind)
  if (productId != null) fd.append('product_id', String(productId))
  if (name) fd.append('name', name)
  if (note) fd.append('note', note)
  return api.upload('/brand-kit', fd)
}

/** Hidden file input + a trigger — `children(open, busy)` renders the trigger. */
function FilePick({ multiple = false, onFiles, children }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      await onFiles(files)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept={IMAGE_TYPES} multiple={multiple} className="hidden" onChange={pick} />
      {children(() => ref.current?.click(), busy)}
    </>
  )
}

/** The Brand kit tab: logo + poster templates for one brand. */
export function BrandKitPanel({ brand, assets, setAssets, showToast }) {
  const logo = assets.find((a) => a.kind === 'logo' && a.brand_id === brand.id)
  const templates = assets.filter((a) => a.kind === 'template' && a.brand_id === brand.id)

  const add = async (files, kind) => {
    for (const file of files) {
      try {
        const saved = await uploadKitAsset(file, { brandId: brand.id, kind, name: file.name.replace(/\.[^.]+$/, '') })
        setAssets((xs) => [...xs.filter((x) => !(kind === 'logo' && x.kind === 'logo' && x.brand_id === brand.id)), saved])
      } catch (e) {
        showToast(`Couldn’t upload ${file.name} — ${e.message}`)
        return
      }
    }
    showToast(kind === 'logo' ? 'Logo saved' : files.length > 1 ? `${files.length} templates added` : 'Template added')
  }

  const remove = async (a) => {
    try {
      await api.del(`/brand-kit/${a.id}`)
      setAssets((xs) => xs.filter((x) => x.id !== a.id))
    } catch (e) {
      showToast(`Couldn’t remove — ${e.message}`)
    }
  }

  const patch = async (a, body) => {
    try {
      const saved = await api.patch(`/brand-kit/${a.id}`, body)
      setAssets((xs) => xs.map((x) => (x.id === a.id ? saved : x)))
    } catch (e) {
      showToast(`Couldn’t save — ${e.message}`)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* logo */}
      <section className="card p-5">
        <h2 className="text-[14.5px] font-semibold text-ink-900">Logo</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
          Placed on posters exactly as it is. A PNG with a transparent background works best.
        </p>
        <FilePick onFiles={(f) => add(f.slice(0, 1), 'logo')}>
          {(open, busy) => (
            <button
              type="button"
              onClick={open}
              disabled={busy}
              className="group relative mt-4 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-ink-200 bg-[repeating-conic-gradient(rgb(var(--ink-100))_0_25%,transparent_0_50%)] bg-[length:16px_16px] hover:border-brand-line"
            >
              {logo ? (
                <img src={kitSrc(logo.url)} alt={`${brand.name} logo`} className="max-h-[70%] max-w-[80%] object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-[12px] font-semibold text-ink-500">
                  <FiUploadCloud size={22} />
                  {busy ? 'Uploading…' : 'Upload logo'}
                </span>
              )}
              {logo && (
                <span className="absolute inset-x-0 bottom-0 bg-night-900/60 py-1.5 text-[11.5px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {busy ? 'Uploading…' : 'Replace'}
                </span>
              )}
            </button>
          )}
        </FilePick>
        {logo && (
          <button type="button" onClick={() => remove(logo)} className="mt-2 text-[11.5px] font-semibold text-ink-400 hover:text-red-600">
            Remove logo
          </button>
        )}
      </section>

      {/* poster templates */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14.5px] font-semibold text-ink-900">Poster templates</h2>
            <p className="mt-0.5 max-w-[60ch] text-[12px] leading-relaxed text-ink-500">
              Posters whose look you like — your own or an inspiration. New posters copy the layout, colours and style
              with fresh content, your logo and your product. Placeholders like “LOGO PLACE” or “00.00” are filled in, never printed.
            </p>
          </div>
          <FilePick multiple onFiles={(f) => add(f, 'template')}>
            {(open, busy) => (
              <button type="button" onClick={open} disabled={busy || templates.length >= 12} className="btn-outline flex-none">
                <FiPlus size={14} /> {busy ? 'Uploading…' : 'Add templates'}
              </button>
            )}
          </FilePick>
        </div>

        {templates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-[12.5px] text-ink-400">
            No templates yet. Add 2–5 posters in the style you want every image to follow.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} t={t} onPatch={(b) => patch(t, b)} onRemove={() => remove(t)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TemplateCard({ t, onPatch, onRemove }) {
  const [name, setName] = useState(t.name)
  const [note, setNote] = useState(t.note)
  return (
    <div className="overflow-hidden rounded-xl border border-ink-100">
      <div className="relative aspect-[3/4] bg-ink-50">
        <img src={kitSrc(t.url)} alt={t.name} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-night-900/60 text-white hover:bg-red-600"
          aria-label="Remove template"
        >
          <FiTrash2 size={13} />
        </button>
      </div>
      <div className="space-y-1.5 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== t.name && onPatch({ name })}
          className="w-full bg-transparent text-[12.5px] font-semibold text-ink-900 outline-none"
          aria-label="Template name"
        />
        <AutoTextarea
          minRows={2}
          maxRows={6}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== t.note && onPatch({ note })}
          placeholder="What to keep (optional) — e.g. blue background, headline top-right, flat illustration"
          className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] text-ink-700 placeholder:text-ink-300 focus:border-brand focus:outline-none"
        />
      </div>
    </div>
  )
}

/** A product card's photo slot — the real product the AI shows on posters. */
export function ProductPhoto({ product, photo, onSaved, showToast }) {
  const upload = async ([file]) => {
    try {
      const saved = await uploadKitAsset(file, { brandId: product.brand_id, kind: 'product', productId: product.id, name: product.name })
      onSaved(saved)
    } catch (e) {
      showToast(`Couldn’t upload — ${e.message}`)
    }
  }
  return (
    <FilePick onFiles={upload}>
      {(open, busy) => (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          title={photo ? 'Replace the product photo' : 'Add a real photo — posters will show this exact product'}
          className="group relative grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-xl border border-ink-200 bg-ink-50 hover:border-brand-line"
        >
          {photo ? (
            <>
              <img src={kitSrc(photo.url)} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 grid place-items-center bg-night-900/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <FiCamera size={15} />
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-ink-400">
              <FiCamera size={15} />
              {busy ? '…' : 'Photo'}
            </span>
          )}
        </button>
      )}
    </FilePick>
  )
}

/** Thumbnail picker used by the AI Agent and Auto-generate: pick one
 *  (single) or several (multiple) templates. */
export function TemplatePicker({ templates, value, onChange, multiple = false, allowNone = true }) {
  const selected = multiple ? new Set(value || []) : new Set(value != null ? [value] : [])
  const toggle = (id) => {
    if (!multiple) return onChange(selected.has(id) && allowNone ? null : id)
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange([...next])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {!multiple && allowNone && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`grid h-[84px] w-[63px] place-items-center rounded-lg border text-[10.5px] font-semibold ${
            value == null ? 'border-brand bg-brand-soft text-brand' : 'border-ink-200 text-ink-500 hover:border-brand-line'
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            <FiImage size={14} />
            None
          </span>
        </button>
      )}
      {templates.map((t) => {
        const on = selected.has(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            title={t.name}
            aria-pressed={on}
            className={`relative h-[84px] w-[63px] overflow-hidden rounded-lg border-2 ${on ? 'border-brand' : 'border-transparent hover:border-brand-line'}`}
          >
            <img src={kitSrc(t.url)} alt={t.name} className="h-full w-full object-cover" />
            {on && (
              <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-white">
                <FiCheck size={10} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
