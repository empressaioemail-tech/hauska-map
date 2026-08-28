# Component spec

Every entry names the reference sheet that shows it live. Open the sheet; it is normative
where this document is ambiguous.

Tokens are from `tokens/pe-tokens-v2.css`. Bare numbers below are px.

---

## 1 · Primitives — `reference/01-primitives.dc.html`

### Button — `components/Button.tsx`

Height is the spec. Padding is derived, never authored.

| | Default | Dense |
|---|---|---|
| Height | 32 | 26 |
| Padding x | 14 | 10 |
| Label | 12 / 600 | 11.5 / 600 |
| Radius | 6 | 6 |

Four variants:

| Variant | Background | Label | Border |
|---|---|---|---|
| `primary` | `--ss-blue` | `#F8FAFC` | `--ss-blue` |
| `secondary` | transparent | `--ss-t2` | `--ss-line-28` |
| `ghost` | transparent | `--ss-blue` | `--ss-blue-line` |
| `subtle` | `--ss-blue-bg` | `--ss-blue` | none |

- Press: `transform: scale(.97)`, `100ms`.
- Disabled: `opacity: .45`, cursor default. No color change.
- Focus: `box-shadow: 0 0 0 2px var(--ss-ink), 0 0 0 4px rgba(59,130,246,.55)`.
- **One filled primary per surface.** Two primaries side by side is a bug.
- Full-width variant fills its container and keeps the 32 height.

### Card — `components/Card.tsx`

- `resting` — `--ss-ink` at 94% alpha, `1px --ss-line-14`, radius 10, `--ss-sh-dock`.
  Docks, inspect, anything on the map.
- `raised` — `--ss-raised` at 98%, `1px --ss-line-28`, radius 14, `--ss-sh-modal`. **Modal only.**

Internal division is a `1px --ss-line-06` rule bled to the card edge with negative margin.
Never nest a bordered card in a bordered card.

### Input / TextArea — `components/Input.tsx`

Height 34 (textarea 76), padding `0 11`, radius 6, `1px --ss-line-14`, fill
`rgba(255,255,255,.02)`, text 12.5 `--ss-t2`, placeholder `--ss-t6`.

- Focus: border `--ss-blue` plus `--ss-sh-focus`. Nothing moves or resizes.
- Invalid: border `--ss-err`, fill `rgba(239,68,68,.05)`, and an error line below at
  11.5 `--ss-err` with a 13px alert glyph. The error names the expected format.

### StatusChip — `components/StatusChip.tsx`

Height 22, padding `0 8`, radius 4, label 11 / 600, 12px glyph, 6px gap.
**Word plus color, never color alone.**

| State | Color | Fill | Border |
|---|---|---|---|
| Cited | `--ss-ok` | 10% | solid 30% |
| Provisional | `--ss-warn` | 10% | solid 30% |
| Not on file | `--ss-slate` | none | **dashed** `--ss-line-28` |
| Lookup failed | `--ss-err` | 10% | solid 30% |
| Studio | `--ss-blue` | `--ss-blue-bg` | `--ss-blue-line` |

**AtomChip** — height 24, `--ss-atom` on 12% fill, compact label plus a mono record id at
400 weight / 85% opacity. `.dead` (unservable) is the same chip with a dashed border and
still opens. Atom teal marks an openable record and nothing else — never emphasis, never a
number, never a web link.

**UnverifiedSource** — a `999px` pill, `--ss-t4`, link glyph, domain, and the word
`unverified`. It never wears atom teal.

### DownloadFileButton — `components/DownloadFileButton.tsx`

Height 36, radius 6, `1px --ss-line-28`. Blue download glyph, `12.5/600 --ss-t1` verb, real
byte size in mono `--ss-t5` right-aligned.

- Generating: spinner replaces the glyph, label goes `--ss-t3`, right side shows a
  **duration estimate**, never a fake size.
- Failed: `--ss-err` border and fill, alert glyph, and a blue `Retry` at 11.5 / 600.
- A finished file is always a button. Never a text link.

