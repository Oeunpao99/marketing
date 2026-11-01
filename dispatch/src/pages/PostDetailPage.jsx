import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiBarChart2, FiCalendar, FiClock, FiEdit3, FiFileText, FiMaximize2 } from "react-icons/fi";
import PostPerformance from "../components/command/PostPerformance";
import "../styles/post-detail.css";
import { api } from "../api/client";
import PlatformIcon, { PLAT_BRAND_CLASS } from "../components/ui/PlatformIcon";
import StatusBadge from "../components/today/StatusBadge";
import PostEditor from "../components/today/PostEditor";
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
      <div className="post-detail w-full px-4 sm:px-6 lg:px-8 py-6">
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
  const posted = rows.some((t) => t.status === "posted");
  const onlyTelegram = platforms.length > 0 && platforms.every((p) => p === "telegram");

  return (
    <div className="post-detail w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="post-toolbar mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900">
          <FiArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2">
          {q.postId != null && (
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.clipboard.writeText(`P${q.postId}`);
                  showToast(`Post code P${q.postId} copied`);
                } catch {
                  showToast(`Post code: P${q.postId}`);
                }
              }}
              title="Put this code in the post's chat link (t.me/YourBot?start=P…, m.me/YourPage?ref=P…) so leads from it are linked to this post"
              className="rounded-full bg-ink-100 px-3 py-1.5 font-mono text-[12px] font-semibold text-ink-700 hover:bg-ink-200/70"
            >
              Post code P{q.postId}
            </button>
          )}
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

      <div className="post-page-heading"><div><p>CONTENT WORKSPACE</p><h1>Post overview</h1></div><span><StatusBadge status={q.processing ? "processing" : q.st === "queued" ? "waiting" : q.st} compact /></span></div>

      <div className="grid grid-cols-1 gap-5 items-start">
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
            <section className={`${card} post-preview`}>
              <button
                type="button"
                onClick={() => src && setZoom(true)}
                className="post-media group relative grid place-items-center"
                disabled={!src}
                aria-label={src ? "Open full-size media preview" : "Text-only post"}
                title={src ? "View full size" : ""}
              >
                {src && isImage ? (
                  <img src={src} alt="" className="w-full h-full object-contain" />
                ) : src ? (
                  <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-contain pointer-events-none" />
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

              <div className="post-copy min-w-0 flex-1">
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
                    <StatusBadge status={q.processing ? "processing" : q.st === "queued" ? "waiting" : q.st} compact />
                  </span>
                </div>
                <h2 className={`post-title mt-2.5 text-[17px] font-bold leading-snug tracking-tight text-ink-900 ${isKhmer(title) ? "font-khmer" : ""}`}>{title}</h2>
                <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                  {q.st === "posted" ? <FiClock size={12} /> : <FiCalendar size={12} />}
                  {q.st === "posted" ? "Posted" : q.st === "failed" ? "Failed ·" : "Scheduled for"} <b className="font-semibold text-ink-700">{when}</b>
                </div>

                <div className="post-caption mt-5 max-h-[360px] overflow-y-auto pr-1">
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

          {posted && <PostPerformance totals={totals} rows={rows} onlyTelegram={onlyTelegram} analyticsId={postedTarget?.id} />}


        </div>

      </div>

      {zoom && src && (
        <div className="fixed inset-0 z-[100] bg-night-950/80 grid place-items-center p-6 animate-fadein" onClick={() => setZoom(false)}>
          {isImage ? (
            <img src={src} alt="" className="max-h-[calc(85vh/var(--z,1))] max-w-full rounded-xl object-contain" />
          ) : (
            <video src={src} className="max-h-[calc(85vh/var(--z,1))] max-w-full rounded-xl" controls autoPlay onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
