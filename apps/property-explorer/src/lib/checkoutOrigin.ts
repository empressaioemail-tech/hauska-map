/**
 * Persist the report/export that started checkout (WDLL item 9).
 * A checkout with no origin must not invent a job.
 */

export const CHECKOUT_ORIGIN_KEY = "pe_checkout_origin";
export const CHECKOUT_PURCHASE_KEY = "pe_checkout_purchase";
export const CHECKOUT_SESSION_KEY = "pe_checkout_session";

export type CheckoutOriginKind = "report" | "export";

export type CheckoutOrigin = {
  kind: CheckoutOriginKind;
  label: string;
  parcelNodeId?: string | null;
  toolId?: string;
};

export type CheckoutPurchase = {
  kind: "subscription" | "unlock";
  tier?: "solo" | "studio" | "team";
  situs?: string | null;
  parcelNodeId?: string | null;
};

export type CustomCheckoutSession = {
  clientSecret: string;
  publishableKey?: string;
  sessionId?: string;
  kind: "subscription" | "unlock";
};

export interface CheckoutOriginStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): CheckoutOriginStore | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function persistCheckoutOrigin(
  origin: CheckoutOrigin,
  store: CheckoutOriginStore | null = defaultStore(),
): void {
  if (!origin.label.trim()) return;
  try {
    store?.setItem(CHECKOUT_ORIGIN_KEY, JSON.stringify(origin));
  } catch {
    /* private mode / quota — origin restore is lost, never invent a job */
  }
}

export function readCheckoutOrigin(
  store: CheckoutOriginStore | null = defaultStore(),
): CheckoutOrigin | null {
  try {
    const parsed = parseJson<CheckoutOrigin>(store?.getItem(CHECKOUT_ORIGIN_KEY) ?? null);
    if (!parsed || (parsed.kind !== "report" && parsed.kind !== "export")) {
      return null;
    }
    if (!parsed.label?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCheckoutOrigin(
  store: CheckoutOriginStore | null = defaultStore(),
): void {
  try {
    store?.removeItem(CHECKOUT_ORIGIN_KEY);
  } catch {
    /* ignore */
  }
}

export function persistCheckoutPurchase(
  purchase: CheckoutPurchase,
  store: CheckoutOriginStore | null = defaultStore(),
): void {
  try {
    store?.setItem(CHECKOUT_PURCHASE_KEY, JSON.stringify(purchase));
  } catch {
    /* ignore */
  }
}

export function readCheckoutPurchase(
  store: CheckoutOriginStore | null = defaultStore(),
): CheckoutPurchase | null {
  try {
    return parseJson<CheckoutPurchase>(store?.getItem(CHECKOUT_PURCHASE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function persistCustomCheckoutSession(
  session: CustomCheckoutSession,
  store: CheckoutOriginStore | null = defaultStore(),
): void {
  if (!session.clientSecret.trim()) return;
  try {
    store?.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function readCustomCheckoutSession(
  store: CheckoutOriginStore | null = defaultStore(),
): CustomCheckoutSession | null {
  try {
    const parsed = parseJson<CustomCheckoutSession>(
      store?.getItem(CHECKOUT_SESSION_KEY) ?? null,
    );
    if (!parsed?.clientSecret?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type KickQueuedJobResult = { kicked: boolean; label?: string };

/**
 * Start the queued report/export only when an origin was persisted.
 * No origin → do not kick (WDLL item 9 violate: "no origin, still kicked").
 */
export function kickQueuedJobIfOrigin(opts: {
  origin?: CheckoutOrigin | null;
  kick: (origin: CheckoutOrigin) => void;
  store?: CheckoutOriginStore | null;
}): KickQueuedJobResult {
  const origin =
    opts.origin !== undefined ? opts.origin : readCheckoutOrigin(opts.store ?? defaultStore());
  if (!origin) {
    return { kicked: false };
  }
  opts.kick(origin);
  return { kicked: true, label: origin.label };
}
