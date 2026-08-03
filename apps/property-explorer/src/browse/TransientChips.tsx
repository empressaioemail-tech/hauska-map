// apps/property-explorer/src/browse/TransientChips.tsx
//
// The bottom-left NOTIFICATION area (map UX cluster item 2). Renders the
// host's current ChipSpec[] as transient toasts: appear on state change, stay
// long enough to read (4–8 s scaled with text length), then smoothly fade
// (opacity + translate) and never resurrect for the same unchanged state.
// Lifecycle math lives in transient-chips.ts (pure, unit-tested).
//
// Persistent honesty (degraded layer, not-survey-grade) must ALSO be surfaced
// via the merged layer panel's per-layer state badges — a faded toast is never
// the only home of an honest state.

import { useEffect, useRef, useState } from "react";
import {
  advanceToasts,
  reconcileToasts,
  visibleToasts,
  TOAST_FADE_MS,
  type ChipSpec,
  type ChipSeverity,
  type Toast,
} from "./transient-chips";
import { transientChipsStyle } from "./mobile-layout";
import { useMobilePanel } from "./MobilePanelContext";

const chipStyle = (sev: ChipSeverity): React.CSSProperties => ({
  fontSize: 10.5,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontWeight: 600,
  padding: "3px 9px",
  borderRadius: 5,
  pointerEvents: "none",
  whiteSpace: "nowrap",
  color:
    sev === "error"
      ? "#fca5a5"
      : sev === "warn"
        ? "var(--semantic-warning, #F59E0B)"
        : "var(--surface-muted, #94A3B8)",
  background: "rgba(13,17,23,0.82)",
  border: `0.5px solid ${
    sev === "error"
      ? "rgba(248,113,113,0.55)"
      : sev === "warn"
        ? "rgba(245,158,11,0.5)"
        : "var(--surface-border-rgba, rgba(154,166,178,0.3))"
  }`,
});

/** Keyframes for the enter/exit animations — injected once alongside the tray. */
const TOAST_KEYFRAMES = `
@keyframes pe-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pe-toast-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(6px); }
}
`;

function toastAnimation(t: Toast): React.CSSProperties {
  return t.phase === "leaving"
    ? { animation: `pe-toast-out ${TOAST_FADE_MS}ms ease forwards` }
    : { animation: "pe-toast-in 260ms ease" };
}

export function TransientChips({ chips }: { chips: ChipSpec[] }) {
  const { isMobile } = useMobilePanel();
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Serialize the incoming chip set so the reconcile effect fires on CONTENT
  // change, not on every parent render producing a fresh array identity.
  const signature = JSON.stringify(chips);
  const chipsRef = useRef(chips);
  chipsRef.current = chips;

  useEffect(() => {
    setToasts((prev) => reconcileToasts(prev, chipsRef.current, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Phase clock — only ticks while something is alive.
  const hasLive = toasts.some((t) => t.phase !== "dismissed");
  useEffect(() => {
    if (!hasLive) return;
    const timer = window.setInterval(() => {
      setToasts((prev) => advanceToasts(prev, Date.now()));
    }, 200);
    return () => window.clearInterval(timer);
  }, [hasLive]);

  const drawn = visibleToasts(toasts);

  return (
    <div
      data-testid="live-chips"
      style={transientChipsStyle(isMobile)}
    >
      <style>{TOAST_KEYFRAMES}</style>
      {drawn.map((t) => (
        <span
          key={t.key}
          data-testid={`chip-${t.key}`}
          style={{ ...chipStyle(t.sev), ...toastAnimation(t) }}
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
