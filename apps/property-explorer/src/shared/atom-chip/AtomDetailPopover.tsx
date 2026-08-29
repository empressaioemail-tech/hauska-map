// apps/property-explorer/src/shared/atom-chip/AtomDetailPopover.tsx
//
// Minimal atom-detail popover: fetch-on-tap via fetchAtomByDid, honest
// loading / unavailable states, never a bare confidence number. This is the
// InspectCard-side counterpart to workbench/tools/ChatTool.tsx's
// AtomCardView — same reserved accent, same fetch primitive
// (shared/atom-chip/atom-fetch.ts), deliberately smaller: InspectCard has no
// per-turn thread to anchor a lineage walk in, so this renders claim +
// source + confidence + as-of only, consistent with (not a rebuild of) the
// chat accordion card.

import { useEffect, useState } from "react";
import { PE } from "../../styles/pe-chrome";
import { ATOM_ACCENT_BORDER } from "./atom-accent";
import { fetchAtomByDid, type AtomFetchOutcome } from "./atom-fetch";

const MUTED = PE.t4;
const TEXT = PE.t3;
const DETAIL_BG = PE.line06;

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface PopoverModel {
  entityType: string | null;
  source: string | null;
  confidenceValue: number | null;
  confidenceBasis: string | null;
  asOf: string | null;
  accessPolicy: string | null;
}

function deriveModel(atom: Record<string, unknown>): PopoverModel {
  const readContract = rec(atom.readContract);
  const axes = readContract ? rec(readContract.axes) : null;
  const asserted = axes ? rec(axes.assertedConfidence) : null;
  const confidenceValue = asserted ? num(asserted.estimate) : null;
  const confidenceBasis = asserted ? str(asserted.provenance) : null;
  return {
    entityType: str(atom.entityType),
    source: str(atom.sourceAdapter),
    // NEVER-BARE: a value with no basis is dropped, not shown as a number.
    confidenceValue: confidenceBasis ? confidenceValue : null,
    confidenceBasis,
    asOf: str(atom.asOf) ?? str(atom.extractedAt),
    accessPolicy: str(atom.accessPolicy),
  };
}

export function AtomDetailPopover({
  did,
  label,
}: {
  did: string;
  label: string;
}) {
  const [outcome, setOutcome] = useState<AtomFetchOutcome | "loading">(
    "loading",
  );

  useEffect(() => {
    let live = true;
    setOutcome("loading");
    void fetchAtomByDid(did).then((result) => {
      if (live) setOutcome(result);
    });
    return () => {
      live = false;
    };
  }, [did]);

  const model =
    outcome !== "loading" && outcome.kind === "ok"
      ? deriveModel(outcome.atom)
      : null;
  const degraded = outcome !== "loading" && outcome.kind === "unavailable";
  const loading = outcome === "loading";

  return (
    <div
      data-testid="atom-detail-popover"
      data-did={did}
      style={{
        marginTop: 4,
        padding: "5px 7px",
        borderRadius: 10,
        background: DETAIL_BG,
        border: `1px solid ${ATOM_ACCENT_BORDER}`,
        fontSize: 11.5,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: TEXT }}>{label}</p>
      {loading && (
        <p
          data-testid="atom-detail-loading"
          style={{ margin: "2px 0 0", color: MUTED, fontStyle: "italic" }}
        >
          Loading atom record…
        </p>
      )}
      {degraded && (
        <p
          data-testid="atom-detail-unavailable"
          style={{ margin: "2px 0 0", color: MUTED }}
        >
          Full record unavailable.
        </p>
      )}
      {model && (
        <>
          {model.source && (
            <p style={{ margin: "2px 0 0", color: MUTED }}>{model.source}</p>
          )}
          {model.confidenceValue != null && model.confidenceBasis && (
            <p
              data-testid="atom-detail-confidence"
              style={{ margin: "2px 0 0", color: MUTED }}
            >
              Confidence {model.confidenceValue.toFixed(2)} ·{" "}
              {model.confidenceBasis}
            </p>
          )}
          {model.asOf && (
            <p style={{ margin: "2px 0 0", color: MUTED }}>
              As of {model.asOf.slice(0, 10)}
            </p>
          )}
          {model.accessPolicy && (
            <p style={{ margin: "2px 0 0", color: MUTED, fontSize: 11.5 }}>
              access: {model.accessPolicy}
            </p>
          )}
        </>
      )}
      <code
        style={{
          display: "block",
          marginTop: 2,
          color: MUTED,
          fontSize: 11.5,
          wordBreak: "break-all",
        }}
      >
        {did}
      </code>
    </div>
  );
}
