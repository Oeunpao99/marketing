import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiCheck,
  FiChevronDown,
  FiEdit,
  FiFileText,
  FiGrid,
  FiImage,
  FiInbox,
  FiLogOut,
  FiPackage,
  FiRepeat,
  FiSearch,
  FiSettings,
  FiSmartphone,
  FiZap,
} from "react-icons/fi";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { PLAT } from "../../data/brands";
import { useStore } from "../../store";
import { colorForBrand } from "../../lib/brandColor";
import PlatformIcon from "../ui/PlatformIcon";
import SettingsModal from "./SettingsModal";
import { openCreateBrand } from "./CreateBrandDrawer";
import Notifications from "./Notifications";
import { useNotifications } from "../../lib/notifications";

// Same two-tier shape as the reference: a flat core nav up top, then labeled
// sections. Every entry is a real page — nothing here points nowhere.
const CORE = [
  { to: "/", end: true, icon: FiGrid, label: "Dashboard", badge: "queue" },
  { to: "/channels", icon: FiSmartphone, label: "Platforms", expand: "platforms" },
  { to: "/review", icon: FiFileText, label: "Content", badge: "review" },
  { to: "/calendar", icon: FiCalendar, label: "Calendar" },
  { to: "/library", icon: FiImage, label: "Media Library" },
  { to: "/new", icon: FiEdit, label: "Compose" },
];

