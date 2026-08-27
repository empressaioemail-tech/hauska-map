// apps/property-explorer/src/browse/PropertyBriefPanel.tsx
//
// The rendered Property Intel brief — replaces the raw-JSON <pre> dump with a
// professional, layman-readable brief in the Alder design language: every
// rendered fact carries its citation (source label + vintage where the payload
// has them, "source not recorded" otherwise), a grouped citation appendix with
// freshness chips sits at the bottom, and honest-absent sections say so in the
// app's "not verified here" idiom.
//
// Export PDF: routes through the engine X-ray dossier assembler (same
// SHEET_STANDARD PDF as Properties → Export X-ray PDF), not the legacy Alder
// iframe print path.

import { useMemo, useState } from "react";
import {
  deriveBriefViewModel,
  type BriefFact,
  type BriefSectionVM,
  type CitationEntry,
  type FreshnessVerdict,
  type ResearchBriefPayload,
} from "./brief-view-model";
import { humanizeCitationLabel } from "../lib/citation-labels";
import {
  downloadDossierExportResult,
  dossierExportNotice,
  exportBriefAsXrayPdf,
} from "../lib/brief-xray-export";
import type { VerdictTone } from "@empressaio/parcel-fact-sheet";
import {
  useSheetVerdict,
  VERDICT_UNRESOLVED,
} from "../lib/sheet-verdict";
import { Button } from "../components/Button";
import { PE } from "../styles/pe-chrome";

const MUTED = PE.muted;
const AMBER = PE.warning;
const TEXT = PE.text;
const LINK = PE.accent;

/** W2 verdict tones: red flag leads red-ish; caution amber; clean earns green. */
const VERDICT_COLOR: Record<VerdictTone, string> = {
  flag: "#fca5a5",
  caution: AMBER,
  clear: "#4ade80",
};

const FRESHNESS_COLOR: Record<FreshnessVerdict, string> = {
  fresh: "#4ade80",
  aging: "var(--semantic-warning, #F59E0B)",
  stale: "#fca5a5",
  unknown: MUTED,
};

/** DATA-INSPECTION LOOP — the fact-level references.
 *  [n] → anchors to its citation appendix row (#brief-cite-<n>).
 *  Source line → the source label links out to provenance.url when the payload
 *  carries one; when it doesn't, the source shows as plain text and, when there
 *  is no provenance at all, the honest "source not recorded" state. Never a
 *  fabricated URL, never an inert [n]. */
function FactRow({ fact }: { fact: BriefFact }) {
  const sourceLabel = fact.provenance?.source ?? fact.provenance?.url ?? null;
  const sourceUrl = fact.provenance?.url ?? null;
  return (
    <div style={{ margin: "6px 0 8px" }} data-testid="brief-fact">
      <div>
        <span style={{ color: MUTED }}>{fact.label}: </span>
        <span style={{ color: TEXT, fontWeight: 600 }}>{fact.value}</span>
        {fact.citationIndex !== null && (
          <sup style={{ fontSize: 9, marginLeft: 2 }}>
            <a
              href={`#brief-cite-${fact.citationIndex}`}
              data-testid="brief-fact-citeref"
              style={{ color: LINK, textDecoration: "none" }}
            >
              [{fact.citationIndex}]
            </a>
          </sup>
        )}
      </div>
      <div style={{ fontSize: 10, color: MUTED }}>
        {fact.provenance ? (
          <>
            Source:{" "}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="brief-fact-source-link"
                style={{ color: LINK, wordBreak: "break-all" }}
              >
                {sourceLabel}
              </a>
            ) : (
              sourceLabel
            )}
            {fact.provenance.vintage ? ` · vintage ${fact.provenance.vintage}` : ""}
          </>
        ) : (
          <em>source not recorded</em>
        )}
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: BriefSectionVM }) {
  return (
    <section
      style={{ marginTop: 14 }}
      data-testid={`brief-section-${section.id}`}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 12.5,
          color: TEXT,
          borderBottom: "1px solid rgba(154,166,178,0.25)",
          paddingBottom: 3,
        }}
      >
        {section.title}
      </div>
      {section.explanation && (
        <p style={{ margin: "5px 0 2px", fontSize: 10.5, color: MUTED, fontStyle: "italic" }}>
          {section.explanation}
        </p>
      )}
      {section.kind === "absent" ? (
        <p
          data-testid="brief-absent"
          style={{ margin: "6px 0 0", color: "var(--semantic-absence)", fontSize: 11.5 }}
        >
          {section.absentMessage ?? "Not verified here."}
        </p>
      ) : (
        section.facts.map((fact, i) => <FactRow key={`${fact.label}-${i}`} fact={fact} />)
      )}
      {section.notes.map((note) => (
        <p key={note} style={{ margin: "4px 0 0", fontSize: 10.5, color: MUTED, fontStyle: "italic" }}>
          {note}
        </p>
      ))}
    </section>
  );
}

