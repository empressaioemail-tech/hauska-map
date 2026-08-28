import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { PE, MOTION } from "../styles/pe-chrome";

// Smart Site — one Button component, four variants, styled from pe-tokens.css.
//
// HEIGHT IS THE SPEC; PADDING FALLS OUT OF IT. A primary button is 32px tall
// with a 12/600 label — not 10px 18px of padding around a small word. That one
// change is most of why the v2 chrome reads denser than v1.
//
//   default  32 tall, 14 padding-x, label 12 / 600, radius 6
//   dense    26 tall, 10 padding-x, label 11.5 / 600, radius 6
//
// Actions are BLUE or NEUTRAL only. Gold is the brand mark and never renders
// an action — a gold button is a bug.
//
//   primary   — blue fill (Make subject, Export, Find) — the default action
//   secondary — outline neutral (Save property)
//   ghost     — blue text on a blue hairline (Research this →)
//   subtle    — faint blue tint fill, no border (export-format rows / toolbars)
//
// ONE FILLED PRIMARY PER SURFACE. Two primaries side by side is a bug.
// Press (scale .97), focus ring, hover tint and the disabled .45 opacity all
// live on the `.pe-btn` class in pe-tokens.css so they survive without JS.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Dense scale (26px) for toolbars / tight dock rows. */
  dense?: boolean;
  /** Stretch to the container width, keeping the 32px height. */
  fullWidth?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    color: PE.onBlue,
    background: PE.blue,
    border: `1px solid ${PE.blue}`,
  },
  secondary: {
    color: PE.t2,
    background: "transparent",
    border: `1px solid ${PE.line28}`,
  },
  ghost: {
    color: PE.blue,
    background: "transparent",
    border: `1px solid ${PE.blueLine}`,
  },
  subtle: {
    color: PE.blue,
    background: PE.blueBg,
    border: "1px solid transparent",
  },
};

export function Button({
  variant = "primary",
  dense = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      // `pe-btn` carries press, hover, disabled and the keyboard-only focus
      // ring (--btn-focus-ring) from pe-tokens.css.
      className={["pe-btn", rest.className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-dense={dense ? "1" : undefined}
      data-ss-motion=""
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: dense ? PE.hDense : PE.hControl,
        padding: dense ? "0 10px" : "0 14px",
        borderRadius: PE.rTouch,
        fontFamily: PE.ui,
        fontWeight: 600,
        fontSize: dense ? 11.5 : 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        // Disabled is opacity only — never a colour change, so the control
        // still reads as the action it will be once it is available.
        opacity: disabled ? 0.45 : 1,
        width: fullWidth ? "100%" : undefined,
        transition: `transform ${MOTION.tint}, background ${MOTION.state}, border-color ${MOTION.state}, opacity ${MOTION.state}`,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    />
  );
}
