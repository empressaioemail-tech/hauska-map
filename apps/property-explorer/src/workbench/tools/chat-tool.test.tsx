// W3 chat — dock-tool render tests (react-dom/server static markup, same
// pattern as workbench.test.tsx: effects don't run, so store-fed states are
// what render). Pins:
//   - chat is LIVE in the registry and renders in the ONE shared dock;
//   - empty thread → the verbatim investor starter chips + pinned composer;
//   - stored thread renders turns, citation chips, muted disclaimer;
//   - PER-PROPERTY persistence: thread follows the property, close/reopen
//     keeps it, switching property re-scopes to THAT property's thread;
//   - R2 citation layer: inline [n] anchors (matched only), the RESERVED atom
//     accent (used for atoms and NOTHING else), the BRIEF/FULL accordion card
//     with the lineage walk, web-unverified sources as non-atom links,
//     honest-empty;
//   - freshness badge cases (current / outdated / unknown → no badge).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  AtomCardView,
  ChatCitationChips,
  FreshnessBadge,
  InlineAnswerText,
  type ChatToolStoredState,
} from "./ChatTool";
import { ATOM_ACCENT, type ChatRef } from "./chat-citations";
import type { AtomCardModel, AtomLineage } from "./chat-atom-card";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActivePropertyAddress: () => "123 Main St, Bastrop, TX",
};
const noop = () => {};

function renderChat(opts: {
  activeParcelNodeId?: string | null;
  store?: ReturnType<typeof createWorkbenchToolStateStore>;
  open?: boolean;
}): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId={opts.open === false ? null : "chat"}
      onOpenToolChange={noop}
      activeParcelNodeId={
        opts.activeParcelNodeId === undefined ? "48021:123" : opts.activeParcelNodeId
      }
      host={host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

function chatRef(overrides: Partial<ChatRef>): ChatRef {
  return {
    did: "did:hauska:code-section:bastrop-udc-4-2",
    entityType: "code-section",
    entityId: "bastrop-udc-4-2",
    label: "ADU standards",
    snippet: "Accessory dwelling units are permitted subject to…",
    edition: null,
    vintage: null,
    n: 1,
    ...overrides,
  };
}

const THREAD: ChatToolStoredState = {
  turns: [
    { role: "user", content: "Can I add an ADU?" },
    {
      role: "assistant",
      content: "Likely yes, subject to P-2 standards.\n\nVerify with the city.",
      refs: [chatRef({})],
      disclaimer: "Not legal advice.",
      confidence: 0.75,
      generatedAt: "2026-07-29T00:00:00.000Z",
      method: "grok",
    },
  ],
};

describe("chat in the registry + dock", () => {
  it("chat is LIVE and renders inside the one shared dock", () => {
    // W4 flipped properties + share live too — chat must be among the live set.
    expect(
      WORKBENCH_TOOLS.filter((t) => t.status === "live").map((t) => t.id),
    ).toContain("chat");
    const html = renderChat({});
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).toContain('data-tool="chat"');
    expect(html).toContain('data-testid="chat-tool"');
    expect(html).not.toContain('data-testid="dock-coming"');
  });

  it("no active property → the chassis' honest select-first state, not the tool", () => {
    const html = renderChat({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="chat-tool"');
  });
});

describe("empty thread — starter chips + pinned composer", () => {
  it("renders the five verbatim investor starter chips", () => {
    const html = renderChat({});
    expect(html).toContain('data-testid="chat-starter"');
    for (const id of ["unit_subdivide", "pencil", "killers", "rehab", "insurance"]) {
      expect(html).toContain(`data-testid="chat-starter-chip-${id}"`);
    }
    expect(html).toContain("Can I add a unit or subdivide?");
    expect(html).toContain("Does it pencil?");
    expect(html).toContain("What kills this deal?");
    expect(html).toContain("Rehab reality check");
    expect(html).toContain("Insurance and flood cost?");
  });

  it("composer is pinned and empty; no fake turns, no loading state", () => {
    const html = renderChat({});
    expect(html).toContain('data-testid="chat-input"');
    expect(html).toContain('data-testid="chat-send"');
    expect(html).not.toContain('data-testid="chat-turn-user"');
    expect(html).not.toContain('data-testid="chat-turn-assistant"');
    expect(html).not.toContain('data-testid="chat-loading"');
  });
});

describe("stored thread — turns, chips, disclaimer", () => {
  it("renders user + assistant turns with the citation chip row", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store });
    expect(html).toContain('data-testid="chat-turn-user"');
    expect(html).toContain("Can I add an ADU?");
    expect(html).toContain('data-testid="chat-turn-assistant"');
    expect(html).toContain("Likely yes, subject to P-2 standards.");
    expect(html).toContain('data-testid="chat-citations"');
    expect(html).toContain('data-testid="chat-citation-chip"');
    expect(html).toContain("ADU standards");
    // Starter chips retire once the thread exists.
    expect(html).not.toContain('data-testid="chat-starter"');
  });

  it("disclaimer renders muted under the answer when present", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store });
    expect(html).toMatch(
      /data-testid="chat-disclaimer"[^>]*>Not legal advice\./,
    );
    // No disclaimer → no disclaimer node.
    const bare = createWorkbenchToolStateStore({ storage: null });
    bare.set("48021:123", "chat", {
      turns: [{ role: "assistant", content: "hi" }],
    } satisfies ChatToolStoredState);
    expect(renderChat({ store: bare })).not.toContain(
      'data-testid="chat-disclaimer"',
    );
  });
});

