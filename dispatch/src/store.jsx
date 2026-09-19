import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api/client";
import { phnomPenhClock } from "./lib/tz";

const StoreContext = createContext(null);

let toastTimer;

// How often the Today / Queue view re-checks the backend so a post that the
// delivery worker sends flips from "Queued" → "Posting…" → "Posted" on screen.
const QUEUE_POLL_MS = 6000;

/** Collapse the backend's per-channel targets into one card per post. */
function groupTargets(targets) {
  const now = Date.now();
  const byPost = new Map();
  for (const t of targets) {
    const key = t.post_id ?? `t${t.id}`;
    let card = byPost.get(key);
    if (!card) {
      card = {
        postId: t.post_id,
        targetIds: [],
        targetId: t.id, // first target — PostDetail matches on this
        t: t.time && t.time !== "--:--" ? t.time : "--:--",
        b: t.brand_slug || String(t.brand_id ?? ""),
        brandName: t.brand_name,
        c: [],
        ttl: t.title || "Untitled video",
        cap: t.caption || "",
        scheduledFor: t.scheduled_for,
        _statuses: [],
        _errors: [],
      };
      byPost.set(key, card);
    }
    card.targetIds.push(t.id);
    if (t.channel && !card.c.includes(t.channel)) card.c.push(t.channel);
    card._statuses.push(t.status);
    if (t.error) card._errors.push(t.error);
    if (!card.cap && t.caption) card.cap = t.caption;
  }

  return Array.from(byPost.values())
    .map((card) => {
      const dueMs = card.scheduledFor
        ? now - new Date(card.scheduledFor).getTime()
        : -1;
      // Just became due — treat as "sending" while the worker gets to it, but
      // stop claiming that after a few minutes so a stuck post reads honestly.
      const justDue = dueMs >= 0 && dueMs < 3 * 60 * 1000;
      let st;
      if (card._statuses.includes("failed")) st = "failed";
      else if (card._statuses.includes("posting")) st = "sending";
      else if (card._statuses.every((s) => s === "posted")) st = "posted";
      else if (card._statuses.includes("queued") && justDue) st = "sending";
      else st = "queued";
      return { ...card, st, error: card._errors[0] || null };
    })
    .sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

export function StoreProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [brands, setBrands] = useState([]);
  const [queue, setQueue] = useState([]);
  const [review, setReview] = useState(null); // null = still loading
  const [auto, setAuto] = useState(null); // null = still loading
  const [libraryCount, setLibraryCount] = useState(0);
  const [toast, setToast] = useState(null);
  const pollRef = useRef(null);

  const refreshQueue = useCallback(
    () =>
      api
        .get("/views/today")
        .then((targets) => setQueue(groupTargets(targets || [])))
        .catch(() => {}),
    [],
  );

  const refreshCounts = useCallback(
    () =>
      api
        .get("/views/sidebar")
        .then((s) => setLibraryCount(s?.library_count || 0))
        .catch(() => {}),
    [],
  );

  const refreshChannels = useCallback(
    () =>
      api
        .get("/views/channels")
        .then((groups) => {
          setBrands(
            groups.map(({ id, slug, name, lang, note }) => ({
              id,
              slug,
              name,
              lang,
              note,
            })),
          );
          setChannels(
            groups.flatMap((group) =>
              group.channels.map((channel) => ({
                id: channel.id,
                b: group.slug,
                brandId: group.id,
                p: channel.platform_slug,
                h: channel.handle,
                s: channel.status,
                m: channel.token_note,
                l: channel.last_post_at || "—",
                tiktokDirectPost: !!channel.tiktok_direct_post,
              })),
            ),
          );
        })
        .catch(() => {}),
    [],
  );

  const refreshReview = useCallback(
    () =>
      api
        .get("/views/review")
        .then((drafts) =>
          setReview(
            drafts.map((d) => ({
              id: d.id,
              b: d.brand_slug,
              brandName: d.brand_name,
              ttl: d.title,
              body: d.body,
              insight: d.insight,
              made: `Written ${phnomPenhClock(d.generated_at)}`,
              source: d.source,
              videoUrl: d.video_url,
              fitScore: d.fit_score,
            })),
          ),
        )
        .catch(() => {}),
    [],
  );

  const refreshAuto = useCallback(
    () => api.get("/views/auto").then(setAuto).catch(() => {}),
    [],
  );

  useEffect(() => {
    refreshChannels();
    refreshReview();
    refreshAuto();
  }, [refreshChannels, refreshReview, refreshAuto]);

  useEffect(() => {
    refreshQueue();
    refreshCounts();
    pollRef.current = setInterval(() => {
      refreshQueue();
      refreshCounts();
    }, QUEUE_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [refreshQueue, refreshCounts]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 2600);
  };

  return (
    <StoreContext.Provider
      value={{
        channels,
        setChannels,
        brands,
        setBrands,
        refreshChannels,
        queue,
        setQueue,
        refreshQueue,
        libraryCount,
        refreshCounts,
        review,
        setReview,
        refreshReview,
        auto,
        setAuto,
        refreshAuto,
        toast,
        showToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
