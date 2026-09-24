import { NavLink } from "react-router-dom";
import {
  FiCalendar,
  FiEdit3,
  FiInbox,
  FiSun,
  FiZap,
} from "react-icons/fi";
import { useStore } from "../../store";
import { openAIAssistant } from "../ai/openAssistant";

const TABS = [
  { to: "/", end: true, icon: FiSun, label: "Today" },
  { to: "/calendar", icon: FiCalendar, label: "Calendar" },
];

export default function MobileBar() {
  const { review } = useStore();
  const reviewCount = (review || []).length;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-white/70 backdrop-blur-2xl border-t border-white/70 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5 items-stretch h-14">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                isActive ? "text-brand" : "text-ink-400"
              }`
            }
          >
            <tab.icon size={18} strokeWidth={2.2} />
            {tab.label}
          </NavLink>
        ))}

        {/* Center AI create button */}
        <div className="flex items-center justify-center -mt-5">
          <button
            type="button"
            onClick={openAIAssistant}
            className="w-11 h-11 rounded-2xl gradient-brand text-white grid place-items-center shadow-glow-lg animate-ai-pulse"
            aria-label="Ask AI"
          >
            <FiZap size={19} />
          </button>
        </div>

        <NavLink
          to="/ai"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              isActive ? "text-brand" : "text-ink-400"
            }`
          }
        >
          <FiEdit3 size={18} strokeWidth={2.2} />
          AI Agent
        </NavLink>

        <NavLink
          to="/review"
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              isActive ? "text-brand" : "text-ink-400"
            }`
          }
        >
          {reviewCount > 0 && (
            <span className="absolute top-1 right-[26%] min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center">
              {reviewCount}
            </span>
          )}
          <FiInbox size={18} strokeWidth={2.2} />
          Review
        </NavLink>
      </div>
    </nav>
  );
}