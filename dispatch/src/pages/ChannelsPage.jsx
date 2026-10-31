import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaLinkedin } from "react-icons/fa";
import { FiEdit3, FiGrid, FiList, FiPackage, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from "react-icons/si";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";
import AutopilotCard from "../components/setup/AutopilotCard";
import AddChannelPage from "./AddChannelPage";
import { usePlanFeatures } from "../lib/planFeatures";
import BrandJourney from "../components/setup/BrandJourney";
import Tag from "../components/ui/Tag";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { useStore } from "../store";
import { openCreateBrand } from "../components/layout/CreateBrandDrawer";
import { BrandBadge } from "../components/layout/Sidebar";
import { PLATFORM_COLORS } from "./InsightsPage";

export default function ChannelsPage() {
  const { brands, channels, refreshChannels, showToast, activeBrand, switchBrand } = useStore();
  const navigate = useNavigate();

  // The brand in the sidebar (the one brand switcher) or every brand, + a status
  // filter, so nobody scrolls through every brand's 6–7 platforms. Kept in
  // localStorage (not the url — this page's url params are the OAuth
  // "connected / failed" results, cleared on arrival).
  const [showAll, setShowAllState] = useState(() => readPref("channels_all") === "1");
  const [show, setShowState] = useState(() => readPref("channels_show") || "all");
  const setShowAll = (v) => (setShowAllState(v), writePref("channels_all", v ? "1" : ""));
  const setShow = (v) => (setShowState(v), writePref("channels_show", v));
  // the brands as a list (one row a channel) or a grid of channel tiles
  const [view, setViewState] = useState(() => (readPref("channels_view") === "grid" ? "grid" : "list"));
  const setView = (v) => (setViewState(v), writePref("channels_view", v));
  // "Add platform" / "Connect": the connect flow in a panel over this page — { brandSlug, platformSlug? }
  const [connectFor, setConnectFor] = useState(null);
  // the plan's channels per brand (app/plan_features.py): a full brand says so here, before any sign-in
  const features = usePlanFeatures();
  const tryConnect = (target) => {
    const live = channels.filter((c) => c.b === target.brandSlug && c.s !== "off").length;
    if (features?.channels != null && live >= features.channels)
      return showToast(`Your plan connects ${features.channels} channels per brand — disconnect one, or upgrade for more.`);
    setConnectFor(target);
  };
  const scopeBrand = brands.find((b) => b.slug === activeBrand) || brands[0];
  const currentTab = showAll || !scopeBrand ? "all" : scopeBrand.slug;
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

  // Delete a brand (owners / admins): a preview of what goes with it, and the
  // brand's name typed out before the button unlocks.
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";
  const [removing, setRemoving] = useState(null); // { brand, usage | null }
  const [typedName, setTypedName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const askDeleteBrand = async (b) => {
    setRemoving({ brand: b, usage: null });
    setTypedName("");
    try {
      const usage = await api.get(`/views/brands/${b.id}/delete-preview`);
      setRemoving((cur) => (cur?.brand.id === b.id ? { ...cur, usage } : cur));
    } catch (e) {
      showToast(`Could not check this brand — ${e.message}`);
      setRemoving(null);
    }
  };

  const deleteBrand = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    try {
      await api.del(`/views/brands/${removing.brand.id}`);
      await refreshChannels();
      showToast(`${removing.brand.name} deleted`);
      setRemoving(null);
    } catch (e) {
      showToast(`Could not delete — ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

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

  // Facebook / Instagram / TikTok: pull in posts made directly on the account (the
  // backend also does this on connect and every few hours for new ones).
  const [importing, setImporting] = useState(null);
  const importPosts = async (c) => {
    setImporting(c.id);
    try {
      const { imported, days } = await api.post(`/views/channels/${c.id}/import-posts`);
      showToast(
        imported
          ? `Imported ${imported} post${imported === 1 ? "" : "s"} from ${c.h} — see them in Analytics`
          : `No new posts from the last ${days} days — Analytics already has everything`,
      );
    } catch (e) {
      showToast(`Could not import — ${e.message}`);
    } finally {
      setImporting(null);
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

  // Lands here after Google's sign-in for YouTube.
  useEffect(() => {
    const yt = searchParams.get("youtube");
    if (!yt) return;
    if (yt === "connected") {
      showToast("YouTube connected — until Google approves the app, uploads stay Private");
      refreshChannels();
    } else {
      showToast(`YouTube connect failed — ${searchParams.get("message") || "try again"}`);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, showToast, refreshChannels]);

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
      {/* no page-wide "Connect a platform": each brand has its own add button, so it's clear which brand it's for */}
      <div className="mb-6">
        <h1 className="page-title">Channels</h1>
      </div>

      {/* until the brand is set up: the three steps, and what's next */}
      <BrandJourney compact here="platforms" className="mb-5" />

      {/* this brand's (the sidebar's) or every brand's · status filter */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
        <div className="mr-1.5 inline-flex min-w-0 rounded-xl bg-ink-100/70 p-1" role="group" aria-label="Which brand">
          {[
            // the brand switch counts brands — channels are counted by the All / Connected chips beside it
            [false, scopeBrand?.name || "This brand", null],
            [true, "All brands", brands.length],
          ].map(([all, label, n]) => (
            <button
              key={label}
              type="button"
              aria-pressed={showAll === all}
              onClick={() => setShowAll(all)}
              className={`flex max-w-[220px] items-center gap-1.5 rounded-lg px-3 py-1 text-[12.5px] font-semibold transition-colors duration-150 ${
                showAll === all ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
              }`}
            >
              {!all && scopeBrand && <span className="h-2 w-2 flex-none rounded-full" style={{ background: colorForBrand(scopeBrand.slug) }} aria-hidden="true" />}
              <span className="truncate">{label}</span>
              {n != null && <span className="tabular-nums text-ink-400">{n}</span>}
            </button>
          ))}
        </div>
        {[
          ["all", "All channels", counts.all],
          ["connected", "Connected", counts.connected],
          ["off", "Not connected", counts.off],
        ].map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={show === id}
            onClick={() => setShow(id)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${
              show === id ? "bg-ink-900 text-ink-50" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {id !== "all" && (
              <span className={`h-2 w-2 rounded-full ${id === "connected" ? "bg-emerald-500" : "bg-ink-300"}`} aria-hidden="true" />
            )}
            {label}
            <span className={show === id ? "text-white/70" : "text-ink-400"}>{n}</span>
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-xl bg-ink-100/70 p-1" role="group" aria-label="View">
          {[
            ["list", "List", FiList],
            ["grid", "Grid", FiGrid],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              title={`${label} view`}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors duration-150 ${
                view === id ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {currentTab !== "all" && <AutopilotCard brandSlug={currentTab} />}

      <div className="space-y-4">
        {shownBrands.map((b) => {
          const all = channels.filter((c) => c.b === b.slug);
          const rows = all.filter(matches);
          // In "All brands", hide a brand with nothing matching the status filter.
          if (currentTab === "all" && show !== "all" && !rows.length) return null;
          const live = all.filter((c) => c.s !== "off").length;
          // this brand made the sidebar's brand, then off to one of its pages
          const openFor = (to, state) => (switchBrand(b.slug), navigate(to, state ? { state } : undefined));
          if (view === "list") {
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
                  {/* its own logo (Brand kit), else its first letter in its colour */}
                  <BrandBadge brand={b} className="h-9 w-9 rounded-lg text-[14px]" />
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
                      {live}/{all.length} connected{features?.channels != null ? ` · ${features.channels} on your plan` : ""}
                    </Tag>
                    <button
                      type="button"
                      onClick={() => tryConnect({ brandSlug: b.slug })}
                      className="rounded-lg border border-brand/20 px-2 py-1 text-[10.5px] font-semibold text-brand hover:bg-brand/5"
                    >
                      + Add platform
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => askDeleteBrand(b)}
                        title={`Delete ${b.name}`}
                        aria-label={`Delete ${b.name}`}
                        className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-ink-200 text-ink-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    )}
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
                            onClick={() => tryConnect({ brandSlug: c.b, platformSlug: c.p })}
                            className="px-3 py-1.5 rounded-xl border border-brand-line bg-white text-brand text-[11.5px] font-semibold hover:bg-brand-soft transition-all duration-150"
                          >
                            Connect
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            {(c.p === "facebook" || c.p === "instagram" || c.p === "tiktok") && (
                              <button
                                type="button"
                                disabled={importing === c.id}
                                onClick={() => importPosts(c)}
                                title="Bring in posts made directly on this account in the last 90 days, so Analytics shows them too"
                                className="px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11.5px] font-semibold hover:border-brand-line hover:text-brand disabled:opacity-60 transition-all duration-150"
                              >
                                {importing === c.id ? "Importing…" : "Import past posts"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => askDisconnect(c)}
                              className="px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11.5px] font-semibold hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
                            >
                              Disconnect
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }
          return (
            <section key={b.id} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
              {/* the brand: its own logo (Brand kit), name, languages, how many channels are on — and what to do next */}
              <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <BrandBadge brand={b} className="h-12 w-12 rounded-xl text-[18px]" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[16px] font-bold text-ink-900">{b.name}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-500">
                    {(b.lang || b.note) && <span>{[b.lang, b.note].filter(Boolean).join(" · ")}</span>}
                    {(b.lang || b.note) && <span className="text-ink-300" aria-hidden="true">·</span>}
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${all.length ? (live / all.length) * 100 : 0}%` }} />
                      </span>
                      {all.length ? `${live} of ${all.length} channel${all.length === 1 ? "" : "s"} connected` : "No channels yet"}{features?.channels != null ? ` · ${features.channels} on your plan` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openFor("/new")} className="btn-primary px-3.5 py-1.5 text-[12px]">
                    <FiEdit3 size={13} className="mr-1.5 inline" aria-hidden="true" />
                    Make a post
                  </button>
                  <button
                    type="button"
                    onClick={() => openFor("/products")}
                    title="Logo, colours, products and prices — what the AI uses for this brand"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-brand-line hover:text-brand transition-all duration-150"
                  >
                    <FiPackage size={13} aria-hidden="true" />
                    Brand kit
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => askDeleteBrand(b)}
                      title={`Delete ${b.name}`}
                      aria-label={`Delete ${b.name}`}
                      className="grid h-[32px] w-[32px] place-items-center rounded-xl border border-ink-200 text-ink-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </div>
              </header>
              {/* its channels as tiles, and a tile to add another */}
              <div className="grid gap-3 border-t border-ink-100 bg-canvas p-4 sm:grid-cols-2 xl:grid-cols-3">
                {!rows.length && show !== "all" && (
                  <div className="col-span-full py-6 text-center text-[12.5px] text-ink-400">
                    {show === "connected" ? "No connected channels for this brand yet." : "Every channel for this brand is connected."}
                  </div>
                )}
                {rows.map((c) => (
                  <ChannelTile
                    key={c.id}
                    c={c}
                    importing={importing === c.id}
                    onImport={() => importPosts(c)}
                    onDisconnect={() => askDisconnect(c)}
                    onConnect={() => tryConnect({ brandSlug: c.b, platformSlug: c.p })}
                  />
                ))}
                {show !== "connected" && (
                  <button
                    type="button"
                    onClick={() => tryConnect({ brandSlug: b.slug })}
                    className="flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-200 bg-white/60 text-ink-500 hover:border-brand-line hover:bg-brand-soft hover:text-brand transition-all duration-150"
                  >
                    <FiPlus size={18} aria-hidden="true" />
                    <span className="text-[12.5px] font-semibold">Add a platform</span>
                    <span className="text-[11px] text-ink-400">Facebook, TikTok, YouTube, Telegram…</span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {connectFor &&
        createPortal(
          <div className="fixed inset-0 z-[95]">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 glass-overlay animate-fadein cursor-default"
              onClick={() => setConnectFor(null)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Add a platform"
              className="absolute right-0 top-0 flex h-full w-full max-w-[620px] flex-col glass-drawer animate-drawer-in"
            >
              <button
                type="button"
                onClick={() => setConnectFor(null)}
                className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* a new key per opening: the flow starts fresh each time */}
                <AddChannelPage
                  key={JSON.stringify(connectFor)}
                  embedded
                  initial={connectFor}
                  onClose={() => (setConnectFor(null), refreshChannels())}
                />
              </div>
            </aside>
          </div>,
          document.body,
        )}

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

      {removing &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] grid place-items-center glass-overlay p-4 animate-fadein"
            onClick={() => !deleting && setRemoving(null)}
          >
            <div
              className="w-full max-w-[440px] rounded-3xl glass-panel p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-[14px] font-bold text-ink-800">
                <FiTrash2 size={15} className="text-red-600" />
                Delete {removing.brand.name}?
              </div>
              <p className="mt-2 text-[12px] text-ink-600 leading-relaxed">
                This permanently removes the brand from Marketing ឆ្លាតវៃ. Posts already published on
                Facebook, TikTok and other platforms stay there — only Marketing ឆ្លាតវៃ’s copy goes.
                Images and videos stay in your Library.
              </p>
              <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5 text-[11.5px] text-ink-700">
                {removing.usage === null ? (
                  "Checking what belongs to this brand…"
                ) : (
                  <>
                    <div className="font-semibold text-ink-800 mb-1">Also deleted:</div>
                    <ul className="space-y-0.5">
                      <li>{removing.usage.channels} connected channel{removing.usage.channels === 1 ? "" : "s"} and their saved logins</li>
                      <li>{removing.usage.posts} post{removing.usage.posts === 1 ? "" : "s"} and their stats in Analytics</li>
                      <li>{removing.usage.drafts} idea{removing.usage.drafts === 1 ? "" : "s"}, {removing.usage.products} product{removing.usage.products === 1 ? "" : "s"}, its auto-generate settings and weekly plans</li>
                    </ul>
                    {removing.usage.queued > 0 && (
                      <div className="mt-1.5 font-semibold text-red-700">
                        {removing.usage.queued} scheduled post{removing.usage.queued === 1 ? "" : "s"} will never go out.
                      </div>
                    )}
                  </>
                )}
              </div>
              <label className="mt-4 block">
                <span className="block text-[11.5px] text-ink-600 mb-1.5">
                  Type <span className="font-semibold text-ink-900">{removing.brand.name}</span> to confirm
                </span>
                <input
                  autoFocus
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="input"
                  placeholder={removing.brand.name}
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setRemoving(null)}
                  className="btn-ghost px-3.5 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting || removing.usage === null || typedName.trim() !== removing.brand.name.trim()}
                  onClick={deleteBrand}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-all duration-150"
                >
                  {deleting ? "Deleting…" : "Delete brand"}
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

/** One channel as a tile: the platform, its status, the account, its last post, and its actions. */
function ChannelTile({ c, importing, onImport, onDisconnect, onConnect }) {
  const off = c.s === "off";
  const detail = [c.h, c.m].filter(Boolean).join(" · ");
  return (
    <div className={`flex min-h-[112px] flex-col rounded-xl border border-ink-100 bg-white p-3.5 transition-shadow duration-150 hover:shadow-card ${off ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-3">
        <PlatformTile platform={c.p} dim={off} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink-900">{PLAT[c.p]?.name || c.p}</span>
            {c.s === "live" && <Tag variant="ok">Connected</Tag>}
            {c.s === "soon" && <Tag variant="warn">Reconnect soon</Tag>}
            {off && <Tag variant="idle">Not connected</Tag>}
          </div>
          {detail && (
            <div className="mt-0.5 truncate text-[12px] text-ink-600" title={detail}>
              {detail}
            </div>
          )}
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="truncate text-[11px] text-ink-400">Last post: {lastPost(c.l)}</span>
        {off ? (
          <button
            type="button"
            onClick={onConnect}
            className="flex-none rounded-lg border border-brand-line bg-white px-3 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand-soft transition-all duration-150"
          >
            Connect
          </button>
        ) : (
          <div className="flex flex-none items-center gap-1">
            {(c.p === "facebook" || c.p === "instagram" || c.p === "tiktok") && (
              <button
                type="button"
                disabled={importing}
                onClick={onImport}
                title="Bring in posts made directly on this account in the last 90 days, so Analytics shows them too"
                className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-ink-600 hover:bg-ink-50 hover:text-brand disabled:opacity-60 transition-all duration-150"
              >
                {importing ? "Importing…" : "Import posts"}
              </button>
            )}
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-ink-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
