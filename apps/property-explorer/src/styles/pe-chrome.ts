// Smart Site chrome v2 — the ONE import for PE UI color / type / geometry /
// motion. Every value is a CSS var from pe-tokens.css; nothing here invents a
// number. Do not redeclare a colour in a surface file.
//
// TWO GROUPS on the PE object:
//   v2 keys  — t1..t6, line06/14/28, the geometry and motion scales. New and
//              ported code reads ONLY these.
//   legacy   — accent / muted / text / card / border, kept because ~25 surface
//              files still read them. Each resolves to a v2 var, so a port is
//              a rename with no visual step.
//
// Map overlays and print HTML are named islands and stay out of this module:
// map geometry is the only place --ss-sky is legal, and print CSS cannot read
// a runtime var.

export const PE = {
  // ---- Ground -----------------------------------------------------------
  void: "var(--ss-void, #07090D)",
  ink: "var(--ss-ink, #0B0E13)",
  raised: "var(--ss-raised, #12161D)",
  /** dock / inspect / any card on the map */
  panel: "var(--ss-ink-94, rgba(11,14,19,.94))",
  /** find bar, map controls */
  panelLight: "var(--ss-ink-92, rgba(11,14,19,.92))",
  /** rail bubble at rest */
  bubbleRest: "var(--ss-ink-90, rgba(11,14,19,.90))",
  sheet: "var(--ss-ink-96, rgba(11,14,19,.96))",
  tipBg: "var(--ss-raised-97, rgba(18,22,29,.97))",
  modalBg: "var(--ss-raised-98, rgba(18,22,29,.98))",
  scrim: "var(--ss-scrim, rgba(6,9,13,.74))",

  // ---- Hairlines. Three weights, one hue. Never a fourth. ---------------
  /** a rule INSIDE a surface */
  line06: "var(--ss-line-06, rgba(154,166,178,.07))",
  /** the edge OF a surface */
  line14: "var(--ss-line-14, rgba(154,166,178,.15))",
  /** focus, outline buttons, emphasis */
  line28: "var(--ss-line-28, rgba(154,166,178,.28))",

  // ---- Text ramp --------------------------------------------------------
  t1: "var(--ss-t1, #F8FAFC)",
  t2: "var(--ss-t2, #E9EEF5)",
  t3: "var(--ss-t3, #C6D0DC)",
  t4: "var(--ss-t4, #94A3B8)",
  t5: "var(--ss-t5, #7C8BA0)",
  t6: "var(--ss-t6, #64748B)",

  // ---- Action. Blue is the ONLY action colour. --------------------------
  blue: "var(--ss-blue, #3B82F6)",
  blueBg: "var(--ss-blue-bg, rgba(59,130,246,.12))",
  blueLine: "var(--ss-blue-line, rgba(59,130,246,.32))",
  onBlue: "#F8FAFC",

  // ---- Reserved hues. Each has exactly one job. -------------------------
  /** BRAND MARK ONLY. A gold button is a bug. */
  gold: "var(--ss-gold, #E8963B)",
  goldLt: "var(--ss-gold-lt, #F5B95C)",
  /** an openable record. Not chrome, not emphasis, never a number. */
  // NO HEX FALLBACK, deliberately. The atom accent is audited to live in
  // exactly two files (shared/atom-chip/atom-accent.ts and pe-tokens.css);
  // repeating it here as a fallback is the scattering that audit forbids.
  atom: "var(--ss-atom)",
  atomBg: "var(--atom-accent-bg, rgba(76,201,192,.12))",
  atomLine: "var(--atom-accent-border, rgba(76,201,192,.42))",
  /** absence: a thing that is not on file */
  slate: "var(--ss-slate, #7C8BA0)",

  // ---- Semantic. Always paired with a word, never colour alone. ---------
  ok: "var(--ss-ok, #10B981)",
  warn: "var(--ss-warn, #F59E0B)",
  err: "var(--ss-err, #EF4444)",

  // ---- Motion. One curve, four durations. ------------------------------
  ease: "var(--ss-ease, cubic-bezier(.2,.6,.35,1))",
  dTint: "var(--ss-d-tint, 100ms)",
  dState: "var(--ss-d-state, 140ms)",
  dMove: "var(--ss-d-move, 180ms)",
  dOpen: "var(--ss-d-open, 220ms)",

  // ---- Type -------------------------------------------------------------
  ui: 'var(--ss-ui, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif)',
  mono: 'var(--ss-mono, ui-monospace, "SF Mono", Menlo, monospace)',

  // ---- Geometry ---------------------------------------------------------
  hControl: 32,
  hDense: 26,
  hField: 34,
  hFind: 40,
  hHead: 36,
  bubble: 34,
  dockW: 380,
  findW: 436,
  inset: 20,

  rTouch: 6,
  rChip: 4,
  rTip: 8,
  rFloat: 10,
  rModal: 14,

  // ---- Elevation --------------------------------------------------------
  shRail: "var(--ss-sh-rail, 0 4px 14px rgba(0,0,0,.4))",
  shDock: "var(--ss-sh-dock, 0 18px 44px rgba(0,0,0,.5))",
  shModal: "var(--ss-sh-modal, 0 24px 80px rgba(0,0,0,.6))",
  shTip: "var(--ss-sh-tip, 0 10px 30px rgba(0,0,0,.55))",
  shFocus: "var(--ss-sh-focus, 0 0 0 3px rgba(59,130,246,.14))",
  shOpen: "var(--ss-sh-open, 0 6px 20px rgba(59,130,246,.28))",

  // ================= LEGACY KEYS — v1 names, v2 values ==================
  accent: "var(--ss-blue, #3B82F6)",
  accentBg: "var(--ss-blue-bg, rgba(59,130,246,.12))",
  accentBgSoft: "var(--brand-blue-bg-soft, rgba(59,130,246,.08))",
  accentBorder: "var(--ss-blue-line, rgba(59,130,246,.32))",
  accentBorderSoft: "var(--ss-blue-line, rgba(59,130,246,.32))",
  onAccent: "#F8FAFC",
  text: "var(--ss-t3, #C6D0DC)",
  textStrong: "var(--ss-t2, #E9EEF5)",
  muted: "var(--ss-t4, #94A3B8)",
  muted2: "var(--ss-t6, #64748B)",
  warning: "var(--ss-warn, #F59E0B)",
  absence: "var(--ss-slate, #7C8BA0)",
  absenceBg: "var(--semantic-absence-bg, rgba(124,139,160,.07))",
  absenceBorder: "var(--ss-line-28, rgba(154,166,178,.28))",
  error: "var(--ss-err, #EF4444)",
  success: "var(--ss-ok, #10B981)",
  card: "var(--ss-ink-94, rgba(11,14,19,.94))",
  border: "1px solid var(--ss-line-14, rgba(154,166,178,.15))",
  hairline: "1px solid var(--ss-line-06, rgba(154,166,178,.07))",
  font: 'var(--ss-ui, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif)',
  radiusCard: "var(--ss-r-float, 10px)",
  radiusBtn: "var(--ss-r-touch, 6px)",
  radiusChip: "var(--ss-r-chip, 4px)",
} as const;

