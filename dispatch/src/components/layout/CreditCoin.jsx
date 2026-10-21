/**
 * The credits icon: a flat gold coin with a dollar sign — a solid face, a
 * thin darker ring inside the rim, no shine or thickness (2D). Its own fixed
 * colours (like a logo), the same in light and dark mode.
 */
export default function CreditCoin({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#F5B922" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="#D99A0B" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11" fill="#FFCD3C" stroke="#D99A0B" strokeWidth="1.3" />
      <text x="16" y="21.3" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#A86D00">
        $
      </text>
    </svg>
  );
}
