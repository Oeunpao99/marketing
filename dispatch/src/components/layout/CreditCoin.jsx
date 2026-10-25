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

export function Twinkle({ size, className, delay }) {
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

/**
 * The same token as a 3D coin that flips on its vertical axis (cf-coin-flip in
 * index.css): a front and a back face plus a few darker discs between them for
 * the rim's thickness. `delay` staggers coins in a stack. Still for reduced motion.
 */
export function CoinFlip({ size = 28, delay = "0s" }) {
  const depth = Math.max(2, Math.round(size / 9)); // rim thickness in px
  const face = (back) => (
    <span className="absolute inset-0" style={{ transform: `${back ? "rotateY(180deg) " : ""}translateZ(${depth / 2}px)`, backfaceVisibility: "hidden" }}>
      <CreditCoin size={size} />
    </span>
  );
  return (
    <span className="relative inline-block flex-none" style={{ width: size, height: size, perspective: size * 6 }} aria-hidden="true">
      <span className="cf-coin-flip absolute inset-0" style={{ transformStyle: "preserve-3d", animationDelay: delay }}>
        {Array.from({ length: depth + 1 }).map((_, k) => (
          <span key={k} className="absolute inset-0 rounded-full" style={{ background: "rgb(var(--brand-dark))", transform: `translateZ(${k - depth / 2}px)` }} />
        ))}
        {face(false)}
        {face(true)}
      </span>
    </span>
  );
}

export default function CreditCoin({ size = 18, className = "", sparkle = false, sparkleClass = "text-brand dark:text-brand-light" }) {
  const coin = (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden="true">
      <circle cx="16" cy="16" r="15" style={{ fill: "rgb(var(--brand))" }} />
      <circle cx="16" cy="16" r="11.3" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.3" />
      <path d={STAR} transform="translate(16 16) scale(0.95)" fill="#FFFFFF" />
      <path d={STAR} transform="translate(22.6 9.4) scale(0.3)" style={{ fill: "rgb(var(--brand-soft))" }} />
    </svg>
  );
  if (!sparkle) return coin;
  const s = Math.max(8, Math.round(size * 0.55));
  return (
    <span className={`relative inline-flex flex-none ${sparkleClass}`}>
      {coin}
      <Twinkle size={s} className="-left-1.5 -top-1.5" delay="0s" />
      <Twinkle size={Math.max(6, Math.round(s * 0.7))} className="-bottom-1 -right-2" delay="0.9s" />
    </span>
  );
}
