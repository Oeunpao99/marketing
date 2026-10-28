import { useEffect, useRef, useState } from "react";
import { FiChevronRight, FiCreditCard, FiFilm, FiImage, FiLogOut, FiPlusCircle, FiSettings, FiUserPlus } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { lengthText, useUsage, useUsageRefresh } from "../../lib/usage";

// The top bar's right end: this month's videos left and the account avatar. Either
// opens one panel — who you are, the month's videos and images (app/usage.py,
// lib/usage.js), the plan, extra videos, Settings, inviting the team, signing out.
// Customers see videos and images, never credits.

const openSettings = (tab) => window.dispatchEvent(new CustomEvent("dispatch:open-settings", { detail: { tab } }));
const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("en-US");
const toneOf = (c) => (!c || !c.limit ? "ok" : c.left <= 0 ? "danger" : c.left <= Math.max(1, Math.round(c.limit * 0.2)) ? "warn" : "ok");
const TEXT = { danger: "text-red-600", warn: "text-amber-600", ok: "text-ink-900" };
const BAR = { danger: "bg-red-500", warn: "bg-amber-500", ok: "bg-brand" };

/** One line of the month: "Videos · 3 of 8 left", a bar of what's used. */
function Meter({ icon: Icon, label, count }) {
  const tone = toneOf(count);
  const usedPct = count?.limit ? Math.min(100, Math.round((count.used / count.limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center gap-2 text-[12.5px]">
        <Icon size={14} className="text-ink-500" />
        <span className="flex-1 text-ink-600">{label}</span>
        <span className={`font-bold tabular-nums ${TEXT[tone]}`}>{count ? fmt(count.left) : "—"}</span>
        <span className="tabular-nums text-ink-400">of {count ? fmt(count.limit) : "—"} left</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div className={`h-full rounded-full transition-[width] duration-700 ${BAR[tone]}`} style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useUsageRefresh();
  const { usage: u, reload } = useUsage();
  const box = useRef(null);
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

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
  const videos = u?.videos;
  const tone = toneOf(videos);
  const refill = u?.refills_at ? new Date(u.refills_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const go = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {/* this month's videos left */}
      <button
        type="button"
        data-credit-chip
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white pl-2 pr-2 transition-colors hover:border-ink-300"
        aria-label={videos ? `${fmt(videos.left)} of ${fmt(videos.limit)} videos left this month` : "Videos this month"}
        title="Videos left this month"
      >
        <span className={`grid h-6 w-6 place-items-center rounded-full ${tone === "ok" ? "bg-brand-soft text-brand" : tone === "warn" ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"}`}>
          <FiFilm size={13} />
        </span>
        <span className={`text-[13px] font-bold tabular-nums ${TEXT[tone]}`}>
          {videos ? fmt(videos.left) : "—"}
          <span className="font-semibold text-ink-400">/{videos ? fmt(videos.limit) : "—"}</span>
        </span>
        {u?.plan_label && <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600 sm:inline">{u.plan_label}</span>}
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

          {/* this month */}
          <div className="rounded-2xl bg-canvas p-3.5">
            <div className="text-[12px] font-semibold text-ink-500">This month</div>
            <div className="mt-2.5 space-y-3">
              <Meter icon={FiFilm} label="Videos" count={videos} />
              <Meter icon={FiImage} label="Images" count={u?.images} />
            </div>
            <div className="mt-3 text-[11.5px] text-ink-400">
              {u?.longest_seconds ? `Videos up to ${lengthText(u.longest_seconds)}` : ""}
              {refill ? `${u?.longest_seconds ? " · " : ""}refills on ${refill}` : ""} · posting is always free
            </div>
            {tone !== "ok" && (
              <button
                type="button"
                onClick={go(() => navigate("/upgrade#top-up"))}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark"
              >
                <FiPlusCircle size={15} /> Get more videos
              </button>
            )}
            <button
              type="button"
              onClick={go(() => navigate("/upgrade"))}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left transition-colors hover:bg-ink-50"
            >
              <FiCreditCard size={15} className="text-ink-500" />
              <span className="flex-1 text-[13px] font-semibold text-ink-900">{u?.plan_label || "Plan"} plan</span>
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
