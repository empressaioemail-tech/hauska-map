// apps/property-explorer/src/lib/aiConnectionClient.ts
//
// P-87 Claude Sync — is Claude connected to this account?
//
// The Smart Site MCP server writes one row per (account, MCP client) when a
// client names itself on the JSON-RPC `initialize`. Claude performs that
// handshake the instant a custom connector finishes OAuth approval, so this
// read flips from "not connected" to "connected" when the user finishes setup,
// not when they first ask Claude something.
//
// EVERY UNKNOWN RESOLVES TOWARD SETUP. A 404 (endpoint not deployed), a 500, a
// network failure and a signed-out session are four different outcomes and are
// kept apart here, but the card renders all of them as its setup state. That
// is the fail-closed direction for this control: showing someone how to
// connect costs them nothing, whereas showing a Sync button for a connection
// that was never made hands them a control that silently does nothing.
//
// There is NO local "I connected it" flag anywhere in this file on purpose. A
// self-declared connection is exactly the check that cannot fail.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";

const AI_CONNECTIONS_PATH = "api/property-explorer/v1/ai-connections";

export interface AiConnection {
  client: string;
  clientVersion: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export type AiConnectionsOutcome =
  | { kind: "ready"; connections: AiConnection[]; claude: AiConnection | null }
  /** Signed out. Not the same as connected-to-nothing. */
  | { kind: "sign-in" }
  /**
   * Signed IN, but the same-origin deep proxy refused to forward this path.
   * That is a misconfiguration of ours (the path is missing from
   * api/_lib/deep-allowlist.ts), NEVER a fact about the user's account.
   *
   * This exists as its own outcome because collapsing it into `sign-in` is
   * exactly how the card shipped dead: 403 read as "not signed in", which the
   * card rendered as setup instructions, which is indistinguishable from an
   * honest "you have not connected Claude yet". Two account pairs were tested
   * against it before anyone could tell the difference.
   */
  | { kind: "blocked" }
  /** Endpoint not deployed yet. Not the same as no connections. */
  | { kind: "not-built" }
  | { kind: "error"; message: string };

function parseConnection(raw: unknown): AiConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const client = typeof r.client === "string" ? r.client.trim() : "";
  // A connection with no client name is dropped, never rendered as "unknown".
  // The server does not write one; if one ever appears, it is not shown.
  if (!client) return null;
  return {
    client,
    clientVersion: typeof r.clientVersion === "string" ? r.clientVersion : null,
    firstSeenAt: typeof r.firstSeenAt === "string" ? r.firstSeenAt : null,
    lastSeenAt: typeof r.lastSeenAt === "string" ? r.lastSeenAt : null,
  };
}

/** Pure. Shape a response body into the outcome, or null when unreadable. */
export function parseAiConnections(
  body: unknown,
): { connections: AiConnection[]; claude: AiConnection | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.connections)) return null;
  const connections = b.connections
    .map(parseConnection)
    .filter((c): c is AiConnection => c !== null);
  return { connections, claude: parseConnection(b.claude) };
}

export async function fetchAiConnections(): Promise<AiConnectionsOutcome> {
  let res: Response;
  try {
    res = await fetch(`${CORTEX_DEEP_PROXY_BASE}/${AI_CONNECTIONS_PATH}`, {
      credentials: "include",
    });
  } catch {
    return { kind: "error", message: "Could not reach the account service." };
  }

  // 401 and 403 are DIFFERENT FACTS and must not be merged. 401 is "no
  // session cookie reached the proxy". 403 is "you are signed in and we
  // refused our own path".
  if (res.status === 401) return { kind: "sign-in" };
  if (res.status === 403) return { kind: "blocked" };
  if (res.status === 404) return { kind: "not-built" };
  if (!res.ok) {
    return {
      kind: "error",
      message: `Account service returned ${res.status}.`,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      kind: "error",
      message: "Account service returned an unreadable body.",
    };
  }

  const parsed = parseAiConnections(body);
  if (!parsed) {
    return {
      kind: "error",
      message: "Account service returned an unexpected shape.",
    };
  }
  return { kind: "ready", ...parsed };
}
