import { RiClaudeFill, RiGeminiFill, RiOpenaiFill } from 'react-icons/ri'
import { FiCpu } from 'react-icons/fi'

// Each AI model's maker logo, in its own colour (backend app/ai_models.py
// CATALOG keys / vendors). OpenAI's mark is black — it follows the text colour
// so it stays visible in dark mode.
const LOGOS = {
  openai: { Icon: RiOpenaiFill, className: 'text-ink-900' },
  anthropic: { Icon: RiClaudeFill, style: { color: '#D97757' } },
  google: { Icon: RiGeminiFill, style: { color: '#4F7DF3' } },
}

function vendorOf(model = '', vendor = '') {
  const v = (vendor || '').toLowerCase()
  if (v) return v
  const m = model.toLowerCase()
  if (m.startsWith('gpt') || m.includes('openai')) return 'openai'
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('gemini')) return 'google'
  return ''
}

export default function ModelLogo({ model, vendor, size = 16, className = '' }) {
  const logo = LOGOS[vendorOf(model, vendor)]
  if (!logo) return <FiCpu size={size} className={`flex-none text-ink-400 ${className}`} aria-hidden="true" />
  const { Icon } = logo
  return <Icon size={size} className={`flex-none ${logo.className || ''} ${className}`} style={logo.style} aria-hidden="true" />
}
