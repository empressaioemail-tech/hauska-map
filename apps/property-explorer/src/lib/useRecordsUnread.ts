import { useEffect, useState } from "react";
import { fetchRecordsInbox, type RecordsInboxRow } from "./recordsRequestClient";

// THE RAIL'S UNREAD SIGNAL.
//
// Kit 04 puts a gold dot on the Reports bubble and labels it "Reports · 2
// ready". That dot has to mean something real. This is the only count in the
// app that can honestly supply it: records-request jobs that have STOPPED
// RUNNING and did not error, i.e. work the user asked for that is now waiting
// for them.
//
// It is derived, never asserted. A signed-out user, an unwired deployment, or
// a failed fetch all resolve to zero, which renders no dot at all — an absent
// dot is the honest answer to "we do not know", and a dot that appears because
// a request failed would be worse than no dot.
//
// NOT a success-literal match. `jobStatus` is an upstream string and guessing
// which spelling means success ("done" / "succeeded" / "complete") would be a
// defaulted binding. Finished-and-clean is derivable without knowing it:
// not queued, not running, no errorCode.

const ACTIVE = new Set(["queued", "running"]);

/** Finished, and finished cleanly. Pure, so the rule is testable. */
export function isReadyForPickup(row: RecordsInboxRow): boolean {
  if (ACTIVE.has(row.jobStatus)) return false;
  if (row.errorCode) return false;
  return true;
}

/** How many finished-clean runs are waiting. Pure. */
export function readyCount(rows: readonly RecordsInboxRow[]): number {
  return rows.filter(isReadyForPickup).length;
}

const POLL_MS = 60_000;

/**
 * The count for the rail. Fetches once on mount and then on a slow poll —
 * slow on purpose: this is an ambient dot, not a progress bar, and it must
 * never become a reason the map feels busy.
 */
export function useRecordsUnread(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const result = await fetchRecordsInbox();
        if (cancelled) return;
        // `wired: false` is a deployment without the records service. Zero,
        // not a guess.
        setCount(result.wired ? readyCount(result.rows) : 0);
      } catch {
        // A failed read is not news. Never light the dot on an error.
        if (!cancelled) setCount(0);
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return count;
}
