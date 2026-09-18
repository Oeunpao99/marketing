import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useStore } from '../store'

const BRAND_COLORS = { assist: '#3B82F6', chum: '#F59E0B', hub: '#8B5CF6' }
const EMPTY_FORM = { name: '', description: '', highlights: '' }

export default function ProductsPage() {
  const { brands, showToast } = useStore()
  const [items, setItems] = useState(null)
  const [brandFilter, setBrandFilter] = useState('all')
  const [editingId, setEditingId] = useState(null) // product id, or 'new'
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

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
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    try {
      await api.del(`/products/${p.id}`)
      setItems((xs) => (xs || []).filter((x) => x.id !== p.id))
      showToast('Deleted')
    } catch (e) {
      showToast(`Could not delete — ${e.message}`)
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
              <div
                key={p.id}
                className="bg-white border border-ink-100 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition-all duration-150"
              >
                <div className="flex items-center gap-2 text-[11.5px] text-ink-500 mb-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-none"
                    style={{ background: BRAND_COLORS[brandFor(p)?.slug] || '#94a3b8' }}
                  />
                  <span className="font-semibold text-ink-700">{brandFor(p)?.name || 'No brand'}</span>
                </div>
                <div className="font-bold text-ink-900 text-[14.5px]">{p.name}</div>
                {p.description && (
                  <p className="mt-1.5 text-[13px] text-ink-600 leading-relaxed">{p.description}</p>
                )}
                {p.highlights && (
                  <p className="mt-1.5 text-[12.5px] text-ink-400 leading-relaxed">{p.highlights}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-600 text-[12px] font-semibold hover:bg-ink-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-500 text-[12px] font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function ProductForm({ form, setForm, brands, busy, onCancel, onSave, title }) {
  return (
    <div className="bg-white border-2 border-brand/30 rounded-2xl p-4 mb-4 shadow-card">
      <div className="text-[12px] font-bold uppercase tracking-wide text-brand mb-3">{title}</div>
      <div className="space-y-3">
        <div>
          <label className="block text-[11.5px] font-semibold text-ink-600 mb-1">Brand</label>
          <select
            value={form.brand_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, brand_id: +e.target.value }))}
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-ink-600 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Unlimited Data Plan"
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-ink-600 mb-1">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What it is, who it's for…"
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-ink-600 mb-1">
            Highlights <span className="text-ink-400 font-normal">— selling points, pricing, offers</span>
          </label>
          <textarea
            rows={2}
            value={form.highlights}
            onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
            placeholder="Cheap; fast; local support…"
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2 text-[13.5px] resize-y focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="flex gap-2">
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
    </div>
  )
}
