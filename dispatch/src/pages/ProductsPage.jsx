import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useStore } from '../store'
import MarkdownText from '../components/ui/MarkdownText'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }
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
          <h1 className="font-display text-[34px] lg:text-[42px] leading-tight tracking-tight text-ink-900">
            Products
          </h1>
          <p className="mt-1.5 text-ink-500 max-w-[60ch] text-[15px]">
            What each brand sells or offers — the AI reads this in{' '}
            <span className="font-semibold text-ink-700">Auto-generate</span> to write ideas grounded in real facts instead of guessing.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!brands.length}
          className="px-4 py-2.5 rounded-xl gradient-brand text-white text-[13.5px] font-bold hover:shadow-glow-lg disabled:opacity-50 transition-all duration-200 flex-none"
        >
          + Add product
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setBrandFilter('all')}
          className={`px-3.5 py-2 rounded-xl border text-[13px] font-semibold transition-all duration-150 ${
            brandFilter === 'all' ? 'border-brand bg-brand/5 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'
          }`}
        >
          All
          <span className={`ml-1.5 font-mono text-[11px] ${brandFilter === 'all' ? 'text-brand' : 'text-ink-400'}`}>
            {items?.length ?? 0}
          </span>
        </button>
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandFilter(b.slug)}
            className={`px-3.5 py-2 rounded-xl border text-[13px] font-semibold flex items-center gap-2 transition-all duration-150 ${
              brandFilter === b.slug ? 'border-brand bg-brand/5 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: BRAND_COLORS[b.slug] || '#166432' }} />
            {b.name}
            <span className={`font-mono text-[11px] ${brandFilter === b.slug ? 'text-brand' : 'text-ink-400'}`}>
              {items?.filter((p) => p.brand_id === b.id).length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {editingId === 'new' && (
        <ProductForm
          form={form}
          setForm={setForm}
          brands={brands}
          busy={busy}
          onCancel={cancel}
          onSave={save}
          title="New product"
        />
      )}

      {items === null ? (
        <div className="py-20 text-center text-ink-400 text-[13px]">Loading…</div>
      ) : filtered.length === 0 && editingId !== 'new' ? (
        <div className="py-20 text-center">
          <div className="text-[15px] font-semibold text-ink-700">No products yet</div>
          <div className="text-[13px] text-ink-400 mt-1">
            Add what this brand sells or offers so the AI has something real to write about.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) =>
            editingId === p.id ? (
              <ProductForm
                key={p.id}
                form={form}
                setForm={setForm}
                brands={brands}
                busy={busy}
                onCancel={cancel}
                onSave={save}
                title="Edit product"
              />
            ) : (
              <ProductCard
                key={p.id}
                product={p}
                brandColor={BRAND_COLORS[brandFor(p)?.slug] || '#94a3b8'}
                brandName={brandFor(p)?.name || 'No brand'}
                expanded={!!expanded[p.id]}
                onToggleExpanded={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                onEdit={() => startEdit(p)}
                onDelete={() => setConfirmItem(p)}
              />
            ),
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadein"
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-dock animate-fadein"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-display text-ink-900 tracking-tight">Delete this product?</h3>
            <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
              “{confirmItem.name}” will be removed and the AI won’t read it anymore. This can’t be undone.
            </p>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="px-4 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-[13px] font-bold hover:bg-ink-50 transition-all duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove(confirmItem)}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-all duration-150"
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
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>
          {brandName}
        </span>
      </div>

      <div className="px-4 pt-3.5 pb-1 flex-1">
        <h3 className="font-bold text-ink-900 text-[15px] leading-snug">{product.name}</h3>
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
                className="mt-1.5 text-[12.5px] font-bold text-brand hover:underline"
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50/70 px-2 py-1 text-[11.5px] font-semibold text-ink-600"
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
          className="px-3.5 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-600 text-[12px] font-bold hover:border-brand/40 hover:text-ink-900 transition-all duration-150"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-3.5 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-500 text-[12px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-150"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function ProductForm({ form, setForm, brands, busy, onCancel, onSave, title }) {
  return (
    <div className="bg-white border-2 border-brand/30 rounded-2xl p-4 mb-4 shadow-card sm:col-span-2 xl:col-span-3">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-2 h-2 rounded-full bg-brand" />
        <span className="text-[12px] font-bold uppercase tracking-wide text-brand">{title}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[.09em] text-ink-400 mb-2">Brand</label>
          <select
            value={form.brand_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, brand_id: +e.target.value }))}
            className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[.09em] text-ink-400 mb-2">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Unlimited Data Plan"
            className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-[.09em] text-ink-400 mb-2">
            Description <span className="normal-case tracking-normal font-medium text-ink-400">— markdown: # ## ###, **bold**, - bullets</span>
          </label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What it is, who it's for…"
            className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[13.5px] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-[.09em] text-ink-400 mb-2">
            Highlights <span className="normal-case tracking-normal font-medium text-ink-400">— selling points, pricing, offers</span>
          </label>
          <textarea
            rows={2}
            value={form.highlights}
            onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
            placeholder="Cheap; fast; local support…"
            className="w-full bg-white border border-ink-200 rounded-xl px-3 py-2.5 text-[13.5px] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || !form.name.trim()}
          onClick={onSave}
          className="px-4 py-2 rounded-xl gradient-brand text-white text-[13px] font-bold hover:shadow-glow disabled:opacity-50 transition-all duration-150"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-ink-200 text-ink-600 text-[13px] font-semibold hover:bg-ink-50 transition-all duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}