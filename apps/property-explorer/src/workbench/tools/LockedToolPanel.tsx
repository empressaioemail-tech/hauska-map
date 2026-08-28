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
//
// CHROME v2 restyle only. SPEC section 2 draws a LockedPanel as the tool's REAL
// content under blur(3.5px) behind a veil, with the price on the button. Two
// halves of that are refused here and both refusals are the 2026-08-24 operator
// ruling: the dock shows NO pricing (the ONE pricing modal owns every price),
// and the dock does not render the paid content it is withholding. What v2 does
// bring is the lock glyph, the veil treatment on the notice, and the type ramp.

import { Button } from "../../components/Button";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { PE } from "../../styles/pe-chrome";
import { StateNote } from "../../components/StateNote";
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
      <div data-testid={`${testId}-sign-in`}>
        <StateNote
          register="waiting"
          title="Sign in to use this tool"
          basis={
            signInLine ??
            "Browsing the map and reading the inspect card stays free — an account is what carries a tool's work between sessions."
          }
          action={
            <GoogleSignInButton size="md" testId={`${testId}-sign-in-link`} />
          }
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
    <div
      data-testid={testId}
      data-pro-only={proOnly ? "true" : "false"}
      style={{
        borderRadius: PE.rTip,
        padding: "13px",
        background: "rgba(7,9,13,.55)",
        border: `1px solid ${PE.line14}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          aria-hidden
          fill="none"
          stroke={PE.t4}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: "none" }}
        >
          <path d="M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: PE.t2 }}>
          Locked on this property
        </span>
      </div>
      <p style={{ margin: "0 0 11px", fontSize: 12.5, lineHeight: 1.5, color: PE.t3 }}>
        {valueLine}
      </p>
      {proOnly && proOnlyNote ? (
        <p style={{ margin: "0 0 11px", fontSize: 11.5, lineHeight: 1.45, color: PE.t5 }}>
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
      <p style={{ margin: "9px 0 0", fontSize: 11.5, color: PE.t5 }}>
        The inspect card and map layers stay free.
      </p>
    </div>
  );
}
