/**
 * Re-export canonical read-contract types from npm + map envelope helpers.
 */

export {
  createReadContract,
  createThreeAxisConfidence,
  createWidthedConfidence,
  createConsequenceAxis,
  isWidthedConfidence,
  READ_CONTRACT_SCHEMA,
  WIDTHED_CONFIDENCE_SCHEMA,
} from "@hauska/atom-contract/read-contract";

export {
  isReadContract,
  isLegacyScalarConfidence,
  extractEnvelopeReadContract,
  isRenderableEnvelope,
  envelopeIntervalWidth,
  saturationFromIntervalWidth,
  envelopeSaturation,
  formatWidthedConfidence,
  formatReadContractSummary,
} from "./envelope.js";
