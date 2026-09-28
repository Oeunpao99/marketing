import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiEye,
  FiFileText,
  FiHash,
  FiHeart,
  FiInfo,
  FiLink,
  FiMaximize2,
  FiMessageCircle,
  FiPercent,
  FiShare2,
  FiType,
  FiZap,
} from "react-icons/fi";
import { api } from "../api/client";
import PlatformIcon, { PLAT_BRAND_CLASS } from "../components/ui/PlatformIcon";
import StatusBadge from "../components/today/StatusBadge";
import PostEditor from "../components/today/PostEditor";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { isKhmer, postTitle } from "../lib/format";
import { TZ } from "../lib/tz";
import { useStore } from "../store";

// One post from the Dashboard queue: the post itself, how it did (summed over
// its channels, and per channel), a quick check of the caption, and where it
// went. Numbers are the latest saved readings from GET /views/today — the same
// ones the queue shows — so nothing here calls a platform.

const card = "bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const URL_RE = /(https?:\/\/[^\s]+)/g; // split only — test with IS_URL
const IS_URL = /^https?:\/\//;
const ENG_KEYS = ["likes", "comments", "shares"];

const mediaSrc = (url) =>
  !url ? null : url.startsWith("http") ? url : `${window.location.port === "5173" ? "http://localhost:8000" : ""}${url}`;
const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString());
const fmtWhen = (iso, withYear = false) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      })
    : null;

// Target statuses from the API → the queue's own status words.
const targetStatus = (s) => (s === "posting" ? "sending" : s === "queued" ? "waiting" : s);
const platformOf = (t) => PLAT[(t.platform_slug || t.channel || "").toLowerCase()];

