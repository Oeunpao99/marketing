// Brand kit — the logo, product photos and poster templates the image AI
// builds on, the app screenshots the Remotion videos show (backend app/brand_kit.py),
// and the brand's own voice for its videos (BrandVoice). Managed on the Products page; picked
// from in the AI Agent's image composer and Auto-generate's image settings.
import { useEffect, useRef, useState } from 'react'
import { FiCamera, FiCheck, FiImage, FiPlus, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import { api } from '../../api/client'
import AutoTextarea from '../ui/AutoTextarea'
import BrandVoice from './BrandVoice'

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

/** Hidden file input + a trigger — `children(open, busy, drop)` renders the
 *  trigger; spread `drop.props` on it to take files dragged onto it too
 *  (`drop.over` while one is held over it). */
function FilePick({ multiple = false, onFiles, children }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const run = async (list) => {
    const files = [...list].filter((f) => IMAGE_TYPES.split(',').includes(f.type))
    if (!files.length) return
    setBusy(true)
    try {
      await onFiles(multiple ? files : files.slice(0, 1))
    } finally {
      setBusy(false)
    }
  }
  const pick = (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    run(files)
  }
  const drop = {
    over,
    props: {
      onDragOver: (e) => {
        e.preventDefault()
        if (!busy) setOver(true)
      },
      onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false),
      onDrop: (e) => {
        e.preventDefault()
        setOver(false)
        if (!busy) run(e.dataTransfer?.files || [])
      },
    },
  }
  return (
    <>
      <input ref={ref} type="file" accept={IMAGE_TYPES} multiple={multiple} className="hidden" onChange={pick} />
      {children(() => ref.current?.click(), busy, drop)}
    </>
  )
}

const HEX = /^#?[0-9a-f]{6}$/i

/** The brand's colours (main first, up to 3) — read from the logo when it's
 *  uploaded (backend app/colors.py), changed here; videos and posters use them. */
function BrandColors({ brand, logoId, showToast }) {
  const [data, setData] = useState(null) // { colors, has_logo }
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null) // index whose hex is being typed
  const [draft, setDraft] = useState('')
  const pickers = useRef([])

  // again when the logo changes: a new logo may have just set the colours
  useEffect(() => {
    let live = true
    api
      .get(`/brand-kit/colors/${brand.id}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ colors: [], has_logo: !!logoId }))
    return () => {
      live = false
    }
  }, [brand.id, logoId])

  const colors = data?.colors || []
  const save = async (next) => {
    setData((d) => ({ ...d, colors: next }))
    try {
      setData(await api.put(`/brand-kit/colors/${brand.id}`, { colors: next }))
    } catch (e) {
      showToast(`Couldn’t save the colours — ${e.message}`)
    }
  }
  const setAt = (i, hex) => save(colors.map((c, j) => (j === i ? hex.toUpperCase() : c)))
  const fromLogo = async () => {
    setBusy(true)
    try {
      setData(await api.post(`/brand-kit/colors/${brand.id}/detect`))
      showToast('Colours read from your logo')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  return (
    <div className="mt-5 border-t border-ink-100 pt-4">
      <h3 className="text-[13px] font-semibold text-ink-900">Brand colours</h3>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">
        {colors.length ? 'Your videos and posters are drawn in these — the first is the main one.' : data.has_logo ? 'Your logo has no clear colour — pick yours.' : 'Read from your logo when you upload it, or pick them here.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {colors.map((c, i) => (
          <div key={i} className="group relative flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => pickers.current[i]?.click()}
              title="Change this colour"
              className="h-10 w-10 rounded-xl border border-ink-200 shadow-sm transition-transform hover:scale-105"
              style={{ background: c }}
            />
            <input ref={(el) => (pickers.current[i] = el)} type="color" value={c} onChange={(e) => setAt(i, e.target.value)} className="sr-only" tabIndex={-1} aria-hidden="true" />
            {editing === i ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (HEX.test(draft.trim())) setAt(i, draft.trim().startsWith('#') ? draft.trim() : `#${draft.trim()}`)
                  setEditing(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-[68px] rounded-md border border-ink-200 bg-white px-1 py-0.5 text-center font-mono text-[10.5px] text-ink-700 outline-none focus:border-brand"
              />
            ) : (
              <button type="button" onClick={() => (setEditing(i), setDraft(c))} className="font-mono text-[10.5px] text-ink-500 hover:text-ink-900" title="Type a colour code">
                {c}
              </button>
            )}
            <button
              type="button"
              onClick={() => save(colors.filter((_, j) => j !== i))}
              title="Remove"
              className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm hover:text-red-600 group-hover:grid"
            >
              <FiTrash2 size={10} />
            </button>
          </div>
        ))}
        {colors.length < 3 && (
          <button
            type="button"
            onClick={() => save([...colors, colors.length ? '#F2C230' : '#1F4E8C'])}
            title="Add a colour"
            className="mb-5 grid h-10 w-10 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-ink-400 hover:border-brand-line hover:text-brand"
          >
            <FiPlus size={16} />
          </button>
        )}
      </div>
      {data.has_logo && (
        <button type="button" onClick={fromLogo} disabled={busy} className="mt-1 text-[11.5px] font-semibold text-brand hover:underline disabled:opacity-60">
          {busy ? 'Reading…' : 'Read from my logo again'}
        </button>
      )}
    </div>
  )
}

