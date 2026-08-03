// apps/property-explorer/src/brand/SmartSiteLockup.tsx
//
// Smart Site brand LOCKUP — the crosshair mark + "SMART SITE" wordmark
// (SMART white, SITE gold #F5B95C). Inlined (no external fetch); renders as a
// flex row of the SmartSiteMark glyph + a styled wordmark so the text stays
// crisp at small sizes and inherits the app's system font stack. Colors +
// composition are 1:1 with the brand package source:
// logo/smart-site-lockup.svg (SMART white, SITE #F5B95C, Oxygen 700).
//
// `size` drives the mark; `fontSize` the wordmark (defaults tuned for the
// corner chip: ~24px mark + 13px wordmark). The wordmark carries a small
// bottom-heavy baseline nudge so the mark and caps optically center.

import { SmartSiteMark } from "./SmartSiteMark";

const SITE_GOLD = "#F5B95C";

export function SmartSiteLockup({
  size = 24,
  fontSize = 13,
  gap = 8,
  className,
  wordmarkColor = "#ffffff",
  title = "Smart Site",
}: {
  size?: number;
  fontSize?: number;
  gap?: number;
  className?: string;
  /** Color of the "SMART" word; "SITE" is always the brand gold. */
  wordmarkColor?: string;
  title?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <SmartSiteMark size={size} />
      <span
        aria-hidden
        style={{
          fontWeight: 700,
          fontSize,
          letterSpacing: "0.14em",
          fontFamily:
            "Oxygen, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: wordmarkColor,
        }}
      >
        SMART <span style={{ color: SITE_GOLD }}>SITE</span>
      </span>
    </span>
  );
}