function CitationAppendix({ citations }: { citations: CitationEntry[] }) {
  if (citations.length === 0) {
    return (
      <p style={{ fontSize: 10.5, color: MUTED, margin: "6px 0 0" }}>
        No sources are recorded in this parcel's baked snapshot.
      </p>
    );
  }
  const groups = new Map<string, CitationEntry[]>();
  for (const c of citations) {
    const list = groups.get(c.sectionTitle) ?? [];
    list.push(c);
    groups.set(c.sectionTitle, list);
  }
  return (
    <div data-testid="brief-citations">
      {[...groups.entries()].map(([sectionTitle, rows]) => (
        <div key={sectionTitle} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: MUTED }}>
            {sectionTitle}
          </div>
          {rows.map((row) => (
            <div
              key={row.index}
              id={`brief-cite-${row.index}`}
              data-testid="brief-cite-row"
              style={{ fontSize: 10.5, color: TEXT, margin: "3px 0", scrollMarginTop: 8 }}
            >
              [{row.index}]{" "}
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="brief-cite-link"
                  style={{ color: LINK, wordBreak: "break-all" }}
                >
                  {humanizeCitationLabel(row.label)}
                </a>
              ) : (
                // Honest "source not linked" state — the appendix carries a
                // label but the payload gave no URL. Never a fabricated href.
                <span data-testid="brief-cite-unlinked" title="source not linked">
                  {humanizeCitationLabel(row.label)}
                </span>
              )}
              {" · "}
              <span style={{ color: MUTED }}>
                vintage {row.vintage ?? "(not recorded)"}
              </span>{" "}
              <span
                style={{
                  color: FRESHNESS_COLOR[row.freshness],
                  border: `0.5px solid ${FRESHNESS_COLOR[row.freshness]}`,
                  borderRadius: 4,
                  padding: "0 4px",
                  fontSize: 9.5,
                }}
              >
                {row.freshness}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface PropertyBriefPanelProps {
  brief: ResearchBriefPayload;
  onClose: () => void;
  /** Required for X-ray PDF export (engine dossier route). */
  parcelNodeId?: string;
  /** Optional address/county for the dossier cover sheet. */
  facts?: { address: string | null; countyName: string | null } | null;
  /** When export hits 402, open the unified paywall. */
  onPaywall?: () => void;
  /**
   * WB1: render as DOCK CONTENT inside the workbench dock (static flow, full
   * width, no own chrome — the dock provides position/background/border and
   * owns the × close). Default false keeps the original standalone top-right
   * aside for compatibility.
   */
  embedded?: boolean;
}

export function PropertyBriefPanel({
  brief,
  onClose,
  embedded = false,
  parcelNodeId,
  facts = null,
  onPaywall,
}: PropertyBriefPanelProps) {
  const vm = useMemo(() => deriveBriefViewModel(brief), [brief]);
  // P-39 data-source swap: the headline is the SHEET'S sealed verdict, not a
  // second composition over the brief payload. Same { line, tone } shape, so
  // nothing below this line changes.
  const verdict =
    useSheetVerdict(parcelNodeId ?? brief.parcelNodeId ?? null) ??
    VERDICT_UNRESOLVED;
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportPdf = () => {
    const nodeId = parcelNodeId ?? brief.parcelNodeId;
    if (!nodeId) {
      setExportNotice("Parcel id not recorded — X-ray export unavailable.");
      return;
    }
    setExportBusy(true);
    setExportNotice("Building the X-ray PDF…");
    const resolvedVerdict =
      verdict.line === VERDICT_UNRESOLVED.line ? null : verdict.line;
    void exportBriefAsXrayPdf({
      parcelNodeId: nodeId,
      brief,
      facts,
      verdictLine: resolvedVerdict,
    }).then(
      async (result) => {
        setExportBusy(false);
        if (!result.ok && result.status === 402) {
          setExportNotice(dossierExportNotice(result));
          onPaywall?.();
          return;
        }
        setExportNotice(dossierExportNotice(result));
        if (!result.ok) return;
        try {
          await downloadDossierExportResult(result, nodeId);
        } catch {
          setExportNotice("X-ray downloaded response could not be saved — try again.");
        }
      },
    );
  };

  const headerLine = (label: string, value: string | null) => (
    <div style={{ fontSize: 10, color: MUTED }}>
      {label}: {value ?? "(not recorded)"}
    </div>
  );

  return (
    // Standalone mode: the brief's ORIGINAL top-right aside (natural height,
    // NO internal scrollbar — the page owns any overflow). Embedded mode
    // (WB1): the workbench dock occupies that exact space and provides the
    // chrome, so the brief renders as plain full-width dock content.
    <aside
      data-testid="research-brief"
      data-embedded={embedded ? "true" : undefined}
      style={
        embedded
          ? {
              width: "100%",
              color: TEXT,
              font: "12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            }
          : {
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 8,
              width: "min(400px, calc(100vw - 24px))",
              padding: 14,
              borderRadius: 8,
              color: TEXT,
              background: "rgba(13,17,23,0.94)",
              border: "1px solid rgba(154,166,178,0.35)",
              font: "12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              animation: "pe-brief-in 280ms ease",
            }
      }
    >
      <style>{`@keyframes pe-brief-in {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}`}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>{vm.header.title}</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button
            variant="primary"
            dense
            type="button"
            data-testid="brief-export-pdf"
            onClick={handleExportPdf}
            disabled={exportBusy}
          >
            Export X-ray PDF
          </Button>
          {/* Embedded (dock) mode: the dock header owns the × — no double close. */}
          {!embedded && (
            <button
              type="button"
              aria-label="Close"
              data-testid="brief-close"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: MUTED,
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {exportNotice && (
        <p
          data-testid="brief-export-notice"
          style={{ margin: "6px 0 0", fontSize: 10.5, color: MUTED }}
        >
          {exportNotice}
        </p>
      )}

      {/* W2 VERDICT LINE — the plain-English glance, visually LEADING the
          brief content before any cited detail. Deterministic, payload-only. */}
      <p
        data-testid="brief-verdict"
        data-tone={verdict.tone}
        style={{
          margin: "8px 0 0",
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: 1.45,
          color: VERDICT_COLOR[verdict.tone],
        }}
      >
        {verdict.line}
      </p>

      <div data-testid="brief-provenance" style={{ marginTop: 6 }}>
        {headerLine("Parcel", vm.header.parcelNodeId)}
        {headerLine("Baked at", vm.header.bakedAt)}
        {headerLine("Run", vm.header.runId)}
        {headerLine(
          "Source",
          vm.header.source === "baked-snapshot"
            ? "baked snapshot"
            : vm.header.source,
        )}
        {headerLine("Report", vm.header.reportFamily)}
      </div>

      {vm.sections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}

      {vm.disclosures.length > 0 && (
        <section style={{ marginTop: 14 }} data-testid="brief-disclosures">
          <div
            style={{
              fontWeight: 700,
              fontSize: 12.5,
              color: TEXT,
              borderBottom: "1px solid rgba(154,166,178,0.25)",
              paddingBottom: 3,
            }}
          >
            Disclosures
          </div>
          {vm.disclosures.map((disclosure) => (
            <p key={disclosure} style={{ color: AMBER, margin: "6px 0 0", fontSize: 11 }}>
              {disclosure}
            </p>
          ))}
        </section>
      )}

      <section style={{ marginTop: 14 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 12.5,
            color: TEXT,
            borderBottom: "1px solid rgba(154,166,178,0.25)",
            paddingBottom: 3,
          }}
        >
          Citation appendix
        </div>
        <CitationAppendix citations={vm.citations} />
      </section>
    </aside>
  );
}
