/**
 * M0 mechanical guard — Track B3 dual-repo mapBuildableDisplay copies.
 *
 * hauska-map PE and hauska-engine site-plan each carry a full copy of
 * buildable-display-vocab.ts. This test fails if the local source drifts
 * from the checked-in peer fixture (last synced engine copy).
 *
 * Sync when either copy changes:
 *   1. Update both repo sources to the same bytes.
 *   2. Refresh __fixtures__/buildable-display-vocab.peer.fixture in BOTH repos
 *      from the peer source (byte-identical).
 *   3. Bump sha256 in both lockfiles to match.
 *
 * Peer path (hauska-engine):
 *   packages/engine-core/src/site-plan/buildable-display-vocab.ts
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import lock from "./__fixtures__/buildable-display-vocab.parity.lock.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_SOURCE = join(HERE, "buildable-display-vocab.ts");
const PEER_FIXTURE = join(HERE, "__fixtures__", "buildable-display-vocab.peer.fixture");

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

describe("mapBuildableDisplay dual-repo parity (M0)", () => {
  it("local source is byte-identical (LF-normalized) to peer fixture", () => {
    const local = normalizeNewlines(readFileSync(LOCAL_SOURCE, "utf8"));
    const peer = normalizeNewlines(readFileSync(PEER_FIXTURE, "utf8"));
    expect(local, "PE buildable-display-vocab.ts drifted from peer fixture — sync both repos").toBe(
      peer,
    );
  });

  it("local source sha256 matches lock (cross-repo handshake)", () => {
    const local = normalizeNewlines(readFileSync(LOCAL_SOURCE, "utf8"));
    const digest = sha256Utf8(local);
    expect(digest).toBe(lock.sha256);
    expect(lock.peerRepo).toBe("hauska-engine");
    expect(lock.peerPath).toBe(
      "packages/engine-core/src/site-plan/buildable-display-vocab.ts",
    );
  });
});
