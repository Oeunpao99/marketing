// Credit transfers, the bank-app moments: the "sending…" animation, the
// receipt pop-up after sending, and — for the person on the other end — the
// "You received …" pop-up that appears by itself (IncomingCredits polls
// GET /billing/incoming while the app is open).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiArrowDownLeft, FiCheck, FiX } from "react-icons/fi";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { loadCredits } from "../../lib/credits";
import CreditCoin from "./CreditCoin";

/** "1400307275" → "140 030 7275". */
export const fmtAccount = (no) => (no || "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

/** While a transfer is on its way: the coin flies out over a spinning ring. */
export function SendingAnimation({ credits }) {
  return (
    <div className="flex flex-col items-center py-6 text-center" role="status" aria-live="polite">
      <div className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-brand/15 border-t-brand" />
        <span className="cf-coin-send">
          <CreditCoin size={40} />
        </span>
      </div>
      <div className="mt-4 text-[15px] font-bold text-ink-900">Sending {credits.toLocaleString("en-US")} credits…</div>
      <div className="text-[12px] text-ink-500">Keep this open for a moment.</div>
    </div>
  );
}

/**
 * The receipt, popped up over everything: sent (red −) or received (green +),
 * with who, account ID, note, time and reference. Plain dim backdrop + solid
 * panel, no blur.
 */
export function CreditReceipt({ kind = "sent", credits, name, owner = "", account, note = "", at, refNo = "", onClose }) {
  const received = kind === "received";
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const when = at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  const rows = [
    [received ? "From" : "To", name],
    owner && ["Owner", owner],
    ["Account ID", fmtAccount(account)],
    note && ["Note", note],
    ["Date", when],
    refNo && ["Reference", refNo],
  ].filter(Boolean);
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/60" onClick={onClose} />
      <div className="cf-pop-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl" role="dialog" aria-modal="true">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Close">
          <FiX size={16} />
        </button>
        <div className={`px-6 pb-5 pt-8 text-center ${received ? "bg-emerald-50" : "bg-brand-soft"}`}>
          <span className={`cf-check-pop mx-auto grid h-16 w-16 place-items-center rounded-full text-white shadow-lg ${received ? "bg-emerald-500" : "bg-brand"}`}>
            {received ? <FiArrowDownLeft size={28} strokeWidth={2.5} /> : <FiCheck size={30} strokeWidth={3} />}
          </span>
          <div className="mt-3 text-[15px] font-bold text-ink-900">{received ? "You received credits" : "Transfer successful"}</div>
          <div className={`mt-1 flex items-center justify-center gap-2 text-[34px] font-bold tabular-nums ${received ? "text-emerald-600" : "text-ink-900"}`}>
            <CreditCoin size={30} sparkle />
            {received ? "+" : ""}
            {Number(credits || 0).toLocaleString("en-US")}
          </div>
          <div className="text-[12px] text-ink-500">credits</div>
        </div>
        <dl className="space-y-2.5 px-6 py-5 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="flex-none text-ink-500">{k}</dt>
              <dd className="min-w-0 truncate text-right font-semibold text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="px-6 pb-6">
          <button type="button" onClick={onClose} className="btn-primary h-11 w-full rounded-xl">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const POLL_MS = 15_000;

/**
 * Mount once (the top bar): checks for credits received every 15 s while the
 * app is visible, and on focus, and pops up a receipt for each new one.
 */
export function IncomingCredits() {
  const { user } = useAuth();
  const ws = user?.workspace_id;
  const last = useRef(null); // the newest transfer_in id already known
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    if (!ws) return;
    const key = `cf_seen_credit_in_${ws}`;
    try {
      const saved = localStorage.getItem(key);
      last.current = saved != null ? Number(saved) : null;
    } catch {
      last.current = null;
    }
    let busy = false;
    const check = () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const q = last.current == null ? "" : `?after=${last.current}`;
      api
        .get(`/billing/incoming${q}`)
        .then((r) => {
          if (r.items?.length) {
            setQueue((qq) => [...qq, ...r.items]);
            loadCredits(); // the chip shows the new balance
          }
          last.current = Math.max(last.current ?? 0, r.latest_id || 0);
          try {
            localStorage.setItem(key, String(last.current));
          } catch {
            // not remembered: the next visit starts from the newest again
          }
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    };
    check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ws]);
  const item = queue[0];
  if (!item) return null;
  return (
    <CreditReceipt
      key={item.id}
      kind="received"
      credits={item.credits}
      name={item.from_name}
      account={item.from_account}
      note={item.note}
      at={item.at}
      refNo={item.ref}
      onClose={() => setQueue((q) => q.slice(1))}
    />
  );
}
