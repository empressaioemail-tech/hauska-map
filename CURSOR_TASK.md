# Task: A5 WP3+WP4+WP5 — hoist the active context to the command-center shell; context bar; persona lenses; deep links

Branch: `feat/a5-active-context-app`. Push the branch immediately after your FIRST commit and keep pushing after every commit. Delete this CURSOR_TASK.md before your final commit. Open a PR titled `feat(a5): workspace-wide active context — root provider, context bar, persona lenses, deep links`.

## Why (the operator's requirement, verbatim intent)

"I should be able to set a project or an address and that address is active across all nodes and workspaces — this is what 123 Main looks like for a plan reviewer, architect, property investor." The published packages now support this (`@empressaio/tile-shell@0.2.0`: hoistable `EngagementProvider` with `initialParcel`/`onActiveParcelChange`/context-adoption/`contextEpoch`; `@empressaio/cortex-tiles@0.1.3`: dep-pinned + epoch guards). This PR is the app half. Design of record: the A5 sections below are extracted from it — follow them exactly.

## WP3 — hoist the context to the shell root

1. `apps/command-center/package.json`: upgrade `@empressaio/tile-shell` to `^0.2.0` and `@empressaio/cortex-tiles` to `^0.1.3`. After install, VERIFY exactly ONE `@empressaio+tile-shell` entry exists under `node_modules/.pnpm` — if two, STOP and report (dual instances silently split the React context and every tile stops seeing the shared address; this is the #1 design risk).
2. Mount ONE `CortexProvider` + ONE `EngagementProvider` in `apps/command-center/src/main.tsx` wrapping `ControlCenterLayout` (the cortex client is already a module singleton in `src/admin/workspace/cortexClient.ts`). Hydrate via `initialParcel` from (in priority order) the URL hash context params, then localStorage key `cc-active-context`; persist via `onActiveParcelChange` to BOTH (write the hash without clobbering unrelated params; wrap the callback in `useCallback` — an inline lambda refires the provider's change effect every render).
3. Remove the `EngagementProvider` mount (ONLY that provider) from `apps/command-center/src/admin/workspace/SpacePanel.tsx` (keep its other per-panel providers — they are derived caches) and from `WorkspacePanel.tsx`.
4. New module `apps/command-center/src/admin/workspace/activeContext.ts`: parse/serialize the reserved hash params `addr`, `apn`, `eng`, `j`, `lat`, `lng` (NOTE: do not collide with existing panel params — atom-inspector uses `id`); localStorage read/write; a single `ActiveContext` type import from tile-shell.

## WP4 — context bar, sticky params, persona lenses

1. `ActiveContextBar` (new, `src/admin/workspace/ActiveContextBar.tsx`) in the `main.tsx` header next to the existing header controls: embeds tile-shell's `HeaderSearchBar` (it already calls `setActiveParcel` on resolve; supply `onGeocode` from the cortex client's geocode method), plus a current-context chip ("<label or address> · APN <apn> · <engagement short-id>" — show only the parts that exist) and a clear button (resets to empty parcel).
2. Sticky context params: `selectPanel` in `src/admin/control/center/useActivePanel.tsx` currently WIPES hash params on panel switch — change it to re-append the reserved context params (`addr/apn/eng/j/lat/lng`) so switching panels/lenses preserves the deep-linked context. `#panel=lens-investor&addr=123%20Main%20St` must round-trip.
3. Persona lenses: add three preset spaces to `src/admin/workspace/presets.ts` — `lens-reviewer` (plan-review tile set), `lens-investor` (property-brief / hazard / encumbrances / market-signal tiles), `lens-architect` (setbacks / topography / sheet-extraction / product-spec tiles) — tile ids per the persona semantics in tile-shell's `ModuleMap` (`personaForTile`). Register them as Workspace panels in `src/admin/control/center/PanelRegistry.ts`. Add a compact persona switcher (header or NavRail) that calls `selectPanel(lensId)` — context-preserving via item 2.
4. Precedence rule (from the design, binding): the global ActiveContext WINS at runtime; a workspace composition's engagementId is APPLIED to the global context via `setEngagement` when a composition loads — never a parallel subject.

## WP5 — proxy allowlist for the front door

1. The geocode path: cortex-client v0.1.1 POSTs `plan-review/geocode` (upstream `api/plan-review/geocode`), but the proxy POST allowlist (`api/spine.ts`) has `api/place/geocode`. PROBE the deployed cortex-api for which path exists (`POST /api/plan-review/geocode` vs `/api/place/geocode` — a 404-vs-400/422 distinction is enough) and extend the allowlist so the header search's geocode actually works through the proxy; pre-add `api/plan-review/spaces` (GET/PUT/DELETE) for the future server-side saved-spaces switch.
2. Update `apps/command-center/PROXY_CONTRACT.md` and extend `src/admin/api/proxyContract.test.ts` for every allowlist row you add.

## Acceptance (test what you can; the planner live-verifies the rest post-deploy)

Set "1209 Main St, Bastrop TX" in the header → every Workspace panel and each persona lens shows that context; reload restores it; `#panel=lens-investor&addr=...` deep-links it; clearing returns tiles to their honest empty states; switching panels never drops the context.

## Tests

Component tests per the repo's existing patterns (18 command-center tests exist — extend, don't fork): activeContext parse/serialize round-trip (incl. param-collision safety), ActiveContextBar renders chip + clear behavior with a mocked provider, selectPanel preserves reserved params, lens presets registered with non-empty tile sets, proxy contract test rows. Run `pnpm --filter command-center test` and `pnpm --filter command-center build` (both must pass).

## Constraints

- EXIT-BOUNDED commands only (`pnpm --filter command-center test/build`; NEVER pnpm dev/preview). The planner deploys (vercel, linked project).
- Do NOT touch the mcp/mcp-metering proxy segments, the Revenue Meter panel, or the tile packages themselves (they are published; consume from npm).
- If `@empressaio/tile-shell@0.2.0` / `@empressaio/cortex-tiles@0.1.3` are not yet visible on npm when you start, wait-and-retry the install a couple of times (registry propagation), and if still absent report and STOP — do not build against the old versions.
