import { useEffect } from "react";
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
import Tag from "../components/ui/Tag";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { useStore } from "../store";
import { openCreateBrand } from "../components/layout/CreateBrandDrawer";

export default function ChannelsPage() {
  const { brands, channels, refreshChannels, showToast } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
                  <div>
                    {c.s === "live" && <Tag variant="ok">Connected</Tag>}
                    {c.s === "soon" && <Tag variant="warn">Reconnect soon</Tag>}
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
