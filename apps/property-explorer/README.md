# Property Explorer (Empressa)

Map-first consumer web app SKELETON. Boots a live Central-Texas map with a
sign-up card over it; anonymous browse of parcels, zoning, setbacks, and the
buildable envelope. Empressa consumer brand — this surface carries zero
substrate-vendor strings in user-facing text.

## What it is

- **Cold open** (`src/coldopen/`): the live map boots FIRST (no auth). A CSS
  scrim dims the real running app and a sign-up card floats over it — one
  headline, three bullets, a "Continue with Google" button, and a "Just browse
  the map" escape hatch. Not a screenshot; the map behind is live.
- **Browse** (`src/browse/`): full-bleed `FloatingMap` (from
  `@hauska/map-renderer`) centered on `DEFAULT_CENTER`, wiring:
  - the PMTiles baked parcel browse layer (`parcelTiles` prop),
  - live-GIS overlays (parcels + FEMA) via `liveGis.ts` against the anonymous
    cortex proxy,
  - parcel click → **inspect-in-place**: a card with base facts + zoning +
    setbacks + buildable envelope, fetched through the ported
    `buildable-envelope` client and folded into the ported `parcel-node-store`
    as the `inspected` node.
- **No AI on click.** No brief, no report. The "Research this" button is a stub.

## Reused (published) vs ported

- Reused published: `@hauska/map-renderer` (FloatingMap + PMTiles + overlays),
  `@empressaio/cortex-client` (BFF client), `@empressaio/cortex-tiles`.
- Ported framework-free guts from `hauska-brief-extension`:
  `src/lib/parcel-node-store.js` (verbatim — zero chrome.\* deps) and
  `src/lib/buildable-envelope.js` (rewired: explicit base URL + plain fetch
  instead of the MV3 worker proxy; wire-shape parsing kept verbatim).
- `src/browse/liveGis.ts` is ported from command-center's live-GIS tile logic.
- Nothing importing `chrome.*` was ported.

## Deploy model

Vite + React SPA. Same-origin spine proxy `api/spine.ts` holds the service key
server-side; the browser holds no key. `vercel.json` uses the query-param
rewrite `/api/spine/(.*)` → `/api/spine?upath=$1` (Vercel catch-all fns match
only one segment) plus the SPA rewrite. Becomes its own Vercel project later;
for now it builds inside the `hauska-map` pnpm workspace next to
`command-center`.

Local dev exercises the deployed data plane without a local key:

```
SPINE_PROXY_TARGET=https://<deployed-explorer>.vercel.app pnpm --filter property-explorer dev
```

## Seams (TODO — parallel tracks)

- **Track A — persistent-map rebind:** the map mounts once and is stable today.
  Rebind in `ExplorerMap.tsx` when the persistent-map API lands.
- **Track B — baked-node reads:** PMTiles + live-GIS is the "read live" path.
  Rebind `PARCEL_TILES` / the read to the baked-node tileset when it ships.
- **Track D — auth/OAuth:** `SignUpCard.onContinueWithGoogle` is a no-op stub
  that drops into anonymous browse. Wire the real Google OAuth here.
- **Ask/report (AI, behind auth):** `InspectCard` "Research this" is a no-op
  stub. Open the authed ask/report flow when auth + the AI track land. The
  inspected node (with setbacks/envelope) is already the subject-of-truth the
  ask path will read via `getSubjectAreaContext`.

## Build

```
pnpm --filter property-explorer build   # build:renderer + tsc --noEmit + vite build
```
