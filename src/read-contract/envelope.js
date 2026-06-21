/**
 * Map-agent V4 envelope helpers — consumes @hauska/atom-contract/read-contract.
 */

import {
  isWidthedConfidence,
  READ_CONTRACT_SCHEMA,
} from "@hauska/atom-contract/read-contract";

export function isReadContract(value) {
  return READ_CONTRACT_SCHEMA.safeParse(value).success;
}

/** Legacy EngineEnvelope confidence — not renderable under V4. */
export function isLegacyScalarConfidence(value) {
  if (value == null) return false;
  if (typeof value === "number") return true;
  if (typeof value !== "object") return false;
  if (isWidthedConfidence(value) || isReadContract(value)) return false;
  return "value" in value && typeof value.value === "number" && !("intervalWidth" in value);
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
