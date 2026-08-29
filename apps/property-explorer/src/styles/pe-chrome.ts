// Smart Site chrome — STONE. The ONE import for PE UI colour / type /
// geometry / motion. Every colour here is a CSS var from pe-tokens.css;
// nothing invents a number. Do not redeclare a colour in a surface file.
//
// NO FALLBACKS. Every var() below is bare. Until the Stone port, ~65 of them
// were written as `var(--token, #literal)`, which is a form this operation has
// now banned outright: it LOOKS like it respects the token while being a
// second source of truth that surfaces only when the first is missing — which
// is exactly the failure it claims to handle, hidden. A missing token should
// render wrong and loudly, not render an eight-month-old palette quietly.
//
// TWO GROUPS on the PE object:
//   Stone keys — t1..t6, line06/14/28, the geometry and motion scales. New and
//                ported code reads ONLY these.
//   legacy     — accent / muted / text / card / border, kept because ~25
//                surface files still read them. Each resolves to a Stone var,
//                so a port is a rename with no visual step.
//
// Geometry reads the --ss-* tokens. A height edit in pe-tokens.css is the
// one that shows. Plain numbers here were a second source of truth.
//
// Map overlays and print HTML are named islands and stay out of this module:
// map geometry is the only place --ss-sky is legal, and print CSS cannot read
// a runtime var.

export const PE = {
  // ---- Ground -----------------------------------------------------------
  void: "var(--ss-void)",
  ink: "var(--ss-ink)",
  raised: "var(--ss-raised)",
  /** dock / inspect / any card on the map. OPAQUE on Stone. */
  panel: "var(--ss-ink-94)",
  /** find bar, map controls */
  panelLight: "var(--ss-ink-92)",
  /** rail bubble at rest */
  bubbleRest: "var(--ss-ink-90)",
  sheet: "var(--ss-ink-96)",
  tipBg: "var(--ss-raised-97)",
  modalBg: "var(--ss-raised-98)",
  /** the one translucent value in the palette */
  scrim: "var(--ss-scrim)",

  // ---- Hairlines. Three weights, one hue. Never a fourth. ---------------
  /** a rule INSIDE a surface */
  line06: "var(--ss-line-06)",
  /** the edge OF a surface */
  line14: "var(--ss-line-14)",
  /** focus, outline buttons, emphasis */
  line28: "var(--ss-line-28)",

  // ---- Text ramp --------------------------------------------------------
  t1: "var(--ss-t1)",
  t2: "var(--ss-t2)",
  t3: "var(--ss-t3)",
  t4: "var(--ss-t4)",
  t5: "var(--ss-t5)",
  t6: "var(--ss-t6)",

  // ---- Action. Blue is the ONLY action colour. --------------------------
  blue: "var(--ss-blue)",
  blueBg: "var(--ss-blue-bg)",
  blueLine: "var(--ss-blue-line)",
  /**
   * The colour that sits ON --ss-blue.
   *
   * THIS FLIPPED IN THE STONE PORT AND THE FLIP IS THE POINT. v2 blue was
   * #3B82F6, a mid-dark blue that took near-white text. Stone blue is #86ADDF,
   * a LIGHT blue: near-white on it measures about 2.2:1, which fails every
   * threshold there is. The on-colour therefore inverts to the darkest step.
   * Anything reaching for a light "on blue" is carrying a v2 assumption.
   *
   * Zero consumers at the time of the port (measured across src/), so this is
   * a corrected definition rather than a fix to something rendering today.
   */
  onBlue: "var(--ss-void)",

  // ---- Reserved hues. Each has exactly one job. -------------------------
  /** BRAND MARK ONLY (and the rail unread dot). A gold button is a bug. */
  gold: "var(--ss-gold)",
  goldLt: "var(--ss-gold-lt)",
  /** an openable record. Not chrome, not emphasis, never a number. */
  atom: "var(--ss-atom)",
  /**
   * Stone ships --ss-atom alone — no atom fill and no atom line, unlike blue
   * which has both. These two keep pointing at the legacy aliases so the
   * fill/line decision lives in ONE place (pe-tokens.css) rather than being
   * restated here and free to drift from it.
   */
  atomBg: "var(--atom-accent-bg)",
  atomLine: "var(--atom-accent-border)",
  /** absence: a thing that is not on file */
  slate: "var(--ss-slate)",

  // ---- Semantic. Always paired with a word, never colour alone. ---------
  ok: "var(--ss-ok)",
  warn: "var(--ss-warn)",
  err: "var(--ss-err)",

  // ---- Motion. One curve, four durations. ------------------------------
  ease: "var(--ss-ease)",
  dTint: "var(--ss-d-tint)",
  dState: "var(--ss-d-state)",
  dMove: "var(--ss-d-move)",
  dOpen: "var(--ss-d-open)",

  // ---- Type -------------------------------------------------------------
  ui: "var(--ss-ui)",
  mono: "var(--ss-mono)",
  /** the wordmark face. Resolves to the UI stack until a woff2 is self-hosted. */
  brand: "var(--ss-brand)",

  // ---- Geometry ---------------------------------------------------------
  // Stone moved the control scale up a notch. dockW / findW / inset did NOT
  // change — verified against the design system tokens/size.css, which carries
  // 380 / 436 / 20 exactly as below.
  hControl: "var(--ss-h-control)",
  hDense: "var(--ss-h-dense)",
  hField: "var(--ss-h-field)",
  hFind: "var(--ss-h-find)",
  hHead: "var(--ss-h-head)",
  bubble: "var(--ss-bubble)",
  dockW: "var(--ss-dock-w)",
  findW: "var(--ss-find-w)",
  inset: "var(--ss-inset)",

  rTouch: "var(--ss-r-touch)",
  rChip: "var(--ss-r-chip)",
  rTip: "var(--ss-r-tip)",
  rFloat: "var(--ss-r-float)",
  rModal: "var(--ss-r-modal)",

  // ---- Elevation --------------------------------------------------------
  // Stone shadows are markedly shallower than v2: a panel is identified by its
  // border and its surface step, not by a glow.
  shRail: "var(--ss-sh-rail)",
  shDock: "var(--ss-sh-dock)",
  shModal: "var(--ss-sh-modal)",
  shTip: "var(--ss-sh-tip)",
  shFocus: "var(--ss-sh-focus)",
  shOpen: "var(--ss-sh-open)",

  // ================= LEGACY KEYS — v1 names, Stone values ================
  accent: "var(--ss-blue)",
  accentBg: "var(--ss-blue-bg)",
  accentBgSoft: "var(--brand-blue-bg-soft)",
  accentBorder: "var(--ss-blue-line)",
  accentBorderSoft: "var(--ss-blue-line)",
  /** see onBlue — same inversion, same reason. */
  onAccent: "var(--ss-void)",
  text: "var(--ss-t3)",
  textStrong: "var(--ss-t2)",
  muted: "var(--ss-t4)",
  muted2: "var(--ss-t6)",
  warning: "var(--ss-warn)",
  absence: "var(--ss-slate)",
  absenceBg: "var(--semantic-absence-bg)",
  absenceBorder: "var(--ss-line-28)",
  error: "var(--ss-err)",
  success: "var(--ss-ok)",
  card: "var(--ss-ink-94)",
  border: "1px solid var(--ss-line-14)",
  hairline: "1px solid var(--ss-line-06)",
  font: "var(--ss-ui)",
  radiusCard: "var(--ss-r-float)",
  radiusBtn: "var(--ss-r-touch)",
  radiusChip: "var(--ss-r-chip)",
} as const;

