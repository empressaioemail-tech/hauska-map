// apps/property-explorer/src/browse/brief-print-html.ts
//
// Pure-string HTML renderer for the "Export PDF" path of the Property Intel
// brief — the ported Alder design (legacy-design-tools briefingHtml.ts): a
// self-contained Letter-format document with @page margin boxes, a cover-style
// provenance header, per-section pages, and a grouped citation appendix with
// color-coded freshness verdicts. No Puppeteer, no PDF library — the panel
// loads this HTML into a hidden iframe and calls print(), so "Save as PDF"
// in the browser's print dialog produces the document.
//
// Kept pure-string (testable without a browser) exactly as Alder split its
// renderer from the Puppeteer wrapper.

import type {
  BriefFact,
  BriefSectionVM,
  BriefViewModel,
  CitationEntry,
} from "./brief-view-model";

/**
 * HTML escape — applied to every interpolated value so payload text can never
 * break out of the template. Ported verbatim from Alder briefingHtml.ts.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

const HEADER_TEXT = "Property Intel Brief";
const FOOTER_TEXT = "Baked snapshot — approximate, not survey grade";
const ACCENT = "#00b4d8";

function renderHead(vm: BriefViewModel): string {
  const title = vm.header.parcelNodeId
    ? `${HEADER_TEXT} — ${vm.header.parcelNodeId}`
    : HEADER_TEXT;
  return `<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page {
    size: Letter;
    margin: 0.85in 0.7in 0.95in 0.7in;
    @top-left { content: "${esc(HEADER_TEXT)}"; font-family: Arial, sans-serif; font-size: 8pt; color: #888; }
    @bottom-center { content: "${esc(FOOTER_TEXT)}"; font-family: Arial, sans-serif; font-size: 8pt; color: #888; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, sans-serif; font-size: 8pt; color: #888; }
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
    color: #111;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 24pt; margin: 0 0 0.4em; font-weight: 600; color: ${ACCENT}; }
  h2 { font-size: 16pt; margin: 0 0 0.6em; font-weight: 600; }
  .subtitle { font-size: 14pt; color: #444; margin: 0.2em 0; }
  .meta { color: #555; font-size: 10pt; line-height: 1.7; margin-top: 1.6em; }
  .meta div { margin: 0; }
  .section { page-break-inside: avoid; margin-bottom: 1.4em; }
  .explanation { color: #555; font-size: 9.5pt; font-style: italic; margin: 0 0 0.7em; }
  .fact-row { margin: 0.35em 0 0.55em; padding-bottom: 0.3em; border-bottom: 1px dotted #ddd; page-break-inside: avoid; }
  .fact-row .label { font-weight: 600; }
  .fact-row .value { }
  .fact-row .source-line { color: #555; font-size: 9pt; }
  .fact-row .source-line .no-source { font-style: italic; }
  .absent { color: #6b5d00; background: #fdf7e0; padding: 0.4em 0.7em; border-radius: 4px; font-size: 10pt; }
  .note { color: #444; font-size: 9.5pt; margin: 0.3em 0 0; font-style: italic; }
  .disclosure { color: #8a5a00; background: #fdf3d8; padding: 0.4em 0.7em; border-radius: 4px; font-size: 9.5pt; margin: 0.4em 0; }
  .appendix-tier { margin-bottom: 1.2em; page-break-inside: avoid; }
  .appendix-tier h3 { font-size: 12pt; margin: 1.2em 0 0.4em; font-weight: 600; }
  .appendix-row { margin: 0.35em 0 0.6em; padding-bottom: 0.35em; border-bottom: 1px dotted #ddd; }
  .appendix-row .label { font-weight: 600; }
  .appendix-row .meta-line { color: #555; font-size: 9.5pt; }
  .freshness-fresh { color: #1f7a3a; }
  .freshness-aging { color: #b27a00; }
  .freshness-stale { color: #b1361b; }
  .freshness-unknown { color: #555; }
  .cite-ref { font-size: 8pt; vertical-align: super; color: ${ACCENT}; }
  a { color: #0b6aa8; word-break: break-all; }
</style>
</head>`;
}

function renderCover(vm: BriefViewModel, exportedAt: Date): string {
  const h = vm.header;
  const line = (label: string, value: string | null): string =>
    `<div>${esc(label)}: ${value ? esc(value) : "(not recorded)"}</div>`;
  return `<section class="page" data-page="cover">
  <h1>${esc(HEADER_TEXT)}</h1>
  <div class="subtitle">${h.parcelNodeId ? esc(h.parcelNodeId) : "(parcel node id not recorded)"}</div>
  <div class="meta">
    ${line("Parcel node id", h.parcelNodeId)}
    ${line("Report family", h.reportFamily)}
    ${line("Mode", h.mode)}
    ${line("Source", h.source)}
    ${line("Baked at", h.bakedAt)}
    ${line("Run id", h.runId)}
    <div>Sections: ${vm.sections.length}</div>
    <div>Sources cited: ${vm.citations.length}</div>
    <div>Exported: ${esc(formatTimestamp(exportedAt))}</div>
  </div>
</section>`;
}

function renderFact(fact: BriefFact): string {
  const ref =
    fact.citationIndex !== null
      ? `<span class="cite-ref">[${fact.citationIndex}]</span>`
      : "";
  const sourceLine = fact.provenance
    ? `<div class="source-line">Source: ${esc(fact.provenance.source ?? (fact.provenance.url ?? ""))}${
        fact.provenance.vintage ? ` · vintage ${esc(fact.provenance.vintage)}` : ""
      }</div>`
    : `<div class="source-line"><span class="no-source">source not recorded</span></div>`;
  return `<div class="fact-row">
    <span class="label">${esc(fact.label)}:</span>
    <span class="value">${esc(fact.value)}</span>${ref}
    ${sourceLine}
  </div>`;
}

function renderSection(section: BriefSectionVM): string {
  const explanation = section.explanation
    ? `<p class="explanation">${esc(section.explanation)}</p>`
    : "";
  const body =
    section.kind === "absent"
      ? `<div class="absent">${esc(section.absentMessage ?? "Not verified here.")}</div>`
      : section.facts.map(renderFact).join("\n  ");
  const notes = section.notes
    .map((note) => `<p class="note">${esc(note)}</p>`)
    .join("\n  ");
  return `<section class="section" data-section="${esc(section.id)}">
  <h2>${esc(section.title)}</h2>
  ${explanation}
  ${body}
  ${notes}
</section>`;
}

function renderAppendix(citations: CitationEntry[]): string {
  if (citations.length === 0) {
    return `<section class="page" data-page="appendix">
  <h2>Citation appendix</h2>
  <p class="meta">No sources are recorded in this parcel's baked snapshot.</p>
</section>`;
  }
  // Group by section title, preserving first-seen order (Alder-style tiers).
  const groups = new Map<string, CitationEntry[]>();
  for (const c of citations) {
    const list = groups.get(c.sectionTitle) ?? [];
    list.push(c);
    groups.set(c.sectionTitle, list);
  }
  const blocks: string[] = [];
  for (const [sectionTitle, rows] of groups) {
    const rowMarkup = rows
      .map(
        (r) => `<div class="appendix-row">
      <div class="label">[${r.index}] ${esc(r.label)}</div>
      <div class="meta-line">${r.url ? `<a href="${esc(r.url)}">${esc(r.url)}</a> · ` : ""}vintage: ${r.vintage ? esc(r.vintage) : "(not recorded)"} · <span class="freshness-${esc(r.freshness)}">freshness: ${esc(r.freshness)}</span></div>
    </div>`,
      )
      .join("\n    ");
    blocks.push(`<div class="appendix-tier">
    <h3>${esc(sectionTitle)}</h3>
    ${rowMarkup}
  </div>`);
  }
  return `<section class="page" data-page="appendix">
  <h2>Citation appendix</h2>
  <p class="meta" style="margin-top:0.2em">Cited sources grouped by report section. Freshness: fresh &lt; 90 days, aging &lt; 365 days, stale &ge; 365 days, from each source's vintage (or the snapshot bake date when the source carries none).</p>
  ${blocks.join("\n  ")}
</section>`;
}

function renderDisclosures(disclosures: string[]): string {
  if (disclosures.length === 0) return "";
  return `<section class="section" data-section="disclosures">
  <h2>Disclosures</h2>
  ${disclosures.map((d) => `<div class="disclosure">${esc(d)}</div>`).join("\n  ")}
</section>`;
}

/** Render the full brief as a self-contained printable HTML document. */
export function renderBriefPrintHtml(
  vm: BriefViewModel,
  exportedAt: Date = new Date(),
): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    renderHead(vm),
    "<body>",
    renderCover(vm, exportedAt),
    ...vm.sections.map(renderSection),
    renderDisclosures(vm.disclosures),
    renderAppendix(vm.citations),
    "</body>",
    "</html>",
  ].join("\n");
}
