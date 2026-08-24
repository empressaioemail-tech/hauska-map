// apps/property-explorer/src/workbench/tools/LockedToolPanel.tsx
//
// R1 PAYWALL — the in-dock LOCKED state every paid bubble opens into when the
// proactive entitlement read says "not entitled". 2026-08-24 operator ruling:
// the dock shows NO pricing — only the tool's VALUE LINE plus one button that
// opens THE ONE pricing modal (via the same host.openPaywall capability the
// reactive 402 belt uses, so one modal instance in ExplorerMap serves both).
//
// Signed-out renders the sign-in-first state instead (the existing idiom:
// notice + Google sign-in link, as in the export sections) — entitlement
// flows AFTER sign-in.

import { googleSignInUrl } from "../../lib/auth";
import { useWorkbench } from "../WorkbenchContext";

const TEXT = "var(--text-body, #e5e7eb)";
const MUTED = "var(--surface-muted, #94A3B8)";
const AMBER = "var(--semantic-warning, #F59E0B)"; // locked-state caution (was raw yellow #fcd34d)
const ACCENT = "var(--brand-blue, #3B82F6)"; // PRIMARY interactive hue (was cyan #7dd3fc)

/**
 * The exact arguments the View-pricing button hands to host.openPaywall —
 * a pure function so the wiring is provable in the node test environment
 * (the repo's static-markup idiom cannot fire clicks).
 */
export function lockedPanelPaywallArgs(
  valueLine: string,
  studioOnly: boolean,
): [
  string,
  { studioOnly?: boolean; highlightTier?: "solo" | "studio" | "team" } | undefined,
] {
  return [
    valueLine,
    studioOnly ? { studioOnly: true, highlightTier: "studio" } : undefined,
  ];
}

export function LockedToolPanel({
  valueLine,
  proOnly,
  proOnlyNote,
  signedOut,
  signInLine,
  testId = "tool-locked",
}: {
  /** What this tool is worth — shown above the View-pricing button. */
  valueLine: string;
  /** Studio-only tool (terrain): the modal opens on its Studio-only path. */
  proOnly?: boolean;
  proOnlyNote?: string;
  /** Signed-out → sign-in-first state (no purchase surface yet). */
  signedOut?: boolean;
  /** Sign-in-first copy override (defaults to a generic line). */
  signInLine?: string;
  testId?: string;
}) {
  if (signedOut) {
    return (
      <div data-testid={`${testId}-sign-in`} style={{ fontSize: 11.5 }}>
        <p style={{ margin: "0 0 8px", color: AMBER }}>
          {signInLine ?? "Sign in to use this tool — browsing the map and inspect card stays free."}
        </p>
        <a
          href={googleSignInUrl()}
          data-testid={`${testId}-sign-in-link`}
          style={{ color: ACCENT, fontSize: 11.5 }}
        >
          Sign in with Google
        </a>
      </div>
    );
  }
  return <LockedPanelBody {...{ valueLine, proOnly, proOnlyNote, testId }} />;
}

// The locked (signed-in) body is a separate component so useWorkbench is only
// called on the path that needs the host — every locked-panel render happens
// inside the WorkbenchProvider (the dock tools own this component).
function LockedPanelBody({
  valueLine,
  proOnly,
  proOnlyNote,
  testId,
}: {
  valueLine: string;
  proOnly?: boolean;
  proOnlyNote?: string;
  testId: string;
}) {
  const { host } = useWorkbench();
  return (
    <div data-testid={testId} data-pro-only={proOnly ? "true" : "false"}>
      <p style={{ margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.5, color: TEXT }}>
        {valueLine}
      </p>
      {proOnly && proOnlyNote ? (
        <p style={{ margin: "0 0 10px", fontSize: 10.5, lineHeight: 1.45, color: MUTED }}>
          {proOnlyNote}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="view-pricing-button"
        onClick={() =>
          host.openPaywall(...lockedPanelPaywallArgs(valueLine, proOnly === true))
        }
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "var(--brand-blue, #3B82F6)",
          color: "#f8fafc",
          fontWeight: 600,
          fontSize: 12.5,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        View pricing &amp; unlock
      </button>
      <p style={{ margin: "8px 0 0", fontSize: 10, color: MUTED }}>
        The inspect card and map layers stay free.
      </p>
    </div>
  );
}
