import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertHauskaBuildStamped,
  HAUSKA_UNSTAMPED,
  resolveHauskaBuildStamp,
} from "./hauska-build-stamp";

const PE_VITE = resolve(__dirname, "../../vite.config.ts");
const CC_VITE = resolve(__dirname, "../../../command-center/vite.config.ts");
const PE_WORKFLOW = resolve(
  __dirname,
  "../../../../.github/workflows/property-explorer-sync-retrieval-key.yml",
);
const STAMPED = "a275a45955944ab4b93edd2e4bbf9de4c696ee6d";

describe("hauska build stamp — both arms", () => {
  it("stamped sha passes", () => {
    const stamp = resolveHauskaBuildStamp({ HAUSKA_BUILD_SHA: STAMPED });
    expect(stamp).toBe(STAMPED);
    expect(assertHauskaBuildStamped(stamp)).toBe(STAMPED);
  });

  it("VERCEL_GIT_COMMIT_SHA also stamps", () => {
    const stamp = resolveHauskaBuildStamp({
      VERCEL_GIT_COMMIT_SHA: STAMPED,
    });
    expect(assertHauskaBuildStamped(stamp)).toBe(STAMPED);
  });

  it("UNSTAMPED fails the gate", () => {
    const stamp = resolveHauskaBuildStamp({});
    expect(stamp).toBe(HAUSKA_UNSTAMPED);
    expect(() => assertHauskaBuildStamped(stamp)).toThrow("UNSTAMPED");
    expect(() => assertHauskaBuildStamped(HAUSKA_UNSTAMPED)).toThrow(
      "UNSTAMPED",
    );
    expect(() => assertHauskaBuildStamped("")).toThrow("UNSTAMPED");
  });

  it("both vite configs fall back to UNSTAMPED (source read, not the helper)", () => {
    const pe = readFileSync(PE_VITE, "utf8");
    const cc = readFileSync(CC_VITE, "utf8");
    expect(pe).toContain('process.env.VERCEL_GIT_COMMIT_SHA');
    expect(pe).toContain('process.env.HAUSKA_BUILD_SHA');
    expect(pe).toContain(`"${HAUSKA_UNSTAMPED}"`);
    expect(cc).toContain('process.env.VERCEL_GIT_COMMIT_SHA');
    expect(cc).toContain('process.env.HAUSKA_BUILD_SHA');
    expect(cc).toContain(`"${HAUSKA_UNSTAMPED}"`);
  });

  it("PE CLI deploy passes HAUSKA_BUILD_SHA from GITHUB_SHA", () => {
    const yml = readFileSync(PE_WORKFLOW, "utf8");
    expect(yml).toContain('--build-env HAUSKA_BUILD_SHA="$GITHUB_SHA"');
  });
});