/** The five type steps, as ready-made style fragments. Weight carries
 *  hierarchy: 300 titles, 400 body, 600 labels and buttons. There is no
 *  in-between size. */
export const TYPE = {
  /** uppercase field label above a value */
  label: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: ".13em",
    textTransform: "uppercase",
    color: PE.t6,
  },
  /** captions, notes, chips */
  meta: { fontSize: 11.5, fontWeight: 400 },
  /** running body; 600 makes it a button label */
  body: { fontSize: 12.5, fontWeight: 400 },
  /** the value under a field label */
  value: { fontSize: 13.5, fontWeight: 400, lineHeight: 1.3 },
  /** subject line inside a panel */
  subject: { fontSize: 15, fontWeight: 400, letterSpacing: "-.01em" },
  /** panel title */
  title: { fontSize: 20, fontWeight: 300, letterSpacing: "-.02em" },
  /** an uppercase dock-header title */
  head: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".1em",
    textTransform: "uppercase",
  },
} as const;

/** One transition string per motion class, so no surface authors a duration. */
export const MOTION = {
  tint: `${PE.dTint} ${PE.ease}`,
  state: `${PE.dState} ${PE.ease}`,
  move: `${PE.dMove} ${PE.ease}`,
  open: `${PE.dOpen} ${PE.ease}`,
} as const;
