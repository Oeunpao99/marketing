import { FiEdit3, FiFilm, FiGrid, FiImage } from 'react-icons/fi'

// The Content studio's tools (/ai?tab=…) — the page shows the one picked; the
// switcher in the top bar (components/studio/StudioSwitcher) picks it.
export const STUDIO_TABS = [
  { id: 'video', label: 'Video builder', hint: 'Short AI clips joined into one video', icon: FiFilm },
  { id: 'images', label: 'Images', hint: 'Images, Remotion videos and quick clips in the chat', icon: FiImage },
  { id: 'copy', label: 'Copy per channel', hint: 'Captions and copy for each platform', icon: FiEdit3 },
  { id: 'templates', label: 'Templates', hint: 'Every video template, by content goal', icon: FiGrid },
]
