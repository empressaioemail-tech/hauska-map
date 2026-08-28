import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { Button } from "./Button";
import { PE, MOTION } from "../styles/pe-chrome";
import { Card } from "./Card";

// A SHELL FOR PRICING, CHECKOUT AND AUTH — NEVER A PAGE.
//
// Scrim over the live map (the real app dimmed, not a screenshot); clicking it
// closes. One raised card, centred, entering from scale(.97) translateY(6px)
// over 180ms while the scrim crossfades on the same beat.
//
// WIDTH IS A STEP PROPERTY and it ANIMATES over 220ms, because the four money
// and identity surfaces are one modal changing shape rather than four modals:
//   cold open 460 · auth 400 · pricing 660 · checkout 400

export function Modal({
  label,
  onClose,
  width = 460,
  title,
  style,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  label: string;
  onClose: () => void;
  /** The step's width. Changing it animates over 220ms. */
  width?: number;
  /** Optional 40px uppercase header with a close control. */
  title?: ReactNode;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const panel: CSSProperties = {
    width: `min(${width}px, calc(100vw - 32px))`,
    maxHeight: "min(88vh, 860px)",
    overflow: "auto",
    transition: `width ${MOTION.open}`,
    ...style,
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      data-pe="modal-scrim"
      data-ss-motion=""
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PE.scrim,
        padding: 16,
        animation: `ss-fade ${MOTION.move} both`,
      }}
    >
      <Card
        raised
        onClick={stop}
        className="ss-enter-modal pe-scroll"
        data-ss-motion=""
        {...rest}
        style={panel}
      >
        {title ? (
          <div
            data-pe="modal-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 40,
              padding: "0 10px 0 16px",
              borderBottom: `1px solid ${PE.line06}`,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: PE.t3,
              }}
            >
              {title}
            </span>
            <Button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="pe-btn"
              style={{
                width: 24,
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                background: "transparent",
                border: "none",
                color: PE.t5,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width={13}
                height={13}
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
              >
                <path d="M18 6 6 18 M6 6l12 12" />
              </svg>
            </Button>
          </div>
        ) : null}
        {children}
      </Card>
    </div>
  );
}