### BubbleTip — `components/BubbleTip.tsx`

Replaces the native `title`. Anchored right-center, `11px` clear of the bubble, flying
inward toward the map.

- Radius 8, `--ss-raised` at 97%, `1px --ss-line-14`, `0 10px 30px rgba(0,0,0,.55)`.
- Label 12 / 500 `--ss-t2`; optional second line 11 `--ss-t5`; optional mono shortcut key `--ss-t6`.
- In: opacity `100ms`, transform `180ms` from `translateX(6px) scale(.96)`.
- `pointer-events: none` always.

### GoogleSignInButton — `components/GoogleSignInButton.tsx`

Official mark, never recolored, never alone. Label is always "Sign in with Google".
Dark variant (`#131A24`, `--ss-line-28`, 40 tall) is the product default; the white
official variant is for the light landing card only.

### Modal — `components/Modal.tsx`

Scrim `rgba(6,9,13,.74)` over the map; clicking it closes. One raised card, centered.
40px header with uppercase title and a close control. Enters from `scale(.97) translateY(6px)`
over `180ms`; scrim crossfades over the same beat. Width animates over `220ms` when the
step changes. It is a shell for pricing, checkout, and auth — never a page.

---

## 2 · Chassis — `reference/02-chassis.dc.html`

### BubbleRail — `browse/BubbleRail.tsx`

`34px` circles, `8px` gap, right edge, `20px` inset. Seven, in the fixed order. 15px glyphs
at 1.7 stroke.

| State | Fill | Glyph | Border | Shadow |
|---|---|---|---|---|
| Rest | `--ss-ink` 90% | `--ss-t3` | `--ss-line-14` | `--ss-sh-rail` |
| Hover | `rgba(24,30,42,.96)` | `--ss-t1` | `--ss-line-28` | `--ss-sh-rail` |
| Open | `--ss-blue` | `#08111F` | `--ss-blue` | `0 6px 20px rgba(59,130,246,.28)` |
| Has news | rest + a 7px `--ss-blue` dot on the rim, `1.5px --ss-ink` ring | | | |
| Needs sign-in | rest at `opacity .55`; click opens the sign-in card | | | |
| Not built | transparent fill, `--ss-t6` glyph, `opacity .5`; tip says coming soon | | | |

Never a count badge, never a red dot, never a scale transform on hover.

### DockShell — `browse/DockShell.tsx`

| Part | Spec |
|---|---|
| Width | `340` — every tool, one width, one left edge |
| Header | `36` tall, `0 8 0 12` padding, `1px --ss-line-06` bottom, fill `rgba(255,255,255,.015)` |
| Header content | 13px blue glyph · uppercase `11/600/.1em --ss-t3` title · optional mono badge · expand · close |
| Body | `14 / 13` padding, scrolls |
| Footer | `1px --ss-line-06` top, holds the one primary action |
| Gap between docks | `8` |
| Radius | `10`, `--ss-sh-dock` |

**Stacking — the behavior change.** Docks share one left column. Opening a tool expands it
and **folds every other open tool to its 36px header**. A folded header is the whole hit
target: one click restores it at its previous scroll position. Nothing is closed on the
user's behalf; the close control is separate and must `stopPropagation`.

Open: `max-height 220ms`, `opacity 140ms`, `transform 180ms` from
`scale(.97) translateY(-8px)`, origin top-left. Fold: the same, on the body only.
A folded header drops its fill, its bottom rule, and dims its glyph and title one step.

### StateNote — `components/StateNote.tsx`

The honest-empty. Radius 8, `12 / 13` padding. Title `12.5/600` in the register color, basis
line `11.5 --ss-t5` below it, optional ghost action button.

| Register | Color | Fill | Border |
|---|---|---|---|
| Not on file | `--ss-slate` | 7% | **dashed** `--ss-line-28` |
| Waiting | `--ss-warn` | 7% | solid 25% |
| Failed | `--ss-err` | 6% | solid 28% |
| Nothing yet | `--ss-t4` | none | dashed `--ss-line-14` |

