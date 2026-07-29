// R1 PAYWALL — usePropertyEntitlement hook contract (static-markup probe, the
// repo's component-test idiom: effects don't run, so the module cache primed
// via primePropertyEntitlement is what renders).

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "./entitlementClient";
import { usePropertyEntitlement } from "./usePropertyEntitlement";

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

function Probe({ parcelNodeId }: { parcelNodeId: string | null }) {
  const ent = usePropertyEntitlement(parcelNodeId);
  return (
    <div
      data-testid="probe"
      data-status={ent.status}
      data-authenticated={String(ent.authenticated)}
      data-pro={String(ent.pro)}
      data-entitled={String(ent.entitled)}
      data-signed-out={String(ent.signedOut)}
      data-locked={String(ent.locked)}
      data-left={String(ent.freeMessagesLeft)}
      data-soft={String(ent.softFallback)}
    />
  );
}

function probe(parcelNodeId: string | null): string {
  return renderToStaticMarkup(<Probe parcelNodeId={parcelNodeId} />);
}

function state(
  overrides: Partial<PropertyEntitlementState>,
): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    ...overrides,
  };
}

describe("usePropertyEntitlement", () => {
  it("no cached read (or no property) → loading, never locked", () => {
    expect(probe("48021:1")).toContain('data-status="loading"');
    expect(probe("48021:1")).toContain('data-locked="false"');
    expect(probe(null)).toContain('data-status="loading"');
  });

  it("signed-out → signedOut true, locked false (sign-in-first, not the unlock flow)", () => {
    primePropertyEntitlement("48021:1", state({ authenticated: false }));
    const html = probe("48021:1");
    expect(html).toContain('data-signed-out="true"');
    expect(html).toContain('data-locked="false"');
  });

  it("authenticated free → locked with the free-message count", () => {
    primePropertyEntitlement("48021:1", state({ freeMessagesUsed: 2 }));
    const html = probe("48021:1");
    expect(html).toContain('data-locked="true"');
    expect(html).toContain('data-entitled="false"');
    expect(html).toContain('data-left="1"');
  });

  it("per-property unlock → entitled, not locked, not pro", () => {
    primePropertyEntitlement("48021:1", state({ propertyUnlocked: true }));
    const html = probe("48021:1");
    expect(html).toContain('data-entitled="true"');
    expect(html).toContain('data-locked="false"');
    expect(html).toContain('data-pro="false"');
  });

  it("pro → entitled and pro", () => {
    primePropertyEntitlement("48021:1", state({ tier: "paid" }));
    const html = probe("48021:1");
    expect(html).toContain('data-pro="true"');
    expect(html).toContain('data-entitled="true"');
  });

  it("read error NEVER locks (feature-detect / outage soft path — server 402s stay the belt)", () => {
    primePropertyEntitlement(
      "48021:1",
      state({ status: "error", softFallback: true }),
    );
    const html = probe("48021:1");
    expect(html).toContain('data-status="error"');
    expect(html).toContain('data-locked="false"');
    expect(html).toContain('data-signed-out="false"');
  });

  it("entitlement is per property — another parcel stays loading", () => {
    primePropertyEntitlement("48021:1", state({ tier: "paid" }));
    expect(probe("48021:2")).toContain('data-status="loading"');
  });
});
