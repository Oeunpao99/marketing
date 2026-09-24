import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCheck, FiEdit3, FiSend, FiUsers } from "react-icons/fi";
import { api } from "../api/client";
import CaptionComps from "../components/newpost/CaptionComps";
import ChannelPicker from "../components/newpost/ChannelPicker";
import VideoStep from "../components/newpost/VideoStep";
import CircularProgress from "../components/ui/CircularProgress";
import { PLAT } from "../data/brands";
import { handoff } from "../lib/handoff";
import { phnomPenhDate, phnomPenhToISO, fullDayLabel } from "../lib/tz";
import { useStore } from "../store";

function defaultTimeFor(platform) {
  if (platform === "facebook") return "19:30";
  if (platform === "tiktok") return "20:00";
  return "20:30";
}

export default function NewPostPage() {
  const { brands, channels, queue, refreshQueue, showToast } = useStore();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  const [selected, setSelected] = useState([]);
  const [comps, setComps] = useState({});
  const [error, setError] = useState(null);

  // "post" (Post now, shows the progress ring) or "schedule" (Schedule for
  // later, no ring — nothing's actually being sent yet).
  const [postMode, setPostMode] = useState(null);
  const busy = postMode !== null;
  const [postStartedAt, setPostStartedAt] = useState(0);
  const [postDone, setPostDone] = useState(false);
  const [, tick] = useState(0);
  // Set once "Post now" succeeds — the freshly-scheduled post's id, so we can
  // jump into its detail page once the store's queue catches up with it.
  const [pendingPostId, setPendingPostId] = useState(null);

  // Re-render every tick while posting, so the progress ring keeps animating.
  useEffect(() => {
    if (postMode !== "post" || postDone) return;
    const id = setInterval(() => tick((n) => n + 1), 150);
    return () => clearInterval(id);
  }, [postMode, postDone]);

  // Once the store's queue includes the post we just sent, navigate into it.
  useEffect(() => {
    if (pendingPostId == null) return;
    const idx = queue.findIndex((q) => q.postId === pendingPostId);
    if (idx !== -1) {
      setPendingPostId(null);
      navigate(`/post/${idx}`);
    }
  }, [queue, pendingPostId, navigate]);

  const postElapsed =
    postMode === "post" && postStartedAt ? (Date.now() - postStartedAt) / 1000 : 0;
  const postEta = 6; // seconds — tuned to roughly match typical publish latency
  const postPct = postDone
    ? 100
    : Math.min(92, 100 * (1 - Math.exp(-postElapsed / (postEta / 2.3))));

  // Asset dragged in on the AI agent page, if any.
  useEffect(() => {
    const a = handoff.take();
    if (a) {
      setVideo({
        name: a.name,
        size: a.size,
        dur: a.kind === "image" ? "image" : "—",
        tag: "From AI agent",
        file: a.file,
        kind: a.kind,
        previewUrl: a.url,
        videoId: a.videoId ?? null,
      });
    }
  }, []);

  const toggle = (id, checked) => {
    setSelected((prev) => {
      if (checked) {
        if (prev.some((x) => x.id === id)) return prev;
        const c = channels.find((x) => x.id === id);
        if (!comps[id]) {
          setComps((c2) => ({
            ...c2,
            [id]: {
              cap: "",
              ttl: "",
              date: phnomPenhDate(0),
              time: defaultTimeFor(c.p),
            },
          }));
        }
        return [...prev, c];
      }
      return prev.filter((x) => x.id !== id);
    });
  };

  const onUpdate = ({ comps: nextComps, updateField, copyToast }) => {
    if (nextComps) setComps(nextComps);
    if (copyToast) showToast(copyToast);
    if (updateField) {
      const { id, field, value } = updateField;
      setComps((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    }
  };

  const ids = selected.map((c) => c.id);
  const emptyCount = ids.filter((i) => !comps[i]?.cap?.trim()).length;
  const overCount = ids.filter(
    (i) =>
      comps[i]?.cap?.length > PLAT[channels.find((c) => c.id === i)?.p]?.limit,
  ).length;

  const canSchedule =
    video && ids.length > 0 && emptyCount === 0 && overCount === 0;

  const summary = !video
    ? "Still needed: add a video or image first."
    : ids.length === 0
      ? "Still needed: pick where it goes."
      : emptyCount > 0
        ? `Still needed: ${emptyCount} caption${emptyCount === 1 ? " is empty" : "s are empty"}.`
        : overCount > 0
          ? `Still needed: ${overCount} over the character limit.`
          : (() => {
              const ts = ids.map((i) => comps[i]?.time).sort();
              const d = ids.map((i) => comps[i]?.date).find(Boolean);
              const { rest: when } = fullDayLabel(d || phnomPenhDate());
              return `${ids.length} post${ids.length === 1 ? "" : "s"} · ${ts[0]}${
                ts.length > 1 ? ` to ${ts[ts.length - 1]}` : ""
              } on ${when}`;
            })();

  /** Resolve the picked (mock) channels to real backend channel ids and send. */
  const send = async (publishNow) => {
    if (!canSchedule || busy) return;
    setPostMode(publishNow ? "post" : "schedule");
    setPostStartedAt(Date.now());
    setPostDone(false);
    setError(null);
    try {
      const [groups, videos] = await Promise.all([
        api.get("/views/channels"),
        api.get("/videos").catch(() => []),
      ]);

      // AI-generated videos already exist on the server; a dragged-in file needs uploading.
      let videoId =
        video?.videoId ?? videos.find((v) => v.filename === video?.name)?.id ?? null;
      if (video?.file && videoId == null) {
        const fd = new FormData();
        fd.append("file", video.file, video.name || "asset");
        const up = await api.upload("/media/upload", fd);
        videoId = up?.id ?? null;
      }

      // selected mock channel -> { brandId, backendChannel }
      const byBrand = new Map();
      const missing = [];
      for (const c of selected) {
        const g = groups.find((x) => x.slug === c.b);
        const bc = g?.channels.find(
          (x) => x.platform_slug === c.p && x.status !== "off",
        );
        if (!g || !bc) {
          missing.push(`${PLAT[c.p]?.name || c.p} for ${c.b}`);
          continue;
        }
        const d = comps[c.id];
        const target = {
          channel_id: bc.id,
          caption: d.cap,
          title: d.ttl || "",
          scheduled_for: publishNow
            ? new Date().toISOString()
            : phnomPenhToISO(d.date, d.time),
          platform_options: d.tiktokOptions ? { tiktok: d.tiktokOptions } : {},
        };
        if (!byBrand.has(g.id)) byBrand.set(g.id, []);
        byBrand.get(g.id).push(target);
      }

      if (byBrand.size === 0) {
        throw new Error(
          `No connected channel on the server for: ${missing.join(", ")}. ` +
            `Connect it under Channels first.`,
        );
      }

      let published = 0;
      let failedMsgs = [];
      let firstPostId = null;
      for (const [brandId, targets] of byBrand) {
        const res = await api.post("/views/schedule", {
          brand_id: brandId,
          video_id: videoId,
          title: targets[0].title || video?.name || "Untitled video",
          targets,
          publish_now: publishNow,
        });
        if (firstPostId == null) firstPostId = res.post_id ?? null;
        published += (res.published || []).length;
        failedMsgs = failedMsgs.concat(
          (res.failed || []).map((f) => f.error).filter(Boolean),
        );
      }

      if (publishNow && failedMsgs.length) {
        // Pull the queue anyway so Today reflects the failure, but stay on
        // this page (with the error shown) instead of navigating away.
        await refreshQueue();
        setError(`Some posts failed: ${failedMsgs.join("; ")}`);
        setPostMode(null);
        return;
      }

      if (publishNow) {
        // Hold at 100% for a beat so the ring actually reads as "done"
        // before the page changes out from under it.
        setPostDone(true);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      // Pull the real queue from the backend so the Today view is authoritative.
      await refreshQueue();

      if (publishNow) {
        showToast(
          `Posted now — ${published} post${published === 1 ? "" : "s"} sent`,
        );
      } else {
        showToast(
          `${selected.length} post${selected.length === 1 ? "" : "s"} scheduled`,
        );
      }
      if (missing.length)
        showToast(`Skipped (not connected): ${missing.join(", ")}`);

      setSelected([]);
      setComps({});
      setVideo(null);
      setPostMode(null);
      if (publishNow && firstPostId != null) {
        // The store's queue may not include it yet — the effect above
        // navigates as soon as it catches up.
        setPendingPostId(firstPostId);
      } else {
        navigate("/");
      }
    } catch (e) {
      setError(e.message);
      setPostMode(null);
    }
  };

  const steps = [
  { n: 1, label: "Asset", icon: FiEdit3, done: !!video },
  { n: 2, label: "Channels", icon: FiUsers, done: ids.length > 0 },
  { n: 3, label: "Captions", icon: FiCheck, done: emptyCount === 0 && ids.length > 0 },
];

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="page-title">
            Create a{" "}
            <span className="text-gradient-brand">post</span>
          </h1>
          <p className="page-sub">
            Drop an asset, pick the channels, then fine-tune each caption before it goes out.
          </p>
        </div>

        {/* Stepper */}
        <ol className="flex items-center gap-2 shrink-0">
          {steps.map((s, i) => (
            <li key={s.n} className="flex items-center gap-2">
              {i > 0 && <span className="w-5 h-px bg-ink-200" />}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold border transition-all duration-200 ${
                  s.done
                    ? "border-brand-line bg-brand-soft text-brand"
                    : "border-ink-200 bg-white text-ink-400"
                }`}
              >
                {s.done ? (
                  <FiCheck size={12} className="text-brand" />
                ) : (
                  <span className="text-[10px] font-bold text-ink-400">{s.n}</span>
                )}
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <VideoStep hasVideo={!!video} video={video} onSetVideo={setVideo} />

      <ChannelPicker
        brands={brands}
        channels={channels}
        selectedChannels={selected}
        toggle={toggle}
      />

      <CaptionComps
        comps={comps}
        selectedChannels={selected}
        onUpdate={onUpdate}
      />

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 card px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[12px] text-ink-500 min-w-0">
          {summary.startsWith("Still needed") ? (
            <span role="status">{summary}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: `<b>${summary}</b>` }} />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => showToast("Saved as draft")}
            className="btn-ghost"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => send(false)}
            disabled={!canSchedule || busy}
            className="btn-outline"
          >
            {busy
              ? "Working…"
              : `Schedule${ids.length ? ` ${ids.length}` : ""}`}
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            disabled={!canSchedule || busy}
            className="btn-primary"
          >
            <FiSend size={14} />
            {busy ? "Posting…" : "Post now"}
          </button>
        </div>
      </div>

      {postMode === "post" && (
        <div className="fixed inset-0 z-50 bg-ink-950/25 backdrop-blur-md flex items-center justify-center p-4 animate-fadein">
          <div className="glass-strong rounded-3xl p-8 flex flex-col items-center gap-4 max-w-xs w-full text-center">
            <CircularProgress percent={postPct} size={128} stroke={11}>
              {postDone ? (
                <span className="text-4xl text-brand animate-check-pop">✓</span>
              ) : (
                <span className="font-display text-[24px] text-ink-900 font-mono">
                  {Math.round(postPct)}%
                </span>
              )}
            </CircularProgress>
            <div>
              <div className="font-bold text-ink-900 text-[14px]">
                {postDone ? "Sent!" : "Posting…"}
              </div>
              <div className="mt-1 text-[11.5px] text-ink-400">
                {postDone
                  ? "Taking you to the post…"
                  : `Sending to ${selected.length} channel${selected.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