/** The Brand kit tab: logo + poster templates for one brand. */
export function BrandKitPanel({ brand, assets, setAssets, showToast }) {
  const logo = assets.find((a) => a.kind === 'logo' && a.brand_id === brand.id)
  const templates = assets.filter((a) => a.kind === 'template' && a.brand_id === brand.id)
  const screens = assets.filter((a) => a.kind === 'screenshot' && a.brand_id === brand.id)

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
    const what = kind === 'screenshot' ? 'screenshot' : 'template'
    showToast(kind === 'logo' ? 'Logo saved' : files.length > 1 ? `${files.length} ${what}s added` : `${what[0].toUpperCase()}${what.slice(1)} added`)
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* logo */}
      <section className="card p-5">
        <h2 className="text-[14.5px] font-semibold text-ink-900">Logo</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
          Placed on posters exactly as it is. A PNG with a transparent background works best.
        </p>
        <FilePick onFiles={(f) => add(f.slice(0, 1), 'logo')}>
          {(open, busy, drop) => (
            <button
              type="button"
              onClick={open}
              disabled={busy}
              {...drop.props}
              className={`group relative mt-4 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-[repeating-conic-gradient(rgb(var(--ink-100))_0_25%,transparent_0_50%)] bg-[length:16px_16px] transition-colors ${
                drop.over ? 'border-brand bg-brand-soft' : 'border-ink-200 hover:border-brand-line'
              }`}
            >
              {logo ? (
                <img src={kitSrc(logo.url)} alt={`${brand.name} logo`} className="max-h-[70%] max-w-[80%] object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-[12px] font-semibold text-ink-500">
                  <FiUploadCloud size={22} className={drop.over ? 'text-brand' : ''} />
                  {busy ? 'Uploading…' : drop.over ? 'Drop to upload' : 'Upload logo'}
                  {!busy && !drop.over && <span className="text-[11px] font-normal text-ink-400">or drag a PNG / JPG here</span>}
                </span>
              )}
              {logo && (
                <span
                  className={`absolute inset-x-0 bottom-0 bg-night-900/60 py-1.5 text-[11.5px] font-semibold text-white transition-opacity group-hover:opacity-100 ${
                    drop.over || busy ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {busy ? 'Uploading…' : drop.over ? 'Drop to replace' : 'Replace · or drag a new one here'}
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
        <BrandColors brand={brand} logoId={logo?.id} showToast={showToast} />
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
            {(open, busy, drop) => (
              <button
                type="button"
                onClick={open}
                disabled={busy || templates.length >= 12}
                {...drop.props}
                title="Or drag images onto this button"
                className={`btn-outline flex-none ${drop.over ? 'border-brand bg-brand-soft text-brand' : ''}`}
              >
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

      {/* app screenshots — shown, zoomed and clicked in the motion videos */}
      <section className="card p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14.5px] font-semibold text-ink-900">App screenshots</h2>
            <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
              Screens of your app, website or the platform you build on. Videos show them for real — zoom to the part that
              matters and click it — instead of a drawn screen. The AI notes what each one shows; edit the note if it’s off.
            </p>
          </div>
          <FilePick multiple onFiles={(f) => add(f, 'screenshot')}>
            {(open, busy, drop) => (
              <button
                type="button"
                onClick={open}
                disabled={busy || screens.length >= 12}
                {...drop.props}
                title="Or drag screenshots onto this button"
                className={`btn-outline flex-none ${drop.over ? 'border-brand bg-brand-soft text-brand' : ''}`}
              >
                <FiPlus size={14} /> {busy ? 'Reading the screen…' : 'Add screenshots'}
              </button>
            )}
          </FilePick>
        </div>
        {screens.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-[12.5px] text-ink-400">
            No screenshots yet. Add 2–6 clear screens — a form, a dashboard, the result a customer sees.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {screens.map((t) => (
              <TemplateCard key={t.id} t={t} wide onPatch={(b) => patch(t, b)} onRemove={() => remove(t)} />
            ))}
          </div>
        )}
      </section>

      <BrandVoice brand={brand} showToast={showToast} />
    </div>
  )
}

function TemplateCard({ t, wide = false, onPatch, onRemove }) {
  const [name, setName] = useState(t.name)
  const [note, setNote] = useState(t.note)
  return (
    <div className="overflow-hidden rounded-xl border border-ink-100">
      <div className={`relative bg-ink-50 ${wide ? 'aspect-video' : 'aspect-[3/4]'}`}>
        <img src={kitSrc(t.url)} alt={t.name} className={`h-full w-full ${wide ? 'object-contain' : 'object-cover'}`} />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-night-900/60 text-white hover:bg-red-600"
          aria-label={wide ? 'Remove screenshot' : 'Remove template'}
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
          placeholder={wide ? 'What this screen shows — e.g. the leave request form with a Submit button' : 'What to keep (optional) — e.g. blue background, headline top-right, flat illustration'}
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
      {(open, busy, drop) => (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          {...drop.props}
          title={photo ? 'Replace the product photo — or drag a new one here' : 'Add a real photo (or drag one here) — posters will show this exact product'}
          className={`group relative grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-xl border bg-ink-50 ${
            drop.over ? 'border-2 border-brand bg-brand-soft' : 'border-ink-200 hover:border-brand-line'
          }`}
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
