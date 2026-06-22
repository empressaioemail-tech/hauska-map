/**
 * Browser-safe signed event-chain verification (mirrors @hauska/atom-contract/conformance).
 */

function sortEventsOldestFirst(events) {
  return [...events].sort((a, b) => {
    const aAt = a.occurredAt instanceof Date ? a.occurredAt : new Date(a.occurredAt);
    const bAt = b.occurredAt instanceof Date ? b.occurredAt : new Date(b.occurredAt);
    const cmp = aAt.getTime() - bAt.getTime();
    if (cmp !== 0) return cmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeChainHash(args) {
  const occurredAt =
    args.occurredAt instanceof Date ? args.occurredAt : new Date(args.occurredAt);
  const stable = JSON.stringify({
    prevHash: args.prevHash,
    payload: args.payload,
    occurredAt: occurredAt.toISOString(),
    eventType: args.eventType,
    actor: args.actor,
  });
  return sha256Hex(stable);
}

/** @param {ReadonlyArray<object>} events */
export async function verifyEventChainBrowser(events) {
  if (!events?.length) {
    return {
      ok: false,
      eventCount: 0,
      checkedEvents: 0,
      errors: [{ kind: "empty-chain", message: "signed event chain is empty" }],
    };
  }
  const ordered = sortEventsOldestFirst(events);
  const errors = [];
  for (let i = 0; i < ordered.length; i++) {
    const event = ordered[i];
    const expectedPrev = i === 0 ? null : ordered[i - 1]?.chainHash ?? null;
    if (i === 0 && event.prevHash !== null) {
      errors.push({
        kind: "genesis-prev-hash",
        eventId: event.id,
        message: `genesis event must have prevHash null; got ${event.prevHash}`,
      });
    }
    if (i > 0 && event.prevHash !== expectedPrev) {
      errors.push({
        kind: "broken-link",
        eventId: event.id,
        message: `prevHash mismatch at event ${event.id}`,
      });
    }
    const recomputed = await computeChainHash({
      prevHash: event.prevHash,
      payload: event.payload,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      actor: event.actor,
    });
    if (recomputed !== event.chainHash) {
      errors.push({
        kind: "hash-mismatch",
        eventId: event.id,
        message: `chainHash mismatch at event ${event.id}`,
      });
    }
  }
  return {
    ok: errors.length === 0,
    eventCount: ordered.length,
    checkedEvents: ordered.length,
    errors,
  };
}
