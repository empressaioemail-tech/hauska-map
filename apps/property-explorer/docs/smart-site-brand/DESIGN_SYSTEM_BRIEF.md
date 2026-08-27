# Smart Site — Design System Brief

> **HISTORICAL (authored 2026-08-03). Do not implement this brief.**
> Gold-as-primary and Oxygen as a live face are dead. Live law is
> `src/styles/pe-tokens.css`, `src/styles/pe-chrome.ts`, and
> `src/components/Button.tsx`. Gold is the mark only, never a button.
> Blue `#3B82F6` is the only loud action. Body type is system UI.
> Absence is slate `#7C8BA0`. Map search-highlight cyan `#7dd3fc` stays
> an overlay island. Do not import the SmartCity kit.

For: Claude design (build the design system) · authored by planner · 2026-08-03
Target: `hauska-map/apps/property-explorer` · Ground: near-black `#0b0e13` chrome · Sister app to Smart City OS (shares the family, NOT the navy skin)

The Property Explorer app got a first branding pass (gold accent + crosshair mark, live on prod). It works, but it exposed the real gap: there is no design system, so brand color, semantic color, and component styles collide. Build the tokens + component set; the app then adopts them. This is a color/component system, NOT a re-skin.

There is a matching visual version of this brief: `DESIGN_SYSTEM_BRIEF.html` (open in a browser — palette swatches + collision demos).

## THE ONE PRINCIPLE THAT DRIVES EVERYTHING

Brand color and semantic color must be DIFFERENT colors with DIFFERENT jobs. Right now the new brand gold and the app's honest-absence amber are both yellow and read as the same signal — a user can't tell "this is Smart Site" from "this data is missing." That is the operator's "too much yellow." Every rule below serves this separation.

- BRAND gold: `#F5B95C` (light) / `#E8963B` (deep) — logo, active/primary, the mark.
- SEMANTIC amber: `#fcd34d` / `#c98b3a` — honest-absence, "not verified here".
- These two sit next to each other in the inspect card and read as the same yellow. Fix = make them deliberately distinct (see honest-absence recolor below).

## PALETTE — sourced from the logo (the operator confirmed they like these)

Navy ground, white, the blue eyebrow, gold. Build the token set from these. Do NOT import the Smart City navy SURFACE tokens onto the map — PE keeps its own near-black chrome; only these accents + the semantic set are shared.

| Token | Hex | Role |
|---|---|---|
| navy-950 | `#0A0E1A` | deep ground / hero (new surfaces only) |
| navy-900 | `#14213B` | surface / gradient top (new surfaces only) |
| app-ink | `#0b0e13` | PE map chrome — KEEP as-is |
| white | `#F8FAFC` / `#ffffff` | SMART wordmark, crosshair strokes, text |
| blue (brand-2) | `#3B82F6` | eyebrow, links, info, the ⓘ affordance |
| gold-deep (brand-fill) | `#E8963B` | buttons, mark center dot, active fills |
| gold-light (brand-text) | `#F5B95C` | SITE wordmark, small text/icons |
| muted | `#94A3B8` | secondary text |
| muted-2 | `#64748B` | tertiary/caption |

Blue is the SECOND brand color (from "AN X-RAY FOR REAL ESTATE"). Use it for links / info / ⓘ — this frees gold from double duty and reduces the yellow load.

## SEMANTIC COLORS — separate namespace, never the accent

| Token | Hex | Role |
|---|---|---|
| success | `#10B981` | verified · gate-passed |
| honest-absence | see below | "not verified here" (NEEDS RECOLOR) |
| warning | `#F59E0B` | provisional / caution |
| error | `#EF4444` | failure only |

HONEST-ABSENCE NEEDS A DECISION (highest-impact fix). Today it's amber `#fcd34d` (22 uses) + `#c98b3a` (5) — the exact yellow that fights brand gold. Recommendation: MOVE HONEST-ABSENCE OFF YELLOW to a calm, desaturated slate/blue-grey "unknown" treatment (e.g. muted `#7C8BA0` text on a faint fill). Absence is not a warning — it's a neutral "we don't have this, honestly." That both fixes the collision AND reads more honest than alarmed. Propose the exact value.