/** The type steps, as ready-made style fragments. Weight carries hierarchy:
 *  300 titles, 400 body, 600 labels and buttons, 700 the two uppercase/display
 *  steps. There is no in-between size.
 *
 *  SIX UI STEPS plus a seventh that is not a UI step. The six are
 *  11.5 / 12.5 / 14.5 / 15.5 / 17.5 / 26 and are legal anywhere. `display` is
 *  32 and is legal in exactly three files — see DISPLAY_ALLOWED in
 *  scripts/pe-chrome-kit-gate.mjs. The allow-list is the control, not the
 *  number: a rule that only checked the value would permit a 32px headline
 *  inside a dock, which is the thing the ruling exists to prevent. */
export const TYPE = {
  /** uppercase field label above a value */
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: ".13em",
    textTransform: "uppercase",
    color: PE.t6,
  },
  /** captions, notes, chips */
  meta: { fontSize: 12.5, fontWeight: 400 },
  /** running body; 600 makes it a button label */
  body: { fontSize: 14.5, fontWeight: 400 },
  /** the value under a field label */
  value: { fontSize: 15.5, fontWeight: 400, lineHeight: 1.3 },
  /** subject line inside a panel */
  subject: { fontSize: 17.5, fontWeight: 400, letterSpacing: "-.01em" },
  /** panel title */
  title: { fontSize: 26, fontWeight: 300, letterSpacing: "-.02em" },
  /** An uppercase dock-header title. Was 11px at 600 with .1em tracking and no
   *  colour — the one step in the old ramp with no token behind it, which is
   *  how it drifted off the scale in the first place. Ruled onto 11.5 (the
   *  label step) at 700 with .13em tracking and t3, so the header reads as a
   *  header by weight rather than by an off-ramp size. */
  head: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: ".13em",
    textTransform: "uppercase",
    color: PE.t3,
  },
  /** THE SEVENTH STEP. Cold open, pricing headline, checkout — surfaces seen
   *  once, never the dense surfaces an operator works in. It never appears in
   *  a panel, a dock, a row, a chip, or over the map. Allow-listed to three
   *  files and refused everywhere else by the kit gate. */
  display: { fontSize: 32, fontWeight: 700, letterSpacing: "-.02em" },
} as const;

/** One transition string per motion class, so no surface authors a duration. */
export const MOTION = {
  tint: `${PE.dTint} ${PE.ease}`,
  state: `${PE.dState} ${PE.ease}`,
  move: `${PE.dMove} ${PE.ease}`,
  open: `${PE.dOpen} ${PE.ease}`,
} as const;
