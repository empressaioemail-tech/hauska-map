import type { ButtonHTMLAttributes, CSSProperties } from "react";

// Smart Site — one Button component, four variants, styled from pe-tokens.css.
// This replaces the ad-hoc inline-styled action buttons scattered across the
// app (InspectCard, SearchBar, export sections). Styling only — labels and
// behavior come from the call site. Actions are BLUE or NEUTRAL only; gold is
// reserved for the brand mark (crosshair/wordmark) and never renders an action.
//
//   primary   — blue fill (Make subject, Export, Find) — the default action
//   secondary — outline neutral (Save property)
//   ghost     — blue text, no fill (Research this →)
//   subtle    — faint blue tint fill (export-format rows / toolbars)

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
    color: "#f8fafc",
    background: "var(--brand-blue)",
    border: "none",
  },
  secondary: {
    color: "#e6edf3",
    background: "transparent",
    border: "0.5px solid var(--surface-border-soft)",
  },
  ghost: {
    color: "var(--brand-blue)",
    background: "transparent",
    border: "0.5px solid var(--brand-blue-border-soft)",
  },
  subtle: {
    color: "var(--brand-blue)",
    background: "var(--brand-blue-bg)",
    border: "0.5px solid var(--brand-blue-border-soft)",
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
