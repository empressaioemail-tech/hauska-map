// apps/property-explorer/src/coldopen/ReportRow.tsx
//
// One fact row inside the state-2 sample report: a label, then either a
// present value with its citation or the absent chip. The chip is exactly
// the design brief's spec — lower case "reported absent", muted grey, a
// thin solid border, no icon, no red, no warning styling. It is never an
// error or an upgrade prompt.

import type { FactRowView } from "./report-rows";
import { PE } from "../styles/pe-chrome";

export function AbsentChip() {
  return (
    <span
      data-testid="absent-chip"
      style={{
        fontFamily: PE.ui,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "normal",
        textTransform: "none",
        color: PE.t5,
        border: `1px solid ${PE.line14}`,
        borderRadius: 999,
        padding: "5px 10px",
      }}
    >
      reported absent
    </span>
  );
}

export function ReportRow({ row, showDivider = true }: { row: FactRowView; showDivider?: boolean }) {
  return (
    <div
      data-testid="report-row"
      data-row-label={row.label}
      data-row-state={row.state}
      style={{
        padding: "10px 13px",
        borderBottom: showDivider ? `1px solid ${PE.line06}` : "none",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <span style={{ fontFamily: PE.ui, fontSize: 12.5, color: PE.t5 }}>{row.label}</span>
        {row.state === "present" ? (
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: PE.mono, fontSize: 15.5, color: PE.t1 }}>{row.value}</span>
            {row.citation ? <RowCitationLink citation={row.citation} /> : null}
          </span>
        ) : (
          <AbsentChip />
        )}
      </div>
      {row.state === "present" && row.note ? (
        <div style={{ fontFamily: PE.mono, fontSize: 11.5, color: PE.t6 }}>{row.note}</div>
      ) : null}
    </div>
  );
}

function RowCitationLink({ citation }: { citation: NonNullable<FactRowView["citation"]> }) {
  const style = { fontFamily: PE.mono, fontSize: 11.5, lineHeight: 1 } as const;
  if (!citation.href) {
    return <span style={{ ...style, color: PE.t6 }}>{citation.text}</span>;
  }
  return (
    <a href={citation.href} target="_blank" rel="noreferrer noopener" style={{ ...style, color: PE.blue }}>
      {citation.text}
    </a>
  );
}
