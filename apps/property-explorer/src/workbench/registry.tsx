// apps/property-explorer/src/workbench/registry.tsx
//
// PE WORKBENCH CHASSIS — the v1 tool registry (WB1). Later waves APPEND here
// (or flip a "coming" entry live) and touch nothing in Workbench.tsx:
//   W2 — reports live (+ brief verdict line, inside the brief tool itself)
//   W3 — chat live (starter chips → atom-cited answers → inline expand)
//   W4 — properties (save/workspace/reopen) + share live
//
// Entry contract: see WorkbenchToolDef in ./types.ts (the pinned API).

import type { WorkbenchToolDef } from "./types";
import { WorkbenchIcon } from "./Workbench";
import { BriefTool } from "./tools/BriefTool";

// Stroke glyphs in the MapToolset icon language (24-viewBox paths).
const ICONS = {
  // Document with folded corner + text lines.
  brief: "M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5",
  // Speech bubble.
  chat: "M4 5h16v11H10l-6 4V5Z",
  // Bar chart.
  reports: "M4 20h16M7 17v-6m5 6V7m5 10v-4",
  // Bookmark (saved properties).
  properties: "M7 3h10v18l-5-4-5 4V3Z",
  // Share nodes.
  share:
    "M18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.2 10.9 15.8 7m-7.6 6.1 7.6 3.9",
} as const;

/**
 * The static v1 registry. Order = cluster order, top to bottom. Exactly one
 * live tool in WB1 (the brief); the rest are registered honestly as coming.
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
    status: "coming",
    propertyScoped: true,
  },
  {
    id: "reports",
    label: "Reports",
    icon: <WorkbenchIcon path={ICONS.reports} />,
    status: "coming",
    propertyScoped: true,
  },
  {
    id: "properties",
    label: "My properties",
    icon: <WorkbenchIcon path={ICONS.properties} />,
    status: "coming",
    propertyScoped: false,
  },
  {
    id: "share",
    label: "Share",
    icon: <WorkbenchIcon path={ICONS.share} />,
    status: "coming",
    propertyScoped: true,
  },
];
