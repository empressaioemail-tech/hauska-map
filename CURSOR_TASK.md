# Task A1 — Command center proxy truth pass

You are working in a fresh task clone of hauska-map. Create branch `fix/a1-proxy-truth-pass` off main. RULE: push the branch to origin immediately after your FIRST commit, then keep pushing as you go. Do NOT merge; open a PR at the end titled "fix(command-center): proxy truth pass — panel/proxy contract + allowlist fixes (A1)". Delete this CURSOR_TASK.md before your final commit.

## Context

The Empressa Command Center (apps/command-center) is deployed on Vercel at cmdcenter-blush.vercel.app with a same-origin serverless proxy (api/spine.ts + a query-param rewrite in vercel.json) that holds all service keys server-side. Routes: cortex (Bearer SERVICE_API_KEY), mcp (X-Hauska-Key), retrieval. The proxy has a GET-only allowlist plus POST allowed only to the MCP JSON-RPC path; /admin/* blocked.

Two verified production defects (operator screenshots):
1. Atom Inspector panel: "Couldn't load — MCP HTTP 403: {\"error\":\"method not allowed\"} — is the Empressa MCP server reachable at /api/spine/mcp?" — a panel is calling the MCP proxy path with a method/path combination the proxy rejects.
2. Plan Review space, Reviewer Queue tile: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" — a cortex API call is falling through the rewrite and getting the SPA index.html instead of being proxied.

Root cause class: the panel endpoint set was never enumerated against the proxy allowlist.

## Do

1. Enumerate EVERY endpoint every panel and workspace tile in apps/command-center actually calls (grep all fetch/client calls, including the mounted Cortex Workspace packages' calls that flow through the proxy). Write the inventory to apps/command-center/PROXY_CONTRACT.md as a table: panel → method → path → proxied route → allowlist status.
2. Fix api/spine.ts (and vercel.json rewrites if needed) so every legitimate panel call is carried: correct method handling for the MCP JSON-RPC POST path (the 403 above), add missing cortex GET routes so nothing falls through to index.html. Keep the security posture: keys stay server-side, /admin/* stays blocked, no wildcard POST, GET allowlist stays explicit.
3. Where a panel calls something that should NOT be proxied (genuinely admin/privileged), change the panel to render an honest "not available through the proxy" state instead of a raw error.
4. Add a proxy contract test (vitest or the repo's existing test setup) that walks the PROXY_CONTRACT.md inventory (or a machine-readable version of it) and asserts every panel endpoint is either allowlisted or explicitly marked proxy-excluded — so a new panel cannot ship a path the proxy does not carry.
5. Remember the known Vercel gotchas already recorded in this repo's deploy config: catch-all api functions match one segment only on this deployment (query-param rewrite is used instead); env values must be trimmed in code.

## Verify before opening the PR

- Build passes (pnpm install, pnpm --filter ./apps/command-center build).
- Tests pass including the new contract test.
- In the PR description: paste the endpoint inventory table and state exactly which allowlist entries/method fixes were added and why each is safe (no key exposure, no admin exposure).

Exit condition: every LIVE panel's calls are carried by the proxy or the panel shows an honest excluded state; the contract test locks it.
