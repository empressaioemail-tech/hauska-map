# Smart Site chrome v2 — handoff

This folder is a **restyle** of the shipped Property Explorer chrome. Behavior, component
inventory, and information order are unchanged. What changed is control scale, the type
ramp, hairline weights, radii, and how panels arrive on screen.

Read this file, then `SPEC.md`, then open the five files in `reference/` in a browser.

---

## What is in here

| Path | What it is |
|---|---|
| `README.md` | This file. Instructions, constraints, order of work. |
| `SPEC.md` | Component-by-component spec, mapped to the existing `source/` filenames. |
| `tokens/pe-tokens-v2.css` | The complete token set. Drop-in replacement for `pe-tokens.css`. |
| `reference/*.dc.html` | Five live sheets. Every specimen is interactive — open them, don't just read them. |
| `support.js` | Runtime for the reference sheets. Not product code; do not ship it. |

The reference sheets open directly in a browser with no build step and no network.
`reference/01-primitives.dc.html` is the one to open first.

---

## The two decisions that were settled

The shipped kit and the previously-harvested design system disagreed on both of these.
These are now the law, and the reference sheets are the tiebreaker:

1. **Blue `#3B82F6` is the only action color.** Every button, link, focus ring, selected
   state, and active bubble. **Gold `#E8963B` is the brand mark and nothing else** — never
   a button, link, fill, or hover. A gold button is a bug.
2. **Oxygen is dead.** No display face, no webfont, no CDN. System UI (`--ss-ui`) for prose,
   system mono (`--ss-mono`) for anything a person would read aloud as a number or a code.
   Delete the Oxygen token if it is still declared anywhere.

---

## What must not change

You are restyling, not redesigning. These are fixed:

- **Seven bubbles, right rail, same order.** Brief, AI chat, Reports, My properties, Share,
  Use in your AI, Compare. There is no eighth.
- **The information order inside every dock.** Same fields, same sequence, same grouping.
- **Every component's props and behavior.** A `Button` still takes the same variants; an
  `InspectCard` still receives the same parcel record.
- **The three honesty registers.** Slate = not on file. Amber = waiting. Red = failed.
  Absence is always a sentence naming what is missing and what would fill it — never a
  zero, a dash, an em-dash, or an empty rectangle.
- **The map is out of scope.** Nothing in here touches map rendering.

---

## The rules that produce the look

If you internalize six things, the rest follows.

1. **Height is the spec, padding falls out of it.** A primary button is `32px` tall with a
   `12.5px/600` label — not `10px 18px` of padding around a small word. Dense is `26px`,
   fields are `34px`, the find bar is `40px` and is the only exception above 34.
2. **Five type steps with real jumps.** `10 / 11.5 / 12.5 / 13.5 / 15 / 20`. Weight carries
   hierarchy: 300 for titles, 400 for body, 600 for labels and buttons. Never invent an
   in-between size.
3. **Label above value.** A field label is `10px/600/.13em` uppercase in `--ss-t6`; its value
   is `13.5px/400` in `--ss-t1` or `--ss-t2`. This is why the cards scan.
4. **Three hairline weights, one hue.** `.07` for rules inside a surface, `.15` for the edge
   of a surface, `.28` for focus and outline buttons. Uniform hairlines read as flat.
5. **One edge per surface.** No card inside a card inside a chip. Inside a surface, division
   is a `1px` rule or whitespace — never another border.
6. **Two radii.** `6px` for anything you touch, `10px` for anything that floats, `14px` for
   the modal, `50%` for bubbles. `4px` for status chips. Nothing else, and no odd numbers.

---

## Motion

One curve, `cubic-bezier(.2,.6,.35,1)`. Four durations: `100 / 140 / 180 / 220ms`.

A panel **opens its own height while scaling up 3% from its anchored corner** — top-left for
left-stack docks, right-center for rail tooltips, bottom-right for the sources sheet. It
never slides in from off-screen, nothing bounces, nothing overshoots. Press is `scale(.97)`.
Disabled is `opacity .45` with no color change.

Honor `prefers-reduced-motion`: keep the opacity fade, drop the scale and the height animation.

---

## Order of work

1. Land `tokens/pe-tokens-v2.css` and delete the old token file. Nothing else can be
   verified until the tokens are the source of truth.
2. `Button`, `Input`, `Card`, `StatusChip` — the four that every surface uses. Getting these
   right moves ~70% of the visual weight.
3. `DockShell` and `BubbleRail` — the chassis. Ship the fold-to-header stacking behavior
   described in `SPEC.md §2`; it is the single largest fix for the crowding.
4. The seven tool bodies, then the map chrome, then commerce.

Ship 1 and 2 before starting 3. A half-migrated Button in a new DockShell looks worse than
either half.

---

## How to check your work

For any surface you build, all of these must be true:

- No hardcoded hex. Every color is a `var(--ss-*)`.
- No font size outside the six ramp steps.
- No border radius outside `4 / 6 / 10 / 14 / 50%`.
- No gold anywhere except the brand mark. No sky `#7DD3FC` anywhere inside a panel.
- Exactly one filled primary button per surface.
- Every empty or failed state is a sentence with a basis line, not a blank.
- Every transition uses `--ss-ease` and one of the four durations.

---

## Open items for the product owner

Flag these rather than deciding them yourself:

- **One dock expanded at a time.** The new stacking model expands the newest tool and folds
  the rest to their header. Pinning or two-open-at-once was not specified.
- **No recommended tier.** Pricing carries a neutral "Common" tag on Pro and no tier is
  pre-selected. If marketing wants a recommended tier, it is a one-line change.
- **`Compare` is drawn as not-built** with an explanation and a way forward. If it is being
  wired now, that panel needs a real design.
