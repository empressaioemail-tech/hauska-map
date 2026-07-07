# Task: A4c-panel — Revenue Meter panel in the command center

Branch: `feat/a4c-revenue-panel`. Push the branch immediately after your FIRST commit and keep pushing after every commit. Delete this CURSOR_TASK.md before your final commit. Open a PR titled `feat(a4c): Revenue Meter panel (layer2_call summary via proxy)`.

## Context you cannot discover yourself

1. The MCP server is gaining `GET /metering/summary` (being built in parallel against the PINNED contract below — build against the contract, not against a live probe).
2. The Vercel serverless proxy (`api/spine.ts` + the query-based rewrite) holds all service keys server-side. The MCP key it holds is reporting-product + platform_internal — it passes the endpoint's gate. You must EXTEND the proxy to forward this new GET (today the mcp route only allows POST to the JSON-RPC path).
3. Deploy note for the planner (put this in the PR body): cmdcenter deploys via `vercel deploy --prod --yes` from repo root, project cmdcenter.

## Pinned API contract (MCP side)

```
GET <mcp-host>/metering/summary?days=7   with header X-Hauska-Key: <server-side key>
200 → { "windowDays": 7,
        "totals": { "layer2Calls": N, "billed": N, "unbilled": N },
        "days": [ { "date": "YYYY-MM-DD", "layer2Calls": N,
                    "byProduct": {"map":N,"reporting":N,"codex":N},
                    "byTool": {"<toolName>":N} } ] }
```

## Work

1. **Proxy**: allow `GET /api/spine/mcp-metering/summary` (or the allowlist-consistent path shape the proxy already uses) → forwards to the MCP host `/metering/summary` with the X-Hauska-Key header, passing through the `days` query param (validate 1..31 proxy-side too). Update PROXY_CONTRACT.md and the proxy contract test (that test pattern exists from PR #10 — extend it, don't fork it).
2. **Panel**: a native command-center panel "Revenue Meter" in the existing native-panel family (the A3 shell-dissolution pattern — one design language, command-center tokens): totals row (Layer-2 calls in window, billed vs unbilled), a simple per-day bar/sparkline (no new chart dependency — inline SVG or the pattern other panels use), byProduct and top-5 byTool breakdowns, a days selector (7/14/30), and honest states: loading, real backend error shown as an error (never a blank fake), and an explicit "unbilled: Stripe key not mounted" hint when totals.billed is 0 and unbilled > 0.
3. **Tests**: proxy contract test for the new route (allowlisted, param validation, key never leaked to the browser); a panel render test with fixture data + the error state (follow the repo's existing test patterns).

## Constraints

- EXIT-BOUNDED commands only (pnpm build / pnpm test; NEVER pnpm dev/preview). The planner deploys.
- Do not touch other panels, the tile registry beyond registering this panel, or the MCP JSON-RPC proxy path.
