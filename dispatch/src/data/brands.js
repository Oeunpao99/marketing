// Platform reference config — mirrors backend/app/seed.py's PLATFORMS (and the
// Platform DB model's own fields). Static because adding a real new platform
// always requires a backend integration + code deploy anyway, not just a DB row.
export const PLAT = {
  facebook: { id: 'facebook', name: 'Facebook', limit: 5000, title: false, as: 'Posts as a Reel' },
  tiktok: { id: 'tiktok', name: 'TikTok', limit: 2200, title: false, as: 'Posts to feed' },
  youtube: { id: 'youtube', name: 'YouTube', limit: 5000, title: true, as: 'Posts as a Short' },
  instagram: { id: 'instagram', name: 'Instagram', limit: 2200, title: false, as: 'Posts as a Reel' },
  telegram: { id: 'telegram', name: 'Telegram', limit: 4096, title: false, as: 'Posts to channel' },
}
