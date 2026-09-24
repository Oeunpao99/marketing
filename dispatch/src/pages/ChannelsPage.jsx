import { useEffect, useState } from "react";
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

export default function ChannelsPage() {
  const { brands, channels, refreshChannels, showToast } = useStore();
  const navigate = useNavigate();
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

      <div className="space-y-4">
        {brands.map((b) => {
          const rows = channels.filter((c) => c.b === b.slug);
          const color = colorForBrand(b.slug);
          return (
            <div
              key={b.id}
              className="bg-white border border-ink-100 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-150"
            >
              <header
                className="px-4 py-3.5 flex items-center gap-3 border-b border-ink-100"
                style={{ background: `${color}08` }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}30` }}
                />
                <div className="flex-1">
                  <div className="font-bold text-ink-800" style={{ color }}>
                    {b.name}
                  </div>
                  <div className="text-[11.5px] text-ink-600">
                    {b.lang} · {b.note}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tag variant="idle">{rows.length} channels</Tag>
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
              {rows.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[140px_1fr_auto] gap-4 items-center px-4 py-3 border-t border-ink-100 first:border-t-0"
                >
                  <div className="flex items-center gap-2 font-bold text-ink-800 text-[12.5px]">
                    <PlatformIcon platform={c.p} />
                    {PLAT[c.p]?.name || c.p}
                  </div>
                  <div className="text-[12px] text-ink-700">
                    {c.h}
                    {" · "}
                    {c.m}
                    <div className="text-[11px] text-ink-600">
                      Last post: {c.l}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.s === "live" && <Tag variant="ok">Connected</Tag>}
                    {c.s === "soon" && <Tag variant="warn">Reconnect soon</Tag>}
                    {(c.s === "live" || c.s === "soon") && (
                      <button
                        type="button"
                        onClick={() => askDisconnect(c)}
                        className="px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11.5px] font-semibold hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
                      >
                        Disconnect
                      </button>
                    )}
                    {c.s === "off" && (
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
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {confirming &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] grid place-items-center bg-ink-950/40 p-4"
            onClick={() => !disconnecting && setConfirming(null)}
          >
            <div
              className="w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-[14px] font-bold text-ink-800">
                <PlatformIcon platform={confirming.p} />
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
