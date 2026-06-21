/**
 * atom-contract@1.4.0 read-contract consumption (V4).
 * Local JS mirror — pin to @hauska/atom-contract/read-contract when published.
 */

const PROVENANCE = new Set(["asserted", "backtest", "seed", "live"]);

/** @typedef {{ estimate: number, n: number, intervalWidth: number, provenance: string }} WidthedConfidence */
/** @typedef {{ calibratedConfidence: WidthedConfidence, assertedConfidence: WidthedConfidence, consequence: object }} ThreeAxisConfidence */
/** @typedef {{ axes: ThreeAxisConfidence, assembledAt?: string, modelAttribution?: object }} ReadContract */

export function isWidthedConfidence(value) {
  if (!value || typeof value !== "object") return false;
  const { estimate, n, intervalWidth, provenance } = value;
  return (
    typeof estimate === "number" &&
    estimate >= 0 &&
    estimate <= 1 &&
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 0 &&
    typeof intervalWidth === "number" &&
    intervalWidth >= 0 &&
    intervalWidth <= 1 &&
    PROVENANCE.has(provenance)
  );
}

export function isReadContract(value) {
  if (!value?.axes) return false;
  const { calibratedConfidence, assertedConfidence, consequence } = value.axes;
  return (
    isWidthedConfidence(calibratedConfidence) &&
    isWidthedConfidence(assertedConfidence) &&
    consequence &&
    typeof consequence === "object" &&
    typeof consequence.stratum === "string"
  );
}

/** Legacy EngineEnvelope confidence — not renderable under V4. */
export function isLegacyScalarConfidence(value) {
  if (value == null) return false;
  if (typeof value === "number") return true;
  if (typeof value !== "object") return false;
  if (isWidthedConfidence(value) || isReadContract(value)) return false;
  return "value" in value && typeof value.value === "number" && !("intervalWidth" in value);
}

export function createWidthedConfidence(input) {
  const parsed = {
    estimate: Number(input.estimate),
    n: Math.max(0, Math.floor(Number(input.n) || 0)),
    intervalWidth: Number(input.intervalWidth),
    provenance: input.provenance,
  };
  if (!isWidthedConfidence(parsed)) {
    throw new Error("Invalid widthed confidence — all fields required");
  }
  return Object.freeze(parsed);
}

export function createReadContract(axes, assembledAt = new Date().toISOString()) {
  const contract = Object.freeze({
    axes: Object.freeze({
      calibratedConfidence: axes.calibratedConfidence,
      assertedConfidence: axes.assertedConfidence,
      consequence: Object.freeze({ ...axes.consequence }),
    }),
    assembledAt,
  });
  if (!isReadContract(contract)) throw new Error("Invalid read-contract");
  return contract;
}

/** Migrate legacy { value, kind } to widthed asserted shape for display only — not emission. */
export function legacyToWidthedAsserted(legacy) {
  if (!legacy || typeof legacy !== "object") return null;
  const estimate = legacy.value ?? legacy.estimate;
  if (typeof estimate !== "number") return null;
  return createWidthedConfidence({
    estimate,
    n: legacy.n ?? 0,
    intervalWidth: legacy.intervalWidth ?? 0.35,
    provenance: legacy.provenance ?? (legacy.kind === "calibrated" ? "backtest" : "asserted"),
  });
}

export function extractEnvelopeReadContract(envelope) {
  if (!envelope) return null;
  if (isReadContract(envelope.readContract)) return envelope.readContract;
  if (isReadContract(envelope.engineHonesty?.readContract)) return envelope.engineHonesty.readContract;
  return null;
}

/** Scalar-only fills are physically unrenderable under V4. */
export function isRenderableEnvelope(envelope) {
  const rc = extractEnvelopeReadContract(envelope);
  if (rc) return true;
  if (isLegacyScalarConfidence(envelope?.confidence)) return false;
  if (envelope?.confidence == null) return false;
  return isWidthedConfidence(envelope.confidence);
}

export function envelopeIntervalWidth(envelope) {
  const rc = extractEnvelopeReadContract(envelope);
  if (rc) {
    return rc.axes.calibratedConfidence.intervalWidth;
  }
  if (isWidthedConfidence(envelope?.confidence)) {
    return envelope.confidence.intervalWidth;
  }
  return null;
}

/** Tight interval → full saturation; wide interval → muted (0.35 floor). */
export function saturationFromIntervalWidth(intervalWidth) {
  if (intervalWidth == null || !Number.isFinite(intervalWidth)) return 0;
  const w = Math.max(0, Math.min(1, intervalWidth));
  return Math.max(0.35, 1 - w * 0.65);
}

export function envelopeSaturation(envelope) {
  const w = envelopeIntervalWidth(envelope);
  return w == null ? 0 : saturationFromIntervalWidth(w);
}

export function formatWidthedConfidence(conf) {
  if (!isWidthedConfidence(conf)) return "unrenderable (scalar-only)";
  return `estimate=${conf.estimate.toFixed(2)} n=${conf.n} width=${conf.intervalWidth.toFixed(2)} provenance=${conf.provenance}`;
}

export function formatReadContractSummary(contract) {
  if (!isReadContract(contract)) return "No read-contract object";
  const cal = contract.axes.calibratedConfidence;
  const asc = contract.axes.assertedConfidence;
  const cons = contract.axes.consequence;
  return [
    `calibrated: ${formatWidthedConfidence(cal)}`,
    `asserted: ${formatWidthedConfidence(asc)}`,
    `consequence: stratum=${cons.stratum} ASCE=${cons.derivation?.asce7RiskCategory ?? "?"}`,
  ].join(" · ");
}
