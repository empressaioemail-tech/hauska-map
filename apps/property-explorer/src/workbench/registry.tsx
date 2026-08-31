// apps/property-explorer/src/workbench/registry.tsx
//
// PE WORKBENCH CHASSIS — the v1 tool registry (WB1). Later waves APPEND here
// (or flip a "coming" entry live) and touch nothing in Workbench.tsx:
//   W2 — DONE: reports live ("Reports & exports" — site-plan + terrain exports
//        moved off the inspect card) + brief verdict line (inside the brief
//        tool's PropertyBriefPanel itself)
//   W3 — chat live (starter chips → atom-cited answers → inline expand)
//   W4 — properties (save/workspace/reopen) + share live (DONE below)
//
// Entry contract: see WorkbenchToolDef in ./types.ts (the pinned API).

import type { WorkbenchToolDef } from "./types";
import { WorkbenchIcon } from "./Workbench";
import { BriefTool } from "./tools/BriefTool";
import { ChatTool } from "./tools/ChatTool";
import { ReportsTool } from "./tools/ReportsTool";
import { PropertiesTool } from "./tools/PropertiesTool";
import { ShareTool } from "./tools/ShareTool";
import { ClaudeMark, ClaudeSyncTool } from "./tools/ClaudeSyncTool";
import { CompareTool } from "./tools/CompareTool";

// Stroke glyphs in the MapToolset icon language (24-viewBox paths).
const ICONS = {
  // Document with folded corner + text lines.
  brief: "M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5",
  // Speech bubble.
  chat: "M4 5h16v11H10l-6 4V5Z",
  // Document stack: front sheet with folded corner over a back sheet.
  reports: "M9 3h7l4 4v11H9V3Zm7 0v4h4M5 8v13h11",
  // Bookmark (saved properties).
  properties: "M7 3h10v18l-5-4-5 4V3Z",
  // iOS share — tray with an arrow flying out the top.
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  // Claude Sync has NO entry here. Every other bubble is a stroke glyph in
  // currentColor that takes the rail's rest/hover/open ramp; the Claude mark is
  // a filled vendor logo in its own colour and is rendered by <ClaudeMark />
  // instead. Do not add a stroke path for it -- a vendor mark that recolours on
  // hover stops reading as that vendor's mark.
  // Two overlapping rectangles (compare).
  compare: "M4 4h11v11H4V4Zm5 5h11v11H9V9Z",
} as const;

/**
 * The static v1 registry. Rail order = cluster order, top to bottom. SEVEN
 * rail bubbles (brief, chat, reports, properties, share, Claude Sync, compare).
 * The inspect card opens inside the brief dock. Flood stays in Reports.
 */
export const WORKBENCH_TOOLS: WorkbenchToolDef[] = [
  {
    id: "brief",
    label: "Property brief",
    icon: <WorkbenchIcon path={ICONS.brief} />,
    status: "live",
    propertyScoped: true,
    tip: "Inspect card and cited research for this parcel.",
    render: () => <BriefTool />,
  },
  {
    id: "chat",
    label: "AI chat",
    icon: <WorkbenchIcon path={ICONS.chat} />,
    status: "live",
    propertyScoped: true,
    tip: "Ask about this property. Answers come back cited.",
    render: () => <ChatTool />,
  },
  {
    id: "reports",
    label: "Reports & exports",
    icon: <WorkbenchIcon path={ICONS.reports} />,
    status: "live",
    // NOT property-scoped: the filed-report library is account-wide and stays
    // readable with no parcel. But the generator needs one, so the header
    // pill is opted into explicitly.
    propertyScoped: false,
    promptsForProperty: true,
    tip: "Site plan, flood study, records, and X-ray PDF.",
    render: () => <ReportsTool />,
  },
  {
    id: "properties",
    label: "My properties",
    icon: <WorkbenchIcon path={ICONS.properties} />,
    status: "live",
    propertyScoped: false,
    tip: "Saved parcels, notes, and drawings.",
    render: () => <PropertiesTool />,
  },
  {
    id: "share",
    label: "Share",
    icon: <WorkbenchIcon path={ICONS.share} />,
    status: "live",
    propertyScoped: true,
    tip: "A link that carries this property's analysis.",
    render: () => <ShareTool />,
  },
  {
    // ID STAYS `use-in-ai` THOUGH THE CARD IS NOW "Claude Sync". The id is the
    // key for persisted dock layouts and per-tool state in localStorage;
    // renaming it silently orphans every saved layout in the field for a
    // cosmetic gain. The label is what the user reads.
    id: "use-in-ai",
    label: "Claude Sync",
    icon: <ClaudeMark />,
    status: "live",
    propertyScoped: false,
    expandable: false,
    tip: "Push this property into a new Claude chat.",
    render: () => <ClaudeSyncTool />,
  },
  {
    id: "compare",
    label: "Compare",
    icon: <WorkbenchIcon path={ICONS.compare} />,
    status: "live",
    propertyScoped: false,
    tip: "Two saved properties, side by side.",
    render: () => <CompareTool />,
  },
];