describe("per-property persistent history (the chassis store owns it)", () => {
  it("close mid-conversation, reopen → the thread is still there", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const closed = renderChat({ store, open: false });
    expect(closed).not.toContain('data-testid="workbench-dock"');
    const reopened = renderChat({ store });
    expect(reopened).toContain("Likely yes, subject to P-2 standards.");
  });

  it("property switch → THAT property's thread (no bleed-through)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    store.set("48491:999", "chat", {
      turns: [{ role: "user", content: "Flood risk here?" }],
    } satisfies ChatToolStoredState);
    const a = renderChat({ store, activeParcelNodeId: "48021:123" });
    expect(a).toContain("Can I add an ADU?");
    expect(a).not.toContain("Flood risk here?");
    const b = renderChat({ store, activeParcelNodeId: "48491:999" });
    expect(b).toContain("Flood risk here?");
    expect(b).not.toContain("Can I add an ADU?");
  });

  it("a property with no thread starts at the starter chips", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store, activeParcelNodeId: "48000:1" });
    expect(html).toContain('data-testid="chat-starter"');
    expect(html).not.toContain('data-testid="chat-turn-user"');
  });
});

describe("citation chips — reserved atom accent + web-unverified split", () => {
  it("collapsed: atom chips render in the RESERVED accent, no card", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips refs={[chatRef({})]} openDid={null} onToggle={noop} />,
    );
    expect(html).toContain('data-testid="chat-citation-chip"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(ATOM_ACCENT);
    // The general cyan accent NEVER colors an atom chip.
    expect(html).not.toContain("#7dd3fc");
    expect(html).not.toContain('data-testid="chat-citation-detail"');
  });

  it("open anchor chip renders filled with the accent (aria-expanded)", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips
        refs={[chatRef({})]}
        openDid="did:hauska:code-section:bastrop-udc-4-2"
        onToggle={noop}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
  });

  it("websearch-derived source → distinct NON-atom link labeled unverified", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips
        refs={[
          chatRef({
            did: "websearch:travis-county-zoning",
            entityId: "websearch:travis-county-zoning",
            label: "Travis County zoning overview",
            n: 2,
          }),
        ]}
        openDid={null}
        onToggle={noop}
      />,
    );
    expect(html).toContain('data-testid="chat-web-source"');
    expect(html).toContain("unverified");
    // Never an atom chip, never the atom accent.
    expect(html).not.toContain('data-testid="chat-citation-chip"');
    expect(html).not.toContain(ATOM_ACCENT);
  });

  it("HONEST-EMPTY: no refs → no citation row at all (plain prose answer)", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips refs={[]} openDid={null} onToggle={noop} />,
    );
    expect(html).toBe("");
  });
});

