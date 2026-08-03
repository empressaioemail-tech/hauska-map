// apps/property-explorer/src/shared/atom-chip/AtomChip.tsx
//
// Minimal, reusable atom-provenance chip: the teal reserved-accent pill,
// tap-to-toggle. Presentational only — no fetch, no card. Used by
// InspectCard's provenance rows (browse/); the chat citation chip in
// workbench/tools/ChatTool.tsx keeps its own richer inline rendering
// (freshness badge, web-unverified split) and is NOT rebuilt on top of this
// component, to keep the extraction mechanical and its tests untouched.

import type { CSSProperties } from "react";
import {
  ATOM_ACCENT,
  ATOM_ACCENT_BG,
  ATOM_ACCENT_BORDER,
  ATOM_ACCENT_CONTRAST,
} from "./atom-accent";

export function AtomChip({
  label,
  isOpen,
  onClick,
  testId = "atom-chip",
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    maxWidth: "100%",
    fontSize: 9.5,
    fontWeight: 600,
    color: isOpen ? ATOM_ACCENT_CONTRAST : ATOM_ACCENT,
    background: isOpen ? ATOM_ACCENT : ATOM_ACCENT_BG,
    border: `1px solid ${isOpen ? ATOM_ACCENT : ATOM_ACCENT_BORDER}`,
    borderRadius: 8,
    padding: "0 5px",
    lineHeight: 1.6,
    cursor: "pointer",
  };
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={isOpen}
      onClick={onClick}
      style={style}
    >
      <svg
        viewBox="0 0 24 24"
        width={8}
        height={8}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6" />
      </svg>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
}
