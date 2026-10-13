import {
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiFilm,
  FiGlobe,
  FiHome,
  FiImage,
  FiMessageSquare,
  FiPackage,
  FiRepeat,
  FiSliders,
  FiUserCheck,
} from 'react-icons/fi'

// The boss's six places, in his order — the sidebar is just these six lines.
// Pages that belong to one of them (`sub`) are tabs at the top of the page
// (SectionTabs.jsx). The first sub-page is the section's own page.
// `tour` is the anchor the first-run spotlight points at (lib/tour.js); a step
// whose anchor isn't on screen is simply skipped.
export const BOSS = [
  { to: '/command', icon: FiHome, label: 'Command center' },
  {
    to: '/weekly',
    icon: FiClipboard,
    label: 'Plan & best time',
    badge: 'plan',
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
    ],
  },
  { to: '/leads', icon: FiUserCheck, label: 'Leads & hand-off', badge: 'leads' },
  { to: '/insights', icon: FiBarChart2, label: 'Insights & sales' },
  {
    to: '/channels',
    icon: FiSliders,
    label: 'Setup',
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
];

export const onPath = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);
