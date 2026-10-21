import { useEffect, useRef, useState } from "react";
import { FiChevronRight, FiCreditCard, FiGift, FiLogOut, FiSettings, FiUserPlus } from "react-icons/fi";
import { useAuth } from "../../auth";
import { useCredits, useCreditsRefresh } from "../../lib/credits";
import CreditCoin from "./CreditCoin";

// The top bar's right end: the credits chip and the account avatar. Either
// opens one panel — who you are, the credits left this month (app/billing.py,
// lib/credits.js), claiming this month's credits, the plan, Settings, inviting
// the team, signing out.

const openSettings = (tab) => window.dispatchEvent(new CustomEvent("dispatch:open-settings", { detail: { tab } }));
const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("en-US");

/** The ring round the "% used" — brand, amber when low, red when used up. */
function Ring({ pct, tone }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const stroke = { danger: "text-red-500", warn: "text-amber-500", ok: "text-brand" }[tone];
  return (
    <div className="relative h-16 w-16 flex-none">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-current text-ink-200" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          className={`stroke-current transition-[stroke-dashoffset] duration-700 ${stroke}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[12.5px] font-bold tabular-nums text-ink-900">{pct}%</span>
    </div>
  );
}

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  useCreditsRefresh();
  const { credits: b, reload, claim } = useCredits();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const box = useRef(null);
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);
  // a push "tap to claim" opens the app at /?claim=credits — open the panel
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("claim") === "credits") setOpen(true);
  }, []);
  const doClaim = async () => {
    setClaiming(true);
    setClaimError("");
    try {
      await claim();
    } catch (e) {
      setClaimError(e.message || "Couldn’t claim just now — try again.");
    } finally {
      setClaiming(false);
    }
  };

  // close on a click outside and on Esc
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const initials =
    user?.initials ||
    (user?.name || "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "U";
  const monthly = b?.monthly_credits || 0;
  const left = b ? Math.max(0, b.available_credits ?? 0) : null;
  const used = b ? Math.max(0, b.spent_credits ?? 0) : 0;
  const usedPct = monthly > 0 && left != null ? Math.min(100, Math.round(((monthly - Math.min(left, monthly)) / monthly) * 100)) : 0;
  const tone = left != null && left <= 0 ? "danger" : monthly > 0 && left != null && left <= monthly * 0.2 ? "warn" : "ok";
  const numTone = { danger: "text-red-600", warn: "text-amber-600", ok: "text-ink-900" }[tone];
  const refill = b?.resets_at ? new Date(b.resets_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const go = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {/* the credits chip */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white pl-1.5 pr-1.5 transition-colors hover:border-ink-300 sm:pr-2"
        aria-label={left != null ? `${fmt(left)} AI credits left` : "AI credits"}
        title="AI credits left this month"
      >
        <span className="relative">
          <CreditCoin size={22} sparkle />
          {b?.claim_available && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden="true" />}
        </span>
        <span className={`text-[13px] font-bold tabular-nums ${numTone}`}>{left != null ? fmt(left) : "—"}</span>
        {b?.plan_label && <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600 sm:inline">{b.plan_label}</span>}
      </button>

      {/* the avatar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand text-[11px] font-bold text-white ring-offset-2 ring-offset-white transition-shadow hover:ring-2 hover:ring-brand/30"
        aria-label="Account"
        aria-expanded={open}
        title={user?.name || ""}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[300px] rounded-2xl border border-ink-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)] animate-fadein" role="dialog" aria-label="Account">
          {/* who */}
          <div className="flex items-center gap-3 px-2 pb-3 pt-2">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-brand text-[13px] font-bold text-white">{initials}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold text-ink-900">{user?.name || "Account"}</div>
              <div className="truncate text-[12px] text-ink-500">{user?.email || ""}</div>
            </div>
            {user?.role && <span className="flex-none rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold capitalize text-brand">{user.role}</span>}
          </div>

          {/* this month's credits are waiting to be claimed */}
          {b?.claim_available && (
            <div className="mb-2 rounded-2xl border border-brand/30 bg-brand-soft p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-brand">
                  <FiGift size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink-900">Your monthly credits are ready</div>
                  <div className="flex items-center gap-1 text-[12px] text-ink-600">
                    <CreditCoin size={14} /> {fmt(b.claim_credits ?? b.monthly_credits)} credits for this month
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={doClaim}
                disabled={claiming}
                className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
              >
                {claiming ? "Claiming…" : `Claim ${fmt(b.claim_credits ?? b.monthly_credits)} credits`}
              </button>
              {claimError && <div className="mt-2 text-[11.5px] text-red-600">{claimError}</div>}
            </div>
          )}

          {/* this month's credits */}
          <div className="rounded-2xl bg-canvas p-3.5">
            <div className="flex items-center gap-3.5">
              <Ring pct={usedPct} tone={tone} />
              <div className="min-w-0">
                <div className="text-[12px] text-ink-500">Credits left</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <CreditCoin size={22} />
                  <span className={`text-[24px] font-bold leading-none tabular-nums ${numTone}`}>{left != null ? fmt(left) : "—"}</span>
                </div>
              </div>
            </div>
            <dl className="mt-3.5 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-ink-500">Each month</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{fmt(monthly)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Used this month</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{fmt(used)}</dd>
              </div>
              {b?.pending_credits > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Held for videos in progress</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">{fmt(b.pending_credits)}</dd>
                </div>
              )}
            </dl>
            {refill && <div className="mt-2 text-[11.5px] text-ink-400">Next month’s credits to claim on {refill} · posting never uses credits</div>}
            <button
              type="button"
              onClick={go(() => openSettings("billing"))}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left transition-colors hover:bg-ink-50"
            >
              <FiCreditCard size={15} className="text-ink-500" />
              <span className="flex-1 text-[13px] font-semibold text-ink-900">{b?.plan_label || "Plan"} plan</span>
              <span className="flex items-center text-[12px] text-ink-500">
                Manage <FiChevronRight size={14} />
              </span>
            </button>
          </div>

          {/* the rest */}
          <div className="mt-1.5 space-y-0.5">
            <button type="button" onClick={go(() => openSettings(null))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-ink-700 transition-colors hover:bg-ink-50">
              <FiSettings size={16} className="text-ink-500" /> Settings
            </button>
            <button type="button" onClick={go(() => openSettings("team"))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-ink-700 transition-colors hover:bg-ink-50">
              <FiUserPlus size={16} className="text-ink-500" /> Invite your team
            </button>
            <button type="button" onClick={go(logout)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-red-600 transition-colors hover:bg-red-50">
              <FiLogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
