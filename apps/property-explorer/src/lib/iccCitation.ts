/**
 * ICC building-code citation status for consumer deep path (WDLL 31).
 * Live citations only when spine serves I-Code atoms — honest hold otherwise.
 */

export type IccCitationStatus = {
  live: boolean;
  message: string;
};

export function iccCitationStatus(): IccCitationStatus {
  const enabled =
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_ICC_CITATIONS_ENABLED === "true";

  if (enabled) {
    return {
      live: true,
      message: "Building-code answers cite ICC I-Codes when spine serves them.",
    };
  }

  return {
    live: false,
    message:
      "ICC I-Code citations on this surface require ingest credentials on cortex-api (hold list — no fabricated code text).",
  };
}
