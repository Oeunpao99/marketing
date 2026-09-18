import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiActivity,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiEdit3,
  FiGrid,
  FiImage,
  FiPackage,
  FiSettings,
  FiTrendingUp,
  FiZap,
} from "react-icons/fi";
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from "react-icons/si";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { useStore } from "../../store";
import SettingsModal from "../layout/SettingsModal";

const BRAND_COLORS = { assist: "#3B82F6", chum: "#F59E0B", hub: "#8B5CF6" };

export default function Sidebar() {
  const { brands, channels, queue, review, libraryCount, showToast } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState(null);
  const liveFor = (id) =>
    channels.filter((c) => c.b === id && c.s !== "off").length;
  const postsFor = (id) => queue.filter((q) => q.b === id).length;
  const liveCount = channels.filter((c) => c.s !== "off").length;

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navItem = ({ to, end, icon, label, badge, hot }) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
          isActive
            ? "bg-brand text-white shadow-glow"
            : "text-white hover:bg-white/8 hover:text-white"
        }`
      }
    >
      <span className="w-4 flex-none grid place-items-center opacity-90 text-sm leading-none">
        <ModuleIcon icon={icon} />
      </span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span
          className={`font-mono text-[11px] rounded-full px-1.5 py-px ${
            hot ? "bg-amber-400 text-ink-950" : "bg-white/10 text-ink-400"
          }`}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <aside className="hidden lg:flex flex-col sticky top-0 h-screen overflow-y-auto side-scroll gradient-sidebar text-white py-4 border-r border-white/5">
      <div className="group rounded-xl">
        <div className="flex items-center gap-3 px-4 pb-4 mb-1">
          <div className="w-10 h-10 rounded-xl flex-none grid place-items-center gradient-brand text-white font-display text-2xl leading-none shadow-glow">
            T
          </div>
          <div className="min-w-0">
            <div className="text-white text-sm font-bold tracking-tight">
              Ti P'sa
            </div>
            <div className="text-[11px] text-ink-400">AI Marketing Hub</div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search posts, brands, drafts"
        className="mx-3 mb-4 px-2.5 py-2 rounded-xl bg-white/5 border border-ink-400 flex items-center gap-2 text-[13px] text-white hover:bg-white/10 hover:text-white transition-all duration-150"
      >
        Search posts, brands, drafts
        <kbd className="ml-auto bg-white/10 rounded px-1.5 font-mono text-[10.5px] text-ink-400">
          ⌘K
        </kbd>
      </button>

      <nav className="space-y-0.5 px-3 mb-5">
        <SectionLabel>Operations</SectionLabel>
        {navItem({
          to: "/",
          end: true,
          label: "Today",
          badge: queue.length,
          icon: "today",
          hot: true,
        })}
        {navItem({ to: "/new", label: "New post", icon: "new" })}
        {navItem({
          to: "/review",
          label: "Waiting for you",
          badge: (review || []).length,
          hot: (review || []).length > 0,
          icon: "review",
        })}
        {navItem({ to: "/calendar", label: "Calendar", icon: "calendar" })}
        {navItem({ to: "/ai", label: "AI agent", icon: "ai" })}
        {navItem({
          to: "/library",
          label: "Library",
          icon: "library",
          badge: libraryCount || undefined,
        })}
        {navItem({ to: "/insights", label: "Insights", icon: "insights" })}
      </nav>

      <nav className="space-y-0.5 px-3 mb-5">
        <SectionLabel>Brands</SectionLabel>
        {brands.map((b) => {
          const isExpanded = expandedBrand === b.slug;
          const brandChannels = channels.filter(
            (channel) => channel.b === b.slug,
          );
          const activeChannels = brandChannels.filter(
            (channel) => channel.s !== "off",
          );
          return (
            <div key={b.id}>
              <button
                type="button"
                onClick={() => {
                  setExpandedBrand(isExpanded ? null : b.slug);
                  navigate("/channels");
                }}
                className="flex items-center gap-2 w-full rounded-xl px-2.5 py-1.5 text-[13px] text-white hover:bg-white/8 hover:text-white transition-all duration-150"
              >
                {isExpanded ? (
                  <FiChevronDown size={14} />
                ) : (
                  <FiChevronRight size={14} />
                )}
                <BrandDot id={b.slug} />
                <span className="flex-1 truncate text-left">{b.name}</span>
                <span className="font-mono text-[11px] text-ink-500">
                  {activeChannels.length}/5
                </span>
              </button>
              {isExpanded && (
                <div className="ml-7 border-l border-white/10 pl-2 py-1">
                  {brandChannels.length ? (
                    brandChannels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => navigate("/channels")}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11.5px] hover:bg-white/8 hover:text-white ${channel.s === "off" ? "text-white/60" : "text-white"}`}
                      >
                        <PlatformIcon platform={channel.p} />
                        <span className="truncate">
                          {channel.h || platformLabel(channel.p)}
                        </span>
                        <span className="ml-auto text-[10px]">
                          {channel.s === "off" ? "off" : channel.s}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-1 text-[11px] text-ink-500">
                      No active channels
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <nav className="space-y-0.5 px-3">
        <SectionLabel>Setup</SectionLabel>
        {navItem({
          to: "/channels",
          label: "Channels",
          badge: `${liveCount}/12`,
          icon: "channels",
        })}
        {navItem({ to: "/auto", label: "Auto-generate", icon: "auto" })}
        {navItem({ to: "/products", label: "Products", icon: "products" })}
      </nav>

      <div className="mt-auto px-3 py-3 border-t border-white/5 flex items-center gap-1">
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2.5 flex-1 min-w-0 px-2 py-1.5 rounded-xl hover:bg-white/8 transition-all duration-150"
        >
          <div className="w-8 h-8 rounded-xl flex-none grid place-items-center gradient-brand text-white text-[11px] font-bold shadow-sm">
            {user?.initials || "SR"}
          </div>
          <div className="min-w-0 text-left flex-1">
            <div className="text-[12.5px] text-ink-100 font-medium leading-tight truncate">
              {user?.name || "Sokha R."}
            </div>
            <div className="text-[11px] text-ink-500 truncate">
              {user?.email ||
                `${user?.location || "Phnom Penh"} · ${user?.timezone || "UTC+7"}`}
            </div>
          </div>
          <FiSettings size={14} className="text-ink-500" />
        </button>
        <button
          onClick={() => {
            logout();
            showToast("Signed out");
          }}
          title="Sign out"
          className="flex-none w-8 h-8 grid place-items-center rounded-xl text-ink-400 hover:bg-white/8 hover:text-ink-100 transition-all duration-150"
        >
          <FiActivity size={15} />
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showToast={showToast}
      />
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

