import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiBarChart2, FiCalendar, FiFileText, FiImage } from "react-icons/fi";
import { api } from "../api/client";
import PlatformIcon from "../components/ui/PlatformIcon";
import StatusBadge from "../components/today/StatusBadge";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { TZ } from "../lib/tz";
import { useStore } from "../store";

const isKhmer = (s) => /[ក-៿᧠-᧿]/.test(s || "");
const card = "bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

const mediaSrc = (url) =>
  !url ? null : url.startsWith("http") ? url : `${window.location.port === "5173" ? "http://localhost:8000" : ""}${url}`;

// Target statuses from the API → the queue's own status words.
const targetStatus = (s) => (s === "posting" ? "sending" : s === "queued" ? "waiting" : s);

export default function PostDetailPage() {
  const { queue } = useStore();
  const { index } = useParams();
  const navigate = useNavigate();
  const q = queue[Number(index)];
  const [targets, setTargets] = useState(null); // every channel this post went to
  const [zoom, setZoom] = useState(false);

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
  }, [q?.postId, q?.ttl, q?.cap]);

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

  const first = targets?.[0];
  const src = mediaSrc(first?.video_url);
  const isImage = first?.video_filename ? /\.(jpe?g|png|gif|webp)$/i.test(first.video_filename) : false;
  const when = q.scheduledFor
    ? new Date(q.scheduledFor).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      })
    : "Not scheduled";
  const postedTarget = targets?.find((t) => t.status === "posted");
  const brandName = first?.brand_name || q.brandName || q.b;
  const title = q.ttl && q.ttl !== q.cap ? q.ttl : null;

  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein">
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900"
      >
        <FiArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* Post */}
        <section className={`${card} p-5 flex flex-col md:flex-row gap-5`}>
          <button
            type="button"
            onClick={() => src && setZoom(true)}
            className="relative flex-none w-full md:w-56 aspect-[4/5] md:aspect-auto md:h-72 rounded-xl overflow-hidden bg-ink-100 grid place-items-center"
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
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorForBrand(q.b) }} />
              <span className="font-semibold text-ink-900">{brandName}</span>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1 text-ink-500">
                <FiCalendar size={12} /> {when}
              </span>
              <span className="ml-1">
                <StatusBadge status={q.st === "queued" ? "waiting" : q.st} compact />
              </span>
            </div>
            {title && <h1 className="mt-2 text-[16px] font-semibold text-ink-900 leading-snug">{title}</h1>}
            <p
              className={`mt-2 text-[13px] text-ink-800 leading-relaxed whitespace-pre-line ${isKhmer(q.cap) ? "font-khmer" : ""}`}
            >
              {q.cap || <span className="text-ink-400 italic">No caption</span>}
            </p>
            <div className="mt-2 text-[11px] text-ink-400">{(q.cap || "").length.toLocaleString()} characters</div>
          </div>

          <div className="flex md:hidden gap-2">
            {postedTarget && (
              <Link to={`/insights/${postedTarget.id}`} className="btn-primary flex-1">
                <FiBarChart2 size={14} /> View analytics
              </Link>
            )}
            <button type="button" onClick={() => navigate("/")} className="btn-outline flex-1">
              Done
            </button>
          </div>
        </section>

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
              {(targets.length ? targets : q.c.map((c, i) => ({ id: i, channel: c, status: q.st }))).map((t) => {
                const name = t.channel || "";
                const plat = PLAT[name.toLowerCase()];
                return (
                  <li key={t.id} className="px-5 py-3.5 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-lg bg-ink-50 border border-ink-100 grid place-items-center flex-none">
                      <PlatformIcon name={plat?.name || name} className="text-ink-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink-900">{plat?.name || name}</div>
                      <div className="text-[11.5px] text-ink-500">{plat?.as || "Post"}</div>
                      {t.error && t.status === "failed" && (
                        <div className="mt-1 text-[11.5px] text-red-600">{t.error}</div>
                      )}
                    </div>
                    <StatusBadge status={targetStatus(t.status)} compact />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <div className="hidden md:flex gap-2">
          {postedTarget && (
            <Link to={`/insights/${postedTarget.id}`} className="btn-primary flex-1">
              <FiBarChart2 size={14} /> View analytics
            </Link>
          )}
          <button type="button" onClick={() => navigate("/")} className="btn-outline flex-1">
            Done
          </button>
        </div>
        </div>
      </div>

      {zoom && src && (
        <div className="fixed inset-0 z-[100] bg-ink-950/80 grid place-items-center p-6 animate-fadein" onClick={() => setZoom(false)}>
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
