import { FaLinkedin } from 'react-icons/fa'
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiYoutube } from 'react-icons/si'

/** Each social platform's logo and colour (a text colour class: charts draw with currentColor). */
export const PLATFORM = {
  facebook: { Icon: SiFacebook, cls: 'text-[#1877F2]', name: 'Facebook' },
  instagram: { Icon: SiInstagram, cls: 'text-[#E4405F]', name: 'Instagram' },
  tiktok: { Icon: SiTiktok, cls: 'text-ink-900', name: 'TikTok' },
  youtube: { Icon: SiYoutube, cls: 'text-[#FF0000]', name: 'YouTube' },
  telegram: { Icon: SiTelegram, cls: 'text-[#229ED9]', name: 'Telegram' },
  linkedin: { Icon: FaLinkedin, cls: 'text-[#0A66C2]', name: 'LinkedIn' },
}
