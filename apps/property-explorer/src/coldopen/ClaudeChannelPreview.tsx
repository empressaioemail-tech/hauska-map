// apps/property-explorer/src/coldopen/ClaudeChannelPreview.tsx
//
// State 3 of the redesigned sign-in flow (P-247): a mocked conversation
// inside Claude's OWN light shell, built for affiliates to screenshot — the
// design brief calls this screen out as intentionally mocked, unlike states
// 1 and 2, which the mission wires to real parcel data. It is a deliberate
// design-system ISLAND (see ISLAND_PREFIXES in scripts/pe-chrome-kit-gate.mjs):
// it paints Claude's own light UI, never Smart Site's dark chrome, so none of
// its colors are PE tokens.
//
// THE MARK: this repo has no licensed Anthropic/Claude SVG asset anywhere in
// the tree (checked before writing this file). `ClaudeMark` in
// workbench/tools/ClaudeSyncTool.tsx is already shipped in production as a
// drawn, not-licensed approximation of Claude's mark, by that file's own
// documented admission ("If the exact logo is wanted, drop Anthropic's own
// SVG in here and delete this note"). This screen reuses that exact same
// mark rather than drawing a third, different approximation. Dropping the
// real licensed asset in (here and in ClaudeSyncTool) is this lane's
// leave_behind, not something invented under this dispatch.

import { ClaudeMark } from "../workbench/tools/ClaudeSyncTool";

const LIGHT = {
  bg: "#FFFFFF",
  chrome: "#F7F6F3",
  border: "#E5E3DE",
  text: "#1B1B19",
  textMuted: "#6B6A64",
  bubbleUser: "#F0EFEA",
  claude: "#D97757",
  link: "#B75A3D",
};

export function ClaudeChannelPreview({ onBack }: { onBack: () => void }) {
  return (
    <div
      data-testid="claude-channel-preview"
      style={{
        width: "min(720px, calc(100vw - 32px))",
        height: "min(760px, calc(100vh - 32px))",
        background: LIGHT.bg,
        borderRadius: 18,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,.45)",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 20px",
          background: LIGHT.chrome,
          borderBottom: `1px solid ${LIGHT.border}`,
        }}
      >
        <ClaudeMark size={18} />
        <span style={{ fontSize: 14, fontWeight: 600, color: LIGHT.text }}>Claude</span>
        <span style={{ fontSize: 12.5, color: LIGHT.textMuted }}>Smart Site connector</span>
        <button
          type="button"
          data-testid="claude-preview-back"
          onClick={onBack}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${LIGHT.border}`,
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12.5,
            color: LIGHT.textMuted,
            cursor: "pointer",
          }}
        >
          Back to Smart Site
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: LIGHT.bubbleUser, borderRadius: 14, padding: "12px 16px" }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: LIGHT.text }}>
            What can I build on 2005 Goodrich Ave in Austin, and is any of it in a flood zone?
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, maxWidth: "88%" }}>
          <div style={{ flexShrink: 0, paddingTop: 3 }}>
            <ClaudeMark size={16} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: LIGHT.text }}>
              That parcel sits in Austin's SF-3 district, so the setbacks are 25 ft front, 5 ft
              side and 10 ft rear
              <ClaudeCitation label="Austin LDC 25-2-492" />. The buildable envelope figure
              itself is not available yet for this lot; Smart Site draws the setback lines but
              withholds the square-footage figure until that is on record, rather than
              estimating it.
            </p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: LIGHT.text }}>
              The FEMA flood layer shows this parcel outside any mapped special flood hazard
              area<ClaudeCitation label="FEMA NFHL" />. When the record does not say, Smart Site
              says so rather than guessing.
            </p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: LIGHT.textMuted }}>
              Every figure above is cited to the record it came from, for any parcel in the
              Austin metro. Smart Site is connected on your free tier.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${LIGHT.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 40,
            borderRadius: 10,
            border: `1px solid ${LIGHT.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 13.5,
            color: LIGHT.textMuted,
          }}
        >
          Ask Claude about a parcel…
        </div>
      </div>
    </div>
  );
}

function ClaudeCitation({ label }: { label: string }) {
  return (
    <sup style={{ fontSize: 11, color: LIGHT.link, marginLeft: 3, fontWeight: 600 }} aria-label={`source: ${label}`}>
      {label}
    </sup>
  );
}
