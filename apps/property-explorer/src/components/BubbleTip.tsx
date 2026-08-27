import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

export type BubbleTipSide = "left" | "right";

const SHOW_MS = 80;

/**
 * Fast fly-out tip for map / workbench bubbles. Replaces the slow native
 * `title` tooltip. Side is the direction the chip flies TOWARD (away from
 * the bubble, over the map).
 */
export function BubbleTip({
  label,
  detail,
  side,
  children,
}: {
  label: string;
  detail?: string;
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
      ? { right: "calc(100% + 10px)", top: "50%", transformOrigin: "right center" }
      : { left: "calc(100% + 10px)", top: "50%", transformOrigin: "left center" };

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
          data-side={side}
          style={{
            position: "absolute",
            zIndex: 40,
            ...fly,
            transform: "translateY(-50%)",
            minWidth: 132,
            maxWidth: 220,
            padding: "7px 10px",
            borderRadius: 8,
            background: PE.card,
            border: PE.border,
            boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            pointerEvents: "none",
            animation:
              side === "left"
                ? "pe-tip-left 140ms ease"
                : "pe-tip-right 140ms ease",
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
          `}</style>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: PE.textStrong,
              lineHeight: 1.25,
            }}
          >
            {label}
          </div>
          {detail ? (
            <div
              style={{
                marginTop: 3,
                fontSize: 10.5,
                lineHeight: 1.35,
                color: PE.muted,
              }}
            >
              {detail}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
