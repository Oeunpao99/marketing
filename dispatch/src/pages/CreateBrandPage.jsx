import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useStore } from "../store";

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CreateBrandPage() {
  const { brands, setBrands, showToast } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", lang: "", note: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const slug = slugify(name);
    if (!name || !slug) return setError("Enter a brand name.");
    if (brands.some((brand) => brand.slug === slug))
      return setError("That brand already exists.");
    setBusy(true);
    setError(null);
    try {
      const brand = await api.post("/brands", {
        name,
        slug,
        lang: form.lang.trim(),
        note: form.note.trim(),
      });
      setBrands((current) =>
        [...current, brand].sort((a, b) => a.name.localeCompare(b.name)),
      );
      showToast(`${brand.name} created`);
      navigate("/channels");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="p-5 lg:p-8 w-full animate-fadein">
      <button
        type="button"
        onClick={() => navigate("/channels")}
        className="mb-4 text-sm text-ink-500 hover:text-ink-800"
      >
        ← Back to Channels
      </button>
      <div className="mb-6">
        <h1 className="font-display text-[38px] leading-tight text-ink-900">
          Create a <em className="italic text-brand">brand</em>
        </h1>
        <p className="mt-1.5 max-w-[56ch] text-[15px] text-ink-500">
          Create the brand first, then connect its Facebook, TikTok, YouTube,
          Instagram, or Telegram channel.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="max-w-lg space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card"
      >
        <Field label="Brand name" required>
          <input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Chumnouykar"
            className={inputClass}
          />
        </Field>
        <Field label="Language">
          <input
            value={form.lang}
            onChange={(e) => setForm({ ...form, lang: e.target.value })}
            placeholder="Khmer or English + Khmer"
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="What this brand publishes"
            className={inputClass}
          />
        </Field>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl gradient-brand px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create brand"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-[13.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
