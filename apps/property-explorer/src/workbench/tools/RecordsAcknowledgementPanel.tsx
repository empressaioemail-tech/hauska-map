// Request acknowledgement — design artboard B (live GIS hits when API wired).

import { Button } from "../../components/Button";
import { PE } from "../../styles/pe-chrome";
import {
  ATOM_ACCENT,
  ATOM_ACCENT_BG,
  ATOM_ACCENT_BORDER,
} from "../../shared/atom-chip/atom-accent";
import { SCAFFOLD_ACK_GIS_HITS, SCAFFOLD_SEARCH_SCOPE } from "./records-request-scaffold-data";
import type { RecordsInstantGisHit } from "./records-request-types";

const APP_INK = PE.ink;
const TEXT = PE.textStrong;
const MUTED = PE.muted2;
const MUTED_2 = PE.muted;
const SLATE = PE.absence;
const BLUE = PE.accent;
const CARD_BORDER = "rgba(154,166,178,0.16)";

export function RecordsAcknowledgementPanel({
  countyName,
  email,
  gisHits,
  gisMode = "scaffold",
  onBack,
  onWatchRun,
}: {
  countyName: string | null;
  email?: string | null;
  /** Live hits from the job's instant GIS query; scaffold mode ignores this. */
  gisHits?: RecordsInstantGisHit[];
  gisMode?: "scaffold" | "live";
  onBack?: () => void;
  onWatchRun?: () => void;
}) {
  const county = countyName ?? "the county";
  const contact = email ?? "your account email";
  const scaffoldHits = SCAFFOLD_ACK_GIS_HITS.map((hit) => ({
    id: hit.id,
    title: hit.title,
    citation: hit.citation,
    mapNote: hit.mapNote,
  }));
  const displayHits = gisMode === "live" ? (gisHits ?? []) : scaffoldHits;
  const showGisResearchingOnly = gisMode === "live" && displayHits.length === 0;

  return (
    <div
      data-testid="records-acknowledgement"
      style={{
        borderRadius: 10,
        border: `1px solid ${CARD_BORDER}`,
        background: APP_INK,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid rgba(59,130,246,0.5)",
            background: "rgba(59,130,246,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            fontSize: 13.5,
            color: BLUE,
          }}
          aria-hidden
        >
          ⌕
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div
            style={{
              fontFamily: "Oxygen, system-ui, sans-serif",
              fontWeight: 600,
              fontSize: 15,
              color: TEXT,
            }}
          >
            Searching the {county} clerk index
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: MUTED_2 }}>
            Runs take 20 minutes to a few hours. You can leave this parcel — the
            result lands in its property records and we email you at{" "}
            <span style={{ color: PE.t3 }}>{contact}</span> when the run
            finishes.
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${CARD_BORDER}`,
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Already known from public GIS
        </div>
        {showGisResearchingOnly ? (
          <div
            data-testid="records-ack-gis-researching"
            style={{ fontSize: 12.5, lineHeight: 1.6, color: MUTED_2 }}
          >
            No public GIS easements intersect this parcel. The clerk index
            search is researching recorded instruments in the background.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayHits.map((hit) => (
              <div
                key={hit.id}
                data-testid={`records-ack-gis-${hit.id}`}
                style={{
                  border: `1px solid ${ATOM_ACCENT_BORDER}`,
                  background: ATOM_ACCENT_BG,
                  borderRadius: 10,
                  padding: "11px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>
                  {hit.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11.5,
                      color: ATOM_ACCENT,
                      border: `1px solid ${ATOM_ACCENT_BORDER}`,
                      background: ATOM_ACCENT_BG,
                      borderRadius: 4,
                      padding: "2px 6px",
                    }}
                  >
                    {hit.citation}
                  </span>
                  <span style={{ fontSize: 11.5, color: SLATE }}>
                    {hit.mapNote}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!showGisResearchingOnly ? (
          <div style={{ fontSize: 11.5, lineHeight: 1.55, color: SLATE }}>
            These come from GIS layers, not from recorded instruments. The clerk
            index search may confirm, correct, or add to them.
          </div>
        ) : null}
      </div>

      <div
        style={{
          borderTop: `1px solid ${CARD_BORDER}`,
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          What will be searched
        </div>
        <div
          data-testid="records-ack-search-scope"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 7,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: PE.t3,
          }}
        >
          {SCAFFOLD_SEARCH_SCOPE.steps.map((step, i) => (
            <div key={step} style={{ display: "flex", gap: 9 }}>
              <span
                style={{
                  color: ATOM_ACCENT,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 11.5,
                  paddingTop: 2,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.55, color: SLATE }}>
          {SCAFFOLD_SEARCH_SCOPE.footer}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back to the parcel
        </Button>
        {onWatchRun ? (
          <Button type="button" variant="ghost" onClick={onWatchRun}>
            Watch the run →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
