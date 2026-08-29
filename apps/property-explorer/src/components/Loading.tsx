import type { CSSProperties } from "react";
import { PE } from "../styles/pe-chrome";

// NEVER A BARE SPINNER. NEVER A FULL-PANEL SKELETON WITH NO LABELS.
//
// A loading dock shows the REAL field labels it is about to fill, with a
// shimmering bar where each value will land, staggered so the eye reads it as
// one surface filling in rather than six things flashing.
//
// SPEC section 2 also asks for a mono `4 of 7` progress count beside the
// spinner. There is no surface in this app that HAS a real n-of-m to report,
// and a count invented to fill the slot is the fabricated-zero defect wearing
// a different hat. The component is therefore absent rather than dormant. Add
// it back the day something can supply a real count.

/** 12px ring, 1.6px stroke, line-28 with a blue top arc, 700ms linear. */
export function Spinner({ size = 12, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span
      data-pe="spinner"
      data-ss-motion=""
      aria-hidden
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.6px solid ${PE.line28}`,
        borderTopColor: PE.blue,
        animation: "ss-spin 700ms linear infinite",
        ...style,
      }}
    />
  );
}

/**
 * The body of a loading dock: the real labels, with a shimmering bar where the
 * value will land. Rows stagger 120ms apart.
 */
export function LabelledSkeleton({
  labels,
  columns = 1,
}: {
  labels: readonly string[];
  columns?: 1 | 2;
}) {
  return (
    <div
      data-pe="labelled-skeleton"
      data-testid="labelled-skeleton"
      style={{
        display: "grid",
        gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
        gap: "13px 12px",
      }}
    >
      {labels.map((label, i) => (
        <div key={label}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: ".13em",
              textTransform: "uppercase",
              color: PE.t6,
              marginBottom: 4,
            }}
          >
            {label}
          </div>
          <div
            data-ss-motion=""
            aria-hidden
            style={{
              height: 11,
              borderRadius: 3,
              background: PE.line14,
              width: `${72 + ((i * 37) % 26)}%`,
              animation: "ss-shimmer 1.4s ease-in-out infinite",
              animationDelay: `${i * 120}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Three 5px dots blinking 1.2s, staggered 200ms. The chat "typing" state.
 *  No avatar, no mascot, no AI badge. */
export function TypingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <span
      data-pe="typing-dots"
      role="status"
      aria-label={label}
      style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-ss-motion=""
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: PE.t5,
            animation: "ss-blink 1.2s ease-in-out infinite",
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
    </span>
  );
}