Every state names **what is missing and what would fill it**. "A recorded plat or an adopted
zoning ordinance would fill this" — not "No data".

### LockedPanel — `browse/LockedPanel.tsx`

Renders the tool's **real content** at `blur(3.5px) opacity(.5)`, with a
`rgba(7,9,13,.55)` veil carrying a lock glyph, a 12.5/600 title, one line of what you get,
and a 28px primary stating the price. Never a generic paywall graphic — the user must see
the shape of what they would be buying.

### Loading

Header spinner (12px, `1.6px`, `--ss-line-28` with `--ss-blue` top, `700ms` linear) plus a
mono progress count like `4 of 7`. The body shows **the real field labels** with shimmering
bars where values will land, staggered `120ms` apart. Never a bare spinner, never a
full-panel skeleton with no labels.

---

## 3 · The seven tools — `reference/03-seven-tools.dc.html`

All seven share the `DockShell`. Only body composition differs.

1. **Property brief** — subject line 19/400, mono parcel id + county + `Fixture` tag, then
   label-above-value facts at `13px` gap. Each fact may carry a note (`11.5 --ss-t6`) and an
   AtomChip. Footer: primary `Research this parcel` + secondary `Save`.
2. **AI chat** — mandatory scope line naming the parcel. User turns are right-aligned
   `--ss-blue-bg` bubbles with an asymmetric radius (`10 10 4 10`); answers are plain 12.5
   `--ss-t3` text with AtomChips beneath. Refusals render as a `StateNote`. Typing is three
   5px dots blinking `1.2s`, staggered `200ms`. **No avatar, no mascot, no AI badge.**
3. **Reports & exports** — grouped `Ready now` / `Studio tier` / `Not built yet`, never
   interleaved. 36px rows with a state glyph, name, and mono format tag. A
   `DownloadFileButton` for the primary artifact sits in the footer.
4. **My properties** — filter field, then rows with a 3px selection rail, address,
   mono parcel id, county, and a research-status word colored by register.
5. **Share** — states what the recipient will see **before** the link exists. Mono link in a
   field, a copy control that swaps to a green check for `1400ms`, expiry segments
   (`24 hours` / `7 days` / `Never`), footer primary `Send by email`.
6. **Use in your AI** — `Markdown` / `JSON` / `Prompt` segments over a mono payload block at
   `11px / 1.65`. The one place mono runs as a block. Footer primary is Copy, with the real
   byte count beside it.
7. **Compare** — **not built.** Renders a clock glyph, a sentence saying it is not built,
   what it will do, why saving parcels now still helps, and a ghost button to My properties.
   Do not ship a disabled surface.

---

## 4 · Map chrome — `reference/04-map-chrome.dc.html`

### FindBar — `browse/FindBar.tsx`

`436 × 40`, centered, `20` from the top. Radius 10, `--ss-ink` 92%, `1px --ss-line-14`,
`0 8px 28px rgba(0,0,0,.45)`. Text 13.5. Mono `⌘K` hint in a 4px-radius box.

Focus adds `--ss-blue` border and `--ss-sh-focus`, and turns the search glyph blue. The
suggestion list drops `6px` below, radius 10, grouped (`Addresses`, `Recent`) with uppercase
group labels, 38px rows, mono metadata right-aligned, and a footer stating what is accepted
plus `↑↓ move · ↵ open`. Opens `max-height 220ms` / `opacity 140ms` /
`transform 180ms` from `scale(.98) translateY(-6px)`, origin top.

