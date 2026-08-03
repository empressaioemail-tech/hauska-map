import type { ButtonHTMLAttributes, CSSProperties } from "react";

// Smart Site — one Button component, four variants, styled from pe-tokens.css.
// This replaces the ad-hoc inline-styled action buttons scattered across the
// app (InspectCard, SearchBar, export sections). Styling only — labels and
// behavior come from the call site. Brand/semantic separation lives in the
// tokens; this component never hardcodes a brand hue.
//
//   primary   — gold fill (Make subject, Export, Find)
//   secondary — outline neutral (Save property)
//   ghost     — gold-light text, no fill (Research this →)
//   subtle    — faint fill (export-format rows / toolbars)

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Dense padding scale for toolbars / tight dock rows. */
  dense?: boolean;
  /** Stretch to the container width (the common InspectCard/export case). */
  fullWidth?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    color: "#0d1117",
    background: "var(--brand-gold)",
    border: "none",
  },
  secondary: {
    color: "#e6edf3",
    background: "transparent",
    border: "0.5px solid var(--surface-border-soft)",
  },
  ghost: {
    color: "var(--brand-gold-light)",
    background: "transparent",
    border: "0.5px solid rgba(245,185,92,0.35)",
  },
  subtle: {
    color: "var(--brand-gold-light)",
    background: "rgba(232,150,59,0.12)",
    border: "0.5px solid rgba(232,150,59,0.3)",
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
  const padding = dense
    ? "var(--btn-pad-y-dense) var(--btn-pad-x-dense)"
    : "var(--btn-pad-y) var(--btn-pad-x)";

  return (
    <button
      {...rest}
      disabled={disabled}
      // `pe-btn` carries the keyboard-accessible :focus-visible ring
      // (--btn-focus-ring, uses --brand-blue) defined in pe-tokens.css.
      className={["pe-btn", rest.className].filter(Boolean).join(" ")}
      data-variant={variant}
      style={{
        padding,
        borderRadius: "var(--btn-radius)",
        fontWeight: 600,
        fontSize: dense ? 12 : 12.5,
        lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? "100%" : undefined,
        transition: "opacity 120ms ease",
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    />
  );
}
