import { Link, useLocation } from "react-router-dom";
import { FiBell, FiChevronRight, FiEdit, FiSearch, FiSidebar, FiZap } from "react-icons/fi";
import { useState } from "react";
import Notifications from "./Notifications";
import { openAIAssistant } from "../ai/openAssistant";
import { useAuth } from "../../auth";
import { useStore } from "../../store";

const LABELS = {
  "/new": "Compose",
  "/review": "Content",
  "/calendar": "Calendar",
  "/auto": "Auto-generate",
  "/ai": "AI Agent",
  "/library": "Media Library",
  "/products": "Products",
  "/channels": "Platforms",
  "/channels/add": "Add Platform",
  "/brands/new": "Create Brand",
  "/insights": "Analytics",
};

function labelFor(pathname) {
  if (LABELS[pathname]) return LABELS[pathname];
  if (pathname.startsWith("/insights/")) return "Analytics";
  if (pathname.startsWith("/post/")) return "Post";
  return null;
}

export default function Topbar({ onToggleSidebar }) {
  const { pathname } = useLocation();
  const { review, channels } = useStore();
  const { user } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  const label = labelFor(pathname);
  const notifCount = (review || []).length + channels.filter((c) => c.s === "soon").length;
  const initials =
    user?.initials ||
    (user?.name || "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "U";

  return (
    <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 sm:px-6 bg-[#FAFBFC]/95 backdrop-blur border-b border-ink-200/70">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="hidden lg:grid w-9 h-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
        aria-label="Toggle sidebar"
      >
        <FiSidebar size={18} />
      </button>
      <span className="hidden lg:block h-6 w-px bg-ink-200" />

      <nav className="min-w-0 flex-1 flex items-center gap-2 text-[13px]" aria-label="Breadcrumb">
        <Link to="/" className={label ? "text-ink-500 hover:text-ink-800" : "text-ink-900 font-medium"}>
          Dashboard
        </Link>
        {label && (
          <>
            <FiChevronRight size={15} className="text-ink-400 flex-none" />
            <span className="text-ink-900 font-medium truncate">{label}</span>
          </>
        )}
      </nav>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("dispatch:open-search"))}
        className="hidden md:flex items-center gap-2.5 w-[280px] h-10 px-3.5 rounded-xl border border-ink-200 bg-white text-[13px] text-ink-400 hover:border-ink-300 transition-colors duration-150"
      >
        <FiSearch size={17} className="text-ink-500" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
          ⌘ K
        </kbd>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative w-9 h-9 grid place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
          aria-label="Notifications"
        >
          <FiBell size={19} />
          {notifCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center ring-2 ring-[#FAFBFC]">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>
        <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} anchor="header" />
      </div>

      <Link
        to="/new"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark transition-colors duration-150"
      >
        <FiEdit size={16} />
        <span className="hidden sm:inline">Compose</span>
      </Link>

      <button
        type="button"
        onClick={openAIAssistant}
        className="hidden sm:grid w-9 h-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
        aria-label="Ask AI"
        title="Ask AI"
      >
        <FiZap size={18} />
      </button>

      <span className="hidden sm:block h-6 w-px bg-ink-200" />
      <span
        className="w-9 h-9 rounded-full grid place-items-center flex-none bg-brand text-white text-[11px] font-bold"
        title={user?.name || ""}
      >
        {initials}
      </span>
    </header>
  );
}
