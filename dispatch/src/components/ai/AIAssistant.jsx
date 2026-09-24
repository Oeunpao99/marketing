import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiCalendar,
  FiEdit3,
  FiImage,
  FiInbox,
  FiRepeat,
  FiSend,
  FiShare2,
  FiZap,
  FiSun,
  FiTrendingUp,
  FiX,
} from "react-icons/fi";
import { useStore } from "../../store";
import { onAIAssistantOpen, onAIAssistantClose } from "./openAssistant";

const COMMANDS = [
  { to: "/new", keys: ["new post", "new", "post", "create", "write", "compose", "draft a post"], label: "Start a New Post", desc: "Compose and schedule", icon: FiEdit3 },
  { to: "/ai", keys: ["ai agent", "ai", "generate", "generate a plan", "plan"], label: "Run the AI Agent", desc: "Prompt a full posting plan", icon: FiZap },
  { to: "/", keys: ["today", "home", "dashboard"], label: "Open Today", desc: "Today's queue at a glance", icon: FiSun },
  { to: "/calendar", keys: ["calendar", "month", "schedule"], label: "Open Calendar", desc: "See the month grid", icon: FiCalendar },
  { to: "/review", keys: ["review", "waiting", "approve", "check"], label: "Open Waiting for You", desc: "Approve drafts", icon: FiInbox },
  { to: "/auto", keys: ["auto", "autopilot", "automatic"], label: "Open Auto-generate", desc: "Feed on autopilot", icon: FiRepeat },
  { to: "/library", keys: ["library", "asset", "media", "photo", "image"], label: "Browse Library", desc: "Find an asset", icon: FiImage },
  { to: "/insights", keys: ["insight", "insights", "analytics", "report", "metric"], label: "Open Insights", desc: "Read the numbers", icon: FiTrendingUp },
  { to: "/channels", keys: ["channel", "channels", "connect", "platform", "link"], label: "Open Channels", desc: "Manage connections", icon: FiShare2 },
];

