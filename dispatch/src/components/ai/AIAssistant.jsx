import { FiZap } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";

// The floating AI button — a shortcut into the AI Agent chat (/ai), where
// people both ask questions and create media. Hidden on /ai itself so it
// doesn't sit on top of that page's composer.
export default function AIAssistant() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname === "/ai") return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/ai")}
      className="hidden lg:grid fixed z-40 right-5 bottom-5 w-[52px] h-[52px] rounded-2xl place-items-center gradient-brand text-white shadow-glow-lg ring-1 ring-white/70 animate-ai-pulse active:scale-95 transition-transform"
      aria-label="Open AI Agent"
      title="AI Agent — ask or create"
    >
      <FiZap size={22} />
    </button>
  );
}