Two failure states, both stating a basis: nothing matched (`0 results`, "Nothing was
guessed") and geocoder down (red glyph, blue `retry`, "Parcel id lookup still works").

### InspectCard — `browse/InspectCard.tsx`

Same shell as a dock. Subject line, mono identity row, then a **two-column fact grid**
(`13px / 12px` gap) — six facts in the height the old card used for three. Footer primary
`Open property brief`.

### Parcel geometry — `map/ParcelHighlight.tsx`

| State | Stroke | Fill |
|---|---|---|
| Selected | `--ss-blue` solid 1.5 | 10% |
| Hover | `--ss-sky` solid 1.5 | none |
| Saved | `--ss-atom` solid 1.5 | 7% |
| Boundary unverified | `--ss-slate` **dashed** 1.5 | none |

Selection pulses once on arrival (`2.4s`, scale to 2.6, fade out) — on arrival only, not
continuously. **Sky is map-only and never appears inside a panel.**

### Map controls

30px squares, radius 8, `--ss-ink` 92%, `1px --ss-line-14`, `--ss-sh-rail`, `--ss-t3` glyphs.
Zoom in/out are one stacked unit split by a `--ss-line-06` rule; locate and layers are
separate units below.

### BrandChip — `chrome/BrandChip.tsx`

17px ring glyph with a gold center dot, then `SMART` in `#F8FAFC` and `SITE` in
`--ss-gold-lt`, both `11.5/600/.16em`. Bottom-left, `20` inset, may carry a county name
after a hairline divider. **The only gold in the product.** Never on a button, never a
hover, never below 14px.

### SourcesSheet — `chrome/SourcesSheet.tsx`

A 30px circular ⓘ button bottom-right toggles a `264px` register that opens from
`scale(.97) translateY(8px)`, origin bottom-right. Rows carry a 3px status rail, source
name, mono last-read time, and a status word. `Live` is quiet, `Failed` is `--ss-err`,
`Not connected` is `--ss-t6` text with a `--ss-line-28` rail — never a green dot, never a
vendor logo. Basemap attribution lives in the map's own footer, not here.

---

## 5 · Money & identity — `reference/05-money-identity.dc.html`

All four are the same modal shell over the same dimmed map. Width animates between steps:
cold open `460`, auth `400`, pricing `660`, checkout `400`.

### Cold open

26px brand glyph, wordmark, `26/300` headline, one sentence of what the product does, a
focused 44px find field, three example chips (address / parcel id / coordinates), and the
free-tier statement. No nav, no hero image, no marketing sections.

### Auth

States what an account preserves and that nothing already viewed is lost. Google button,
`or` divider, email field, `Email me a sign-in link` secondary. Closes with a plain privacy
line. No password field.

### Pricing — `commerce/PriceTier.tsx`

Three tiers in a `1fr` grid, `12px` gap. Each: uppercase name, optional neutral tag, mono
price at `24/400` with a small `per` unit, one line of who it is for, a rule, then the
`CheckRow` list.

**Nothing is pre-selected.** The footer note reads "Pick a tier to continue. Nothing is
selected for you." until a tier is chosen, then becomes that tier's description; the CTA
becomes `Continue with <Tier>`. Selected state is `--ss-blue` border, 10% fill, blue name.

### CheckRow — `commerce/CheckRow.tsx`

| Kind | Glyph | Glyph color | Label color |
|---|---|---|---|
| Included | check | `--ss-ok` | `--ss-t3` |
| Not included | slash | `--ss-slate` | `--ss-t6` |
| Higher tier only | lock | `--ss-warn` | `--ss-t4` |
| Not built yet | alert | `--ss-t6` | `--ss-t6` |

Exclusions are listed **in the same list, at the same size** as inclusions. Never a greyed
check. Never sell something before it ships.

### Checkout

Line item with address and mono parcel id, itemized rows (`included` printed as a word, not
`$0.00`), a heavier rule, then `Total today` with the figure at `20px` mono. Card fields are
mono. Footer primary reads `Pay $16.24` — **the button states the amount**. Below it, a lock
glyph and the processor disclosure.

### PayResult — `commerce/PayResult.tsx`

- **Charging** — spinner, `--ss-t2`, "Do not close the window."
- **Paid** — `--ss-ok`, names the unlocked parcel, says research is running, and the action
  is `Back to the parcel`. Success returns the user to work, never to a receipt page.
- **Declined** — `--ss-err`, **names the bank's reason**, states nothing was charged and the
  parcel is unchanged, offers `Try another card`.
