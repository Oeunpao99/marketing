import { useId } from "react";

/**
 * The credits icon: a teal coin with a raised dollar sign — a lit face, a
 * darker edge under it for thickness, a soft shine. Its own fixed colours
 * (like a logo), the same in light and dark mode.
 */
export default function CreditCoin({ size = 18, className = "" }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-face`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#8AF5E6" />
          <stop offset="45%" stopColor="#22C3AE" />
          <stop offset="100%" stopColor="#0B8274" />
        </radialGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0E9384" />
          <stop offset="100%" stopColor="#065249" />
        </linearGradient>
      </defs>
      {/* the coin's edge, under the face: its thickness */}
      <circle cx="16" cy="17.6" r="13.2" fill={`url(#${id}-edge)`} />
      <circle cx="16" cy="15.6" r="13.2" fill={`url(#${id}-face)`} />
      {/* a pressed ring inside the rim */}
      <circle cx="16" cy="15.6" r="10.4" fill="none" stroke="#065249" strokeOpacity="0.28" strokeWidth="1.1" />
      <circle cx="16" cy="16.1" r="10.4" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.8" />
      {/* the dollar: a dark copy a little lower, then the light one — embossed */}
      <text x="16" y="21.4" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#065249" fillOpacity="0.55">
        $
      </text>
      <text x="16" y="20.6" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#F2FFFC">
        $
      </text>
      {/* shine */}
      <ellipse cx="11.2" cy="9.4" rx="4.6" ry="2.4" transform="rotate(-28 11.2 9.4)" fill="#FFFFFF" fillOpacity="0.5" />
    </svg>
  );
}
