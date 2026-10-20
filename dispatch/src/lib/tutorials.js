import {
  FiBarChart2,
  FiClipboard,
  FiEdit3,
  FiFilm,
  FiGlobe,
  FiPackage,
  FiRepeat,
  FiSliders,
  FiUserCheck,
  FiUsers,
} from 'react-icons/fi'

// The "how to use Smart Marketing" videos on /tutorials (pages/TutorialsPage.jsx),
// in the order a new customer needs them.
//
// To add a video, set its `src`:
//   - a file: put it in dispatch/public/tutorials/ and use '/tutorials/<name>.mp4'
//   - YouTube: paste the link ('https://youtu.be/…' or 'https://www.youtube.com/watch?v=…')
// A lesson with no `src` shows as "coming soon". `thumb` = its cover and
// `art` = just its picture, for the small list cards (motion/tools/make_thumbs.py). `poster` (optional) is the
// picture shown before it plays (and the thumbnail in the list); `length` ("1:16")
// or `minutes` is the length shown on the card.
// `to` is the page the lesson is about — "Open this page" goes there.
export const TUTORIALS = [
  {
    id: 'connect',
    thumb: '/tutorials/connect-thumb.jpg',
    art: '/tutorials/connect-art.jpg',
    icon: FiSliders,
    title: 'Connect your pages',
    km: 'ភ្ជាប់ទំព័ររបស់បង',
    text: 'Link Facebook, Instagram, TikTok, Telegram and LinkedIn so Smart Marketing can post for you.',
    to: '/channels',
    src: '/tutorials/connect.mp4',
    poster: '/tutorials/connect.jpg',
    length: '1:16',
    minutes: 1,
  },
  {
    id: 'brand-kit',
    thumb: '/tutorials/brand-kit-thumb.jpg',
    art: '/tutorials/brand-kit-art.jpg',
    icon: FiPackage,
    title: 'Set up your brand kit',
    km: 'រៀបចំកញ្ចប់ម៉ាក',
    text: 'Add your logo, colours, products and screenshots — every design uses them.',
    to: '/products',
    src: '/tutorials/brand-kit.mp4',
    poster: '/tutorials/brand-kit.jpg',
    length: '1:21',
    minutes: 1,
  },
  {
    id: 'weekly-plan',
    thumb: '/tutorials/weekly-plan-thumb.jpg',
    art: '/tutorials/weekly-plan-art.jpg',
    icon: FiClipboard,
    title: 'Your weekly plan',
    km: 'ផែនការប្រចាំសប្តាហ៍',
    text: 'See the posts the AI planned for next week, change what you want, and approve them.',
    to: '/weekly',
    src: '',
    minutes: null,
  },
  {
    id: 'new-post',
    thumb: '/tutorials/new-post-thumb.jpg',
    art: '/tutorials/new-post-art.jpg',
    icon: FiEdit3,
    title: 'Make a post yourself',
    km: 'បង្កើតប្រកាសដោយខ្លួនឯង',
    text: 'Write or let the AI write a caption, add a picture or video, pick pages and a time.',
    to: '/new',
    src: '',
    minutes: null,
  },
  {
    id: 'studio-video',
    thumb: '/tutorials/studio-video-thumb.jpg',
    art: '/tutorials/studio-video-art.jpg',
    icon: FiFilm,
    title: 'Make a video in the Content studio',
    km: 'បង្កើតវីដេអូក្នុងស្ទូឌីយោ',
    text: 'Pick a template or let the AI design every scene, with a Khmer voice and subtitles.',
    to: '/ai',
    src: '',
    minutes: null,
  },
  {
    id: 'autopilot',
    thumb: '/tutorials/autopilot-thumb.jpg',
    art: '/tutorials/autopilot-art.jpg',
    icon: FiRepeat,
    title: 'Autopilot',
    km: 'ស្វ័យប្រវត្តិ',
    text: 'Let daily posts go out on their own — choose what it posts, when, and who approves.',
    to: '/auto',
    src: '',
    minutes: null,
  },
  {
    id: 'insights',
    thumb: '/tutorials/insights-thumb.jpg',
    art: '/tutorials/insights-art.jpg',
    icon: FiBarChart2,
    title: 'Read your results',
    km: 'អានលទ្ធផលរបស់បង',
    text: 'The numbers for every post, what your audience likes, and what the AI learned.',
    to: '/insights',
    src: '',
    minutes: null,
  },
  {
    id: 'leads',
    thumb: '/tutorials/leads-thumb.jpg',
    art: '/tutorials/leads-art.jpg',
    icon: FiUserCheck,
    title: 'Leads & hand-off',
    km: 'អតិថិជនសក្តានុពល',
    text: 'Messages from your pages and chatbot in one list, passed to the right person.',
    to: '/leads',
    src: '',
    minutes: null,
  },
  {
    id: 'website',
    thumb: '/tutorials/website-thumb.jpg',
    art: '/tutorials/website-art.jpg',
    icon: FiGlobe,
    title: 'Check your website',
    km: 'ពិនិត្យគេហទំព័រ',
    text: 'Health, SEO and speed for your site — with fixes the AI suggests.',
    to: '/website',
    src: '',
    minutes: null,
  },
  {
    id: 'team',
    thumb: '/tutorials/team-thumb.jpg',
    art: '/tutorials/team-art.jpg',
    icon: FiUsers,
    title: 'Invite your team',
    km: 'អញ្ជើញក្រុមការងារ',
    text: 'Add people to your workspace and choose what each of them can use (Settings → Team).',
    to: null,
    src: '',
    minutes: null,
  },
]

/** The YouTube video id in a youtu.be / youtube.com link, or null. */
export function youtubeId(src) {
  const m = String(src || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/)
  return m ? m[1] : null
}
