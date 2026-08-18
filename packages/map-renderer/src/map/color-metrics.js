/**
 * Colour metrics — the instrument the palette gates are measured with.
 *
 * The map palettes are not eyeballed. Every categorical slot has to clear a
 * separation floor under normal vision AND under simulated colour-vision
 * deficiency, and every stroke has to clear a contrast ratio against the
 * surface it is drawn on. Those are computable, so they are computed, in a test
 * that fails when someone nudges a hex.
 *
 * ΔE here is Euclidean distance in OKLab x100. CVD simulation is
 * Machado, Oliveira & Fernandes (2009) at severity 1.0 — the simulation model
 * is part of the standard, not an implementation detail, because the thresholds
 * are calibrated against it.
 *
 * Thresholds in use (all-pairs list, because a choropleth can put any two
 * classes side by side):
 *   normal-vision ΔE >= 15   hard floor
 *   CVD ΔE          >= 8     target (min of protanopia and deuteranopia)
 *   WCAG contrast   >= 3:1   for marks against their surface
 */

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

function hexToSrgb(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`color-metrics: expected a 6-digit hex, got "${hex}"`);
  }
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function linearRgb(hex) {
  return hexToSrgb(hex).map(srgbToLinear);
}

function oklabFromLinear([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(hex, kind) {
  const [r, g, b] = linearRgb(hex);
  const M = MACHADO[kind];
  const clamp = (c) => Math.max(0, Math.min(1, c));
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ];
}

const dist = (a, b) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** OKLab ΔE x100 under unsimulated (normal) vision. */
export function deltaE(a, b) {
  return dist(oklabFromLinear(linearRgb(a)), oklabFromLinear(linearRgb(b)));
}

/** OKLab ΔE x100 under one CVD kind ("protan" | "deutan"). */
export function deltaEunder(a, b, kind) {
  return dist(oklabFromLinear(simulate(a, kind)), oklabFromLinear(simulate(b, kind)));
}

/** The binding CVD separation: the WORSE of protanopia and deuteranopia. */
export function deltaEcvd(a, b) {
  return Math.min(deltaEunder(a, b, "protan"), deltaEunder(a, b, "deutan"));
}

/** OKLCH lightness and chroma. Chroma below ~0.10 reads as grey. */
export function oklch(hex) {
  const [L, a, b] = oklabFromLinear(linearRgb(hex));
  return { L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** WCAG relative luminance. */
export function relativeLuminance(hex) {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function wcagContrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