const SUGGESTIONS = [
  "Plan today's posts",
  "Start a new post",
  "What's waiting for me?",
  "Check the calendar",
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function AIAssistant() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { showToast } = useStore();
const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | thinking | ready
  const [result, setResult] = useState([]);
  const [thinkingStep, setThinkingStep] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const contextChips = useMemo(() => {
    const order =
      pathname === "/" || pathname === "/new"
        ? ["/calendar", "/review", "/library", "/insights"]
        : ["/", "/new", "/calendar", "/review", "/library", "/insights"];
    return order
      .map((to) => COMMANDS.find((c) => c.to === to))
      .filter(Boolean);
  }, [pathname]);

  useEffect(() => {
    const offOpen = onAIAssistantOpen(() => {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 60);
    });
    const offClose = onAIAssistantClose(() => {
      setOpen(false);
      setPhase("idle");
      setInput("");
    });
    return () => {
      offOpen();
      offClose();
    };
  }, []);

  const [clockTimer, setClockTimer] = useState(null);

  const run = (raw) => {
    const q = String(raw || "").toLowerCase().trim();
    if (!q) return;

    // Match intent against commands (longest key wins so "new post" beats "post")
    let best = null;
    COMMANDS.forEach((c) => {
      c.keys.forEach((key) => {
        if (q.includes(key) && (!best || key.length > best.keyLen)) {
          best = { cmd: c, keyLen: key.length };
        }
      });
    });
    const matches = best ? [best.cmd] : [COMMANDS[0]];

    setOpen(true);
    setPhase("thinking");
    setThinkingStep(0);

    // Staged "thinking" so it reads like a real agent, not a magic answer.
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setThinkingStep((s) => (s < 2 ? s + 1 : 1));
    }, 550);

    setTimeout(() => {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setResult(matches);
      setPhase("ready");
      setThinkingStep(2);
    }, 1650);
  };

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [phase]);

  const handlePick = (cmd) => {
    setPhase("idle");
    setInput("");
    setOpen(false);
    // small delay so the panel closing doesn't eat the navigation
    navigate(cmd.to);
    showToast(`${cmd.label} — done`);
  };

  const thinkLabels = [
    "Reading today's queue",
    "Scanning the calendar & assets",
    "Drafting your options",
  ];

  return (
    <div className="fixed z-40 right-3 bottom-[72px] lg:right-5 lg:bottom-5 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(368px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl glass-strong animate-slide-up">
          {/* Header */}
          <div className="relative px-4 pt-3.5 pb-3 hero-tint border-b border-white/70">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl grid place-items-center gradient-brand text-white shadow-glow animate-ai-pulse">
                <FiZap size={16} />
              </span>
              <div className="flex-1">
                <div className="text-[12.5px] font-bold text-ink-900 leading-tight">
                  Ask AI Assistant
                </div>
                <div className="text-[10px] text-ink-400">
                  {greeting()} — Ti P'sa is listening
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 grid place-items-center rounded-lg text-ink-400 hover:bg-white/70 hover:text-ink-700 transition"
                aria-label="Close AI assistant"
              >
                <FiX size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-3">
            {phase === "idle" ? (
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Try
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setInput(s);
                        run(s);
                      }}
                      className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-medium text-ink-600 hover:border-brand-line hover:text-brand hover:bg-brand-soft transition-all duration-150"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Quick access
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {contextChips.map((cmd) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.to}
                        type="button"
                        onClick={() => handlePick(cmd)}
                        className="flex flex-col items-center gap-1 rounded-xl border border-ink-100 bg-ink-50/60 px-2 py-2.5 text-center hover:border-brand-line hover:bg-brand-soft hover:text-brand transition-all duration-150"
                      >
                        <Icon size={15} className="text-brand" />
                        <span className="text-[10px] font-semibold text-ink-600 leading-tight">
                          {cmd.label.replace("Open ", "").replace("Start a ", "")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : phase === "thinking" ? (
              <div className="px-1 py-2">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl grid place-items-center gradient-brand text-white">
                    <FiZap size={15} />
                  </span>
                  <div className="flex-1">
                    <div className="ai-dots flex gap-1">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="mt-1.5 text-[11px] text-ink-500">
                      {thinkLabels[thinkingStep] || thinkLabels[1]}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full bg-brand relative animate-indeterminate rounded-full" />
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-[11px] font-semibold text-ink-600">
                  Here's what I'd do next
                </div>
                <div className="space-y-1.5">
                  {result.map((cmd) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.to}
                        type="button"
                        onClick={() => handlePick(cmd)}
                        className="w-full flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5 text-left hover:border-brand-line hover:bg-brand-soft hover:shadow-ring transition-all duration-150 animate-slide-in-right"
                      >
                        <span className="w-8 h-8 rounded-lg grid place-items-center bg-brand-soft text-brand">
                          <Icon size={15} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] font-semibold text-ink-800">
                            {cmd.label}
                          </span>
                          <span className="block text-[10.5px] text-ink-400">
                            {cmd.desc}
                          </span>
                        </span>
                        <FiArrowRight size={15} className="text-ink-300" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-ink-100 p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run(input);
              }}
              placeholder="Ask anything…  e.g. “open calendar”"
              className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[12px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all"
            />
            <button
              type="button"
              onClick={() => run(input)}
              disabled={phase === "thinking"}
              className="flex-none w-10 h-10 rounded-xl grid place-items-center gradient-brand text-white shadow-glow disabled:opacity-40 active:scale-95 transition-all"
              aria-label="Send"
            >
              <FiSend size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Floating action button */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 60);
          }}
          className="w-[52px] h-[52px] rounded-2xl grid place-items-center gradient-brand text-white shadow-glow-lg ring-1 ring-white/70 ring-offset-2 ring-offset-transparent animate-ai-pulse active:scale-95 transition-transform"
          aria-label="Open AI assistant"
        >
          <FiZap size={22} />
        </button>
      )}
    </div>
  );
}
