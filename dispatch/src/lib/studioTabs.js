import { FiFilm, FiGrid, FiMic, FiZap } from 'react-icons/fi'

// The Content studio's tools (/ai?tab=…) — the page shows the one picked; the
// section tabs (components/layout/SectionTabs) show each as its own tab.
export const STUDIO_TABS = [
  // "Studio": the video builder — Weekly plan videos open here
  { id: 'video', label: 'Studio', hint: 'Short AI clips joined into one video', icon: FiFilm },
  // "Quick content" (id stays `images` so old links work) — the ⚡ button opens it
  { id: 'images', label: 'Quick content', hint: 'Images, Remotion videos and quick clips in the chat', icon: FiZap },
  { id: 'templates', label: 'Templates', hint: 'Every video template, by content goal', icon: FiGrid },
  // record / upload the owner's voice — videos can then speak in it
  { id: 'voice', label: 'Voice', hint: 'Record or upload your voice — videos speak in it', icon: FiMic },
]
