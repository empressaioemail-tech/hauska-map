import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { PE, MOTION } from "../styles/pe-chrome";

// Smart Site — one Button component, four variants, styled from pe-tokens.css.
//
// NO BLUE FILL. Operator ruling 2026-08-27, on seeing it live: a slab of
// #3B82F6 is an eyesore against near-black, and it was appearing 20 times
// across 14 files. Kit 04 retires it. Blue survives as an INDICATOR — the
// glyph inside a button, the find bar's focus ring, map selection geometry,
// and inline text actions — never as the ground of a control.
//
// SOLID FILL, NOT TRANSLUCENT. Operator ruling 2026-09-07
// (doc_repo _decisions/2026-09-07_button_fill_translucent_to_solid.md):
// the translucent/glass wash read as inconsistent against surfaces that
// already used a true dark fill. Primary and subtle now sit on the Stone
// "raised" plane, solid, instead of a white-alpha wash. This reverses only
// the opacity choice, not the no-blue-fill rule above: the fill hue still
// comes from the neutral/ink ramp, never --ss-blue.
//
// The strong action is now a quiet one: a solid raised box with a t1
// label and a BLUE GLYPH doing the pointing. It reads as the primary because
// it is the only thing on the surface wearing a glyph and a full-strength
// label, not because it shouts.
//
// HEIGHT IS THE SPEC; PADDING FALLS OUT OF IT.
//   default  32 tall, 14 padding-x, label 12 / 600, radius 6
//   dense    26 tall, 10 padding-x, label 11.5 / 600, radius 6
//
//   primary   — solid raised fill, line-28 edge, t1 label, blue glyph slot
//   secondary — transparent, line-14 edge, t3 label
//   ghost     — transparent, no edge, blue label (inline actions: Retry, links)
//   subtle    — solid raised fill, no edge, t2 label (segment rows, toolbars)
//
// Gold is the brand mark and the rail's unread dot, and is never a button.
// Press, hover, focus and the disabled .45 opacity live on `.pe-btn` in
// pe-tokens.css so they survive without JS.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Dense scale (26px) for toolbars / tight dock rows. */
  dense?: boolean;
  /** Stretch to the container width, keeping the 32px height. */
  fullWidth?: boolean;
  /**
   * A 14px stroke glyph shown before the label. On `primary` it inherits the
   * blue indicator colour; elsewhere it takes the label colour. This is the
   * slot that carries the emphasis the blue fill used to carry.
   */
  glyph?: ReactNode;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    color: PE.t1,
    background: PE.raised,
    border: `1px solid ${PE.line28}`,
  },
  secondary: {
    color: PE.t3,
    background: "transparent",
    border: `1px solid ${PE.line14}`,
  },
  ghost: {
    color: PE.blue,
    background: "transparent",
    border: "1px solid transparent",
  },
  subtle: {
    color: PE.t2,
    background: PE.raised,
    border: "1px solid transparent",
  },
};

export function Button({
  variant = "primary",
  dense = false,
  fullWidth = false,
  glyph,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={["pe-btn", rest.className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-dense={dense ? "1" : undefined}
      data-ss-motion=""
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: dense ? PE.hDense : PE.hControl,
        padding: dense ? "0 10px" : "0 14px",
        borderRadius: PE.rTouch,
        fontFamily: PE.ui,
        fontWeight: 600,
        fontSize: dense ? 11.5 : 12.5,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        // Disabled is opacity only — never a colour change, so the control
        // still reads as the action it will be once it is available.
        opacity: disabled ? 0.45 : 1,
        width: fullWidth ? "100%" : undefined,
        transition: `transform ${MOTION.tint}, background ${MOTION.state}, border-color ${MOTION.state}, color ${MOTION.state}, opacity ${MOTION.state}`,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    >
      {glyph ? (
        <span
          aria-hidden
          className="ss-btn-glyph"
          style={{
            display: "inline-flex",
            flex: "none",
            color: variant === "primary" ? PE.blue : "currentColor",
          }}
        >
          {glyph}
        </span>
      ) : null}
      {children}
    </button>
  );
}
