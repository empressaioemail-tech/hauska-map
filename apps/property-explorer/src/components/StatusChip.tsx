import type { CSSProperties, HTMLAttributes } from "react";
import { PE } from "../styles/pe-chrome";

export type StatusChipTone = "absence" | "warning" | "info" | "ok";

const TONE: Record<StatusChipTone, CSSProperties> = {
  absence: {
    color: PE.absence,
    background: PE.absenceBg,
    border: `1px dashed ${PE.absenceBorder}`,
  },
  warning: {
    color: PE.warning,
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.4)",
  },
  info: {
    color: PE.accent,
    background: PE.accentBg,
    border: `1px solid ${PE.accentBorderSoft}`,
  },
  ok: {
    color: PE.success,
    background: "rgba(16,185,129,0.12)",
    border: "1px solid rgba(16,185,129,0.35)",
  },
};

export function StatusChip({
  tone = "info",
  style,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusChipTone }) {
  return (
    <span
      {...rest}
      data-pe="status-chip"
      data-tone={tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...TONE[tone],
        ...style,
      }}
    />
  );
}
