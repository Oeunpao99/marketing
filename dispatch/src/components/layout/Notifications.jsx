import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiCheckCircle, FiInbox, FiX } from "react-icons/fi";
import { useStore } from "../../store";
import PlatformIcon from "../ui/PlatformIcon";
import { PLAT } from "../../data/brands";

/**
 * Notifications — a bell dropdown for threads needing attention.
 * anchor="header" renders it anchored below the Topbar bell (right edge);
 * anchor="bottom" renders it above the sidebar footer bell.
 */
export default function Notifications({ open, onClose, anchor = "header" }) {
  const { review, queue, channels } = useStore();
  const navigate = useNavigate();
  const [seen, setSeen] = useState(false);

  const items = useMemo(() => {
    const out = [];
    (review || []).forEach((draft) => {
      out.push({
        id: `review-${draft.ttl}`,
        kind: "review",
        icon: <FiInbox size={14} className="text-brand" />,
        tag: "Ready for review",
        dot: "bg-brand",
        title: draft.ttl || "New post draft",
        body: `${draft.brandName || draft.b} · ${draft.made || "Written recently"}`,
        to: "/review",
        urgent: true,
      });
    });
    (channels || [])
      .filter((c) => c.s === "soon")
      .forEach((c) => {
        out.push({
          id: `channel-${c.id}`,
          kind: "channel",
          icon: <PlatformIcon name={PLAT[c.p]?.name} className="text-ink-400" />,
          tag: "Token expiring",
          dot: "bg-amber-400",
          title: `${c.h || c.b}`,
          body: `${c.b} · ${c.p} · re-authorise soon`,
          to: "/channels",
          urgent: true,
        });
      });
    (queue || [])
      .filter((p) => p.st === "posting" || p.st === "posted")
      .slice(0, 3)
      .forEach((p) => {
        out.push({
          id: `queue-${p.ttl}-${p.st}`,
          kind: "queue",
          icon: <FiCheckCircle size={14} className="text-emerald-500" />,
          tag: p.st === "posted" ? "Posted" : "Now posting",
          dot: p.st === "posted" ? "bg-emerald-500" : "bg-brand animate-pulse-glow",
          title: p.ttl || "Untitled",
          body: `${p.b} · ${p.t} · ${p.k || "photo"}`,
          to: "/calendar",
          urgent: p.st === "posting",
        });
      });
    return out.slice(0, 7);
  }, [review, queue, channels]);

  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);

  if (!open) return null;

  const count = items.length;

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
            : "left-[264px] bottom-4 w-[min(340px,calc(100vw-2rem))]"
        }`}
      >
        <div className="w-full overflow-hidden rounded-2xl bg-white border border-ink-200 shadow-pop animate-fadein">
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

          {count === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-2xl grid place-items-center bg-brand-soft text-brand text-2xl">
                ✓
              </div>
              <div className="text-[12px] font-semibold text-ink-700">You're all caught up</div>
              <div className="mt-1 text-[11px] text-ink-400">
                Review queues and expiring tokens will show up here.
              </div>
            </div>
          ) : (
            <div className="max-h-[min(58vh,420px)] overflow-y-auto p-1.5">
              {items.map((item) => (
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
              ))}
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