import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiCheck,
  FiChevronDown,
  FiCreditCard,
  FiLogOut,
  FiSearch,
  FiSettings,
} from "react-icons/fi";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { useStore } from "../../store";
import { colorForBrand } from "../../lib/brandColor";
import SettingsModal from "./SettingsModal";
import { openCreateBrand } from "./CreateBrandDrawer";
import { canOpen } from "../../lib/access";
import { useUsage } from "../../lib/usage";
import { BOSS, onPath } from "../../lib/nav";
import { kitSrc } from "../brandkit/BrandKit";

/** A brand's badge: its own logo (Brand kit) on a white tile, else its first letter in its colour. */
export function BrandBadge({ brand, className = "", tone }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [brand?.logoUrl]);
  if (brand?.logoUrl && !broken) {
    return (
      <span className={`grid flex-none place-items-center overflow-hidden border border-ink-200 bg-white ${className}`}>
        <img src={kitSrc(brand.logoUrl)} alt="" className="h-[84%] w-[84%] object-contain" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span
      className={`grid flex-none place-items-center font-bold text-white ${className}`}
      style={tone ? undefined : { background: brand ? colorForBrand(brand.slug) : "#94A3B8" }}
    >
      {brand?.name?.slice(0, 1) || "?"}
    </span>
  );
}


