// The share handoff (P-105 items 1 and 2).
//
// A share is the highest-intent moment this product gets: somebody has been
// handed one specific parcel, by someone they trust, and they care about it
// right now. Until P-105 that moment ended in a static document. The bridge
// out of a document and into the live Smart Site panel already existed — it
// is Claude Sync (P-87) — but it lived on the WORKBENCH, which is the
// sharer. The recipient, who is the one with fresh intent, got nothing.
//
// TWO HANDOFFS, AND GIVING BOTH SIDES THE SAME ONE IS THE CATEGORY ERROR.
//
//   A PERSON can click. They get the workbench's handoff verbatim: the same
//   prompt, on the clipboard first, then a new chat. Built by importing
//   src/lib/claudeSync.ts. A second prompt builder was the named defect on
//   this card, so there is exactly one and the test proves both paths emit
//   the same bytes for the same subject.
//
//   A MODEL cannot click, so a claude:// link is meaningless to it and a
//   prompt is worse than meaningless: this body is being read inside
//   somebody else's assistant, and a share that arrives carrying
//   instructions is one screenshot away from being a story about our
//   product injecting prompts into a stranger's model. What a model
//   actually needs is the connector's identity, the parcel node id, and the
//   name of the tool that opens the parcel. That is DATA PLUS AN OFFER. The
//   copy states availability and stops, and pe-share-absence.ts
//   readsAsDirective() is the check that keeps it that way.
//
// So the Sync prompt appears in the HTML body and NEVER in the markdown or
// JSON bodies, and no claude:// URL appears in an agent body at all.

import {
  buildSyncPrompt,
  claudeDesktopChatUrl,
  claudeWebChatUrl,
  SMART_SITE_CONNECT_URL,
  SMART_SITE_CONNECTOR_NAME,
  SMART_SITE_PARCEL_TOOL,
  type SyncSubject,
} from '../../src/lib/claudeSync.js'

export {
  SMART_SITE_CONNECT_URL,
  SMART_SITE_CONNECTOR_NAME,
  SMART_SITE_PARCEL_TOOL,
}

/* -------------------------------------------------------------------------
 * The human half.
 * ---------------------------------------------------------------------- */

export interface ShareSyncHandoff {
  parcelNodeId: string
  /** Resolved display label, or null. Never guessed — buildSyncPrompt drops it. */
  label: string | null
  /** Byte-identical to what the workbench builds for the same subject. */
  prompt: string
  webChatUrl: string
  desktopChatUrl: string
  connectorUrl: string
}

/**
 * The subject the share hands the prompt builder.
 *
 * The parcel node id is the operative half and is always present; the label
 * is the share's own resolved situs address, or null. It is never
 * synthesised from the id, because buildSyncPrompt's whole contract is that
 * an unresolved label is omitted rather than dressed up as an address.
 */
export function shareSyncSubject(instrument: {
  parcelNodeId: string
  property: { situsAddress: string | null }
}): SyncSubject {
  return {
    parcelNodeId: instrument.parcelNodeId,
    label: instrument.property.situsAddress,
  }
}

export function buildShareSyncHandoff(subject: SyncSubject): ShareSyncHandoff {
  const prompt = buildSyncPrompt(subject)
  return {
    parcelNodeId: subject.parcelNodeId,
    label: subject.label,
    prompt,
    webChatUrl: claudeWebChatUrl(prompt),
    desktopChatUrl: claudeDesktopChatUrl(prompt),
    connectorUrl: SMART_SITE_CONNECT_URL,
  }
}

/**
 * Copy for the human handoff.
 *
 * It says what actually happened, both halves, because Anthropic documents
 * prefill only for the claude:// desktop scheme: the clipboard is the
 * certain half and the composer is the maybe half. That is a DECLARED
 * degradation, which is the only kind allowed. Do not quieten this to
 * "sent to Claude" without a measurement showing the web composer fills.
 */
export const SHARE_SYNC_COPY = {
  heading: 'Open this parcel in Claude',
  // "your Claude", not "this browser": the connector is attached to a Claude
  // ACCOUNT, so it follows the person across devices and a browser-scoped
  // sentence would be a false statement about where the capability lives.
  lead: `If your Claude has the ${SMART_SITE_CONNECTOR_NAME} connector, one click opens a chat on this exact parcel with the live panel, not this snapshot.`,
  button: 'Sync to Claude',
  desktopButton: 'Open in the Claude desktop app',
  sent: 'Claude is open in a new tab and the prompt is on your clipboard. Paste it if the chat came up empty.',
  copyFailed:
    'Claude is open, but the prompt could not be copied. Ask it for this property by address.',
  notConnected: `No connector yet? ${SMART_SITE_CONNECT_URL} is the address to add as a custom connector in Claude. Everything on this page is readable without it.`,
} as const

/* -------------------------------------------------------------------------
 * The model half.
 * ---------------------------------------------------------------------- */

export interface ShareConnectorOffer {
  connector: {
    name: string
    url: string
    /** The ONE tool a share may name. See pe-share-absence INTERNAL_TOOL_NAMES. */
    tool: string
    /** The argument the tool takes, named so nothing has to be guessed. */
    argument: 'parcel_node_id'
  }
  parcelNodeId: string
  /** Absolute. A foreign model has no base to resolve a relative path against. */
  liveViewUrl: string
  /** Absolute. The canonical resolvable form of this share. */
  shareUrl: string
  /**
   * Availability, phrased as availability. Never an instruction. Checked by
   * readsAsDirective() in the P-105 suite, in both directions.
   */
  availability: string[]
}

/**
 * WHY THE COPY IS SHAPED LIKE THIS. Every line is a statement of fact about
 * what exists. None of them tells the reading model to do anything. The
 * closing line matters as much as the opening one: it says the document
 * stands on its own, so a model without the connector is not left implying
 * to its user that it is missing something it should go and get.
 */
export function buildShareConnectorOffer(opts: {
  parcelNodeId: string
  liveViewUrl: string
  shareUrl: string
}): ShareConnectorOffer {
  return {
    connector: {
      name: SMART_SITE_CONNECTOR_NAME,
      url: SMART_SITE_CONNECT_URL,
      tool: SMART_SITE_PARCEL_TOOL,
      argument: 'parcel_node_id',
    },
    parcelNodeId: opts.parcelNodeId,
    liveViewUrl: opts.liveViewUrl,
    shareUrl: opts.shareUrl,
    availability: [
      `There is a ${SMART_SITE_CONNECTOR_NAME} connector for assistants at ${SMART_SITE_CONNECT_URL}.`,
      `Where it is connected, the tool ${SMART_SITE_PARCEL_TOOL} takes parcel_node_id ${opts.parcelNodeId} and returns the live Smart Site panel for this parcel, which is richer and fresher than this document.`,
      'Where it is not connected, this document is the whole of what this share carries, and nothing on this page depends on a tool call.',
      'This is stated as availability, not as a request.',
    ],
  }
}

/**
 * The markdown rendering of the offer. JSON carries the same object, so the
 * two cannot disagree about the connector, the tool, or the parcel.
 */
export function renderConnectorOfferMarkdown(offer: ShareConnectorOffer): string[] {
  return [
    `## ${offer.connector.name} connector`,
    '',
    ...offer.availability,
    '',
    `- Connector: ${offer.connector.name}, ${offer.connector.url}`,
    `- Tool: ${offer.connector.tool}`,
    `- ${offer.connector.argument}: ${offer.parcelNodeId}`,
    `- Live view: ${offer.liveViewUrl}`,
    `- This share: ${offer.shareUrl}`,
  ]
}
