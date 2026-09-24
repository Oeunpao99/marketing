import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiX } from "react-icons/fi";
import { useStore } from "../../store";
import { useNotifications } from "../../lib/notifications";

/**
 * Notifications — a bell dropdown for threads needing attention.
 * anchor="header" renders it anchored below the Topbar bell (right edge);
 * anchor="bottom" renders it above the sidebar footer bell.
 */
export default function Notifications({ open, onClose, anchor = "header" }) {
  const { review } = useStore();
  const navigate = useNavigate();
  const [seen, setSeen] = useState(false);

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
                Ideas to review, failed posts and expiring logins show up here — choose which in Settings → Notifications.
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