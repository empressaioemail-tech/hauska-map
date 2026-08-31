// apps/property-explorer/src/lib/claudeSync.ts
//
// P-87 Claude Sync — the push. Pure, so the prompt and both links are testable
// without a browser.
//
// WHAT SYNC CAN AND CANNOT PROMISE. Anthropic documents ONE deep link form for
// a prefilled prompt: the `claude://` scheme, which opens the DESKTOP app
// (support.claude.com "Open Claude Desktop with a link", read 2026-08-31). The
// browser form `https://claude.ai/new?q=` is undocumented, and prefill on web
// chat was reported removed in October 2025. So Sync does not bet on prefill:
// it puts the prompt on the clipboard FIRST and then opens the chat. If the
// composer comes up filled, the clipboard was redundant. If it comes up empty,
// the user pastes. Neither path is broken, and the copy says which happened
// rather than claiming the prompt arrived.
//
// This is a declared degradation, not a silent one. If the web `?q=` form is
// later confirmed working, the clipboard step becomes belt-and-braces and the
// copy can quieten — that is a copy change here, not a redesign.

/** Documented: opens Claude Desktop with the composer prefilled. */
export const CLAUDE_DESKTOP_NEW_CHAT = "claude://claude.ai/new";

/** Undocumented for prefill; always opens a new web chat, which is enough. */
export const CLAUDE_WEB_NEW_CHAT = "https://claude.ai/new";

/**
 * Anthropic documents `q` as truncated at roughly 14,000 characters. Ours is a
 * two-line instruction, so this is a guard against a pathological label rather
 * than a real ceiling.
 */
export const CLAUDE_PROMPT_MAX = 14_000;

export interface SyncSubject {
  parcelNodeId: string;
  /** Resolved display label. Null when we could not resolve one — never guessed. */
  label: string | null;
}

/**
 * The prompt Sync hands Claude.
 *
 * The parcel node id is ALWAYS present and is the operative half: it is what
 * `get_smart_site` takes, so a Claude with the connector can act on this with
 * no further lookup. The label is human orientation only and is included ONLY
 * when it was actually resolved. An unresolved label is omitted rather than
 * substituted with the id dressed up as an address.
 */
export function buildSyncPrompt(subject: SyncSubject): string {
  const { parcelNodeId, label } = subject;
  const named = label && label !== parcelNodeId ? `${label} ` : "";
  const prompt =
    `Open the Smart Site for ${named}(parcel node ${parcelNodeId}) ` +
    `and give me the picture: what it is, what it allows, and what is unresolved.`;
  return prompt.length > CLAUDE_PROMPT_MAX
    ? prompt.slice(0, CLAUDE_PROMPT_MAX)
    : prompt;
}

/** New web chat, prompt attached where it is honoured. */
export function claudeWebChatUrl(prompt: string): string {
  return `${CLAUDE_WEB_NEW_CHAT}?q=${encodeURIComponent(prompt)}`;
}

/** New desktop chat. This form IS documented to prefill. */
export function claudeDesktopChatUrl(prompt: string): string {
  return `${CLAUDE_DESKTOP_NEW_CHAT}?q=${encodeURIComponent(prompt)}`;
}

/**
 * "last seen 4 minutes ago". Returns null for an absent or unparseable stamp,
 * so a missing timestamp renders as nothing rather than as "just now".
 */
export function relativeSeen(
  iso: string | null,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const secs = Math.round((now - then) / 1000);
  // 45, not 90. At a 90-second cutoff the singular branch below is
  // UNREACHABLE: the smallest surviving value rounds to 2. A branch that can
  // never fire is not a nicety, it is dead code that reads as covered.
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
