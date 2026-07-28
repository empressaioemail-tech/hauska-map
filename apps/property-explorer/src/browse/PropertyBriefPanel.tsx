// apps/property-explorer/src/browse/PropertyBriefPanel.tsx
//
// The rendered Property Intel brief — replaces the raw-JSON <pre> dump with a
// professional, layman-readable brief in the Alder design language: every
// rendered fact carries its citation (source label + vintage where the payload
// has them, "source not recorded" otherwise), a grouped citation appendix with
// freshness chips sits at the bottom, and honest-absent sections say so in the
// app's "not verified here" idiom.
//
// Export PDF: no server round-trip — the brief renders into a hidden iframe
// styled with the ported Alder @page print CSS (Letter, margin boxes,
// page-break rules, cover-style header) and calls print(). "Save as PDF" in
// the browser's dialog produces the clean multi-section document, no map
// chrome. Dependency-free.

import { useEffect, useMemo, useRef } from "react";
import {
  deriveBriefViewModel,
  type BriefFact,
  type BriefSectionVM,
  type CitationEntry,
  type FreshnessVerdict,
  type ResearchBriefPayload,
} from "./brief-view-model";
import { renderBriefPrintHtml } from "./brief-print-html";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";

const FRESHNESS_COLOR: Record<FreshnessVerdict, string> = {
  fresh: "#4ade80",
  aging: "#fcd34d",
  stale: "#fca5a5",
  unknown: MUTED,
};

function FactRow({ fact }: { fact: BriefFact }) {
  return (
    <div style={{ margin: "6px 0 8px" }} data-testid="brief-fact">
      <div>
        <span style={{ color: MUTED }}>{fact.label}: </span>
        <span style={{ color: TEXT, fontWeight: 600 }}>{fact.value}</span>
        {fact.citationIndex !== null && (
          <sup style={{ color: "#7dd3fc", fontSize: 9, marginLeft: 2 }}>
            [{fact.citationIndex}]
          </sup>
        )}
      </div>
      <div style={{ fontSize: 10, color: MUTED }}>
        {fact.provenance ? (
          <>
            Source: {fact.provenance.source ?? fact.provenance.url}
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
          style={{ margin: "6px 0 0", color: AMBER, fontSize: 11.5 }}
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
            <div key={row.index} style={{ fontSize: 10.5, color: TEXT, margin: "3px 0" }}>
              [{row.index}]{" "}
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#7dd3fc", wordBreak: "break-all" }}
                >
                  {row.label}
                </a>
              ) : (
                row.label
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
}

export function PropertyBriefPanel({ brief, onClose }: PropertyBriefPanelProps) {
  const vm = useMemo(() => deriveBriefViewModel(brief), [brief]);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Drop the hidden print iframe on unmount so an exported frame never leaks.
  useEffect(() => {
    return () => {
      printFrameRef.current?.remove();
      printFrameRef.current = null;
    };
  }, []);

  const handleExportPdf = () => {
    const html = renderBriefPrintHtml(vm, new Date());
    // Hidden same-origin iframe: write the ported Alder print document into it
    // and print. The browser dialog's "Save as PDF" produces the file — no
    // popup blocker involved, no server round-trip, no pdf lib.
    printFrameRef.current?.remove();
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
    printFrameRef.current = frame;
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      printFrameRef.current = null;
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    // Give the freshly-written document a beat to lay out before printing.
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    }, 150);
  };

  const headerLine = (label: string, value: string | null) => (
    <div style={{ fontSize: 10, color: MUTED }}>
      {label}: {value ?? "(not recorded)"}
    </div>
  );

  return (
    <aside
      data-testid="research-brief"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 9,
        width: "min(400px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        padding: 14,
        borderRadius: 8,
        color: TEXT,
        background: "rgba(13,17,23,0.94)",
        border: "1px solid rgba(154,166,178,0.35)",
        font: "12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
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
          <button
            type="button"
            data-testid="brief-export-pdf"
            onClick={handleExportPdf}
            style={{
              background: "rgba(125,211,252,0.12)",
              border: "0.5px solid rgba(125,211,252,0.4)",
              color: "#7dd3fc",
              borderRadius: 5,
              padding: "2px 8px",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Export PDF
          </button>
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
        </div>
      </div>

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
