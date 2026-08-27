# Smart Site — brand handoff

> **HISTORICAL.** The "full re-accent to gold" section below is dead.
> Live law is `src/styles/pe-tokens.css` + `src/styles/pe-chrome.ts` +
> `src/components/Button.tsx`. Gold is mark-only. Blue is the action hue.

Reference package for the property-explorer rebrand (Empressa to Smart Site).
Built from the real app containers in apps/property-explorer/src (SignUpCard,
SearchBar, InspectCard, Workbench). Nothing here has been wired into the app —
this is reference only, for the main coding agent to implement.

## Drop location
Suggested: apps/property-explorer/docs/smart-site-brand/ (or repo root docs/).

## What's in this folder
- logo/smart-site-mark-crosshair.svg — the mark alone (circle + 4 ticks + gold
  center dot). White strokes, gold (#E8963B) center — works on the app's dark
  (#0b0e13) surfaces as-is. Swap to a dark/navy stroke variant if ever used on
  light backgrounds (none currently exist in this app).
- logo/smart-site-lockup.svg — mark + wordmark, "SMART" in white, "SITE" in
  gold (#F5B95C), Oxygen 700. Use where there's room (cold-open card, ~150px+
  wide chrome). Use the mark alone in tight spaces (bubbles, favicon, nav).
- tokens/*.css — full Smart City OS / Empressa-family design tokens (colors,
  type, spacing, effects) for anything NEW you build outside the existing map
  chrome. Do NOT force these onto the map's existing accent system — see
  "Accent color decision" below.
- reference/*.png — screenshots of the branding direction picked (mashup) and
  the marketing landing page / one-pager, for tone/voice reference only. Not
  meant to be copy-pasted as UI.

## Decision made: branding direction = "mashup" (2d)
Combines three things, additive to the existing chrome — no existing
component was redesigned, only extended:

1. Quiet corner brand chip — small pill (mark + "Smart Site" wordmark),
   fixed position, bottom-left of the map viewport, above the map but below
   modals. Independent of SearchBar/InspectCard — add as a new sibling
   element in ExplorerMap.tsx (or App.tsx), not inside either existing
   component.
2. Crosshair anchors the workbench — the mark becomes the FIRST bubble in
   the Workbench cluster (registry.tsx / Workbench.tsx), acting as a
   home/about affordance (non-interactive is fine for v1, or link out to a
   Smart Site info panel later). The same small mark (12-15px) repeats in the
   dock header next to the open tool's label — add it in the pinned header
   block in Workbench.tsx's DockBody header, left of the tool label.
3. Full re-accent to gold — replace the ACCENT constant (#7dd3fc) with
   gold (#F5B95C light / #E8963B deeper) everywhere it's used as an
   active/primary signal: Workbench.tsx ACCENT, InspectCard.tsx ACCENT,
   SearchBar.tsx button background + rowActive background. Leave MUTED
   (#8b97a5), the honest-absence amber (#c98b3a / #fcd34d), and error
   colors untouched — those are semantic, not brand.

## Explicitly NOT changed
- Card radii, shadows, blur, font stack (system-ui) inside the map chrome —
  the app's existing chrome language stays; only the brand mark + one accent
  hue move.
- SignUpCard.tsx: rebrand "EMPRESSA" eyebrow to "SMART SITE" (use the mark +
  wordmark svg, gold instead of the current sky-blue ACCENT), keep everything
  else (copy structure, OAuth buttons, layout) as-is. Copy content is a
  separate pass — flag to the user before changing headline/bullet text.

## Rename scope
"Empressa" must be fully removed from user-facing strings (README says the
app already carries zero substrate-vendor strings — only the SignUpCard's
"EMPRESSA" eyebrow needs to go, plus any other literal "Empressa" string;
grep the src tree for "Empressa" before considering this done).

## Open questions for the operator (do not decide silently)
- Should the crosshair "home" bubble in the Workbench cluster do anything on
  click in v1, or stay decorative until an "About Smart Site" panel exists?
- Confirm gold-on-dark passes contrast for small text/icons at the sizes used
  today (11-13px) — spot check before shipping.

## Design system pass (2026-08-03) — brand vs. semantic separation

Follow-up brief: the branding pass exposed a real gap — brand gold and the
app's honest-absence amber both read as the same yellow. This pass adds a
proper token set + one Button component so the app doesn't collide brand
and semantic color. Visual spec: `Smart Site PE Design System.dc.html`
(project root). New tokens file: `tokens/pe-tokens.css` (adds to
`tokens/colors.css`, doesn't replace it — PE keeps `--surface-ink` #0b0e13,
never the Smart City navy surfaces).

**Do NOT re-skin the app.** This is tokens + one component only, applied at
the point of each existing collision.

1. **Honest-absence recolor (highest impact).** `#fcd34d` / `#c98b3a` is used
   as BOTH the real semantic "not verified here" tone (`InspectCard.tsx`
   `ABSENT`, `chat-citations.ts` comment confirms this is intentionally
   semantic) AND, in several files, a generic "warning/notice" amber
   (`Workbench.tsx`, `BriefTool.tsx`, `ChatTool.tsx`, `SearchBar.tsx`,
   `UnlockFlow.tsx`, `ShareView.tsx`, `SharedDossierDock.tsx`,
   `ShareLandingOverlay.tsx`, `saved-pins.ts`, `PropertyDossierDetail.tsx`,
   `PropertiesTool.tsx`, `CompareTool.tsx`, `LockedToolPanel.tsx`,
   `FloodTool.tsx`, `PropertyBriefPanel.tsx`, `TransientChips.tsx`,
   `SitePlanExportSection.tsx`, `TerrainExportSection.tsx`,
   `SignUpCard.tsx`). Sort each use into one of two buckets before touching
   color: (a) truly "we don't have this data" → recolor to
   `--semantic-absence` (`#7C8BA0` text, `--semantic-absence-bg`/`-border`
   for chip fills) (b) a genuine warning/caution state → leave amber/`#F59E0B`
   alone, it's not the collision. `chat-citations.ts:228-229` already
   documents which family is which — use that comment as the map. Don't
   blanket find-and-replace `#fcd34d`.
2. **Atom chip recolor.** `chat-citations.ts` — `ATOM_ACCENT` `#c4b5fd` →
   `--atom-accent` `#4CC9C0`, `ATOM_ACCENT_BORDER` → `--atom-accent-border`,
   `ATOM_ACCENT_BG` → `--atom-accent-bg`, `ATOM_ACCENT_CONTRAST` unchanged
   value (`#0b0f14`, matches `--atom-accent-contrast`). All ~27 usages flow
   through these four constants in `ChatTool.tsx` — recolor at the source,
   no per-usage edits needed. Distinct from the map's interaction-cyan
   `#7dd3fc` (leave that alone).
3. **Button component.** One component, four variants (primary / secondary /
   ghost / subtle) per the spec DC — replaces the ad-hoc buttons in
   `InspectCard.tsx`, `SearchBar.tsx`, workbench tool panels, and the
   export sections. `--btn-radius` 9px, two padding scales (default /
   dense for toolbars), one visible focus ring (`--btn-focus-ring`,
   uses `--brand-blue`).
4. **Type + spacing.** Oxygen for display/headings only (matches the
   lockup); body stays system-ui — do not swap PE's body font. Spacing
   scale in `pe-tokens.css` (`--space-1`…`--space-8`, 4px base) for any
   new layout; existing card radii/shadows in the map chrome are untouched.

Boundaries unchanged from the branding pass: `--surface-ink` stays PE's own
near-black, not Smart City navy; leave interaction-cyan, PDF print blue
`#00b4d8`, and real error/warning states alone. Out of scope here (separate
workstreams, not touched): citation/link dead-end audit, map default
layers, lower-left chrome cleanup, PDF X-ray template branding.
