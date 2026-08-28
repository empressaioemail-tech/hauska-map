import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

export type BubbleTipSide = "left" | "right";

const SHOW_MS = 60;

/**
 * The rail tooltip. Replaces the native `title`, which is slow and
 * unstyleable.
 *
 * LABEL ONLY — operator ruling 2026-08-27. The second detail line is gone;
 * anything worth saying rides in the label itself ("Reports · new",
 * "Compare · coming soon"). A tooltip that explains a bubble at length is a
 * tooltip doing the job the panel should do, and it made the rail feel heavy
 * on hover.
 *
 * Kit 04 glass: 10% white over a 14px blur with an 18% edge, and a small
 * arrow pointing back at the bubble. It flies INWARD toward the map — a rail
 * on the right throws its tips leftward — 8px of travel in 180ms with the
 * opacity arriving in 100ms, and it is `pointer-events: none` at every moment
 * so it can never eat a click meant for the bubble under it.
 */
export function BubbleTip({
  label,
  shortcut,
  side,
  children,
}: {
  label: string;
  /** A keyboard shortcut, drawn in mono. Only pass one that is actually wired. */
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
      ? { right: "100%", marginRight: 13, top: "50%" }
      : { left: "100%", marginLeft: 13, top: "50%" };

  // The arrow is a rotated square borrowing two edges of the bubble, so it
  // reads as one shape with the tip rather than a pasted-on triangle.
  const arrow: CSSProperties =
    side === "left"
      ? {
          right: -5,
          borderRight: "1px solid rgba(255,255,255,.18)",
          borderTop: "1px solid rgba(255,255,255,.18)",
        }
      : {
          left: -5,
          borderLeft: "1px solid rgba(255,255,255,.18)",
          borderBottom: "1px solid rgba(255,255,255,.18)",
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
            pointerEvents: "none",
            animation:
              side === "left"
                ? `pe-tip-left ${PE.dMove} ${PE.ease} both`
                : `pe-tip-right ${PE.dMove} ${PE.ease} both`,
          }}
        >
          <style>{`
            @keyframes pe-tip-right {
              from { opacity: 0; transform: translateY(-50%) translateX(-8px); }
              to   { opacity: 1; transform: translateY(-50%) translateX(0); }
            }
            @keyframes pe-tip-left {
              from { opacity: 0; transform: translateY(-50%) translateX(8px); }
              to   { opacity: 1; transform: translateY(-50%) translateX(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-pe="bubble-tip"] { animation: none !important;
                                       transform: translateY(-50%) !important }
            }
          `}</style>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "7px 12px",
              borderRadius: PE.rTip,
              background: "rgba(255,255,255,.10)",
              border: "1px solid rgba(255,255,255,.18)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              whiteSpace: "nowrap",
              fontFamily: PE.ui,
              fontSize: 12.5,
              fontWeight: 500,
              color: "#fff",
            }}
          >
            {label}
            {shortcut ? (
              <span
                style={{
                  fontFamily: PE.mono,
                  fontSize: 10,
                  color: "rgba(255,255,255,.6)",
                }}
              >
                {shortcut}
              </span>
            ) : null}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                width: 9,
                height: 9,
                background: "rgba(255,255,255,.10)",
                transform: "translateY(-50%) rotate(45deg)",
                ...arrow,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