// ``collapsed`` = the slim icon rail (Shell's sidebar toggle): icons only,
// labels as hover tooltips, counts as dots, menus open beside the rail.
export default function Sidebar({ collapsed = false }) {
  const { brands, channels, channelsReady, auto, queue, review, activeBrand, switchBrand, showToast, libraryNew } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const [planCount, setPlanCount] = useState(0); // weekly-plan posts waiting for a yes
  const [leadCount, setLeadCount] = useState(0); // qualified leads waiting for a rep

  // The Plan & best time badge: cheap, so refreshed on every page change and each minute.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get("/command/counts")
        .then((r) => {
          if (!alive) return;
          setPlanCount(r.plan || 0);
          setLeadCount(r.leads || 0);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pathname]);

  const active = brands.find((b) => b.slug === activeBrand) || brands[0];
  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(brandQuery.trim().toLowerCase()),
  );
  const reviewCount = (review || []).length;
  const brandChannels = channels.filter((c) => c.b === active?.slug);

  useEffect(() => {
    const open = () => setSearchOpen(true);
    const openSettings = (event) => {
      setSettingsTab(event?.detail?.tab || null);
      setSettingsOpen(true);
    };
    const closeSettings = () => setSettingsOpen(false);
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setBrandOpen(false);
        setUserOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("dispatch:open-search", open);
    window.addEventListener("dispatch:open-settings", openSettings);
    // Settings → Billing → Upgrade goes to the /upgrade page: Settings closes first
    window.addEventListener("dispatch:close-settings", closeSettings);
    // A scanned "send me credits" QR (Settings → Billing → Receive) lands on
    // /?transfer=<account ID>: open Billing with Transfer filled in (BillingTab
    // picks the number up from sessionStorage).
    const to = new URLSearchParams(window.location.search).get("transfer");
    if (to) {
      try {
        sessionStorage.setItem("cf_transfer_to", to.replace(/\D/g, "").slice(0, 10));
      } catch {
        // no storage: Billing opens, the number is typed by hand
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("transfer");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      openSettings({ detail: { tab: "billing" } });
    }
    // /?settings=billing — a notification's link (e.g. "Payment received", app/payments.py)
    const tab = new URLSearchParams(window.location.search).get("settings");
    if (tab) {
      const url = new URL(window.location.href);
      url.searchParams.delete("settings");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      openSettings({ detail: { tab: tab.replace(/[^a-z]/g, "") } });
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("dispatch:open-search", open);
    window.removeEventListener("dispatch:open-settings", openSettings);
    window.removeEventListener("dispatch:close-settings", closeSettings);
    };
  }, []);

  // Setup shows a red dot while the brand can't post: nothing connected, or a channel to reconnect.
  const setupIssue =
    channelsReady && !!active && (!brandChannels.some((c) => c.s === "live") || brandChannels.some((c) => c.s === "soon"));
  const dotTitle = brandChannels.some((c) => c.s === "live")
    ? "A channel needs reconnecting"
    : "Connect a Page or account to start posting";
  const autoRow = (auto || []).find((a) => a.brand_slug === active?.slug);
  const autopilot = !autoRow?.enabled
    ? { title: "Off", note: "Turn on Auto-generate so the AI writes and posts every day." }
    : autoRow.require_approval
      ? { title: "Ask me first", note: "Every post waits for your yes before it goes out." }
      : {
          title: "Ask me weekly",
          note: "Weekly plans, and any post with a price, offer or customer name that isn’t checked, wait for your yes.",
        };

  const badgeFor = (badge) => {
    if (badge === "plan" && planCount > 0) return planCount;
    if (badge === "leads" && leadCount > 0) return leadCount;
    if (badge === "review" && reviewCount > 0) return reviewCount;
    if (badge === "queue" && queue.length > 0) return queue.length;
    if (badge === "library" && libraryNew > 0) return libraryNew;
    return null;
  };

  const pillFor = (badge, count) =>
    badge === "library" ? (
      <span title={`${count} new since you last looked`} className="rounded-full bg-brand px-1.5 py-px text-[10px] font-bold text-white tabular-nums">
        {count} new
      </span>
    ) : badge === "plan" ? (
      <span title={`${count} post${count === 1 ? "" : "s"} waiting for your approval`} className="rounded-full bg-brand px-2 py-px text-[11px] font-bold text-white tabular-nums">
        {count}
      </span>
    ) : badge === "leads" ? (
      <span title={`${count} qualified lead${count === 1 ? "" : "s"} waiting for a rep`} className="rounded-full bg-orange-600 px-2 py-px text-[11px] font-bold text-white tabular-nums">
        {count}
      </span>
    ) : badge === "review" ? (
      <span title={`${count} idea${count === 1 ? "" : "s"} waiting for your OK`} className="rounded-full bg-orange-600 px-2 py-px text-[11px] font-bold text-white tabular-nums">
        {count}
      </span>
    ) : (
      <span className="text-[11px] font-semibold text-ink-500 tabular-nums">{count}</span>
    );

  const navItem = ({ to, end, icon: Icon, label, badge, tour, top, dot }) => {
    if (!canOpen(user, to)) return null; // not in this person's access
    const count = badgeFor(badge);
    const showDot = dot === "setup" && setupIssue;
    if (collapsed) {
      return (
        <NavLink
          key={to + label}
          to={to}
          end={end}
          data-tour={tour}
          title={count != null ? `${label} (${count})` : label}
          aria-label={label}
          className={({ isActive }) =>
            `relative mx-auto grid place-items-center w-10 h-10 rounded-xl transition-colors duration-150 ${
              isActive ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-100/60 hover:text-ink-900"
            }`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {(count != null || showDot) && (
            <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-canvas-soft ${showDot ? "bg-red-500" : "bg-brand"}`} />
          )}
        </NavLink>
      );
    }
    return (
      <div key={to + label}>
        <NavLink
          to={to}
          end={end}
          data-tour={tour}
          className={({ isActive }) =>
            `group flex items-center gap-3.5 w-full px-3.5 py-[7px] rounded-xl text-[15px] transition-colors duration-150 ${
              isActive
                ? "bg-ink-100 text-ink-900 font-semibold"
                : "text-ink-700 font-medium hover:bg-ink-100/60 hover:text-ink-900"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={16}
                className={`flex-none ${isActive ? "text-ink-900" : "text-ink-500 group-hover:text-ink-800"}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{label}</span>
              {count != null &&
                (top || badge === "library" ? (
                  pillFor(badge, count)
                ) : (
                  <span className="text-[11px] font-semibold text-ink-500 tabular-nums">{count}</span>
                ))}
              {showDot && <span title={dotTitle} className="h-2 w-2 flex-none rounded-full bg-red-500" />}
            </>
          )}
        </NavLink>

      </div>
    );
  };

  // One line per section, as in the boss's design: highlighted while you're on
  // any of its pages, its badge adding up what's waiting inside it. The
  // section's own pages are tabs at the top of the page (SectionTabs).
  const section = (item) => {
    if (!item.sub) return navItem({ ...item, top: true });
    const subs = item.sub.filter((x) => canOpen(user, x.to));
    if (!canOpen(user, item.to) && !subs.length) return null;
    const here = subs.some((x) => onPath(pathname, x.to));
    const own = badgeFor(item.badge) || 0;
    const inside = subs.filter((x) => x.badge !== item.badge).reduce((n, x) => n + (badgeFor(x.badge) || 0), 0);
    const total = own + inside;
    const kind = item.badge || subs.find((x) => badgeFor(x.badge))?.badge;
    const Icon = item.icon;
    const showDot = item.dot === "setup" && setupIssue;
    const to = canOpen(user, item.to) ? item.to : subs[0].to;

    if (collapsed) {
      return (
        <NavLink
          key={item.label}
          to={to}
          data-tour={item.tour}
          title={total ? `${item.label} (${total})` : item.label}
          aria-label={item.label}
          className={`relative mx-auto grid h-10 w-10 place-items-center rounded-xl transition-colors duration-150 ${
            here ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-100/60 hover:text-ink-900"
          }`}
        >
          <Icon size={18} aria-hidden="true" />
          {(total > 0 || showDot) && (
            <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-canvas-soft ${showDot ? "bg-red-500" : "bg-brand"}`} />
          )}
        </NavLink>
      );
    }

    return (
      <NavLink
        key={item.label}
        to={to}
        data-tour={item.tour}
        className={`group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-[7px] text-[15px] transition-colors duration-150 ${
          here ? "bg-ink-100 font-semibold text-ink-900" : "font-medium text-ink-700 hover:bg-ink-100/60 hover:text-ink-900"
        }`}
      >
        <Icon size={16} className={`flex-none ${here ? "text-ink-900" : "text-ink-500 group-hover:text-ink-800"}`} aria-hidden="true" />
        <span className="flex-1 truncate">{item.label}</span>
        {total > 0 && pillFor(kind, total)}
        {showDot && <span title={dotTitle} className="h-2 w-2 flex-none rounded-full bg-red-500" />}
      </NavLink>
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
    <aside className="hidden lg:flex flex-col sticky top-0 h-screen bg-canvas-soft border-r border-ink-200/70 side-scroll font-gsans">
      {/* App name */}
      <NavLink
        to="/"
        title="Marketing ឆ្លាតវៃ"
        className={`flex items-center gap-2.5 pt-5 pb-3 ${collapsed ? "justify-center px-0" : "px-5"}`}
      >
        <img src="/brand/logo-mark.png" alt="Marketing ឆ្លាតវៃ" className="w-9 h-9 flex-none object-contain" />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold text-ink-900 leading-tight">
              Marketing <span className="font-khmer text-brand">ឆ្លាតវៃ</span>
            </span>
            <span className="block text-[11px] text-ink-500">Your AI marketing team</span>
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
            className={`rounded-xl ring-2 transition ${brandOpen ? "ring-brand/40" : "ring-transparent hover:ring-ink-200"}`}
          >
            <BrandBadge brand={active} className="h-10 w-10 rounded-xl text-[13px]" />
          </button>
        ) : (
        <button
          type="button"
          onClick={() => setBrandOpen((v) => !v)}
          className={`w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors duration-150 ${
            brandOpen ? "border-brand-line bg-brand-soft" : "border-ink-200 bg-white hover:border-ink-300"
          }`}
        >
          <BrandBadge brand={active} className="h-7 w-7 rounded-lg text-[11px]" />
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
                        <BrandBadge
                          brand={b}
                          tone
                          className={`h-6 w-6 rounded-md text-[10px] ${b.logoUrl ? "" : current ? "bg-brand" : "bg-ink-300"}`}
                        />
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
        <div className={collapsed ? "space-y-1.5" : "space-y-0.5"}>
          {BOSS.map((item) => {
            const line = section(item);
            if (!line) return null;
            if (!item.group) return line;
            return (
              <div key={`g-${item.label}`} className={collapsed ? "space-y-1.5" : "space-y-0.5"}>
                {collapsed ? (
                  <div className="mx-auto my-2.5 h-px w-6 bg-ink-200" aria-hidden="true" />
                ) : (
                  <div className="px-3.5 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-400">{item.group}</div>
                )}
                {line}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer: settings + user */}
      <div className={`pb-3 ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && auto && (
          <NavLink
            to="/auto"
            className="mb-3 block rounded-xl border border-ink-200/70 bg-white px-3 py-2.5 transition-colors hover:border-ink-300"
          >
            <span className="block text-[11px] text-ink-500">Autopilot</span>
            <span className="block text-[13px] font-bold leading-tight text-ink-900">{autopilot.title}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">{autopilot.note}</span>
          </NavLink>
        )}
        <div className={`border-t border-ink-200/70 pt-3 mb-2 ${collapsed ? "space-y-1.5" : "grid grid-cols-3 gap-2"}`}>
          {[
            {
              icon: FiSettings,
              label: "Settings",
              onClick: () => {
                setSettingsTab(null);
                setSettingsOpen(true);
              },
            },
            { icon: FiSearch, label: "Search (Ctrl K)", onClick: () => setSearchOpen(true) },
            {
              icon: FiCreditCard,
              label: "Plans & billing",
              onClick: () => {
                setSettingsTab("billing");
                setSettingsOpen(true);
              },
            },
          ].map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              title={label}
              aria-label={label}
              className={`grid h-10 place-items-center rounded-xl border border-ink-200/80 text-ink-500 transition-colors duration-150 hover:bg-ink-100/60 hover:text-ink-900 ${
                collapsed ? "mx-auto w-10" : "w-full"
              }`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            title={collapsed ? user?.name || "Account" : undefined}
            className={`w-full flex items-center gap-2.5 rounded-xl py-2 text-left transition-colors duration-150 ${
              collapsed ? "justify-center px-0 hover:bg-ink-100/60" : "border border-ink-200/80 px-2.5 hover:bg-ink-100/60"
            }`}
          >
            <span className={`rounded-full grid place-items-center flex-none bg-brand text-white font-bold ${collapsed ? "w-10 h-10 text-[12px]" : "w-8 h-8 text-[11px]"}`}>
              {initials}
            </span>
            {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 leading-tight">
                <span className="text-[13px] font-semibold text-ink-900 truncate">{user?.name || "Account"}</span>
                <PlanBadge />
              </span>
              <span className="block text-[11.5px] text-ink-500 truncate">{user?.email || ""}</span>
            </span>
            )}
            {!collapsed && (
              <FiChevronDown
                size={16}
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
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[calc(12vh/var(--z,1))]"
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

// The workspace's plan beside the name (GET /usage plan / plan_label: Free, Starter,
// Growth, Business, Enterprise), each in its own colour so a glance says which one.
const PLAN_TONE = {
  free: "bg-ink-100 text-ink-600",
  starter: "bg-sky-50 text-sky-700",
  pro: "bg-emerald-50 text-emerald-700",
  business: "bg-violet-50 text-violet-600",
  enterprise: "bg-amber-50 text-amber-800",
};

function PlanBadge() {
  const { usage } = useUsage();
  if (!usage?.plan_label) return null;
  return (
    <span className={`flex-none rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${PLAN_TONE[usage.plan] || PLAN_TONE.free}`}>
      {usage.plan_label}
    </span>
  );
}
