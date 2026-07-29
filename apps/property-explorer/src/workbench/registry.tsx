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
import { FloodTool } from "./tools/FloodTool";
import { PropertiesTool } from "./tools/PropertiesTool";
import { ShareTool } from "./tools/ShareTool";
import { CompareTool } from "./tools/CompareTool";

// Stroke glyphs in the MapToolset icon language (24-viewBox paths).
const ICONS = {
  // Document with folded corner + text lines.
  brief: "M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5",
  // Speech bubble.
  chat: "M4 5h16v11H10l-6 4V5Z",
  // Document stack: front sheet with folded corner over a back sheet.
  reports: "M9 3h7l4 4v11H9V3Zm7 0v4h4M5 8v13h11",
  // Water drop (flood & drainage report).
  flood: "M12 3c3.6 4.6 6 8 6 10.8a6 6 0 0 1-12 0C6 11 8.4 7.6 12 3Z",
  // Bookmark (saved properties).
  properties: "M7 3h10v18l-5-4-5 4V3Z",
  // Share nodes.
  share:
    "M18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.2 10.9 15.8 7m-7.6 6.1 7.6 3.9",
  // Two overlapping rectangles (compare).
  compare: "M4 4h11v11H4V4Zm5 5h11v11H9V9Z",
} as const;

/**
 * The static v1 registry. Order = cluster order, top to bottom. As of W4 all
 * five tools are LIVE (brief, chat, reports, properties, share).
 */
export const WORKBENCH_TOOLS: WorkbenchToolDef[] = [
  {
    id: "brief",
    label: "Property brief",
    icon: <WorkbenchIcon path={ICONS.brief} />,
    status: "live",
    propertyScoped: true,
    render: () => <BriefTool />,
  },
  {
    id: "chat",
    label: "AI chat",
    icon: <WorkbenchIcon path={ICONS.chat} />,
    status: "live",
    propertyScoped: true,
    render: () => <ChatTool />,
  },
  {
    id: "reports",
    label: "Reports & exports",
    icon: <WorkbenchIcon path={ICONS.reports} />,
    status: "live",
    propertyScoped: true,
    render: () => <ReportsTool />,
  },
  {
    // R3: FLOOD & DRAINAGE — the FIRST paid report bubble (run-in-dock →
    // sharp viz → Sheet-Standard PDF). Sets the paid-report pattern.
    id: "flood",
    label: "Flood & Drainage",
    icon: <WorkbenchIcon path={ICONS.flood} />,
    status: "live",
    propertyScoped: true,
    render: () => <FloodTool />,
  },
  {
    // W4: saved-properties workspace (server is the truth; deep-proxy routes).
    id: "properties",
    label: "My properties",
    icon: <WorkbenchIcon path={ICONS.properties} />,
    status: "live",
    propertyScoped: false,
    render: () => <PropertiesTool />,
  },
  {
    // W4: share links that carry the analysis (signed one-parcel tokens).
    id: "share",
    label: "Share",
    icon: <WorkbenchIcon path={ICONS.share} />,
    status: "live",
    propertyScoped: true,
    render: () => <ShareTool />,
  },
  {
    // WB7: compare two SAVED properties side by side INSIDE the one dock.
    // Operates on the saved list — works with no active property.
    id: "compare",
    label: "Compare",
    icon: <WorkbenchIcon path={ICONS.compare} />,
    status: "live",
    propertyScoped: false,
    render: () => <CompareTool />,
  },
];
