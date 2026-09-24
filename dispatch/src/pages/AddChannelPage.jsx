import { useEffect, useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiTiktok,
  SiYoutube,
} from "react-icons/si";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import Tag from "../components/ui/Tag";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { useStore } from "../store";

/** Strip t.me / telegram.me URLs and a leading @, keep numeric -100… ids as-is. */
function normalizeChatId(raw) {
  let s = (raw || "").trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^(?:t|telegram)\.me\//i, "");
  s = s.split(/[/?#]/)[0].replace(/^@/, "");
  if (!s) return "";
  return /^-?\d+$/.test(s) ? s : `@${s}`;
}

const PLATFORM_META = {
  facebook: {
    color: "#1877F2",
    Icon: SiFacebook,
    label: "Facebook Pages",
    desc: "Log into Facebook and pick a Page — this one publishes for real.",
    live: true,
    oauth: "meta",
  },
  tiktok: {
    color: "#000000",
    Icon: SiTiktok,
    label: "TikTok",
    desc: "Log into TikTok and approve the app — this one publishes for real.",
    live: true,
    oauth: "tiktok",
  },
  youtube: {
    color: "#FF0000",
    Icon: SiYoutube,
    label: "YouTube",
    desc: "Connect a YouTube channel to post Shorts automatically.",
  },
  instagram: {
    color: "#E4405F",
    Icon: SiInstagram,
    label: "Instagram",
    desc: "Log into Facebook and pick the Page linked to your Instagram — this one publishes for real.",
    live: true,
    oauth: "meta",
  },
  telegram: {
    color: "#26A5E4",
    Icon: SiTelegram,
    label: "Telegram",
    desc: "Post to a Telegram channel with a bot. This one publishes for real.",
    live: true,
    fields: [
      {
        key: "bot_token",
        label: "Bot token",
        placeholder: "8123456789:AAF…",
        hint: "From @BotFather. The bot must be an admin of your channel.",
      },
      {
        key: "chat_id",
        label: "Channel",
        placeholder: "@my_channel  or  -1001234567890",
        hint: "Public channel @username, or the numeric id for a private one.",
      },
    ],
  },
  linkedin: {
    color: "#0A66C2",
    Icon: FaLinkedin,
    label: "LinkedIn",
    desc: "Log into LinkedIn and approve the app — posts to your own feed for real.",
    live: true,
    oauth: "linkedin",
  },
};

export default function AddChannelPage() {
  const { brands, channels, setChannels, showToast } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(
    location.state?.brandSlug || null,
  );
  const [step, setStep] = useState("pick"); // pick | connect | credentials | success
  const [creds, setCreds] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(null); // { name, bot, brandName }

  const meta = selectedPlatform ? PLATFORM_META[selectedPlatform] : null;

  const resetFlow = () => {
    setSelectedPlatform(null);
    setSelectedBrand(null);
    setCreds({});
    setError(null);
    setConnected(null);
    setPending(null);
    setStep("pick");
  };

  /* ---- persist non-Telegram connections in the backend ---- */
  const connectMock = async (brandId, platformId = selectedPlatform) => {
    const platform = PLAT[platformId];
    const brand = brands.find((b) => b.slug === brandId);
    try {
      const platforms = await api.get("/platforms");
      const backendPlatform = platforms.find((p) => p.slug === platformId);
      if (!brand || !backendPlatform)
        throw new Error("Brand or platform is unavailable.");
      const existing = channels.find(
        (channel) => channel.b === brand.slug && channel.p === platformId,
      );
      const saved = existing
        ? await api.patch(`/channels/${existing.id}`, {
            handle: brand.name,
            status: "live",
            token_note: "Connected",
          })
        : await api.post("/channels", {
            brand_id: brand.id,
            platform_id: backendPlatform.id,
            handle: brand.name,
            status: "live",
            token_note: "Connected",
          });
      setChannels((prev) => [
        ...prev.filter((channel) => channel.id !== saved.id),
        {
          id: saved.id,
          b: brand.slug,
          brandId: brand.id,
          p: platformId,
          h: saved.handle,
          s: saved.status,
          m: saved.token_note,
          l: "—",
        },
      ]);
      showToast(`${platform.name} connected for ${brand.name}`);
      setSelectedPlatform(platformId);
      setSelectedBrand(brandId);
      setStep("success");
    } catch (e) {
      setError(e.message);
    }
  };

  /* ---- real connect (Telegram → backend) ---- */
  const connectTelegram = async () => {
    setBusy(true);
    setError(null);
    try {
      const botToken = (creds.bot_token || "").trim();
      const chatId = normalizeChatId(creds.chat_id);
      if (!botToken || !chatId)
        throw new Error("Enter both the bot token and the channel.");

      // brand slug -> backend id, and the existing (seeded) Telegram channel if any
      const groups = await api.get("/views/channels");
      const group = groups.find((g) => g.slug === selectedBrand);
      if (!group)
        throw new Error(`Brand "${selectedBrand}" not found on the server.`);
      const existing = group.channels.find(
        (c) => c.platform_slug === "telegram",
      );

      const config = { bot_token: botToken, chat_id: chatId };
      const res = existing
        ? await api.post(`/views/channels/${existing.id}/connect`, {
            handle: chatId,
            config,
          })
        : await api.post("/views/channels", {
            brand_id: group.id,
            platform_slug: "telegram",
            handle: chatId,
            config,
          });

      // Telegram verified these server-side — use the real channel name.
      const v = res?.verified || {};
      const displayName = v.chat_title || chatId;
      const note = v.bot_username ? `Bot @${v.bot_username}` : "Bot connected";
      setConnected({
        name: displayName,
        bot: v.bot_username,
        brandName: group.name,
      });

      // reflect it in the local list too
      setChannels((prev) => {
        const without = prev.filter(
          (c) => !(c.b === selectedBrand && c.p === "telegram"),
        );
        return [
          ...without,
          {
            id: `${selectedBrand}-telegram`,
            b: selectedBrand,
            p: "telegram",
            h: displayName,
            s: "live",
            m: note,
            l: "—",
          },
        ];
      });
      showToast(`${displayName} connected for ${group.name}`);
      setStep("success");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /* ---- real connect (TikTok OAuth → backend → tiktok.com) ---- */
  const connectTikTok = async (brandId) => {
    setBusy(true);
    setError(null);
    try {
      const brand = brands.find((b) => b.slug === brandId);
      if (!brand) throw new Error("Brand not found.");
      const res = await api.get(`/views/oauth/tiktok/start?brand_id=${brand.id}`);
      if (!res?.url) throw new Error("TikTok did not return a connect link.");
      // Full-page navigation to tiktok.com's consent screen — this component
      // unmounts here; the callback lands the user back on /channels.
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  /* ---- real connect (LinkedIn OAuth → backend → linkedin.com) ---- */
  const connectLinkedIn = async (brandId) => {
    setBusy(true);
    setError(null);
    try {
      const brand = brands.find((b) => b.slug === brandId);
      if (!brand) throw new Error("Brand not found.");
      const res = await api.get(`/views/oauth/linkedin/start?brand_id=${brand.id}`);
      if (!res?.url) throw new Error("LinkedIn did not return a connect link.");
      // Full-page navigation to linkedin.com's consent screen — this
      // component unmounts here; the callback lands the user back on /channels.
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  /* ---- real connect (Facebook/Instagram OAuth → backend → facebook.com) ---- */
  const connectMeta = async (brandId, intent) => {
    setBusy(true);
    setError(null);
    try {
      const brand = brands.find((b) => b.slug === brandId);
      if (!brand) throw new Error("Brand not found.");
      const res = await api.get(
        `/views/oauth/meta/start?brand_id=${brand.id}&intent=${intent}`,
      );
      if (!res?.url) throw new Error("Facebook did not return a connect link.");
      // Full-page navigation to facebook.com's consent screen — this
      // component unmounts here; the callback lands back on this same page
      // with a Page to pick from (?meta_pending=…), or on /channels on error.
      window.location.href = res.url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const chooseBrand = (brandId) => {
    setSelectedBrand(brandId);
    if (meta?.oauth === "tiktok") {
      connectTikTok(brandId);
    } else if (meta?.oauth === "meta") {
      connectMeta(brandId, selectedPlatform);
    } else if (meta?.oauth === "linkedin") {
      connectLinkedIn(brandId);
    } else if (meta?.fields) {
      setError(null);
      setStep("credentials");
    } else {
      connectMock(brandId);
    }
  };

  // Deep link from a specific row's "Connect" button on the Channels page
  // (brand + platform already known) — skip straight past both picker steps.
  useEffect(() => {
    const { brandSlug, platformSlug } = location.state || {};
    if (!brandSlug || !platformSlug) return;
    const platformMeta = PLATFORM_META[platformSlug];
    if (!platformMeta) return;
    setSelectedPlatform(platformSlug);
    setSelectedBrand(brandSlug);
    if (platformMeta.oauth === "tiktok") connectTikTok(brandSlug);
    else if (platformMeta.oauth === "meta") connectMeta(brandSlug, platformSlug);
    else if (platformMeta.oauth === "linkedin") connectLinkedIn(brandSlug);
    else if (platformMeta.fields) setStep("credentials");
    else connectMock(brandSlug, platformSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- returning from facebook.com with a Page list to pick from ---- */
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState(null); // { id, brand_name, intent, pages }
  const [pendingLoading, setPendingLoading] = useState(false);

  useEffect(() => {
    const pendingId = searchParams.get("meta_pending");
    if (!pendingId) return;
    setPendingLoading(true);
    api
      .get(`/views/oauth/meta/pending/${pendingId}`)
      .then((rec) => {
        setPending({ id: pendingId, ...rec });
        setStep("meta-pages");
      })
      .catch((e) => setError(e.message))
      .finally(() => setPendingLoading(false));
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmMetaPage = async (pageId, connectFacebook, connectInstagram) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/views/oauth/meta/pending/${pending.id}/confirm`, {
        page_id: pageId,
        connect_facebook: connectFacebook,
        connect_instagram: connectInstagram,
      });
      showToast(
        `${res.connected.map((p) => (p === "facebook" ? "Facebook" : "Instagram")).join(" + ")} connected for ${pending.brand_name}`,
      );
      navigate("/channels");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  /* ═══════════ SUCCESS ═══════════ */
  if (step === "success") {
    return (
      <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-4 shadow-glow-lg">
            <span className="text-2xl text-white">✓</span>
          </div>
          <h1 className="font-display text-3xl text-ink-900 mb-2">
            Connected!
          </h1>
          {connected?.name ? (
            <p className="text-ink-500 mb-6 text-[14px]">
              <b className="text-ink-800">{connected.name}</b> is now linked to{" "}
              {connected.brandName ||
                brands.find((b) => b.slug === selectedBrand)?.name}
              {connected.bot && (
                <>
                  {" "}
                  via{" "}
                  <span className="font-mono text-[12px]">
                    @{connected.bot}
                  </span>
                </>
              )}
              .
              {meta?.live &&
                " Posts scheduled to it will be published for real."}
            </p>
          ) : (
            <p className="text-ink-500 mb-6 text-[14px]">
              {PLAT[selectedPlatform].name} is now linked to{" "}
              {brands.find((b) => b.slug === selectedBrand)?.name}.
              {meta?.live &&
                " Posts scheduled to this channel will be published for real."}
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={resetFlow}
              className="btn-outline"
            >
              Add another
            </button>
            <button
              onClick={() => navigate("/channels")}
              className="btn-primary"
            >
              Back to Channels
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ PICK A PAGE (Facebook/Instagram) ═══════════ */
  if (step === "meta-pages") {
    return (
      <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
        <button
          onClick={resetFlow}
          className="text-sm text-ink-500 hover:text-ink-700 mb-4 transition-all duration-150"
        >
          ← Back to platforms
        </button>

        <div className="mb-6">
          <h1 className="page-title">
            Pick a <em className="italic text-brand">Page</em>
          </h1>
          <p className="page-sub mt-1">
            {pending && (
              <>
                For <b className="text-ink-700">{pending.brand_name}</b>. Facebook returned every
                Page you manage — pick the one this brand posts as.
              </>
            )}
          </p>
        </div>

        {pendingLoading ? (
          <div className="space-y-3 max-w-lg">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="h-3 w-40 rounded skeleton" />
                <div className="h-3 w-56 rounded skeleton" />
              </div>
            ))}
          </div>
        ) : !pending?.pages?.length ? (
          <div className="card px-5 py-10 text-center text-ink-400 text-[12px]">
            No Pages to show.
          </div>
        ) : (
          <div className="space-y-3 max-w-lg">
            {pending.pages.map((p) => (
              <MetaPageRow
                key={p.id}
                page={p}
                defaultIntent={pending.intent}
                busy={busy}
                onConnect={confirmMetaPage}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 max-w-lg bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ═══════════ CREDENTIALS (Telegram) ═══════════ */
  if (step === "credentials" && meta?.fields) {
    const brand = brands.find((b) => b.slug === selectedBrand);
    return (
      <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
        <button
          onClick={() => {
            setStep("connect");
            setError(null);
          }}
          className="text-sm text-ink-500 hover:text-ink-700 mb-4 transition-all duration-150"
        >
          ← Back
        </button>

        <div className="mb-6">
          <h1 className="page-title">
            Connect <em className="italic text-brand">{meta.label}</em>
          </h1>
          <p className="page-sub mt-1">
            For <b className="text-ink-700">{brand?.name}</b>. Create a bot with{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline"
            >
              @BotFather
            </a>
            , add it as an <b>administrator</b> of your channel, then paste its
            token below.
          </p>
        </div>

        <div className="space-y-4 max-w-lg">
          {meta.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="block font-semibold text-[11.5px] text-ink-800 mb-1">
                {f.label}
              </span>
              <span className="block text-[11px] text-ink-400 mb-1.5 leading-snug">
                {f.hint}
              </span>
              <input
                type={f.key === "bot_token" ? "password" : "text"}
                autoComplete="off"
                value={creds[f.key] || ""}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setCreds((c) => ({ ...c, [f.key]: e.target.value }))
                }
                className="input font-mono"
              />
            </label>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={connectTelegram}
              className="btn-primary"
            >
              {busy ? "Connecting…" : "Connect channel"}
            </button>
            <span className="text-[11px] text-ink-400">
              The bot token is stored server-side and never shown again.
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ PICK BRAND ═══════════ */
  if (step === "connect" && selectedPlatform) {
    const connectedForBrand = (brandId) =>
      channels.some((c) => c.b === brandId && c.p === selectedPlatform);

    return (
      <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
        <button
          onClick={() => setStep("pick")}
          className="text-sm text-ink-500 hover:text-ink-700 mb-4 transition-all duration-150"
        >
          ← Back to platforms
        </button>

        <div className="mb-6">
          <h1 className="page-title">
            Connect <em className="italic text-brand">{meta.label}</em>
          </h1>
          <p className="page-sub mt-1">
            {meta.desc}
          </p>
        </div>

        <div className="space-y-3 max-w-lg">
          <p className="text-[11.5px] font-bold text-ink-400 uppercase tracking-wide">
            Choose a brand
          </p>
          {brands.map((b) => {
            const isConnected = connectedForBrand(b.slug);
            const color = colorForBrand(b.slug);
            return (
              <button
                key={b.id}
                disabled={isConnected || busy}
                onClick={() => chooseBrand(b.slug)}
                className={`w-full text-left p-4 rounded-2xl border transition-all duration-150 ${
                  isConnected || busy
                    ? "border-ink-200 bg-ink-50 opacity-60 cursor-not-allowed"
                    : "border-ink-100 bg-white hover:border-brand hover:shadow-card cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-none"
                    style={{
                      background: color,
                      boxShadow: `0 0 8px ${color}30`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-800 text-sm">
                      {b.name}
                    </div>
                    <div className="text-[11.5px] text-ink-400">{b.lang}</div>
                  </div>
                  {isConnected ? (
                    <Tag variant="ok">Connected</Tag>
                  ) : (
                    <span className="text-[11.5px] text-brand font-semibold">
                      {busy
                        ? `Redirecting to ${meta.label}…`
                        : meta.fields
                          ? "Set up →"
                          : "Connect →"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════ PICK PLATFORM ═══════════ */
  const choosePlatform = (id, m) => {
    setSelectedPlatform(id);
    setCreds({});
    setError(null);
    if (!selectedBrand) return setStep("connect");
    if (m.oauth === "tiktok") connectTikTok(selectedBrand);
    else if (m.oauth === "meta") connectMeta(selectedBrand, id);
    else if (m.oauth === "linkedin") connectLinkedIn(selectedBrand);
    else if (m.fields) setStep("credentials");
    else connectMock(selectedBrand, id);
  };

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">Add a platform</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            {selectedBrand ? (
              <>
                Connecting to{" "}
                <span className="font-semibold text-ink-900">
                  {brands.find((b) => b.slug === selectedBrand)?.name}
                </span>{" "}
                — pick a platform.
              </>
            ) : (
              "Pick a platform, then choose which brand it belongs to."
            )}
          </p>
        </div>
        <button type="button" onClick={() => navigate("/channels")} className="btn-outline">
          Back to Platforms
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(PLATFORM_META).map(([id, m]) => {
          // Only channels that are actually connected — every brand has an
          // "off" placeholder row per platform, which isn't a connection.
          const liveBrands = brands.filter((b) =>
            channels.some((c) => c.b === b.slug && c.p === id && c.s === "live"),
          );
          const connectedHere =
            selectedBrand && liveBrands.some((b) => b.slug === selectedBrand);
          const desc = m.desc.replace(/\s*[—-]\s*this one publishes for real\.?/i, ".").replace(/\.\.$/, ".");
          return (
            <button
              key={id}
              type="button"
              onClick={() => choosePlatform(id, m)}
              className="group bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 text-left flex flex-col hover:border-brand-line hover:shadow-card transition-all duration-150"
            >
              <div className="flex items-start gap-3">
                <span
                  className="w-11 h-11 rounded-xl grid place-items-center text-white flex-none"
                  style={{ background: m.color }}
                >
                  <m.Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink-900">{m.label}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${m.live ? "bg-emerald-500" : "bg-ink-300"}`} />
                    {m.live ? "Publishes for real" : "Coming soon — simulated only"}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[12.5px] text-ink-600 leading-relaxed flex-1">{desc}</p>

              <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 truncate">
                  {liveBrands.length === 0
                    ? "Not connected yet"
                    : `Connected · ${liveBrands.map((b) => b.name).join(", ")}`}
                </span>
                <span className="text-[12px] font-semibold text-brand whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
                  {connectedHere ? "Reconnect →" : "Connect →"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One Facebook Page in the "pick a Page" step — its own Facebook / Instagram
 * checkboxes (Instagram only offered when that Page has one linked), and its
 * own "Connect" button so picking one Page doesn't block the others. */
function MetaPageRow({ page, defaultIntent, busy, onConnect }) {
  const [fb, setFb] = useState(defaultIntent !== "instagram");
  const [ig, setIg] = useState(page.has_instagram && defaultIntent !== "facebook");

  return (
    <div className="bg-white border border-ink-100 rounded-2xl p-4">
      <div className="font-semibold text-ink-800 text-sm">{page.name}</div>
      <div className="mt-2.5 space-y-1.5">
        <label className="flex items-center gap-2 text-[12px] text-ink-700">
          <input type="checkbox" checked={fb} onChange={(e) => setFb(e.target.checked)} />
          Connect Facebook
        </label>
        {page.has_instagram ? (
          <label className="flex items-center gap-2 text-[12px] text-ink-700">
            <input type="checkbox" checked={ig} onChange={(e) => setIg(e.target.checked)} />
            Connect Instagram <span className="text-ink-400">@{page.instagram_username}</span>
          </label>
        ) : (
          <div className="text-[11px] text-ink-400">No Instagram account linked to this Page.</div>
        )}
      </div>
      <button
        type="button"
        disabled={busy || (!fb && !ig)}
        onClick={() => onConnect(page.id, fb, ig)}
        className="btn-primary text-[11.5px]"
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}
