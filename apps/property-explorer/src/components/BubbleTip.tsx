import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

export type BubbleTipSide = "left" | "right";

const SHOW_MS = 60;

/**
 * Replaces the native `title` tooltip, which is slow and unstyleable.
 *
 * Anchored to the bubble's vertical centre, 11px clear of it, flying INWARD
 * toward the map — a rail on the right edge throws its tips leftward. Opacity
 * arrives in 100ms, the 6px of travel and the 4% of scale take 180ms, and it
 * is `pointer-events: none` at every moment so it can never eat a click meant
 * for the bubble under it.
 */
export function BubbleTip({
  label,
  detail,
  shortcut,
  side,
  children,
}: {
  label: string;
  /** One line of what the tool does. Optional. */
  detail?: string;
  /** A keyboard shortcut, drawn in mono at t6. Optional. */
  shortcut?: string;
  side: BubbleTipSide;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), SHOW_MS);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };

  const fly: CSSProperties =
    side === "left"
      ? {
          right: "calc(100% + 11px)",
          top: "50%",
          transformOrigin: "right center",
        }
      : {
          left: "calc(100% + 11px)",
          top: "50%",
          transformOrigin: "left center",
        };

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? (
        <div
          role="tooltip"
          data-testid="bubble-tip"
          data-pe="bubble-tip"
          data-side={side}
          data-ss-motion=""
          style={{
            position: "absolute",
            zIndex: 40,
            ...fly,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 9,
            maxWidth: 230,
            padding: detail ? "7px 11px" : "6px 11px",
            borderRadius: PE.rTip,
            background: PE.tipBg,
            border: `1px solid ${PE.line14}`,
            boxShadow: PE.shTip,
            pointerEvents: "none",
            whiteSpace: detail ? "normal" : "nowrap",
            animation:
              side === "left"
                ? `pe-tip-left ${PE.dMove} ${PE.ease} both`
                : `pe-tip-right ${PE.dMove} ${PE.ease} both`,
          }}
        >
          <style>{`
            @keyframes pe-tip-right {
              from { opacity: 0; transform: translateY(-50%) translateX(-6px) scale(.96); }
              to   { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
            }
            @keyframes pe-tip-left {
              from { opacity: 0; transform: translateY(-50%) translateX(6px) scale(.96); }
              to   { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-pe="bubble-tip"] { animation: none !important;
                                       transform: translateY(-50%) !important;
                                       transition: opacity ${PE.dState} }
            }
          `}</style>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: PE.t2,
                lineHeight: 1.25,
              }}
            >
              {label}
            </div>
            {detail ? (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: PE.t5,
                }}
              >
                {detail}
              </div>
            ) : null}
          </div>
          {shortcut ? (
            <span
              style={{
                flex: "none",
                fontFamily: PE.mono,
                fontSize: 10,
                color: PE.t6,
              }}
            >
              {shortcut}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
