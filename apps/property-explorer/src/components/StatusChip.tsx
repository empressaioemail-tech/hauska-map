import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

// WORD PLUS COLOUR, NEVER COLOUR ALONE. Every chip carries a readable state
// word; the hue is a second channel on top of it, not the message.
//
// Height 22, padding 0 8, radius 4, label 11.5/600 at normal tracking in
// sentence case, 12px glyph, 6px gap.
//
// "Not on file" is the one dashed chip in the product — absence is drawn as an
// outline that has not been filled in, which is exactly what it means.

export type StatusChipTone =
  | "cited"
  | "provisional"
  | "not-on-file"
  | "failed"
  | "studio"
  // v1 tone names, kept so the surfaces not yet ported keep resolving.
  | "absence"
  | "warning"
  | "info"
  | "ok";

/** A semantic chip: the hue at the 13% fill behind the 34% border, BOTH
 *  DERIVED FROM THE SAME TOKEN as the label colour. The previous form read
 *  the token for `color` and a hardcoded rgb triple for the wash, so a
 *  palette swap left a sage word inside a v2 emerald box on all three tones.
 *  A wash is derived, never spelled. */
const solid = (hue: string): CSSProperties => ({
  color: hue,
  background: `color-mix(in oklab, ${hue} 13%, transparent)`,
  border: `1px solid color-mix(in oklab, ${hue} 34%, transparent)`,
});

const TONE: Record<StatusChipTone, CSSProperties> = {
  cited: solid(PE.ok),
  provisional: solid(PE.warn),
  "not-on-file": {
    color: PE.slate,
    background: "transparent",
    border: `1px dashed ${PE.line28}`,
  },
  failed: solid(PE.err),
  studio: {
    color: PE.blue,
    background: PE.blueBg,
    border: `1px solid ${PE.blueLine}`,
  },
  // legacy aliases
  ok: solid(PE.ok),
  warning: solid(PE.warn),
  absence: {
    color: PE.slate,
    background: "transparent",
    border: `1px dashed ${PE.line28}`,
  },
  info: {
    color: PE.blue,
    background: PE.blueBg,
    border: `1px solid ${PE.blueLine}`,
  },
};

export function StatusChip({
  tone = "studio",
  glyph,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusChipTone;
  /** Optional 12px stroke glyph, drawn in the chip's own colour. */
  glyph?: ReactNode;
}) {
  return (
    <span
      {...rest}
      data-pe="status-chip"
      data-tone={tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px",
        borderRadius: PE.rChip,
        fontFamily: PE.ui,
        fontSize: 11.5,
        fontWeight: 600,
        // DECLARED, not inherited. A chip rendered inside a dock header was
        // picking up that header's .13em tracking and uppercase transform,
        // so the same word read two different ways depending on where it sat.
        // The chip label is sentence case at normal tracking, everywhere.
        letterSpacing: "normal",
        textTransform: "none",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...TONE[tone],
        ...style,
      }}
    >
      {glyph ? (
        <span style={{ display: "inline-flex", flex: "none" }} aria-hidden>
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** A source we could not verify. A 999px pill in t4 with the domain and the
 *  word `unverified`. It NEVER wears atom teal — teal marks an openable
 *  record, and an unverified web source is the opposite of that. */
export function UnverifiedSource({
  domain,
  href,
  testId = "unverified-source",
}: {
  domain: string;
  href?: string;
  testId?: string;
}) {
  const inner = (
    <>
      <svg
        viewBox="0 0 24 24"
        width={11}
        height={11}
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flex: "none" }}
      >
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      </svg>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {domain}
      </span>
      <span style={{ color: PE.t6, fontWeight: 400 }}>unverified</span>
    </>
  );
  const chrome: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 22,
    padding: "0 9px",
    borderRadius: 999,
    border: `1px solid ${PE.line14}`,
    background: "transparent",
    color: PE.t4,
    fontFamily: PE.ui,
    fontSize: 11.5,
    fontWeight: 600,
    lineHeight: 1,
    textDecoration: "none",
    maxWidth: "100%",
  };
  return href ? (
    <a
      data-pe="unverified-source"
      data-testid={testId}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      style={chrome}
    >
      {inner}
    </a>
  ) : (
    <span data-pe="unverified-source" data-testid={testId} style={chrome}>
      {inner}
    </span>
  );
}
