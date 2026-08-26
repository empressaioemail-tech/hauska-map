import { describe, expect, it } from "vitest";
import {
  fetchRecordsRun,
  RECORDS_NOT_WIRED_NOTICE,
  requestRecordsRun,
} from "./recordsRequestClient";

describe("recordsRequestClient — Phase 1 stub", () => {
  it("fetch and request fail closed with an honest not-wired notice", async () => {
    const fetch = await fetchRecordsRun("48021:123");
    expect(fetch.wired).toBe(false);
    expect(fetch.run).toBeNull();
    expect(fetch.notice).toBe(RECORDS_NOT_WIRED_NOTICE);

    const request = await requestRecordsRun("48021:123");
    expect(request.wired).toBe(false);
    expect(request.run).toBeNull();
    expect(request.notice).toBe(RECORDS_NOT_WIRED_NOTICE);
  });
});
