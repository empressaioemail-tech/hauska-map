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
 * WHY THIS HOOK HAS A SCHEDULER AT ALL.
 *
 * It used to be `setInterval(read, 60_000)` on an empty dep array with no
 * guard: it fired for the whole lifetime of the app, signed in or out, tab
 * focused or buried, whether or not records were ever used. On 2026-08-28 the
 * operator hit a 429 on every authenticated surface at once. The cause was
 * this dot. In a 3,000-row sample of that day's cortex-api traffic,
 * `records-request/inbox` was 1,371 rows — about 46 percent of all requests,
 * dwarfing every endpoint a human actually clicks. One tab left open costs
 * ~60 requests an hour doing nothing, and the daily per-user cap is spent by
 * idle tabs before real use gets a share.
 *
 * The comment above still holds: this is an ambient dot, not a progress bar.
 * An ambient dot in a tab nobody is looking at needs no freshness at all.
 */
export interface PollConditions {
  /** Is this tab actually on screen? */
  visible: boolean;
  /** Did the last read reach a records service that answered? */
  wired: boolean;
}

/**
 * How long until the next read, or null to not poll at all. Pure, because
 * this repo proves wiring through helpers rather than through a DOM harness.
 *
 * Hidden wins over wired: a buried tab polls at no cadence whatever, which is
 * the entire point of the fix.
 */
export function pollDelayMs(conditions: PollConditions): number | null {
  if (!conditions.visible) return null;
  if (!conditions.wired) return null;
  return POLL_MS;
}

function documentIsVisible(): boolean {
  // SSR, node tests, and any host without the API are treated as visible, so
  // the absence of the signal never silently disables the dot.
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * The count for the rail. Reads once on mount, then only while this tab is
 * visible and the service answered. Becoming visible again reads immediately,
 * so the dot is current the moment it can be seen, which is also how a tab
 * recovers after a sign-in that happened elsewhere.
 */
export function useRecordsUnread(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Assume wired until a read says otherwise, so the first read always runs.
    let wired = true;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clear();
      if (cancelled) return;
      const delay = pollDelayMs({ visible: documentIsVisible(), wired });
      if (delay === null) return;
      timer = setTimeout(() => void read(), delay);
    };

    const read = async () => {
      try {
        const result = await fetchRecordsInbox();
        if (cancelled) return;
        // `wired: false` is a deployment without the records service, or a
        // signed-out caller. Zero, not a guess — and stop polling something
        // that just told us it has nothing to say.
        wired = result.wired;
        setCount(result.wired ? readyCount(result.rows) : 0);
      } catch {
        // A failed read is not news. Never light the dot on an error.
        if (!cancelled) setCount(0);
      }
      schedule();
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (!documentIsVisible()) {
        clear();
        return;
      }
      // Back on screen: catch up now rather than waiting out a full period.
      void read();
    };

    void read();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clear();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  return count;
}
