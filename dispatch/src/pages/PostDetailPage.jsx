import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import PlatformIcon from "../components/ui/PlatformIcon";
import Tag from "../components/ui/Tag";
import { PLAT } from "../data/brands";
import { colorForBrand } from "../lib/brandColor";
import { TZ, TZ_LABEL } from "../lib/tz";
import { useStore } from "../store";

const isKhmer = (s) => /[\u1780-\u17FF\u19E0-\u19FF]/.test(s);

export default function PostDetailPage() {
  const { queue } = useStore();
  const { index } = useParams();
  const navigate = useNavigate();
  const q = queue[Number(index)];
  const [realPost, setRealPost] = useState(null);

  useEffect(() => {
    if (!q) return;
    api
      .get("/views/today")
      .then((posts) => {
        const match = posts.find((post) =>
          q.postId != null
            ? post.post_id === q.postId
            : q.targetId
              ? post.id === q.targetId
              : post.title === q.ttl && post.caption === q.cap,
        );
        if (match) setRealPost(match);
      })
      .catch(() => {});
  }, [q?.postId, q?.targetId, q?.ttl, q?.cap]);

  if (!q) {
    return (
      <div className="p-5 lg:p-8 w-full animate-fadein">
        <div className="max-w-lg text-center py-16 mx-auto">
          <div className="text-[15px] font-semibold text-ink-700 mb-2">
            Post not found
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl gradient-brand text-white text-[13px] font-semibold"
          >
            Back to Today
          </button>
        </div>
      </div>
    );
  }

  const color = colorForBrand(q.b);
  const name = realPost?.brand_name || q.brandName || q.b;
  const mediaUrl = realPost?.video_url
    ? realPost.video_url.startsWith("http")
      ? realPost.video_url
      : `${window.location.port === "5173" ? "http://localhost:8000" : ""}${realPost.video_url}`
    : null;
  const isImage = realPost?.video_filename
    ? /\.(jpe?g|png|gif|webp)$/i.test(realPost.video_filename)
    : false;
  const scheduledIso = realPost?.scheduled_for || q.scheduledFor;
  const scheduledDate = scheduledIso
    ? new Date(scheduledIso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: TZ,
      })
    : "";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-ink-50 p-5 lg:p-8 animate-fadein">
      <div className="w-full">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 transition-all duration-150 hover:text-ink-900"
        >
          ← Back to Today
        </Link>

        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}30` }}
              />
              <span className="font-bold text-sm" style={{ color }}>
                {name}
              </span>
            </div>
            <h1 className="max-w-3xl font-display text-[32px] leading-tight tracking-tight text-ink-900 lg:text-[42px]">
              {q.ttl}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
              <span className="font-mono font-semibold text-ink-700">
                {q.t}
              </span>
              <span>·</span>
              <span>{scheduledDate}</span>
              <span>·</span>
              <span>{TZ_LABEL}</span>
            </div>
          </div>
          <Tag
            variant={
              q.st === "posted"
                ? "ok"
                : q.st === "failed"
                  ? "stop"
                  : "idle"
            }
          >
            {q.st === "posted"
              ? "Published"
              : q.st === "sending"
                ? "Posting…"
                : q.st === "failed"
                  ? "Failed"
                  : "Scheduled"}
          </Tag>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-400">
                Published asset
              </span>
              <span className="font-mono text-[11px] text-ink-400">9:16</span>
            </div>
            <div className="mx-auto aspect-[9/16] max-w-[360px] overflow-hidden rounded-2xl bg-ink-900 shadow-dock ring-1 ring-ink-900/10">
              {mediaUrl ? (
                isImage ? (
                  <img
                    src={mediaUrl}
                    alt={realPost.video_filename || q.ttl}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                )
              ) : (
                <span className="px-4 text-center font-mono text-[12px] text-white/50">
                  No uploaded media attached
                </span>
              )}
            </div>
            {realPost?.video_filename && (
              <div className="mt-3 truncate text-center text-[12px] text-ink-500">
                {realPost.video_filename}
              </div>
            )}
          </section>

          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card lg:p-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-400">
                  Distribution
                </span>
                <span className="text-[12px] text-ink-400">
                  {q.c.length} channel{q.c.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {q.c.map((ch) => (
                  <span
                    key={ch}
                    className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] font-bold text-ink-700"
                  >
                    <PlatformIcon name={ch} className="text-ink-500" />
                    {ch}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card lg:p-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-400">
                  Caption
                </span>
                <span className="font-mono text-[11.5px] text-ink-400">
                  {q.cap.length.toLocaleString()} characters
                </span>
              </div>
              <div
                className={`rounded-xl border border-ink-100 bg-ink-50 px-4 py-4 text-[15px] leading-7 text-ink-800 ${isKhmer(q.cap) ? "font-khmer" : ""}`}
              >
                {q.cap}
              </div>
            </section>

            <div className="rounded-xl border border-brand/10 bg-brand/5 px-4 py-3 text-[13px] leading-relaxed text-ink-600">
              {q.c.length === 1 ? (
                <>
                  Posting as a{" "}
                  <b className="text-ink-800">
                    {PLAT[q.c[0]?.toLowerCase()]?.as || q.c[0]}
                  </b>{" "}
                  to {q.c[0]}.
                </>
              ) : (
                <>
                  Posting to <b className="text-ink-800">{q.c.join(" and ")}</b>
                  . Content will be adapted per platform.
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 pt-5">
              <span className="text-[13px] text-ink-500">
                {q.st === "posted"
                  ? "This post has been published."
                  : q.st === "sending"
                    ? "Sending to the channel now…"
                    : q.st === "failed"
                      ? q.error || "Delivery failed. It will retry."
                      : "Waiting to be published."}
              </span>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="px-4 py-1.5 rounded-xl gradient-brand text-white text-[13px] font-semibold hover:shadow-glow-lg transition-all duration-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
