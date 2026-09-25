import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaLinkedin } from "react-icons/fa";
import { FiGrid } from "react-icons/fi";
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from "react-icons/si";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import Tag from "../components/ui/Tag";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { useStore } from "../store";
import { openCreateBrand } from "../components/layout/CreateBrandDrawer";
import { PLATFORM_COLORS } from "./InsightsPage";

export default function ChannelsPage() {
  const { brands, channels, refreshChannels, showToast, activeBrand } = useStore();
  const navigate = useNavigate();

  // Brand tabs + status filter, so nobody scrolls through every brand's 6–7
  // platforms. Kept in localStorage (not the url — this page's url params are
  // the OAuth "connected / failed" results, cleared on arrival).
  const [tab, setTabState] = useState(() => readPref("channels_tab") || activeBrand || "all");
  const [show, setShowState] = useState(() => readPref("channels_show") || "all");
  const setTab = (v) => (setTabState(v), writePref("channels_tab", v));
  const setShow = (v) => (setShowState(v), writePref("channels_show", v));
  const tabBrand = brands.find((b) => b.slug === tab);
  const currentTab = tabBrand ? tab : "all"; // a deleted brand falls back to All
  const counts = useMemo(() => {
    const scope = currentTab === "all" ? channels : channels.filter((c) => c.b === currentTab);
    return {
      all: scope.length,
      connected: scope.filter((c) => c.s !== "off").length,
      off: scope.filter((c) => c.s === "off").length,
    };
  }, [channels, currentTab]);
  const shownBrands = currentTab === "all" ? brands : brands.filter((b) => b.slug === currentTab);
  const matches = (c) => show === "all" || (show === "connected" ? c.s !== "off" : c.s === "off");
  const [searchParams, setSearchParams] = useSearchParams();
  // The channel the "Disconnect?" confirm is open for, plus how many queued
  // posts would be cancelled (null while that count is loading).
  const [confirming, setConfirming] = useState(null);
  const [pending, setPending] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const askDisconnect = async (c) => {
    setConfirming(c);
    setPending(null);
    try {
      const { queued } = await api.get(`/views/channels/${c.id}/pending`);
      setPending(queued);
    } catch {
      setPending(0);
    }
  };

  const disconnect = async () => {
    if (!confirming || disconnecting) return;
    setDisconnecting(true);
    try {
      const { cancelled } = await api.post(`/views/channels/${confirming.id}/disconnect`);
      await refreshChannels();
      showToast(
        cancelled
          ? `Disconnected — ${cancelled} queued post${cancelled === 1 ? "" : "s"} cancelled`
          : "Disconnected",
      );
      setConfirming(null);
    } catch (e) {
      showToast(`Could not disconnect — ${e.message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  // Lands here after the TikTok OAuth redirect (see AddChannelPage / the
  // backend's /oauth/tiktok/callback) — surface the result, then pull the
  // freshly-connected channel in and drop the query params from the url.
  useEffect(() => {
    const tiktok = searchParams.get("tiktok");
    if (!tiktok) return;
    if (tiktok === "connected") {
      showToast("TikTok connected");
      refreshChannels();
    } else {
      showToast(`TikTok connect failed — ${searchParams.get("message") || "try again"}`);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, showToast, refreshChannels]);

  // The Facebook/Instagram OAuth callback only redirects here on failure —
  // on success it goes to /channels/add (with a Page to pick from) instead.
  useEffect(() => {
    if (searchParams.get("meta") !== "error") return;
    showToast(`Facebook connect failed — ${searchParams.get("message") || "try again"}`);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, showToast]);

  // Lands here after the LinkedIn OAuth redirect (same direct-connect shape
  // as TikTok — no "pick a Page" step, since it's always the person's own feed).
  useEffect(() => {
    const linkedin = searchParams.get("linkedin");
    if (!linkedin) return;
    if (linkedin === "connected") {
      showToast("LinkedIn connected");
      refreshChannels();
    } else {
      showToast(`LinkedIn connect failed — ${searchParams.get("message") || "try again"}`);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, showToast, refreshChannels]);

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">
            Channels
          </h1>
          <p className="page-sub mt-1">
            Connect each account once. Facebook Page tokens don't expire; TikTok
            and YouTube do, and the portal warns you before they lapse.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateBrand}
            className="btn-outline"
          >
            + Create Brand
          </button>
          <button
            onClick={() => navigate("/channels/add")}
            className="btn-primary"
          >
            + Add Platform
          </button>
        </div>
      </div>

      {/* Brand tabs — "3/6" = connected / total for that brand */}
      <div className="mb-4 border-b border-ink-200/80" role="tablist" aria-label="Brands">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {[{ slug: "all", name: "All brands" }, ...brands].map((b) => {
            const own = b.slug === "all" ? channels : channels.filter((c) => c.b === b.slug);
            const live = own.filter((c) => c.s !== "off").length;
            const active = currentTab === b.slug;
            return (
              <button
                key={b.slug}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(b.slug)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                  active ? "border-brand text-brand" : "border-transparent text-ink-500 hover:text-ink-800"
                }`}
              >
                {b.slug !== "all" && (
                  <span className="h-2 w-2 rounded-full" style={{ background: colorForBrand(b.slug) }} aria-hidden="true" />
                )}
                {b.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${active ? "bg-brand-soft text-brand" : "bg-ink-100 text-ink-500"}`}>
                  {live}/{own.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {[
          ["all", "All", counts.all],
          ["connected", "Connected", counts.connected],
          ["off", "Not connected", counts.off],
        ].map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={show === id}
            onClick={() => setShow(id)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${
              show === id ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {id !== "all" && (
              <span className={`h-2 w-2 rounded-full ${id === "connected" ? "bg-emerald-500" : "bg-ink-300"}`} aria-hidden="true" />
            )}
            {label}
            <span className={show === id ? "text-white/70" : "text-ink-400"}>{n}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shownBrands.map((b) => {
          const all = channels.filter((c) => c.b === b.slug);
          const rows = all.filter(matches);
          // In "All brands", hide a brand with nothing matching the status filter.
          if (currentTab === "all" && show !== "all" && !rows.length) return null;
          const color = colorForBrand(b.slug);
          return (
            <div
              key={b.id}
              className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150"
            >
              <header
                className="px-4 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-100"
                style={{ background: `${color}08` }}
              >
                <span
                  className="w-2.5 h-2.5 flex-none rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}30` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink-800" style={{ color }}>
                    {b.name}
                  </div>
                  {(b.lang || b.note) && (
                    <div className="text-[11.5px] text-ink-600">{[b.lang, b.note].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Tag variant="idle">
                    {all.filter((c) => c.s !== "off").length}/{all.length} connected
                  </Tag>
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/channels/add", {
                        state: { brandSlug: b.slug },
                      })
                    }
                    className="rounded-lg border border-brand/20 px-2 py-1 text-[10.5px] font-semibold text-brand hover:bg-brand/5"
                  >
                    + Add platform
                  </button>
                </div>
              </header>
              {!rows.length && (
                <div className="px-4 py-8 text-center text-[12.5px] text-ink-400">
                  {show === "connected"
                    ? "No connected channels for this brand yet."
                    : show === "off"
                      ? "Every channel for this brand is connected."
                      : "No channels yet — add a platform to get started."}
                </div>
              )}
              {rows.map((c) => {
                const detail = [c.h, c.m].filter(Boolean).join(" · ");
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 border-t border-ink-100 first:border-t-0">
                    <PlatformTile platform={c.p} dim={c.s === "off"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-semibold text-ink-900">{PLAT[c.p]?.name || c.p}</span>
                        {c.s === "live" && <Tag variant="ok">Connected</Tag>}
                        {c.s === "soon" && <Tag variant="warn">Reconnect soon</Tag>}
                        {c.s === "off" && <Tag variant="idle">Not connected</Tag>}
                      </div>
                      {detail && (
                        <div className="truncate text-[12px] text-ink-600" title={detail}>
                          {detail}
                        </div>
                      )}
                      <div className="text-[11px] text-ink-400">Last post: {lastPost(c.l)}</div>
                    </div>
                    <div className="flex-none">
                      {c.s === "off" ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate("/channels/add", {
                              state: { brandSlug: c.b, platformSlug: c.p },
                            })
                          }
                          className="px-3 py-1.5 rounded-xl border border-brand-line bg-white text-brand text-[11.5px] font-semibold hover:bg-brand-soft transition-all duration-150"
                        >
                          Connect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => askDisconnect(c)}
                          className="px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11.5px] font-semibold hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {confirming &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-4 animate-fadein"
            onClick={() => !disconnecting && setConfirming(null)}
          >
            <div
              className="w-full max-w-[420px] rounded-3xl glass-panel p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-[14px] font-bold text-ink-800">
                <span style={{ color: PLATFORM_COLORS[confirming.p] || undefined }}>
                  <PlatformIcon platform={confirming.p} />
                </span>
                Disconnect {PLAT[confirming.p]?.name || confirming.p}?
              </div>
              <p className="mt-2 text-[12px] text-ink-600 leading-relaxed">
                <span className="font-semibold text-ink-800">{confirming.h}</span> will stop
                receiving posts and its saved login is removed from the portal. Posts
                already published stay where they are. You can connect it again any time.
              </p>
              <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] text-ink-700">
                {pending === null
                  ? "Checking queued posts…"
                  : pending === 0
                    ? "No posts are queued for this channel."
                    : `${pending} queued post${pending === 1 ? "" : "s"} for this channel will be cancelled.`}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={() => setConfirming(null)}
                  className="btn-ghost px-3.5 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={disconnecting || pending === null}
                  onClick={disconnect}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-all duration-150"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — the tab just won't be remembered */
  }
}

// "3 days ago" / "12 Aug 2026" instead of a raw ISO timestamp.
function lastPost(value) {
  if (!value || value === "—") return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.round(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The platform's logo in its own brand colour, on a light tint of that
 *  colour. Not-connected channels are shown faded so live ones stand out. */
function PlatformTile({ platform, dim }) {
  const color = PLATFORM_COLORS[platform] || "#64748b";
  return (
    <span
      className={`grid h-10 w-10 flex-none place-items-center rounded-xl ring-1 transition-opacity ${dim ? "opacity-60" : ""}`}
      style={{ color, background: `${color}14`, "--tw-ring-color": `${color}26` }}
      title={dim ? "Not connected" : "Connected"}
    >
      <PlatformIcon platform={platform} />
    </span>
  );
}

function PlatformIcon({ platform }) {
  const icons = {
    facebook: SiFacebook,
    instagram: SiInstagram,
    linkedin: FaLinkedin,
    telegram: SiTelegram,
    tiktok: SiTiktok,
    youtube: SiYoutube,
  };
  const Icon = icons[platform] || FiGrid;
  return <Icon size={16} aria-hidden="true" />;
}