function SearchModal({
  open,
  onClose,
  channels,
  queue,
  review,
  brands,
  navigate,
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;

  const term = query.trim().toLowerCase();
  const matches = (values) =>
    !term ||
    values.some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(term),
    );
  const results = [
    ...queue.map((post, index) => ({
      id: `post-${index}`,
      type: "Post",
      title: post.ttl,
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
      detail: "Open today",
      onSelect: () => navigate("/"),
      values: [brand.name, brand.id],
    })),
  ].filter((result) => matches(result.values));

  const selectResult = (result) => {
    result.onSelect();
    onClose();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <button
          type="button"
          className="fixed inset-0 bg-ink-950/70 backdrop-blur-lg"
          onClick={onClose}
          aria-label="Close search"
        />
        <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-dock animate-fadein">
          <div className="flex items-center gap-3 border-b border-ink-100 px-4">
            <span className="text-ink-400" aria-hidden="true">
              ⌕
            </span>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts, brands, drafts"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-[14px] text-ink-800 outline-none"
              aria-label="Search posts, brands, drafts"
            />
            <kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
              ESC
            </kbd>
          </div>
          <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="px-3 py-8 text-center text-[13px] text-ink-400">
                No results found
              </div>
            ) : (
              results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => selectResult(result)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand/5"
                >
                  <span className="w-14 flex-none text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    {result.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-800">
                      {result.title}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-400">
                      {result.detail}
                    </span>
                  </span>
                  <span className="text-ink-300" aria-hidden="true">
                    →
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function SectionLabel({ children }) {
  return (
    <div className="px-2 mb-1 text-[10.5px] font-bold tracking-[.1em] uppercase text-ink-500">
      {children}
    </div>
  );
}

function BrandDot({ id }) {
  const color = BRAND_COLORS[id] || "#166432";
  return (
    <span
      className="w-2 h-2 rounded-full flex-none"
      style={{ background: color, boxShadow: `0 0 6px ${color}40` }}
    />
  );
}

function ModuleIcon({ icon }) {
  const icons = {
    today: FiCalendar,
    new: FiEdit3,
    review: FiCheckCircle,
    calendar: FiCalendar,
    ai: FiZap,
    library: FiImage,
    insights: FiTrendingUp,
    channels: FiGrid,
    auto: FiSettings,
    products: FiPackage,
  };
  const Icon = icons[icon] || FiGrid;
  return <Icon size={15} aria-hidden="true" />;
}

function PlatformIcon({ platform }) {
  const icons = {
    facebook: SiFacebook,
    instagram: SiInstagram,
    telegram: SiTelegram,
    tiktok: SiTiktok,
    youtube: SiYoutube,
  };
  const Icon = icons[platform];
  return Icon ? (
    <Icon size={13} aria-hidden="true" />
  ) : (
    <FiGrid size={13} aria-hidden="true" />
  );
}

function platformLabel(platform) {
  return platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : "Channel";
}