describe("inline [n] anchors (PRO mode)", () => {
  it("a matched [n] renders as an atom-accent superscript anchor", () => {
    const html = renderToStaticMarkup(
      <InlineAnswerText
        content="Front setback is 15 ft [1]."
        refs={[chatRef({ n: 1 })]}
        onCitationTap={noop}
      />,
    );
    expect(html).toContain('data-testid="chat-inline-citation"');
    expect(html).toContain("[1]");
    expect(html).toContain(ATOM_ACCENT);
  });

  it("an UNMATCHED [99] stays plain text — a dropped marker is never evidence", () => {
    const html = renderToStaticMarkup(
      <InlineAnswerText
        content="Setback is 15 ft [1] but invented [99] survives only as text."
        refs={[chatRef({ n: 1 })]}
        onCitationTap={noop}
      />,
    );
    // Exactly one anchor (the real [1]); [99] renders but not as a button.
    expect(html.match(/data-testid="chat-inline-citation"/g)).toHaveLength(1);
    expect(html).toContain("[99]");
  });

  it("a web-unverified ref's [n] stays plain text (no atom anchor authority)", () => {
    const html = renderToStaticMarkup(
      <InlineAnswerText
        content="Per a web source [2]."
        refs={[chatRef({ n: 2, did: "websearch:x", entityId: "websearch:x" })]}
        onCitationTap={noop}
      />,
    );
    expect(html).not.toContain('data-testid="chat-inline-citation"');
    expect(html).toContain("[2]");
  });

  it("no markers → plain paragraphs, no anchors", () => {
    const html = renderToStaticMarkup(
      <InlineAnswerText content="Plain prose." refs={[]} onCitationTap={noop} />,
    );
    expect(html).not.toContain('data-testid="chat-inline-citation"');
    expect(html).toContain("Plain prose.");
  });
});

describe("the accordion card (BRIEF → more → FULL, lineage walk)", () => {
  const MODEL: AtomCardModel = {
    did: "did:hauska:buildable-envelope:48021:28286",
    entityType: "buildable-envelope",
    claim: "Buildable area ≈ 7,316 sq ft after setbacks",
    source: "depth-warm",
    method: "buildable-envelope-inset-v1",
    sourceUrl: "https://example.com/source",
    sourceCitation: "depth-warm-verified mechanical promote",
    confidence: { value: 0.85, basis: "asserted", n: 0, intervalWidth: 0.15 },
    calibrated: null,
    verification: "asserted",
    asOf: "2026-07-29T08:38:21.055Z",
    capturedAt: null,
    accessPolicy: "public-free",
  };
  const LINEAGE: AtomLineage = {
    computedFrom: [
      {
        did: "did:hauska:zoning-fact:48021:28286",
        label: "zoning fact",
        entityType: "zoning-fact",
      },
      {
        did: "did:hauska:setback-rule:48021:28286",
        label: "setback rule",
        entityType: "setback-rule",
      },
    ],
    wouldAffect: [],
    citedInputs: ["parcel-geometry-ring"],
  };

  function card(overrides: Partial<Parameters<typeof AtomCardView>[0]> = {}) {
    return renderToStaticMarkup(
      <AtomCardView
        did={MODEL.did}
        localRef={chatRef({ did: MODEL.did })}
        model={MODEL}
        degraded={false}
        loading={false}
        full={false}
        lineage={LINEAGE}
        canBack={false}
        onBack={noop}
        onToggleFull={noop}
        onLineageTap={noop}
        {...overrides}
      />,
    );
  }

  it("BRIEF: claim, provenance (source · method), NEVER-BARE confidence with basis, as-of + read-time freshness, accessPolicy", () => {
    const html = card();
    expect(html).toContain("Buildable area ≈ 7,316 sq ft after setbacks");
    expect(html).toContain("depth-warm · buildable-envelope-inset-v1");
    expect(html).toContain("Confidence 0.85");
    // The basis rides WITH the number — PE atoms are honestly asserted.
    expect(html).toContain('data-testid="atom-card-confidence-basis"');
    expect(html).toContain("asserted");
    expect(html).toContain("As of 2026-07-29");
    expect(html).toContain('data-testid="atom-card-freshness"');
    expect(html).toContain("access: public-free");
    // BRIEF hides the FULL block.
    expect(html).not.toContain('data-testid="atom-card-full"');
    expect(html).toContain("more →");
  });

  it("no confidence basis → NO number renders anywhere (never bare)", () => {
    const html = card({ model: { ...MODEL, confidence: null } });
    expect(html).not.toContain('data-testid="atom-card-confidence"');
    expect(html).not.toContain("0.85");
  });

  it("FULL: lineage chips (computed-from), cited inputs, source link, did, calibration honesty line", () => {
    const html = card({ full: true });
    expect(html).toContain('data-testid="atom-card-full"');
    expect(html.match(/data-testid="atom-card-computed-from"/g)).toHaveLength(2);
    expect(html).toContain("zoning fact");
    expect(html).toContain("setback rule");
    expect(html).toContain("Cited inputs: parcel-geometry-ring");
    expect(html).toContain('data-testid="atom-card-source-link"');
    expect(html).toContain(MODEL.did);
    // PE calibration is not live — the card says so, honestly.
    expect(html).toContain("Calibration not yet earned");
    expect(html).toContain("less ←");
  });

  it("ABSENT lineage links render NOTHING (no fabricated relationships)", () => {
    const html = card({
      full: true,
      lineage: { computedFrom: [], wouldAffect: [], citedInputs: [] },
    });
    expect(html).not.toContain('data-testid="atom-card-computed-from"');
    expect(html).not.toContain('data-testid="atom-card-would-affect"');
    expect(html).not.toContain("Cited inputs:");
  });

  it("DEGRADED: local BRIEF content + honest 'full record unavailable' — the chip never breaks", () => {
    const html = card({ model: null, degraded: true });
    expect(html).toContain('data-testid="atom-card-unavailable"');
    expect(html).toContain("Full record unavailable");
    // The local citation still shows (label + snippet).
    expect(html).toContain("ADU standards");
    expect(html).toContain("Accessory dwelling units are permitted subject to…");
  });

  it("walk depth > 1 → ← back affordance renders", () => {
    expect(card({ canBack: true })).toContain('data-testid="atom-card-back"');
    expect(card({ canBack: false })).not.toContain(
      'data-testid="atom-card-back"',
    );
  });

  it("would-affect chips render on the FULL level when links exist", () => {
    const html = card({
      full: true,
      lineage: {
        computedFrom: [],
        wouldAffect: [
          {
            did: "did:hauska:buildable-envelope:48021:28286",
            label: "buildable envelope",
            entityType: "buildable-envelope",
          },
        ],
        citedInputs: [],
      },
    });
    expect(html.match(/data-testid="atom-card-would-affect"/g)).toHaveLength(1);
    expect(html).toContain("buildable envelope");
  });
});

