import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiCheck, FiShield, FiX } from "react-icons/fi";
import { useStore } from "../../store";
import { useNotifications } from "../../lib/notifications";
import { claimCredits } from "../../lib/credits";
import { confirmDevice, signOutDevice } from "../../lib/securityAlerts";
import CreditCoin from "./CreditCoin";

/** "New device signed in — was this you?": keep it, or sign it out right here. */
function DeviceCard({ item }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const act = async (kind) => {
    setBusy(kind);
    setError("");
    try {
      await (kind === "yes" ? confirmDevice(item.session) : signOutDevice(item.session));
    } catch (e) {
      setError(e.message || "Couldn’t do that just now — try again.");
      setBusy("");
    }
  };
  return (
    <div className="m-1 rounded-xl border border-red-200 bg-red-50 p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-white text-red-600">
          <FiShield size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-ink-900">{item.title}</span>
          <span className="mt-0.5 block text-[11px] text-ink-600">{item.body}</span>
          <span className="mt-1 block text-[11px] font-semibold text-red-700">Was this you?</span>
        </span>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => act("yes")}
          disabled={!!busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white py-2 text-[12px] font-semibold text-ink-800 hover:border-ink-300 disabled:opacity-60"
        >
          <FiCheck size={13} /> {busy === "yes" ? "Saving…" : "Yes, it was me"}
        </button>
        <button
          type="button"
          onClick={() => act("no")}
          disabled={!!busy}
          className="flex-1 rounded-lg bg-red-600 py-2 text-[12px] font-bold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy === "no" ? "Signing out…" : "No, sign it out"}
        </button>
      </div>
      {error && <div className="mt-1.5 text-[11px] text-red-600">{error}</div>}
    </div>
  );
}

/**
 * Notifications — a bell dropdown for threads needing attention.
 * anchor="header" renders it anchored below the Topbar bell (right edge);
 * anchor="bottom" renders it above the sidebar footer bell.
 */
export default function Notifications({ open, onClose, anchor = "header" }) {
  const { review } = useStore();
  const navigate = useNavigate();
  const [seen, setSeen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(0);
  const [claimError, setClaimError] = useState("");
  const claim = async () => {
    setClaiming(true);
    setClaimError("");
    try {
      setClaimed(await claimCredits());
    } catch (e) {
      setClaimError(e.message || "Couldn’t claim just now — try again.");
    } finally {
      setClaiming(false);
    }
  };

  const { items } = useNotifications();

  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);

  if (!open) return null;

  const count = items.filter((i) => i.urgent).length;

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="Close notifications"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className={`fixed ${
          anchor === "header"
            ? "right-4 top-[64px] w-[min(360px,calc(100vw-2rem))]"
            : anchor === "rail"
              ? "left-[84px] bottom-4 w-[min(340px,calc(100vw-2rem))]"
              : "left-[264px] bottom-4 w-[min(340px,calc(100vw-2rem))]"
        }`}
      >
        <div className="w-full overflow-hidden rounded-2xl glass-panel animate-fadein">
          <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
            <div className="flex-1">
              <div className="text-[12.5px] font-bold text-ink-900">Notifications</div>
              <div className="text-[10.5px] text-ink-400">
                {count > 0
                  ? `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} your attention`
                  : "All clear — nothing needs you right now"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 grid place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Close"
            >
              <FiX size={15} />
            </button>
          </div>

          {claimed > 0 && (
            <div className="mx-1.5 mt-1.5 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-[12px] font-semibold text-brand">
              <CreditCoin size={16} /> {claimed.toLocaleString("en-US")} credits added — enjoy this month!
            </div>
          )}
          {count === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-2xl grid place-items-center bg-brand-soft text-brand text-2xl">
                ✓
              </div>
              <div className="text-[12px] font-semibold text-ink-700">You're all caught up</div>
              <div className="mt-1 text-[11px] text-ink-400">
                Ideas to review, failed posts and expiring logins show up here — choose which in Settings → Notifications.
              </div>
            </div>
          ) : (
            <div className="max-h-[min(58vh,420px)] overflow-y-auto p-1.5">
              {items.map((item) =>
                item.action === "device" ? (
                  <DeviceCard key={item.id} item={item} />
                ) : item.action === "claim" ? (
                  // the monthly credits: claimed right here, not a link
                  <div key={item.id} className="m-1 rounded-xl border border-brand/30 bg-brand-soft p-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-white">
                        <CreditCoin size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-ink-900">{item.title}</span>
                        <span className="mt-0.5 block text-[11px] text-ink-600">{item.body}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={claim}
                      disabled={claiming}
                      className="mt-2.5 w-full rounded-lg bg-brand py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
                    >
                      {claiming ? "Claiming…" : "Claim credits"}
                    </button>
                    {claimError && <div className="mt-1.5 text-[11px] text-red-600">{claimError}</div>}
                  </div>
                ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.to)}
                  className="w-full flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-ink-50 transition-colors"
                >
                  <span className="mt-0.5 w-8 h-8 rounded-lg grid place-items-center bg-ink-50 border border-ink-100 flex-none">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink-800">
                        {item.title}
                      </span>
                    </span>
                    <span className="block text-[10.5px] text-ink-400 truncate mt-0.5">
                      {item.body}
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-600">
                      <span className={`w-2 h-2 rounded-full flex-none ${item.dot}`} />
                      {item.tag}
                    </span>
                  </span>
                </button>
                ),
              )}
            </div>
          )}

          {(review || []).length > 0 && (
            <div className="border-t border-ink-100 p-1.5">
              <button
                type="button"
                onClick={() => go("/review")}
                className="w-full rounded-lg px-3 py-2 text-[11.5px] font-semibold text-brand hover:bg-brand-soft"
              >
                Go to Waiting for You →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}