// apps/property-explorer/src/workbench/tools/LockedToolPanel.tsx
//
// R1 PAYWALL — the in-dock LOCKED state every paid bubble opens into when the
// proactive entitlement read says "not entitled". The design law holds: the
// bubble still opens the ONE shared dock; the dock shows the tool's VALUE
// LINE + the unified two-choice unlock flow — never a broken/empty state and
// never a second surface.
//
// Signed-out renders the sign-in-first state instead (the existing idiom:
// notice + Google sign-in link, as in the export sections) — entitlement
// flows AFTER sign-in.

import { googleSignInUrl } from "../../lib/auth";
import { UnlockChoices } from "../../browse/UnlockFlow";

const TEXT = "#e5e7eb";
const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const ACCENT = "#7dd3fc";

export function LockedToolPanel({
  parcelNodeId,
  valueLine,
  proOnly,
  proOnlyNote,
  signedOut,
  signInLine,
  onUnlocked,
  testId = "tool-locked",
}: {
  parcelNodeId: string | null;
  /** What this tool is worth — shown above the unlock choices. */
  valueLine: string;
  /** Pro-only tool (terrain): offer ONLY the Pro choice. */
  proOnly?: boolean;
  proOnlyNote?: string;
  /** Signed-out → sign-in-first state (no purchase choices yet). */
  signedOut?: boolean;
  /** Sign-in-first copy override (defaults to a generic line). */
  signInLine?: string;
  onUnlocked?: () => void;
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
  return (
    <div data-testid={testId} data-pro-only={proOnly ? "true" : "false"}>
      <p style={{ margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.5, color: TEXT }}>
        {valueLine}
      </p>
      <UnlockChoices
        parcelNodeId={parcelNodeId}
        proOnly={proOnly}
        proOnlyNote={proOnlyNote}
        onUnlocked={onUnlocked}
      />
      <p style={{ margin: "8px 0 0", fontSize: 10, color: MUTED }}>
        The inspect card and map layers stay free.
      </p>
    </div>
  );
}
