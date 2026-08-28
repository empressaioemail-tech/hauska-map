# Chrome v2 — what shipped, what did not, and why

Companion to the drop in this folder. `README.md` and `SPEC.md` are the design
as delivered; this file is the record of what landed on Property Explorer,
written at implementation time so nobody has to re-derive it by reading diffs.

Implemented 2026-08-27 on `seat/property-chrome-v2` from `f79b1ef`.

The reference sheets in `reference/` open in a browser with no build step and
no network, and remain the tiebreaker wherever `SPEC.md` is ambiguous.
`reference/support.js` is their runtime and is not product code — it lives here
only so the sheets still open.

## Landed

**Tokens.** `src/styles/pe-tokens.css` is the v2 `--ss-*` vocabulary plus a
legacy alias layer. Every `--brand-*`, `--surface-*`, `--text-*`,
`--semantic-*`, `--atom-*` and `--btn-*` name now resolves to an `--ss-*`
value, so surfaces that have not been ported still pick up the v2 palette and
porting one is a rename with no visual step. `src/styles/pe-chrome.ts` carries
the same split, plus `TYPE` and `MOTION`.

Do not add a new legacy name. Do not give a legacy name a value of its own.

**The rules that produce the look.** Height is the spec and padding falls out
of it. Five type steps. Three hairline weights, one hue. One edge per surface.
Radii 4 / 6 / 10 / 14 / 50%.

**Motion.** One curve, four durations, declared once in the token file. A panel
opens its own height while scaling up 3% from its anchored corner — dock from
top-right, sources sheet from bottom-right, suggestion list from the find bar's
top edge, modal from centre. `ss-spin`, `ss-shimmer`, `ss-blink` and `ss-pulse`
are defined once. `prefers-reduced-motion` keeps the opacity fade and drops the
scale and the height animation, reaching surfaces through the `data-ss-motion`
marker.

**Primitives.** Button, Card + Rule, Input / TextArea / Field / FieldError,
StatusChip + UnverifiedSource, BubbleTip, DownloadFileButton, Modal, and two
new ones: `StateNote` (the four honest-empty registers) and `Loading`
(spinner, mono progress count, label-carrying skeleton, typing dots).

**Chassis, map chrome, the seven tools, money and identity.** Per `SPEC.md`
sections 1 through 5, except where noted below.

**The gold rule became a control.** `scripts/pe-chrome-kit-gate.mjs` refuses
gold as a colour outside the four files allowed to draw the brand mark. It runs
in CI on every PR touching the app. It was verified by violation, not by
observing it pass.

## Not taken, and why

Each of these is a real refusal with a named reason, not an oversight. Anyone
picking this up should read the reason before reversing it.

**Multi-dock stacking with fold-to-header, in a left column** (`SPEC.md` §2).
Operator ruling 2026-08-27: one tool open at a time and the right-hand dock
stay. `workbench.test.tsx` carries guard tests written specifically to stop
multi-open returning, and they stay armed. `nextOpenToolId` is still the only
rule. Everything else in §2 — the rail states, the 36px header, the one dock
width, the panel motion — did land.

**Basemap attribution moving to a map footer** (`SPEC.md` §4). It stays in the
sources panel. The renderer suppresses MapLibre's `AttributionControl` on the
PE mount path; an always-visible credit strip is the exact regression that put
the credit into the panel in the first place; and
`map-toolset-geolocate.test.tsx` pins it collapse-only. OSM (ODbL), CARTO and
Esri all require the credit to stay reachable, and in the panel it is.

**Parcel geometry colours and the arrival pulse** (`SPEC.md` §4).
`inspect-highlight.ts` exists to MIRROR the shared renderer's tile
feature-state, so that swapping the highlight source changes geometry accuracy
and not the UX. Repainting one side re-opens the divergence P-60d closed;
repainting both means changing `packages/map-renderer`, which command-center
consumes. This needs its own card, scoped across both products.

**The `#131A24` Google button fill** (`SPEC.md` §1). Google's own `#131314` is
the external authority for that surface and `google-sign-in-button.test.tsx`
pins it. Only the border moved onto the v2 hairline. Flagged for the design
owner: if the drop's fill is wanted, it is a deliberate departure from Google's
published button, not a token swap.

**A price on the locked panel's button, and the tool's real content blurred
behind it** (`SPEC.md` §2). Operator ruling 2026-08-24: the dock shows no
pricing — the one pricing modal owns every price — and the dock does not render
the paid content it is withholding. The lock glyph, the veil and the type ramp
did land.

**A find field in the cold open** (`SPEC.md` §5). That is a new entry point,
not a restyle. The brand lockup, the 26/300 headline and the width did land.

**The 20px map-chrome inset** (`SPEC.md` §4). The rail stays at `right: 12` so
it shares an edge inset with MapToolset below it and keeps the 8px channel to
the dock at `right: 54`. The dock's `top: 12` is pinned by the
viewport-bounded height rule in `workbench.test.tsx`. The brand chip and the
find bar do use the v2 inset.

## Open for the product owner

- **Compare is live.** `README.md` draws it as not-built with a way forward.
  It is wired (`CompareTool.tsx`, `compare-tool.test.tsx`), so it was restyled
  rather than replaced with the not-built panel. If the intent was to pull it,
  that is a product call.
- **No recommended tier.** Unchanged: nothing is pre-selected.
- **The v1 `docs/smart-site-brand/` tokens** (`tokens/pe-tokens.css` and
  friends beside this folder) are now superseded by `v2/tokens/`. They were
  left in place rather than deleted; retiring them is a separate cleanup.