const SECTIONS = [
  {
    label: "AI Studio",
    items: [
      { to: "/ai", icon: FiZap, label: "AI Agent" },
      { to: "/weekly", icon: FiClipboard, label: "Weekly plan" },
      { to: "/auto", icon: FiRepeat, label: "Auto-generate" },
      { to: "/products", icon: FiPackage, label: "Products" },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/insights", icon: FiBarChart2, label: "Overview" }],
  },
];

// ``collapsed`` = the slim icon rail (Shell's sidebar toggle): icons only,
// labels as hover tooltips, counts as dots, menus open beside the rail.
export default function Sidebar({ collapsed = false }) {
  const { brands, channels, queue, review, activeBrand, switchBrand, showToast } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(pathname.startsWith("/channels"));

  const active = brands.find((b) => b.slug === activeBrand) || brands[0];
  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(brandQuery.trim().toLowerCase()),
  );
  const reviewCount = (review || []).length;
  const { count: notifCount } = useNotifications();
  const brandChannels = channels.filter((c) => c.b === active?.slug);

  useEffect(() => {
    const open = () => setSearchOpen(true);
    const openSettings = (event) => {
      setSettingsTab(event?.detail?.tab || null);
      setSettingsOpen(true);
    };
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setBrandOpen(false);
        setNotifOpen(false);
        setUserOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("dispatch:open-search", open);
    window.addEventListener("dispatch:open-settings", openSettings);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("dispatch:open-search", open);
    window.removeEventListener("dispatch:open-settings", openSettings);
    };
  }, []);

  const badgeFor = (badge) => {
    if (badge === "review" && reviewCount > 0) return reviewCount;
    if (badge === "queue" && queue.length > 0) return queue.length;
    return null;
  };

  const navItem = ({ to, end, icon: Icon, label, badge, expand }) => {
    const count = badgeFor(badge);
    if (collapsed) {
      return (
        <NavLink
          key={to + label}
          to={to}
          end={end}
          title={count != null ? `${label} (${count})` : label}
          aria-label={label}
          className={({ isActive }) =>
            `relative mx-auto grid place-items-center w-10 h-10 rounded-xl transition-colors duration-150 ${
              isActive ? "bg-brand-soft text-brand" : "text-ink-500 hover:bg-ink-100/80 hover:text-ink-800"
            }`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {count != null && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand ring-2 ring-[#FAFBFC]" />}
        </NavLink>
      );
    }
    return (
      <div key={to + label}>
        <NavLink
          to={to}
          end={end}
          className={({ isActive }) =>
            `group flex items-center gap-3 w-full px-3 py-[7px] rounded-lg text-[13px] transition-colors duration-150 ${
              isActive
                ? "bg-brand-soft text-brand font-semibold"
                : "text-ink-700 font-medium hover:bg-ink-100/80 hover:text-ink-900"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={17}
                className={`flex-none ${isActive ? "text-brand" : "text-ink-500 group-hover:text-ink-700"}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{label}</span>
              {count != null && (
                <span className="text-[11px] font-semibold text-ink-500 tabular-nums">{count}</span>
              )}
              {expand && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPlatformsOpen((v) => !v);
                  }}
                  className="-mr-1 p-1 rounded text-ink-400 hover:text-ink-700"
                  aria-label={platformsOpen ? "Collapse platforms" : "Expand platforms"}
                >
                  <FiChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${platformsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </>
          )}
        </NavLink>

        {expand === "platforms" && platformsOpen && (
          <div className="mt-0.5 mb-1 ml-[22px] pl-3 border-l border-ink-200 space-y-0.5">
            {brandChannels.length === 0 ? (
              <div className="px-2 py-1.5 text-[11.5px] text-ink-400">No channels yet</div>
            ) : (
              brandChannels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate("/channels")}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12px] text-ink-600 hover:bg-ink-100/80 hover:text-ink-900"
                >
                  <PlatformIcon name={PLAT[c.p]?.name} className="text-ink-500 flex-none" />
                  <span className="flex-1 truncate">{c.h || PLAT[c.p]?.name || c.p}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-none ${
                      c.s === "live" ? "bg-emerald-500" : c.s === "soon" ? "bg-amber-400" : "bg-ink-300"
                    }`}
                    title={c.s === "live" ? "Connected" : c.s === "soon" ? "Reconnect soon" : "Not connected"}
                  />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

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
    <aside className="hidden lg:flex flex-col sticky top-0 h-screen bg-[#FAFBFC] border-r border-ink-200/70 side-scroll">
      {/* App name */}
      <NavLink
        to="/"
        title="ContentFlow"
        className={`flex items-center gap-2.5 pt-5 pb-3 ${collapsed ? "justify-center px-0" : "px-5"}`}
      >
        <img src="/brand/logo-mark.png" alt="ContentFlow" className="w-9 h-9 flex-none object-contain" />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink-900 tracking-tight leading-tight">ContentFlow</span>
            <span className="block text-[11px] text-ink-500">AI Marketing Hub</span>
          </span>
        )}
      </NavLink>

      {/* Workspace (brand) switcher */}
      <div className={`relative pb-3 ${collapsed ? "px-0 flex justify-center" : "px-3"}`}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setBrandOpen((v) => !v)}
            title={`${active?.name || "Select a brand"} — switch brand`}
            className={`w-10 h-10 rounded-xl grid place-items-center text-white text-[13px] font-bold ring-2 transition ${
              brandOpen ? "ring-brand/40" : "ring-transparent hover:ring-ink-200"
            }`}
            style={{ background: active ? colorForBrand(active.slug) : "#94A3B8" }}
          >
            {active?.name?.slice(0, 1) || "?"}
          </button>
        ) : (
        <button
          type="button"
          onClick={() => setBrandOpen((v) => !v)}
          className={`w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors duration-150 ${
            brandOpen ? "border-brand-line bg-brand-soft" : "border-ink-200 bg-white hover:border-ink-300"
          }`}
        >
          <span
            className="w-7 h-7 rounded-lg grid place-items-center flex-none text-white text-[11px] font-bold"
            style={{ background: active ? colorForBrand(active.slug) : "#94A3B8" }}
          >
            {active?.name?.slice(0, 1) || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-ink-900 truncate leading-tight">
              {active?.name || "Select a brand"}
            </span>
            <span className="block text-[10.5px] text-ink-500 truncate">
              {user?.workspace_name || "Brand"}
            </span>
          </span>
          <FiChevronDown
            size={16}
            className={`text-ink-500 flex-none transition-transform duration-200 ${brandOpen ? "rotate-180" : ""}`}
          />
        </button>
        )}

        {brandOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 cursor-default"
              aria-label="Close brand menu"
              onClick={() => setBrandOpen(false)}
            />
            <div
              className={`absolute z-40 glass-panel rounded-xl p-2 animate-fadein ${
                collapsed ? "left-[calc(100%-6px)] top-0 w-[260px]" : "left-4 right-4 top-[calc(100%-6px)]"
              }`}
            >
              <div className="relative mb-1.5">
                <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  type="search"
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  placeholder="Search brands"
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg pl-8 pr-3 py-1.5 text-[11.5px] focus:outline-none focus:border-brand/40"
                />
              </div>
              <div className="max-h-[260px] overflow-y-auto -mx-1 px-1">
                {filteredBrands.length === 0 ? (
                  <div className="px-2 py-3 text-center text-[10.5px] text-ink-400">
                    {brands.length ? `No brand matches "${brandQuery}"` : "No brands yet."}
                  </div>
                ) : (
                  filteredBrands.map((b) => {
                    const count = channels.filter((c) => c.b === b.slug && c.s !== "off").length;
                    const current = b.slug === active?.slug;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          switchBrand(b.slug);
                          setBrandOpen(false);
                          showToast(`Viewing ${b.name}`);
                        }}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ${
                          current ? "bg-brand-soft" : "hover:bg-ink-50"
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-md grid place-items-center text-white font-bold text-[10px] flex-none ${
                            current ? "bg-brand" : "bg-ink-300"
                          }`}
                        >
                          {b.name?.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11.5px] font-semibold text-ink-800 truncate">{b.name}</span>
                          <span className="block text-[10px] text-ink-400">
                            {count} connected {count === 1 ? "channel" : "channels"}
                          </span>
                        </span>
                        {current && <FiCheck size={14} className="text-brand flex-none" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="mt-1.5 border-t border-ink-100 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBrandOpen(false);
                    openCreateBrand();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11.5px] font-semibold text-brand hover:bg-brand-soft"
                >
                  <span className="text-[14px] leading-none">+</span> Create new brand
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto side-scroll pb-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={collapsed ? "space-y-1" : "space-y-0.5"}>{CORE.map(navItem)}</div>

        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className={`my-3 border-t border-ink-200/70 ${collapsed ? "mx-2" : "mx-0"}`} />
            {!collapsed && <div className="px-3 mb-1.5 text-[12px] font-medium text-ink-500">{section.label}</div>}
            <div className={collapsed ? "space-y-1" : "space-y-0.5"}>{section.items.map(navItem)}</div>
          </div>
        ))}

        <div className={`my-3 border-t border-ink-200/70 ${collapsed ? "mx-2" : "mx-0"}`} />
        <div className="space-y-0.5">
          <div className="relative">
            {collapsed ? (
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                title={notifCount > 0 ? `Inbox (${notifCount})` : "Inbox"}
                aria-label="Inbox"
                className="relative mx-auto grid place-items-center w-10 h-10 rounded-xl text-ink-500 hover:bg-ink-100/80 hover:text-ink-800 transition-colors duration-150"
              >
                <FiInbox size={18} />
                {notifCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#FAFBFC]" />
                )}
              </button>
            ) : (
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="group flex items-center gap-3 w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-700 hover:bg-ink-100/80 hover:text-ink-900 transition-colors duration-150"
            >
              <FiInbox size={17} className="flex-none text-ink-500 group-hover:text-ink-700" />
              <span className="flex-1 text-left">Inbox</span>
              {notifCount > 0 && (
                <span className="text-[11px] font-semibold text-ink-500 tabular-nums">{notifCount}</span>
              )}
            </button>
            )}
          </div>
        </div>
      </nav>

      {/* Footer: settings + user */}
      <div className={`pb-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className="border-t border-ink-200/70 pt-3 mb-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className={
              collapsed
                ? "mx-auto grid place-items-center w-10 h-10 rounded-xl text-ink-500 hover:bg-ink-100/80 hover:text-ink-800 transition-colors duration-150"
                : "group flex items-center gap-3 w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-700 hover:bg-ink-100/80 hover:text-ink-900 transition-colors duration-150"
            }
          >
            <FiSettings size={collapsed ? 18 : 17} className="flex-none text-ink-500 group-hover:text-ink-700" />
            {!collapsed && "Settings"}
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            title={collapsed ? user?.name || "Account" : undefined}
            className={`w-full flex items-center gap-3 rounded-xl py-2 text-left hover:bg-ink-100/70 transition-colors duration-150 ${
              collapsed ? "justify-center px-0" : "px-2"
            }`}
          >
            <span className="w-10 h-10 rounded-full grid place-items-center flex-none bg-brand text-white text-[12px] font-bold">
              {initials}
            </span>
            {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-ink-900 truncate leading-tight">
                {user?.name || "Account"}
              </span>
              <span className="block text-[11.5px] text-ink-500 truncate">{user?.email || ""}</span>
            </span>
            )}
            {!collapsed && (
              <FiChevronDown
                size={18}
                className={`text-ink-500 flex-none transition-transform duration-200 ${userOpen ? "rotate-180" : ""}`}
              />
            )}
          </button>

          {userOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 cursor-default"
                aria-label="Close account menu"
                onClick={() => setUserOpen(false)}
              />
              <div
                className={`absolute z-40 glass-panel rounded-xl p-1.5 animate-fadein ${
                  collapsed ? "left-[calc(100%+8px)] bottom-0 w-[200px]" : "left-0 right-0 bottom-[calc(100%+6px)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] text-ink-700 hover:bg-ink-50"
                >
                  <FiSettings size={14} /> Account settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserOpen(false);
                    logout();
                    showToast("Signed out");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] text-red-600 hover:bg-red-50"
                >
                  <FiLogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} showToast={showToast} initialTab={settingsTab} />
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} anchor={collapsed ? "rail" : "bottom"} />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        channels={channels}
        queue={queue}
        review={review || []}
        brands={brands}
        navigate={navigate}
      />
    </aside>
  );
}