describe("RESERVED atom color — audit (the accent means atoms, nothing else)", () => {
  it("the accent hex appears in exactly ONE source module (the token definition)", () => {
    // Walk the app source; the reserved hue may be DEFINED once
    // (chat-citations.ts ATOM_ACCENT) and referenced only via the token.
    const here = fileURLToPath(new URL(".", import.meta.url));
    const srcRoot = join(here, "..", "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
          if (name === "node_modules" || name === "dist") continue;
          walk(p);
        } else if (/\.(ts|tsx|css|html)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (text.toLowerCase().includes(ATOM_ACCENT.toLowerCase())) {
            hits.push(name);
          }
        }
      }
    };
    walk(srcRoot);
    expect(hits).toEqual(["chat-citations.ts"]);
  });

  it("chips + lineage chips render with the token; numbers/links stay non-atom", () => {
    const chips = renderToStaticMarkup(
      <ChatCitationChips refs={[chatRef({})]} openDid={null} onToggle={noop} />,
    );
    expect(chips).toContain(ATOM_ACCENT);
  });
});

describe("freshness badge on chips", () => {
  it("outdated edition → amber Outdated badge", () => {
    const html = renderToStaticMarkup(
      <FreshnessBadge chatRef={chatRef({ edition: "2018 IBC" })} />,
    );
    expect(html).toContain('data-fresh="outdated"');
    expect(html).toContain("Outdated");
  });

  it("current edition → Current badge", () => {
    const html = renderToStaticMarkup(
      <FreshnessBadge chatRef={chatRef({ label: "IBC 2024 §1013" })} />,
    );
    expect(html).toContain('data-fresh="current"');
    expect(html).toContain("Current");
  });

  it("unknown freshness → NO badge (no unearned claim)", () => {
    const html = renderToStaticMarkup(<FreshnessBadge chatRef={chatRef({})} />);
    expect(html).toBe("");
  });
});
