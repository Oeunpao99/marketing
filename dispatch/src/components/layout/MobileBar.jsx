import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiClipboard,
  FiCheck,
  FiEdit,
  FiFileText,
  FiGrid,
  FiImage,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiSettings,
  FiSmartphone,
  FiSun,
  FiX,
  FiZap,
} from "react-icons/fi";
import { useAuth } from "../../auth";
import { colorForBrand } from "../../lib/brandColor";
import { useNotifications } from "../../lib/notifications";
import { useStore } from "../../store";
import { openCreateBrand } from "./CreateBrandDrawer";
import { applyUpdate } from "../../lib/update";

// Phone navigation: four everyday tabs + the AI button, and "More" — a bottom
// sheet with every module, the brand switcher, Inbox, Settings and sign-out,
// so nothing the desktop sidebar offers is out of reach on mobile. The Topbar's
// ☰ button opens the same sheet (event "dispatch:open-more").

export const openMoreSheet = () => window.dispatchEvent(new Event("dispatch:open-more"));

const MODULES = [
  { to: "/", icon: FiGrid, label: "Dashboard" },
  { to: "/review", icon: FiFileText, label: "Content" },
  { to: "/calendar", icon: FiCalendar, label: "Calendar" },
  { to: "/new", icon: FiEdit, label: "Compose" },
  { to: "/ai", icon: FiZap, label: "AI Agent" },
  { to: "/weekly", icon: FiClipboard, label: "Weekly plan" },
  { to: "/auto", icon: FiRepeat, label: "Auto-generate" },
  { to: "/library", icon: FiImage, label: "Library" },
  { to: "/products", icon: FiPackage, label: "Products" },
  { to: "/channels", icon: FiSmartphone, label: "Platforms" },
  { to: "/insights", icon: FiBarChart2, label: "Analytics" },
];

const tabCls = ({ isActive }) =>
  `relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
    isActive ? "text-brand" : "text-ink-400"
  }`;

export default function MobileBar() {
  const { review } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const reviewCount = (review || []).length;

  useEffect(() => {
    const open = () => setMoreOpen(true);
    window.addEventListener("dispatch:open-more", open);
    return () => window.removeEventListener("dispatch:open-more", open);
  }, []);

  // Close the sheet whenever the page changes.
  useEffect(() => setMoreOpen(false), [pathname]);

  const inMore = !["/", "/calendar", "/ai", "/review"].includes(pathname);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-white/60 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/70 shadow-[0_-8px_24px_-12px_rgba(16,24,40,0.18)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5 items-stretch h-14">
          <NavLink to="/" end className={tabCls}>
            <FiSun size={18} strokeWidth={2.2} />
            Today
          </NavLink>
          <NavLink to="/calendar" className={tabCls}>
            <FiCalendar size={18} strokeWidth={2.2} />
            Calendar
          </NavLink>

          {/* Centre AI button */}
          <div className="flex items-center justify-center -mt-5">
            <button
              type="button"
              onClick={() => navigate("/ai")}
              className={`w-12 h-12 rounded-2xl gradient-brand text-white grid place-items-center shadow-glow-lg ${
                pathname === "/ai" ? "ring-4 ring-brand/20" : "animate-ai-pulse"
              }`}
              aria-label="AI Agent"
            >
              <FiZap size={20} />
            </button>
          </div>

          <NavLink to="/review" className={tabCls}>
            {reviewCount > 0 && (
              <span className="absolute top-1 right-[24%] min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center">
                {reviewCount}
              </span>
            )}
            <FiFileText size={18} strokeWidth={2.2} />
            Content
          </NavLink>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              moreOpen || inMore ? "text-brand" : "text-ink-400"
            }`}
            aria-label="More"
          >
            <FiMenu size={18} strokeWidth={2.2} />
            More
          </button>
        </div>
      </nav>

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}

function MoreSheet({ onClose }) {
  const { brands, activeBrand, switchBrand, showToast } = useStore();
  const { user, logout } = useAuth();
  const { count } = useNotifications();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const go = (to) => {
    onClose();
    navigate(to);
  };
  const fire = (event) => {
    onClose();
    // let the sheet close first so the next panel isn't under it
    setTimeout(() => window.dispatchEvent(new Event(event)), 120);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] lg:hidden">
      <div className="absolute inset-0 glass-overlay animate-fadein" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl glass-panel border-b-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)] animate-sheet-up">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-200" />

        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-bold text-ink-900">Menu</div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full grid place-items-center text-ink-500 hover:bg-ink-100"
            aria-label="Close menu"
          >
            <FiX size={17} />
          </button>
        </div>

        {/* brand switcher */}
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Brand</div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 side-scroll">
            {brands.map((b) => {
              const on = b.slug === activeBrand;
              return (
                <button
                  key={b.slug}
                  type="button"
                  onClick={() => {
                    switchBrand(b.slug);
                    showToast(`Viewing ${b.name}`);
                  }}
                  className={`flex flex-none items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                    on ? "border-brand bg-brand-soft text-brand" : "border-ink-200 text-ink-700"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorForBrand(b.slug) }} />
                  {b.name}
                  {on && <FiCheck size={13} />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                onClose();
                openCreateBrand();
              }}
              className="flex flex-none items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-500"
            >
              <FiPlus size={13} /> New brand
            </button>
          </div>
        </div>

        {/* every module */}
        <div className="grid grid-cols-4 gap-2">
          {MODULES.map((m) => {
            const on = m.to === "/" ? pathname === "/" : pathname.startsWith(m.to);
            return (
              <button
                key={m.to}
                type="button"
                onClick={() => go(m.to)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-medium transition ${
                  on ? "bg-brand-soft text-brand" : "text-ink-700 active:bg-ink-100"
                }`}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    on ? "bg-white text-brand shadow-sm" : "bg-ink-50 text-ink-600"
                  }`}
                >
                  <m.icon size={18} />
                </span>
                <span className="leading-tight text-center">{m.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => fire("dispatch:open-notifications")}
            className="relative flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-medium text-ink-700 active:bg-ink-100"
          >
            <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink-600">
              <FiBell size={18} />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9.5px] font-bold grid place-items-center">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            Inbox
          </button>
          <button
            type="button"
            onClick={() => fire("dispatch:open-settings")}
            className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-medium text-ink-700 active:bg-ink-100"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink-600">
              <FiSettings size={18} />
            </span>
            Settings
          </button>
          <button
            type="button"
            onClick={applyUpdate}
            className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-medium text-ink-700 active:bg-ink-100"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-ink-600">
              <FiRefreshCw size={18} />
            </span>
            Refresh
          </button>
        </div>

        {/* account */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink-200 p-3">
          <span className="h-10 w-10 flex-none rounded-full grid place-items-center bg-brand text-white text-[12px] font-bold">
            {user?.initials || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink-900">{user?.name}</div>
            <div className="truncate text-[11.5px] text-ink-500">{user?.workspace_name}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
              showToast("Signed out");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600"
          >
            <FiLogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
