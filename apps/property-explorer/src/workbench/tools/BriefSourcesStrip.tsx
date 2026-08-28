// The brief dock's SECOND HALF, reduced to what the inspect card above it
// does not already say.
//
// WHY THIS REPLACED A WHOLE PANEL.
//
// The dock stacked two independent surfaces: the inspect card (top) and
// PropertyBriefPanel's full "Property Intel Brief" (bottom). They restated
// each other — buildable %, flood, zoning district and parcel id appeared
// twice — and worse, they CONTRADICTED each other. The card showed
// "SETBACKS F 25 ft · S 5 ft" and "BUILDABLE 43%" while the panel below said
// "Setbacks and buildable envelope not verified here". Both were honest: the
// panel was describing what the R1 BAKED SNAPSHOT contained, not what is true
// of the parcel. Next to populated fields it read as the product disagreeing
// with itself. (Operator 2026-08-28: merge them, one section.)
//
// So the per-section "not verified here" lines are deliberately NOT rendered
// here. They are statements about one report's coverage, and the card above
// is the surface that answers "what do we know about this parcel". Keeping
// them would be repeating a coverage note as if it were a finding.
//
// What DOES survive, because the card cannot say it: where each cited fact
// came from, how old it is, and which run produced this snapshot.
//
// PropertyBriefPanel itself is untouched and still renders in full for
// ShareView, where it is the whole document rather than a second opinion.

import { useState } from "react";
import { Button } from "../../components/Button";
import { PE } from "../../styles/pe-chrome";
import {
  deriveBriefViewModel,
  type ResearchBriefPayload,
} from "../../browse/brief-view-model";

const MUTED = PE.muted2;
const TEXT = PE.text;
const BLUE = PE.accent;

const FRESHNESS_COLOR: Record<string, string> = {
  fresh: PE.ok ?? PE.muted2,
  aging: PE.warning,
  stale: PE.warning,
  unknown: PE.muted2,
};

export function BriefSourcesStrip({
  brief,
}: {
  brief: ResearchBriefPayload;
}) {
  const [openDefs, setOpenDefs] = useState(false);
  const vm = deriveBriefViewModel(brief);
  const explanations = vm.sections
    .filter((s) => s.explanation)
    .map((s) => ({ title: s.title, text: s.explanation as string }));

  return (
    <div data-testid="brief-sources-strip" style={{ marginTop: 14 }}>
      {vm.citations.length > 0 ? (
        <>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: MUTED,
              marginBottom: 6,
            }}
          >
            Sources
          </div>
          {vm.citations.map((c) => (
            <div
              key={`${c.index}:${c.label}`}
              data-testid="brief-source-row"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                padding: "3px 0",
                fontSize: 11.5,
              }}
            >
              <span style={{ color: MUTED, flex: "0 0 auto" }}>[{c.index}]</span>
              {c.url ? (
                <a href={c.url} style={{ color: BLUE, flex: 1 }}>
                  {c.label}
                </a>
              ) : (
                <span style={{ color: TEXT, flex: 1 }}>{c.label}</span>
              )}
              {c.vintage ? (
                <span style={{ color: MUTED, fontFamily: PE.mono }}>
                  {c.vintage.slice(0, 10)}
                </span>
              ) : null}
              <span
                data-testid="brief-source-freshness"
                style={{
                  color: FRESHNESS_COLOR[c.freshness] ?? MUTED,
                  fontSize: 10.5,
                }}
              >
                {c.freshness}
              </span>
            </div>
          ))}
        </>
      ) : null}

      {explanations.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <Button
            type="button"
            data-testid="brief-definitions-toggle"
            aria-expanded={openDefs}
            onClick={() => setOpenDefs((v) => !v)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              height: "auto",
              color: BLUE,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {openDefs ? "Hide definitions" : "What these terms mean"}
          </Button>
          {openDefs ? (
            <div data-testid="brief-definitions" style={{ marginTop: 6 }}>
              {explanations.map((e) => (
                <p
                  key={e.title}
                  style={{
                    margin: "0 0 6px",
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: MUTED,
                  }}
                >
                  <span style={{ color: TEXT }}>{e.title}. </span>
                  {e.text}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Which run produced the snapshot above. The card cannot say this, and
          without it a reader cannot tell a fresh answer from a cached one. */}
      <div
        data-testid="brief-provenance"
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid rgba(154,166,178,0.15)",
          fontSize: 10.5,
          fontFamily: PE.mono,
          color: MUTED,
          lineHeight: 1.6,
          wordBreak: "break-all",
        }}
      >
        {[
          vm.header.source ? `source ${vm.header.source}` : null,
          vm.header.reportFamily ? `report ${vm.header.reportFamily}` : null,
          vm.header.bakedAt ? `baked ${vm.header.bakedAt.slice(0, 19)}Z` : null,
          vm.header.runId ? `run ${vm.header.runId}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}
