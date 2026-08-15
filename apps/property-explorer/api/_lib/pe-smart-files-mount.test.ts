import { describe, it, expect } from "vitest";
import {
  filesDsnKeysPresent,
  resolveFilesMount,
} from "./pe-smart-files-mount";

describe("PE Smart Files mount config", () => {
  it("refuses a files DSN env name", () => {
    expect(
      filesDsnKeysPresent({ SMART_FILES_DATABASE_URL: "postgres://x" }),
    ).toEqual(["SMART_FILES_DATABASE_URL"]);
  });

  it("refuses cortex-api as the backend", () => {
    expect(() =>
      resolveFilesMount({
        SMART_FILES_BACKEND_URL: "https://cortex-api-tds7av26va-uc.a.run.app",
        SMART_FILES_API_KEY: "k",
      }),
    ).toThrow(/refuses cortex-api/);
  });

  it("refuses a Neon host as the backend", () => {
    expect(() =>
      resolveFilesMount({
        SMART_FILES_BACKEND_URL:
          "postgresql://x@ep-winter-shape-aw8ken54-pooler.c-12.us-east-1.aws.neon.tech/neondb",
        SMART_FILES_API_KEY: "k",
      }),
    ).toThrow(/database host/);
  });

  it("accepts the files service URL", () => {
    const got = resolveFilesMount({
      SMART_FILES_BACKEND_URL: "https://smart-files-padrd77ava-ue.a.run.app",
      SMART_FILES_API_KEY: "k",
    });
    expect(got.backendUrl).toBe("https://smart-files-padrd77ava-ue.a.run.app");
  });
});