/** Caption text with links clickable and hashtags pulled out as chips. */
function CaptionBody({ text }) {
  const body = text.replace(HASHTAG_RE, "").replace(/[ \t]+\n/g, "\n").trim();
  return (
    <p className={`whitespace-pre-line text-[13.5px] leading-relaxed text-ink-800 ${isKhmer(body) ? "font-khmer" : ""}`}>
      {body.split(URL_RE).map((part, i) =>
        IS_URL.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-medium text-brand hover:underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** Plain checks a marketer would do before (or after) posting — each one
 *  says what's fine or what to change. */
function captionChecks(caption, platforms, hasMedia) {
  const cap = caption || "";
  const out = [];
  const firstLine = cap.split("\n").find((l) => l.trim())?.trim() || "";
  const tags = [...new Set(cap.match(HASHTAG_RE) || [])];
  const hasLink = /https?:\/\//.test(cap);

  if (!cap.trim()) return [{ ok: false, icon: FiType, title: "No caption", tip: "A short caption with a hook and a call to action helps the post get seen." }];

  out.push(
    firstLine.length <= 90
      ? { ok: true, icon: FiType, title: "Short, clear first line", tip: "It shows in full before “See more”, where people decide to stop scrolling." }
      : { ok: false, icon: FiType, title: `First line is ${firstLine.length} characters`, tip: "Feeds cut it off after about 80 — put the hook in the first few words." },
  );
  out.push(
    /[?？]/.test(cap)
      ? { ok: true, icon: FiMessageCircle, title: "Asks a question", tip: "Questions invite comments, which the platforms reward with reach." }
      : { ok: null, icon: FiMessageCircle, title: "No question to answer", tip: "Ending with a short question usually brings more comments." },
  );
  out.push(
    tags.length === 0
      ? { ok: null, icon: FiHash, title: "No hashtags", tip: "2–4 relevant tags help new people find it." }
      : tags.length > 6
        ? { ok: false, icon: FiHash, title: `${tags.length} hashtags`, tip: "That's a lot — 3–5 focused tags usually do better." }
        : { ok: true, icon: FiHash, title: `${tags.length} hashtag${tags.length === 1 ? "" : "s"}`, tip: "A focused set — good." },
  );
  if (hasLink) {
    out.push(
      platforms.includes("instagram")
        ? { ok: false, icon: FiLink, title: "Link in an Instagram caption", tip: "Instagram doesn't make caption links clickable — say “link in bio” instead." }
        : { ok: true, icon: FiLink, title: "Has a link", tip: "People can act straight away." },
    );
  }
  if (cap.length > 300 && !/\n\s*\n/.test(cap)) {
    out.push({ ok: false, icon: FiFileText, title: "One long block of text", tip: "Break it into short paragraphs — it reads much easier on a phone." });
  }
  out.push(
    hasMedia
      ? { ok: true, icon: FiCheckCircle, title: "Has an image or video", tip: "Visual posts get far more reach than text-only ones." }
      : { ok: null, icon: FiCheckCircle, title: "Text only", tip: "Adding an image or short video usually lifts reach." },
  );
  for (const slug of platforms) {
    const p = PLAT[slug];
    if (p?.limit && cap.length > p.limit) {
      out.push({ ok: false, icon: FiAlertTriangle, title: `Too long for ${p.name}`, tip: `${cap.length.toLocaleString()} of ${p.limit.toLocaleString()} characters allowed.` });
    }
  }
  return out;
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
        <Icon size={12} className="text-ink-400" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-0.5 text-[22px] font-bold leading-tight tabular-nums text-ink-900">{value}</div>
      {hint && <div className="text-[11px] text-ink-400">{hint}</div>}
    </div>
  );
}

export default function PostDetailPage() {
  const { queue, refreshQueue, showToast } = useStore();
  const { index } = useParams();
  const navigate = useNavigate();
  const q = queue[Number(index)];
  const [targets, setTargets] = useState(null); // every channel this post went to
  const [zoom, setZoom] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // The url holds the post's place in the queue. Editing a time can move it,
  // so follow the post itself: if its place changed, point the url at it again.
  const pinned = useRef(null);
  useEffect(() => {
    if (q?.postId != null && pinned.current == null) pinned.current = q.postId;
  }, [q?.postId]);
  useEffect(() => {
    const id = pinned.current;
    if (id == null || q?.postId === id) return;
    const at = queue.findIndex((x) => x.postId === id);
    if (at !== -1) navigate(`/post/${at}`, { replace: true });
  }, [queue, q?.postId, navigate]);

  const afterEdit = async () => {
    setEditing(false);
    await refreshQueue();
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    if (!q) return;
    api
      .get("/views/today")
      .then((rows) => {
        const mine = rows.filter((r) =>
          q.postId != null
            ? r.post_id === q.postId
            : q.targetIds?.length
              ? q.targetIds.includes(r.id)
              : r.title === q.ttl && r.caption === q.cap,
        );
        setTargets(mine);
      })
      .catch(() => setTargets([]));
  }, [q?.postId, q?.ttl, q?.cap, reloadKey]);

  if (!q) {
    return (
      <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-[14px] font-semibold text-ink-700 mb-3">Post not found</div>
          <button type="button" onClick={() => navigate("/")} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const rows = targets || [];
  const first = rows[0];
  const src = mediaSrc(first?.video_url);
  const isImage = first?.media_kind ? first.media_kind === "image" : first?.video_filename ? /\.(jpe?g|png|gif|webp)$/i.test(first.video_filename) : false;
  const when = fmtWhen(q.scheduledFor, true) || "Not scheduled";
  const postedTarget = rows.find((t) => t.status === "posted");
  // Still waiting to go out on at least one channel → it can be edited.
  const canEdit = q.postId != null && rows.some((t) => t.status === "queued");
  const brandName = first?.brand_name || q.brandName || q.b;
  const title = postTitle(q.ttl, q.cap);
  const tags = [...new Set((q.cap || "").match(HASHTAG_RE) || [])];
  const platforms = [...new Set(rows.map((t) => t.platform_slug).filter(Boolean))];

  // Totals over every channel that reported numbers.
  const totals = { views: null, likes: null, comments: null, shares: null };
  for (const t of rows) {
    for (const k of Object.keys(totals)) {
      const v = t.metrics?.[k];
      if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
    }
  }
  const hasEngagement = ENG_KEYS.some((k) => totals[k] != null);
  const engagement = ENG_KEYS.reduce((s, k) => s + (totals[k] || 0), 0);
  const rate = totals.views ? (engagement / totals.views) * 100 : null;
  const posted = rows.some((t) => t.status === "posted");
  const onlyTelegram = platforms.length > 0 && platforms.every((p) => p === "telegram");
  const checks = captionChecks(q.cap, platforms, !!src);
  const passed = checks.filter((c) => c.ok === true).length;

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900">
          <FiArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn-outline" title="Change the caption, time or channels before it goes out">
              <FiEdit3 size={14} /> Edit post
            </button>
          )}
          {postedTarget && (
            <Link to={`/insights/${postedTarget.id}`} className="btn-primary">
              <FiBarChart2 size={14} /> Full analytics
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0 space-y-5">
          {editing ? (
            <section className={`${card} p-5`}>
              <PostEditor
                postId={q.postId}
                showToast={showToast}
                onDone={afterEdit}
                onCancelled={async () => {
                  await refreshQueue();
                  navigate("/");
                }}
              />
            </section>
          ) : (
            /* The post */
            <section className={`${card} p-5 flex flex-col md:flex-row gap-5`}>
              <button
                type="button"
                onClick={() => src && setZoom(true)}
                className="group relative flex-none w-full md:w-52 aspect-[4/5] md:aspect-auto md:h-64 rounded-xl overflow-hidden bg-ink-100 grid place-items-center"
                title={src ? "View full size" : ""}
              >
                {src && isImage ? (
                  <img src={src} alt="" className="w-full h-full object-cover" />
                ) : src ? (
                  <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <span className="text-center text-ink-400">
                    <FiFileText size={22} className="mx-auto mb-1" />
                    <span className="text-[11px]">Text only</span>
                  </span>
                )}
                {src && (
                  <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-night-900/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <FiMaximize2 size={13} />
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorForBrand(q.b) }} />
                  <span className="font-semibold text-ink-900">{brandName}</span>
                  {q.c.map((ch) => (
                    <span key={ch} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                      <PlatformIcon name={ch} className={PLAT_BRAND_CLASS[ch] || "text-ink-400"} />
                      {ch}
                    </span>
                  ))}
                  <span className="ml-auto">
                    <StatusBadge status={q.st === "queued" ? "waiting" : q.st} compact />
                  </span>
                </div>
                <h1 className={`mt-2.5 text-[17px] font-bold leading-snug tracking-tight text-ink-900 ${isKhmer(title) ? "font-khmer" : ""}`}>{title}</h1>
                <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                  {q.st === "posted" ? <FiClock size={12} /> : <FiCalendar size={12} />}
                  {q.st === "posted" ? "Posted" : q.st === "failed" ? "Failed ·" : "Scheduled for"} <b className="font-semibold text-ink-700">{when}</b>
                </div>

                <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
                  {q.cap ? <CaptionBody text={q.cap} /> : <span className="text-[13px] italic text-ink-400">No caption</span>}
                </div>
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t} className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-medium text-brand">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5 text-[11.5px] text-ink-400">
                  <span>{(q.cap || "").length.toLocaleString()} characters</span>
                  <span>{(q.cap || "").trim() ? (q.cap || "").trim().split(/\s+/).length.toLocaleString() : 0} words</span>
                  <span>
                    {tags.length} hashtag{tags.length === 1 ? "" : "s"}
                  </span>
                  <span>{isKhmer(q.cap) ? "Khmer" : "Latin"} script</span>
                </div>
              </div>
            </section>
          )}

          {/* How it did */}
          {posted && (
            <section className={card}>
              <div className="flex items-center justify-between gap-3 px-5 pt-4">
                <h2 className="text-[14.5px] font-semibold tracking-tight text-ink-900">How it did</h2>
                <span className="text-[11.5px] text-ink-400">
                  {platforms.length > 1 ? `all ${platforms.length} channels together` : "latest saved numbers"}
                </span>
              </div>
              {hasEngagement || totals.views != null ? (
                <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-ink-100 bg-ink-100 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat icon={FiEye} label="Views" value={fmt(totals.views)} />
                  <Stat icon={FiHeart} label="Likes" value={fmt(totals.likes)} />
                  <Stat icon={FiMessageCircle} label="Comments" value={fmt(totals.comments)} />
                  <Stat icon={FiShare2} label="Shares" value={fmt(totals.shares)} />
                  <Stat icon={FiZap} label="Engagement" value={hasEngagement ? fmt(engagement) : "—"} hint="likes + comments + shares" />
                  <Stat icon={FiPercent} label="Engagement rate" value={rate == null ? "—" : `${rate.toFixed(1)}%`} hint={rate == null ? "needs views" : "of people who saw it"} />
                </div>
              ) : (
                <p className="mx-5 mb-5 mt-3 flex items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
                  <FiInfo size={14} className="mt-0.5 flex-none text-ink-400" />
                  {onlyTelegram
                    ? "Telegram doesn't share per-post numbers with apps — open the channel to see views."
                    : "No numbers saved yet — they're collected every few hours. Open Full analytics to fetch them now."}
                </p>
              )}
            </section>
          )}

          {/* Caption check */}
          {!editing && (
            <section className={`${card} p-5`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[14.5px] font-semibold tracking-tight text-ink-900">Caption check</h2>
                <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-600">
                  {passed} of {checks.length} good
                </span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {checks.map((c, i) => {
                  const tone = c.ok === true ? "bg-emerald-50 text-emerald-700" : c.ok === false ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700";
                  const word = c.ok === true ? "Good" : c.ok === false ? "Fix" : "Tip";
                  return (
                    <li key={i} className="flex items-start gap-3 rounded-xl bg-ink-50/60 px-3 py-2.5">
                      <span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${tone}`} title={word}>
                        <c.icon size={13} aria-label={word} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-ink-800">{c.title}</div>
                        <div className="text-[11.5px] leading-snug text-ink-500">{c.tip}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {/* Where it went */}
        <div className="space-y-4 xl:sticky xl:top-20">
          <section className={`${card} overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-ink-100 flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold text-ink-900">Channels</h2>
              <span className="text-[12px] text-ink-500">
                {q.c.length} channel{q.c.length === 1 ? "" : "s"}
              </span>
            </div>
            {targets === null ? (
              <div className="p-5 space-y-3">
                <div className="h-4 w-1/2 rounded skeleton" />
                <div className="h-4 w-1/3 rounded skeleton" />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {(rows.length ? rows : q.c.map((c, i) => ({ id: i, channel: c, status: q.st }))).map((t) => {
                  const plat = platformOf(t);
                  const name = plat?.name || t.channel || "";
                  const m = t.metrics || {};
                  const eng = ENG_KEYS.some((k) => typeof m[k] === "number") ? ENG_KEYS.reduce((s, k) => s + (m[k] || 0), 0) : null;
                  const at = t.status === "posted" ? fmtWhen(t.published_at || t.scheduled_for) : fmtWhen(t.scheduled_for);
                  return (
                    <li key={t.id} className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className="w-9 h-9 rounded-xl bg-ink-50 border border-ink-100 grid place-items-center flex-none">
                          <PlatformIcon name={name} className={PLAT_BRAND_CLASS[name] || "text-ink-600"} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-ink-900">{name}</span>
                            <StatusBadge status={targetStatus(t.status)} compact />
                          </div>
                          <div className="text-[11.5px] text-ink-500">
                            {plat?.as || "Post"}
                            {at ? ` · ${t.status === "posted" ? "" : "for "}${at}` : ""}
                          </div>
                          {t.error && t.status === "failed" && <div className="mt-1 text-[11.5px] leading-snug text-red-600">{t.error}</div>}
                          {t.status === "posted" && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-600">
                              {eng != null || m.views != null ? (
                                <>
                                  {m.views != null && (
                                    <span className="inline-flex items-center gap-1">
                                      <FiEye size={11} className="text-ink-400" /> <b className="font-semibold text-ink-800">{fmt(m.views)}</b>
                                    </span>
                                  )}
                                  {eng != null && (
                                    <span className="inline-flex items-center gap-1">
                                      <FiZap size={11} className="text-ink-400" /> <b className="font-semibold text-ink-800">{fmt(eng)}</b> engagement
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-ink-400">{t.platform_slug === "telegram" ? "No per-post stats on Telegram" : "No numbers yet"}</span>
                              )}
                              {typeof t.id === "number" && t.platform_slug && (
                                <Link to={`/insights/${t.id}`} className="ml-auto inline-flex items-center gap-0.5 font-semibold text-brand hover:underline">
                                  Analytics <FiArrowRight size={11} />
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <button type="button" onClick={() => navigate("/")} className="btn-outline w-full">
            Done
          </button>
        </div>
      </div>

      {zoom && src && (
        <div className="fixed inset-0 z-[100] bg-night-950/80 grid place-items-center p-6 animate-fadein" onClick={() => setZoom(false)}>
          {isImage ? (
            <img src={src} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
          ) : (
            <video src={src} className="max-h-[85vh] max-w-full rounded-xl" controls autoPlay onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
