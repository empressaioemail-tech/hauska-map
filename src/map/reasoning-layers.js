/**
 * V5 — reasoning layer paint expressions and legend (no fixture data imports).
 */

const CONSEQUENCE_COLORS = {
  routine: { fill: "#8ecae6", stroke: "#219ebc" },
  elevated: { fill: "#ffb703", stroke: "#fb8500" },
  critical: { fill: "#e85d04", stroke: "#dc2f02" },
  essential: { fill: "#9d0208", stroke: "#6a040f" },
};

const TRIAGE_COLORS = {
  ok: { fill: "#2fd07a", stroke: "#7df0b0" },
  verify: { fill: "#ffb703", stroke: "#fb8500" },
  "human-required": { fill: "#dc2f02", stroke: "#9d0208" },
};

export function consequenceFillColorExpr() {
  const C = CONSEQUENCE_COLORS;
  return [
    "match",
    ["get", "consequenceStratum"],
    "essential",
    C.essential.fill,
    "critical",
    C.critical.fill,
    "elevated",
    C.elevated.fill,
    C.routine.fill,
  ];
}

export function triageFillColorExpr() {
  const C = TRIAGE_COLORS;
  return [
    "match",
    ["get", "triageState"],
    "human-required",
    C["human-required"].fill,
    "verify",
    C.verify.fill,
    C.ok.fill,
  ];
}

export const CONSEQUENCE_LEGEND = Object.entries(CONSEQUENCE_COLORS).map(([key, c]) => ({
  key: `Consequence ${key}`,
  fill: c.fill,
  stroke: c.stroke,
}));

export const TRIAGE_LEGEND = [
  { key: "Triage OK", fill: TRIAGE_COLORS.ok.fill, stroke: TRIAGE_COLORS.ok.stroke },
  { key: "Verify", fill: TRIAGE_COLORS.verify.fill, stroke: TRIAGE_COLORS.verify.stroke },
  { key: "Human required", fill: TRIAGE_COLORS["human-required"].fill, stroke: TRIAGE_COLORS["human-required"].stroke },
];

export const CONTESTED_LEGEND = {
  key: "Contested ground (D8 vs FEMA)",
  fill: "rgba(220,47,2,0.35)",
  stroke: "#dc2f02",
};
