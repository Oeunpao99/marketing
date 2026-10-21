/**
 * The credits icon: a round token with the logo's AI sparkle — a white
 * four-point star in the middle, a small pale one at the corner, a faint ring
 * inside the rim. Flat 2D, in the person's accent colour (Settings →
 * Appearance, lib/theme.js --brand), so it follows their pick in light and
 * dark mode. Colours via style — SVG attributes can't read CSS variables.
 *
 * sparkle: two tiny stars beside the token that blink in turn (cf-twinkle in
 * index.css; still for reduced motion). They take the text colour — the accent
 * by default, `sparkleClass="text-white"` on a coloured card.
 */
const STAR = "M0 -9 C0.9 -2.2 2.2 -0.9 9 0 C2.2 0.9 0.9 2.2 0 9 C-0.9 2.2 -2.2 0.9 -9 0 C-2.2 -0.9 -0.9 -2.2 0 -9 Z";

function Twinkle({ size, className, delay }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      className={`cf-twinkle pointer-events-none absolute ${className}`}
      style={{ animationDelay: delay }}
      aria-hidden="true"
    >
      <path d={STAR} fill="currentColor" />
    </svg>
  );
}

export default function CreditCoin({ size = 18, className = "", sparkle = false, sparkleClass = "text-brand" }) {
  const coin = (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden="true">
      <circle cx="16" cy="16" r="15" style={{ fill: "rgb(var(--brand))" }} />
      <circle cx="16" cy="16" r="11.3" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.3" />
      <path d={STAR} transform="translate(16 16) scale(0.95)" fill="#FFFFFF" />
      <path d={STAR} transform="translate(22.6 9.4) scale(0.3)" style={{ fill: "rgb(var(--brand-soft))" }} />
    </svg>
  );
  if (!sparkle) return coin;
  const s = Math.max(6, Math.round(size * 0.42));
  return (
    <span className={`relative inline-flex flex-none ${sparkleClass}`}>
      {coin}
      <Twinkle size={s} className="-left-1 -top-1" delay="0s" />
      <Twinkle size={Math.max(4, Math.round(s * 0.7))} className="-bottom-0.5 -right-1.5" delay="0.9s" />
    </span>
  );
}
