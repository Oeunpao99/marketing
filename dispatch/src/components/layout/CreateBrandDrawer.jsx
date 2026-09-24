import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { api } from "../../api/client";
import { useStore } from "../../store";

export const openCreateBrand = () => window.dispatchEvent(new Event("dispatch:create-brand"));

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const EMPTY = { name: "", lang: "", note: "" };

const inputClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

/** Right-hand slide-over for creating a brand — opened from anywhere via
 * openCreateBrand(), so it never takes you off the page you're on. */
export default function CreateBrandDrawer() {
  const { brands, setBrands, switchBrand, refreshChannels, refreshAuto, showToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setForm(EMPTY);
      setError(null);
      setBusy(false);
      setOpen(true);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("dispatch:create-brand", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dispatch:create-brand", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const slug = slugify(name);
    if (!name || !slug) return setError("Enter a brand name.");
    if (brands.some((b) => b.slug === slug)) return setError("That brand already exists.");
    setBusy(true);
    setError(null);
    try {
      const brand = await api.post("/brands", {
        name,
        slug,
        lang: form.lang.trim(),
        note: form.note.trim(),
      });
      setBrands((current) => [...current, brand].sort((a, b) => a.name.localeCompare(b.name)));
      switchBrand?.(brand.slug);
      refreshChannels?.();
      refreshAuto?.();
      showToast(`${brand.name} created`);
      setOpen(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 glass-overlay animate-fadein cursor-default"
        onClick={() => setOpen(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-brand-title"
        className="absolute right-0 top-0 h-full w-full max-w-[440px] glass-drawer animate-drawer-in flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-ink-100">
          <div>
            <h2 id="create-brand-title" className="text-[17.5px] font-bold text-ink-900 tracking-tight">
              Create a brand
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
              Create the brand first, then connect its Facebook, TikTok, YouTube, Instagram, LinkedIn or Telegram channel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-9 h-9 grid place-items-center rounded-lg text-ink-500 hover:bg-ink-100 flex-none"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <Field label="Brand name" required>
              <input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Chumnouykar"
                className={inputClass}
              />
            </Field>
            <Field label="Language" hint="The AI writes this brand's content in this language.">
              <input
                value={form.lang}
                onChange={(e) => setForm({ ...form, lang: e.target.value })}
                placeholder="English, Khmer, or English + Khmer"
                className={inputClass}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={4}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="What this brand publishes"
                className={inputClass}
              />
            </Field>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
                {error}
              </div>
            )}
          </div>

          <footer className="px-6 py-4 border-t border-ink-100 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Creating…" : "Create brand"}
            </button>
          </footer>
        </form>
      </aside>
    </div>,
    document.body,
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-800">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}
