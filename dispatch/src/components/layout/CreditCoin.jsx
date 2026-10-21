/**
 * The credits icon: a round token in the logo's blue with its AI sparkle — a
 * white four-point star in the middle, a small light-blue one at the corner,
 * a faint ring inside the rim. Flat 2D, the logo's own colours (fixed, like a
 * logo — the same in light and dark mode).
 */
const STAR = "M0 -9 C0.9 -2.2 2.2 -0.9 9 0 C2.2 0.9 0.9 2.2 0 9 C-0.9 2.2 -2.2 0.9 -9 0 C-2.2 -0.9 -0.9 -2.2 0 -9 Z";

export default function CreditCoin({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#1E6FE8" />
      <circle cx="16" cy="16" r="11.3" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.3" />
      <path d={STAR} transform="translate(16 16) scale(0.95)" fill="#FFFFFF" />
      <path d={STAR} transform="translate(22.6 9.4) scale(0.3)" fill="#8FE3FF" />
    </svg>
  );
}
