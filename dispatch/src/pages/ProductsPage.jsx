import { useEffect, useMemo, useState } from 'react'
import AutoTextarea from '../components/ui/AutoTextarea'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { colorForBrand } from '../lib/brandColor'
import { useStore } from '../store'
import MarkdownText from '../components/ui/MarkdownText'

const EMPTY_FORM = { name: '', description: '', highlights: '' }
const PREVIEW_CHARS = 340

export default function ProductsPage() {
  const { brands, showToast } = useStore()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [editingId, setEditingId] = useState(null) // product id, or 'new'
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState({}) // id -> show the full description
  const [confirmItem, setConfirmItem] = useState(null) // product awaiting delete

  const load = () => api.get('/products').then(setItems).catch(() => setItems([]))

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    if (brandFilter === 'all') return items
    const brand = brands.find((b) => b.slug === brandFilter)
    return items.filter((p) => p.brand_id === brand?.id)
  }, [items, brandFilter, brands])

  const brandFor = (product) => brands.find((b) => b.id === product.brand_id)

  const startNew = () => {
    const defaultBrand = brandFilter !== 'all' ? brands.find((b) => b.slug === brandFilter) : brands[0]
    setForm({ ...EMPTY_FORM, brand_id: defaultBrand?.id ?? brands[0]?.id })
    setEditingId('new')
  }

  const startEdit = (p) => {
    setForm({ brand_id: p.brand_id, name: p.name, description: p.description, highlights: p.highlights })
    setEditingId(p.id)
  }

  const cancel = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const save = async () => {
    if (busy || !form.name.trim() || !form.brand_id) return
    setBusy(true)
    try {
      if (editingId === 'new') {
        const created = await api.post('/products', form)
        setItems((xs) => [...(xs || []), created])
        showToast('Product added')
      } else {
        const updated = await api.patch(`/products/${editingId}`, form)
        setItems((xs) => (xs || []).map((p) => (p.id === editingId ? updated : p)))
        showToast('Product saved')
      }
      cancel()
    } catch (e) {
      showToast(`Could not save — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p) => {
    try {
      await api.del(`/products/${p.id}`)
      setItems((xs) => (xs || []).filter((x) => x.id !== p.id))
      showToast('Deleted')
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
    } finally {
      setConfirmItem(null)
    }
  }

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-sub mt-1">
            What each brand sells or offers — the AI reads this in{' '}
            <span className="font-semibold text-ink-700">Auto-generate</span> to write ideas grounded in real facts instead of guessing.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!brands.length}
          className="btn-primary flex-none"
        >
          + Add product
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setBrandFilter('all')}
          className={`px-3.5 py-2 rounded-xl border text-[12px] font-semibold transition-all duration-150 ${
            brandFilter === 'all' ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 text-ink-600 hover:border-brand-line'
          }`}
        >
          All
          <span className={`ml-1.5 font-mono text-[10px] ${brandFilter === 'all' ? 'text-brand' : 'text-ink-400'}`}>
            {items?.length ?? 0}
          </span>
        </button>
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandFilter(b.slug)}
            className={`px-3.5 py-2 rounded-xl border text-[12px] font-semibold flex items-center gap-2 transition-all duration-150 ${
              brandFilter === b.slug ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-200 text-ink-600 hover:border-brand-line'
            }`}
          >
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: colorForBrand(b.slug) }} />
            {b.name}
            <span className={`font-mono text-[10px] ${brandFilter === b.slug ? 'text-brand' : 'text-ink-400'}`}>
              {items?.filter((p) => p.brand_id === b.id).length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {editingId != null && (
        <ProductForm
          form={form}
          setForm={setForm}
          brands={brands}
          busy={busy}
          onCancel={cancel}
          onSave={save}
          title={editingId === 'new' ? 'New product' : 'Edit product'}
        />
      )}

      {items === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-ink-100 bg-white p-5 space-y-3">
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-4 w-full rounded skeleton" />
              <div className="h-3 w-4/5 rounded skeleton" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-[14px] font-semibold text-ink-700">No products yet</div>
          <div className="text-[12px] text-ink-400 mt-1">
            Add what this brand sells or offers so the AI has something real to write about.
          </div>
          <button type="button" onClick={startNew} disabled={!brands.length} className="btn-primary mt-4">
            + Add your first product
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              brandColor={colorForBrand(brandFor(p)?.slug)}
              brandName={brandFor(p)?.name || 'No brand'}
              expanded={!!expanded[p.id]}
              onToggleExpanded={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
              onEdit={() => startEdit(p)}
              onDelete={() => setConfirmItem(p)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/25 backdrop-blur-md flex items-center justify-center p-4 animate-fadein"
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="glass-strong rounded-3xl w-full max-w-sm p-6 shadow-dock animate-fadein"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15.5px] font-display text-ink-900 tracking-tight">Delete this product?</h3>
            <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed">
              “{confirmItem.name}” will be removed and the AI won’t read it anymore. This can’t be undone.
            </p>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="px-4 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-[12px] font-bold hover:bg-ink-50 transition-all duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove(confirmItem)}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-[12px] font-bold hover:bg-red-700 transition-all duration-150"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, brandColor, brandName, expanded, onToggleExpanded, onEdit, onDelete }) {
  const parts = (product.highlights || '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean)
  const long = (product.description || '').length > PREVIEW_CHARS

  return (
    <div className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150 flex flex-col">
      <div
        className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-ink-100"
        style={{ background: `${brandColor}08` }}
      >
        <span className="w-2 h-2 rounded-full flex-none" style={{ background: brandColor, boxShadow: `0 0 8px ${brandColor}40` }} />
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>
          {brandName}
        </span>
      </div>

      <div className="px-4 pt-3.5 pb-1 flex-1">
        <h3 className="font-bold text-ink-900 text-[14px] leading-snug">{product.name}</h3>
        {product.description && (
          <div className="mt-2">
            <div className={long && !expanded ? 'relative max-h-[150px] overflow-hidden' : ''}>
              <MarkdownText text={product.description} />
              {long && !expanded && (
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
              )}
            </div>
            {long && (
              <button
                type="button"
                onClick={onToggleExpanded}
                className="mt-1.5 text-[11.5px] font-bold text-brand hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
        {parts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {parts.map((h, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50/70 px-2 py-1 text-[10.5px] font-semibold text-ink-600"
              >
                <span className="w-1 h-1 rounded-full flex-none" style={{ background: brandColor }} />
                {h}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2 border-t border-ink-100 bg-ink-50/40 px-4 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="px-3.5 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-600 text-[11px] font-bold hover:border-brand/40 hover:text-ink-900 transition-all duration-150"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-3.5 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-500 text-[11px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-150"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

const fieldClass =
  'w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[13px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'

/** Right-hand slide-over for adding or editing a product — same pattern as
 * Create brand, so the product grid stays put underneath. */
function ProductForm({ form, setForm, brands, busy, onCancel, onSave, title }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 glass-overlay animate-fadein cursor-default"
        onClick={onCancel}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="absolute right-0 top-0 h-full w-full max-w-[480px] glass-drawer animate-drawer-in flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-ink-100">
          <div>
            <h2 id="product-form-title" className="text-[17.5px] font-bold text-ink-900 tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">The AI reads this to write accurate posts for the brand.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 grid place-items-center rounded-lg text-ink-500 hover:bg-ink-100 flex-none"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
        </header>

        <form
          className="flex-1 flex flex-col min-h-0"
          onSubmit={(e) => {
            e.preventDefault()
            onSave()
          }}
        >
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-800">Brand</span>
              <select
                value={form.brand_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, brand_id: +e.target.value }))}
                className={fieldClass}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-800">
                Name <span className="text-red-500">*</span>
              </span>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Unlimited Data Plan"
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-800">Description</span>
              <AutoTextarea
                minRows={8}
                maxRows={24}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What it is, who it's for…"
                className={fieldClass}
              />
              <span className="mt-1.5 block text-[11px] text-ink-400">Markdown works: # headings, **bold**, - bullets</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-ink-800">Highlights</span>
              <AutoTextarea
                minRows={3}
                maxRows={12}
                value={form.highlights}
                onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
                placeholder="Cheap; fast; local support…"
                className={fieldClass}
              />
              <span className="mt-1.5 block text-[11px] text-ink-400">Selling points, pricing, offers — separate with ; or new lines</span>
            </label>
          </div>

          <footer className="px-6 py-4 border-t border-ink-100 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={busy || !form.name.trim()} className="btn-primary">
              {busy ? 'Saving…' : 'Save product'}
            </button>
          </footer>
        </form>
      </aside>
    </div>,
    document.body,
  )
}
