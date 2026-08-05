// apps/property-explorer/src/lib/usePostCheckoutRefresh.ts
//
// WDLL item 7 — POST-CHECKOUT RECONCILE. The Stripe success redirect lands on
// `/?checkout=success[&parcelNodeId=...]`. The client's entitlement cache may
// still show the PRE-payment state (module cache, or a webhook that hasn't
// landed yet), so this hook:
//
//   1. clears the entitlement cache immediately (the stale read must never
//      keep showing);
//   2. when a `parcelNodeId` rode along on the success URL (both the $15
//      unlock and a Pro upgrade started from a property page carry one),
//      polls the live entitlement read until it reports paid/unlocked, or an
//      honest ~30s timeout — never a silent infinite spinner;
//   3. when no `parcelNodeId` is present (a Pro upgrade started off-property
//      has nothing property-scoped to poll), the cleared cache is enough —
//      the next property opened re-fetches fresh, honestly, by construction;
//   4. strips the `checkout` param either way once reconciled (parcelNodeId
//      is a legitimate deep-link param elsewhere and is left alone).
//
// `reconcilePostCheckout` is the pure async core (no React, every side
// effect injected) so the polling/timeout/strip logic unit-tests without a
// DOM. `usePostCheckoutRefresh` is the thin React wrapper the app uses.

import { useEffect, useState } from "react";
import {
  fetchPropertyEntitlement,
  invalidatePropertyEntitlement,
  isEntitled,
  primePropertyEntitlement,
  type PropertyEntitlementState,
} from "./entitlementClient";

export type PostCheckoutStatus = "idle" | "checking" | "confirmed" | "timeout";

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 30_000;

export function readCheckoutParams(search: string): {
  success: boolean;
  parcelNodeId: string | null;
} {
  const params = new URLSearchParams(search);
  return {
    success: params.get("checkout") === "success",
    parcelNodeId: params.get("parcelNodeId")?.trim() || null,
  };
}

function defaultStrip(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("checkout")) return;
  url.searchParams.delete("checkout");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ReconcilePostCheckoutOpts {
  search: string;
  fetcher?: (parcelNodeId: string) => Promise<PropertyEntitlementState>;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  strip?: () => void;
  onStatusChange?: (status: PostCheckoutStatus) => void;
  /** Injectable so tests never actually sleep — defaults to real setTimeout. */
  sleepImpl?: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
}

/**
 * The pure reconcile core — no React. Returns the final status; also reports
 * every transition via `onStatusChange` (the hook uses this to drive state).
 */
export async function reconcilePostCheckout(
  opts: ReconcilePostCheckoutOpts,
): Promise<PostCheckoutStatus> {
  const { success, parcelNodeId } = readCheckoutParams(opts.search);
  if (!success) {
    opts.onStatusChange?.("idle");
    return "idle";
  }

  const fetcher = opts.fetcher ?? fetchPropertyEntitlement;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const maxWaitMs = opts.maxWaitMs ?? MAX_WAIT_MS;
  const strip = opts.strip ?? defaultStrip;
  const sleepImpl = opts.sleepImpl ?? sleep;
  const cancelled = opts.isCancelled ?? (() => false);

  invalidatePropertyEntitlement();
  opts.onStatusChange?.("checking");

  if (!parcelNodeId) {
    // No property context to poll — the cleared cache re-fetches honestly
    // the next time a property opens.
    if (cancelled()) return "checking";
    strip();
    opts.onStatusChange?.("confirmed");
    return "confirmed";
  }

  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (cancelled()) return "checking";
    const state = await fetcher(parcelNodeId);
    if (cancelled()) return "checking";
    if (state.status === "ready" && isEntitled(state)) {
      primePropertyEntitlement(parcelNodeId, state);
      strip();
      opts.onStatusChange?.("confirmed");
      return "confirmed";
    }
    if (Date.now() - startedAt >= maxWaitMs) {
      // Honest timeout — prime the last read (a slow webhook still
      // reconciles on the NEXT open) and stop polling.
      primePropertyEntitlement(parcelNodeId, state);
      strip();
      opts.onStatusChange?.("timeout");
      return "timeout";
    }
    await sleepImpl(pollIntervalMs);
  }
}

/**
 * Runs once per mount when the URL carries `?checkout=success`. Returns the
 * reconcile status so the caller can show an honest "confirming your
 * purchase" note while `"checking"`.
 */
export function usePostCheckoutRefresh(
  deps: Omit<ReconcilePostCheckoutOpts, "search" | "onStatusChange" | "isCancelled"> & {
    search?: string;
  } = {},
): PostCheckoutStatus {
  const [status, setStatus] = useState<PostCheckoutStatus>("idle");

  useEffect(() => {
    const search =
      deps.search ?? (typeof window !== "undefined" ? window.location.search : "");
    let cancelled = false;
    void reconcilePostCheckout({
      ...deps,
      search,
      onStatusChange: (next) => {
        if (!cancelled) setStatus(next);
      },
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