function SearchModal({ open, onClose, channels, queue, review, brands, navigate }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;

  const term = query.trim().toLowerCase();
  const matches = (values) =>
    !term || values.some((value) => String(value || "").toLowerCase().includes(term));
  const results = [
    ...queue.map((post, index) => ({
      id: `post-${index}`,
      type: "Post",
      title: post.ttl || "Untitled post",
      detail: `${post.b} · ${post.t} · ${post.st}`,
      onSelect: () => navigate(`/post/${index}`),
      values: [post.ttl, post.cap, post.b, post.st],
    })),
    ...review.map((draft, index) => ({
      id: `draft-${index}`,
      type: "Draft",
      title: draft.ttl,
      detail: `${draft.b} · ${draft.made}`,
      onSelect: () => navigate("/review"),
      values: [draft.ttl, draft.b, draft.made],
    })),
    ...channels.map((channel) => ({
      id: `channel-${channel.id}`,
      type: "Channel",
      title: channel.h,
      detail: `${channel.b} · ${channel.p}`,
      onSelect: () => navigate("/channels"),
      values: [channel.h, channel.b, channel.p, channel.m],
    })),
    ...brands.map((brand) => ({
      id: `brand-${brand.id}`,
      type: "Brand",
      title: brand.name,
      detail: "Open dashboard",
      onSelect: () => navigate("/"),
      values: [brand.name, brand.slug],
    })),
  ].filter((result) => matches(result.values));

  const selectResult = (result) => {
    result.onSelect();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        type="button"
        className="fixed inset-0 glass-overlay"
        onClick={onClose}
        aria-label="Close search"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl glass-panel animate-fadein">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          <FiSearch size={16} className="text-ink-400" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts, brands, drafts"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[13px] text-ink-800 outline-none"
            aria-label="Search posts, brands, drafts"
          />
          <kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">ESC</kbd>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-ink-400">No results found</div>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => selectResult(result)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-soft"
              >
                <span className="w-14 flex-none text-[10px] font-bold uppercase tracking-wide text-ink-400">
                  {result.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink-800">{result.title}</span>
                  <span className="block truncate text-[10.5px] text-ink-400">{result.detail}</span>
                </span>
                <span className="text-ink-300" aria-hidden="true">→</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
