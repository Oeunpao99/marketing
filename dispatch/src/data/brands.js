export const BRANDS = [
  { id: 'assist', name: 'AI Smart Assistance', lang: 'English', note: 'Product tips, short demos' },
  { id: 'chum', name: 'Chumnouykar', lang: 'Khmer', note: 'Everyday help, community' },
  { id: 'hub', name: 'AI Hub', lang: 'Khmer + English', note: 'News, tools, tutorials' },
]

export const PLAT = {
  facebook: { id: 'facebook', name: 'Facebook', limit: 5000, title: false, as: 'Posts as a Reel' },
  tiktok: { id: 'tiktok', name: 'TikTok', limit: 2200, title: false, as: 'Posts to feed' },
  youtube: { id: 'youtube', name: 'YouTube', limit: 5000, title: true, as: 'Posts as a Short' },
  instagram: { id: 'instagram', name: 'Instagram', limit: 2200, title: false, as: 'Posts as a Reel' },
  telegram: { id: 'telegram', name: 'Telegram', limit: 4096, title: false, as: 'Posts to channel' },
}

export const CH = [
  { id: 'assist-fb', b: 'assist', p: 'facebook', h: 'AI Smart Assistance', s: 'live', m: 'Page token · no expiry', l: 'Yesterday 7:30 PM' },
  { id: 'assist-tt', b: 'assist', p: 'tiktok', h: '@aismartassist', s: 'live', m: 'Refreshes in 41 days', l: 'Yesterday 8:00 PM' },
  { id: 'assist-yt', b: 'assist', p: 'youtube', h: 'AI Smart Assistance', s: 'live', m: 'Refreshes in 22 days', l: '2 days ago' },
  { id: 'chum-fb', b: 'chum', p: 'facebook', h: 'Chumnouykar', s: 'live', m: 'Page token · no expiry', l: 'Today 7:30 AM' },
  { id: 'chum-tt', b: 'chum', p: 'tiktok', h: '@chumnouykar', s: 'live', m: 'Refreshes in 6 days', l: 'Today 8:00 AM' },
  { id: 'chum-yt', b: 'chum', p: 'youtube', h: 'Chumnouykar', s: 'soon', m: 'Token expires in 2 days', l: '3 days ago' },
  { id: 'hub-fb', b: 'hub', p: 'facebook', h: 'AI Hub', s: 'live', m: 'Page token · no expiry', l: 'Yesterday 6:00 PM' },
  { id: 'hub-tt', b: 'hub', p: 'tiktok', h: '@aihub.kh', s: 'live', m: 'Refreshes in 58 days', l: 'Yesterday 8:30 PM' },
  { id: 'hub-yt', b: 'hub', p: 'youtube', h: '—', s: 'off', m: 'Not connected', l: '—' },
]

export const RV = [
  { b: 'chum', ttl: 'How to spot a fake Facebook page', made: 'Written 05:02', len: '0:52' },
  { b: 'assist', ttl: 'Turn a voice note into meeting notes', made: 'Written 05:04', len: '0:41' },
  { b: 'hub', ttl: 'Three free AI tools for students', made: 'Written 05:07', len: '1:03' },
]

export const AU = [
  { b: 'chum', on: true, at: '05:00', n: 2, src: 'Trending in Cambodia + your topic bank', ap: true },
  { b: 'assist', on: true, at: '05:00', n: 1, src: 'Product feature list', ap: true },
  { b: 'hub', on: false, at: '06:00', n: 1, src: 'AI news feeds', ap: true },
]
