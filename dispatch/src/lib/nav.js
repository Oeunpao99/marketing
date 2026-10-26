import {
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiCode,
  FiCreditCard,
  FiFilm,
  FiGlobe,
  FiHome,
  FiImage,
  FiMessageSquare,
  FiPackage,
  FiPlayCircle,
  FiRepeat,
  FiScissors,
  FiSliders,
  FiUserCheck,
} from 'react-icons/fi'

// The boss's six places, in his order, then the video tutorials — the sidebar is just these lines.
// Pages that belong to one of them (`sub`) are tabs at the top of the page
// (SectionTabs.jsx). The first sub-page is the section's own page.
// `tour` is the anchor the first-run spotlight points at (lib/tour.js); a step
// whose anchor isn't on screen is simply skipped.
// `group` starts a new group under a small grey heading (the sidebar, AI Studio style).
export const BOSS = [
  { to: '/command', icon: FiHome, label: 'Command center', tour: 'command' },
  {
    to: '/weekly',
    icon: FiClipboard,
    label: 'Plan & best time',
    group: 'Create',
    badge: 'plan',
    tour: 'plan',
    sub: [
      { to: '/weekly', icon: FiClipboard, label: 'Weekly plan', badge: 'plan' },
      { to: '/calendar', icon: FiCalendar, label: 'Calendar', tour: 'calendar' },
    ],
  },
  {
    to: '/ai',
    icon: FiFilm,
    label: 'Content studio',
    tour: 'ai',
    sub: [
      { to: '/ai', icon: FiFilm, label: 'Studio' },
      { to: '/library', icon: FiImage, label: 'Media Library', badge: 'library' },
      { to: '/editor', icon: FiScissors, label: 'Video editor' },
    ],
  },
  { to: '/leads', icon: FiUserCheck, label: 'Leads & hand-off', badge: 'leads', group: 'Grow' },
  { to: '/insights', icon: FiBarChart2, label: 'Insights & sales' },
  {
    to: '/channels',
    icon: FiSliders,
    label: 'Setup',
    group: 'Manage',
    dot: 'setup',
    tour: 'channels',
    sub: [
      { to: '/channels', icon: FiSliders, label: 'Channels' },
      { to: '/bots', icon: FiMessageSquare, label: 'Bot setup' },
      { to: '/auto', icon: FiRepeat, label: 'Autopilot' },
      { to: '/website', icon: FiGlobe, label: 'Website check' },
      { to: '/products', icon: FiPackage, label: 'Products & brand kit' },
    ],
  },
  // the plans, extra credits and invoices (pages/UpgradePage.jsx)
  { to: '/upgrade', icon: FiCreditCard, label: 'Plans & credits' },
  // API keys, Playground, Request Logs, connect an AI assistant (pages/ApiPage.jsx)
  { to: '/developer', icon: FiCode, label: 'API & MCP' },
  // how-to videos for customers (pages/TutorialsPage.jsx, lib/tutorials.js)
  { to: '/tutorials', icon: FiPlayCircle, label: 'Video tutorials', group: 'Learn' },
];

export const onPath = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);
