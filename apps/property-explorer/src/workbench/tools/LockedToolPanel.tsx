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

import { Button } from "../../components/Button";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { PE } from "../../styles/pe-chrome";
import { useWorkbench } from "../WorkbenchContext";

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
        <p style={{ margin: "0 0 8px", color: PE.warning }}>
          {signInLine ?? "Sign in to use this tool — browsing the map and inspect card stays free."}
        </p>
        <GoogleSignInButton
          size="md"
          testId={`${testId}-sign-in-link`}
        />
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
      <p style={{ margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.5, color: PE.text }}>
        {valueLine}
      </p>
      {proOnly && proOnlyNote ? (
        <p style={{ margin: "0 0 10px", fontSize: 10.5, lineHeight: 1.45, color: PE.muted }}>
          {proOnlyNote}
        </p>
      ) : null}
      <Button
        variant="primary"
        fullWidth
        type="button"
        data-testid="view-pricing-button"
        onClick={() =>
          host.openPaywall(...lockedPanelPaywallArgs(valueLine, proOnly === true))
        }
      >
        Unlock this property, 30 days
      </Button>
      <p style={{ margin: "8px 0 0", fontSize: 10, color: PE.muted }}>
        The inspect card and map layers stay free.
      </p>
    </div>
  );
}