## THE ATOM CHIP — recolor off purple

Atom-reference chips are purple `#c4b5fd` (the `ATOM_ACCENT` token, ~27 uses) and clash. Replace with a color that reads "data / verifiable atom" and sits apart from brand gold (warm), semantic amber (yellow), and link blue. Recommendation: a teal/cyan (proposed `#4CC9C0`) — nods to instrument/readout, fits the X-ray/inspection metaphor. Keep the chip's border + faint-fill structure (`ATOM_ACCENT_BG` / `ATOM_ACCENT_BORDER`); only the hue changes. NOTE: an old interaction-cyan `#7dd3fc` is used only for map search-highlight — pick an atom teal that does NOT collide with it. Propose the exact token.

Source (all in `apps/property-explorer/src`):
- `ATOM_ACCENT = "#c4b5fd"`, `ATOM_ACCENT_BORDER = "rgba(196,181,253,0.5)"`, `ATOM_ACCENT_BG = "rgba(196,181,253,0.14)"`, `ATOM_ACCENT_CONTRAST = "#0b0f14"` (in the workbench tools constants).

## BUTTONS — one component, four variants

Buttons are inconsistent (different paddings, radii, colors per surface). Define ONE Button with a fixed variant set; replace the ad-hoc ones. One radius (9–10px), one padding scale, one visible keyboard focus ring.

- Primary — gold fill `#E8963B`, dark text. The ONE main action per surface (Make subject, Run the X-ray, Export).
- Secondary — outline, neutral. Supporting actions (Save property).
- Ghost — gold-light text, no fill. Tertiary / navigational (Research this →).
- Subtle — faint fill `rgba(255,255,255,0.05)`. Toolbar / dense contexts (export format rows).

Every button in PE resolves to one of these four. Current ad-hoc buttons live across InspectCard, SearchBar, Workbench tools, and the Reports & exports panel.

## DELIVERABLE — tokens + components, adopted by the app

Author a real, small design system and wire it in. Not a style-guide PDF — CSS custom-property tokens + a component set the PE code consumes, replacing ad-hoc values.

1. COLOR TOKENS — the full palette as CSS vars, split into `--brand-*`, `--semantic-*`, `--surface-*`, `--atom-*`. Brand and semantic are SEPARATE namespaces (the whole point).
2. HONEST-ABSENCE RECOLOR — move "not verified here" off yellow to the neutral "unknown" treatment. Highest-impact fix for "too much yellow." (Touch: InspectCard.tsx, brief-verdict.ts, baked-facets.ts — the `#fcd34d`/`#c98b3a` uses.)
3. ATOM CHIP RECOLOR — purple `#c4b5fd` → the proposed teal via `--atom-*`. ~27 usages, all through the token.
4. BUTTON COMPONENT — one Button, four variants, replacing the ad-hoc buttons.
5. TYPE + SPACING SCALE — Oxygen display (already in the lockup) + the app's system-ui body; a fixed type + spacing scale as tokens. Keep the map chrome's existing radii/shadows.
6. THEME INTEGRITY — PE is dark-only (near-black chrome); commit to it deliberately, no light-mode inversion. Ensure gold-light passes contrast at 11–13px (operator flagged small-text gold).

BOUNDARIES (hold these): do NOT import Smart City navy SURFACE tokens onto the map — only accent + semantic + atom tokens are shared. Keep the near-black chrome, radii, shadows, system-ui body. Preserve the `empressa-pe-install-id` storage key (renaming orphans users). Leave the map's interaction-cyan search-highlight, the PDF print blue `#00b4d8`, and semantic error/warn alone unless the token migration explicitly covers them.

## OUT OF SCOPE (separate workstreams — do NOT do these here)

- Citation / link / atom-reference dead-ends — a separate broad-sweep audit (every reference resolves through one coherent data-inspection loop). This brief provides the atom-chip + link tokens it will use.
- Map default layers (everything except aerial/satellite on by default) — a config change, not design.
- Lower-left chrome (remove scroll-notification toasts; keep only the logo badge; move the required source tag next to the layers bubble as a collapsible ⓘ) — this brief provides the ⓘ + badge tokens.
- PDF X-ray template branding — done after the tokens exist so it inherits them.
