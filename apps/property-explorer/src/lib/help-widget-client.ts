// Property Explorer Help widget client (P-118 / A-093).
//
// A SEPARATE surface from chat-research.ts (the per-property, tier-gated
// chat wired to ChatTool.tsx). This widget answers platform questions —
// pricing, tiers, navigation — for anyone, signed in or not, with no
// parcel scope and no session requirement.
//
// Route: reuses the EXISTING generic anonymous-safe cortex proxy
// (api/spine.ts, /api/spine/cortex/*) rather than adding a new serverless
// function — hauska-map is already dense with per-purpose functions (see
// pe-site-plan-export.ts's own comment on the Vercel function-count
// discipline), and spine.ts already does exactly what this needs: attach
// CORTEX_SERVICE_API_KEY server-side and forward to cortex, no browser
// credential of any kind required. Only a one-line addition to spine.ts's
// browse allowlist was needed (POST api/pe-help/chat) — see spine.ts.
//
// credentials are deliberately OMITTED (no `credentials: "include"`): unlike
// gtmClient.ts's calls to /api/pe-gtm, this route never reads a session
// cookie and must behave identically for a browser that has none.

export const HELP_WIDGET_ENDPOINT = "/api/spine/cortex/api/pe-help/chat";

export interface HelpWidgetTurn {
  role: "user" | "assistant";
  content: string;
}

export type HelpWidgetOutcome =
  | { kind: "answer"; message: string }
  | { kind: "error"; message: string };

/**
 * Send one Help-widget turn. Never throws — a network/parse failure comes
 * back as an honest `{ kind: "error" }` outcome so the widget can show a
 * true "couldn't reach the assistant" state instead of a fabricated answer.
 */
export async function sendHelpWidgetMessage(
  message: string,
  history: HelpWidgetTurn[],
): Promise<HelpWidgetOutcome> {
  try {
    const res = await fetch(HELP_WIDGET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok || typeof body.message !== "string") {
      return {
        kind: "error",
        message:
          typeof body.message === "string" && body.message
            ? body.message
            : "Could not reach the assistant — try again.",
      };
    }
    return { kind: "answer", message: body.message };
  } catch {
    return {
      kind: "error",
      message: "Could not reach the assistant — check your connection and try again.",
    };
  }
}
